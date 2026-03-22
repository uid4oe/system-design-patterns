import { BaseNode } from "@system-design-patterns/core";
import type {
  NodeResult,
  SimulationRequest,
  SimulationEmitter,
  SimulationClock,
} from "@system-design-patterns/core";
import type { BackendNode } from "./backend.js";

interface RateLimiterConfig {
  name: string;
  maxTokens: number;
  refillRate: number; // tokens per second
  backend: BackendNode;
}

/**
 * Token bucket rate limiter. Tokens refill at a steady rate, each
 * request consumes one token. Requests without tokens are rejected.
 * Allows bursts up to bucket capacity, then enforces steady-state rate.
 */
export class RateLimiterNode extends BaseNode {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private lastRefillTime: number;
  private readonly backend: BackendNode;
  private accepted = 0;
  private rejected = 0;

  constructor(config: RateLimiterConfig, seed = 0, clock?: SimulationClock, realTime = false) {
    super(
      { name: config.name, role: "rate-limiter", initialState: "active", latencyMs: 5 },
      seed,
      clock,
      realTime,
    );
    this.maxTokens = config.maxTokens;
    this.tokens = config.maxTokens; // Start full
    this.refillRate = config.refillRate;
    this.lastRefillTime = 0;
    this.backend = config.backend;
  }

  protected async process(
    request: SimulationRequest,
    emitter: SimulationEmitter,
  ): Promise<NodeResult> {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens--;
      this.accepted++;

      emitter.emit({
        type: "processing",
        node: this.name,
        requestId: request.id,
        detail: `accepted (${Math.floor(this.tokens)}/${this.maxTokens} tokens)`,
      });
      emitter.emit({
        type: "metric",
        name: "bucket_level",
        value: Math.round((this.tokens / this.maxTokens) * 100) / 100,
        unit: "ratio",
        node: this.name,
      });

      // Forward to backend
      emitter.emit({
        type: "request_flow",
        from: this.name,
        to: this.backend.name,
        requestId: request.id,
      });

      const result = await this.backend.run(request, emitter);
      return result;
    } else {
      this.rejected++;

      emitter.emit({
        type: "processing",
        node: this.name,
        requestId: request.id,
        detail: `rejected — bucket empty (${Math.floor(this.tokens)}/${this.maxTokens})`,
      });
      emitter.emit({
        type: "error",
        node: this.name,
        message: "rate limit exceeded",
        recoverable: true,
      });
      emitter.emit({
        type: "metric",
        name: "accept_ratio",
        value: Math.round((this.accepted / (this.accepted + this.rejected)) * 100) / 100,
        unit: "ratio",
        node: this.name,
      });

      return {
        output: "rate-limited",
        durationMs: 0,
        success: false,
        metrics: this.getMetrics(),
      };
    }
  }

  private refillTokens(): void {
    const now = this.clock.now();
    const elapsedSec = (now - this.lastRefillTime) / 1000;
    if (elapsedSec > 0) {
      const newTokens = elapsedSec * this.refillRate;
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefillTime = now;
    }
  }

  getAccepted(): number {
    return this.accepted;
  }

  getRejected(): number {
    return this.rejected;
  }

  getBucketLevel(): number {
    return this.tokens;
  }
}
