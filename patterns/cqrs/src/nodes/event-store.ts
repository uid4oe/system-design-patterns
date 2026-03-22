import { BaseNode } from "@system-design-patterns/core";
import type {
  NodeResult,
  SimulationRequest,
  SimulationEmitter,
} from "@system-design-patterns/core";

export interface StoredEvent {
  sequence: number;
  type: string;
  timestampMs: number;
}

/**
 * Append-only event store. Stores events with sequence numbers and
 * emits event_store_size metric on each write.
 */
export class EventStoreNode extends BaseNode {
  private storedEvents: StoredEvent[] = [];
  private sequence = 0;

  protected async process(
    request: SimulationRequest,
    emitter: SimulationEmitter,
  ): Promise<NodeResult> {
    const event: StoredEvent = {
      sequence: this.sequence++,
      type: request.payload,
      timestampMs: this.clock.now(),
    };
    this.storedEvents.push(event);

    emitter.emit({
      type: "processing",
      node: this.name,
      requestId: request.id,
      detail: `stored event #${event.sequence}: ${event.type}`,
    });
    emitter.emit({
      type: "metric",
      name: "event_store_size",
      value: this.storedEvents.length,
      unit: "events",
      node: this.name,
    });

    return {
      output: `event-${event.sequence}`,
      durationMs: 0,
      success: true,
      metrics: this.getMetrics(),
    };
  }

  getLastEvent(): StoredEvent | undefined {
    return this.storedEvents[this.storedEvents.length - 1];
  }

  getEventCount(): number {
    return this.storedEvents.length;
  }
}
