import { BaseNode } from "@design-patterns/core";
import type { SimulationClock } from "@design-patterns/core";
import type {
  NodeResult,
  SimulationRequest,
  SimulationEmitter,
} from "@design-patterns/core";
import { BackendNode } from "./backend.js";

type BreakerState = "closed" | "open" | "half-open";

interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  cooldownMs: number;
  halfOpenMaxProbes: number;
  backend: BackendNode;
}

export class CircuitBreakerNode extends BaseNode {
  private consecutiveFailures = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly halfOpenMaxProbes: number;
  private openedAtMs = 0;
  private halfOpenProbes = 0;
  private readonly backend: BackendNode;
  private acceptedCount = 0;
  private rejectedCount = 0;

  constructor(config: CircuitBreakerConfig, seed = 0, clock?: SimulationClock) {
    super(
      { name: config.name, role: "circuit-breaker", initialState: "closed", latencyMs: 0 },
      seed,
      clock,
    );
    this.failureThreshold = config.failureThreshold;
    this.cooldownMs = config.cooldownMs;
    this.halfOpenMaxProbes = config.halfOpenMaxProbes;
    this.backend = config.backend;
  }

  private get breakerState(): BreakerState {
    return this.state as BreakerState;
  }

  protected async process(
    request: SimulationRequest,
    emitter: SimulationEmitter,
  ): Promise<NodeResult> {
    // Check if open circuit should transition to half-open
    if (this.breakerState === "open") {
      const elapsed = this.clock.now() - this.openedAtMs;
      if (elapsed >= this.cooldownMs) {
        this.halfOpenProbes = 0;
        this.setState("half-open", `cooldown expired (${elapsed}ms)`, emitter);
      }
    }

    switch (this.breakerState) {
      case "closed":
        return this.handleClosed(request, emitter);
      case "open":
        return this.handleOpen(request, emitter);
      case "half-open":
        return this.handleHalfOpen(request, emitter);
    }
  }

  private async handleClosed(
    request: SimulationRequest,
    emitter: SimulationEmitter,
  ): Promise<NodeResult> {
    emitter.emit({
      type: "processing",
      node: this.name,
      requestId: request.id,
      detail: "forwarding — circuit closed",
    });
    emitter.emit({
      type: "request_flow",
      from: this.name,
      to: this.backend.name,
      requestId: request.id,
    });

    const result = await this.backend.run(request, emitter);

    if (!result.success) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.failureThreshold) {
        this.openedAtMs = this.clock.now();
        this.setState(
          "open",
          `error threshold exceeded (${this.consecutiveFailures}/${this.failureThreshold})`,
          emitter,
        );
        emitter.emit({
          type: "metric",
          name: "consecutive_failures",
          value: this.consecutiveFailures,
          unit: "count",
          node: this.name,
        });
      }
    } else {
      this.consecutiveFailures = 0;
      this.acceptedCount++;
    }

    return result;
  }

  private handleOpen(
    request: SimulationRequest,
    emitter: SimulationEmitter,
  ): NodeResult {
    this.rejectedCount++;
    emitter.emit({
      type: "processing",
      node: this.name,
      requestId: request.id,
      detail: "rejecting — circuit open (fast-fail)",
    });
    emitter.emit({
      type: "metric",
      name: "fast_fail_count",
      value: this.rejectedCount,
      unit: "count",
      node: this.name,
    });

    return {
      output: "circuit-open-rejected",
      durationMs: 0,
      success: false,
      metrics: this.getMetrics(),
    };
  }

  private async handleHalfOpen(
    request: SimulationRequest,
    emitter: SimulationEmitter,
  ): Promise<NodeResult> {
    if (this.halfOpenProbes >= this.halfOpenMaxProbes) {
      return this.handleOpen(request, emitter);
    }

    this.halfOpenProbes++;
    emitter.emit({
      type: "processing",
      node: this.name,
      requestId: request.id,
      detail: `probing — half-open (probe ${this.halfOpenProbes}/${this.halfOpenMaxProbes})`,
    });
    emitter.emit({
      type: "request_flow",
      from: this.name,
      to: this.backend.name,
      requestId: request.id,
      label: "probe",
    });

    const result = await this.backend.run(request, emitter);

    if (result.success) {
      this.consecutiveFailures = 0;
      this.acceptedCount++;
      this.setState("closed", "probe succeeded", emitter);
      emitter.emit({
        type: "metric",
        name: "recovery_detected",
        value: 1,
        unit: "boolean",
        node: this.name,
      });
    } else {
      this.openedAtMs = this.clock.now();
      this.setState("open", "probe failed", emitter);
    }

    return result;
  }
}
