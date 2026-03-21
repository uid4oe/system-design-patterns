import { readFileSync } from "node:fs";
import type { AggregateMetrics, SimulationEmitter } from "../stream/types.js";
import type { PatternSimulator, ScenarioConfig } from "../simulation/types.js";

export interface EvalCriteria {
  name: string;
  threshold: number;
  comparator: "lt" | "gt" | "eq";
  weight: number;
}

export interface EvalScenario {
  name: string;
  config: ScenarioConfig;
  criteria: EvalCriteria[];
}

export interface EvalDataset {
  name: string;
  scenarios: EvalScenario[];
}

export interface ScenarioScore {
  scenarioName: string;
  passed: boolean;
  criteriaResults: CriteriaResult[];
}

export interface CriteriaResult {
  name: string;
  passed: boolean;
  actual: number;
  threshold: number;
  comparator: "lt" | "gt" | "eq";
}

export interface EvalResult {
  datasetName: string;
  scenarioScores: ScenarioScore[];
  overallPassed: boolean;
  overallScore: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidCriteria(c: unknown): c is EvalCriteria {
  if (!isRecord(c)) return false;
  return (
    typeof c["name"] === "string" &&
    typeof c["threshold"] === "number" &&
    typeof c["comparator"] === "string" &&
    ["lt", "gt", "eq"].includes(c["comparator"] as string) &&
    typeof c["weight"] === "number"
  );
}

/** Load and validate an eval dataset from a JSON file. */
export function loadDataset(path: string): EvalDataset {
  const raw = readFileSync(path, "utf-8");
  const data: unknown = JSON.parse(raw);

  if (!isRecord(data) || typeof data["name"] !== "string" || !Array.isArray(data["scenarios"])) {
    throw new Error(`Invalid dataset at ${path}: missing name or scenarios`);
  }

  const scenarios: EvalScenario[] = [];
  for (const scenario of data["scenarios"] as unknown[]) {
    if (!isRecord(scenario)) {
      throw new Error(`Invalid scenario in dataset ${data["name"]}: not an object`);
    }
    if (typeof scenario["name"] !== "string" || !isRecord(scenario["config"]) || !Array.isArray(scenario["criteria"])) {
      throw new Error(
        `Invalid scenario "${String(scenario["name"] ?? "unknown")}" in dataset ${data["name"]}`,
      );
    }
    for (const criteria of scenario["criteria"] as unknown[]) {
      if (!isValidCriteria(criteria)) {
        throw new Error(
          `Invalid criteria in scenario "${scenario["name"]}" of dataset ${data["name"]}`,
        );
      }
    }
    scenarios.push(scenario as unknown as EvalScenario);
  }

  return { name: data["name"] as string, scenarios };
}

/** Score a metric value against a criterion. */
export function scoreCriteria(
  actual: number,
  criteria: EvalCriteria,
): CriteriaResult {
  let passed = false;
  switch (criteria.comparator) {
    case "lt":
      passed = actual < criteria.threshold;
      break;
    case "gt":
      passed = actual > criteria.threshold;
      break;
    case "eq":
      passed = Math.abs(actual - criteria.threshold) < 0.001;
      break;
  }
  return {
    name: criteria.name,
    passed,
    actual,
    threshold: criteria.threshold,
    comparator: criteria.comparator,
  };
}

/**
 * Collecting emitter that stores all events for post-run analysis.
 * Used by the eval runner to extract metrics from simulation output.
 */
export class CollectingEmitter implements SimulationEmitter {
  readonly events: import("../stream/types.js").SimulationEvent[] = [];

  emit(event: import("../stream/types.js").SimulationEvent): void {
    this.events.push(event);
  }

  /** Extract a named metric value from collected events. */
  getMetricValue(name: string): number | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const event = this.events[i];
      if (event !== undefined && event.type === "metric" && event.name === name) {
        return event.value;
      }
    }
    return undefined;
  }

  /** Get the aggregate metrics from the done event. */
  getAggregateMetrics(): AggregateMetrics | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const event = this.events[i];
      if (event !== undefined && event.type === "done") {
        return event.aggregateMetrics;
      }
    }
    return undefined;
  }
}

/** Well-known metric names that can be derived from aggregate metrics. */
const AGGREGATE_METRIC_MAP: Record<
  string,
  (m: AggregateMetrics) => number
> = {
  error_rate: (m) =>
    m.totalRequests > 0 ? m.errorCount / m.totalRequests : 0,
  success_rate: (m) =>
    m.totalRequests > 0 ? m.successCount / m.totalRequests : 0,
  p50_latency_ms: (m) => m.p50LatencyMs,
  p99_latency_ms: (m) => m.p99LatencyMs,
  throughput_rps: (m) => m.throughputRps,
  total_requests: (m) => m.totalRequests,
};

/** Resolve a metric value from collected events and aggregate metrics. */
function resolveMetric(
  name: string,
  collectorEmitter: CollectingEmitter,
): number {
  // First check explicit metric events
  const explicit = collectorEmitter.getMetricValue(name);
  if (explicit !== undefined) return explicit;

  // Then check well-known aggregate metric derivations
  const aggregate = collectorEmitter.getAggregateMetrics();
  if (aggregate) {
    const deriveFn = AGGREGATE_METRIC_MAP[name];
    if (deriveFn) return deriveFn(aggregate);
  }

  return 0;
}

/**
 * Run an eval suite: execute each scenario against the simulator,
 * collect metrics, and score against criteria.
 */
export async function runEval(params: {
  simulator: PatternSimulator;
  dataset: EvalDataset;
}): Promise<EvalResult> {
  const { simulator, dataset } = params;
  const scenarioScores: ScenarioScore[] = [];

  for (const scenario of dataset.scenarios) {
    const emitter = new CollectingEmitter();
    await simulator.run(scenario.config, emitter);

    const criteriaResults: CriteriaResult[] = scenario.criteria.map(
      (criteria) => {
        const actual = resolveMetric(criteria.name, emitter);
        return scoreCriteria(actual, criteria);
      },
    );

    scenarioScores.push({
      scenarioName: scenario.name,
      passed: criteriaResults.every((r) => r.passed),
      criteriaResults,
    });
  }

  const totalWeight = dataset.scenarios.reduce(
    (sum, s) => sum + s.criteria.reduce((w, c) => w + c.weight, 0),
    0,
  );
  const passedWeight = scenarioScores.reduce(
    (sum, s) =>
      sum +
      s.criteriaResults.reduce((w, r) => {
        const criteria = dataset.scenarios
          .find((sc) => sc.name === s.scenarioName)
          ?.criteria.find((c) => c.name === r.name);
        return w + (r.passed ? (criteria?.weight ?? 0) : 0);
      }, 0),
    0,
  );

  return {
    datasetName: dataset.name,
    scenarioScores,
    overallPassed: scenarioScores.every((s) => s.passed),
    overallScore: totalWeight > 0 ? passedWeight / totalWeight : 0,
  };
}
