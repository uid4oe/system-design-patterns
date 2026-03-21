# Step 2: Server

**Agent:** `server-builder`
**Depends on:** Step 1 (core library)
**Blocks:** Step 3 (frontend), Steps 4a-4g (patterns need server to test)

## Overview

Build the Express API server that loads patterns, serves SSE streams, and runs evaluations. Same architecture as agent-orchestration-patterns but with `ScenarioConfig` replacing string input.

## Implementation Order

### 2.1 SSESimulationEmitter (`stream.ts`)

- Implements `SimulationEmitter` from core
- Constructor takes Express `Response` object
- Sets SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- `emit(event)` writes `data: ${JSON.stringify(event)}\n\n`
- On `done` event: clears heartbeat, ends response
- Heartbeat: sends `:heartbeat\n\n` every 15 seconds
- Handles client disconnect: listens for `res.on("close")`, stops emitting

**Commit:** `feat: add SSESimulationEmitter for streaming events`

### 2.2 Pattern Routes (`routes/patterns.ts`)

- `GET /` — Returns array of `{ name, description }` for all loaded patterns
- `POST /:name/run` — Executes pattern simulation:
  - Validates `scenario` in request body (requestCount > 0, requestsPerSecond > 0)
  - Creates SSESimulationEmitter over response
  - Calls `simulator.run(scenario, emitter)`
  - Catches errors, emits error + done events

**Commit:** `feat: add pattern list and run routes`

### 2.3 Eval Routes (`routes/evals.ts`)

- `POST /:name/run` — Runs eval suite:
  - Accepts optional `datasetPath` in request body
  - Auto-resolves dataset: `patterns/{name}/src/eval/scenarios.json`
  - Calls `runEval()` from core
  - Returns JSON `EvalResult`

**Commit:** `feat: add eval route for metric-based scoring`

### 2.4 Server Entry (`index.ts`)

- Load env vars via `dotenv`
- Dynamically import all patterns from `PATTERN_PACKAGES`
- Create Express app with CORS, JSON body parser
- Rate limiting (20 requests per 60 seconds)
- Request logging middleware
- Mount routes: `/api/patterns`, `/api/evals`, `/api/health`
- Error handler middleware
- Listen on `SERVER_PORT` (default 3001)

**Commit:** `feat: add Express server with pattern loading and middleware`

### 2.5 Tests

- `stream.test.ts` — SSE format, heartbeat, disconnect handling
- `patterns.test.ts` — pattern list, run endpoint, error handling
- `evals.test.ts` — eval execution, dataset resolution

**Commit:** `test: add server tests`

## Done When

- [ ] `npm run dev:server` starts on :3001
- [ ] `GET /api/patterns` returns empty array (no patterns yet)
- [ ] `GET /api/health` returns 200
- [ ] SSE format is correct (`data: {...}\n\n`)
- [ ] Client disconnect doesn't crash server
