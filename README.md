# Design Patterns

Interactive simulations of 7 system design and distribution patterns with a React frontend, SSE streaming, topology visualization, and metric-based evaluation.

## Patterns

| Pattern | Description | Nodes |
|---------|-------------|-------|
| 🔄 **Saga** | Distributed transactions with compensating rollbacks | orchestrator → order → payment → inventory → shipping |
| 📋 **CQRS** | Command/Query separation with event sourcing | command-svc → event-store → projector → read-model ← query-svc |
| ⚖️ **Load Balancer** | Round-robin request distribution across instances | lb → backend-1/2/3/4 |
| 📡 **Pub/Sub** | Event-driven fan-out with topic routing | publisher → broker → subscriber-1/2/3 |
| ⚡ **Circuit Breaker** | Failure isolation via Closed→Open→Half-Open state machine | client → breaker → backend |
| 🚧 **Bulkhead** | Isolated resource pools preventing cascade failures | gateway → pool-a/b/c → service-a/b/c |
| 🚦 **Rate Limiter** | Token bucket with burst handling and steady-state rate | limiter → backend |

## Quick Start

```bash
# Install dependencies
npm install

# Start dev servers (frontend :3000, server :3001)
npm run dev

# Or use Docker
docker compose up
```

## Architecture

```
packages/core/     → Simulation engine (BaseNode, SimulationClock, SeededRandom, MetricCollector, eval runner)
server/            → Express + SSE streaming, pattern loading, eval routes
frontend/          → React 19 + Vite + Tailwind v4 + React Flow
patterns/*/        → 7 pattern implementations (each with nodes, simulator, tests, eval scenarios)
```

### Simulation Engine

Every pattern is a `PatternSimulator` that creates nodes, wires them together, and runs requests through the topology:

- **BaseNode** — lifecycle events, latency simulation via `SimulationClock`, failure injection, capacity management
- **SimpleNode** — stateless request-response (extend `handleRequest()`)
- **SimulationClock** — virtual time (fast for tests) or real-time pacing (for visualization)
- **SeededRandom** — deterministic simulations with reproducible results

### Streaming Protocol

Simulations stream `SimulationEvent` objects via SSE:

```
node_start    → node appears in topology
processing    → node handles a request
request_flow  → request moves between nodes (edge animation)
node_state_change → state transition (color change)
metric        → numeric measurement
error         → failure event
node_end      → node finishes
done          → simulation complete with aggregate metrics
```

### Frontend

- **Left panel** — Educational content (When to Use, Architecture diagram, How It Works, Node Roles, Tradeoffs, Try-it scenarios)
- **Right panel** — React Flow topology with live node state colors, animated edges, metrics, event log
- **Bottom bar** — Pattern selector tabs

## Commands

```bash
npm install              # install all workspaces
npm run dev              # server + frontend concurrently
npm run dev:server       # server only (:3001)
npm run dev:frontend     # frontend only (:3000)
npm run build            # typecheck all workspaces
npm run typecheck        # typecheck all workspaces
npm run test             # run all tests (139 tests)
docker compose up        # server + frontend containers
```

## Project Structure

```
├── packages/core/          # Simulation engine, eval runner
│   └── src/
│       ├── node/           # BaseNode, SimpleNode
│       ├── simulation/     # SimulationClock, SeededRandom
│       ├── stream/         # SimulationEvent types
│       └── eval/           # MetricCollector, datasets, runEval
├── server/                 # Express API + SSE
│   └── src/
│       ├── routes/         # /api/patterns, /api/evals
│       ├── middleware/      # rate-limiter, request-logger
│       └── stream.ts       # SSESimulationEmitter
├── frontend/               # React + Vite + Tailwind
│   └── src/
│       ├── components/     # TopologyView, LearnView, EventLog, etc.
│       ├── hooks/          # useSimulation (SSE + state reducer)
│       └── data/           # Pattern educational content
├── patterns/
│   ├── circuit-breaker/    # 3 nodes, 15 tests
│   ├── saga/               # 5 nodes, 12 tests
│   ├── cqrs/               # 5 nodes, 11 tests
│   ├── load-balancer/      # 5 nodes, 11 tests
│   ├── pub-sub/            # 5 nodes, 8 tests
│   ├── bulkhead/           # 7 nodes, 7 tests
│   └── rate-limiter/       # 2 nodes, 10 tests
└── docs/                   # Architecture plan, step-by-step guides
```

## Tech Stack

- **Runtime**: Node.js 22, TypeScript 5.7 (strict ESM)
- **Frontend**: React 19, Vite 6, Tailwind CSS v4, React Flow, Mermaid
- **Server**: Express 4, SSE streaming
- **Testing**: Vitest
- **Containerization**: Docker, nginx
