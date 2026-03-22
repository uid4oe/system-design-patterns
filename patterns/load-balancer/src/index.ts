import type { PatternSimulator } from "@design-patterns/core";
import { SimulationRunner, SimulationClock } from "@design-patterns/core";
import { LBBackendNode } from "./nodes/backend.js";
import { LoadBalancerNode } from "./nodes/load-balancer.js";

export const name = "load-balancer";
export const description =
  "Request distribution with round-robin, least-connections, and consistent hashing";

export function createSimulator(): PatternSimulator {
  return {
    async run(scenario, emitter) {
      const seed = scenario.seed ?? Date.now();
      const realTime = scenario.realTime ?? false;
      const clock = new SimulationClock();

      const backends = [
        new LBBackendNode({ name: "backend-1", role: "backend-instance", latencyMs: 100 }, seed + 1, clock, realTime),
        new LBBackendNode({ name: "backend-2", role: "backend-instance", latencyMs: 100 }, seed + 2, clock, realTime),
        new LBBackendNode({ name: "backend-3", role: "backend-instance", latencyMs: 100 }, seed + 3, clock, realTime),
        new LBBackendNode({ name: "backend-4", role: "backend-instance", latencyMs: 100 }, seed + 4, clock, realTime),
      ];

      const failures = scenario.failureInjection?.nodeFailures ?? {};
      for (const b of backends) {
        const rate = failures[b.name];
        if (rate !== undefined) b.setFailureRate(rate);
      }

      const latencyOverrides = scenario.failureInjection?.networkLatency ?? {};
      for (const b of backends) {
        const latency = latencyOverrides[b.name];
        if (latency !== undefined) b.setLatencyMs(latency);
      }

      const lb = new LoadBalancerNode(
        { name: "lb", algorithm: "round-robin", backends },
        seed + 5, clock, realTime,
      );

      return SimulationRunner.run({
        scenario, emitter, clock,
        nodes: [lb, ...backends],
        async processRequest(request, ctx) {
          ctx.emitter.emit({ type: "request_flow", from: "client", to: "lb", requestId: request.id });
          const result = await lb.run(request, ctx.emitter);
          return {
            result,
            path: ["lb", result.output.split("-by-")[1] ?? "unknown"],
          };
        },
        emitPatternMetrics(_metrics, em) {
          const counts = lb.getRequestCounts();
          const values = Array.from(counts.values());
          if (values.length > 0) {
            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
            em.emit({ type: "metric", name: "request_spread_stddev", value: Math.round(Math.sqrt(variance) * 100) / 100, unit: "requests", node: "lb" });
            for (const [name, count] of counts) {
              em.emit({ type: "metric", name: `${name}_requests`, value: count, unit: "count", node: name });
            }
          }
        },
      });
    },
  };
}
