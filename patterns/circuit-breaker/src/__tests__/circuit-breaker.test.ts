import { describe, it, expect } from "vitest";
import { SimulationClock, CollectingEmitter } from "@design-patterns/core";
import type { SimulationEvent } from "@design-patterns/core";
import { BackendNode } from "../nodes/backend.js";
import { CircuitBreakerNode } from "../nodes/circuit-breaker.js";
import { createSimulator } from "../index.js";

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

describe("CircuitBreakerNode", () => {
  it("forwards requests when circuit is closed", async () => {
    const { emitter, breaker } = createTestSetup();

    const result = await breaker.run(makeRequest("r1"), emitter);

    expect(result.success).toBe(true);
    expect(
      emitter.events.some(
        (e) => e.type === "processing" && e.detail.includes("circuit closed"),
      ),
    ).toBe(true);
  });

  it("opens circuit after failure threshold", async () => {
    const { emitter, breaker } = createTestSetup(1.0);

    for (let i = 0; i < 3; i++) {
      await breaker.run(makeRequest(`r${i}`), emitter);
    }

    const stateChanges = emitter.events.filter(
      (e): e is Extract<SimulationEvent, { type: "node_state_change" }> =>
        e.type === "node_state_change",
    );
    expect(stateChanges.some((e) => e.to === "open")).toBe(true);
  });

  it("fast-fails when circuit is open", async () => {
    const { emitter, breaker } = createTestSetup(1.0);

    // Trip the breaker (3 failures)
    for (let i = 0; i < 3; i++) {
      await breaker.run(makeRequest(`r${i}`), emitter);
    }

    // Next request should be fast-failed
    const result = await breaker.run(makeRequest("r4"), emitter);

    expect(result.success).toBe(false);
    expect(result.output).toBe("circuit-open-rejected");
    expect(
      emitter.events.some(
        (e) => e.type === "processing" && e.detail.includes("fast-fail"),
      ),
    ).toBe(true);
  });

  it("transitions to half-open after cooldown", async () => {
    const { clock, emitter, breaker } = createTestSetup(1.0);

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await breaker.run(makeRequest(`r${i}`), emitter);
    }

    // Advance clock past cooldown
    clock.advance(6000);

    // Next request should trigger half-open transition
    await breaker.run(makeRequest("r-probe"), emitter);

    const stateChanges = emitter.events.filter(
      (e): e is Extract<SimulationEvent, { type: "node_state_change" }> =>
        e.type === "node_state_change",
    );
    expect(stateChanges.some((e) => e.to === "half-open")).toBe(true);
  });

  it("closes circuit on successful probe in half-open", async () => {
    const { clock, emitter, breaker, backend } = createTestSetup(1.0);

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await breaker.run(makeRequest(`r${i}`), emitter);
    }

    // Advance clock and fix backend
    clock.advance(6000);
    backend.setFailureRate(0);

    // Probe should succeed and close circuit
    const result = await breaker.run(makeRequest("r-probe"), emitter);

    expect(result.success).toBe(true);
    const stateChanges = emitter.events.filter(
      (e): e is Extract<SimulationEvent, { type: "node_state_change" }> =>
        e.type === "node_state_change",
    );
    expect(stateChanges.some((e) => e.to === "closed" && e.from === "half-open")).toBe(true);
  });

  it("re-opens circuit on failed probe in half-open", async () => {
    const { clock, emitter, breaker } = createTestSetup(1.0);

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await breaker.run(makeRequest(`r${i}`), emitter);
    }

    // Advance clock but keep backend failing
    clock.advance(6000);

    // Probe should fail and re-open circuit
    await breaker.run(makeRequest("r-probe"), emitter);

    const stateChanges = emitter.events.filter(
      (e): e is Extract<SimulationEvent, { type: "node_state_change" }> =>
        e.type === "node_state_change",
    );
    const transitions = stateChanges.map((e) => e.to);
    // Should go: closed→open, open→half-open, half-open→open
    expect(transitions.filter((t) => t === "open")).toHaveLength(2);
  });

  it("emits recovery_detected metric on successful probe", async () => {
    const { clock, emitter, breaker, backend } = createTestSetup(1.0);

    for (let i = 0; i < 3; i++) {
      await breaker.run(makeRequest(`r${i}`), emitter);
    }

    clock.advance(6000);
    backend.setFailureRate(0);
    await breaker.run(makeRequest("r-probe"), emitter);

    expect(emitter.getMetricValue("recovery_detected")).toBe(1);
  });
});

describe("Circuit Breaker Simulator", () => {
  it("runs healthy traffic scenario without errors", async () => {
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
  });

  it("runs failure scenario with breaker activation", async () => {
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
    expect(metrics).toBeDefined();
    // All requests should fail (backend 100% failure + circuit breaker rejections)
    expect(metrics?.errorCount).toBe(20);

    // Should have state change events
    const stateChanges = emitter.events.filter((e) => e.type === "node_state_change");
    expect(stateChanges.length).toBeGreaterThan(0);
  });

  it("emits proper event sequence", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 5, requestsPerSecond: 100, seed: 1 },
      emitter,
    );

    // Should start with node_start events
    const firstEvents = emitter.events.slice(0, 3);
    expect(firstEvents.every((e) => e.type === "node_start")).toBe(true);

    // Should end with done
    const lastEvent = emitter.events[emitter.events.length - 1];
    expect(lastEvent?.type).toBe("done");
  });
});
