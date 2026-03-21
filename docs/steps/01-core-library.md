# Step 1: Core Library

**Agent:** `core-builder`
**Depends on:** nothing (first step)
**Blocks:** all subsequent steps

## Overview

Build the shared library at `packages/core/src/`. Everything else depends on this — simulation engine, node base classes, event types, metric collectors, and eval utilities.

## Implementation Order

### 1.1 Simulation Event Types (`stream/types.ts`)

```typescript
export interface NodeMetrics {
  requestsHandled: number;
  errorsCount: number;
  avgLatencyMs: number;
}

export interface AggregateMetrics {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  p50LatencyMs: number;
  p99LatencyMs: number;
  throughputRps: number;
}

export type SimulationEvent =
  | { type: "node_start"; node: string; role: string; state?: string }
  | { type: "processing"; node: string; requestId: string; detail: string }
  | { type: "request_flow"; from: string; to: string; requestId: string; label?: string }
  | { type: "node_state_change"; node: string; from: string; to: string; reason: string }
  | { type: "node_end"; node: string; durationMs: number; metrics: NodeMetrics }
  | { type: "metric"; name: string; value: number; unit: string; node?: string }
  | { type: "error"; node: string; message: string; recoverable: boolean }
  | { type: "done"; totalDurationMs: number; aggregateMetrics: AggregateMetrics }

export interface SimulationEmitter {
  emit(event: SimulationEvent): void;
}
```

**Commit:** `feat: add SimulationEvent types and SimulationEmitter interface`

### 1.2 Node Types (`node/types.ts`)

```typescript
export interface NodeConfig {
  name: string;
  role: string;
  latencyMs?: number;        // simulated processing delay (default: 50)
  failureRate?: number;      // probability of failure 0-1 (default: 0)
  capacity?: number;         // max concurrent requests (default: Infinity)
  initialState?: string;     // for stateful nodes
}

export interface SimulationRequest {
  id: string;
  payload: string;
  metadata?: Record<string, unknown>;
}

export interface NodeResult {
  output: string;
  durationMs: number;
  success: boolean;
  metrics: NodeMetrics;
}
```

**Commit:** `feat: add NodeConfig, SimulationRequest, and NodeResult types`

### 1.3 Simulation Types (`simulation/types.ts`)

```typescript
export interface ScenarioConfig {
  requestCount: number;
  requestsPerSecond: number;
  durationMs?: number;
  failureInjection?: {
    nodeFailures?: Record<string, number>;
    networkLatency?: Record<string, number>;
    partitions?: string[][];
  };
  seed?: number;
}

export interface SimulationResult {
  totalDurationMs: number;
  requestResults: RequestResult[];
}

export interface RequestResult {
  requestId: string;
  success: boolean;
  latencyMs: number;
  path: string[];  // nodes traversed
  error?: string;
}

export interface PatternSimulator {
  run(
    scenario: ScenarioConfig,
    emitter: SimulationEmitter
  ): Promise<{ result: SimulationResult; metrics: AggregateMetrics }>;
}
```

**Commit:** `feat: add ScenarioConfig, SimulationResult, and PatternSimulator types`

### 1.4 Seeded Random (`simulation/random.ts`)

Deterministic random number generator for reproducible simulations:

```typescript
export class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }

  // Returns 0-1 (deterministic)
  next(): number { /* mulberry32 or similar */ }

  // Returns true with given probability
  chance(probability: number): boolean { return this.next() < probability; }

  // Returns value between min and max
  between(min: number, max: number): number { /* ... */ }
}
```

**Commit:** `feat: add SeededRandom for deterministic simulations`

### 1.5 Simulation Clock (`simulation/clock.ts`)

Virtual time management for simulations:

```typescript
export class SimulationClock {
  private currentMs: number = 0;

  now(): number { return this.currentMs; }
  advance(ms: number): void { this.currentMs += ms; }

  // Simulated delay (advances virtual time, optionally uses setTimeout for visualization)
  async delay(ms: number, realTime?: boolean): Promise<void> {
    this.advance(ms);
    if (realTime) await new Promise(r => setTimeout(r, Math.min(ms, 50)));
  }
}
```

**Commit:** `feat: add SimulationClock for virtual time management`

### 1.6 BaseNode (`node/base-node.ts`)

Abstract base class for all simulation nodes:

