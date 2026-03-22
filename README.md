# Design Patterns

Interactive system design pattern simulations with live topology visualization, real-time metrics streaming, and scenario-based evaluation.

Run it locally for the fully interactive experience, or check out the **live demo:** https://design-patterns.uid4oe.dev/

## Patterns

| Pattern | Description | When to Use |
|---------|-------------|-------------|
| **[Saga](patterns/saga/)** | Distributed transactions with compensating rollbacks | Multi-service workflows, order processing, eventual consistency |
| **[CQRS](patterns/cqrs/)** | Command/Query separation with event sourcing | Different read/write loads, event-driven systems, audit trails |
| **[Load Balancer](patterns/load-balancer/)** | Round-robin distribution across backend instances | Horizontal scaling, high availability, even resource utilization |
| **[Pub/Sub](patterns/pub-sub/)** | Event-driven fan-out with topic routing | Notification systems, microservice integration, real-time data |
| **[Circuit Breaker](patterns/circuit-breaker/)** | Failure isolation via Closed→Open→Half-Open state machine | Unreliable downstream services, cascade failure prevention |
| **[Bulkhead](patterns/bulkhead/)** | Isolated resource pools preventing cascade failures | Multi-tenant systems, varying service reliability, resource isolation |
| **[Rate Limiter](patterns/rate-limiter/)** | Token bucket with burst handling and steady-state rate | API rate limiting, traffic spike protection, fair resource allocation |

## Quick Start

```bash
git clone https://github.com/uid4oe/design-patterns.git
cd design-patterns

npm install
npm run dev
```

Open http://localhost:3000, select a pattern, and run a scenario.

## Docker

Pre-built images are available on [GitHub Packages](https://github.com/uid4oe/design-patterns/pkgs/container):

```bash
# Pull and run pre-built images (no build needed)
docker compose up

# Or build locally
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Server API | http://localhost:3001 |

## Tech Stack

- **TypeScript** with npm workspaces (monorepo)
- **Simulation engine** with `SimulationClock` (virtual time), `SeededRandom` (deterministic), `BaseNode` (lifecycle + failure injection)
- **Express** with Server-Sent Events (SSE) for real-time streaming
- **React 19** + Vite + Tailwind CSS v4 (light glassmorphism theme)
- **React Flow** for topology visualization
- **Mermaid** for architecture diagrams
- **Docker Compose** for containerized deployment

## Project Structure

```
design-patterns/
├── packages/core/       # Simulation engine, node classes, eval runner
├── server/              # Express server, SSE streaming, pattern + eval routes
├── frontend/            # React app — educational content + live topology
├── patterns/
│   ├── saga/            # Orchestrated transactions with reverse compensation
│   ├── cqrs/            # Dual read/write paths with event store + projector
│   ├── load-balancer/   # Round-robin across 4 backend instances
│   ├── pub-sub/         # Topic-based fan-out via message broker
│   ├── circuit-breaker/ # State machine: Closed → Open → Half-Open
│   ├── bulkhead/        # Gateway → isolated pools → backend services
│   └── rate-limiter/    # Token bucket with refill rate
├── docs/                # Architecture docs, implementation guides
└── docker-compose.yml
```

## Commands

```bash
npm run dev              # Start server + frontend concurrently
npm run dev:server       # Server only (:3001)
npm run dev:frontend     # Frontend only (:3000)
npm run typecheck        # TypeScript check all workspaces
npm run test             # Run all tests (vitest)
```
