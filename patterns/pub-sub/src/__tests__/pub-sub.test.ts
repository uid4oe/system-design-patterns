import { describe, it, expect } from "vitest";
import { SimulationClock, CollectingEmitter } from "@system-design-patterns/core";
import type { SimulationEvent } from "@system-design-patterns/core";
import { PublisherNode } from "../nodes/publisher.js";
import { SubscriberNode } from "../nodes/subscriber.js";
import { BrokerNode } from "../nodes/broker.js";
import { createSimulator } from "../index.js";

type RequestFlow = Extract<SimulationEvent, { type: "request_flow" }>;

function makeRequest(id: string, topic = "orders") {
  return { id, payload: `event-${id}`, metadata: { topic } };
}

describe("BrokerNode", () => {
  it("fans out to all subscribers on the same topic", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();

    const sub1 = new SubscriberNode({ name: "s1", role: "subscriber", latencyMs: 0 }, 1, clock);
    const sub2 = new SubscriberNode({ name: "s2", role: "subscriber", latencyMs: 0 }, 2, clock);
    const sub3 = new SubscriberNode({ name: "s3", role: "subscriber", latencyMs: 0 }, 3, clock);

    const broker = new BrokerNode({ name: "broker" }, 10, clock);
    broker.subscribe("orders", sub1);
    broker.subscribe("orders", sub2);
    broker.subscribe("orders", sub3);

    await broker.run(makeRequest("r1"), emitter);

    // All 3 should receive the message
    expect(sub1.getMessagesReceived()).toBe(1);
    expect(sub2.getMessagesReceived()).toBe(1);
    expect(sub3.getMessagesReceived()).toBe(1);

    // Should have 3 request_flow events from broker
    const flows = emitter.events.filter(
      (e): e is RequestFlow => e.type === "request_flow" && e.from === "broker",
    );
    expect(flows).toHaveLength(3);
  });

  it("only delivers to subscribers of the matching topic", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();

    const orderSub = new SubscriberNode({ name: "order-sub", role: "subscriber", latencyMs: 0 }, 1, clock);
    const paymentSub = new SubscriberNode({ name: "payment-sub", role: "subscriber", latencyMs: 0 }, 2, clock);

    const broker = new BrokerNode({ name: "broker" }, 10, clock);
    broker.subscribe("orders", orderSub);
    broker.subscribe("payments", paymentSub);

    await broker.run(makeRequest("r1", "orders"), emitter);

    expect(orderSub.getMessagesReceived()).toBe(1);
    expect(paymentSub.getMessagesReceived()).toBe(0);
  });

  it("consumer group delivers to exactly one member via round-robin", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();

    const g1 = new SubscriberNode({ name: "g1", role: "subscriber", latencyMs: 0 }, 1, clock);
    const g2 = new SubscriberNode({ name: "g2", role: "subscriber", latencyMs: 0 }, 2, clock);
    const g3 = new SubscriberNode({ name: "g3", role: "subscriber", latencyMs: 0 }, 3, clock);

    const broker = new BrokerNode({ name: "broker" }, 10, clock);
    broker.subscribe("orders", g1, "worker-group");
    broker.subscribe("orders", g2, "worker-group");
    broker.subscribe("orders", g3, "worker-group");

    // Send 6 messages — should round-robin across 3 members
    for (let i = 0; i < 6; i++) {
      await broker.run(makeRequest(`r${i}`), emitter);
    }

    expect(g1.getMessagesReceived()).toBe(2);
    expect(g2.getMessagesReceived()).toBe(2);
    expect(g3.getMessagesReceived()).toBe(2);
  });

  it("emits fan_out_count metric per message", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();

    const sub1 = new SubscriberNode({ name: "s1", role: "subscriber", latencyMs: 0 }, 1, clock);
    const sub2 = new SubscriberNode({ name: "s2", role: "subscriber", latencyMs: 0 }, 2, clock);

    const broker = new BrokerNode({ name: "broker" }, 10, clock);
    broker.subscribe("orders", sub1);
    broker.subscribe("orders", sub2);

    await broker.run(makeRequest("r1"), emitter);

    expect(emitter.getMetricValue("fan_out_count")).toBe(2);
  });

  it("delivers to zero subscribers for unknown topic", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();

    const broker = new BrokerNode({ name: "broker" }, 10, clock);

    const result = await broker.run(makeRequest("r1", "unknown"), emitter);

    expect(result.success).toBe(true);
    expect(result.output).toBe("delivered-0-failed-0");
  });
});

describe("Pub/Sub Simulator", () => {
  it("fans out all messages to all 3 subscribers", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 5, requestsPerSecond: 100, seed: 42 },
      emitter,
    );

    // Each subscriber should receive all 5 messages
    expect(emitter.getMetricValue("sub-1_messages")).toBe(5);
    expect(emitter.getMetricValue("sub-2_messages")).toBe(5);
    expect(emitter.getMetricValue("sub-3_messages")).toBe(5);
    expect(emitter.getMetricValue("total_deliveries")).toBe(15);
  });

  it("emits proper event envelope", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 3, requestsPerSecond: 100, seed: 1 },
      emitter,
    );

    const firstFive = emitter.events.slice(0, 5);
    expect(firstFive.every((e) => e.type === "node_start")).toBe(true);

    const last = emitter.events[emitter.events.length - 1];
    expect(last?.type).toBe("done");
  });

  it("handles subscriber failure — other subscribers still receive", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      {
        requestCount: 5,
        requestsPerSecond: 100,
        seed: 42,
        failureInjection: { nodeFailures: { "sub-2": 1.0 } },
      },
      emitter,
    );

    // sub-1 and sub-3 still receive all messages despite sub-2 failing
    expect(emitter.getMetricValue("sub-1_messages")).toBe(5);
    expect(emitter.getMetricValue("sub-3_messages")).toBe(5);

    // sub-2 should have received 0 successful messages (all failed)
    // Verify error events were emitted for sub-2
    const sub2Errors = emitter.events.filter(
      (e) => e.type === "error" && e.node === "sub-2",
    );
    expect(sub2Errors.length).toBeGreaterThan(0);
  });
});
