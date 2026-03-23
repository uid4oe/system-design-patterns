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
        activeNodeIds: state.activeNodeIds.includes(event.node)
          ? state.activeNodeIds
          : [...state.activeNodeIds, event.node],
        events: [...state.events, event],
      };

    case "request_flow": {
      const edgeKey = `${event.from}->${event.to}`;
      // Count requests entering the system (from client/publisher)
      const isNewRequest = event.from === "client" || event.from === "publisher";
      const prevMetrics = state.metrics ?? {
        totalRequests: 0, successCount: 0, errorCount: 0,
        p50LatencyMs: 0, p99LatencyMs: 0, throughputRps: 0,
      };
      const newTotal = prevMetrics.totalRequests + 1;
      const updatedMetrics = isNewRequest
        ? {
            ...prevMetrics,
            totalRequests: newTotal,
            successCount: newTotal - prevMetrics.errorCount,
          }
        : prevMetrics;

      // Add edge key to active set (don't replace — parallel edges stay lit)
      const newActiveEdges = state.activeEdgeKeys.includes(edgeKey)
        ? state.activeEdgeKeys
        : [...state.activeEdgeKeys, edgeKey];
      const newActiveNodes = state.activeNodeIds.includes(event.to)
        ? state.activeNodeIds
        : [...state.activeNodeIds, event.to];

      const existingEdge = state.edges.find(
        (e) => `${e.from}->${e.to}` === edgeKey,
      );
      if (existingEdge) {
        return {
          ...state,
          activeEdgeKeys: newActiveEdges,
          activeNodeIds: newActiveNodes,
          metrics: updatedMetrics,
          edges: state.edges.map((e) =>
            `${e.from}->${e.to}` === edgeKey
              ? { ...e, active: true, requestCount: e.requestCount + 1, lastRequestId: event.requestId }
              : e,
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
        activeEdgeKeys: newActiveEdges,
        activeNodeIds: newActiveNodes,
        metrics: updatedMetrics,
        edges: [...state.edges, newEdge],
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
        activeEdgeKeys: state.activeEdgeKeys.filter((k) => !k.endsWith(`->${event.node}`)),
        activeNodeIds: state.activeNodeIds.filter((id) => id !== event.node),
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

    case "metric": {
      // Build running metrics from well-known metric events
      const prev = state.metrics ?? {
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        p50LatencyMs: 0,
        p99LatencyMs: 0,
        throughputRps: 0,
      };
      let updated = prev;
      if (event.name === "error_rate" && prev.totalRequests > 0) {
        updated = { ...prev, errorCount: Math.round(event.value * prev.totalRequests) };
      } else if (event.name === "completion_count" || event.name === "total_accepted") {
        updated = { ...prev, successCount: event.value, totalRequests: event.value + prev.errorCount };
      } else if (event.name === "rollback_count" || event.name === "total_rejected") {
        updated = { ...prev, errorCount: event.value, totalRequests: prev.successCount + event.value };
      } else if (event.name === "event_store_size" || event.name === "total_deliveries") {
        updated = { ...prev, totalRequests: Math.max(prev.totalRequests, event.value) };
      } else if (event.name === "p50_latency_ms") {
        updated = { ...prev, p50LatencyMs: event.value };
      } else if (event.name === "p99_latency_ms") {
        updated = { ...prev, p99LatencyMs: event.value };
      } else if (event.name === "throughput_rps") {
        updated = { ...prev, throughputRps: event.value };
      }
      return {
        ...state,
        metrics: updated,
        events: [...state.events, event],
      };
    }

    case "error": {
      const errMetrics = state.metrics ?? {
        totalRequests: 0, successCount: 0, errorCount: 0,
        p50LatencyMs: 0, p99LatencyMs: 0, throughputRps: 0,
      };
      return {
        ...state,
        error: event.message,
        metrics: {
          ...errMetrics,
          errorCount: errMetrics.errorCount + 1,
          successCount: Math.max(0, errMetrics.totalRequests - errMetrics.errorCount - 1),
        },
        nodes: state.nodes.map((n) =>
          n.id === event.node ? { ...n, state: "failed" as const } : n,
        ),
        events: [...state.events, event],
      };
    }

    case "done":
      return {
        ...state,
        isRunning: false,
        metrics: event.aggregateMetrics,
        activeEdgeKeys: [],
        activeNodeIds: [],
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

              // Apply event — clear highlights on metric boundaries
              flushSync(() => setState((prev) => {
                if (event.type === "metric" && (event.name === "p50_latency_ms" || event.name === "p99_latency_ms" || event.name === "throughput_rps")) {
                  return reduceEvent({ ...prev, activeEdgeKeys: [], activeNodeIds: [] }, event);
                }
                return reduceEvent(prev, event);
              }));

              // Delay per event type:
              // - metric/node_start: no delay (structural)
              // - request_flow/processing: 150ms (parallel but readable)
              // - node_end: 120ms
              // - everything else: 350ms (visible state changes)
              switch (event.type) {
                case "metric":
                case "node_start":
                  break;
                case "request_flow":
                case "processing":
                  await new Promise((r) => setTimeout(r, 150));
                  break;
                case "node_end":
                  await new Promise((r) => setTimeout(r, 120));
                  break;
                default:
                  await new Promise((r) => setTimeout(r, 350));
              }
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
