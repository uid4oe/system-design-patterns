# Step 4c: CQRS Pattern

**Agent:** `pattern-builder`
**Depends on:** Steps 1-2 (core + server)
**Parallel with:** Steps 4a-4b, 4d-4g (other patterns)

## Overview

Command Query Responsibility Segregation separates read and write operations into different models. Commands modify state and publish events to an event store. A projector reads events and builds optimized read models. Queries read from the pre-built read model. This enables independent scaling and optimization of reads vs writes.

**Key concept:** Write path (slow, consistent) vs Read path (fast, eventually consistent).

## Demo Scenarios

**Normal operations:** 50/50 mix of reads and writes — observe dual data paths and consistency lag
**Write-heavy load:** 80% writes — event store fills, projector lag increases, read model stale
**Read-heavy load:** 90% reads — read model serves fast, minimal write-path activity

## Topology

```
                    ┌──write──→ [Command Service] ──→ [Event Store] ──→ [Projector] ──→ [Read Model]
[Client Generator] ─┤
                    └──read───→ [Query Service] ──→ [Read Model]
```

## Implementation Order

### 4c.1 Event Store Node (`nodes/event-store.ts`)

Stateful node that appends events and notifies projector:

```typescript
export class EventStoreNode extends BaseNode {
  private events: StoredEvent[] = [];
  private sequence = 0;

  protected async process(request: SimulationRequest, emitter: SimulationEmitter): Promise<NodeResult> {
    const event: StoredEvent = {
      sequence: this.sequence++,
      type: request.payload,
      timestamp: Date.now(),
    };
    this.events.push(event);

    emitter.emit({ type: "processing", node: this.name, requestId: request.id,
      detail: `stored event #${event.sequence}: ${event.type}` });
    emitter.emit({ type: "metric", name: "event_store_size", value: this.events.length, unit: "events" });

    return { output: `event-${event.sequence}`, durationMs: ..., success: true, metrics: ... };
  }
}
```

- Tracks event sequence number
- Emits event store size metric on each write
- Role: "event-store"

**Commit:** `feat: add event store node for CQRS pattern`

### 4c.2 Command Service Node (`nodes/command-service.ts`)

Validates commands and forwards to event store:

```typescript
export class CommandService extends SimpleNode {
  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    // Validate command, transform to event
    return { output: `command-processed`, ... };
  }
}
```

- Role: "command-handler"
- Higher latency than queries (write validation + event store write)

**Commit:** `feat: add command service node`

### 4c.3 Read Model + Query Service Nodes (`nodes/read-model.ts`, `nodes/query-service.ts`)

```typescript
export class ReadModelNode extends BaseNode {
  private lastProjectedSequence = -1;
  private projectionLag = 0;

  async project(event: StoredEvent, emitter: SimulationEmitter): void {
    this.lastProjectedSequence = event.sequence;
    this.projectionLag = Date.now() - event.timestamp;
    emitter.emit({ type: "metric", name: "projection_lag_ms", value: this.projectionLag, unit: "ms" });
  }

  protected async process(request: SimulationRequest, emitter: SimulationEmitter): Promise<NodeResult> {
    // Read from projected data — very fast
    return { output: `read-at-seq-${this.lastProjectedSequence}`, durationMs: 5, success: true, ... };
  }
}
```

- ReadModel tracks projection lag (staleness)
- QueryService routes reads to ReadModel
- Low latency reads (5-20ms vs 50-200ms writes)

**Commit:** `feat: add read model and query service nodes`

### 4c.4 Projector Node (`nodes/projector.ts`)

Reads from event store and updates read model:

```typescript
export class ProjectorNode extends BaseNode {
  protected async process(request: SimulationRequest, emitter: SimulationEmitter): Promise<NodeResult> {
    // Consume events from event store, project to read model
    emitter.emit({ type: "processing", node: this.name, requestId: request.id,
      detail: `projecting events to read model` });
    return { output: "projected", ... };
  }
}
```

- Runs asynchronously after writes
- Introduces consistency lag between write and read availability

**Commit:** `feat: add projector node`

### 4c.5 Client Generator Node (`nodes/client.ts`)

Generates a mix of read and write requests based on scenario config:

```typescript
// Uses metadata to distinguish: { type: "read" } vs { type: "write" }
```

**Commit:** `feat: add client generator with read/write mix`

### 4c.6 CQRS Simulator (`index.ts`)

```typescript
export const name = "cqrs";
export const description = "Command/Query separation with event sourcing and eventual consistency";
```

- Creates full topology with dual data paths
- Routes read requests: Client → QueryService → ReadModel
- Routes write requests: Client → CommandService → EventStore → Projector → ReadModel
- Emits `request_flow` showing which path each request takes
- Key metrics: write latency, read latency, consistency lag, event store size

**Commit:** `feat: add CQRS simulator and PatternSimulator export`

### 4c.7 Eval Scenarios (`eval/scenarios.json`)

```json
{
  "name": "cqrs-eval",
  "scenarios": [
    {
      "name": "balanced_load",
      "config": { "requestCount": 100, "requestsPerSecond": 20, "seed": 1 },
      "criteria": [
        { "name": "read_p99_latency_ms", "threshold": 50, "comparator": "lt", "weight": 1 },
        { "name": "write_p99_latency_ms", "threshold": 500, "comparator": "lt", "weight": 1 }
      ]
    },
    {
      "name": "write_heavy",
      "config": { "requestCount": 100, "requestsPerSecond": 20, "seed": 2 },
      "criteria": [
        { "name": "max_projection_lag_ms", "threshold": 2000, "comparator": "lt", "weight": 1 }
      ]
    }
  ]
}
```

**Commit:** `chore: add CQRS eval scenarios`

### 4c.8 Tests

- Write path routes through CommandService → EventStore → Projector → ReadModel
- Read path routes through QueryService → ReadModel (bypasses write path)
- Consistency lag: read immediately after write returns stale data
- Event store grows with writes
- Read latency << Write latency
- Deterministic with seed

**Commit:** `test: add tests for CQRS pattern`

## Done When

- [ ] `npm run dev` → select CQRS → run balanced load → see dual data paths
- [ ] Write requests flow through command path (slow)
- [ ] Read requests flow through query path (fast)
- [ ] Metrics show consistency lag between write and read
- [ ] TopologyView shows two distinct paths with different colors/speeds
