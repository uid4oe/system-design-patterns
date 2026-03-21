import { describe, it, expect } from "vitest";
import { MetricCollector } from "../eval/metrics.js";

describe("MetricCollector", () => {
  it("calculates correct aggregate metrics", () => {
    const collector = new MetricCollector();
    collector.start();

    collector.recordLatency(10);
    collector.recordSuccess();
    collector.recordLatency(20);
    collector.recordSuccess();
    collector.recordLatency(100);
    collector.recordError();

    collector.stop();

    const metrics = collector.getAggregateMetrics();

    expect(metrics.totalRequests).toBe(3);
    expect(metrics.successCount).toBe(2);
    expect(metrics.errorCount).toBe(1);
  });

  it("calculates p50 correctly", () => {
    const collector = new MetricCollector();
    collector.start();

    // Add latencies: 10, 20, 30, 40, 50
    for (const ms of [10, 20, 30, 40, 50]) {
      collector.recordLatency(ms);
      collector.recordSuccess();
    }

    collector.stop();
    const metrics = collector.getAggregateMetrics();

    expect(metrics.p50LatencyMs).toBe(30);
  });

  it("calculates p99 correctly", () => {
    const collector = new MetricCollector();
    collector.start();

    for (let i = 1; i <= 100; i++) {
      collector.recordLatency(i);
      collector.recordSuccess();
    }

    collector.stop();
    const metrics = collector.getAggregateMetrics();

    expect(metrics.p99LatencyMs).toBe(99);
  });

  it("returns zero for empty data", () => {
    const collector = new MetricCollector();
    collector.start();
    collector.stop();

    const metrics = collector.getAggregateMetrics();

    expect(metrics.totalRequests).toBe(0);
    expect(metrics.p50LatencyMs).toBe(0);
    expect(metrics.p99LatencyMs).toBe(0);
  });

  it("resets all data", () => {
    const collector = new MetricCollector();
    collector.start();
    collector.recordLatency(50);
    collector.recordSuccess();
    collector.stop();

    collector.reset();
    collector.start();
    collector.stop();

    const metrics = collector.getAggregateMetrics();
    expect(metrics.totalRequests).toBe(0);
  });

  it("calculates throughput based on elapsed time", () => {
    const collector = new MetricCollector();
    collector.start();

    for (let i = 0; i < 10; i++) {
      collector.recordLatency(1);
      collector.recordSuccess();
    }

    collector.stop();
    const metrics = collector.getAggregateMetrics();

    // Throughput should be positive since we recorded requests
    expect(metrics.throughputRps).toBeGreaterThan(0);
  });
});
