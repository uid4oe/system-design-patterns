import { describe, it, expect } from "vitest";
import { SimulationClock, CollectingEmitter } from "@system-design-patterns/core";
import type { SimulationEvent } from "@system-design-patterns/core";
import { LBBackendNode } from "../nodes/backend.js";
import { LoadBalancerNode } from "../nodes/load-balancer.js";
import { createSimulator } from "../index.js";

type RequestFlow = Extract<SimulationEvent, { type: "request_flow" }>;
type StateChange = Extract<SimulationEvent, { type: "node_state_change" }>;

function createBackends(clock: SimulationClock, count = 4) {
  return Array.from({ length: count }, (_, i) =>
    new LBBackendNode(
      { name: `backend-${i + 1}`, role: "backend-instance", latencyMs: 0 },
      42 + i,
      clock,
    ),
  );
}

function makeRequest(id: string) {
  return { id, payload: "test" };
}

describe("LoadBalancerNode", () => {
  it("round-robin distributes evenly across backends", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const backends = createBackends(clock);
    const lb = new LoadBalancerNode(
      { name: "lb", algorithm: "round-robin", backends },
      50, clock,
    );

    for (let i = 0; i < 8; i++) {
      await lb.run(makeRequest(`r${i}`), emitter);
    }

    const counts = lb.getRequestCounts();
    expect(counts.get("backend-1")).toBe(2);
    expect(counts.get("backend-2")).toBe(2);
    expect(counts.get("backend-3")).toBe(2);
    expect(counts.get("backend-4")).toBe(2);
  });

  it("detects unhealthy backend after consecutive failures and stops routing to it", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const backends = createBackends(clock);
    backends[2]?.setFailureRate(1.0); // backend-3 always fails

    const lb = new LoadBalancerNode(
      { name: "lb", algorithm: "round-robin", backends, failureThreshold: 2 },
      50, clock,
    );

    // Send 12 requests
    for (let i = 0; i < 12; i++) {
      await lb.run(makeRequest(`r${i}`), emitter);
    }

    // backend-3 should be marked unhealthy after 2 consecutive failures
    expect(lb.getUnhealthyBackends().has("backend-3")).toBe(true);

    // backend-3 should have received exactly 2 requests (threshold)
    // then all subsequent requests go to remaining 3 backends
    const counts = lb.getRequestCounts();
    expect(counts.get("backend-3")).toBe(2);

    // Remaining backends should have absorbed the extra load
    const otherTotal = (counts.get("backend-1") ?? 0) +
      (counts.get("backend-2") ?? 0) +
      (counts.get("backend-4") ?? 0);
    expect(otherTotal).toBe(10);
  });

  it("emits node_state_change when backend marked unhealthy", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const backends = createBackends(clock);
    backends[0]?.setFailureRate(1.0);

    const lb = new LoadBalancerNode(
      { name: "lb", algorithm: "round-robin", backends, failureThreshold: 2 },
      50, clock,
    );

    for (let i = 0; i < 8; i++) {
      await lb.run(makeRequest(`r${i}`), emitter);
    }

    const stateChanges = emitter.events
      .filter((e): e is StateChange => e.type === "node_state_change")
      .filter((e) => e.node === "backend-1");

    expect(stateChanges.length).toBeGreaterThan(0);
    expect(stateChanges.some((e) => e.to === "failed")).toBe(true);
  });

  it("consistent-hash routes same ID to same backend", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const backends = createBackends(clock);
    const lb = new LoadBalancerNode(
      { name: "lb", algorithm: "consistent-hash", backends },
      50, clock,
    );

    await lb.run(makeRequest("same-key"), emitter);
    await lb.run(makeRequest("same-key"), emitter);

    const flows = emitter.events
      .filter((e): e is RequestFlow => e.type === "request_flow" && e.from === "lb");

    expect(flows[0]?.to).toBe(flows[1]?.to);
  });

  it("emits request_flow with algorithm label", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const backends = createBackends(clock);
    const lb = new LoadBalancerNode(
      { name: "lb", algorithm: "round-robin", backends },
      50, clock,
    );

    await lb.run(makeRequest("r1"), emitter);

    const flows = emitter.events.filter(
      (e): e is RequestFlow => e.type === "request_flow" && e.from === "lb",
    );
    expect(flows[0]?.label).toBe("round-robin");
  });

  it("returns error when no backends available", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const lb = new LoadBalancerNode(
      { name: "lb", algorithm: "round-robin", backends: [] },
      50, clock,
    );

    const result = await lb.run(makeRequest("r1"), emitter);
    expect(result.success).toBe(false);
    expect(result.output).toBe("no-backend");
  });

  it("returns error when all backends marked unhealthy", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const backends = createBackends(clock, 2);
    backends[0]?.setFailureRate(1.0);
    backends[1]?.setFailureRate(1.0);

    const lb = new LoadBalancerNode(
      { name: "lb", algorithm: "round-robin", backends, failureThreshold: 1 },
      50, clock,
    );

    // First 2 requests fail and mark both unhealthy
    await lb.run(makeRequest("r1"), emitter);
    await lb.run(makeRequest("r2"), emitter);

    // Third request has no healthy backends
    const result = await lb.run(makeRequest("r3"), emitter);
    expect(result.success).toBe(false);
    expect(result.output).toBe("no-backend");
  });
});

describe("Load Balancer Simulator", () => {
  it("distributes requests across all backends", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 20, requestsPerSecond: 100, seed: 42 },
      emitter,
    );

    const metrics = emitter.getAggregateMetrics();
    expect(metrics?.successCount).toBe(20);

    for (let i = 1; i <= 4; i++) {
      const count = emitter.getMetricValue(`backend-${i}_requests`);
      expect(count).toBeGreaterThan(0);
    }
  });

  it("emits request_spread_stddev metric", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 20, requestsPerSecond: 100, seed: 42 },
      emitter,
    );

    const stddev = emitter.getMetricValue("request_spread_stddev");
    expect(stddev).toBeDefined();
    expect(stddev).toBeLessThan(2);
  });

  it("handles backend failure — stops routing to failed backend", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      {
        requestCount: 20,
        requestsPerSecond: 100,
        seed: 42,
        failureInjection: { nodeFailures: { "backend-3": 1.0 } },
      },
      emitter,
    );

    const metrics = emitter.getAggregateMetrics();
    // First 2 requests to backend-3 fail (threshold), rest succeed
    expect(metrics?.errorCount).toBeGreaterThan(0);
    expect(metrics?.successCount).toBeGreaterThan(metrics?.errorCount ?? 0);
  });

  it("emits proper event envelope", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 5, requestsPerSecond: 100, seed: 1 },
      emitter,
    );

    const firstFive = emitter.events.slice(0, 5);
    expect(firstFive.every((e) => e.type === "node_start")).toBe(true);

    const last = emitter.events[emitter.events.length - 1];
    expect(last?.type).toBe("done");
  });
});
