# Design Patterns — Architecture Plan

## Vision

An interactive educational platform for system design and distribution patterns. Users select a pattern, configure a scenario (load level, failure injection, network conditions), and watch the system respond in real-time through animated topology visualization.

**No LLM dependency.** All nodes are deterministic simulators with configurable behavior (latency, failure rate, capacity, state). This makes the project free to run, reproducible, and focused on system concepts rather than AI.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (strict, ESM) |
| Monorepo | npm workspaces |
| Server | Express 4 + SSE streaming |
| Frontend | React 19 + Vite + Tailwind CSS v4 |
| Visualization | React Flow (topology) + custom components |
| Testing | Vitest |
| Evaluation | Metric-based (latency, throughput, failure rate, recovery time) |
| Deployment | Docker (multi-stage) + Docker Compose |
| CI/CD | GitHub Actions |

## Directory Structure

```
system-design-patterns/
├── packages/
│   └── core/                          # Shared simulation engine
│       └── src/
│           ├── node/
│           │   ├── base-node.ts       # Abstract base — lifecycle, event emission
│           │   ├── simple-node.ts     # Single-behavior node (most nodes)
│           │   └── types.ts           # NodeConfig, NodeResult, NodeState
│           ├── stream/
│           │   └── types.ts           # SimulationEvent, SimulationEmitter, Metrics
│           ├── simulation/
│           │   ├── engine.ts          # SimulationEngine — tick-based execution
│           │   ├── clock.ts           # SimulationClock — virtual time
│           │   └── types.ts           # ScenarioConfig, SimulationResult
│           ├── eval/
│           │   ├── metrics.ts         # Metric collectors (p50/p99, throughput, error rate)
│           │   ├── datasets.ts        # Scenario datasets, eval runner
│           │   └── scorer.ts          # Threshold-based scoring
│           └── index.ts              # Barrel exports
├── server/
│   └── src/
│       ├── index.ts                   # Express app, pattern loading, CORS
│       ├── stream.ts                  # SSESimulationEmitter
│       ├── routes/
│       │   ├── patterns.ts            # GET /api/patterns, POST /api/patterns/:name/run
│       │   └── evals.ts              # POST /api/evals/:name/run
│       └── middleware/
│           ├── request-logger.ts
│           └── rate-limiter.ts
├── frontend/
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                     # Layout: topology + control panel + metrics
│       ├── types.ts                    # Frontend types
│       ├── hooks/
│       │   └── useSimulation.ts       # SSE streaming hook (adapted from useStream)
│       └── components/
│           ├── TopologyView.tsx        # React Flow graph — nodes + edges
│           ├── NodeRenderer.tsx        # Custom node with status, metrics, animations
│           ├── EdgeRenderer.tsx        # Animated edge with request flow
│           ├── ControlPanel.tsx        # Scenario config (load, failures, etc.)
│           ├── MetricsPanel.tsx        # Real-time metrics display
│           ├── PatternSelector.tsx     # Pattern picker
│           ├── ScenarioPresets.tsx     # Pre-built scenarios (like try-it prompts)
│           ├── LearnView.tsx           # Educational content
│           ├── MermaidDiagram.tsx      # Mermaid renderer
│           └── CollapsibleSection.tsx
├── patterns/
│   ├── circuit-breaker/               # Closed → Open → Half-Open state machine
│   ├── saga/                          # Distributed transactions + compensation
│   ├── cqrs/                          # Command/Query separation + event sourcing
│   ├── load-balancer/                 # Round-robin, least-connections, consistent hash
│   ├── pub-sub/                       # Event-driven fan-out with topic routing
│   ├── bulkhead/                      # Isolated resource pools
│   └── rate-limiter/                  # Token bucket, sliding window
├── docs/
│   ├── plan.md                        # This file
│   └── steps/                         # Step-by-step implementation guides
├── .claude/
│   ├── docs/                          # Technical specs
│   ├── agents/                        # Agent role definitions
│   └── diary/                         # Evolution log
├── docker-compose.yml
└── .github/workflows/
```

