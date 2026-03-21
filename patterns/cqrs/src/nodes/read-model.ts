import { SimpleNode } from "@design-patterns/core";
import type { NodeResult, SimulationRequest, SimulationEmitter } from "@design-patterns/core";
import type { StoredEvent } from "./event-store.js";

/**
 * Pre-built read model optimized for queries. Updated by the projector
 * from event store events. Tracks projection lag (staleness).
 */
export class ReadModelNode extends SimpleNode {
  private lastProjectedSequence = -1;
  private projectionLagMs = 0;

  /** Called by the projector to update the read model from a stored event. */
  project(event: StoredEvent, currentTimeMs: number, emitter: SimulationEmitter): void {
    this.lastProjectedSequence = event.sequence;
    this.projectionLagMs = currentTimeMs - event.timestampMs;

    emitter.emit({
      type: "metric",
      name: "projection_lag_ms",
      value: this.projectionLagMs,
      unit: "ms",
      node: this.name,
    });
  }

  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    return {
      output: `read-at-seq-${this.lastProjectedSequence}`,
      durationMs: 0,
      success: true,
      metrics: this.getMetrics(),
    };
  }

  protected getProcessingDetail(_request: SimulationRequest): string {
    return `serving read (projected up to seq #${this.lastProjectedSequence})`;
  }

  getLastProjectedSequence(): number {
    return this.lastProjectedSequence;
  }

  getProjectionLagMs(): number {
    return this.projectionLagMs;
  }
}
