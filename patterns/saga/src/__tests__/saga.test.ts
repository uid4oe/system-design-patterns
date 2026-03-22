import { describe, it, expect } from "vitest";
import { SimulationClock, CollectingEmitter } from "@system-design-patterns/core";
import type { SimulationEvent } from "@system-design-patterns/core";
import {
  OrderService,
  PaymentService,
  InventoryService,
  ShippingService,
} from "../nodes/saga-service.js";
import { SagaOrchestrator } from "../nodes/orchestrator.js";
import { createSimulator } from "../index.js";

type StateChange = Extract<SimulationEvent, { type: "node_state_change" }>;
type RequestFlow = Extract<SimulationEvent, { type: "request_flow" }>;

function createTestSetup(failures: Record<string, number> = {}) {
  const clock = new SimulationClock();
  const emitter = new CollectingEmitter();

  const order = new OrderService(
    { name: "order", role: "service", latencyMs: 0 }, 42, clock,
  );
  const payment = new PaymentService(
    { name: "payment", role: "service", latencyMs: 0 }, 43, clock,
  );
  const inventory = new InventoryService(
    { name: "inventory", role: "service", latencyMs: 0 }, 44, clock,
  );
  const shipping = new ShippingService(
    { name: "shipping", role: "service", latencyMs: 0 }, 45, clock,
  );

  if (failures["order"] !== undefined) order.setFailureRate(failures["order"]);
  if (failures["payment"] !== undefined) payment.setFailureRate(failures["payment"]);
  if (failures["inventory"] !== undefined) inventory.setFailureRate(failures["inventory"]);
  if (failures["shipping"] !== undefined) shipping.setFailureRate(failures["shipping"]);

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
    46,
    clock,
  );

  return { clock, emitter, orchestrator, order, payment, inventory, shipping };
}

function makeRequest(id: string) {
  return { id, payload: "test" };
}

function getTransitions(emitter: CollectingEmitter): string[] {
  return emitter.events
    .filter((e): e is StateChange => e.type === "node_state_change")
    .map((e) => `${e.from}→${e.to}`);
}

function getFlows(emitter: CollectingEmitter): string[] {
  return emitter.events
    .filter((e): e is RequestFlow => e.type === "request_flow")
    .map((e) => `${e.from}→${e.to}${e.label ? ` [${e.label}]` : ""}`);
}

