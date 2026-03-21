import type {
  PatternSimulator,
  ScenarioConfig,
  SimulationEmitter,
  AggregateMetrics,
  RequestResult,
} from "@design-patterns/core";
import { MetricCollector, SeededRandom, SimulationClock } from "@design-patterns/core";
import {
  OrderService,
  PaymentService,
  InventoryService,
  ShippingService,
} from "./nodes/saga-service.js";
import { SagaOrchestrator } from "./nodes/orchestrator.js";

export const name = "saga";
export const description =
  "Distributed transactions with compensating actions for rollback";

export function createSimulator(): PatternSimulator {
  return {
    async run(
      scenario: ScenarioConfig,
      emitter: SimulationEmitter,
    ) {
      const seed = scenario.seed ?? Date.now();
      const realTime = scenario.realTime ?? false;
      const random = new SeededRandom(seed);
      const clock = new SimulationClock();
      const collector = new MetricCollector();
      const requestResults: RequestResult[] = [];

      // Create service nodes
      const order = new OrderService(
        { name: "order", role: "service", latencyMs: 80 },
        seed + 1, clock, realTime,
      );
      const payment = new PaymentService(
        { name: "payment", role: "service", latencyMs: 120 },
        seed + 2, clock, realTime,
      );
      const inventory = new InventoryService(
        { name: "inventory", role: "service", latencyMs: 100 },
        seed + 3, clock, realTime,
      );
      const shipping = new ShippingService(
        { name: "shipping", role: "service", latencyMs: 80 },
        seed + 4, clock, realTime,
      );

      // Apply failure injection
      const failures = scenario.failureInjection?.nodeFailures ?? {};
      if (failures["order"] !== undefined) order.setFailureRate(failures["order"]);
      if (failures["payment"] !== undefined) payment.setFailureRate(failures["payment"]);
      if (failures["inventory"] !== undefined) inventory.setFailureRate(failures["inventory"]);
      if (failures["shipping"] !== undefined) shipping.setFailureRate(failures["shipping"]);

      // Create orchestrator
      const orchestrator = new SagaOrchestrator(
        {
          name: "orchestrator",
          steps: [
            { name: "order", service: order },
            { name: "payment", service: payment },
            { name: "inventory", service: inventory },
            { name: "shipping", service: shipping },
          ],
        },
        seed + 5,
        clock,
        realTime,
      );

      // Emit node_start for all nodes
      orchestrator.emitStart(emitter);
      order.emitStart(emitter);
      payment.emitStart(emitter);
      inventory.emitStart(emitter);
      shipping.emitStart(emitter);

      collector.start();
      const startTime = Date.now();
      const intervalMs = 1000 / scenario.requestsPerSecond;

      for (let i = 0; i < scenario.requestCount; i++) {
        const requestId = `req-${i + 1}`;
        const request = {
          id: requestId,
          payload: `saga-${i + 1}`,
          metadata: { index: i },
        };

        if (i > 0) {
          const jitter = random.between(0.8, 1.2);
          await clock.delay(Math.round(intervalMs * jitter), realTime);
        }

        emitter.emit({
          type: "request_flow",
          from: "client",
          to: "orchestrator",
          requestId,
        });

        const result = await orchestrator.run(request, emitter);

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
            ? ["orchestrator", "order", "payment", "inventory", "shipping"]
            : ["orchestrator"],
          error: result.success ? undefined : result.output,
        });
      }

      collector.stop();
      const totalDurationMs = Date.now() - startTime;
      const metrics: AggregateMetrics = collector.getAggregateMetrics();

      // Emit saga-specific metrics
      const totalSagas = orchestrator.getSagaCompleted() + orchestrator.getSagaRolledBack();
      if (totalSagas > 0) {
        emitter.emit({
          type: "metric",
          name: "completion_rate",
          value: orchestrator.getSagaCompleted() / totalSagas,
          unit: "ratio",
          node: "orchestrator",
        });
        emitter.emit({
          type: "metric",
          name: "rollback_rate",
          value: orchestrator.getSagaRolledBack() / totalSagas,
          unit: "ratio",
          node: "orchestrator",
        });
      }
      if (orchestrator.getSagaRolledBack() > 0) {
        emitter.emit({
          type: "metric",
          name: "avg_compensation_time_ms",
          value: orchestrator.getAvgCompensationMs(),
          unit: "ms",
          node: "orchestrator",
        });
      }
      emitter.emit({
        type: "metric",
        name: "error_rate",
        value: metrics.totalRequests > 0 ? metrics.errorCount / metrics.totalRequests : 0,
        unit: "ratio",
      });

      // Emit node_end
      orchestrator.emitEnd(emitter, totalDurationMs);
      order.emitEnd(emitter, totalDurationMs);
      payment.emitEnd(emitter, totalDurationMs);
      inventory.emitEnd(emitter, totalDurationMs);
      shipping.emitEnd(emitter, totalDurationMs);

      emitter.emit({
        type: "done",
        totalDurationMs,
        aggregateMetrics: metrics,
      });

      return { result: { totalDurationMs, requestResults }, metrics };
    },
  };
}
