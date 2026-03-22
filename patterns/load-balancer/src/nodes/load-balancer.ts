import { BaseNode } from "@design-patterns/core";
import type {
  NodeResult,
  SimulationRequest,
  SimulationEmitter,
  SimulationClock,
} from "@design-patterns/core";
import type { LBBackendNode } from "./backend.js";

type LBAlgorithm = "round-robin" | "least-connections" | "consistent-hash";

interface LoadBalancerConfig {
  name: string;
  algorithm: LBAlgorithm;
  backends: LBBackendNode[];
}

/**
 * Load balancer distributing requests across backends using one of
 * three algorithms: round-robin, least-connections, or consistent-hash.
 */
export class LoadBalancerNode extends BaseNode {
  private readonly backends: LBBackendNode[];
  private readonly algorithm: LBAlgorithm;
  private rrIndex = 0;
  private readonly requestCounts = new Map<string, number>();

  constructor(config: LoadBalancerConfig, seed = 0, clock?: SimulationClock, realTime = false) {
    super(
      { name: config.name, role: "load-balancer", initialState: "active", latencyMs: 10 },
      seed,
      clock,
      realTime,
    );
    this.backends = config.backends;
    this.algorithm = config.algorithm;
  }

  protected async process(
    request: SimulationRequest,
    emitter: SimulationEmitter,
  ): Promise<NodeResult> {
    const target = this.selectBackend(request);

    if (!target) {
      emitter.emit({
        type: "error",
        node: this.name,
        message: "no healthy backends available",
        recoverable: false,
      });
      return {
        output: "no-backend",
        durationMs: 0,
        success: false,
        metrics: this.getMetrics(),
      };
    }

    emitter.emit({
      type: "processing",
      node: this.name,
      requestId: request.id,
      detail: `routing to ${target.name} via ${this.algorithm}`,
    });
    emitter.emit({
      type: "request_flow",
      from: this.name,
      to: target.name,
      requestId: request.id,
      label: this.algorithm,
    });

    // Track per-backend request counts
    const count = (this.requestCounts.get(target.name) ?? 0) + 1;
    this.requestCounts.set(target.name, count);

    return target.run(request, emitter);
  }

  private selectBackend(request: SimulationRequest): LBBackendNode | undefined {
    const healthy = this.backends.filter((b) => b.isHealthy());
    if (healthy.length === 0) return undefined;

    switch (this.algorithm) {
      case "round-robin": {
        const idx = this.rrIndex % healthy.length;
        this.rrIndex++;
        return healthy[idx];
      }
      case "least-connections": {
        let min = healthy[0];
        for (let i = 1; i < healthy.length; i++) {
          const b = healthy[i];
          if (b && min && b.getActiveConnections() < min.getActiveConnections()) {
            min = b;
          }
        }
        return min;
      }
      case "consistent-hash": {
        const hash = this.hashKey(request.id);
        return healthy[hash % healthy.length];
      }
    }
  }

  private hashKey(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash);
  }

  getRequestCounts(): Map<string, number> {
    return new Map(this.requestCounts);
  }

  getAlgorithm(): LBAlgorithm {
    return this.algorithm;
  }
}
