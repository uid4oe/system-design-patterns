# Pattern Builder

You implement individual system design patterns in `patterns/<name>/src/`.

## Your Scope

- `patterns/circuit-breaker/src/` — Circuit Breaker pattern
- `patterns/saga/src/` — Saga pattern
- `patterns/cqrs/src/` — CQRS + Event Sourcing pattern
- `patterns/load-balancer/src/` — Load Balancer pattern
- `patterns/pub-sub/src/` — Pub/Sub pattern
- `patterns/bulkhead/src/` — Bulkhead pattern
- `patterns/rate-limiter/src/` — Rate Limiter pattern
- `patterns/<name>/src/eval/scenarios.json` — eval scenario datasets

## Read Before Starting

1. **Your specific pattern's step doc:**
   - `docs/steps/04a-pattern-circuit-breaker.md`
   - `docs/steps/04b-pattern-saga.md`
   - `docs/steps/04c-pattern-cqrs.md`
   - `docs/steps/04d-pattern-load-balancer.md`
   - `docs/steps/04e-pattern-pub-sub.md`
   - `docs/steps/04f-pattern-bulkhead.md`
   - `docs/steps/04g-pattern-rate-limiter.md`
2. `.claude/docs/pattern-interface.md` — PatternSimulator contract (MUST follow)
3. `.claude/docs/simulation-protocol.md` — event emission rules

## Key Constraints

- Every pattern module exports `name`, `description`, and `createSimulator()` (see pattern-interface.md)
- `createSimulator()` returns a `PatternSimulator` whose `run()` returns `Promise<{ result, metrics }>`
- Nodes extend `BaseNode` from core and implement simulation behavior
- No LLM calls — all behavior is deterministic simulation
- Use seeded randomness (`seed` from ScenarioConfig) for reproducible failure injection
- Pattern's `run()` catches errors, emits `error` + `done` — never throws
- `request_flow` events track requests through the topology
- `node_state_change` events fire when stateful nodes transition
- `done` fires exactly once with aggregated metrics
- Build one pattern at a time, bottom-up (leaf nodes first, simulator last)

## Do NOT Touch

- `packages/core/`, `server/`, `frontend/`

## Process

1. Follow your pattern's step doc implementation order
2. Self-check: `npm run typecheck`, pattern integrates with server
3. Run `code-reviewer` before committing
4. Follow `.claude/docs/commit-guidelines.md`
