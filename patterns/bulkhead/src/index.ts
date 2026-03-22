import type {
  PatternSimulator,
  ScenarioConfig,
  SimulationEmitter,
  AggregateMetrics,
  RequestResult,
} from "@design-patterns/core";
import { MetricCollector, SeededRandom, SimulationClock } from "@design-patterns/core";
import { ServiceNode } from "./nodes/service.js";
import { PoolNode } from "./nodes/pool.js";
import { GatewayNode } from "./nodes/gateway.js";

export const name = "bulkhead";
export const description =
  "Isolated resource pools preventing cascading failures across services";

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

      // Create services
      const serviceA = new ServiceNode(
        { name: "service-a", role: "backend-service", latencyMs: 150 },
        seed + 1, clock, realTime,
      );
      const serviceB = new ServiceNode(
        { name: "service-b", role: "backend-service", latencyMs: 100 },
        seed + 2, clock, realTime,
      );
      const serviceC = new ServiceNode(
        { name: "service-c", role: "backend-service", latencyMs: 80 },
        seed + 3, clock, realTime,
      );

      // Apply failure injection
      const failures = scenario.failureInjection?.nodeFailures ?? {};
      if (failures["service-a"] !== undefined) serviceA.setFailureRate(failures["service-a"]);
      if (failures["service-b"] !== undefined) serviceB.setFailureRate(failures["service-b"]);
      if (failures["service-c"] !== undefined) serviceC.setFailureRate(failures["service-c"]);

      // Create pools with different capacities
      const poolA = new PoolNode(
        { name: "pool-a", maxConcurrency: 10, service: serviceA },
        seed + 4, clock, realTime,
      );
      const poolB = new PoolNode(
        { name: "pool-b", maxConcurrency: 10, service: serviceB },
        seed + 5, clock, realTime,
      );
      const poolC = new PoolNode(
        { name: "pool-c", maxConcurrency: 5, service: serviceC },
        seed + 6, clock, realTime,
      );

      // Create gateway
      const pools = new Map<string, PoolNode>([
        ["service-a", poolA],
        ["service-b", poolB],
        ["service-c", poolC],
      ]);
      const gateway = new GatewayNode(
        { name: "gateway", pools },
        seed + 7, clock, realTime,
      );

      // Services to target — weighted toward service-a to demonstrate overload
      const services = ["service-a", "service-a", "service-a", "service-b", "service-c"];

      // Emit node_start
      gateway.emitStart(emitter);
      poolA.emitStart(emitter);
      poolB.emitStart(emitter);
      poolC.emitStart(emitter);
      serviceA.emitStart(emitter);
      serviceB.emitStart(emitter);
      serviceC.emitStart(emitter);

      collector.start(clock.now());
      const startTime = clock.now();
      const intervalMs = 1000 / scenario.requestsPerSecond;

      for (let i = 0; i < scenario.requestCount; i++) {
        const requestId = `req-${i + 1}`;
        const targetService = services[i % services.length] ?? "service-a";
        const request = {
          id: requestId,
          payload: `${targetService}-work-${i + 1}`,
          metadata: { service: targetService, index: i },
        };

        if (i > 0) {
          const jitter = random.between(0.8, 1.2);
          await clock.delay(Math.round(intervalMs * jitter), realTime);
        }

        emitter.emit({
          type: "request_flow",
          from: "client",
          to: "gateway",
          requestId,
          label: targetService,
        });

        const result = await gateway.run(request, emitter);

        collector.recordLatency(result.durationMs);
        if (result.success) collector.recordSuccess();
        else collector.recordError();

        requestResults.push({
          requestId,
          success: result.success,
          latencyMs: result.durationMs,
          path: ["gateway", `pool-${targetService.split("-")[1]}`, targetService],
          error: result.success ? undefined : result.output,
        });
      }

      collector.stop(clock.now());
      const totalDurationMs = clock.now() - startTime;
      const metrics: AggregateMetrics = collector.getAggregateMetrics();

      // Emit bulkhead-specific metrics
      emitter.emit({ type: "metric", name: "pool-a_accepted", value: poolA.getTotalAccepted(), unit: "count", node: "pool-a" });
      emitter.emit({ type: "metric", name: "pool-b_accepted", value: poolB.getTotalAccepted(), unit: "count", node: "pool-b" });
      emitter.emit({ type: "metric", name: "pool-c_accepted", value: poolC.getTotalAccepted(), unit: "count", node: "pool-c" });
      emitter.emit({ type: "metric", name: "pool-a_rejected", value: poolA.getTotalRejected(), unit: "count", node: "pool-a" });
      emitter.emit({ type: "metric", name: "pool-b_rejected", value: poolB.getTotalRejected(), unit: "count", node: "pool-b" });
      emitter.emit({ type: "metric", name: "pool-c_rejected", value: poolC.getTotalRejected(), unit: "count", node: "pool-c" });
      emitter.emit({
        type: "metric", name: "error_rate",
        value: metrics.totalRequests > 0 ? metrics.errorCount / metrics.totalRequests : 0,
        unit: "ratio",
      });

      // Emit node_end
      gateway.emitEnd(emitter, totalDurationMs);
      poolA.emitEnd(emitter, totalDurationMs);
      poolB.emitEnd(emitter, totalDurationMs);
      poolC.emitEnd(emitter, totalDurationMs);
      serviceA.emitEnd(emitter, totalDurationMs);
      serviceB.emitEnd(emitter, totalDurationMs);
      serviceC.emitEnd(emitter, totalDurationMs);

      emitter.emit({ type: "done", totalDurationMs, aggregateMetrics: metrics });

      return { result: { totalDurationMs, requestResults }, metrics };
    },
  };
}