```typescript
export abstract class BaseNode {
  readonly name: string;
  readonly role: string;
  protected config: NodeConfig;
  protected state: string;
  private activeRequests: number = 0;

  constructor(config: NodeConfig) { /* ... */ }

  async run(request: SimulationRequest, emitter: SimulationEmitter): Promise<NodeResult> {
    const startTime = Date.now();
    emitter.emit({ type: "node_start", node: this.name, role: this.role, state: this.state });

    // Check capacity
    if (this.activeRequests >= (this.config.capacity ?? Infinity)) {
      emitter.emit({ type: "error", node: this.name, message: "capacity exceeded", recoverable: true });
      // return error result
    }

    this.activeRequests++;
    try {
      // Simulate latency
      await this.simulateLatency();

      // Check failure injection
      if (this.shouldFail()) {
        throw new Error("simulated failure");
      }

      // Execute subclass logic
      const result = await this.process(request, emitter);
      return result;
    } catch (err) {
      emitter.emit({ type: "error", node: this.name, message: String(err), recoverable: true });
      // return error result
    } finally {
      this.activeRequests--;
      emitter.emit({ type: "node_end", node: this.name, durationMs: Date.now() - startTime, metrics: this.getMetrics() });
    }
  }

  protected abstract process(request: SimulationRequest, emitter: SimulationEmitter): Promise<NodeResult>;

  protected setState(newState: string, reason: string, emitter: SimulationEmitter): void {
    const oldState = this.state;
    this.state = newState;
    emitter.emit({ type: "node_state_change", node: this.name, from: oldState, to: newState, reason });
  }
}
```

**Commit:** `feat: implement BaseNode with lifecycle events and failure simulation`

### 1.7 SimpleNode (`node/simple-node.ts`)

For stateless request-response nodes:

```typescript
export abstract class SimpleNode extends BaseNode {
  protected async process(request: SimulationRequest, emitter: SimulationEmitter): Promise<NodeResult> {
    emitter.emit({ type: "processing", node: this.name, requestId: request.id, detail: this.getProcessingDetail(request) });
    return this.handleRequest(request);
  }

  protected abstract handleRequest(request: SimulationRequest): Promise<NodeResult>;
  protected getProcessingDetail(request: SimulationRequest): string {
    return `processing ${request.id}`;
  }
}
```

**Commit:** `feat: add SimpleNode for stateless request-response nodes`

### 1.8 Metric Collectors (`eval/metrics.ts`)

```typescript
export class MetricCollector {
  private latencies: number[] = [];
  private successCount = 0;
  private errorCount = 0;
  private startTime = 0;

  recordLatency(ms: number): void { this.latencies.push(ms); }
  recordSuccess(): void { this.successCount++; }
  recordError(): void { this.errorCount++; }

  getAggregateMetrics(): AggregateMetrics {
    return {
      totalRequests: this.latencies.length,
      successCount: this.successCount,
      errorCount: this.errorCount,
      p50LatencyMs: this.percentile(50),
      p99LatencyMs: this.percentile(99),
      throughputRps: this.calculateThroughput(),
    };
  }

  private percentile(p: number): number { /* sort + index */ }
}
```

**Commit:** `feat: add MetricCollector for latency percentiles and throughput`

### 1.9 Eval Runner (`eval/datasets.ts`)

```typescript
export interface EvalScenario {
  name: string;
  config: ScenarioConfig;
  criteria: EvalCriteria[];
}

export interface EvalCriteria {
  name: string;
  threshold: number;
  comparator: "lt" | "gt" | "eq";
  weight: number;
}

export interface EvalDataset {
  name: string;
  scenarios: EvalScenario[];
}

export function loadDataset(path: string): EvalDataset { /* read + validate JSON */ }

export async function runEval(params: {
  simulator: PatternSimulator;
  dataset: EvalDataset;
}): Promise<EvalResult> { /* run each scenario, score against criteria */ }
```

**Commit:** `feat: add eval dataset loader and scenario runner`

### 1.10 Barrel Exports (`index.ts`)

Export everything from a single entry point.

**Commit:** `feat: add core barrel exports`

### 1.11 Tests

- `base-node.test.ts` — lifecycle events, latency simulation, failure injection, capacity limits
- `simple-node.test.ts` — request processing, detail emission
- `simulation-clock.test.ts` — virtual time, delay
- `seeded-random.test.ts` — determinism, probability distribution
- `metrics.test.ts` — percentile calculation, throughput
- `datasets.test.ts` — dataset loading, eval runner

**Commit:** `test: add tests for core library`

## Done When

- [ ] `npm run typecheck` — zero errors
- [ ] All tests pass
- [ ] BaseNode emits correct event sequence (node_start → processing → node_end)
- [ ] SimpleNode handles requests with configurable latency and failure rate
- [ ] SeededRandom produces identical sequences for same seed
- [ ] MetricCollector calculates accurate p50/p99
- [ ] EvalRunner executes scenarios and scores against criteria
