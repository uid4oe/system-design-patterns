import type { SimulationEmitter, NodeMetrics } from "../stream/types.js";
import type { NodeConfig, NodeResult, SimulationRequest } from "./types.js";
import { SeededRandom } from "../simulation/random.js";
import { SimulationClock } from "../simulation/clock.js";

/**
 * Abstract base class for all simulation nodes. Handles lifecycle events,
 * latency simulation, failure injection, and capacity management.
 *
 * Uses SimulationClock for latency simulation — virtual time by default,
 * with optional real-time pacing for visualization.
 */
export abstract class BaseNode {
  readonly name: string;
  readonly role: string;
  protected config: NodeConfig;
  protected state: string;
  private activeRequests = 0;
  private totalHandled = 0;
  private totalErrors = 0;
  private totalLatencyMs = 0;
  private random: SeededRandom;
  protected clock: SimulationClock;
  private failureRate: number;
  private latencyMs: number;
  private capacity: number;
  private realTime: boolean;

  constructor(config: NodeConfig, seed = 0, clock?: SimulationClock, realTime = false) {
    this.name = config.name;
    this.role = config.role;
    this.config = config;
    this.state = config.initialState ?? "idle";
    this.failureRate = config.failureRate ?? 0;
    this.latencyMs = config.latencyMs ?? 50;
    this.capacity = config.capacity ?? Infinity;
    this.random = new SeededRandom(seed);
    this.clock = clock ?? new SimulationClock();
    this.realTime = realTime;
  }

  /** Override failure rate at runtime (e.g., from scenario failure injection). */
  setFailureRate(rate: number): void {
    this.failureRate = rate;
  }

  /** Override latency at runtime (e.g., from scenario network latency injection). */
  setLatencyMs(ms: number): void {
    this.latencyMs = ms;
  }

  /** Check if the node is healthy (not in a failed state). */
  isHealthy(): boolean {
    return this.state !== "failed";
  }

  /** Run a request through this node with full lifecycle event emission. */
  async run(
    request: SimulationRequest,
    emitter: SimulationEmitter,
  ): Promise<NodeResult> {
    const startTime = Date.now();

    if (this.activeRequests >= this.capacity) {
      const errorMsg = `capacity exceeded (${this.activeRequests}/${this.capacity})`;
      emitter.emit({
        type: "error",
        node: this.name,
        message: errorMsg,
        recoverable: true,
      });
      this.totalErrors++;
      return {
        output: "rejected-capacity",
        durationMs: 0,
        success: false,
        metrics: this.getMetrics(),
      };
    }

    this.activeRequests++;
    try {
      await this.simulateLatency();

      if (this.shouldFail()) {
        const errorMsg = "simulated failure";
        this.totalErrors++;
        emitter.emit({
          type: "error",
          node: this.name,
          message: errorMsg,
          recoverable: true,
        });
        const durationMs = Date.now() - startTime;
        this.totalLatencyMs += durationMs;
        this.totalHandled++;
        return {
          output: "failure",
          durationMs,
          success: false,
          metrics: this.getMetrics(),
        };
      }

      const result = await this.process(request, emitter);
      const durationMs = Date.now() - startTime;
      this.totalLatencyMs += durationMs;
      this.totalHandled++;
      return {
        ...result,
        durationMs,
        metrics: this.getMetrics(),
      };
    } catch (err) {
      this.totalErrors++;
      this.totalHandled++;
      const message = err instanceof Error ? err.message : String(err);
      emitter.emit({
        type: "error",
        node: this.name,
        message,
        recoverable: true,
      });
      const durationMs = Date.now() - startTime;
      this.totalLatencyMs += durationMs;
      return {
        output: "error",
        durationMs,
        success: false,
        metrics: this.getMetrics(),
      };
    } finally {
      this.activeRequests--;
    }
  }

  /** Emit a node_start event. Call this at the beginning of a simulation run. */
  emitStart(emitter: SimulationEmitter): void {
    emitter.emit({
      type: "node_start",
      node: this.name,
      role: this.role,
      state: this.state,
    });
  }

  /** Emit a node_end event with current metrics. */
  emitEnd(emitter: SimulationEmitter, durationMs: number): void {
    emitter.emit({
      type: "node_end",
      node: this.name,
      durationMs,
      metrics: this.getMetrics(),
    });
  }

  /** Transition to a new state, emitting a node_state_change event. */
  protected setState(
    newState: string,
    reason: string,
    emitter: SimulationEmitter,
  ): void {
    const oldState = this.state;
    this.state = newState;
    emitter.emit({
      type: "node_state_change",
      node: this.name,
      from: oldState,
      to: newState,
      reason,
    });
  }

  /** Get current aggregate metrics for this node. */
  getMetrics(): NodeMetrics {
    return {
      requestsHandled: this.totalHandled,
      errorsCount: this.totalErrors,
      avgLatencyMs:
        this.totalHandled > 0 ? this.totalLatencyMs / this.totalHandled : 0,
    };
  }

  /** Reset metrics counters. */
  resetMetrics(): void {
    this.totalHandled = 0;
    this.totalErrors = 0;
    this.totalLatencyMs = 0;
  }

  /** Get number of currently active requests. */
  getActiveRequests(): number {
    return this.activeRequests;
  }

  /** Subclasses implement this to define node-specific behavior. */
  protected abstract process(
    request: SimulationRequest,
    emitter: SimulationEmitter,
  ): Promise<NodeResult>;

  private async simulateLatency(): Promise<void> {
    if (this.latencyMs > 0) {
      const jitter = this.random.between(0.8, 1.2);
      const delay = Math.round(this.latencyMs * jitter);
      await this.clock.delay(delay, this.realTime);
    }
  }

  private shouldFail(): boolean {
    return this.failureRate > 0 && this.random.chance(this.failureRate);
  }
}
