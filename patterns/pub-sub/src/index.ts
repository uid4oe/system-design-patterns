import type {
  PatternSimulator,
  ScenarioConfig,
  SimulationEmitter,
  AggregateMetrics,
  RequestResult,
} from "@design-patterns/core";
import { MetricCollector, SeededRandom, SimulationClock } from "@design-patterns/core";
import { PublisherNode } from "./nodes/publisher.js";
import { SubscriberNode } from "./nodes/subscriber.js";
import { BrokerNode } from "./nodes/broker.js";

export const name = "pub-sub";
export const description =
  "Event-driven fan-out with topic routing and consumer groups";

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

      // Create nodes
      const publisher = new PublisherNode(
        { name: "publisher", role: "publisher", latencyMs: 30 },
        "orders",
        seed + 1, clock, realTime,
      );

      const broker = new BrokerNode(
        { name: "broker" },
        seed + 2, clock, realTime,
      );

      const sub1 = new SubscriberNode(
        { name: "sub-1", role: "subscriber", latencyMs: 80 },
        seed + 3, clock, realTime,
      );
      const sub2 = new SubscriberNode(
        { name: "sub-2", role: "subscriber", latencyMs: 100 },
        seed + 4, clock, realTime,
      );
      const sub3 = new SubscriberNode(
        { name: "sub-3", role: "subscriber", latencyMs: 60 },
        seed + 5, clock, realTime,
      );

      // Wire subscriptions — all 3 subscribe to "orders" topic
      broker.subscribe("orders", sub1);
      broker.subscribe("orders", sub2);
      broker.subscribe("orders", sub3);

      // Apply failure injection
      const failures = scenario.failureInjection?.nodeFailures ?? {};
      if (failures["broker"] !== undefined) broker.setFailureRate(failures["broker"]);
      if (failures["sub-1"] !== undefined) sub1.setFailureRate(failures["sub-1"]);
      if (failures["sub-2"] !== undefined) sub2.setFailureRate(failures["sub-2"]);
      if (failures["sub-3"] !== undefined) sub3.setFailureRate(failures["sub-3"]);

      // Emit node_start
      publisher.emitStart(emitter);
      broker.emitStart(emitter);
      sub1.emitStart(emitter);
      sub2.emitStart(emitter);
      sub3.emitStart(emitter);

      collector.start(clock.now());
      const startTime = clock.now();
      const intervalMs = 1000 / scenario.requestsPerSecond;

      for (let i = 0; i < scenario.requestCount; i++) {
        const requestId = `msg-${i + 1}`;
        const request = {
          id: requestId,
          payload: `order-event-${i + 1}`,
          metadata: { topic: "orders", index: i },
        };

        if (i > 0) {
          const jitter = random.between(0.8, 1.2);
          await clock.delay(Math.round(intervalMs * jitter), realTime);
        }

        // Publisher → Broker
        emitter.emit({
          type: "request_flow",
          from: "publisher",
          to: "broker",
          requestId,
          label: "orders",
        });

        const pubResult = await publisher.run(request, emitter);

        if (pubResult.success) {
          // Broker fans out to subscribers
          const brokerResult = await broker.run(request, emitter);
          collector.recordLatency(pubResult.durationMs + brokerResult.durationMs);

          if (brokerResult.success) {
            collector.recordSuccess();
          } else {
            collector.recordError();
          }

          requestResults.push({
            requestId,
            success: brokerResult.success,
            latencyMs: pubResult.durationMs + brokerResult.durationMs,
            path: ["publisher", "broker", "sub-1", "sub-2", "sub-3"],
          });
        } else {
          collector.recordLatency(pubResult.durationMs);
          collector.recordError();
          requestResults.push({
            requestId,
            success: false,
            latencyMs: pubResult.durationMs,
            path: ["publisher"],
            error: pubResult.output,
          });
        }
      }

      collector.stop(clock.now());
      const totalDurationMs = clock.now() - startTime;
      const metrics: AggregateMetrics = collector.getAggregateMetrics();

      // Emit pub/sub specific metrics
      emitter.emit({ type: "metric", name: "total_deliveries", value: broker.getTotalDeliveries(), unit: "count" });
      emitter.emit({ type: "metric", name: "sub-1_messages", value: sub1.getMessagesReceived(), unit: "count", node: "sub-1" });
      emitter.emit({ type: "metric", name: "sub-2_messages", value: sub2.getMessagesReceived(), unit: "count", node: "sub-2" });
      emitter.emit({ type: "metric", name: "sub-3_messages", value: sub3.getMessagesReceived(), unit: "count", node: "sub-3" });
      emitter.emit({
        type: "metric", name: "error_rate",
        value: metrics.totalRequests > 0 ? metrics.errorCount / metrics.totalRequests : 0,
        unit: "ratio",
      });

      // Emit node_end
      publisher.emitEnd(emitter, totalDurationMs);
      broker.emitEnd(emitter, totalDurationMs);
      sub1.emitEnd(emitter, totalDurationMs);
      sub2.emitEnd(emitter, totalDurationMs);
      sub3.emitEnd(emitter, totalDurationMs);

      emitter.emit({ type: "done", totalDurationMs, aggregateMetrics: metrics });

      return { result: { totalDurationMs, requestResults }, metrics };
    },
  };
}
