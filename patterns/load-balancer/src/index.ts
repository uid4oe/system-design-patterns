import type {
  PatternSimulator,
  ScenarioConfig,
  SimulationEmitter,
  AggregateMetrics,
  RequestResult,
} from "@design-patterns/core";
import { MetricCollector, SeededRandom, SimulationClock } from "@design-patterns/core";
import { LBBackendNode } from "./nodes/backend.js";
import { LoadBalancerNode } from "./nodes/load-balancer.js";

export const name = "load-balancer";
export const description =
  "Request distribution with round-robin, least-connections, and consistent hashing";

export function createSimulator(): PatternSimulator {
  return {
    async run(
      scenario: ScenarioConfig,
      emitter: SimulationEmitter,
    ) {
      const seed = scenario.seed ?? Date.now();
      const realTime = scenario.realTime ?? false;
      const random = new SeededRandom(seed);
      const clock = new SimulationClock();
      const collector = new MetricCollector();
      const requestResults: RequestResult[] = [];

      // Create 4 backend instances
      const backends = [
        new LBBackendNode({ name: "backend-1", role: "backend-instance", latencyMs: 100 }, seed + 1, clock, realTime),
        new LBBackendNode({ name: "backend-2", role: "backend-instance", latencyMs: 100 }, seed + 2, clock, realTime),
        new LBBackendNode({ name: "backend-3", role: "backend-instance", latencyMs: 100 }, seed + 3, clock, realTime),
        new LBBackendNode({ name: "backend-4", role: "backend-instance", latencyMs: 100 }, seed + 4, clock, realTime),
      ];

      // Apply failure injection
      const failures = scenario.failureInjection?.nodeFailures ?? {};
      for (const backend of backends) {
        const rate = failures[backend.name];
        if (rate !== undefined) backend.setFailureRate(rate);
      }

      // Apply latency injection
      const latencyOverrides = scenario.failureInjection?.networkLatency ?? {};
      for (const backend of backends) {
        const latency = latencyOverrides[backend.name];
        if (latency !== undefined) backend.setLatencyMs(latency);
      }

      // Create load balancer — default to round-robin
      const lb = new LoadBalancerNode(
        { name: "lb", algorithm: "round-robin", backends },
        seed + 5,
        clock,
        realTime,
      );

      // Emit node_start
      lb.emitStart(emitter);
      for (const b of backends) b.emitStart(emitter);

      collector.start(clock.now());
      const startTime = clock.now();
      const intervalMs = 1000 / scenario.requestsPerSecond;

      for (let i = 0; i < scenario.requestCount; i++) {
        const requestId = `req-${i + 1}`;
        const request = {
          id: requestId,
          payload: `request-${i + 1}`,
          metadata: { index: i },
        };

        if (i > 0) {
          const jitter = random.between(0.8, 1.2);
          await clock.delay(Math.round(intervalMs * jitter), realTime);
        }

        emitter.emit({
          type: "request_flow",
          from: "client",
          to: "lb",
          requestId,
        });

        const result = await lb.run(request, emitter);

        collector.recordLatency(result.durationMs);
        if (result.success) collector.recordSuccess();
        else collector.recordError();

        requestResults.push({
          requestId,
          success: result.success,
          latencyMs: result.durationMs,
          path: ["lb", result.output.split("-by-")[1] ?? "unknown"],
          error: result.success ? undefined : result.output,
        });
      }

      collector.stop(clock.now());
      const totalDurationMs = clock.now() - startTime;
      const metrics: AggregateMetrics = collector.getAggregateMetrics();

      // Emit distribution metrics
      const counts = lb.getRequestCounts();
      const values = Array.from(counts.values());
      if (values.length > 0) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
        const stddev = Math.sqrt(variance);

        emitter.emit({ type: "metric", name: "request_spread_stddev", value: Math.round(stddev * 100) / 100, unit: "requests", node: "lb" });

        for (const [backendName, count] of counts) {
          emitter.emit({ type: "metric", name: `${backendName}_requests`, value: count, unit: "count", node: backendName });
        }
      }

      emitter.emit({
        type: "metric", name: "error_rate",
        value: metrics.totalRequests > 0 ? metrics.errorCount / metrics.totalRequests : 0,
        unit: "ratio",
      });

      // Emit node_end
      lb.emitEnd(emitter, totalDurationMs);
      for (const b of backends) b.emitEnd(emitter, totalDurationMs);

      emitter.emit({ type: "done", totalDurationMs, aggregateMetrics: metrics });

      return { result: { totalDurationMs, requestResults }, metrics };
    },
  };
}
