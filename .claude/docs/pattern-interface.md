# Pattern Interface

## PatternSimulator

The core `PatternSimulator` interface:

```typescript
export interface PatternSimulator {
  run(
    scenario: ScenarioConfig,
    emitter: SimulationEmitter
  ): Promise<{ result: SimulationResult; metrics: AggregateMetrics }>;
}
```

Note: `name` and `description` are module-level exports, not part of the simulator itself.

## Pattern Module Shape

Each pattern package must export three things from `src/index.ts`:

```typescript
// patterns/circuit-breaker/src/index.ts
import { BaseNode } from "@design-patterns/core";
import type { PatternSimulator, SimulationEmitter, ScenarioConfig } from "@design-patterns/core";

export const name = "circuit-breaker";
export const description = "Failure isolation via Closed → Open → Half-Open state machine";

export function createSimulator(): PatternSimulator {
  return {
    async run(scenario, emitter) {
      const metrics: AggregateMetrics = { /* ... */ };
      try {
        // Build topology: nodes + connections
        // Run simulation loop over scenario.requestCount
        // Track metrics, emit events
      } catch (err) {
        emitter.emit({ type: "error", node: "system", message: String(err), recoverable: false });
      } finally {
        emitter.emit({ type: "done", totalDurationMs: 0, aggregateMetrics: metrics });
      }
      return { result: { /* ... */ }, metrics };
    }
  };
}
```

The server dynamically imports each pattern and calls `createSimulator()`:

```typescript
// server/src/index.ts (simplified)
const mod = await import("@design-patterns/circuit-breaker");
patterns.set(mod.name, {
  name: mod.name,
  description: mod.description,
  simulator: mod.createSimulator(),
});
```

## Contract

- `run()` receives a `ScenarioConfig` and a `SimulationEmitter`
- `run()` MUST emit `node_start` for every node in the topology
- `run()` MUST emit `request_flow` when requests move between nodes
- `run()` MUST emit `done` as the final event with aggregated metrics
- `run()` MUST return `{ result, metrics }` so the eval system can collect results
- `run()` MUST handle errors gracefully — catch errors, emit `error` event, then `done`
- `run()` should NOT throw — all errors are communicated via events

## ScenarioConfig

```typescript
interface ScenarioConfig {
  requestCount: number;
  requestsPerSecond: number;
  durationMs?: number;
  failureInjection?: {
    nodeFailures?: Record<string, number>;   // node name → failure probability 0-1
    networkLatency?: Record<string, number>;  // edge key "a→b" → added latency ms
    partitions?: string[][];                  // network partition groups
  };
  seed?: number;                             // for reproducible simulations
}
```

## Pattern Details

See `docs/steps/04a-*.md` through `04g-*.md` for full implementation guides.
