import { describe, it, expect } from "vitest";
import { SimulationClock, CollectingEmitter } from "@system-design-patterns/core";
import { ServiceNode } from "../nodes/service.js";
import { PoolNode } from "../nodes/pool.js";
import { GatewayNode } from "../nodes/gateway.js";
import { createSimulator } from "../index.js";

function makeRequest(id: string, service = "service-a") {
  return { id, payload: "test", metadata: { service } };
}

describe("PoolNode", () => {
  it("accepts requests within capacity", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const service = new ServiceNode(
      { name: "svc", role: "backend-service", latencyMs: 0 }, 1, clock,
    );
    const pool = new PoolNode(
      { name: "pool", maxConcurrency: 5, service }, 2, clock,
    );

    const result = await pool.run(makeRequest("r1"), emitter);
    expect(result.success).toBe(true);
    expect(pool.getTotalAccepted()).toBe(1);
    expect(pool.getTotalRejected()).toBe(0);
  });

  it("emits utilization metric", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const service = new ServiceNode(
      { name: "svc", role: "backend-service", latencyMs: 0 }, 1, clock,
    );
    const pool = new PoolNode(
      { name: "pool", maxConcurrency: 10, service }, 2, clock,
    );

    await pool.run(makeRequest("r1"), emitter);

    const util = emitter.getMetricValue("pool_utilization");
    expect(util).toBeDefined();
  });

  it("emits degraded state when pool exhausted", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();
    const service = new ServiceNode(
      { name: "svc", role: "backend-service", latencyMs: 0 }, 1, clock,
    );
    // Pool with capacity 0 → immediate rejection
    const pool = new PoolNode(
      { name: "pool", maxConcurrency: 0, service }, 2, clock,
    );

    const result = await pool.run(makeRequest("r1"), emitter);

    expect(result.success).toBe(false);
    expect(pool.getTotalRejected()).toBe(1);

    const stateChanges = emitter.events.filter(
      (e) => e.type === "node_state_change" && e.node === "pool",
    );
    expect(stateChanges.length).toBeGreaterThan(0);
  });
});

describe("GatewayNode", () => {
  it("routes to correct pool based on service metadata", async () => {
    const clock = new SimulationClock();
    const emitter = new CollectingEmitter();

    const svcA = new ServiceNode({ name: "svc-a", role: "backend-service", latencyMs: 0 }, 1, clock);
    const svcB = new ServiceNode({ name: "svc-b", role: "backend-service", latencyMs: 0 }, 2, clock);

    const poolA = new PoolNode({ name: "pool-a", maxConcurrency: 10, service: svcA }, 3, clock);
    const poolB = new PoolNode({ name: "pool-b", maxConcurrency: 10, service: svcB }, 4, clock);

    const gateway = new GatewayNode({
      name: "gw",
      pools: new Map([["svc-a", poolA], ["svc-b", poolB]]),
    }, 5, clock);

    await gateway.run(makeRequest("r1", "svc-a"), emitter);
    await gateway.run(makeRequest("r2", "svc-b"), emitter);

    expect(poolA.getTotalAccepted()).toBe(1);
    expect(poolB.getTotalAccepted()).toBe(1);
  });
});

describe("Bulkhead Simulator", () => {
  it("distributes requests across all pools", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 15, requestsPerSecond: 100, seed: 42 },
      emitter,
    );

    const metrics = emitter.getAggregateMetrics();
    expect(metrics?.totalRequests).toBe(15);

    // All pools should have accepted some requests
    expect(emitter.getMetricValue("pool-a_accepted")).toBeGreaterThan(0);
    expect(emitter.getMetricValue("pool-b_accepted")).toBeGreaterThan(0);
    expect(emitter.getMetricValue("pool-c_accepted")).toBeGreaterThan(0);
  });

  it("service-a failure doesn't affect pool-b or pool-c", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      {
        requestCount: 15,
        requestsPerSecond: 100,
        seed: 42,
        failureInjection: { nodeFailures: { "service-a": 1.0 } },
      },
      emitter,
    );

    // Pool B and C should have zero rejections (isolation working)
    expect(emitter.getMetricValue("pool-b_rejected")).toBe(0);
    expect(emitter.getMetricValue("pool-c_rejected")).toBe(0);

    // Pool A requests should fail (service behind it fails)
    const metrics = emitter.getAggregateMetrics();
    expect(metrics?.errorCount).toBeGreaterThan(0);
  });

  it("emits proper event envelope", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 5, requestsPerSecond: 100, seed: 1 },
      emitter,
    );

    // First 7: node_start for gateway + 3 pools + 3 services
    const firstSeven = emitter.events.slice(0, 7);
    expect(firstSeven.every((e) => e.type === "node_start")).toBe(true);

    const last = emitter.events[emitter.events.length - 1];
    expect(last?.type).toBe("done");
  });
});
