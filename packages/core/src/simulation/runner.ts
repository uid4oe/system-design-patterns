import type { SimulationEmitter, AggregateMetrics } from "../stream/types.js";
import type { ScenarioConfig, RequestResult, SimulationResult } from "./types.js";
import type { BaseNode } from "../node/base-node.js";
import type { NodeResult, SimulationRequest } from "../node/types.js";
import { SeededRandom } from "./random.js";
import { SimulationClock } from "./clock.js";
import { MetricCollector } from "../eval/metrics.js";

export interface SimulationContext {
  seed: number;
  realTime: boolean;
  random: SeededRandom;
  clock: SimulationClock;
  collector: MetricCollector;
  emitter: SimulationEmitter;
  scenario: ScenarioConfig;
}

/**
 * Handles simulation boilerplate: setup, request pacing, result recording,
 * metric snapshots, and finalization. Patterns only define node creation
 * and per-request processing logic.
 */
export class SimulationRunner {
  /**
   * Run a simulation with the standard lifecycle:
   * 1. Create context (seed, clock, collector, random)
   * 2. Call setup() to create nodes
   * 3. Emit node_start for all nodes
   * 4. Loop requests with pacing, calling processRequest() for each
   * 5. Record metrics + emit snapshot per request
   * 6. Emit node_end + done
   */
  static async run(params: {
    scenario: ScenarioConfig;
    emitter: SimulationEmitter;
    nodes: BaseNode[];
    /** Pass the same clock used by nodes to keep time synchronized. */
    clock?: SimulationClock;
    processRequest: (
      request: SimulationRequest,
      ctx: SimulationContext,
    ) => Promise<{ result: NodeResult; path: string[] }>;
    emitPatternMetrics?: (
      metrics: AggregateMetrics,
      emitter: SimulationEmitter,
    ) => void;
  }): Promise<{ result: SimulationResult; metrics: AggregateMetrics }> {
    const { scenario, emitter, nodes, processRequest, emitPatternMetrics } = params;

    const seed = scenario.seed ?? Date.now();
    const realTime = scenario.realTime ?? false;
    const random = new SeededRandom(seed);
    const clock = params.clock ?? new SimulationClock();
    const collector = new MetricCollector();
    const requestResults: RequestResult[] = [];

    const ctx: SimulationContext = { seed, realTime, random, clock, collector, emitter, scenario };

    // Emit node_start for all nodes
    for (const node of nodes) {
      node.emitStart(emitter);
    }

    collector.start(clock.now());
    const startTime = clock.now();
    const intervalMs = 1000 / scenario.requestsPerSecond;

    for (let i = 0; i < scenario.requestCount; i++) {
      const requestId = `req-${i + 1}`;
      const request: SimulationRequest = {
        id: requestId,
        payload: `request-${i + 1}`,
        metadata: { index: i },
      };

      // Pace requests
      if (i > 0) {
        const jitter = random.between(0.8, 1.2);
        await clock.delay(Math.round(intervalMs * jitter), realTime);
      }

      // Process request (pattern-specific)
      let result: NodeResult;
      let path: string[];
      try {
        const response = await processRequest(request, ctx);
        result = response.result;
        path = response.path;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        emitter.emit({ type: "error", node: "system", message, recoverable: false });
        result = { output: "error", durationMs: 0, success: false, metrics: { requestsHandled: 0, errorsCount: 1, avgLatencyMs: 0 } };
        path = [];
      }

      // Record metrics
      collector.recordLatency(result.durationMs);
      if (result.success) {
        collector.recordSuccess();
      } else {
        collector.recordError();
      }

      collector.emitSnapshot(emitter, clock.now());

      requestResults.push({
        requestId,
        success: result.success,
        latencyMs: result.durationMs,
        path,
        error: result.success ? undefined : result.output,
      });
    }

    collector.stop(clock.now());
    const totalDurationMs = clock.now() - startTime;
    const metrics = collector.getAggregateMetrics();

    // Emit error_rate
    emitter.emit({
      type: "metric",
      name: "error_rate",
      value: metrics.totalRequests > 0 ? metrics.errorCount / metrics.totalRequests : 0,
      unit: "ratio",
    });

    // Pattern-specific metrics
    emitPatternMetrics?.(metrics, emitter);

    // Emit node_end for all nodes
    for (const node of nodes) {
      node.emitEnd(emitter, totalDurationMs);
    }

    emitter.emit({
      type: "done",
      totalDurationMs,
      aggregateMetrics: metrics,
    });

    return { result: { totalDurationMs, requestResults }, metrics };
  }
}
