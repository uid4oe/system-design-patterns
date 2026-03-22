import type { PatternSimulator } from "@system-design-patterns/core";
import { SimulationRunner, SimulationClock } from "@system-design-patterns/core";
import { PublisherNode } from "./nodes/publisher.js";
import { SubscriberNode } from "./nodes/subscriber.js";
import { BrokerNode } from "./nodes/broker.js";

export const name = "pub-sub";
export const description =
  "Event-driven fan-out with topic routing and consumer groups";

export function createSimulator(): PatternSimulator {
  return {
    async run(scenario, emitter) {
      const seed = scenario.seed ?? Date.now();
      const realTime = scenario.realTime ?? false;
      const clock = new SimulationClock();

      const publisher = new PublisherNode({ name: "publisher", role: "publisher", latencyMs: 30 }, "orders", seed + 1, clock, realTime);
      const broker = new BrokerNode({ name: "broker" }, seed + 2, clock, realTime);
      const sub1 = new SubscriberNode({ name: "sub-1", role: "subscriber", latencyMs: 80 }, seed + 3, clock, realTime);
      const sub2 = new SubscriberNode({ name: "sub-2", role: "subscriber", latencyMs: 100 }, seed + 4, clock, realTime);
      const sub3 = new SubscriberNode({ name: "sub-3", role: "subscriber", latencyMs: 60 }, seed + 5, clock, realTime);

      broker.subscribe("orders", sub1);
      broker.subscribe("orders", sub2);
      broker.subscribe("orders", sub3);

      const failures = scenario.failureInjection?.nodeFailures ?? {};
      if (failures["broker"] !== undefined) broker.setFailureRate(failures["broker"]);
      if (failures["sub-1"] !== undefined) sub1.setFailureRate(failures["sub-1"]);
      if (failures["sub-2"] !== undefined) sub2.setFailureRate(failures["sub-2"]);
      if (failures["sub-3"] !== undefined) sub3.setFailureRate(failures["sub-3"]);

      return SimulationRunner.run({
        scenario, emitter, clock,
        nodes: [publisher, broker, sub1, sub2, sub3],
        async processRequest(request, ctx) {
          const req = { ...request, payload: `order-event-${request.id}`, metadata: { topic: "orders" } };
          ctx.emitter.emit({ type: "request_flow", from: "publisher", to: "broker", requestId: request.id, label: "orders" });
          const pubResult = await publisher.run(req, ctx.emitter);
          const brokerResult = await broker.run(req, ctx.emitter);
          return {
            result: { ...brokerResult, durationMs: pubResult.durationMs + brokerResult.durationMs },
            path: ["publisher", "broker", "sub-1", "sub-2", "sub-3"],
          };
        },
        emitPatternMetrics(_metrics, em) {
          em.emit({ type: "metric", name: "total_deliveries", value: broker.getTotalDeliveries(), unit: "count" });
          em.emit({ type: "metric", name: "sub-1_messages", value: sub1.getMessagesReceived(), unit: "count", node: "sub-1" });
          em.emit({ type: "metric", name: "sub-2_messages", value: sub2.getMessagesReceived(), unit: "count", node: "sub-2" });
          em.emit({ type: "metric", name: "sub-3_messages", value: sub3.getMessagesReceived(), unit: "count", node: "sub-3" });
        },
      });
    },
  };
}
