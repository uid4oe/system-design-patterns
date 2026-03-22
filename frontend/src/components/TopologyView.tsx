import {
  ReactFlow,
  Background,
  Handle,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeProps,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { TopologyNode, TopologyEdge } from "../types.ts";

interface TopologyViewProps {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  activeEdgeKey?: string | null;
  activeNodeId?: string | null;
}

const STATE_COLORS: Record<string, { border: string; bg: string; dot: string }> = {
  idle: { border: "#94a3b8", bg: "rgba(241, 245, 249, 0.8)", dot: "#94a3b8" },
  active: { border: "#2563eb", bg: "rgba(219, 234, 254, 0.6)", dot: "#2563eb" },
  healthy: { border: "#16a34a", bg: "rgba(220, 252, 231, 0.6)", dot: "#16a34a" },
  degraded: { border: "#ca8a04", bg: "rgba(254, 249, 195, 0.6)", dot: "#ca8a04" },
  failed: { border: "#dc2626", bg: "rgba(254, 226, 226, 0.6)", dot: "#dc2626" },
};

function SimulationNodeComponent({ data }: NodeProps) {
  const nodeData = data as unknown as TopologyNode & { isActiveTarget: boolean };
  const colors = STATE_COLORS[nodeData.state] ?? STATE_COLORS["idle"];
  const isTarget = nodeData.isActiveTarget;

  return (
    <div
      style={{
        background: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: "0.75rem",
        padding: "8px 12px",
        minWidth: 120,
        fontFamily: "system-ui, -apple-system, sans-serif",
        backdropFilter: "blur(12px)",
        boxShadow: isTarget
          ? `0 0 0 3px ${colors.border}33, 0 1px 2px rgba(0,0,0,0.03)`
          : "0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.02)",
        transition: "border-color 0.3s, background 0.3s, box-shadow 0.3s, transform 0.2s",
        transform: isTarget ? "scale(1.03)" : "scale(1)",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: colors.border, border: "none", width: 6, height: 6 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: colors.border, border: "none", width: 6, height: 6 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: colors.dot,
            display: "inline-block",
            transition: "background 0.3s",
            animation: nodeData.state === "active" || isTarget ? "pulse 1s infinite" : undefined,
          }}
        />
        <span style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          fontWeight: 600,
          color: "#0f172a",
        }}>
          {nodeData.id}
        </span>
      </div>
      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 500 }}>{nodeData.role}</div>
      {nodeData.metrics && (
        <div style={{
          marginTop: 6,
          display: "flex",
          gap: 6,
          fontSize: 10,
          fontFamily: "ui-monospace, monospace",
          color: "#475569",
        }}>
          <span>{nodeData.metrics.requests} req</span>
          <span>{Math.round(nodeData.metrics.avgLatencyMs)}ms</span>
          {nodeData.metrics.errors > 0 && (
            <span style={{ color: "#dc2626" }}>{nodeData.metrics.errors} err</span>
          )}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { simulation: SimulationNodeComponent };

function layoutNodes(topologyNodes: TopologyNode[], activeNodeId: string | null): Node[] {
  // For patterns with an orchestrator/coordinator, use hub layout
  // Otherwise use horizontal layout
  // Pub-sub: publisher(s) left, broker center, subscribers right
  const brokerIdx = topologyNodes.findIndex((n) => n.role === "message-broker");
  if (brokerIdx >= 0 && topologyNodes.length > 3) {
    return layoutPubSub(topologyNodes, brokerIdx, activeNodeId);
  }

  // Bulkhead: gateway left, pools center, services right
  const gatewayIdx = topologyNodes.findIndex((n) => n.role === "gateway");
  if (gatewayIdx >= 0 && topologyNodes.length > 3) {
    return layoutThreeColumn(topologyNodes, gatewayIdx, activeNodeId);
  }

  const orchestratorIdx = topologyNodes.findIndex(
    (n) => n.role === "saga-orchestrator" || n.role === "circuit-breaker" || n.role === "coordinator" || n.role === "load-balancer",
  );

  if (orchestratorIdx >= 0 && topologyNodes.length > 3) {
    return layoutHubSpoke(topologyNodes, orchestratorIdx, activeNodeId);
  }

  // CQRS: write path top row, read path bottom row
  const hasEventStore = topologyNodes.some((n) => n.role === "event-store");
  if (hasEventStore && topologyNodes.length > 3) {
    return layoutCqrs(topologyNodes, activeNodeId);
  }

  // For >3 nodes without hub, use 2-row grid
  if (topologyNodes.length > 3) {
    return layoutGrid(topologyNodes, activeNodeId);
  }

  // Simple horizontal for small topologies (≤3 nodes)
  const spacing = 240;
  const totalWidth = (topologyNodes.length - 1) * spacing;
  const startX = -totalWidth / 2;

  return topologyNodes.map((tn, i) => ({
    id: tn.id,
    type: "simulation",
    data: { ...tn, isActiveTarget: tn.id === activeNodeId },
    position: { x: startX + i * spacing, y: 0 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }));
}

/**
 * CQRS layout: two horizontal paths
 * Top:    command-svc → event-store → projector → read-model
 * Bottom: query-svc ─────────────────────────────↗ (read-model)
 */
function layoutCqrs(
  topologyNodes: TopologyNode[],
  activeNodeId: string | null,
): Node[] {
  // Define fixed positions for CQRS nodes
  const positions: Record<string, { x: number; y: number }> = {
    "command-svc": { x: -240, y: -60 },
    "event-store": { x: -80, y: -60 },
    projector: { x: 80, y: -60 },
    "query-svc": { x: -240, y: 60 },
    "read-model": { x: 240, y: -10 },
  };

  return topologyNodes.map((tn) => {
    const pos = positions[tn.id] ?? { x: 0, y: 0 };
    return {
      id: tn.id,
      type: "simulation",
      data: { ...tn, isActiveTarget: tn.id === activeNodeId },
      position: pos,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });
}

/** Grid layout: 2 columns, nodes stacked vertically per column */
function layoutGrid(
  topologyNodes: TopologyNode[],
  activeNodeId: string | null,
): Node[] {
  const cols = 2;
  const spacingX = 220;
  const spacingY = 100;
  const rows = Math.ceil(topologyNodes.length / cols);
  const totalHeight = (rows - 1) * spacingY;

  return topologyNodes.map((tn, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      id: tn.id,
      type: "simulation",
      data: { ...tn, isActiveTarget: tn.id === activeNodeId },
      position: { x: -spacingX / 2 + col * spacingX, y: -totalHeight / 2 + row * spacingY },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });
}

/** Hub-and-spoke layout: orchestrator on the left, services in a column on the right */
function layoutHubSpoke(
  topologyNodes: TopologyNode[],
  hubIdx: number,
  activeNodeId: string | null,
): Node[] {
  const hub = topologyNodes[hubIdx];
  const spokes = topologyNodes.filter((_, i) => i !== hubIdx);
  const spokeSpacing = 110;
  const totalSpokeHeight = (spokes.length - 1) * spokeSpacing;

  const result: Node[] = [];

  if (hub) {
    result.push({
      id: hub.id,
      type: "simulation",
      data: { ...hub, isActiveTarget: hub.id === activeNodeId },
      position: { x: -160, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  }

  spokes.forEach((tn, i) => {
    result.push({
      id: tn.id,
      type: "simulation",
      data: { ...tn, isActiveTarget: tn.id === activeNodeId },
      position: { x: 160, y: -totalSpokeHeight / 2 + i * spokeSpacing },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  return result;
}

/** 3-column layout: single node left, middle tier center, backend tier right */
function layoutThreeColumn(
  topologyNodes: TopologyNode[],
  leftIdx: number,
  activeNodeId: string | null,
): Node[] {
  const leftNode = topologyNodes[leftIdx];
  const middleTier = topologyNodes.filter(
    (n) => n.role === "thread-pool" || n.role === "pool",
  );
  const rightTier = topologyNodes.filter(
    (_, i) => i !== leftIdx && !middleTier.includes(topologyNodes[i] as TopologyNode),
  );

  const result: Node[] = [];
  const spacing = 100;

  // Left node (gateway)
  if (leftNode) {
    result.push({
      id: leftNode.id,
      type: "simulation",
      data: { ...leftNode, isActiveTarget: leftNode.id === activeNodeId },
      position: { x: -180, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  }

  // Middle tier (pools)
  const midHeight = (middleTier.length - 1) * spacing;
  middleTier.forEach((tn, i) => {
    result.push({
      id: tn.id,
      type: "simulation",
      data: { ...tn, isActiveTarget: tn.id === activeNodeId },
      position: { x: 0, y: -midHeight / 2 + i * spacing },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  // Right tier (services)
  const rightHeight = (rightTier.length - 1) * spacing;
  rightTier.forEach((tn, i) => {
    result.push({
      id: tn.id,
      type: "simulation",
      data: { ...tn, isActiveTarget: tn.id === activeNodeId },
      position: { x: 180, y: -rightHeight / 2 + i * spacing },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  return result;
}

/** 3-column layout: publishers left, broker center, subscribers right */
function layoutPubSub(
  topologyNodes: TopologyNode[],
  brokerIdx: number,
  activeNodeId: string | null,
): Node[] {
  const broker = topologyNodes[brokerIdx];
  const publishers = topologyNodes.filter((n) => n.role === "publisher");
  const subscribers = topologyNodes.filter(
    (n, i) => i !== brokerIdx && n.role !== "publisher",
  );

  const result: Node[] = [];
  const subSpacing = 100;

  // Publishers on the left
  const pubHeight = (publishers.length - 1) * subSpacing;
  publishers.forEach((tn, i) => {
    result.push({
      id: tn.id,
      type: "simulation",
      data: { ...tn, isActiveTarget: tn.id === activeNodeId },
      position: { x: -180, y: -pubHeight / 2 + i * subSpacing },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  // Broker in the center
  if (broker) {
    result.push({
      id: broker.id,
      type: "simulation",
      data: { ...broker, isActiveTarget: broker.id === activeNodeId },
      position: { x: 0, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  }

  // Subscribers on the right
  const subHeight = (subscribers.length - 1) * subSpacing;
  subscribers.forEach((tn, i) => {
    result.push({
      id: tn.id,
      type: "simulation",
      data: { ...tn, isActiveTarget: tn.id === activeNodeId },
      position: { x: 180, y: -subHeight / 2 + i * subSpacing },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  });

  return result;
}

function layoutEdges(
  topologyEdges: TopologyEdge[],
  activeEdgeKey: string | null,
  nodeStates: Map<string, TopologyNode["state"]>,
): Edge[] {
  return topologyEdges.map((te) => {
    const key = `${te.from}->${te.to}`;
    const isActive = key === activeEdgeKey;
    const targetState = nodeStates.get(te.to);
    const isFailed = targetState === "failed";

    return {
      id: key,
      source: te.from,
      target: te.to,
      animated: isActive && !isFailed,
      label: isFailed ? `✕ ${te.requestCount}` : isActive ? `⚡ ${te.requestCount}` : String(te.requestCount),
      style: {
        stroke: isFailed ? "#dc2626" : isActive ? "#2563eb" : "#cbd5e1",
        strokeWidth: isActive && !isFailed ? 3 : Math.min(1 + te.requestCount / 20, 2.5),
        strokeDasharray: isFailed ? "6 4" : undefined,
        opacity: isFailed ? 0.4 : 1,
        transition: "stroke 0.2s, stroke-width 0.2s, opacity 0.3s",
      },
      labelStyle: {
        fill: isFailed ? "#dc2626" : isActive ? "#2563eb" : "#64748b",
        fontSize: isActive ? 11 : 10,
        fontFamily: "ui-monospace, monospace",
        fontWeight: isActive ? "600" : "400",
        opacity: isFailed ? 0.5 : 1,
      },
      labelBgStyle: {
        fill: isFailed ? "rgba(254, 226, 226, 0.9)" : isActive ? "rgba(219, 234, 254, 0.9)" : "rgba(255,255,255,0.7)",
      },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
    };
  });
}

function TopologyInner({ nodes, edges, activeEdgeKey, activeNodeId }: TopologyViewProps) {
  const flowNodes = layoutNodes(nodes, activeNodeId ?? null);
  const nodeStates = new Map(nodes.map((n) => [n.id, n.state]));
  const flowEdges = layoutEdges(edges, activeEdgeKey ?? null, nodeStates);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.5, maxZoom: 1 }}
      panOnDrag
      zoomOnScroll={false}
      preventScrolling={false}
      proOptions={{ hideAttribution: true }}
      style={{ background: "transparent" }}
    >
      <Background color="rgba(148, 163, 184, 0.08)" gap={24} />
    </ReactFlow>
  );
}

export function TopologyView({ nodes, edges, activeEdgeKey, activeNodeId }: TopologyViewProps) {
  if (nodes.length === 0) {
    return null;
  }

  return (
    <div className="flex-1 animate-fade-in" style={{ width: "100%", height: "100%", minHeight: 220 }}>
      <ReactFlowProvider>
        <TopologyInner nodes={nodes} edges={edges} activeEdgeKey={activeEdgeKey} activeNodeId={activeNodeId} />
      </ReactFlowProvider>
    </div>
  );
}
