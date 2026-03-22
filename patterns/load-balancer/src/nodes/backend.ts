import { SimpleNode } from "@design-patterns/core";
import type { NodeResult, SimulationRequest } from "@design-patterns/core";

/**
 * Backend instance with active connection tracking for
 * least-connections algorithm.
 */
export class LBBackendNode extends SimpleNode {
  private connections = 0;

  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    this.connections++;
    try {
      return {
        output: `processed-by-${this.name}-${request.id}`,
        durationMs: 0,
        success: true,
        metrics: this.getMetrics(),
      };
    } finally {
      this.connections--;
    }
  }

  protected getProcessingDetail(request: SimulationRequest): string {
    return `handling ${request.id} (${this.connections} active)`;
  }

  getActiveConnections(): number {
    return this.connections;
  }
}
