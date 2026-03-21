import type {
  PatternSimulator,
  ScenarioConfig,
  SimulationEmitter,
  AggregateMetrics,
  RequestResult,
} from "@design-patterns/core";
import { MetricCollector, SeededRandom, SimulationClock } from "@design-patterns/core";
import { ClientNode } from "./nodes/client.js";
import { BackendNode } from "./nodes/backend.js";
import { CircuitBreakerNode } from "./nodes/circuit-breaker.js";

export const name = "circuit-breaker";
export const description =
  "Failure isolation via Closed → Open → Half-Open state machine";

export function createSimulator(): PatternSimulator {
  return {
    async run(
      scenario: ScenarioConfig,
      emitter: SimulationEmitter,
    ) {
      const seed = scenario.seed ?? Date.now();
      const random = new SeededRandom(seed);
      const clock = new SimulationClock();
      const collector = new MetricCollector();
      const requestResults: RequestResult[] = [];

      // Create nodes
      const backend = new BackendNode(
        { name: "backend", role: "service", latencyMs: 30 },
        seed + 1,
        clock,
      );
      const breaker = new CircuitBreakerNode(
        {
          name: "breaker",
          failureThreshold: 5,
          cooldownMs: 3000,
          halfOpenMaxProbes: 1,
          backend,
        },
        seed + 2,
        clock,
      );
      const client = new ClientNode(
        { name: "client", role: "request-generator", latencyMs: 0 },
        seed + 3,
        clock,
      );

      // Apply failure injection
      const backendFailureRate =
        scenario.failureInjection?.nodeFailures?.["backend"] ?? 0;
      backend.setFailureRate(backendFailureRate);

      // Emit node_start for all nodes
      client.emitStart(emitter);
      breaker.emitStart(emitter);
      backend.emitStart(emitter);

      collector.start();
      const startTime = Date.now();

      // Run simulation
      const intervalMs = 1000 / scenario.requestsPerSecond;

      for (let i = 0; i < scenario.requestCount; i++) {
        const requestId = `req-${i + 1}`;
        const request = {
          id: requestId,
          payload: `request-${i + 1}`,
          metadata: { index: i },
        };

        // Advance clock by interval between requests
        if (i > 0) {
          const jitter = random.between(0.8, 1.2);
          await clock.delay(Math.round(intervalMs * jitter));
        }

        // Client → Breaker
        emitter.emit({
          type: "request_flow",
          from: "client",
          to: "breaker",
          requestId,
        });

        const result = await breaker.run(request, emitter);

        // Track metrics
        collector.recordLatency(result.durationMs);
        if (result.success) {
          collector.recordSuccess();
        } else {
          collector.recordError();
        }

        requestResults.push({
          requestId,
          success: result.success,
          latencyMs: result.durationMs,
          path: result.success
            ? ["client", "breaker", "backend"]
            : ["client", "breaker"],
          error: result.success ? undefined : result.output,
        });
      }

      collector.stop();
      const totalDurationMs = Date.now() - startTime;
      const metrics: AggregateMetrics = collector.getAggregateMetrics();

      // Emit fast_fail_ratio metric
      if (metrics.totalRequests > 0) {
        const fastFailRatio = metrics.errorCount / metrics.totalRequests;
        emitter.emit({
          type: "metric",
          name: "fast_fail_ratio",
          value: fastFailRatio,
          unit: "ratio",
          node: "breaker",
        });
        emitter.emit({
          type: "metric",
          name: "error_rate",
          value: fastFailRatio,
          unit: "ratio",
        });
      }

      // Emit node_end for all nodes
      client.emitEnd(emitter, totalDurationMs);
      breaker.emitEnd(emitter, totalDurationMs);
      backend.emitEnd(emitter, totalDurationMs);

      emitter.emit({
        type: "done",
        totalDurationMs,
        aggregateMetrics: metrics,
      });

      return { result: { totalDurationMs, requestResults }, metrics };
    },
  };
}