## Core Design

### Simulation Engine

Unlike agent-orchestration-patterns (which wraps LLM calls), this project simulates distributed system behavior:

```typescript
// BaseNode — abstract simulation participant
abstract class BaseNode {
  constructor(config: NodeConfig) // name, role, latency, failureRate, capacity
  run(request: SimulationRequest, emitter: SimulationEmitter): Promise<NodeResult>
  // Emits: node_start, processing, node_end
  // Simulates: latency (configurable), failures (probabilistic), capacity limits
}

// SimpleNode — for stateless request-response nodes
class SimpleNode extends BaseNode {
  // Subclasses implement process(request) → response
  // BaseNode handles lifecycle events, latency simulation, failure injection
}

// SimulationEngine — orchestrates tick-based execution
class SimulationEngine {
  addNode(node: BaseNode): void
  connect(from: string, to: string, config?: EdgeConfig): void
  run(scenario: ScenarioConfig, emitter: SimulationEmitter): Promise<SimulationResult>
}
```

### Simulation Events (SSE Protocol)

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
```

Key differences from agent-orchestration-patterns:
- `request_flow` replaces `handoff` — tracks individual requests through the system
- `node_state_change` — new event for stateful patterns (circuit breaker states, saga steps)
- `metric` — real-time metric emissions (latency percentiles, throughput, error rate)
- `processing` — shows what a node is doing (replaces `chunk` — no text streaming needed)
- `error` includes `recoverable` flag — patterns handle retries differently

### Pattern Interface

```typescript
// Each pattern exports:
export const name: string;
export const description: string;
export function createSimulator(): PatternSimulator;

interface PatternSimulator {
  run(
    scenario: ScenarioConfig,
    emitter: SimulationEmitter
  ): Promise<{ result: SimulationResult; metrics: AggregateMetrics }>;
}

interface ScenarioConfig {
  requestCount: number;           // How many requests to simulate
  requestsPerSecond: number;      // Load level
  durationMs?: number;            // Max simulation duration
  failureInjection?: {            // Chaos engineering
    nodeFailures?: Record<string, number>;  // node → failure probability
    networkLatency?: Record<string, number>; // edge → added latency ms
    partitions?: string[][];       // network partition groups
  };
  seed?: number;                   // For reproducible simulations
}
```

### Frontend Visualization

The frontend uses **React Flow** for topology visualization:

```
┌─────────────────────────────────────────────────────────┐
│  Header: Design Patterns                                │
├────────────────────────────────┬────────────────────────┤
│                                │  Pattern Selector      │
│                                │  ─────────────────     │
│   Topology View                │  Scenario Presets      │
│   (React Flow)                 │  ─────────────────     │
│                                │  Control Panel         │
│   [Node]──→[Node]──→[Node]     │  - Load: ████░░ 60%   │
│      │         │               │  - Failures: OFF       │
│   [Node]    [Node]             │  - Duration: 10s       │
│                                │  ─────────────────     │
│                                │  Learn Tab             │
├────────────────────────────────┴────────────────────────┤
│  Metrics: p99=120ms  throughput=850rps  errors=0.1%     │
└─────────────────────────────────────────────────────────┘
```

Each node renders with:
- Name and role label
- Current state (color-coded: green=healthy, yellow=degraded, red=failed)
- Live metrics (request count, avg latency)
- Animation on request flow (edges pulse when requests travel)

### Evaluation System

Metric-based evaluation (no LLM-as-judge needed):

```typescript
interface EvalCriteria {
  name: string;                    // "latency_p99", "throughput", "error_rate"
  threshold: number;               // pass/fail boundary
  comparator: "lt" | "gt" | "eq"; // less than, greater than, equals
  weight: number;                  // importance in overall score
}

