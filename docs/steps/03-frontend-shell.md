# Step 3: Frontend Shell

**Agent:** `frontend-builder`
**Depends on:** Step 2 (server)
**Blocks:** nothing (patterns can be built in parallel)

## Overview

Build the React frontend with topology visualization, control panel, and metrics display. Uses React Flow for interactive node/edge rendering and SSE for real-time simulation updates.

## Implementation Order

### 3.1 Vite + Tailwind Setup

- `vite.config.ts` with React plugin, API proxy to :3001, Tailwind v4 plugin
- `index.html` with root div
- `main.tsx` mounting App
- `index.css` with Tailwind import and custom properties (dark theme)

**Commit:** `chore: configure Vite with React, Tailwind, and API proxy`

### 3.2 Frontend Types (`types.ts`)

```typescript
import type { SimulationEvent, AggregateMetrics, ScenarioConfig } from "@design-patterns/core";

export interface TopologyNode {
  id: string;
  role: string;
  state: "idle" | "active" | "healthy" | "degraded" | "failed";
  metrics?: { requests: number; avgLatencyMs: number; errors: number };
}

export interface TopologyEdge {
  from: string;
  to: string;
  active: boolean;
  requestCount: number;
}

export interface SimulationState {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  metrics: AggregateMetrics | null;
  isRunning: boolean;
  error: string | null;
  events: SimulationEvent[];
}
```

**Commit:** `feat: add frontend types for topology and simulation state`

### 3.3 useSimulation Hook (`hooks/useSimulation.ts`)

- Sends POST to `/api/patterns/{name}/run` with ScenarioConfig body
- Reads SSE stream via `fetch` + `ReadableStream`
- Parses SSE lines, dispatches SimulationEvents via reducer
- Reducer handles: node_start → add node, request_flow → activate edge, node_state_change → update node state, metric → update metrics, done → stop
- Returns: simulationState, run(scenario), reset()

Export `parseSSELines` and `reduceEvent` as pure functions for testability.

**Commit:** `feat: add useSimulation SSE streaming hook`

### 3.4 Leaf Components

- `PatternSelector.tsx` — dropdown for pattern selection
- `ScenarioPresets.tsx` — preset buttons per pattern (like try-it prompts)
- `MetricsPanel.tsx` — displays live p50, p99, throughput, error rate
- `MermaidDiagram.tsx` — renders mermaid syntax diagrams
- `CollapsibleSection.tsx` — accordion for Learn sections

**Commit:** `feat: add PatternSelector, MetricsPanel, and utility components`

### 3.5 Topology Components

- `NodeRenderer.tsx` — React Flow custom node: name, role, state color, mini metrics
- `EdgeRenderer.tsx` — React Flow custom edge: animated when active, request count label
- `TopologyView.tsx` — React Flow canvas with auto-layout, renders nodes + edges from state

**Commit:** `feat: add TopologyView with React Flow node and edge renderers`

### 3.6 Control Panel

- `ControlPanel.tsx` — scenario configuration UI:
  - Request count slider (1-200)
  - Requests per second slider (1-50)
  - Failure injection toggles per node
  - Network latency sliders
  - Seed input (optional)
  - Run / Reset buttons

**Commit:** `feat: add ControlPanel for scenario configuration`

### 3.7 Learn View

- `LearnView.tsx` — educational content per pattern:
  - Overview, when to use, architecture diagram, how it works, tradeoffs
  - Scenario preset buttons

**Commit:** `feat: add LearnView for educational content`

### 3.8 App Layout (`App.tsx`)

- Header with title
- Two-column layout: TopologyView (left) + RightPanel (right)
- Bottom bar: MetricsPanel
- State management: selectedPattern, scenarioConfig, simulationState

**Commit:** `feat: add App layout with topology, controls, and metrics`

### 3.9 Tests

- `useSimulation.test.ts` — SSE parsing, event reduction, state updates
- Component tests for key interactions

**Commit:** `test: add frontend tests`

## Done When

- [ ] `npm run dev:frontend` starts on :3000
- [ ] Pattern selector shows available patterns from server
- [ ] Control panel renders with sliders and buttons
- [ ] TopologyView renders placeholder nodes
- [ ] Metrics panel shows zeroed values
- [ ] UI has dark theme with glass morphism style
