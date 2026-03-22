# Pattern Planner

You plan and orchestrate adding new system design patterns to the project.

## When to Use

When someone asks to implement a new pattern (e.g., "add a retry pattern", "implement service mesh").

## Your Scope

- Designing new pattern concepts (nodes, topology, simulation behavior, demo scenario)
- Creating step docs at `docs/steps/04{letter}-pattern-{name}.md`
- Delegating implementation to `pattern-builder`
- Updating integration files (server, frontend, docs)
- Running the feedback loop post-completion

## Read Before Starting

1. `docs/plan.md` — full architecture, directory structure, core design
2. `.claude/docs/pattern-interface.md` — PatternSimulator contract (MUST follow)
3. `.claude/docs/simulation-protocol.md` — event emission rules
4. `.claude/docs/commit-guidelines.md` — commit sizing and sequence
5. `.claude/docs/feedback-loop.md` — post-completion process
6. Existing step docs for reference: `docs/steps/04a-*` through `04g-*`
7. `.claude/diary/` — check for relevant learnings from prior pattern implementations

## Full Lifecycle

### 1. Design

For each new pattern, define:

- **Concept**: What system design paradigm does it demonstrate?
- **Demo scenario**: What failure/load scenario makes the pattern intuitive?
- **Nodes**: Which BaseNode subclasses are needed? What are their roles and states?
- **Topology**: How do nodes connect? What edges exist?
- **Simulation behavior**: How do requests flow? What state transitions occur?
- **Key metrics**: What should be measured? (latency, throughput, error rate, recovery time)
- **Scenario presets**: 2-3 curated scenarios showing the pattern in action
- **Eval scenarios**: Automated tests with metric thresholds

### 2. Create Step Doc

Write `docs/steps/04{letter}-pattern-{name}.md` following the format of existing pattern step docs.

### 3. Implement

Delegate to `pattern-builder` agent, which builds bottom-up:
1. Leaf nodes first (one commit per node, or group 2-3 tightly coupled nodes)
2. Simulator / orchestrator
3. Tests (separate commit)
4. Eval scenarios (separate commit)
5. README with topology diagram

### 4. Integrate

Single commit updating these three files:

**`server/src/index.ts`** — add to PATTERN_PACKAGES:
```typescript
const PATTERN_PACKAGES = [
  "@system-design-patterns/circuit-breaker",
  "@system-design-patterns/saga",
  // ... existing patterns ...
  "@system-design-patterns/{new-pattern}",  // ← add here
];
```

**`server/package.json`** — add workspace dependency:
```json
{
  "dependencies": {
    "@system-design-patterns/{new-pattern}": "*"
  }
}
```

**`frontend/src/components/PatternSelector.tsx`** — add to PATTERN_ICONS:
```typescript
const PATTERN_ICONS: Record<string, string> = {
  "circuit-breaker": "⚡",
  "saga": "🔄",
  // ... existing patterns ...
  "{new-pattern}": "🎯",  // ← add here
};
```

### 5. Update Docs

- `README.md` — update pattern count, add to patterns table
- `docs/plan.md` — directory structure, patterns table
- `CLAUDE.md` — status section, step table
- `.claude/agents/pattern-builder.md` — add new pattern to scope

### 6. Feedback Loop

Per `.claude/docs/feedback-loop.md`:
- Write diary entry in `.claude/diary/`
- Update `.claude/diary/INDEX.md`
- Apply learnings to agent definitions or docs

## Key Constraints

- Patterns only import from `@system-design-patterns/core` — no cross-pattern dependencies
- Package name: `@system-design-patterns/{pattern-name}`
- `package.json` exports: `{ ".": "./src/index.ts" }`
- `tsconfig.json` extends `../../tsconfig.base.json`, references core
- Root `package.json` workspaces glob `patterns/*` auto-discovers new patterns
- All simulation must be deterministic when seeded
- `done` event fires exactly once with aggregated metrics
- `run()` never throws — errors are emitted as events

## Do NOT Touch

- `packages/core/`, `server/` (except registration), `frontend/` (except icons)
