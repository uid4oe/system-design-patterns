import { describe, it, expect } from "vitest";
import {
  scoreCriteria,
  CollectingEmitter,
  runEval,
} from "../eval/datasets.js";
import type { PatternSimulator } from "../simulation/types.js";
import type { EvalDataset } from "../eval/datasets.js";

describe("scoreCriteria", () => {
  it("passes when actual < threshold for lt comparator", () => {
    const result = scoreCriteria(5, {
      name: "latency",
      threshold: 10,
      comparator: "lt",
      weight: 1,
    });
    expect(result.passed).toBe(true);
    expect(result.actual).toBe(5);
  });

  it("fails when actual >= threshold for lt comparator", () => {
    const result = scoreCriteria(15, {
      name: "latency",
      threshold: 10,
      comparator: "lt",
      weight: 1,
    });
    expect(result.passed).toBe(false);
  });

  it("passes when actual > threshold for gt comparator", () => {
    const result = scoreCriteria(20, {
      name: "throughput",
      threshold: 10,
      comparator: "gt",
      weight: 1,
    });
    expect(result.passed).toBe(true);
  });

  it("passes when actual equals threshold for eq comparator", () => {
    const result = scoreCriteria(1.0, {
      name: "rate",
      threshold: 1.0,
      comparator: "eq",
      weight: 1,
    });
    expect(result.passed).toBe(true);
  });

  it("fails when actual differs from threshold for eq comparator", () => {
    const result = scoreCriteria(0.5, {
      name: "rate",
      threshold: 1.0,
      comparator: "eq",
      weight: 1,
    });
    expect(result.passed).toBe(false);
  });
});

describe("CollectingEmitter", () => {
  it("stores all emitted events", () => {
    const emitter = new CollectingEmitter();
    emitter.emit({ type: "node_start", node: "a", role: "test" });
    emitter.emit({ type: "processing", node: "a", requestId: "r1", detail: "working" });

    expect(emitter.events).toHaveLength(2);
  });

  it("retrieves metric values", () => {
    const emitter = new CollectingEmitter();
    emitter.emit({ type: "metric", name: "error_rate", value: 0.05, unit: "ratio" });
    emitter.emit({ type: "metric", name: "error_rate", value: 0.1, unit: "ratio" });

    // Returns the last emitted value
    expect(emitter.getMetricValue("error_rate")).toBe(0.1);
  });

  it("retrieves aggregate metrics from done event", () => {
    const emitter = new CollectingEmitter();
    emitter.emit({
      type: "done",
      totalDurationMs: 1000,
      aggregateMetrics: {
        totalRequests: 50,
        successCount: 45,
        errorCount: 5,
        p50LatencyMs: 20,
        p99LatencyMs: 100,
        throughputRps: 50,
      },
    });

    const metrics = emitter.getAggregateMetrics();
    expect(metrics?.totalRequests).toBe(50);
    expect(metrics?.errorCount).toBe(5);
  });

  it("returns undefined when metric not found", () => {
    const emitter = new CollectingEmitter();
    expect(emitter.getMetricValue("nonexistent")).toBeUndefined();
    expect(emitter.getAggregateMetrics()).toBeUndefined();
  });
});

describe("runEval", () => {
  it("runs scenarios and scores against criteria", async () => {
    const mockSimulator: PatternSimulator = {
      async run(_scenario, emitter) {
        emitter.emit({ type: "metric", name: "error_rate", value: 0.02, unit: "ratio" });
        const metrics = {
          totalRequests: 100,
          successCount: 98,
          errorCount: 2,
          p50LatencyMs: 20,
          p99LatencyMs: 80,
          throughputRps: 100,
        };
        emitter.emit({ type: "done", totalDurationMs: 1000, aggregateMetrics: metrics });
        return { result: { totalDurationMs: 1000, requestResults: [] }, metrics };
      },
    };

    const dataset: EvalDataset = {
      name: "test-eval",
      scenarios: [
        {
          name: "basic",
          config: { requestCount: 100, requestsPerSecond: 10 },
          criteria: [
            { name: "error_rate", threshold: 0.05, comparator: "lt", weight: 1 },
          ],
        },
      ],
    };

    const result = await runEval({ simulator: mockSimulator, dataset });

    expect(result.datasetName).toBe("test-eval");
    expect(result.overallPassed).toBe(true);
    expect(result.scenarioScores).toHaveLength(1);
    expect(result.scenarioScores[0]?.passed).toBe(true);
  });

  it("fails scenario when criteria not met", async () => {
    const mockSimulator: PatternSimulator = {
      async run(_scenario, emitter) {
        emitter.emit({ type: "metric", name: "error_rate", value: 0.2, unit: "ratio" });
        const metrics = {
          totalRequests: 100, successCount: 80, errorCount: 20,
          p50LatencyMs: 50, p99LatencyMs: 200, throughputRps: 50,
        };
        emitter.emit({ type: "done", totalDurationMs: 2000, aggregateMetrics: metrics });
        return { result: { totalDurationMs: 2000, requestResults: [] }, metrics };
      },
    };

    const dataset: EvalDataset = {
      name: "fail-eval",
      scenarios: [
        {
          name: "should-fail",
          config: { requestCount: 100, requestsPerSecond: 10 },
          criteria: [
            { name: "error_rate", threshold: 0.05, comparator: "lt", weight: 1 },
          ],
        },
      ],
    };

    const result = await runEval({ simulator: mockSimulator, dataset });

    expect(result.overallPassed).toBe(false);
    expect(result.scenarioScores[0]?.passed).toBe(false);
  });

  it("resolves well-known aggregate metrics", async () => {
    const mockSimulator: PatternSimulator = {
      async run(_scenario, emitter) {
        const metrics = {
          totalRequests: 100, successCount: 90, errorCount: 10,
          p50LatencyMs: 25, p99LatencyMs: 95, throughputRps: 80,
        };
        emitter.emit({ type: "done", totalDurationMs: 1000, aggregateMetrics: metrics });
        return { result: { totalDurationMs: 1000, requestResults: [] }, metrics };
      },
    };

    const dataset: EvalDataset = {
      name: "aggregate-test",
      scenarios: [
        {
          name: "check-p99",
          config: { requestCount: 100, requestsPerSecond: 10 },
          criteria: [
            { name: "p99_latency_ms", threshold: 100, comparator: "lt", weight: 1 },
          ],
        },
      ],
    };

    const result = await runEval({ simulator: mockSimulator, dataset });
    expect(result.overallPassed).toBe(true);
  });
});
