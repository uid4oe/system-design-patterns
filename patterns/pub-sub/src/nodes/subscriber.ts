import { SimpleNode } from "@system-design-patterns/core";
import type { NodeResult, SimulationRequest } from "@system-design-patterns/core";

/**
 * Subscriber consumes messages delivered by the broker.
 */
export class SubscriberNode extends SimpleNode {
  private messagesReceived = 0;

  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    this.messagesReceived++;
    return {
      output: `consumed-${request.id}`,
      durationMs: 0,
      success: true,
      metrics: this.getMetrics(),
    };
  }

  protected getProcessingDetail(request: SimulationRequest): string {
    return `consuming message ${request.id} (#${this.messagesReceived + 1})`;
  }

  getMessagesReceived(): number {
    return this.messagesReceived;
  }
}
