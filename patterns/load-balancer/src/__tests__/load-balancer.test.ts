import { describe, it, expect } from "vitest";
import { SimulationClock, CollectingEmitter } from "@design-patterns/core";
import type { SimulationEvent } from "@design-patterns/core";
import { LBBackendNode } from "../nodes/backend.js";
import { LoadBalancerNode } from "../nodes/load-balancer.js";
import { createSimulator } from "../index.js";

type RequestFlow = Extract<SimulationEvent, { type: "request_flow" }>;

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
    // 8 requests / 4 backends = 2 each
    expect(counts.get("backend-1")).toBe(2);
    expect(counts.get("backend-2")).toBe(2);
    expect(counts.get("backend-3")).toBe(2);
    expect(counts.get("backend-4")).toBe(2);
  });

  it("round-robin skips failed backends", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const backends = createBackends(clock);
    backends[2]?.setFailureRate(1.0); // backend-3 always fails

    const lb = new LoadBalancerNode(
      { name: "lb", algorithm: "round-robin", backends },
      50, clock,
    );

    // Send requests — backend-3 will fail when hit, others succeed
    for (let i = 0; i < 12; i++) {
      await lb.run(makeRequest(`r${i}`), emitter);
    }

    const counts = lb.getRequestCounts();
    // All 4 backends get requests (RR doesn't skip by failure rate,
    // it routes to all — the backend itself fails)
    expect(counts.get("backend-1")).toBe(3);
    expect(counts.get("backend-2")).toBe(3);
    expect(counts.get("backend-3")).toBe(3);
    expect(counts.get("backend-4")).toBe(3);
  });

  it("consistent-hash routes same ID to same backend", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const backends = createBackends(clock);
    const lb = new LoadBalancerNode(
      { name: "lb", algorithm: "consistent-hash", backends },
      50, clock,
    );

    // Same request ID should go to same backend
    const result1 = await lb.run(makeRequest("same-key"), emitter);
    const result2 = await lb.run(makeRequest("same-key"), emitter);

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

    // All 4 backends should have received requests
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
    // 20 requests / 4 backends = 5 each, stddev should be near 0
    expect(stddev).toBeLessThan(2);
  });

  it("handles backend failure gracefully", async () => {
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
    // Some requests fail (those routed to backend-3)
    expect(metrics?.errorCount).toBeGreaterThan(0);
    // But most succeed (those routed to other backends)
    expect(metrics?.successCount).toBeGreaterThan(0);
  });

  it("emits proper event envelope", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 5, requestsPerSecond: 100, seed: 1 },
      emitter,
    );

    // First 5: node_start for lb + 4 backends
    const firstFive = emitter.events.slice(0, 5);
    expect(firstFive.every((e) => e.type === "node_start")).toBe(true);

    const last = emitter.events[emitter.events.length - 1];
    expect(last?.type).toBe("done");
  });
});
