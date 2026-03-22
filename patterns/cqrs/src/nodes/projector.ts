import { SimpleNode } from "@system-design-patterns/core";
import type { NodeResult, SimulationRequest } from "@system-design-patterns/core";

/**
 * Projector — consumes events from the event store and updates
 * the read model. Introduces consistency lag between write and
 * read availability.
 */
export class ProjectorNode extends SimpleNode {
  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    return {
      output: `projected-${request.id}`,
      durationMs: 0,
      success: true,
      metrics: this.getMetrics(),
    };
  }

  protected getProcessingDetail(_request: SimulationRequest): string {
    return "projecting events to read model";
  }
}
