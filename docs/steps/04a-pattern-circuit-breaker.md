# Step 4a: Circuit Breaker Pattern

**Agent:** `pattern-builder`
**Depends on:** Steps 1-2 (core + server)
**Parallel with:** Steps 4b-4g (other patterns)

## Overview

The circuit breaker pattern prevents cascading failures by wrapping calls to an external service. When failures exceed a threshold, the breaker "opens" and rejects requests immediately (fast-fail), giving the downstream service time to recover. After a cooldown, it enters "half-open" state and probes with a single request before fully closing again.

**State machine:** Closed → Open → Half-Open → Closed (or back to Open)

## Demo Scenarios

**Healthy traffic:**
- 50 requests at 10 rps, no failures → breaker stays closed, all succeed

**Backend failure:**
- 100 requests at 10 rps, backend fails at 50% → breaker opens after threshold, fast-fails remaining, probes recovery

**Cascading failure prevention:**
- 100 requests at 20 rps, backend completely down → breaker opens fast, p99 drops dramatically vs no-breaker baseline

## Topology

```
[Client] ──→ [Circuit Breaker] ──→ [Backend Service]
```

## Implementation Order

### 4a.1 Backend Service Node (`nodes/backend.ts`)

- Extends SimpleNode
- Simulates a service with configurable latency and failure rate
- `handleRequest()`: returns success/failure based on config
- Role: "service"

**Commit:** `feat: add backend service node for circuit breaker`

### 4a.2 Circuit Breaker Node (`nodes/circuit-breaker.ts`)

- Extends BaseNode (needs custom state machine logic)
- States: "closed", "open", "half-open"
- Config: `failureThreshold` (default 5), `cooldownMs` (default 5000), `halfOpenMaxProbes` (default 1)
- State transitions:
  - Closed: forwards requests, tracks consecutive failures. When failures >= threshold → Open
  - Open: rejects all requests immediately (fast-fail). After cooldownMs → Half-Open
  - Half-Open: allows `halfOpenMaxProbes` requests through. If probe succeeds → Closed. If fails → Open
- Emits `node_state_change` on every transition with reason

**Commit:** `feat: add circuit breaker node with state machine`

### 4a.3 Client Node (`nodes/client.ts`)

- Extends SimpleNode
- Generates requests at configured rate
- Role: "request-generator"

**Commit:** `feat: add client request generator node`

### 4a.4 Circuit Breaker Simulator (`index.ts`)

- Creates topology: Client → CircuitBreaker → Backend
- `createSimulator()` returns PatternSimulator
- `run(scenario, emitter)`:
  1. Emit `node_start` for all nodes
  2. Generate requests per scenario config
  3. For each request:
     - Emit `request_flow` from client → breaker
     - Breaker processes (forward, reject, or probe)
     - If forwarded: emit `request_flow` breaker → backend
     - Backend processes
     - Emit `request_flow` response back
  4. Collect metrics throughout
  5. Emit `done` with aggregate metrics
- Applies failure injection from scenario config

**Commit:** `feat: add circuit breaker simulator and PatternSimulator export`

### 4a.5 Eval Scenarios (`eval/scenarios.json`)

```json
{
  "name": "circuit-breaker-eval",
  "scenarios": [
    {
      "name": "healthy_traffic",
      "config": { "requestCount": 50, "requestsPerSecond": 10, "seed": 1 },
      "criteria": [
        { "name": "error_rate", "threshold": 0.01, "comparator": "lt", "weight": 1 }
      ]
    },
    {
      "name": "backend_failure_50pct",
      "config": {
        "requestCount": 100, "requestsPerSecond": 10, "seed": 2,
        "failureInjection": { "nodeFailures": { "backend": 0.5 } }
      },
      "criteria": [
        { "name": "recovery_detected", "threshold": 1, "comparator": "eq", "weight": 1 },
        { "name": "fast_fail_ratio", "threshold": 0.3, "comparator": "gt", "weight": 1 }
      ]
    },
    {
      "name": "backend_down",
      "config": {
        "requestCount": 100, "requestsPerSecond": 20, "seed": 3,
        "failureInjection": { "nodeFailures": { "backend": 1.0 } }
      },
      "criteria": [
        { "name": "p99_latency_ms", "threshold": 100, "comparator": "lt", "weight": 1 }
      ]
    }
  ]
}
```

**Commit:** `chore: add circuit breaker eval scenarios`

### 4a.6 Tests

- State transitions: closed → open on threshold
- State transitions: open → half-open after cooldown
- State transitions: half-open → closed on probe success
- State transitions: half-open → open on probe failure
- Fast-fail behavior in open state
- Metric collection accuracy
- Deterministic with seed

**Commit:** `test: add tests for circuit breaker pattern`

## Done When

- [ ] `npm run dev` → select Circuit Breaker → run "Backend failure" scenario
- [ ] TopologyView shows 3 nodes with state-colored circuit breaker
- [ ] State transitions visible: Closed (green) → Open (red) → Half-Open (yellow) → Closed (green)
- [ ] Metrics panel shows p99 latency drop after breaker opens
- [ ] All eval scenarios pass their criteria
