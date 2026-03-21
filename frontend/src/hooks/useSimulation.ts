import { useState, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import type {
  SimulationEvent,
  SimulationState,
  TopologyNode,
  TopologyEdge,
  ScenarioConfig,
} from "../types.ts";
import { INITIAL_STATE } from "../types.ts";

/** Parse raw SSE text into SimulationEvent objects. */
export function parseSSELines(raw: string): SimulationEvent[] {
  return raw
    .split("\n\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => {
      const json = line.slice(6);
      return JSON.parse(json) as SimulationEvent;
    });
}

/** Reduce a SimulationEvent into the current state. */
export function reduceEvent(
  state: SimulationState,
  event: SimulationEvent,
): SimulationState {
  switch (event.type) {
    case "node_start": {
      const existing = state.nodes.find((n) => n.id === event.node);
      if (existing) {
        return {
          ...state,
          nodes: state.nodes.map((n) =>
            n.id === event.node
              ? { ...n, state: "active" as const }
              : n,
          ),
          events: [...state.events, event],
        };
      }
      const newNode: TopologyNode = {
        id: event.node,
        role: event.role,
        state: "active",
      };
      return {
        ...state,
        nodes: [...state.nodes, newNode],
        events: [...state.events, event],
      };
    }

    case "processing":
      return {
        ...state,
        activeNodeId: event.node,
        events: [...state.events, event],
      };

    case "request_flow": {
      const edgeKey = `${event.from}->${event.to}`;
      const existingEdge = state.edges.find(
        (e) => `${e.from}->${e.to}` === edgeKey,
      );
      if (existingEdge) {
        return {
          ...state,
          activeEdgeKey: edgeKey,
          activeNodeId: event.to,
          edges: state.edges.map((e) =>
            `${e.from}->${e.to}` === edgeKey
              ? { ...e, active: true, requestCount: e.requestCount + 1, lastRequestId: event.requestId }
              : { ...e, active: false },
          ),
          events: [...state.events, event],
        };
      }
      const newEdge: TopologyEdge = {
        from: event.from,
        to: event.to,
        active: true,
        requestCount: 1,
        lastRequestId: event.requestId,
      };
      return {
        ...state,
        activeEdgeKey: edgeKey,
        activeNodeId: event.to,
        edges: [...state.edges.map((e) => ({ ...e, active: false })), newEdge],
        events: [...state.events, event],
      };
    }

    case "node_state_change": {
      const stateMap: Record<string, TopologyNode["state"]> = {
        closed: "healthy",
        open: "failed",
        "half-open": "degraded",
        healthy: "healthy",
        degraded: "degraded",
        failed: "failed",
        idle: "idle",
        active: "active",
      };
      const mappedState = stateMap[event.to] ?? "active";
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === event.node ? { ...n, state: mappedState } : n,
        ),
        events: [...state.events, event],
      };
    }

    case "node_end":
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === event.node
            ? {
                ...n,
                state: "healthy" as const,
                metrics: {
                  requests: event.metrics.requestsHandled,
                  avgLatencyMs: event.metrics.avgLatencyMs,
                  errors: event.metrics.errorsCount,
                },
              }
            : n,
        ),
        events: [...state.events, event],
      };

    case "metric":
      return {
        ...state,
        events: [...state.events, event],
      };

    case "error":
      return {
        ...state,
        error: event.message,
        nodes: state.nodes.map((n) =>
          n.id === event.node ? { ...n, state: "failed" as const } : n,
        ),
        events: [...state.events, event],
      };

    case "done":
      return {
        ...state,
        isRunning: false,
        metrics: event.aggregateMetrics,
        activeEdgeKey: null,
        activeNodeId: null,
        edges: state.edges.map((e) => ({ ...e, active: false })),
        events: [...state.events, event],
      };

    default:
      return state;
  }
}

export function useSimulation(activePattern: string | null) {
  const [state, setState] = useState<SimulationState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (scenario: ScenarioConfig) => {
      if (!activePattern) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ ...INITIAL_STATE, isRunning: true });

      try {
        const response = await fetch(`/api/patterns/${activePattern}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenario: { ...scenario, realTime: true } }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          setState((prev) => ({
            ...prev,
            isRunning: false,
            error: `HTTP ${response.status}`,
          }));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(part.slice(6)) as SimulationEvent;
              // flushSync breaks React 18 batching so topology updates per-event
              flushSync(() => setState((prev) => reduceEvent(prev, event)));
              // Delay between events so the UI streams visibly
              await new Promise((r) => setTimeout(r, 100));
            } catch {
              // Skip malformed events
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState((prev) => ({
          ...prev,
          isRunning: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [activePattern],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return { state, run, reset };
}
