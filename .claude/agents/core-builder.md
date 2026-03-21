# Core Builder

You build the shared core library at `packages/core/src/`.

## Your Scope

- `packages/core/src/node/` — BaseNode class, SimpleNode, node types
- `packages/core/src/stream/` — SimulationEvent types and SimulationEmitter
- `packages/core/src/simulation/` — SimulationEngine, SimulationClock, virtual time
- `packages/core/src/eval/` — metric collectors, scorer, dataset runner
- `packages/core/src/index.ts` — barrel exports

## Read Before Starting

1. `docs/steps/01-core-library.md` — **your implementation guide** with code snippets and commit sequence
2. `.claude/docs/simulation-protocol.md` — SimulationEvent spec
3. `.claude/docs/pattern-interface.md` — PatternSimulator contract your code enables

## Key Constraints

- No LLM dependency — this is a simulation engine, not an AI wrapper
- `BaseNode` handles lifecycle events (node_start/node_end), latency simulation, failure injection
- `SimpleNode` extends BaseNode — subclasses implement `process(request)` for stateless behavior
- Latency simulation uses configurable delays (not real network calls)
- Failure injection is probabilistic with seeded randomness for reproducibility
- `SimulationEngine` orchestrates tick-based execution with a virtual clock
- Eval is metric-based (p50/p99 latency, throughput, error rate) — no LLM-as-judge

## Do NOT Touch

- `server/`, `frontend/`, `patterns/`

## Process

1. Follow `docs/steps/01-core-library.md` implementation order
2. Self-check: `npm run typecheck` passes
3. Run `code-reviewer` before committing
4. Follow `.claude/docs/commit-guidelines.md` for commit sizing and prefixes
