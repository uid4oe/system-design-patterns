# Step 4d: Load Balancer Pattern

**Agent:** `pattern-builder`
**Depends on:** Steps 1-2 (core + server)
**Parallel with:** Steps 4a-4c, 4e-4g (other patterns)

## Overview

The load balancer distributes incoming requests across multiple backend instances. Implements three algorithms — round-robin, least-connections, and consistent hashing — to demonstrate their different tradeoffs under varying conditions.

**Key concept:** Algorithm choice determines distribution fairness, latency, and resilience to failure.

## Demo Scenarios

**Even load:** 4 equal-capacity backends, observe distribution uniformity per algorithm
**Hot instance:** Backend-2 has 3x latency — round-robin suffers, least-connections adapts
**Instance failure:** Backend-3 goes down at request 50 — observe failover behavior

## Topology

```
                  ┌──→ [Backend 1]
[Client] ──→ [LB] ├──→ [Backend 2]
                  ├──→ [Backend 3]
                  └──→ [Backend 4]
```

## Implementation Order

### 4d.1 Backend Instance Nodes (`nodes/backend.ts`)

```typescript
export class BackendNode extends SimpleNode {
  private activeConnections = 0;

  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    this.activeConnections++;
    try {
      // Simulate processing with configurable latency
      return { output: `processed-by-${this.name}`, durationMs: this.config.latencyMs ?? 50, success: true, ... };
    } finally {
      this.activeConnections--;
    }
  }

  getActiveConnections(): number { return this.activeConnections; }
}
```

- Tracks active connections (for least-connections algorithm)
- Configurable latency and failure rate per instance
- Role: "backend-instance"

**Commit:** `feat: add backend instance node with connection tracking`

### 4d.2 Load Balancer Node (`nodes/load-balancer.ts`)

```typescript
type LBAlgorithm = "round-robin" | "least-connections" | "consistent-hash";

export class LoadBalancerNode extends BaseNode {
  private backends: BackendNode[];
  private algorithm: LBAlgorithm;
  private rrIndex = 0;

  protected async process(request: SimulationRequest, emitter: SimulationEmitter): Promise<NodeResult> {
    const target = this.selectBackend(request);

    if (!target) {
      emitter.emit({ type: "error", node: this.name, message: "no healthy backends", recoverable: false });
      return { output: "no-backend", success: false, ... };
    }

    emitter.emit({ type: "processing", node: this.name, requestId: request.id,
      detail: `routing to ${target.name} via ${this.algorithm}` });
    emitter.emit({ type: "request_flow", from: this.name, to: target.name, requestId: request.id });

    return target.run(request, emitter);
  }

  private selectBackend(request: SimulationRequest): BackendNode | undefined {
    const healthy = this.backends.filter(b => b.isHealthy());
    if (healthy.length === 0) return undefined;

    switch (this.algorithm) {
      case "round-robin":
        return healthy[this.rrIndex++ % healthy.length];
      case "least-connections":
        return healthy.reduce((min, b) => b.getActiveConnections() < min.getActiveConnections() ? b : min);
      case "consistent-hash":
        const hash = this.hashKey(request.id);
        return healthy[hash % healthy.length];
    }
  }
}
```

- Supports 3 algorithms via config
- Filters out unhealthy backends
- Emits `request_flow` to selected backend
- Emits processing detail with algorithm name

**Commit:** `feat: add load balancer node with round-robin, least-connections, and consistent hash`

### 4d.3 Client Node (`nodes/client.ts`)

Simple request generator.

**Commit:** `feat: add client request generator for load balancer`

### 4d.4 Load Balancer Simulator (`index.ts`)

```typescript
export const name = "load-balancer";
export const description = "Request distribution with round-robin, least-connections, and consistent hashing";
```

- Creates 1 LB + 4 backends
- Algorithm selected via scenario metadata or defaults to round-robin
- Applies failure injection per-backend
- Key metrics: request spread (std dev across backends), p99 latency, failed requests

**Commit:** `feat: add load balancer simulator and PatternSimulator export`

### 4d.5 Eval Scenarios (`eval/scenarios.json`)

```json
{
  "name": "load-balancer-eval",
  "scenarios": [
    {
      "name": "even_distribution_rr",
      "config": { "requestCount": 100, "requestsPerSecond": 20, "seed": 1 },
      "criteria": [
        { "name": "request_spread_stddev", "threshold": 5, "comparator": "lt", "weight": 1 }
      ]
    },
    {
      "name": "hot_instance_lc",
      "config": {
        "requestCount": 100, "requestsPerSecond": 20, "seed": 2,
        "failureInjection": { "networkLatency": { "lb→backend-2": 200 } }
      },
      "criteria": [
        { "name": "hot_instance_request_share", "threshold": 0.15, "comparator": "lt", "weight": 1 }
      ]
    },
    {
      "name": "instance_failure",
      "config": {
        "requestCount": 100, "requestsPerSecond": 10, "seed": 3,
        "failureInjection": { "nodeFailures": { "backend-3": 1.0 } }
      },
      "criteria": [
        { "name": "error_rate", "threshold": 0.05, "comparator": "lt", "weight": 1 }
      ]
    }
  ]
}
```

**Commit:** `chore: add load balancer eval scenarios`

### 4d.6 Tests

- Round-robin distributes evenly across healthy backends
- Least-connections avoids backend with highest active connections
- Consistent hash routes same request ID to same backend
- Failed backend excluded from rotation
- Request spread metric accuracy
- Deterministic with seed

**Commit:** `test: add tests for load balancer pattern`

## Done When

- [ ] `npm run dev` → select Load Balancer → run "Even load" → requests distribute evenly
- [ ] "Hot instance" scenario shows least-connections avoiding slow backend
- [ ] "Instance failure" shows remaining backends absorb load
- [ ] TopologyView shows LB node connected to 4 backend nodes with request counts
- [ ] Metrics show request distribution spread and p99 latency
