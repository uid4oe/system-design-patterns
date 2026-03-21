import { SimpleNode } from "@design-patterns/core";
import type { NodeResult, SimulationRequest } from "@design-patterns/core";

/**
 * Query handler — routes reads to the read model.
 * Fast path with minimal processing overhead.
 */
export class QueryService extends SimpleNode {
  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    return {
      output: `query-routed-${request.id}`,
      durationMs: 0,
      success: true,
      metrics: this.getMetrics(),
    };
  }

  protected getProcessingDetail(_request: SimulationRequest): string {
    return "routing query to read model";
  }
}
