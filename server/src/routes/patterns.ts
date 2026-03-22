import { Router } from "express";
import type { PatternSimulator, ScenarioConfig } from "@system-design-patterns/core";
import { SSESimulationEmitter } from "../stream.js";

export interface LoadedPattern {
  name: string;
  description: string;
  simulator: PatternSimulator;
}

export function createPatternRoutes(
  patterns: Map<string, LoadedPattern>,
): Router {
  const router = Router();

  // GET / — list available patterns
  router.get("/", (_req, res) => {
    const list = Array.from(patterns.values()).map((p) => ({
      name: p.name,
      description: p.description,
    }));
    res.json(list);
  });

  // POST /:name/run — execute pattern simulation (SSE stream)
  router.post("/:name/run", async (req, res) => {
    const { name } = req.params;
    const pattern = name ? patterns.get(name) : undefined;

    if (!pattern) {
      res.status(404).json({ error: `Pattern "${name ?? ""}" not found` });
      return;
    }

    const scenario = req.body?.scenario as ScenarioConfig | undefined;

    if (
      !scenario ||
      typeof scenario.requestCount !== "number" ||
      scenario.requestCount <= 0 ||
      typeof scenario.requestsPerSecond !== "number" ||
      scenario.requestsPerSecond <= 0
    ) {
      res.status(400).json({
        error:
          "Invalid scenario: requestCount and requestsPerSecond must be positive numbers",
      });
      return;
    }

    const emitter = new SSESimulationEmitter(res);

    try {
      await pattern.simulator.run(scenario, emitter);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emitter.emit({
        type: "error",
        node: "system",
        message,
        recoverable: false,
      });
      emitter.emit({
        type: "done",
        totalDurationMs: 0,
        aggregateMetrics: {
          totalRequests: 0,
          successCount: 0,
          errorCount: 0,
          p50LatencyMs: 0,
          p99LatencyMs: 0,
          throughputRps: 0,
        },
      });
    }
  });

  return router;
}
