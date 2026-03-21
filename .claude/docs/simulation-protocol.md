# Simulation Protocol

## Overview

All pattern execution flows through a simulation protocol. Nodes emit `SimulationEvent` objects via a `SimulationEmitter`. The server bridges these to SSE. The frontend parses them with `useSimulation`.

## Simulation Events

```typescript
type SimulationEvent =
  | { type: "node_start"; node: string; role: string; state?: string }
  | { type: "processing"; node: string; requestId: string; detail: string }
  | { type: "request_flow"; from: string; to: string; requestId: string; label?: string }
  | { type: "node_state_change"; node: string; from: string; to: string; reason: string }
  | { type: "node_end"; node: string; durationMs: number; metrics: NodeMetrics }
  | { type: "metric"; name: string; value: number; unit: string; node?: string }
  | { type: "error"; node: string; message: string; recoverable: boolean }
  | { type: "done"; totalDurationMs: number; aggregateMetrics: AggregateMetrics }

type NodeMetrics = {
  requestsHandled: number;
  errorsCount: number;
  avgLatencyMs: number;
}

type AggregateMetrics = {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  p50LatencyMs: number;
  p99LatencyMs: number;
  throughputRps: number;
}
```

## Event Flow Example (Circuit Breaker)

```
node_start("client", "request-generator")
node_start("breaker", "circuit-breaker", state="closed")
node_start("backend", "service")

request_flow("client", "breaker", requestId="req-1")
processing("breaker", "req-1", "forwarding — circuit closed")
request_flow("breaker", "backend", requestId="req-1")
processing("backend", "req-1", "processing request")
node_end("backend", { durationMs: 45, metrics: { requestsHandled: 1, errorsCount: 0, avgLatencyMs: 45 } })
request_flow("backend", "breaker", requestId="req-1", label="200 OK")
request_flow("breaker", "client", requestId="req-1", label="success")

// ... more requests, then backend starts failing ...

error("backend", "connection timeout", recoverable=true)
node_state_change("breaker", from="closed", to="open", reason="error threshold exceeded (5/10)")
metric("error_rate", 0.5, "ratio", node="breaker")

// Breaker rejects requests while open
processing("breaker", "req-15", "rejecting — circuit open")
error("breaker", "circuit open — fast fail", recoverable=true)

// Half-open probe
node_state_change("breaker", from="open", to="half-open", reason="cool-down expired")
request_flow("breaker", "backend", requestId="req-20", label="probe")
processing("backend", "req-20", "processing probe request")
node_state_change("breaker", from="half-open", to="closed", reason="probe succeeded")

metric("recovery_time_ms", 5200, "ms")
done({ totalDurationMs: 12000, aggregateMetrics: { ... } })
```

## SimulationEmitter Interface

```typescript
interface SimulationEmitter {
  emit(event: SimulationEvent): void;
}
```

The server creates a `SimulationEmitter` that writes each event as an SSE line:
```
data: {"type":"node_start","node":"breaker","role":"circuit-breaker","state":"closed"}

data: {"type":"request_flow","from":"client","to":"breaker","requestId":"req-1"}

data: {"type":"done","totalDurationMs":12000,"aggregateMetrics":{...}}
```

## Rules

- Every node initialization MUST emit `node_start`
- `node_end` MUST include `durationMs` and `metrics`
- `request_flow` tracks individual requests through the topology — use `requestId` for correlation
- `node_state_change` fires when a stateful node transitions (circuit breaker, saga steps)
- `processing` provides detail about what a node is doing with a specific request
- `metric` can fire at any point to report real-time measurements
- `error` MUST include `recoverable` flag — determines if the pattern retries or propagates
- `done` fires exactly once, at the very end, with aggregated metrics
- Errors should still end with `done`
