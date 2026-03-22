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
  /** Consecutive failures before marking a backend unhealthy. Default 2. */
  failureThreshold?: number;
}

/**
 * Load balancer distributing requests across backends using one of
 * three algorithms. Tracks per-backend failures and excludes backends
 * that exceed the consecutive failure threshold.
 */
export class LoadBalancerNode extends BaseNode {
  private readonly backends: LBBackendNode[];
  private readonly algorithm: LBAlgorithm;
  private readonly failureThreshold: number;
  private rrIndex = 0;
  private readonly requestCounts = new Map<string, number>();
  private readonly consecutiveFailures = new Map<string, number>();
  private readonly markedUnhealthy = new Set<string>();

  constructor(config: LoadBalancerConfig, seed = 0, clock?: SimulationClock, realTime = false) {
    super(
      { name: config.name, role: "load-balancer", initialState: "active", latencyMs: 10 },
      seed,
      clock,
      realTime,
    );
    this.backends = config.backends;
    this.algorithm = config.algorithm;
    this.failureThreshold = config.failureThreshold ?? 2;
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

    const count = (this.requestCounts.get(target.name) ?? 0) + 1;
    this.requestCounts.set(target.name, count);

    const result = await target.run(request, emitter);

    // Track failures to detect unhealthy backends
    if (result.success) {
      this.consecutiveFailures.set(target.name, 0);
    } else {
      const fails = (this.consecutiveFailures.get(target.name) ?? 0) + 1;
      this.consecutiveFailures.set(target.name, fails);

      if (fails >= this.failureThreshold) {
        this.markedUnhealthy.add(target.name);
        emitter.emit({
          type: "node_state_change",
          node: target.name,
          from: "active",
          to: "failed",
          reason: `${fails} consecutive failures`,
        });
      }
    }

    return result;
  }

  private selectBackend(request: SimulationRequest): LBBackendNode | undefined {
    const healthy = this.backends.filter(
      (b) => !this.markedUnhealthy.has(b.name),
    );
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

  getUnhealthyBackends(): Set<string> {
    return new Set(this.markedUnhealthy);
  }
}