// Example eval dataset
{
  "name": "circuit-breaker-eval",
  "scenarios": [
    {
      "name": "healthy_traffic",
      "config": { "requestCount": 100, "requestsPerSecond": 10 },
      "criteria": [
        { "name": "error_rate", "threshold": 0.01, "comparator": "lt", "weight": 1 }
      ]
    },
    {
      "name": "backend_failure",
      "config": {
        "requestCount": 100,
        "requestsPerSecond": 10,
        "failureInjection": { "nodeFailures": { "backend": 0.5 } }
      },
      "criteria": [
        { "name": "circuit_open_time_ms", "threshold": 5000, "comparator": "lt", "weight": 1 },
        { "name": "recovery_time_ms", "threshold": 10000, "comparator": "lt", "weight": 1 }
      ]
    }
  ]
}
```

## Patterns

### Pattern Matrix

| Pattern | Concept | Nodes | Key Metric | Visualization Focus |
|---------|---------|-------|------------|-------------------|
| **Circuit Breaker** | Failure isolation via state machine | Client, Breaker, Backend | Recovery time, error rate | State transitions (Closed→Open→Half-Open) |
| **Saga** | Distributed tx with compensation | Orchestrator, 3-4 services | Completion rate, rollback count | Step-by-step commit/rollback flow |
| **CQRS** | Read/write separation + event sourcing | CommandService, EventStore, QueryService, ReadModel | Write latency, read latency, consistency lag | Dual data paths, event log |
| **Load Balancer** | Request distribution strategies | LB, 3-5 backend instances | Request spread, p99 latency | Algorithm comparison (RR, LC, hash) |
| **Pub/Sub** | Event-driven fan-out | Publisher, Broker, 3+ Subscribers | Delivery latency, fan-out factor | Topic routing, message flow |
| **Bulkhead** | Resource isolation | Gateway, 2-3 isolated pools | Pool utilization, isolation effectiveness | Resource pool boundaries |
| **Rate Limiter** | Throughput control | Client, Limiter, Backend | Accept/reject ratio, burst handling | Token bucket visualization |

### Scenario Presets (per pattern)

Each pattern includes 2-3 curated scenarios:

**Circuit Breaker:**
- "Healthy traffic" — all requests succeed, breaker stays closed
- "Backend failure" — 50% errors trigger breaker to open, then recover
- "Cascading failure" — multiple backends fail, test isolation

**Saga:**
- "Happy path" — all steps complete successfully
- "Mid-transaction failure" — step 3 fails, watch compensating actions
- "Timeout scenario" — slow service triggers timeout + rollback

**Load Balancer:**
- "Even load" — equal request distribution across backends
- "Hot instance" — one backend is slow, compare algorithms
- "Instance failure" — backend goes down mid-stream

## Server

Same architecture as agent-orchestration-patterns:

- Express 4, SSE streaming, port 3001
- Dynamic pattern loading via workspace imports
- `PATTERN_PACKAGES` array for registration
- SSE format: `data: ${JSON.stringify(event)}\n\n`
- Rate limiting, request logging, CORS
- Health check endpoint

### Routes

```
GET  /api/patterns              → list available patterns
POST /api/patterns/:name/run    → run simulation (SSE stream)
POST /api/evals/:name/run       → run eval suite
GET  /api/health                → health check
```

### Request Body (pattern run)

```json
{
  "scenario": {
    "requestCount": 50,
    "requestsPerSecond": 10,
    "failureInjection": {
      "nodeFailures": { "backend-1": 0.3 }
    },
    "seed": 42
  }
}
```

## Docker

Same multi-stage build approach:
- Server: `node:22-alpine` build → `node:22-slim` runtime
- Frontend: `node:22-alpine` build → `nginx:alpine` serve
- No Langfuse services (not needed — eval is metric-based)

## Verification Checklist

- [ ] `npm run typecheck` — zero errors
- [ ] `npm run test` — all pass
- [ ] `npm run dev` — server + frontend start
- [ ] Select any pattern → run simulation → topology animates
- [ ] Scenario presets work for each pattern
- [ ] Metrics panel shows live values during simulation
- [ ] Learn tab shows educational content per pattern
- [ ] `docker compose up` — both services healthy
- [ ] Eval endpoint returns metric scores per scenario
