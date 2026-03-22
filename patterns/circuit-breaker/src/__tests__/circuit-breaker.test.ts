import { describe, it, expect } from "vitest";
import { SimulationClock, CollectingEmitter } from "@design-patterns/core";
import type { SimulationEvent } from "@design-patterns/core";
import { BackendNode } from "../nodes/backend.js";
import { CircuitBreakerNode } from "../nodes/circuit-breaker.js";
import { createSimulator } from "../index.js";

type StateChange = Extract<SimulationEvent, { type: "node_state_change" }>;

function createTestSetup(backendFailureRate = 0) {
  const clock = new SimulationClock();
  const emitter = new CollectingEmitter();

  const backend = new BackendNode(
    { name: "backend", role: "service", latencyMs: 0 },
    42,
    clock,
  );
  backend.setFailureRate(backendFailureRate);

  const breaker = new CircuitBreakerNode(
    {
      name: "breaker",
      failureThreshold: 3,
      cooldownMs: 5000,
      halfOpenMaxProbes: 1,
      backend,
    },
    42,
    clock,
  );

  return { clock, emitter, backend, breaker };
}

function makeRequest(id: string) {
  return { id, payload: "test" };
}

/** Extract state transitions as "from→to" strings for path verification. */
function getTransitionPath(emitter: CollectingEmitter): string[] {
  return emitter.events
    .filter((e): e is StateChange => e.type === "node_state_change")
    .map((e) => `${e.from}→${e.to}`);
}

describe("CircuitBreakerNode", () => {
  it("forwards requests when closed — emits processing, request_flow, then backend processes", async () => {
    const { emitter, breaker } = createTestSetup();

    const result = await breaker.run(makeRequest("r1"), emitter);

    expect(result.success).toBe(true);
    expect(result.output).toBe("processed-r1");

    // Verify event sequence: processing → request_flow → backend processing
    const relevantEvents = emitter.events.filter(
      (e) => e.type === "processing" || e.type === "request_flow",
    );
    expect(relevantEvents.length).toBeGreaterThanOrEqual(2);

    const processingEvent = relevantEvents.find(
      (e) => e.type === "processing" && "detail" in e && e.detail.includes("circuit closed"),
    );
    expect(processingEvent).toBeDefined();

    const flowEvent = relevantEvents.find(
      (e) => e.type === "request_flow" && "from" in e && e.from === "breaker" && "to" in e && e.to === "backend",
    );
    expect(flowEvent).toBeDefined();
  });

  it("no state changes on successful requests (stays closed)", async () => {
    const { emitter, breaker } = createTestSetup();

    for (let i = 0; i < 5; i++) {
      await breaker.run(makeRequest(`r${i}`), emitter);
    }

    const transitions = getTransitionPath(emitter);
    expect(transitions).toHaveLength(0);
  });

  it("transitions closed→open after exactly failureThreshold consecutive failures", async () => {
    const { emitter, breaker } = createTestSetup(1.0);

    // 2 failures should NOT trigger opening
    await breaker.run(makeRequest("r0"), emitter);
    await breaker.run(makeRequest("r1"), emitter);
    expect(getTransitionPath(emitter)).toHaveLength(0);

    // 3rd failure should trigger closed→open
    await breaker.run(makeRequest("r2"), emitter);
    const transitions = getTransitionPath(emitter);
    expect(transitions).toEqual(["closed→open"]);
  });

  it("resets failure counter on success (no transition after mixed results)", async () => {
    const { emitter, breaker, backend } = createTestSetup(1.0);

    // 2 failures
    await breaker.run(makeRequest("r0"), emitter);
    await breaker.run(makeRequest("r1"), emitter);

    // 1 success resets counter
    backend.setFailureRate(0);
    await breaker.run(makeRequest("r2"), emitter);

    // 2 more failures should NOT trip (counter reset to 0)
    backend.setFailureRate(1.0);
    await breaker.run(makeRequest("r3"), emitter);
    await breaker.run(makeRequest("r4"), emitter);

    expect(getTransitionPath(emitter)).toHaveLength(0);
  });

  it("fast-fails with circuit-open-rejected when open", async () => {
    const { emitter, breaker } = createTestSetup(1.0);

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await breaker.run(makeRequest(`r${i}`), emitter);
    }

    const result = await breaker.run(makeRequest("r-rejected"), emitter);

    expect(result.success).toBe(false);
    expect(result.output).toBe("circuit-open-rejected");

    // Verify fast-fail emits no request_flow (request never reaches backend)
    const flowsAfterOpen = emitter.events.filter(
      (e) => e.type === "request_flow" && "requestId" in e && e.requestId === "r-rejected",
    );
    expect(flowsAfterOpen).toHaveLength(0);
  });

  it("stays open before cooldown expires", async () => {
    const { clock, emitter, breaker } = createTestSetup(1.0);

    for (let i = 0; i < 3; i++) {
      await breaker.run(makeRequest(`r${i}`), emitter);
    }

    // Only advance 4 seconds (cooldown is 5s)
    clock.advance(4000);
    const result = await breaker.run(makeRequest("r-still-open"), emitter);
    expect(result.output).toBe("circuit-open-rejected");

    // Path should still be just closed→open
    expect(getTransitionPath(emitter)).toEqual(["closed→open"]);
  });

  it("follows exact path: closed→open→half-open on cooldown expiry", async () => {
    const { clock, emitter, breaker } = createTestSetup(1.0);

    for (let i = 0; i < 3; i++) {
      await breaker.run(makeRequest(`r${i}`), emitter);
    }

    clock.advance(6000);
    await breaker.run(makeRequest("r-probe"), emitter);

    expect(getTransitionPath(emitter)).toEqual([
      "closed→open",
      "open→half-open",
      "half-open→open", // probe fails because backend still failing
    ]);
  });

  it("follows full recovery path: closed→open→half-open→closed", async () => {
    const { clock, emitter, breaker, backend } = createTestSetup(1.0);

    for (let i = 0; i < 3; i++) {
      await breaker.run(makeRequest(`r${i}`), emitter);
    }

    clock.advance(6000);
    backend.setFailureRate(0);
    const result = await breaker.run(makeRequest("r-probe"), emitter);

    expect(result.success).toBe(true);
    expect(getTransitionPath(emitter)).toEqual([
      "closed→open",
      "open→half-open",
      "half-open→closed",
    ]);
  });

  it("follows re-trip path: closed→open→half-open→open on failed probe", async () => {
    const { clock, emitter, breaker } = createTestSetup(1.0);

    for (let i = 0; i < 3; i++) {
      await breaker.run(makeRequest(`r${i}`), emitter);
    }

    clock.advance(6000);
    // Backend still failing → probe fails → re-trip
    await breaker.run(makeRequest("r-probe"), emitter);

    expect(getTransitionPath(emitter)).toEqual([
      "closed→open",
      "open→half-open",
      "half-open→open",
    ]);
  });

  it("emits recovery_detected metric only on successful probe", async () => {
    const { clock, emitter, breaker, backend } = createTestSetup(1.0);

    for (let i = 0; i < 3; i++) {
      await breaker.run(makeRequest(`r${i}`), emitter);
    }

    // Failed probe — no recovery metric
    clock.advance(6000);
    await breaker.run(makeRequest("r-fail-probe"), emitter);
    expect(emitter.getMetricValue("recovery_detected")).toBeUndefined();

    // Successful probe — recovery metric emitted
    clock.advance(6000);
    backend.setFailureRate(0);
    await breaker.run(makeRequest("r-ok-probe"), emitter);
    expect(emitter.getMetricValue("recovery_detected")).toBe(1);
  });

  it("emits fast_fail_count metric incrementally in open state", async () => {
    const { emitter, breaker } = createTestSetup(1.0);

    for (let i = 0; i < 3; i++) {
      await breaker.run(makeRequest(`r${i}`), emitter);
    }

    // Send 3 requests in open state
    for (let i = 0; i < 3; i++) {
      await breaker.run(makeRequest(`open-${i}`), emitter);
    }

    const fastFailMetrics = emitter.events.filter(
      (e) => e.type === "metric" && e.name === "fast_fail_count",
    );
    expect(fastFailMetrics).toHaveLength(3);
    // Verify counts are incrementing
    const values = fastFailMetrics.map((e) => e.type === "metric" ? e.value : 0);
    expect(values).toEqual([1, 2, 3]);
  });
});

