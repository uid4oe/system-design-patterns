# Pattern Package Template

When creating a new pattern, use these boilerplate files as a starting point.

## `patterns/{name}/package.json`

```json
{
  "name": "@design-patterns/{name}",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@design-patterns/core": "*"
  }
}
```

## `patterns/{name}/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../../packages/core" }
  ]
}
```

## `patterns/{name}/src/index.ts`

```typescript
import type { PatternSimulator, ScenarioConfig, SimulationEmitter, AggregateMetrics, SimulationResult } from "@design-patterns/core";

export const name = "{name}";
export const description = "{one-line description}";

export function createSimulator(): PatternSimulator {
  return {
    async run(scenario: ScenarioConfig, emitter: SimulationEmitter) {
      const metrics: AggregateMetrics = {
        totalRequests: 0, successCount: 0, errorCount: 0,
        p50LatencyMs: 0, p99LatencyMs: 0, throughputRps: 0,
      };
      const startTime = Date.now();

      try {
        // 1. Create nodes
        // 2. Emit node_start for all nodes
        // 3. Run simulation loop
        // 4. Collect metrics
      } catch (err) {
        emitter.emit({ type: "error", node: "system", message: err instanceof Error ? err.message : String(err), recoverable: false });
      } finally {
        emitter.emit({ type: "done", totalDurationMs: Date.now() - startTime, aggregateMetrics: metrics });
      }

      return { result: { totalDurationMs: Date.now() - startTime, requestResults: [] }, metrics };
    },
  };
}
```

## Directory Structure

```
patterns/{name}/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts              # Exports name, description, createSimulator
    ├── nodes/
    │   ├── {node-1}.ts       # Extends BaseNode or SimpleNode
    │   ├── {node-2}.ts
    │   └── ...
    ├── __tests__/
    │   └── {name}.test.ts
    └── eval/
        └── scenarios.json    # Eval scenario dataset
```

## After Creating

1. Run `npm install` to link the new workspace
2. Add to `tsconfig.json` root references: `{ "path": "patterns/{name}" }`
3. Register in server (see pattern-planner.md § Integrate)
