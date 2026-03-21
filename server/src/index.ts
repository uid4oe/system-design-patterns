import "dotenv/config";
import express from "express";
import cors from "cors";
import { createPatternRoutes } from "./routes/patterns.js";
import { createEvalRoutes } from "./routes/evals.js";
import { requestLogger } from "./middleware/request-logger.js";
import { rateLimiter } from "./middleware/rate-limiter.js";
import type { LoadedPattern } from "./routes/patterns.js";

const PATTERN_PACKAGES: string[] = [
  "@design-patterns/circuit-breaker",
  "@design-patterns/saga",
  "@design-patterns/cqrs",
  // "@design-patterns/load-balancer",
  // "@design-patterns/pub-sub",
  // "@design-patterns/bulkhead",
  // "@design-patterns/rate-limiter",
];

async function loadPatterns(): Promise<Map<string, LoadedPattern>> {
  const patterns = new Map<string, LoadedPattern>();

  for (const pkg of PATTERN_PACKAGES) {
    try {
      const mod = (await import(pkg)) as {
        name: string;
        description: string;
        createSimulator: () => import("@design-patterns/core").PatternSimulator;
      };
      patterns.set(mod.name, {
        name: mod.name,
        description: mod.description,
        simulator: mod.createSimulator(),
      });
      console.log(`Loaded pattern: ${mod.name}`);
    } catch (err) {
      console.warn(
        `Failed to load pattern ${pkg}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return patterns;
}

async function main(): Promise<void> {
  const port = parseInt(process.env["SERVER_PORT"] ?? "3001", 10);
  const frontendUrl = process.env["FRONTEND_URL"] ?? "http://localhost:3000";

  const patterns = await loadPatterns();
  console.log(`Loaded ${patterns.size} patterns`);

  const app = express();

  app.use(cors({ origin: frontendUrl }));
  app.use(express.json());
  app.use(requestLogger);
  app.use(rateLimiter);

  app.use("/api/patterns", createPatternRoutes(patterns));
  app.use("/api/evals", createEvalRoutes(patterns));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", patterns: patterns.size });
  });

  // Global error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error("Unhandled error:", err.message);
      res.status(500).json({ error: "Internal server error" });
    },
  );

  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

main().catch(console.error);
