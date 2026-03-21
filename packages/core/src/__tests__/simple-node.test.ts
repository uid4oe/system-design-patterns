import { describe, it, expect } from "vitest";
import { SimpleNode } from "../node/simple-node.js";
import type { SimulationEvent } from "../stream/types.js";
import type { NodeResult, SimulationRequest } from "../node/types.js";

class EchoNode extends SimpleNode {
  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    return {
      output: `echo-${request.payload}`,
      durationMs: 10,
      success: true,
      metrics: this.getMetrics(),
    };
  }

  protected getProcessingDetail(request: SimulationRequest): string {
    return `echoing ${request.payload}`;
  }
}

function createEmitter(): { emitter: { emit: (e: SimulationEvent) => void }; events: SimulationEvent[] } {
  const events: SimulationEvent[] = [];
  return {
    emitter: { emit: (event: SimulationEvent) => events.push(event) },
    events,
  };
}

describe("SimpleNode", () => {
  it("processes requests and emits processing event", async () => {
    const node = new EchoNode({ name: "echo", role: "echoer", latencyMs: 0 });
    const { emitter, events } = createEmitter();

    const result = await node.run({ id: "req-1", payload: "hello" }, emitter);

    expect(result.success).toBe(true);
    expect(result.output).toBe("echo-hello");
    expect(events.some((e) =>
      e.type === "processing" && e.node === "echo" && e.detail === "echoing hello"
    )).toBe(true);
  });

  it("uses default processing detail when not overridden", async () => {
    class DefaultNode extends SimpleNode {
      protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
        return { output: "ok", durationMs: 0, success: true, metrics: this.getMetrics() };
      }
    }

    const node = new DefaultNode({ name: "default", role: "tester", latencyMs: 0 });
    const { emitter, events } = createEmitter();

    await node.run({ id: "req-5", payload: "test" }, emitter);

    expect(events.some((e) =>
      e.type === "processing" && e.detail === "processing req-5"
    )).toBe(true);
  });
});
