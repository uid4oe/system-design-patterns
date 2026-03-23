import type { PatternSimulator } from "@system-design-patterns/core";
import { SimulationRunner, SimulationClock } from "@system-design-patterns/core";
import { BackendNode } from "./nodes/backend.js";
import { RateLimiterNode } from "./nodes/rate-limiter.js";

export const name = "rate-limiter";
export const description =
  "Token bucket rate limiting with burst handling and steady-state throughput";

export function createSimulator(): PatternSimulator {
  return {
    async run(scenario, emitter) {
      const seed = scenario.seed ?? Date.now();
      const realTime = scenario.realTime ?? false;
      const clock = new SimulationClock();

      const backend = new BackendNode(
        { name: "backend", role: "service", latencyMs: 50 },
        seed + 1, clock, realTime,
      );
      const limiter = new RateLimiterNode(
        { name: "limiter", maxTokens: 5, refillRate: 3, backend },
        seed + 2, clock, realTime,
      );

      if (scenario.failureInjection?.nodeFailures?.["backend"] !== undefined) {
        backend.setFailureRate(scenario.failureInjection.nodeFailures["backend"]);
      }

      return SimulationRunner.run({
        scenario, emitter, clock,
        concurrency: 3,
        nodes: [limiter, backend],
        async processRequest(request, ctx) {
          ctx.emitter.emit({ type: "request_flow", from: "client", to: "limiter", requestId: request.id });
          const result = await limiter.run(request, ctx.emitter);
          return {
            result,
            path: result.success ? ["limiter", "backend"] : ["limiter"],
          };
        },
        emitPatternMetrics(_metrics, em) {
          em.emit({ type: "metric", name: "total_accepted", value: limiter.getAccepted(), unit: "count", node: "limiter" });
          em.emit({ type: "metric", name: "total_rejected", value: limiter.getRejected(), unit: "count", node: "limiter" });
          em.emit({ type: "metric", name: "accept_ratio", value: limiter.getAccepted() / Math.max(1, limiter.getAccepted() + limiter.getRejected()), unit: "ratio", node: "limiter" });
        },
      });
    },
  };
}
