import { SimpleNode } from "@system-design-patterns/core";
import type { NodeResult, SimulationRequest } from "@system-design-patterns/core";

/**
 * Command handler — validates write commands and transforms them
 * into events. Higher latency than queries (validation + consistency).
 */
export class CommandService extends SimpleNode {
  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    return {
      output: `command-validated-${request.id}`,
      durationMs: 0,
      success: true,
      metrics: this.getMetrics(),
    };
  }

  protected getProcessingDetail(request: SimulationRequest): string {
    return `validating command: ${request.payload}`;
  }
}
