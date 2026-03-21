import type {
  PatternSimulator,
  ScenarioConfig,
  SimulationEmitter,
  AggregateMetrics,
  RequestResult,
} from "@design-patterns/core";
import { MetricCollector, SeededRandom, SimulationClock } from "@design-patterns/core";
import { CommandService } from "./nodes/command-service.js";
import { EventStoreNode } from "./nodes/event-store.js";
import { ProjectorNode } from "./nodes/projector.js";
import { ReadModelNode } from "./nodes/read-model.js";
import { QueryService } from "./nodes/query-service.js";

export const name = "cqrs";
export const description =
  "Command/Query separation with event sourcing and eventual consistency";

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

      // Write ratio from metadata or default 50%
      const writeRatio = 0.5;

      // Create nodes — writes are slower than reads
      const commandService = new CommandService(
        { name: "command-svc", role: "command-handler", latencyMs: 150 },
        seed + 1, clock, realTime,
      );
      const eventStore = new EventStoreNode(
        { name: "event-store", role: "event-store", latencyMs: 100 },
        seed + 2, clock, realTime,
      );
      const projector = new ProjectorNode(
        { name: "projector", role: "projector", latencyMs: 80 },
        seed + 3, clock, realTime,
      );
      const readModel = new ReadModelNode(
        { name: "read-model", role: "read-model", latencyMs: 20 },
        seed + 4, clock, realTime,
      );
      const queryService = new QueryService(
        { name: "query-svc", role: "query-handler", latencyMs: 30 },
        seed + 5, clock, realTime,
      );

      // Apply failure injection
      const failures = scenario.failureInjection?.nodeFailures ?? {};
      if (failures["command-svc"] !== undefined) commandService.setFailureRate(failures["command-svc"]);
      if (failures["event-store"] !== undefined) eventStore.setFailureRate(failures["event-store"]);
      if (failures["projector"] !== undefined) projector.setFailureRate(failures["projector"]);
      if (failures["read-model"] !== undefined) readModel.setFailureRate(failures["read-model"]);
      if (failures["query-svc"] !== undefined) queryService.setFailureRate(failures["query-svc"]);

      // Emit node_start
      commandService.emitStart(emitter);
      eventStore.emitStart(emitter);
      projector.emitStart(emitter);
      readModel.emitStart(emitter);
      queryService.emitStart(emitter);

      collector.start();
      const startTime = Date.now();
      const intervalMs = 1000 / scenario.requestsPerSecond;
      let writeCount = 0;
      let readCount = 0;

      for (let i = 0; i < scenario.requestCount; i++) {
        const requestId = `req-${i + 1}`;
        const isWrite = random.chance(writeRatio);

        if (i > 0) {
          const jitter = random.between(0.8, 1.2);
          await clock.delay(Math.round(intervalMs * jitter), realTime);
        }

        if (isWrite) {
          // WRITE PATH: client → command-svc → event-store → projector → read-model
          writeCount++;
          const request = { id: requestId, payload: `write-${writeCount}`, metadata: { type: "write" } };

          emitter.emit({ type: "request_flow", from: "client", to: "command-svc", requestId, label: "write" });
          const cmdResult = await commandService.run(request, emitter);
          let writeSuccess = cmdResult.success;
          let writeDuration = cmdResult.durationMs;
          let writeError: string | undefined;

          if (cmdResult.success) {
            emitter.emit({ type: "request_flow", from: "command-svc", to: "event-store", requestId });
            const storeResult = await eventStore.run(request, emitter);
            writeDuration += storeResult.durationMs;

            if (storeResult.success) {
              emitter.emit({ type: "request_flow", from: "event-store", to: "projector", requestId });
              const projResult = await projector.run(request, emitter);
              writeDuration += projResult.durationMs;

              if (projResult.success) {
                emitter.emit({ type: "request_flow", from: "projector", to: "read-model", requestId, label: "project" });
                const lastEvent = eventStore.getLastEvent();
                if (lastEvent) {
                  readModel.project(lastEvent, clock.now(), emitter);
                }
              } else {
                writeSuccess = false;
                writeError = projResult.output;
              }
            } else {
              writeSuccess = false;
              writeError = storeResult.output;
            }
          } else {
            writeError = cmdResult.output;
          }

          collector.recordLatency(writeDuration);
          if (writeSuccess) collector.recordSuccess(); else collector.recordError();
          requestResults.push({
            requestId, success: writeSuccess,
            latencyMs: writeDuration,
            path: ["command-svc", "event-store", "projector", "read-model"],
            error: writeError,
          });
        } else {
          // READ PATH: client → query-svc → read-model
          readCount++;
          const request = { id: requestId, payload: `read-${readCount}`, metadata: { type: "read" } };

          emitter.emit({ type: "request_flow", from: "client", to: "query-svc", requestId, label: "read" });
          const queryResult = await queryService.run(request, emitter);

          if (queryResult.success) {
            emitter.emit({ type: "request_flow", from: "query-svc", to: "read-model", requestId });
            const readResult = await readModel.run(request, emitter);
            collector.recordLatency(queryResult.durationMs + readResult.durationMs);
            const success = readResult.success;
            if (success) collector.recordSuccess(); else collector.recordError();
            requestResults.push({
              requestId, success,
              latencyMs: queryResult.durationMs + readResult.durationMs,
              path: ["query-svc", "read-model"],
              error: success ? undefined : readResult.output,
            });
          } else {
            collector.recordLatency(queryResult.durationMs);
            collector.recordError();
            requestResults.push({
              requestId, success: false,
              latencyMs: queryResult.durationMs,
              path: ["query-svc"],
              error: queryResult.output,
            });
          }
        }
      }

      collector.stop();
      const totalDurationMs = Date.now() - startTime;
      const metrics: AggregateMetrics = collector.getAggregateMetrics();

      // Emit CQRS-specific metrics
      emitter.emit({ type: "metric", name: "write_count", value: writeCount, unit: "count" });
      emitter.emit({ type: "metric", name: "read_count", value: readCount, unit: "count" });
      emitter.emit({
        type: "metric", name: "write_ratio", value: writeCount / scenario.requestCount, unit: "ratio",
      });
      emitter.emit({
        type: "metric", name: "projection_lag_ms", value: readModel.getProjectionLagMs(), unit: "ms",
      });
      emitter.emit({
        type: "metric", name: "event_store_size", value: eventStore.getEventCount(), unit: "events",
      });
      emitter.emit({
        type: "metric", name: "error_rate",
        value: metrics.totalRequests > 0 ? metrics.errorCount / metrics.totalRequests : 0,
        unit: "ratio",
      });

      // Emit node_end
      commandService.emitEnd(emitter, totalDurationMs);
      eventStore.emitEnd(emitter, totalDurationMs);
      projector.emitEnd(emitter, totalDurationMs);
      readModel.emitEnd(emitter, totalDurationMs);
      queryService.emitEnd(emitter, totalDurationMs);

      emitter.emit({ type: "done", totalDurationMs, aggregateMetrics: metrics });

      return { result: { totalDurationMs, requestResults }, metrics };
    },
  };
}
