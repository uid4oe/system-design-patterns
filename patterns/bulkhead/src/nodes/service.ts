import { SimpleNode } from "@design-patterns/core";
import type { NodeResult, SimulationRequest } from "@design-patterns/core";

/**
 * Backend service behind a bulkhead pool.
 */
export class ServiceNode extends SimpleNode {
  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    return {
      output: `processed-by-${this.name}-${request.id}`,
      durationMs: 0,
      success: true,
      metrics: this.getMetrics(),
    };
  }

  protected getProcessingDetail(request: SimulationRequest): string {
    return `${this.name} handling ${request.id}`;
  }
}
