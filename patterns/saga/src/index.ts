import type { PatternSimulator } from "@system-design-patterns/core";
import { SimulationRunner, SimulationClock } from "@system-design-patterns/core";
import { OrderService, PaymentService, InventoryService, ShippingService } from "./nodes/saga-service.js";
import { SagaOrchestrator } from "./nodes/orchestrator.js";

export const name = "saga";
export const description =
  "Distributed transactions with compensating actions for rollback";

export function createSimulator(): PatternSimulator {
  return {
    async run(scenario, emitter) {
      const seed = scenario.seed ?? Date.now();
      const realTime = scenario.realTime ?? false;
      const clock = new SimulationClock();

      const order = new OrderService({ name: "order", role: "service", latencyMs: 200 }, seed + 1, clock, realTime);
      const payment = new PaymentService({ name: "payment", role: "service", latencyMs: 300 }, seed + 2, clock, realTime);
      const inventory = new InventoryService({ name: "inventory", role: "service", latencyMs: 250 }, seed + 3, clock, realTime);
      const shipping = new ShippingService({ name: "shipping", role: "service", latencyMs: 200 }, seed + 4, clock, realTime);

      const failures = scenario.failureInjection?.nodeFailures ?? {};
      if (failures["order"] !== undefined) order.setFailureRate(failures["order"]);
      if (failures["payment"] !== undefined) payment.setFailureRate(failures["payment"]);
      if (failures["inventory"] !== undefined) inventory.setFailureRate(failures["inventory"]);
      if (failures["shipping"] !== undefined) shipping.setFailureRate(failures["shipping"]);

      const orchestrator = new SagaOrchestrator(
        { name: "orchestrator", steps: [
          { name: "order", service: order },
          { name: "payment", service: payment },
          { name: "inventory", service: inventory },
          { name: "shipping", service: shipping },
        ]},
        seed + 5, clock, realTime,
      );

      return SimulationRunner.run({
        scenario, emitter, clock,
        nodes: [orchestrator, order, payment, inventory, shipping],
        async processRequest(request, ctx) {
          ctx.emitter.emit({ type: "request_flow", from: "client", to: "orchestrator", requestId: request.id });
          const result = await orchestrator.run(request, ctx.emitter);
          return {
            result,
            path: result.success ? ["orchestrator", "order", "payment", "inventory", "shipping"] : ["orchestrator"],
          };
        },
        emitPatternMetrics(_metrics, em) {
          const total = orchestrator.getSagaCompleted() + orchestrator.getSagaRolledBack();
          if (total > 0) {
            em.emit({ type: "metric", name: "completion_rate", value: orchestrator.getSagaCompleted() / total, unit: "ratio", node: "orchestrator" });
            em.emit({ type: "metric", name: "rollback_rate", value: orchestrator.getSagaRolledBack() / total, unit: "ratio", node: "orchestrator" });
          }
          if (orchestrator.getSagaRolledBack() > 0) {
            em.emit({ type: "metric", name: "avg_compensation_time_ms", value: orchestrator.getAvgCompensationMs(), unit: "ms", node: "orchestrator" });
          }
        },
      });
    },
  };
}
