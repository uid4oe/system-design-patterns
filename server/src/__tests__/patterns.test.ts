import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createPatternRoutes } from "../routes/patterns.js";
import type { LoadedPattern } from "../routes/patterns.js";
import type { PatternSimulator } from "@system-design-patterns/core";

function createMockPattern(name: string): LoadedPattern {
  const simulator: PatternSimulator = {
    async run(_scenario, emitter) {
      emitter.emit({ type: "node_start", node: "test", role: "tester" });
      const metrics = {
        totalRequests: 1, successCount: 1, errorCount: 0,
        p50LatencyMs: 10, p99LatencyMs: 10, throughputRps: 100,
      };
      emitter.emit({ type: "done", totalDurationMs: 10, aggregateMetrics: metrics });
      return { result: { totalDurationMs: 10, requestResults: [] }, metrics };
    },
  };
  return { name, description: `${name} pattern`, simulator };
}

function createApp(patterns: Map<string, LoadedPattern>) {
  const app = express();
  app.use(express.json());
  app.use("/api/patterns", createPatternRoutes(patterns));
  return app;
}

describe("Pattern routes", () => {
  it("GET / returns list of patterns", async () => {
    const patterns = new Map<string, LoadedPattern>();
    patterns.set("test", createMockPattern("test"));
    const app = createApp(patterns);

    const res = await request(app).get("/api/patterns");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ name: "test", description: "test pattern" }]);
  });

  it("GET / returns empty array when no patterns", async () => {
    const app = createApp(new Map());
    const res = await request(app).get("/api/patterns");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("POST /:name/run returns 404 for unknown pattern", async () => {
    const app = createApp(new Map());
    const res = await request(app)
      .post("/api/patterns/unknown/run")
      .send({ scenario: { requestCount: 10, requestsPerSecond: 5 } });

    expect(res.status).toBe(404);
  });

  it("POST /:name/run returns 400 for missing scenario", async () => {
    const patterns = new Map<string, LoadedPattern>();
    patterns.set("test", createMockPattern("test"));
    const app = createApp(patterns);

    const res = await request(app)
      .post("/api/patterns/test/run")
      .send({});

    expect(res.status).toBe(400);
  });

  it("POST /:name/run returns 400 for invalid requestCount", async () => {
    const patterns = new Map<string, LoadedPattern>();
    patterns.set("test", createMockPattern("test"));
    const app = createApp(patterns);

    const res = await request(app)
      .post("/api/patterns/test/run")
      .send({ scenario: { requestCount: -1, requestsPerSecond: 5 } });

    expect(res.status).toBe(400);
  });

  it("POST /:name/run streams SSE events", async () => {
    const patterns = new Map<string, LoadedPattern>();
    patterns.set("test", createMockPattern("test"));
    const app = createApp(patterns);

    const res = await request(app)
      .post("/api/patterns/test/run")
      .send({ scenario: { requestCount: 1, requestsPerSecond: 1 } });

    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.text).toContain("node_start");
    expect(res.text).toContain('"type":"done"');
  });
});
