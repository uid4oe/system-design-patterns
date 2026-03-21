import { describe, it, expect } from "vitest";
import { SimulationClock, CollectingEmitter } from "@design-patterns/core";
import type { SimulationEvent } from "@design-patterns/core";
import { CommandService } from "../nodes/command-service.js";
import { EventStoreNode } from "../nodes/event-store.js";
import { ProjectorNode } from "../nodes/projector.js";
import { ReadModelNode } from "../nodes/read-model.js";
import { QueryService } from "../nodes/query-service.js";
import { createSimulator } from "../index.js";

type RequestFlow = Extract<SimulationEvent, { type: "request_flow" }>;

function makeRequest(id: string, payload = "test") {
  return { id, payload };
}

describe("CQRS Nodes", () => {
  it("EventStore appends events with incrementing sequence", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const store = new EventStoreNode(
      { name: "event-store", role: "event-store", latencyMs: 0 },
      42, clock,
    );

    await store.run(makeRequest("r1", "user-created"), emitter);
    await store.run(makeRequest("r2", "user-updated"), emitter);

    expect(store.getEventCount()).toBe(2);
    expect(store.getLastEvent()?.sequence).toBe(1);
    expect(store.getLastEvent()?.type).toBe("user-updated");
  });

  it("EventStore emits event_store_size metric", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const store = new EventStoreNode(
      { name: "event-store", role: "event-store", latencyMs: 0 },
      42, clock,
    );

    await store.run(makeRequest("r1"), emitter);

    expect(emitter.getMetricValue("event_store_size")).toBe(1);
  });

  it("ReadModel tracks projection lag", () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const readModel = new ReadModelNode(
      { name: "read-model", role: "read-model", latencyMs: 0 },
      42, clock,
    );

    clock.advance(1000);
    readModel.project(
      { sequence: 0, type: "test", timestampMs: 500 },
      clock.now(),
      emitter,
    );

    expect(readModel.getLastProjectedSequence()).toBe(0);
    expect(readModel.getProjectionLagMs()).toBe(500);
    expect(emitter.getMetricValue("projection_lag_ms")).toBe(500);
  });

  it("ReadModel serves reads with projected sequence", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const readModel = new ReadModelNode(
      { name: "read-model", role: "read-model", latencyMs: 0 },
      42, clock,
    );

    readModel.project(
      { sequence: 5, type: "test", timestampMs: 0 },
      0,
      emitter,
    );

    const result = await readModel.run(makeRequest("r1"), emitter);
    expect(result.success).toBe(true);
    expect(result.output).toBe("read-at-seq-5");
  });
});

describe("CQRS Simulator", () => {
  it("routes writes through command → event-store → projector → read-model", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    // Use seed that produces writes
    await simulator.run(
      { requestCount: 20, requestsPerSecond: 100, seed: 42 },
      emitter,
    );

    const flows = emitter.events
      .filter((e): e is RequestFlow => e.type === "request_flow")
      .map((e) => `${e.from}→${e.to}`);

    // Write path should exist
    expect(flows).toContain("client→command-svc");
    expect(flows).toContain("command-svc→event-store");
    expect(flows).toContain("event-store→projector");
    expect(flows).toContain("projector→read-model");
  });

  it("routes reads through query-svc → read-model", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 20, requestsPerSecond: 100, seed: 42 },
      emitter,
    );

    const flows = emitter.events
      .filter((e): e is RequestFlow => e.type === "request_flow")
      .map((e) => `${e.from}→${e.to}`);

    expect(flows).toContain("client→query-svc");
    expect(flows).toContain("query-svc→read-model");
  });

  it("emits write and read labels on request_flow", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 20, requestsPerSecond: 100, seed: 42 },
      emitter,
    );

    const flows = emitter.events.filter(
      (e): e is RequestFlow => e.type === "request_flow",
    );

    const writeFlows = flows.filter((e) => e.label === "write");
    const readFlows = flows.filter((e) => e.label === "read");

    expect(writeFlows.length).toBeGreaterThan(0);
    expect(readFlows.length).toBeGreaterThan(0);
  });

  it("emits CQRS-specific metrics", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 20, requestsPerSecond: 100, seed: 42 },
      emitter,
    );

    expect(emitter.getMetricValue("write_count")).toBeGreaterThan(0);
    expect(emitter.getMetricValue("read_count")).toBeGreaterThan(0);
    expect(emitter.getMetricValue("event_store_size")).toBeGreaterThan(0);
  });

  it("event store grows with writes only", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 20, requestsPerSecond: 100, seed: 42 },
      emitter,
    );

    const writeCount = emitter.getMetricValue("write_count") ?? 0;
    const storeSize = emitter.getMetricValue("event_store_size") ?? 0;

    // Store size should equal write count (each write appends one event)
    expect(storeSize).toBe(writeCount);
  });

  it("emits proper event envelope", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 5, requestsPerSecond: 100, seed: 1 },
      emitter,
    );

    // First 5 events: node_start for all 5 nodes
    const firstFive = emitter.events.slice(0, 5);
    expect(firstFive.every((e) => e.type === "node_start")).toBe(true);

    const last = emitter.events[emitter.events.length - 1];
    expect(last?.type).toBe("done");
  });

  it("handles event store failures", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      {
        requestCount: 20,
        requestsPerSecond: 100,
        seed: 42,
        failureInjection: { nodeFailures: { "event-store": 1.0 } },
      },
      emitter,
    );

    const metrics = emitter.getAggregateMetrics();
    // Writes should fail (event store down), reads should still work
    expect(metrics?.errorCount).toBeGreaterThan(0);
  });
});
