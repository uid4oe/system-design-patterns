import type { Response } from "express";
import type { SimulationEmitter, SimulationEvent } from "@system-design-patterns/core";

/**
 * SSE emitter that bridges SimulationEvents to an HTTP response stream.
 * Each event is written as `data: ${JSON.stringify(event)}\n\n`.
 */
export class SSESimulationEmitter implements SimulationEmitter {
  private closed = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private res: Response) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Heartbeat every 15 seconds to prevent timeout
    this.heartbeatTimer = setInterval(() => {
      if (!this.closed) {
        res.write(":heartbeat\n\n");
      }
    }, 15000);

    // Handle client disconnect
    res.on("close", () => {
      this.closed = true;
      this.clearHeartbeat();
    });
  }

  emit(event: SimulationEvent): void {
    if (this.closed) return;

    this.res.write(`data: ${JSON.stringify(event)}\n\n`);

    if (event.type === "done") {
      this.closed = true;
      this.clearHeartbeat();
      this.res.end();
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
