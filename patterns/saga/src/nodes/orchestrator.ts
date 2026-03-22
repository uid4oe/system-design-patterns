import { BaseNode } from "@system-design-patterns/core";
import type {
  NodeResult,
  SimulationRequest,
  SimulationEmitter,
  SimulationClock,
} from "@system-design-patterns/core";
import type { SagaService } from "./saga-service.js";

interface SagaStep {
  name: string;
  service: SagaService;
}

interface SagaOrchestratorConfig {
  name: string;
  steps: SagaStep[];
}

export class SagaOrchestrator extends BaseNode {
  private readonly steps: SagaStep[];
  private sagaCompleted = 0;
  private sagaRolledBack = 0;
  private totalCompensationMs = 0;

  constructor(config: SagaOrchestratorConfig, seed = 0, clock?: SimulationClock, realTime = false) {
    super(
      { name: config.name, role: "saga-orchestrator", initialState: "idle", latencyMs: 0 },
      seed,
      clock,
      realTime,
    );
    this.steps = config.steps;
  }

  protected async process(
    request: SimulationRequest,
    emitter: SimulationEmitter,
  ): Promise<NodeResult> {
    const completedSteps: SagaStep[] = [];

    for (const step of this.steps) {
      this.setState(`executing-${step.name}`, `starting step: ${step.name}`, emitter);

      emitter.emit({
        type: "request_flow",
        from: this.name,
        to: step.name,
        requestId: request.id,
      });

      const result = await step.service.run(request, emitter);

      if (!result.success) {
        // Step failed — compensate in reverse order
        this.setState("compensating", `step ${step.name} failed: ${result.output}`, emitter);
        this.sagaRolledBack++;

        emitter.emit({
          type: "metric",
          name: "rollback_count",
          value: this.sagaRolledBack,
          unit: "count",
          node: this.name,
        });

        const compensationStart = this.clock.now();
        await this.compensate(completedSteps, request, emitter);
        this.totalCompensationMs += this.clock.now() - compensationStart;

        this.setState("rolled-back", `compensated ${completedSteps.length} steps`, emitter);

        return {
          output: `saga-rolled-back-at-${step.name}`,
          durationMs: 0,
          success: false,
          metrics: this.getMetrics(),
        };
      }

      completedSteps.push(step);
    }

    this.sagaCompleted++;
    this.setState("completed", "all steps succeeded", emitter);

    emitter.emit({
      type: "metric",
      name: "completion_count",
      value: this.sagaCompleted,
      unit: "count",
      node: this.name,
    });

    // Reset to idle for next request
    this.setState("idle", "ready for next saga", emitter);

    return {
      output: "saga-completed",
      durationMs: 0,
      success: true,
      metrics: this.getMetrics(),
    };
  }

  private async compensate(
    completedSteps: SagaStep[],
    request: SimulationRequest,
    emitter: SimulationEmitter,
  ): Promise<void> {
    // Reverse order compensation
    for (const step of [...completedSteps].reverse()) {
      this.setState(`compensating-${step.name}`, `compensating: ${step.name}`, emitter);

      emitter.emit({
        type: "request_flow",
        from: this.name,
        to: step.name,
        requestId: request.id,
        label: "compensate",
      });

      await step.service.compensate(request, emitter);
    }
  }

  getSagaCompleted(): number {
    return this.sagaCompleted;
  }

  getSagaRolledBack(): number {
    return this.sagaRolledBack;
  }

  getAvgCompensationMs(): number {
    return this.sagaRolledBack > 0 ? this.totalCompensationMs / this.sagaRolledBack : 0;
  }
}
