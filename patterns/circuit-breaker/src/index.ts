import type { PatternSimulator, SimulationEmitter, AggregateMetrics } from "@design-patterns/core";
import { SimulationRunner, SimulationClock } from "@design-patterns/core";
import { BackendNode } from "./nodes/backend.js";
import { CircuitBreakerNode } from "./nodes/circuit-breaker.js";

export const name = "circuit-breaker";
export const description =
  "Failure isolation via Closed → Open → Half-Open state machine";

export function createSimulator(): PatternSimulator {
  return {
    async run(scenario, emitter) {
      const seed = scenario.seed ?? Date.now();
      const realTime = scenario.realTime ?? false;
      const clock = new SimulationClock();

      const backend = new BackendNode(
        { name: "backend", role: "service", latencyMs: 30 },
        seed + 1, clock, realTime,
      );
      const breaker = new CircuitBreakerNode(
        { name: "breaker", failureThreshold: 5, cooldownMs: 3000, halfOpenMaxProbes: 1, backend },
        seed + 2, clock, realTime,
      );

      backend.setFailureRate(scenario.failureInjection?.nodeFailures?.["backend"] ?? 0);

      return SimulationRunner.run({
        scenario,
        emitter,
        clock,
        nodes: [breaker, backend],
        async processRequest(request, ctx) {
          ctx.emitter.emit({
            type: "request_flow", from: "client", to: "breaker",
            requestId: request.id,
          });
          const result = await breaker.run(request, ctx.emitter);
          return {
            result,
            path: result.success ? ["client", "breaker", "backend"] : ["client", "breaker"],
          };
        },
        emitPatternMetrics(metrics: AggregateMetrics, em: SimulationEmitter) {
          if (metrics.totalRequests > 0) {
            em.emit({ type: "metric", name: "fast_fail_ratio", value: metrics.errorCount / metrics.totalRequests, unit: "ratio", node: "breaker" });
          }
        },
      });
    },
  };
}
