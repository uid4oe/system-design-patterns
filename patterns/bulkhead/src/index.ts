import type { PatternSimulator } from "@design-patterns/core";
import { SimulationRunner, SimulationClock } from "@design-patterns/core";
import { ServiceNode } from "./nodes/service.js";
import { PoolNode } from "./nodes/pool.js";
import { GatewayNode } from "./nodes/gateway.js";

export const name = "bulkhead";
export const description =
  "Isolated resource pools preventing cascading failures across services";

export function createSimulator(): PatternSimulator {
  return {
    async run(scenario, emitter) {
      const seed = scenario.seed ?? Date.now();
      const realTime = scenario.realTime ?? false;
      const clock = new SimulationClock();

      const serviceA = new ServiceNode({ name: "service-a", role: "backend-service", latencyMs: 150 }, seed + 1, clock, realTime);
      const serviceB = new ServiceNode({ name: "service-b", role: "backend-service", latencyMs: 100 }, seed + 2, clock, realTime);
      const serviceC = new ServiceNode({ name: "service-c", role: "backend-service", latencyMs: 80 }, seed + 3, clock, realTime);

      const failures = scenario.failureInjection?.nodeFailures ?? {};
      if (failures["service-a"] !== undefined) serviceA.setFailureRate(failures["service-a"]);
      if (failures["service-b"] !== undefined) serviceB.setFailureRate(failures["service-b"]);
      if (failures["service-c"] !== undefined) serviceC.setFailureRate(failures["service-c"]);

      const poolA = new PoolNode({ name: "pool-a", maxConcurrency: 10, service: serviceA }, seed + 4, clock, realTime);
      const poolB = new PoolNode({ name: "pool-b", maxConcurrency: 10, service: serviceB }, seed + 5, clock, realTime);
      const poolC = new PoolNode({ name: "pool-c", maxConcurrency: 5, service: serviceC }, seed + 6, clock, realTime);

      const pools = new Map([["service-a", poolA], ["service-b", poolB], ["service-c", poolC]]);
      const gateway = new GatewayNode({ name: "gateway", pools }, seed + 7, clock, realTime);
      const services = ["service-a", "service-a", "service-a", "service-b", "service-c"];

      return SimulationRunner.run({
        scenario, emitter, clock,
        nodes: [gateway, poolA, poolB, poolC, serviceA, serviceB, serviceC],
        async processRequest(request, ctx) {
          const targetService = services[(request.metadata?.["index"] as number ?? 0) % services.length] ?? "service-a";
          const req = { ...request, metadata: { ...request.metadata, service: targetService } };
          ctx.emitter.emit({ type: "request_flow", from: "client", to: "gateway", requestId: request.id, label: targetService });
          const result = await gateway.run(req, ctx.emitter);
          return {
            result,
            path: ["gateway", `pool-${targetService.split("-")[1]}`, targetService],
          };
        },
        emitPatternMetrics(_metrics, em) {
          em.emit({ type: "metric", name: "pool-a_accepted", value: poolA.getTotalAccepted(), unit: "count", node: "pool-a" });
          em.emit({ type: "metric", name: "pool-b_accepted", value: poolB.getTotalAccepted(), unit: "count", node: "pool-b" });
          em.emit({ type: "metric", name: "pool-c_accepted", value: poolC.getTotalAccepted(), unit: "count", node: "pool-c" });
          em.emit({ type: "metric", name: "pool-a_rejected", value: poolA.getTotalRejected(), unit: "count", node: "pool-a" });
          em.emit({ type: "metric", name: "pool-b_rejected", value: poolB.getTotalRejected(), unit: "count", node: "pool-b" });
          em.emit({ type: "metric", name: "pool-c_rejected", value: poolC.getTotalRejected(), unit: "count", node: "pool-c" });
        },
      });
    },
  };
}
