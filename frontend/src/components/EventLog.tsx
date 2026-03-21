import type { SimulationEvent } from "../types.ts";
import { useRef, useEffect } from "react";

interface EventLogProps {
  events: SimulationEvent[];
}

function eventColor(type: string): string {
  switch (type) {
    case "node_start":
      return "text-[var(--color-accent)]";
    case "request_flow":
      return "text-[var(--color-text-secondary)]";
    case "node_state_change":
      return "text-amber-600";
    case "error":
      return "text-red-600";
    case "done":
      return "text-emerald-600";
    default:
      return "text-[var(--color-text-tertiary)]";
  }
}

function eventIcon(type: string): string {
  switch (type) {
    case "node_start": return "▶";
    case "processing": return "⋯";
    case "request_flow": return "→";
    case "node_state_change": return "◆";
    case "node_end": return "■";
    case "metric": return "◎";
    case "error": return "✕";
    case "done": return "✓";
    default: return "·";
  }
}

function formatEvent(event: SimulationEvent): string {
  switch (event.type) {
    case "node_start":
      return `${event.node} started (${event.role})`;
    case "processing":
      return `${event.node}: ${event.detail}`;
    case "request_flow":
      return `${event.from} → ${event.to} [${event.requestId}]${event.label ? ` ${event.label}` : ""}`;
    case "node_state_change":
      return `${event.node}: ${event.from} → ${event.to} — ${event.reason}`;
    case "node_end":
      return `${event.node} ended (${event.metrics.requestsHandled} req, ${Math.round(event.metrics.avgLatencyMs)}ms)`;
    case "metric":
      return `${event.name}: ${event.value} ${event.unit}`;
    case "error":
      return `${event.node}: ${event.message}${event.recoverable ? "" : " (fatal)"}`;
    case "done":
      return `Done — ${event.aggregateMetrics.totalRequests} requests in ${event.totalDurationMs}ms`;
    default:
      return JSON.stringify(event);
  }
}

export function EventLog({ events }: EventLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  if (events.length === 0) return null;

  const visibleEvents = events.slice(-80);

  return (
    <div
      ref={scrollRef}
      className="p-3 animate-fade-in"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5 flex items-center gap-1.5">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
        </svg>
        Event Log
      </div>
      {visibleEvents.map((event, i) => (
        <div
          key={i}
          className={`animate-message-in font-mono text-[11px] leading-relaxed flex items-start gap-1.5 ${eventColor(event.type)}`}
        >
          <span className="shrink-0 w-3 text-center opacity-50">
            {eventIcon(event.type)}
          </span>
          <span>{formatEvent(event)}</span>
        </div>
      ))}
    </div>
  );
}
