import { describe, it, expect } from "vitest";
import { BaseNode } from "../node/base-node.js";
import type { SimulationEmitter, SimulationEvent } from "../stream/types.js";
import type { NodeResult, SimulationRequest } from "../node/types.js";

class TestNode extends BaseNode {
  protected async process(
    request: SimulationRequest,
    _emitter: SimulationEmitter,
  ): Promise<NodeResult> {
    return {
      output: `processed-${request.id}`,
      durationMs: 0,
      success: true,
      metrics: this.getMetrics(),
    };
  }
}

class ThrowingNode extends BaseNode {
  protected async process(): Promise<NodeResult> {
    throw new Error("intentional failure");
  }
}

function createEmitter(): { emitter: SimulationEmitter; events: SimulationEvent[] } {
  const events: SimulationEvent[] = [];
  return {
    emitter: { emit: (event: SimulationEvent) => events.push(event) },
    events,
  };
}

function createRequest(id = "req-1"): SimulationRequest {
  return { id, payload: "test" };
}

describe("BaseNode", () => {
  it("processes requests successfully", async () => {
    const node = new TestNode({ name: "test", role: "tester", latencyMs: 0 });
    const { emitter } = createEmitter();

    const result = await node.run(createRequest(), emitter);

    expect(result.success).toBe(true);
    expect(result.output).toBe("processed-req-1");
  });

  it("emits node_start via emitStart()", () => {
    const node = new TestNode({ name: "test", role: "tester" });
    const { emitter, events } = createEmitter();

    node.emitStart(emitter);

    expect(events[0]).toEqual({
      type: "node_start",
      node: "test",
      role: "tester",
      state: "idle",
    });
  });

  it("tracks metrics across multiple requests", async () => {
    const node = new TestNode({ name: "test", role: "tester", latencyMs: 0 });
    const { emitter } = createEmitter();

    await node.run(createRequest("r1"), emitter);
    await node.run(createRequest("r2"), emitter);
    await node.run(createRequest("r3"), emitter);

    const metrics = node.getMetrics();
    expect(metrics.requestsHandled).toBe(3);
    expect(metrics.errorsCount).toBe(0);
  });

  it("rejects requests when capacity is exceeded", async () => {
    const node = new TestNode({ name: "test", role: "tester", capacity: 0, latencyMs: 0 });
    const { emitter, events } = createEmitter();

    const result = await node.run(createRequest(), emitter);

    expect(result.success).toBe(false);
    expect(result.output).toBe("rejected-capacity");
    expect(events.some((e) => e.type === "error" && e.message.includes("capacity"))).toBe(true);
  });

  it("handles thrown errors gracefully", async () => {
    const node = new ThrowingNode({ name: "thrower", role: "tester", latencyMs: 0 });
    const { emitter, events } = createEmitter();

    const result = await node.run(createRequest(), emitter);

    expect(result.success).toBe(false);
    expect(events.some((e) => e.type === "error" && e.message === "intentional failure")).toBe(true);
  });

  it("emits node_state_change on setState()", () => {
    const node = new TestNode({ name: "test", role: "tester", initialState: "closed" });
    const { emitter, events } = createEmitter();

    // Access protected method via subclass
    (node as unknown as { setState: (s: string, r: string, e: SimulationEmitter) => void })
      .setState("open", "threshold exceeded", emitter);

    expect(events[0]).toEqual({
      type: "node_state_change",
      node: "test",
      from: "closed",
      to: "open",
      reason: "threshold exceeded",
    });
  });

  it("simulates failures based on failure rate", async () => {
    const node = new TestNode({ name: "test", role: "tester", failureRate: 1.0, latencyMs: 0 });
    const { emitter } = createEmitter();

    const result = await node.run(createRequest(), emitter);

    expect(result.success).toBe(false);
    expect(result.output).toBe("failure");
  });

  it("setFailureRate() updates failure behavior", async () => {
    const node = new TestNode({ name: "test", role: "tester", failureRate: 0, latencyMs: 0 });
    const { emitter } = createEmitter();

    const result1 = await node.run(createRequest("r1"), emitter);
    expect(result1.success).toBe(true);

    node.setFailureRate(1.0);
    const result2 = await node.run(createRequest("r2"), emitter);
    expect(result2.success).toBe(false);
  });

  it("isHealthy() reflects state", () => {
    const node = new TestNode({ name: "test", role: "tester", initialState: "healthy" });
    expect(node.isHealthy()).toBe(true);

    const failedNode = new TestNode({ name: "test", role: "tester", initialState: "failed" });
    expect(failedNode.isHealthy()).toBe(false);
  });
});
