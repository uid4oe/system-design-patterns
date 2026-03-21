# Step 4e: Pub/Sub Pattern

**Agent:** `pattern-builder`
**Depends on:** Steps 1-2 (core + server)
**Parallel with:** Steps 4a-4d, 4f-4g (other patterns)

## Overview

Publish/Subscribe decouples producers from consumers via a message broker. Publishers send events to topics, and the broker fans out messages to all subscribers of each topic. Demonstrates topic-based routing, consumer groups (competing consumers), and at-least-once delivery semantics.

**Key concept:** Decoupled producers and consumers with topic-based fan-out.

## Demo Scenarios

**Simple fan-out:** 1 publisher, 3 subscribers on same topic — each gets every message
**Topic routing:** 2 publishers on different topics, subscribers filter by topic
**Consumer group:** 3 subscribers in a group — each message delivered to exactly one member

## Topology

```
[Publisher 1] ──→           ──→ [Subscriber 1 (topic: orders)]
                  [Broker]  ──→ [Subscriber 2 (topic: orders)]
[Publisher 2] ──→           ──→ [Subscriber 3 (topic: payments)]
```

## Implementation Order

### 4e.1 Publisher Node (`nodes/publisher.ts`)

```typescript
export class PublisherNode extends SimpleNode {
  private topic: string;

  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    // Publish message to topic
    return { output: `published-to-${this.topic}`, ... };
  }
}
```

- Publishes to a configured topic
- Role: "publisher"

**Commit:** `feat: add publisher node for pub/sub pattern`

### 4e.2 Broker Node (`nodes/broker.ts`)

```typescript
export class BrokerNode extends BaseNode {
  private subscriptions: Map<string, SubscriberNode[]> = new Map();  // topic → subscribers
  private consumerGroups: Map<string, SubscriberNode[]> = new Map(); // group → members
  private groupRoundRobin: Map<string, number> = new Map();

  registerSubscriber(topic: string, subscriber: SubscriberNode, group?: string): void { ... }

  protected async process(request: SimulationRequest, emitter: SimulationEmitter): Promise<NodeResult> {
    const topic = request.metadata?.topic as string;
    const subscribers = this.subscriptions.get(topic) ?? [];

    // Fan-out: deliver to each subscriber (or one per consumer group)
    for (const subscriber of this.resolveTargets(topic)) {
      emitter.emit({ type: "request_flow", from: this.name, to: subscriber.name,
        requestId: request.id, label: `topic: ${topic}` });
      await subscriber.run(request, emitter);
    }

    emitter.emit({ type: "metric", name: "fan_out_factor", value: subscribers.length, unit: "subscribers" });
    return { output: `delivered-to-${subscribers.length}-subscribers`, ... };
  }

  private resolveTargets(topic: string): SubscriberNode[] {
    // For consumer groups: pick one member per group (round-robin)
    // For individual subscribers: all get the message
  }
}
```

- Manages topic subscriptions
- Supports consumer groups (competing consumers)
- Emits `request_flow` for each delivery
- Emits `metric` for fan-out factor
- Role: "message-broker"

**Commit:** `feat: add broker node with topic routing and consumer groups`

### 4e.3 Subscriber Node (`nodes/subscriber.ts`)

```typescript
export class SubscriberNode extends SimpleNode {
  private messagesReceived = 0;

  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    this.messagesReceived++;
    return { output: `consumed-message-${this.messagesReceived}`, ... };
  }
}
```

- Tracks messages received
- Configurable processing latency (simulates slow consumers)
- Role: "subscriber"

**Commit:** `feat: add subscriber node with message tracking`

### 4e.4 Pub/Sub Simulator (`index.ts`)

```typescript
export const name = "pub-sub";
export const description = "Event-driven fan-out with topic routing and consumer groups";
```

- Creates publishers, broker, subscribers
- Configures topic subscriptions and consumer groups via scenario metadata
- Key metrics: delivery latency, fan-out factor, messages per subscriber, delivery failures

**Commit:** `feat: add pub/sub simulator and PatternSimulator export`

### 4e.5 Eval Scenarios (`eval/scenarios.json`)

```json
{
  "name": "pub-sub-eval",
  "scenarios": [
    {
      "name": "simple_fanout",
      "config": { "requestCount": 30, "requestsPerSecond": 10, "seed": 1 },
      "criteria": [
        { "name": "delivery_rate", "threshold": 1.0, "comparator": "eq", "weight": 1 },
        { "name": "fan_out_factor_avg", "threshold": 3, "comparator": "eq", "weight": 1 }
      ]
    },
    {
      "name": "consumer_group_balance",
      "config": { "requestCount": 60, "requestsPerSecond": 20, "seed": 2 },
      "criteria": [
        { "name": "group_distribution_stddev", "threshold": 3, "comparator": "lt", "weight": 1 }
      ]
    }
  ]
}
```

**Commit:** `chore: add pub/sub eval scenarios`

### 4e.6 Tests

- Fan-out: each subscriber receives every message
- Topic routing: subscribers only get messages for their topics
- Consumer groups: each message delivered to exactly one group member
- Round-robin distribution within consumer groups
- Slow subscriber doesn't block other deliveries
- Deterministic with seed

**Commit:** `test: add tests for pub/sub pattern`

## Done When

- [ ] `npm run dev` → select Pub/Sub → run "Simple fan-out" → all 3 subscribers get every message
- [ ] "Consumer group" → each message goes to exactly one member
- [ ] TopologyView shows publishers → broker → subscribers with message flow animation
- [ ] Metrics show fan-out factor, delivery latency, messages per subscriber
