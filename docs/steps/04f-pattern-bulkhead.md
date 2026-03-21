# Step 4f: Bulkhead Pattern

**Agent:** `pattern-builder`
**Depends on:** Steps 1-2 (core + server)
**Parallel with:** Steps 4a-4e, 4g (other patterns)

## Overview

The bulkhead pattern isolates resources into separate pools to prevent one failing component from consuming all resources and cascading failures to others. Named after ship bulkheads that contain flooding to one compartment. Each pool has a fixed capacity; when exhausted, requests to that pool are rejected while other pools remain unaffected.

**Key concept:** Resource isolation prevents cascading failures across service boundaries.

## Demo Scenarios

**Normal traffic:** All pools have capacity, all requests succeed
**Pool exhaustion:** High load on Pool A (30 rps) overwhelms its 10-thread limit; Pool B (5 rps) is unaffected
**Cascade prevention:** Compare shared pool (all 25 threads) vs bulkhead (10+10+5) under same failure

## Topology

```
              ┌──→ [Pool A: 10 threads] ──→ [Service A]
[Gateway] ──→ ├──→ [Pool B: 10 threads] ──→ [Service B]
              └──→ [Pool C: 5 threads]  ──→ [Service C]
```

## Implementation Order

### 4f.1 Service Nodes (`nodes/service.ts`)

```typescript
export class ServiceNode extends SimpleNode {
  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    // Simulate service processing
    return { output: `processed-by-${this.name}`, durationMs: this.config.latencyMs ?? 50, success: true, ... };
  }
}
```

- Configurable latency and failure rate
- Role: "backend-service"

**Commit:** `feat: add backend service nodes for bulkhead pattern`

### 4f.2 Pool Node (`nodes/pool.ts`)

```typescript
export class PoolNode extends BaseNode {
  private activeCount = 0;
  private readonly maxConcurrency: number;
  private rejectedCount = 0;

  protected async process(request: SimulationRequest, emitter: SimulationEmitter): Promise<NodeResult> {
    if (this.activeCount >= this.maxConcurrency) {
      this.rejectedCount++;
      emitter.emit({ type: "error", node: this.name, message: `pool exhausted (${this.activeCount}/${this.maxConcurrency})`, recoverable: true });
      emitter.emit({ type: "metric", name: "pool_rejection_rate", value: this.rejectedCount / (this.rejectedCount + this.activeCount), unit: "ratio", node: this.name });
      return { output: "rejected", success: false, ... };
    }

    this.activeCount++;
    emitter.emit({ type: "metric", name: "pool_utilization", value: this.activeCount / this.maxConcurrency, unit: "ratio", node: this.name });

    try {
      emitter.emit({ type: "request_flow", from: this.name, to: this.service.name, requestId: request.id });
      const result = await this.service.run(request, emitter);
      return result;
    } finally {
      this.activeCount--;
    }
  }
}
```

- Tracks active connections against max capacity
- Rejects requests when pool is full
- Emits utilization and rejection metrics per pool
- Role: "thread-pool"

**Commit:** `feat: add pool node with capacity limits and isolation`

### 4f.3 Gateway Node (`nodes/gateway.ts`)

```typescript
export class GatewayNode extends BaseNode {
  private pools: Map<string, PoolNode>;

  protected async process(request: SimulationRequest, emitter: SimulationEmitter): Promise<NodeResult> {
    const targetPool = this.routeToPool(request);
    emitter.emit({ type: "request_flow", from: this.name, to: targetPool.name, requestId: request.id });
    return targetPool.run(request, emitter);
  }

  private routeToPool(request: SimulationRequest): PoolNode {
    // Route based on request metadata (service type)
    const service = (request.metadata?.service as string) ?? "service-a";
    return this.pools.get(service) ?? this.pools.values().next().value!;
  }
}
```

- Routes requests to appropriate pool based on service type
- Role: "gateway"

**Commit:** `feat: add gateway node with pool routing`

### 4f.4 Bulkhead Simulator (`index.ts`)

```typescript
export const name = "bulkhead";
export const description = "Isolated resource pools preventing cascading failures across services";
```

- Creates gateway → 3 pools → 3 services
- Pools have different capacities (10, 10, 5)
- Key metrics: per-pool utilization, rejection rate, cross-pool isolation effectiveness

**Commit:** `feat: add bulkhead simulator and PatternSimulator export`

### 4f.5 Eval Scenarios (`eval/scenarios.json`)

```json
{
  "name": "bulkhead-eval",
  "scenarios": [
    {
      "name": "normal_traffic",
      "config": { "requestCount": 50, "requestsPerSecond": 10, "seed": 1 },
      "criteria": [
        { "name": "overall_rejection_rate", "threshold": 0.01, "comparator": "lt", "weight": 1 }
      ]
    },
    {
      "name": "pool_a_overload",
      "config": { "requestCount": 100, "requestsPerSecond": 30, "seed": 2 },
      "criteria": [
        { "name": "pool_a_rejection_rate", "threshold": 0.1, "comparator": "gt", "weight": 1 },
        { "name": "pool_b_rejection_rate", "threshold": 0.01, "comparator": "lt", "weight": 1 }
      ]
    }
  ]
}
```

**Commit:** `chore: add bulkhead eval scenarios`

### 4f.6 Tests

- Normal traffic: all requests accepted across all pools
- Pool exhaustion: overloaded pool rejects, other pools unaffected
- Utilization metrics: accurate per-pool tracking
- Rejection rate: correctly counted per pool
- Isolation: failure in Pool A doesn't increase Pool B rejections
- Deterministic with seed

**Commit:** `test: add tests for bulkhead pattern`

## Done When

- [ ] `npm run dev` → select Bulkhead → run "Normal traffic" → all requests succeed
- [ ] "Pool A overload" → Pool A rejects excess, Pool B/C healthy
- [ ] TopologyView shows gateway → 3 pools → 3 services with utilization colors
- [ ] Metrics show per-pool utilization and rejection rate
