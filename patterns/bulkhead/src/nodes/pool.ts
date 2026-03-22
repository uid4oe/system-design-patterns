import { BaseNode } from "@design-patterns/core";
import type {
  NodeResult,
  SimulationRequest,
  SimulationEmitter,
  SimulationClock,
} from "@design-patterns/core";
import type { ServiceNode } from "./service.js";

interface PoolConfig {
  name: string;
  maxConcurrency: number;
  service: ServiceNode;
}

/**
 * Thread pool with fixed capacity. Rejects requests when all slots
 * are occupied, preventing one overloaded service from consuming
 * resources meant for others.
 */
export class PoolNode extends BaseNode {
  private activeCount = 0;
  private readonly maxConcurrency: number;
  private readonly service: ServiceNode;
  private totalAccepted = 0;
  private totalRejected = 0;
  private isDegraded = false;

  constructor(config: PoolConfig, seed = 0, clock?: SimulationClock, realTime = false) {
    super(
      { name: config.name, role: "thread-pool", initialState: "active", latencyMs: 5 },
      seed,
      clock,
      realTime,
    );
    this.maxConcurrency = config.maxConcurrency;
    this.service = config.service;
  }

  protected async process(
    request: SimulationRequest,
    emitter: SimulationEmitter,
  ): Promise<NodeResult> {
    if (this.activeCount >= this.maxConcurrency) {
      this.totalRejected++;
      emitter.emit({
        type: "error",
        node: this.name,
        message: `pool exhausted (${this.activeCount}/${this.maxConcurrency})`,
        recoverable: true,
      });
      if (!this.isDegraded) {
        this.isDegraded = true;
        emitter.emit({
          type: "node_state_change",
          node: this.name,
          from: "active",
          to: "degraded",
          reason: `capacity full — rejecting requests`,
        });
      }
      emitter.emit({
        type: "metric",
        name: `${this.name}_rejections`,
        value: this.totalRejected,
        unit: "count",
        node: this.name,
      });
      return {
        output: `rejected-by-${this.name}`,
        durationMs: 0,
        success: false,
        metrics: this.getMetrics(),
      };
    }

    this.activeCount++;
    this.totalAccepted++;

    emitter.emit({
      type: "processing",
      node: this.name,
      requestId: request.id,
      detail: `slot ${this.activeCount}/${this.maxConcurrency} occupied`,
    });
    emitter.emit({
      type: "metric",
      name: `${this.name}_utilization`,
      value: Math.round((this.activeCount / this.maxConcurrency) * 100) / 100,
      unit: "ratio",
      node: this.name,
    });

    try {
      emitter.emit({
        type: "request_flow",
        from: this.name,
        to: this.service.name,
        requestId: request.id,
      });
      return await this.service.run(request, emitter);
    } finally {
      this.activeCount--;
      if (this.isDegraded && this.activeCount < this.maxConcurrency) {
        this.isDegraded = false;
        emitter.emit({
          type: "node_state_change",
          node: this.name,
          from: "degraded",
          to: "active",
          reason: `capacity available (${this.activeCount}/${this.maxConcurrency})`,
        });
      }
    }
  }

  getTotalAccepted(): number {
    return this.totalAccepted;
  }

  getTotalRejected(): number {
    return this.totalRejected;
  }

  getMaxConcurrency(): number {
    return this.maxConcurrency;
  }
}
