# Step 4g: Rate Limiter Pattern

**Agent:** `pattern-builder`
**Depends on:** Steps 1-2 (core + server)
**Parallel with:** Steps 4a-4f (other patterns)

## Overview

Rate limiting controls the number of requests a system accepts within a time window. Implements the token bucket algorithm: tokens refill at a steady rate, each request consumes one token, and requests without available tokens are rejected. Demonstrates burst handling, steady-state throughput, and graceful degradation under overload.

**Key concept:** Token bucket allows bursts up to bucket capacity, then enforces steady-state rate.

## Demo Scenarios

**Steady traffic:** 5 rps against 10 rps limit — all accepted, bucket stays full
**Burst traffic:** 50 requests in 1 second (burst) against 10 rps limit with bucket=20 — first 20 accepted, rest rejected, then gradual recovery
**Sustained overload:** 30 rps against 10 rps limit — observe accept/reject ratio stabilize at ~33%

## Topology

```
[Client] ──→ [Rate Limiter] ──→ [Backend Service]
```

## Implementation Order

### 4g.1 Rate Limiter Node (`nodes/rate-limiter.ts`)

```typescript
export class RateLimiterNode extends BaseNode {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;  // tokens per second
  private lastRefillTime: number;
  private acceptedCount = 0;
  private rejectedCount = 0;

  constructor(config: NodeConfig & { maxTokens: number; refillRate: number }) {
    super(config);
    this.maxTokens = config.maxTokens;
    this.tokens = config.maxTokens;  // Start full
    this.refillRate = config.refillRate;
    this.lastRefillTime = 0;
  }

  protected async process(request: SimulationRequest, emitter: SimulationEmitter): Promise<NodeResult> {
    this.refillTokens(emitter);

    if (this.tokens >= 1) {
      this.tokens--;
      this.acceptedCount++;
      emitter.emit({ type: "processing", node: this.name, requestId: request.id,
        detail: `accepted (${this.tokens}/${this.maxTokens} tokens remaining)` });
      emitter.emit({ type: "metric", name: "bucket_level", value: this.tokens / this.maxTokens, unit: "ratio", node: this.name });

      // Forward to backend
      emitter.emit({ type: "request_flow", from: this.name, to: "backend", requestId: request.id });
      return { output: "accepted", success: true, ... };
    } else {
      this.rejectedCount++;
      emitter.emit({ type: "processing", node: this.name, requestId: request.id,
        detail: `rejected (bucket empty)` });
      emitter.emit({ type: "error", node: this.name, message: "rate limit exceeded", recoverable: true });
      emitter.emit({ type: "metric", name: "accept_reject_ratio",
        value: this.acceptedCount / (this.acceptedCount + this.rejectedCount), unit: "ratio", node: this.name });

      return { output: "rejected", success: false, ... };
    }
  }

  private refillTokens(emitter: SimulationEmitter): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefillTime) / 1000;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefillTime = now;

    emitter.emit({ type: "metric", name: "bucket_level", value: this.tokens / this.maxTokens, unit: "ratio", node: this.name });
  }
}
```

- Token bucket with configurable max tokens and refill rate
- Emits bucket level metric on every request
- Emits accept/reject ratio metric
- Role: "rate-limiter"

**Commit:** `feat: add rate limiter node with token bucket algorithm`

### 4g.2 Client and Backend Nodes (`nodes/client.ts`, `nodes/backend.ts`)

```typescript
// Client: generates requests at scenario's requestsPerSecond
// Backend: simple service that processes accepted requests
```

- Client role: "request-generator"
- Backend role: "service"

**Commit:** `feat: add client and backend nodes for rate limiter`

### 4g.3 Rate Limiter Simulator (`index.ts`)

```typescript
export const name = "rate-limiter";
export const description = "Token bucket rate limiting with burst handling and steady-state throughput";
```

- Creates Client → RateLimiter → Backend
- Rate limiter configured from scenario metadata (maxTokens, refillRate)
- Default: maxTokens=20, refillRate=10
- Key metrics: accept/reject ratio, bucket level over time, effective throughput

**Commit:** `feat: add rate limiter simulator and PatternSimulator export`

### 4g.4 Eval Scenarios (`eval/scenarios.json`)

```json
{
  "name": "rate-limiter-eval",
  "scenarios": [
    {
      "name": "under_limit",
      "config": { "requestCount": 50, "requestsPerSecond": 5, "seed": 1 },
      "criteria": [
        { "name": "accept_rate", "threshold": 0.99, "comparator": "gt", "weight": 1 }
      ]
    },
    {
      "name": "burst_recovery",
      "config": { "requestCount": 50, "requestsPerSecond": 50, "seed": 2 },
      "criteria": [
        { "name": "initial_accept_count", "threshold": 15, "comparator": "gt", "weight": 1 },
        { "name": "eventual_accept_rate", "threshold": 0.15, "comparator": "gt", "weight": 1 }
      ]
    },
    {
      "name": "sustained_overload",
      "config": { "requestCount": 100, "requestsPerSecond": 30, "seed": 3 },
      "criteria": [
        { "name": "steady_state_accept_rate", "threshold": 0.25, "comparator": "gt", "weight": 1 },
        { "name": "steady_state_accept_rate", "threshold": 0.45, "comparator": "lt", "weight": 1 }
      ]
    }
  ]
}
```

**Commit:** `chore: add rate limiter eval scenarios`

### 4g.5 Tests

- Under limit: all requests accepted, bucket stays above 50%
- Burst: first N requests accepted (N ≈ maxTokens), then rejections
- Recovery: after burst, bucket refills and new requests are accepted
- Sustained overload: accept rate converges to refillRate/requestRate
- Bucket level never exceeds maxTokens
- Refill rate is accurate
- Deterministic with seed

**Commit:** `test: add tests for rate limiter pattern`

## Done When

- [ ] `npm run dev` → select Rate Limiter → run "Steady traffic" → all requests accepted
- [ ] "Burst traffic" → first ~20 accepted, then rejections, then gradual recovery
- [ ] "Sustained overload" → accept/reject ratio stabilizes at ~33%
- [ ] TopologyView shows 3 nodes with bucket level visualization on rate limiter
- [ ] Metrics show accept/reject ratio and bucket level over time
