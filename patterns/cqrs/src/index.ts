import type { PatternSimulator, SimulationEmitter } from "@design-patterns/core";
import { SimulationRunner, SimulationClock, SeededRandom } from "@design-patterns/core";
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
    async run(scenario, emitter) {
      const seed = scenario.seed ?? Date.now();
      const realTime = scenario.realTime ?? false;
      const clock = new SimulationClock();
      const writeRatioRandom = new SeededRandom(seed + 100);

      const commandService = new CommandService({ name: "command-svc", role: "command-handler", latencyMs: 150 }, seed + 1, clock, realTime);
      const eventStore = new EventStoreNode({ name: "event-store", role: "event-store", latencyMs: 100 }, seed + 2, clock, realTime);
      const projector = new ProjectorNode({ name: "projector", role: "projector", latencyMs: 80 }, seed + 3, clock, realTime);
      const readModel = new ReadModelNode({ name: "read-model", role: "read-model", latencyMs: 20 }, seed + 4, clock, realTime);
      const queryService = new QueryService({ name: "query-svc", role: "query-handler", latencyMs: 30 }, seed + 5, clock, realTime);

      const failures = scenario.failureInjection?.nodeFailures ?? {};
      if (failures["command-svc"] !== undefined) commandService.setFailureRate(failures["command-svc"]);
      if (failures["event-store"] !== undefined) eventStore.setFailureRate(failures["event-store"]);
      if (failures["read-model"] !== undefined) readModel.setFailureRate(failures["read-model"]);

      let writeCount = 0;
      let readCount = 0;

      return SimulationRunner.run({
        scenario, emitter, clock,
        nodes: [commandService, eventStore, projector, readModel, queryService],
        async processRequest(request, ctx) {
          const isWrite = writeRatioRandom.chance(0.5);

          if (isWrite) {
            writeCount++;
            const req = { ...request, payload: `write-${writeCount}`, metadata: { type: "write" } };
            ctx.emitter.emit({ type: "request_flow", from: "client", to: "command-svc", requestId: request.id, label: "write" });
            const cmdResult = await commandService.run(req, ctx.emitter);

            if (cmdResult.success) {
              ctx.emitter.emit({ type: "request_flow", from: "command-svc", to: "event-store", requestId: request.id });
              const storeResult = await eventStore.run(req, ctx.emitter);

              if (storeResult.success) {
                ctx.emitter.emit({ type: "request_flow", from: "event-store", to: "projector", requestId: request.id });
                const projResult = await projector.run(req, ctx.emitter);

                if (projResult.success) {
                  ctx.emitter.emit({ type: "request_flow", from: "projector", to: "read-model", requestId: request.id, label: "project" });
                  const lastEvent = eventStore.getLastEvent();
                  if (lastEvent) readModel.project(lastEvent, clock.now(), ctx.emitter);
                }
                return { result: { ...cmdResult, success: projResult.success, durationMs: cmdResult.durationMs + storeResult.durationMs + projResult.durationMs }, path: ["command-svc", "event-store", "projector", "read-model"] };
              }
              return { result: { ...cmdResult, success: false, durationMs: cmdResult.durationMs + storeResult.durationMs }, path: ["command-svc", "event-store"] };
            }
            return { result: cmdResult, path: ["command-svc"] };
          } else {
            readCount++;
            const req = { ...request, payload: `read-${readCount}`, metadata: { type: "read" } };
            ctx.emitter.emit({ type: "request_flow", from: "client", to: "query-svc", requestId: request.id, label: "read" });
            const queryResult = await queryService.run(req, ctx.emitter);

            if (queryResult.success) {
              ctx.emitter.emit({ type: "request_flow", from: "query-svc", to: "read-model", requestId: request.id });
              const readResult = await readModel.run(req, ctx.emitter);
              return { result: { ...readResult, durationMs: queryResult.durationMs + readResult.durationMs }, path: ["query-svc", "read-model"] };
            }
            return { result: queryResult, path: ["query-svc"] };
          }
        },
        emitPatternMetrics(_metrics, em: SimulationEmitter) {
          em.emit({ type: "metric", name: "write_count", value: writeCount, unit: "count" });
          em.emit({ type: "metric", name: "read_count", value: readCount, unit: "count" });
          em.emit({ type: "metric", name: "write_ratio", value: writeCount / Math.max(1, writeCount + readCount), unit: "ratio" });
          em.emit({ type: "metric", name: "projection_lag_ms", value: readModel.getProjectionLagMs(), unit: "ms" });
          em.emit({ type: "metric", name: "event_store_size", value: eventStore.getEventCount(), unit: "events" });
        },
      });
    },
  };
}
