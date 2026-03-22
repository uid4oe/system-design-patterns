import { BaseNode } from "@system-design-patterns/core";
import type {
  NodeResult,
  SimulationRequest,
  SimulationEmitter,
  SimulationClock,
} from "@system-design-patterns/core";
import type { SubscriberNode } from "./subscriber.js";

interface Subscription {
  subscriber: SubscriberNode;
  topic: string;
  group?: string;
}

interface BrokerConfig {
  name: string;
}

/**
 * Message broker that manages topic subscriptions and delivers messages.
 * Supports fan-out (all subscribers get every message) and consumer groups
 * (each message delivered to exactly one member via round-robin).
 */
export class BrokerNode extends BaseNode {
  private readonly subscriptions: Subscription[] = [];
  private readonly groupRoundRobin = new Map<string, number>();
  private totalDeliveries = 0;

  constructor(config: BrokerConfig, seed = 0, clock?: SimulationClock, realTime = false) {
    super(
      { name: config.name, role: "message-broker", initialState: "active", latencyMs: 20 },
      seed,
      clock,
      realTime,
    );
  }

  /** Register a subscriber for a topic, optionally in a consumer group. */
  subscribe(topic: string, subscriber: SubscriberNode, group?: string): void {
    this.subscriptions.push({ subscriber, topic, group });
  }

  protected async process(
    request: SimulationRequest,
    emitter: SimulationEmitter,
  ): Promise<NodeResult> {
    const topic = (request.metadata?.["topic"] as string | undefined) ?? "default";
    const targets = this.resolveTargets(topic);

    emitter.emit({
      type: "processing",
      node: this.name,
      requestId: request.id,
      detail: `routing to ${targets.length} subscriber(s) on topic: ${topic}`,
    });

    // Fan-out to all resolved targets, continue on individual failures
    let delivered = 0;
    let failed = 0;
    for (const target of targets) {
      emitter.emit({
        type: "request_flow",
        from: this.name,
        to: target.name,
        requestId: request.id,
        label: topic,
      });
      const result = await target.run(request, emitter);
      this.totalDeliveries++;
      if (result.success) {
        delivered++;
      } else {
        failed++;
      }
    }

    emitter.emit({
      type: "metric",
      name: "fan_out_count",
      value: delivered,
      unit: "deliveries",
      node: this.name,
    });

    const allFailed = targets.length > 0 && delivered === 0;
    return {
      output: `delivered-${delivered}-failed-${failed}`,
      durationMs: 0,
      success: !allFailed,
      metrics: this.getMetrics(),
    };
  }

  /**
   * Resolve delivery targets for a topic:
   * - Individual subscribers: all get the message
   * - Consumer group members: one member per group (round-robin)
   */
  private resolveTargets(topic: string): SubscriberNode[] {
    const topicSubs = this.subscriptions.filter((s) => s.topic === topic);
    const targets: SubscriberNode[] = [];
    const groupsSeen = new Set<string>();

    for (const sub of topicSubs) {
      if (!sub.group) {
        // Individual subscriber — always receives
        targets.push(sub.subscriber);
      } else if (!groupsSeen.has(sub.group)) {
        // Consumer group — pick one member via round-robin
        groupsSeen.add(sub.group);
        const groupMembers = topicSubs.filter((s) => s.group === sub.group);
        const idx = this.groupRoundRobin.get(sub.group) ?? 0;
        const member = groupMembers[idx % groupMembers.length];
        if (member) {
          targets.push(member.subscriber);
          this.groupRoundRobin.set(sub.group, idx + 1);
        }
      }
    }

    return targets;
  }

  getTotalDeliveries(): number {
    return this.totalDeliveries;
  }
}
