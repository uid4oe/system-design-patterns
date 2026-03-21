import type {
  SimulationEvent,
  AggregateMetrics,
  ScenarioConfig,
} from "@design-patterns/core";

export type { SimulationEvent, AggregateMetrics, ScenarioConfig };

export interface TopologyNode {
  id: string;
  role: string;
  state: "idle" | "active" | "healthy" | "degraded" | "failed";
  metrics?: { requests: number; avgLatencyMs: number; errors: number };
  [key: string]: unknown;
}

export interface TopologyEdge {
  from: string;
  to: string;
  active: boolean;
  requestCount: number;
  lastRequestId?: string;
}

export interface PatternInfo {
  name: string;
  description: string;
}

export interface SimulationState {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  metrics: AggregateMetrics | null;
  isRunning: boolean;
  error: string | null;
  events: SimulationEvent[];
  /** The edge key ("from->to") that was most recently activated */
  activeEdgeKey: string | null;
  /** The node currently processing a request */
  activeNodeId: string | null;
}

export const INITIAL_STATE: SimulationState = {
  nodes: [],
  edges: [],
  metrics: null,
  isRunning: false,
  error: null,
  events: [],
  activeEdgeKey: null,
  activeNodeId: null,
};
