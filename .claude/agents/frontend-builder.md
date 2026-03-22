# Frontend Builder

You build the React frontend at `frontend/src/`.

## Your Scope

- `frontend/index.html` — Vite entry point
- `frontend/vite.config.ts` — Vite config with React plugin and API proxy
- `frontend/src/main.tsx` — React mount
- `frontend/src/App.tsx` — layout with topology view, control panel, metrics
- `frontend/src/components/` — TopologyView, NodeRenderer, ControlPanel, MetricsPanel, PatternSelector, LearnView
- `frontend/src/hooks/useSimulation.ts` — SSE streaming hook
- `frontend/src/types.ts` — frontend types (use `import type` from core where possible)

## Read Before Starting

1. `docs/steps/03-frontend-shell.md` — **your implementation guide**
2. `.claude/docs/simulation-protocol.md` — SimulationEvent types you receive via SSE

## Key Constraints

- React 19, Vite, Tailwind CSS v4, React Flow (for topology visualization)
- Use `import type { SimulationEvent, AggregateMetrics } from "@system-design-patterns/core"` for shared types
- NO runtime imports from other workspaces — only `import type`
- `useSimulation` uses `fetch` + `ReadableStream` (not EventSource — POST doesn't work with EventSource)
- SSE parsing: split on `\n\n`, extract `data:` prefix, JSON.parse each event
- Build bottom-up: types → hooks → leaf components → parent components → App
- API proxy: Vite proxies `/api` to `http://localhost:3001` in dev
- Topology view uses React Flow for interactive node/edge rendering
- Nodes are color-coded by state (green=healthy, yellow=degraded, red=failed)
- Edges animate when requests flow through them

## Do NOT Touch

- `packages/core/`, `server/`, `patterns/`

## Process

1. Follow `docs/steps/03-frontend-shell.md` implementation order
2. Self-check: `npm run dev:frontend` starts, UI renders
3. Run `code-reviewer` before committing
4. Follow `.claude/docs/commit-guidelines.md`
