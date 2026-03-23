import { describe, it, expect } from "vitest";
import { SimulationClock, CollectingEmitter } from "@system-design-patterns/core";
import { BackendNode } from "../nodes/backend.js";
import { RateLimiterNode } from "../nodes/rate-limiter.js";
import { createSimulator } from "../index.js";

function createSetup(maxTokens = 20, refillRate = 10) {
  const clock = new SimulationClock();
  const emitter = new CollectingEmitter();
  const backend = new BackendNode(
    { name: "backend", role: "service", latencyMs: 0 }, 1, clock,
  );
  const limiter = new RateLimiterNode(
    { name: "limiter", maxTokens, refillRate, backend },
    2, clock,
  );
  return { clock, emitter, backend, limiter };
}

function makeRequest(id: string) {
  return { id, payload: "test" };
}

describe("RateLimiterNode", () => {
  it("accepts requests when bucket has tokens", async () => {
    const { emitter, limiter } = createSetup();

    const result = await limiter.run(makeRequest("r1"), emitter);

    expect(result.success).toBe(true);
    expect(limiter.getAccepted()).toBe(1);
    expect(limiter.getRejected()).toBe(0);
  });

  it("rejects requests when bucket is empty", async () => {
    const { emitter, limiter } = createSetup(2, 0); // 2 tokens, no refill

    // Use both tokens
    await limiter.run(makeRequest("r1"), emitter);
    await limiter.run(makeRequest("r2"), emitter);

    // Third should be rejected
    const result = await limiter.run(makeRequest("r3"), emitter);

    expect(result.success).toBe(false);
    expect(result.output).toBe("rate-limited");
    expect(limiter.getRejected()).toBe(1);
  });

  it("accepts first maxTokens requests in a burst", async () => {
    const { emitter, limiter } = createSetup(5, 0); // 5 tokens, no refill

    const results = [];
    for (let i = 0; i < 8; i++) {
      results.push(await limiter.run(makeRequest(`r${i}`), emitter));
    }

    const accepted = results.filter((r) => r.success).length;
    const rejected = results.filter((r) => !r.success).length;

    expect(accepted).toBe(5); // bucket capacity
    expect(rejected).toBe(3);
  });

  it("refills tokens over time", async () => {
    const { clock, emitter, limiter } = createSetup(5, 10); // 5 max, 10/sec refill

    // Drain bucket
    for (let i = 0; i < 5; i++) {
      await limiter.run(makeRequest(`drain-${i}`), emitter);
    }
    expect(limiter.getAccepted()).toBe(5);

    // Bucket empty — next request rejected
    const rejected = await limiter.run(makeRequest("r-rejected"), emitter);
    expect(rejected.success).toBe(false);

    // Advance clock 1 second — should refill 10 tokens (capped at 5)
    clock.advance(1000);

    // Now requests should be accepted again
    const result = await limiter.run(makeRequest("r-after-refill"), emitter);
    expect(result.success).toBe(true);
  });

  it("bucket never exceeds maxTokens", async () => {
    const { clock, emitter, limiter } = createSetup(10, 100); // 10 max, fast refill

    // Advance clock 10 seconds — would add 1000 tokens but capped at 10
    clock.advance(10000);

    const result = await limiter.run(makeRequest("r1"), emitter);
    expect(result.success).toBe(true);
    // After consuming 1, bucket should be at 9 (not 999)
    expect(limiter.getBucketLevel()).toBeLessThanOrEqual(10);
  });

  it("emits bucket_level metric", async () => {
    const { emitter, limiter } = createSetup(10, 0);

    await limiter.run(makeRequest("r1"), emitter);

    const level = emitter.getMetricValue("bucket_level");
    expect(level).toBeDefined();
    expect(level).toBe(0.9); // 9/10
  });

  it("emits accept_ratio metric on rejection", async () => {
    const { emitter, limiter } = createSetup(1, 0);

    await limiter.run(makeRequest("r1"), emitter); // accepted
    await limiter.run(makeRequest("r2"), emitter); // rejected

    const ratio = emitter.getMetricValue("accept_ratio");
    expect(ratio).toBe(0.5);
  });
});

describe("Rate Limiter Simulator", () => {
  it("under limit: all requests accepted", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 10, requestsPerSecond: 5, seed: 42 },
      emitter,
    );

    const metrics = emitter.getAggregateMetrics();
    expect(metrics?.errorCount).toBe(0);
    expect(metrics?.successCount).toBe(10);
  });

  it("burst: first batch accepted then rejections", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 40, requestsPerSecond: 200, seed: 42 },
      emitter,
    );

    const accepted = emitter.getMetricValue("total_accepted") ?? 0;
    const rejected = emitter.getMetricValue("total_rejected") ?? 0;

    const metrics = emitter.getAggregateMetrics();
    // With 200rps burst against 5-token bucket + 3/sec refill:
    // bucket drains in ~5 requests, some refill during simulation
    // Most should be rejected
    expect(metrics?.successCount).toBeGreaterThan(3);
    expect(metrics?.errorCount).toBeGreaterThan(0);
    expect((metrics?.successCount ?? 0) + (metrics?.errorCount ?? 0)).toBe(40);
  });

  it("emits proper event envelope", async () => {
    const emitter = new CollectingEmitter();
    const simulator = createSimulator();

    await simulator.run(
      { requestCount: 5, requestsPerSecond: 100, seed: 1 },
      emitter,
    );

    const firstTwo = emitter.events.slice(0, 2);
    expect(firstTwo.every((e) => e.type === "node_start")).toBe(true);

    const last = emitter.events[emitter.events.length - 1];
    expect(last?.type).toBe("done");
  });
});
