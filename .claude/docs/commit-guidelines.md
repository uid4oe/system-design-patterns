# Commit Guidelines

## Commit Sizing

Commits should be **atomic and reviewable** — small enough to understand in one read, large enough to be a coherent unit of work.

### Rules

1. **One logical change per commit.** A "logical change" is a single concern: one type definition, one module, one route, one component.

2. **Parent and child components go in separate commits.** If you build `TopologyView.tsx` and its child `NodeRenderer.tsx`, commit `NodeRenderer.tsx` first, then `TopologyView.tsx` in the next commit. Bottom-up: dependencies before dependents.

3. **Tests are always committed separately.** Never bundle test files with implementation files. The test commit should follow immediately after the implementation it tests.

4. **Types/interfaces go in their own commit** when they define a shared contract (e.g., `SimulationEvent`, `PatternSimulator`, `NodeConfig`). If a type is only used in one file, it can go with that file.

5. **Config files can be grouped.** `package.json`, `tsconfig.json`, `.env.example`, and similar config for the same workspace can go in one commit.

6. **Refactors are separate from features.** If you need to restructure existing code to support a new feature, commit the refactor first, then the feature.

### Commit Message Format

Use **conventional commit** prefixes:

```
<type>: <imperative description>

<optional body: why this change was made, any non-obvious decisions>
```

**Types:**
- `feat:` — new feature or functionality
- `fix:` — bug fix
- `refactor:` — code restructuring without behavior change
- `test:` — adding or updating tests
- `chore:` — config, tooling, deps, CI, build
- `docs:` — documentation only

**Examples:**
- `feat: add SimulationEvent and NodeMetrics types`
- `feat: implement circuit breaker state machine`
- `feat: add load balancer with round-robin strategy`
- `test: add tests for circuit breaker state transitions`
- `chore: configure Vite with React plugin and Tailwind`
- `fix: handle race condition in concurrent request simulation`
- `docs: add circuit breaker README with state diagram`
- `refactor: extract metric collection from BaseNode into MetricCollector`

### Good Commit Sequence (example: Circuit Breaker pattern)

```
1. feat: add circuit breaker node with state machine
2. feat: add client and backend nodes for circuit breaker
3. feat: add circuit breaker simulator and PatternSimulator export
4. test: add tests for circuit breaker state transitions
5. chore: add circuit breaker eval scenarios
```

### Good Commit Sequence (example: Core library)

```
1. feat: add simulation event types and node interfaces
2. feat: implement BaseNode with lifecycle events and latency simulation
3. feat: implement SimulationEngine with tick-based execution
4. feat: add metric collectors and eval utilities
5. feat: add core barrel exports
6. test: add tests for core library
```

## Git Best Practices

### History
- Never force push — treat history as append-only
- Never rewrite published commits
- If you need to undo, use `git revert` not `git reset --hard`
- Don't amend commits that have been pushed

### Before Committing
- Run `npm run typecheck` — no type errors
- Review the diff yourself — no debug logs, no TODO comments, no unrelated changes
- Stage specific files, not `git add .`

### When in Doubt

Ask: "If I had to revert this commit, would it undo exactly one thing?" If yes, the commit is the right size.
