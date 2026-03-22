# Design Patterns

Educational repo: system design & distribution patterns with interactive simulations, React frontend, SSE streaming, real-time topology visualization, metric-based evaluation, and Docker.

## Start Here

1. `docs/plan.md` — full architecture, directory structure, core design
2. `docs/steps/` — step-by-step implementation guides (start with `01-core-library.md`)
3. `.claude/docs/` — technical specs (simulation protocol, pattern interface, commit guidelines)
4. `.claude/agents/` — specialized agent roles
5. `.claude/diary/` — self-improvement diary (evolution log)
6. `.claude/docs/feedback-loop.md` — feedback loop process

## Implementation Steps

Steps 4a-4g can run **in parallel** once steps 1-2 are done.

| Step | Doc | Agent |
|------|-----|-------|
| 1. Core Library | `docs/steps/01-core-library.md` | `core-builder` |
| 2. Server | `docs/steps/02-server.md` | `server-builder` |
| 3. Frontend Shell | `docs/steps/03-frontend-shell.md` | `frontend-builder` |
| **4a. Circuit Breaker** | `docs/steps/04a-pattern-circuit-breaker.md` | `pattern-builder` |
| **4b. Saga** | `docs/steps/04b-pattern-saga.md` | `pattern-builder` |
| **4c. CQRS** | `docs/steps/04c-pattern-cqrs.md` | `pattern-builder` |
| **4d. Load Balancer** | `docs/steps/04d-pattern-load-balancer.md` | `pattern-builder` |
| **4e. Pub/Sub** | `docs/steps/04e-pattern-pub-sub.md` | `pattern-builder` |
| **4f. Bulkhead** | `docs/steps/04f-pattern-bulkhead.md` | `pattern-builder` |
| **4g. Rate Limiter** | `docs/steps/04g-pattern-rate-limiter.md` | `pattern-builder` |
| 5. Eval System | `docs/steps/05-eval-system.md` | `core-builder` + `server-builder` |
| 6. Docker | `docs/steps/06-docker.md` | `docker-builder` |
| 7. Documentation | `docs/steps/07-documentation.md` | `docs-builder` |
| 8. Educational Content | `docs/steps/08-educational-content.md` | `frontend-builder` |

```
Step 1 ──→ Step 2 ──→ Step 3
                │
                ├──→ 4a: Circuit Breaker ──┐
                ├──→ 4b: Saga             ──┤
                ├──→ 4c: CQRS             ──┤ parallel
                ├──→ 4d: Load Balancer    ──┤
                ├──→ 4e: Pub/Sub          ──┤
                ├──→ 4f: Bulkhead         ──┤
                └──→ 4g: Rate Limiter     ──┘
                                            │
                Step 5: Eval  ←─────────────┘
                Step 6: Docker
                Step 7: Docs
                Step 8: Educational Content
```

## New Feature Workflow

The global planning rule applies. Additionally for this project:

- **Read `docs/plan.md`** and the relevant `docs/steps/` guide before planning
- **New npm dependencies** require explicit plan approval — prefer what's already in the workspace
- **Prefer incremental changes** over rewrites — extend existing components, don't replace them
- **Use the right agent** for the scope (see Agent Team table below)
- After plan approval: implement → self-check → code-reviewer → commit → feedback loop

## Code Review Process

**Every implementation MUST be reviewed before committing.** This is non-negotiable.

### Workflow

```
1. Implement  →  2. Self-check  →  3. Run code-reviewer  →  4. Fix issues  →  5. Commit  →  6. Feedback loop
```

### Feedback Loop (after each step)

After completing each implementation step, run the feedback loop (`.claude/docs/feedback-loop.md`):
1. **Reflect** — what worked, what surprised, what went wrong
2. **Record** — write diary entry in `.claude/diary/`
3. **Update** — apply learnings to agent definitions and docs
4. **Link** — update `.claude/diary/INDEX.md`

This is how the system improves over time. `git log .claude/diary/` shows the full evolution.

### Self-check (before calling code-reviewer)
- `npm run typecheck` passes
- `npm run test` passes (if tests exist)
- No debug logs, no TODO comments, no unrelated changes in the diff
- Commit is scoped to one logical module (see commit guidelines)

### Code-reviewer checks
Use the `code-reviewer` agent. It validates against:
- Architecture compliance (workspace boundaries, correct imports)
- Simulation protocol compliance (event ordering, required fields)
- Pattern interface compliance (PatternSimulator contract)
- Code quality (no `any`, no unused code, no default exports)
- Commit quality (atomic, correct prefix, tests separate)

### When to review
- After implementing each sub-step within a step doc
- Before every `git commit`
- After fixing code-reviewer feedback (re-review the fixes)

## Agent Team