describe("Circuit Breaker Simulator", () => {
  it("healthy traffic: zero errors, all successes", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 10, requestsPerSecond: 100, seed: 42 },
      emitter,
    );

    const metrics = emitter.getAggregateMetrics();
    expect(metrics).toBeDefined();
    expect(metrics?.errorCount).toBe(0);
    expect(metrics?.successCount).toBe(10);
    expect(metrics?.totalRequests).toBe(10);

    // No state changes in healthy scenario
    const stateChanges = emitter.events.filter((e) => e.type === "node_state_change");
    expect(stateChanges).toHaveLength(0);
  });

  it("100% backend failure triggers breaker and fast-fails", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      {
        requestCount: 20,
        requestsPerSecond: 100,
        seed: 42,
        failureInjection: { nodeFailures: { backend: 1.0 } },
      },
      emitter,
    );

    const metrics = emitter.getAggregateMetrics();
    expect(metrics?.errorCount).toBe(20);
    expect(metrics?.successCount).toBe(0);

    // Must have closed→open transition
    const stateChanges = emitter.events
      .filter((e): e is StateChange => e.type === "node_state_change")
      .map((e) => `${e.from}→${e.to}`);
    expect(stateChanges).toContain("closed→open");
  });

  it("event envelope: starts with node_start, ends with done", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 5, requestsPerSecond: 100, seed: 1 },
      emitter,
    );

    // First 2 events must be node_start (breaker, backend)
    const firstTwo = emitter.events.slice(0, 2);
    expect(firstTwo.every((e) => e.type === "node_start")).toBe(true);
    const nodeNames = firstTwo
      .filter((e): e is Extract<SimulationEvent, { type: "node_start" }> => e.type === "node_start")
      .map((e) => e.node);
    expect(nodeNames).toContain("breaker");
    expect(nodeNames).toContain("backend");

    // Last event must be done
    const last = emitter.events[emitter.events.length - 1];
    expect(last?.type).toBe("done");

    // Second to last 3 should be node_end
    const lastFour = emitter.events.slice(-4, -1);
    expect(lastFour.every((e) => e.type === "node_end" || e.type === "metric")).toBe(true);
  });

  it("emits error_rate metric in done event", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      {
        requestCount: 10,
        requestsPerSecond: 100,
        seed: 42,
        failureInjection: { nodeFailures: { backend: 1.0 } },
      },
      emitter,
    );

    const errorRate = emitter.getMetricValue("error_rate");
    expect(errorRate).toBeDefined();
    expect(errorRate).toBe(1.0);
  });
});
