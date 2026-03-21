# Step 5: Eval System

**Agent:** `core-builder` + `server-builder`
**Depends on:** Steps 1-4 (core + server + at least one pattern)

## Overview

Wire up the metric-based evaluation system. Each pattern has eval scenarios with metric thresholds. The eval runner executes scenarios, collects metrics, and scores against criteria. No LLM needed — all evaluation is deterministic metric comparison.

## Implementation Order

### 5.1 Eval Route Integration
- Server's `/api/evals/:name/run` endpoint resolves `patterns/{name}/src/eval/scenarios.json`
- Calls `runEval()` from core with pattern simulator and dataset
- Returns JSON result with per-scenario scores

### 5.2 Eval Result UI (optional)
- Frontend displays eval results in a table (scenario name, pass/fail, metric values)

## Done When
- [ ] `POST /api/evals/circuit-breaker/run` returns scored results
- [ ] All eval scenarios for implemented patterns pass
