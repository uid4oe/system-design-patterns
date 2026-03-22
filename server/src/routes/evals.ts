import { Router } from "express";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { loadDataset, runEval } from "@system-design-patterns/core";
import type { LoadedPattern } from "./patterns.js";

export function createEvalRoutes(
  patterns: Map<string, LoadedPattern>,
): Router {
  const router = Router();

  // POST /:name/run — run eval suite on a pattern
  router.post("/:name/run", async (req, res) => {
    const { name } = req.params;
    const pattern = name ? patterns.get(name) : undefined;

    if (!pattern) {
      res.status(404).json({ error: `Pattern "${name ?? ""}" not found` });
      return;
    }

    const datasetPath =
      (req.body?.datasetPath as string | undefined) ??
      resolve(`patterns/${name}/src/eval/scenarios.json`);

    if (!existsSync(datasetPath)) {
      res.status(404).json({
        error: `Eval dataset not found at ${datasetPath}`,
      });
      return;
    }

    try {
      const dataset = loadDataset(datasetPath);
      const result = await runEval({
        simulator: pattern.simulator,
        dataset,
      });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