describe("SagaOrchestrator", () => {
  it("completes all 4 steps on happy path", async () => {
    const { emitter, orchestrator } = createTestSetup();

    const result = await orchestrator.run(makeRequest("r1"), emitter);

    expect(result.success).toBe(true);
    expect(result.output).toBe("saga-completed");

    const flows = getFlows(emitter);
    expect(flows).toContain("orchestrator→order");
    expect(flows).toContain("orchestrator→payment");
    expect(flows).toContain("orchestrator→inventory");
    expect(flows).toContain("orchestrator→shipping");
  });

  it("follows exact state path: executing each step then completed", async () => {
    const { emitter, orchestrator } = createTestSetup();
    await orchestrator.run(makeRequest("r1"), emitter);

    const transitions = getTransitions(emitter);
    expect(transitions).toEqual([
      "idle→executing-order",
      "executing-order→executing-payment",
      "executing-payment→executing-inventory",
      "executing-inventory→executing-shipping",
      "executing-shipping→completed",
      "completed→idle",
    ]);
  });

  it("rolls back on inventory failure: compensates payment then order", async () => {
    const { emitter, orchestrator } = createTestSetup({ inventory: 1.0 });

    const result = await orchestrator.run(makeRequest("r1"), emitter);

    expect(result.success).toBe(false);
    expect(result.output).toBe("saga-rolled-back-at-inventory");

    // Compensation flows should be in reverse: payment then order
    const compensateFlows = getFlows(emitter).filter((f) => f.includes("[compensate]"));
    expect(compensateFlows).toEqual([
      "orchestrator→payment [compensate]",
      "orchestrator→order [compensate]",
    ]);
  });

  it("rolls back on payment failure: only compensates order", async () => {
    const { emitter, orchestrator } = createTestSetup({ payment: 1.0 });

    const result = await orchestrator.run(makeRequest("r1"), emitter);

    expect(result.success).toBe(false);
    expect(result.output).toBe("saga-rolled-back-at-payment");

    const compensateFlows = getFlows(emitter).filter((f) => f.includes("[compensate]"));
    expect(compensateFlows).toEqual([
      "orchestrator→order [compensate]",
    ]);
  });

  it("no compensation on first step failure", async () => {
    const { emitter, orchestrator } = createTestSetup({ order: 1.0 });

    const result = await orchestrator.run(makeRequest("r1"), emitter);

    expect(result.success).toBe(false);
    expect(result.output).toBe("saga-rolled-back-at-order");

    const compensateFlows = getFlows(emitter).filter((f) => f.includes("[compensate]"));
    expect(compensateFlows).toHaveLength(0);
  });

  it("follows compensation state path: compensating each step then rolled-back", async () => {
    const { emitter, orchestrator } = createTestSetup({ shipping: 1.0 });
    await orchestrator.run(makeRequest("r1"), emitter);

    const transitions = getTransitions(emitter);
    expect(transitions).toEqual([
      "idle→executing-order",
      "executing-order→executing-payment",
      "executing-payment→executing-inventory",
      "executing-inventory→executing-shipping",
      "executing-shipping→compensating",
      "compensating→compensating-inventory",
      "compensating-inventory→compensating-payment",
      "compensating-payment→compensating-order",
      "compensating-order→rolled-back",
    ]);
  });

  it("tracks completion and rollback counts", async () => {
    const { emitter, orchestrator } = createTestSetup({ inventory: 1.0 });

    await orchestrator.run(makeRequest("r1"), emitter);
    await orchestrator.run(makeRequest("r2"), emitter);

    expect(orchestrator.getSagaRolledBack()).toBe(2);
    expect(orchestrator.getSagaCompleted()).toBe(0);
  });

  it("emits rollback_count metric on failure", async () => {
    const { emitter, orchestrator } = createTestSetup({ payment: 1.0 });
    await orchestrator.run(makeRequest("r1"), emitter);

    expect(emitter.getMetricValue("rollback_count")).toBe(1);
  });
});

describe("Saga Simulator", () => {
  it("happy path: all succeed", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 5, requestsPerSecond: 100, seed: 42 },
      emitter,
    );

    const metrics = emitter.getAggregateMetrics();
    expect(metrics?.errorCount).toBe(0);
    expect(metrics?.successCount).toBe(5);
  });

  it("failure triggers compensation flows", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      {
        requestCount: 10,
        requestsPerSecond: 100,
        seed: 42,
        failureInjection: { nodeFailures: { inventory: 1.0 } },
      },
      emitter,
    );

    const metrics = emitter.getAggregateMetrics();
    expect(metrics?.errorCount).toBe(10);

    // Should have compensation flows
    const compensateFlows = emitter.events.filter(
      (e): e is RequestFlow => e.type === "request_flow" && e.label === "compensate",
    );
    expect(compensateFlows.length).toBeGreaterThan(0);
  });

  it("emits proper event envelope", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 3, requestsPerSecond: 100, seed: 1 },
      emitter,
    );

    // First 5 events: node_start for orchestrator + 4 services
    const firstFive = emitter.events.slice(0, 5);
    expect(firstFive.every((e) => e.type === "node_start")).toBe(true);

    // Last event: done
    const last = emitter.events[emitter.events.length - 1];
    expect(last?.type).toBe("done");
  });

  it("emits completion_rate and rollback_rate metrics", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      {
        requestCount: 10,
        requestsPerSecond: 100,
        seed: 42,
        failureInjection: { nodeFailures: { shipping: 1.0 } },
      },
      emitter,
    );

    const rollbackRate = emitter.getMetricValue("rollback_rate");
    expect(rollbackRate).toBeDefined();
    expect(rollbackRate).toBe(1.0);
  });
});
