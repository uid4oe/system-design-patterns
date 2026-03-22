import type { AggregateMetrics, SimulationEmitter } from "../stream/types.js";

/**
 * Collects per-request metrics and computes aggregate statistics
 * including percentile latencies and throughput.
 *
 * Accepts optional time values for start/stop so simulators can
 * pass virtual clock time instead of wall-clock time.
 */
export class MetricCollector {
  private latencies: number[] = [];
  private sortedCache: number[] | null = null;
  private successCount = 0;
  private errorCount = 0;
  private startTimeMs = 0;
  private endTimeMs = 0;

  /** Mark the start of the measurement period. Pass clock.now() for virtual time. */
  start(timeMs?: number): void {
    this.startTimeMs = timeMs ?? Date.now();
  }

  /** Mark the end of the measurement period. Pass clock.now() for virtual time. */
  stop(timeMs?: number): void {
    this.endTimeMs = timeMs ?? Date.now();
  }

  /** Record a request's latency in milliseconds. */
  recordLatency(ms: number): void {
    this.latencies.push(ms);
    this.sortedCache = null;
  }

  /** Record a successful request. */
  recordSuccess(): void {
    this.successCount++;
  }

  /** Record a failed request. */
  recordError(): void {
    this.errorCount++;
  }

  /** Emit live p50/p99/throughput metric events. Call after each request. */
  emitSnapshot(emitter: SimulationEmitter, currentTimeMs: number): void {
    const snap = this.snapshot(currentTimeMs);
    emitter.emit({ type: "metric", name: "p50_latency_ms", value: snap.p50LatencyMs, unit: "ms" });
    emitter.emit({ type: "metric", name: "p99_latency_ms", value: snap.p99LatencyMs, unit: "ms" });
    emitter.emit({ type: "metric", name: "throughput_rps", value: snap.throughputRps, unit: "rps" });
  }

  /** Get a snapshot of current metrics (for live updates during simulation). */
  snapshot(currentTimeMs?: number): AggregateMetrics {
    const endTime = currentTimeMs ?? this.endTimeMs;
    const durationSec = Math.max((endTime - this.startTimeMs) / 1000, 0.001);

    return {
      totalRequests: this.successCount + this.errorCount,
      successCount: this.successCount,
      errorCount: this.errorCount,
      p50LatencyMs: this.percentile(50),
      p99LatencyMs: this.percentile(99),
      throughputRps: Math.round((this.successCount + this.errorCount) / durationSec),
    };
  }

  /** Compute final aggregate metrics. */
  getAggregateMetrics(): AggregateMetrics {
    const durationSec = Math.max(
      (this.endTimeMs - this.startTimeMs) / 1000,
      0.001,
    );

    return {
      totalRequests: this.successCount + this.errorCount,
      successCount: this.successCount,
      errorCount: this.errorCount,
      p50LatencyMs: this.percentile(50),
      p99LatencyMs: this.percentile(99),
      throughputRps: Math.round(
        (this.successCount + this.errorCount) / durationSec,
      ),
    };
  }

  /** Reset all collected data. */
  reset(): void {
    this.latencies = [];
    this.sortedCache = null;
    this.successCount = 0;
    this.errorCount = 0;
    this.startTimeMs = 0;
    this.endTimeMs = 0;
  }

  /** Nearest-rank percentile calculation with sorted array caching. */
  private percentile(p: number): number {
    if (this.latencies.length === 0) return 0;

    if (!this.sortedCache) {
      this.sortedCache = [...this.latencies].sort((a, b) => a - b);
    }

    const index = Math.ceil((p / 100) * this.sortedCache.length) - 1;
    return this.sortedCache[Math.max(0, index)] ?? 0;
  }
}
