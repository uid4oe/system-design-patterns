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
 *
 * Supports both sequential (default) and parallel batch execution via
 * the `concurrency` parameter.
 */
export class SimulationRunner {
  /**
   * Run a simulation with the standard lifecycle:
   * 1. Create context (seed, clock, collector, random)
   * 2. Emit node_start for all nodes
   * 3. Loop requests with pacing, calling processRequest() for each
   *    - If concurrency > 1, fire requests in parallel batches
   * 4. Record metrics + emit snapshot per batch
   * 5. Emit node_end + done
   */
  static async run(params: {
    scenario: ScenarioConfig;
    emitter: SimulationEmitter;
    nodes: BaseNode[];
    /** Pass the same clock used by nodes to keep time synchronized. */
    clock?: SimulationClock;
    /** Number of requests to fire concurrently per batch. Default 1 (sequential). */
    concurrency?: number;
    processRequest: (
      request: SimulationRequest,
      ctx: SimulationContext,
    ) => Promise<{ result: NodeResult; path: string[] }>;
    emitPatternMetrics?: (
      metrics: AggregateMetrics,
      emitter: SimulationEmitter,
    ) => void;
  }): Promise<{ result: SimulationResult; metrics: AggregateMetrics }> {
    const {
      scenario, emitter, nodes, processRequest, emitPatternMetrics,
      concurrency = 1,
    } = params;

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

    if (concurrency <= 1) {
      // Sequential execution (original behavior)
      for (let i = 0; i < scenario.requestCount; i++) {
        const request = makeRequest(i);

        if (i > 0) {
          const jitter = random.between(0.8, 1.2);
          await clock.delay(Math.round(intervalMs * jitter), realTime);
        }

        const { result, path } = await processOne(request, ctx, processRequest, emitter);
        recordResult(collector, requestResults, request.id, result, path);
        collector.emitSnapshot(emitter, clock.now());
      }
    } else {
      // Parallel batch execution
      let reqIndex = 0;
      let batchNum = 0;

      while (reqIndex < scenario.requestCount) {
        const batchSize = Math.min(concurrency, scenario.requestCount - reqIndex);
        const batch: SimulationRequest[] = [];

        for (let j = 0; j < batchSize; j++) {
          batch.push(makeRequest(reqIndex + j));
        }

        // Pace between batches (not before first)
        if (batchNum > 0) {
          const jitter = random.between(0.8, 1.2);
          await clock.delay(Math.round(intervalMs * batchSize * jitter), realTime);
        }

        // Fire batch concurrently
        const batchResults = await Promise.all(
          batch.map((request) => processOne(request, ctx, processRequest, emitter)),
        );

        for (let j = 0; j < batchResults.length; j++) {
          const br = batchResults[j];
          const req = batch[j];
          if (br && req) {
            recordResult(collector, requestResults, req.id, br.result, br.path);
          }
        }

        collector.emitSnapshot(emitter, clock.now());
        reqIndex += batchSize;
        batchNum++;
      }
    }

    collector.stop(clock.now());
    const totalDurationMs = clock.now() - startTime;
    const metrics = collector.getAggregateMetrics();

    emitter.emit({
      type: "metric",
      name: "error_rate",
      value: metrics.totalRequests > 0 ? metrics.errorCount / metrics.totalRequests : 0,
      unit: "ratio",
    });

    emitPatternMetrics?.(metrics, emitter);

    for (const node of nodes) {
      node.emitEnd(emitter, totalDurationMs);
    }

    emitter.emit({ type: "done", totalDurationMs, aggregateMetrics: metrics });
    return { result: { totalDurationMs, requestResults }, metrics };
  }
}

function makeRequest(index: number): SimulationRequest {
  return {
    id: `req-${index + 1}`,
    payload: `request-${index + 1}`,
    metadata: { index },
  };
}

async function processOne(
  request: SimulationRequest,
  ctx: SimulationContext,
  processRequest: (req: SimulationRequest, ctx: SimulationContext) => Promise<{ result: NodeResult; path: string[] }>,
  emitter: SimulationEmitter,
): Promise<{ result: NodeResult; path: string[] }> {
  try {
    return await processRequest(request, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitter.emit({ type: "error", node: "system", message, recoverable: false });
    return {
      result: { output: "error", durationMs: 0, success: false, metrics: { requestsHandled: 0, errorsCount: 1, avgLatencyMs: 0 } },
      path: [],
    };
  }
}

function recordResult(
  collector: MetricCollector,
  results: RequestResult[],
  requestId: string,
  result: NodeResult,
  path: string[],
): void {
  collector.recordLatency(result.durationMs);
  if (result.success) {
    collector.recordSuccess();
  } else {
    collector.recordError();
  }
  results.push({
    requestId,
    success: result.success,
    latencyMs: result.durationMs,
    path,
    error: result.success ? undefined : result.output,
  });
}