| Agent | Scope |
|-------|-------|
| `core-builder` | `packages/core/` — simulation engine, BaseNode, stream types, eval |
| `server-builder` | `server/` — Express, SSE, routes |
| `pattern-planner` | Plans new patterns: step docs, node design, integration |
| `pattern-builder` | `patterns/*/` — all system design patterns |
| `frontend-builder` | `frontend/` — React, components, hooks, topology visualization |
| `docker-builder` | Dockerfiles, docker-compose |
| `docs-builder` | READMEs, architecture docs |
| `code-reviewer` | Reviews all code before commits |

## Adding a New Pattern

Use the `pattern-planner` agent (`.claude/agents/pattern-planner.md`). It handles the full lifecycle:

1. Design pattern concept, nodes, simulator, demo scenario
2. Create step doc at `docs/steps/04{x}-pattern-{name}.md` (follow 04a-04g format)
3. Implement via `pattern-builder` (leaf nodes → simulator → tests → eval → README)
4. Register in server (`PATTERN_PACKAGES`) + frontend (`PATTERN_ICONS`)
5. Update `docs/plan.md`, `CLAUDE.md` status, `.claude/agents/pattern-builder.md` scope
6. Run feedback loop: diary entry + INDEX update

## Workspace Boundaries

```
packages/core/  →  imports nothing from other workspaces
server/         →  imports from core + patterns
patterns/*/     →  imports from core only
frontend/       →  type-only imports from core allowed (import type { ... })
                   NO runtime imports from other workspaces
```

## Code Standards

- **TypeScript:** strict, no `any`, no `as` casts, no `enum` (use unions), named exports only
- **ESM:** `"type": "module"` everywhere. `.js` extensions in core/server/patterns (NodeNext). `.ts`/`.tsx` in frontend (bundler mode).
- **Style:** kebab-case files, PascalCase classes/interfaces, camelCase functions
- **Errors:** nodes emit `SimulationEvent` errors, never throw unhandled. Server catches all. Use `err instanceof Error ? err.message : String(err)`.
- **Nodes:** Use `SimpleNode` (from core) for stateless nodes. Only extend `BaseNode` directly when custom simulation logic is needed.
- **Streaming:** non-negotiable — all simulation events must stream in real-time
- **Security:** validate user input, no `eval()`
- **Testing:** vitest, test behavior not implementation
- **Simulation:** deterministic by default — use seeded randomness for reproducible scenarios

## Commit Rules

See `.claude/docs/commit-guidelines.md`. Key rules:

- **Conventional prefixes required:** `feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`
- **Tests in separate commits** from implementation
- **One logical module per commit** — but a module can span 2-3 tightly coupled files
- **Never add "Co-Authored-By"** lines
- **No force pushing**

## Commands

```bash
npm install                              # install all workspaces
npm run dev                              # server + frontend concurrently
npm run dev:server                       # server only (:3001)
npm run dev:frontend                     # frontend only (:3000)
npm run typecheck                        # typecheck all workspaces
npm run test                             # run all tests
docker compose up                        # server + frontend
```

## Status

- [x] Scaffold (root config, dirs, package.json files)
- [x] Step 1: Core Library (42 tests — SeededRandom, SimulationClock, BaseNode, SimpleNode, MetricCollector, eval runner)
- [x] Step 2: Server (11 tests — SSE streaming, pattern routes, rate limiter)
- [x] Step 3: Frontend Shell (11 tests — SSE parsing, event reduction, React Flow topology)
- [x] Step 4a: Circuit Breaker Pattern (15 tests — state machine path verification, fast-fail, probe mechanics)
- [x] Step 4b: Saga Pattern (12 tests — orchestrated compensation, reverse ordering, rollback metrics)
- [x] Step 4c: CQRS Pattern (11 tests — dual read/write paths, event store, projection lag, failure propagation)
- [x] Step 4d: Load Balancer Pattern (11 tests — round-robin distribution, failure detection, consistent hash, spread metrics)
- [x] Step 4e: Pub/Sub Pattern (8 tests — fan-out delivery, topic filtering, consumer group round-robin, failure handling)
- [x] Step 4f: Bulkhead Pattern (7 tests — pool isolation, rejection, gateway routing, cascade prevention)
- [x] Step 4g: Rate Limiter Pattern (10 tests — token bucket, burst, refill, accept/reject ratio)
- [~] Step 5: Eval System (skipped — eval runner + datasets already in core)
- [x] Step 6: Docker (server + frontend Dockerfiles, compose, nginx SSE proxy)
- [x] Step 7: Documentation (README with architecture, commands, project structure)
- [x] Step 8: Educational Content (LearnView with 7 pattern contents, Mermaid diagrams, Try-it scenarios)
