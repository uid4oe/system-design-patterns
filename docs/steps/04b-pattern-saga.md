# Step 4b: Saga Pattern

**Agent:** `pattern-builder`
**Depends on:** Steps 1-2 (core + server)
**Parallel with:** Steps 4a, 4c-4g (other patterns)

## Overview

The saga pattern manages distributed transactions across multiple services without distributed locks. An orchestrator executes a sequence of local transactions. If any step fails, it runs compensating actions in reverse order to undo completed steps, ensuring eventual consistency.

**Key concept:** Forward execution + reverse compensation on failure.

## Demo Scenarios

**Happy path:** Order → Payment → Inventory → Shipping — all 4 steps complete
**Mid-transaction failure:** Order → Payment → Inventory fails → compensate Payment → compensate Order
**Timeout scenario:** Order → Payment (timeout) → compensate Order

## Topology

```
                 ┌──→ [Order Service]
[Orchestrator] ──├──→ [Payment Service]
                 ├──→ [Inventory Service]
                 └──→ [Shipping Service]
```

## Implementation Order

### 4b.1 Service Nodes (`nodes/order.ts`, `payment.ts`, `inventory.ts`, `shipping.ts`)

Each service extends SimpleNode with two operations:

```typescript
export class OrderService extends SimpleNode {
  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    // Simulate order creation
    return { output: "order-created", durationMs: this.config.latencyMs ?? 50, success: true, metrics: ... };
  }

  async compensate(request: SimulationRequest, emitter: SimulationEmitter): Promise<NodeResult> {
    emitter.emit({ type: "processing", node: this.name, requestId: request.id, detail: "compensating: cancelling order" });
    // Simulate order cancellation (compensation)
    return { output: "order-cancelled", durationMs: this.config.latencyMs ?? 30, success: true, metrics: ... };
  }
}
```

- Each service has `handleRequest()` (forward) and `compensate()` (reverse)
- Configurable latency and failure rate per service
- Payment, Inventory, Shipping follow identical pattern

**Commit:** `feat: add saga service nodes with forward and compensate operations`

### 4b.2 Saga Orchestrator Node (`nodes/orchestrator.ts`)

Extends BaseNode with step tracking and compensation logic:

```typescript
export class SagaOrchestrator extends BaseNode {
  private steps: SagaStep[] = [];  // { service, completed, compensated }
  private completedSteps: string[] = [];

  protected async process(request: SimulationRequest, emitter: SimulationEmitter): Promise<NodeResult> {
    for (const step of this.steps) {
      this.setState(`executing-${step.name}`, `starting step: ${step.name}`, emitter);
      emitter.emit({ type: "request_flow", from: this.name, to: step.name, requestId: request.id });

      const result = await step.service.run(request, emitter);

      if (!result.success) {
        // Step failed — run compensation in reverse
        this.setState(`compensating`, `step ${step.name} failed: ${result.output}`, emitter);
        await this.compensate(request, emitter);
        return { output: `saga-rolled-back-at-${step.name}`, ... };
      }

      this.completedSteps.push(step.name);
    }

    this.setState("completed", "all steps succeeded", emitter);
    return { output: "saga-completed", ... };
  }

  private async compensate(request: SimulationRequest, emitter: SimulationEmitter): Promise<void> {
    // Reverse order compensation
    for (const stepName of [...this.completedSteps].reverse()) {
      this.setState(`compensating-${stepName}`, `compensating: ${stepName}`, emitter);
      emitter.emit({ type: "request_flow", from: this.name, to: stepName, requestId: request.id, label: "compensate" });
      const step = this.steps.find(s => s.name === stepName)!;
      await step.service.compensate(request, emitter);
    }
  }
}
```

- Tracks which steps completed for compensation ordering
- Emits `node_state_change` for each phase: `executing-{service}`, `compensating-{service}`, `completed`, `rolled-back`
- Emits `request_flow` for both forward execution and compensation

**Commit:** `feat: add saga orchestrator with compensation logic`

### 4b.3 Saga Simulator (`index.ts`)

```typescript
export const name = "saga";
export const description = "Distributed transactions with compensating actions for rollback";

export function createSimulator(): PatternSimulator {
  return {
    async run(scenario, emitter) {
      // Create services with scenario's failure injection
      const order = new OrderService({ name: "order", role: "service", ... });
      const payment = new PaymentService({ name: "payment", role: "service", ... });
      const inventory = new InventoryService({ name: "inventory", role: "service", ... });
      const shipping = new ShippingService({ name: "shipping", role: "service", ... });

      const orchestrator = new SagaOrchestrator({
        name: "orchestrator", role: "saga-orchestrator",
        steps: [order, payment, inventory, shipping],
      });

      // Emit node_start for all nodes
      // Run requests through orchestrator
      // Collect metrics: completion rate, rollback count, avg compensation time
      // Emit done with aggregate metrics
    }
  };
}
```

**Commit:** `feat: add saga simulator and PatternSimulator export`

### 4b.4 Eval Scenarios (`eval/scenarios.json`)

```json
{
  "name": "saga-eval",
  "scenarios": [
    {
      "name": "happy_path",
      "config": { "requestCount": 20, "requestsPerSecond": 5, "seed": 1 },
      "criteria": [
        { "name": "completion_rate", "threshold": 1.0, "comparator": "eq", "weight": 1 }
      ]
    },
    {
      "name": "inventory_failure",
      "config": {
        "requestCount": 50, "requestsPerSecond": 10, "seed": 2,
        "failureInjection": { "nodeFailures": { "inventory": 0.5 } }
      },
      "criteria": [
        { "name": "compensation_success_rate", "threshold": 1.0, "comparator": "eq", "weight": 1 },
        { "name": "avg_compensation_time_ms", "threshold": 500, "comparator": "lt", "weight": 1 }
      ]
    },
    {
      "name": "payment_timeout",
      "config": {
        "requestCount": 30, "requestsPerSecond": 5, "seed": 3,
        "failureInjection": { "networkLatency": { "orchestrator→payment": 5000 } }
      },
      "criteria": [
        { "name": "timeout_detected", "threshold": 1, "comparator": "eq", "weight": 1 }
      ]
    }
  ]
}
```

**Commit:** `chore: add saga eval scenarios`

### 4b.5 Tests

- Happy path: all 4 steps complete, orchestrator emits "completed" state
- Mid-failure: inventory fails, payment and order compensated in reverse
- Compensation order: verify reverse execution (shipping→inventory→payment→order, only for completed steps)
- State change events: verify all `node_state_change` events fire correctly
- Metrics: completion rate, rollback count, compensation time accuracy
- Deterministic with seed

**Commit:** `test: add tests for saga pattern`

## Done When

- [ ] `npm run dev` → select Saga → run "Happy path" → all 4 steps complete in sequence
- [ ] Run "Mid-transaction failure" → see compensation flow in reverse
- [ ] TopologyView shows orchestrator connected to 4 services with state colors
- [ ] State transitions visible: executing-order → executing-payment → compensating-payment → compensating-order
- [ ] Metrics show completion rate and average compensation time
