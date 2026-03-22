import { BaseNode } from "@system-design-patterns/core";
import type {
  NodeResult,
  SimulationRequest,
  SimulationEmitter,
  SimulationClock,
} from "@system-design-patterns/core";
import type { PoolNode } from "./pool.js";

interface GatewayConfig {
  name: string;
  pools: Map<string, PoolNode>;
}

/**
 * Gateway routes requests to the appropriate bulkhead pool
 * based on target service in request metadata.
 */
export class GatewayNode extends BaseNode {
  private readonly pools: Map<string, PoolNode>;
  private readonly defaultPool: PoolNode;

  constructor(config: GatewayConfig, seed = 0, clock?: SimulationClock, realTime = false) {
    super(
      { name: config.name, role: "gateway", initialState: "active", latencyMs: 5 },
      seed,
      clock,
      realTime,
    );
    this.pools = config.pools;
    const first = config.pools.values().next();
    if (first.done || !first.value) {
      throw new Error("Gateway requires at least one pool");
    }
    this.defaultPool = first.value;
  }

  protected async process(
    request: SimulationRequest,
    emitter: SimulationEmitter,
  ): Promise<NodeResult> {
    const targetPool = this.routeToPool(request);

    emitter.emit({
      type: "processing",
      node: this.name,
      requestId: request.id,
      detail: `routing to ${targetPool.name}`,
    });
    emitter.emit({
      type: "request_flow",
      from: this.name,
      to: targetPool.name,
      requestId: request.id,
    });

    return targetPool.run(request, emitter);
  }

  private routeToPool(request: SimulationRequest): PoolNode {
    const service = (request.metadata?.["service"] as string | undefined) ?? "";
    return this.pools.get(service) ?? this.defaultPool;
  }
}
