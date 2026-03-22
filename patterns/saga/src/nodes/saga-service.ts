import { SimpleNode } from "@system-design-patterns/core";
import type {
  NodeResult,
  SimulationRequest,
  SimulationEmitter,
  NodeConfig,
  SimulationClock,
} from "@system-design-patterns/core";

/**
 * Base class for saga service nodes. Each service has a forward operation
 * and a compensating operation. Both go through BaseNode.run() so they
 * respect latency simulation, failure injection, capacity, and metrics.
 */
export abstract class SagaService extends SimpleNode {
  private readonly compensationDetail: string;
  private readonly forwardDetail: string;
  private readonly forwardOutput: string;
  private readonly compensationOutput: string;

  constructor(
    config: NodeConfig,
    forwardDetail: string,
    compensationDetail: string,
    forwardOutput: string,
    compensationOutput: string,
    seed?: number,
    clock?: SimulationClock,
    realTime?: boolean,
  ) {
    super(config, seed, clock, realTime);
    this.forwardDetail = forwardDetail;
    this.compensationDetail = compensationDetail;
    this.forwardOutput = forwardOutput;
    this.compensationOutput = compensationOutput;
  }

  protected getProcessingDetail(request: SimulationRequest): string {
    const isCompensation = request.metadata?.["compensate"] === true;
    return isCompensation ? `compensating: ${this.compensationDetail}` : this.forwardDetail;
  }

  protected async handleRequest(request: SimulationRequest): Promise<NodeResult> {
    const isCompensation = request.metadata?.["compensate"] === true;
    return {
      output: isCompensation
        ? `${this.compensationOutput}-${request.id}`
        : `${this.forwardOutput}-${request.id}`,
      durationMs: 0,
      success: true,
      metrics: this.getMetrics(),
    };
  }

  /**
   * Run compensation through BaseNode.run() so it gets full simulation:
   * latency, failure injection, capacity checks, metrics tracking.
   */
  async compensate(
    request: SimulationRequest,
    emitter: SimulationEmitter,
  ): Promise<NodeResult> {
    const compensateRequest: SimulationRequest = {
      ...request,
      metadata: { ...request.metadata, compensate: true },
    };
    return this.run(compensateRequest, emitter);
  }
}

export class OrderService extends SagaService {
  constructor(config: NodeConfig, seed?: number, clock?: SimulationClock, realTime?: boolean) {
    super(config, "creating order", "cancelling order", "order-created", "order-cancelled", seed, clock, realTime);
  }
}

export class PaymentService extends SagaService {
  constructor(config: NodeConfig, seed?: number, clock?: SimulationClock, realTime?: boolean) {
    super(config, "processing payment", "refunding payment", "payment-processed", "payment-refunded", seed, clock, realTime);
  }
}

export class InventoryService extends SagaService {
  constructor(config: NodeConfig, seed?: number, clock?: SimulationClock, realTime?: boolean) {
    super(config, "reserving inventory", "releasing inventory", "inventory-reserved", "inventory-released", seed, clock, realTime);
  }
}

export class ShippingService extends SagaService {
  constructor(config: NodeConfig, seed?: number, clock?: SimulationClock, realTime?: boolean) {
    super(config, "scheduling shipment", "cancelling shipment", "shipment-scheduled", "shipment-cancelled", seed, clock, realTime);
  }
}
