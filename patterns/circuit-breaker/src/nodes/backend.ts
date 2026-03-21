import { SimpleNode } from "@design-patterns/core";
import type { NodeResult, SimulationRequest } from "@design-patterns/core";

export class BackendNode extends SimpleNode {
  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    return {
      output: `processed-${request.id}`,
      durationMs: 0,
      success: true,
      metrics: this.getMetrics(),
    };
  }

  protected getProcessingDetail(request: SimulationRequest): string {
    return `processing request ${request.id}`;
  }
}
