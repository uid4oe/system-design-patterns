import { SimpleNode } from "@design-patterns/core";
import type { NodeResult, SimulationRequest } from "@design-patterns/core";

/**
 * Publisher sends messages to a topic via the broker.
 */
export class PublisherNode extends SimpleNode {
  private readonly topic: string;
  private publishCount = 0;

  constructor(
    config: import("@design-patterns/core").NodeConfig,
    topic: string,
    seed?: number,
    clock?: import("@design-patterns/core").SimulationClock,
    realTime?: boolean,
  ) {
    super(config, seed, clock, realTime);
    this.topic = topic;
  }

  getTopic(): string {
    return this.topic;
  }

  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    this.publishCount++;
    return {
      output: `published-to-${this.topic}-${request.id}`,
      durationMs: 0,
      success: true,
      metrics: this.getMetrics(),
    };
  }

  protected getProcessingDetail(_request: SimulationRequest): string {
    return `publishing to topic: ${this.topic}`;
  }

  getPublishCount(): number {
    return this.publishCount;
  }
}
