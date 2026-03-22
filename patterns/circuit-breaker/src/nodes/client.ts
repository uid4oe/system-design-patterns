import { SimpleNode } from "@system-design-patterns/core";
import type { NodeResult, SimulationRequest } from "@system-design-patterns/core";

export class ClientNode extends SimpleNode {
  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    return {
      output: `sent-${request.id}`,
      durationMs: 0,
      success: true,
      metrics: this.getMetrics(),
    };
  }

  protected getProcessingDetail(request: SimulationRequest): string {
    return `generating request ${request.id}`;
  }
}
