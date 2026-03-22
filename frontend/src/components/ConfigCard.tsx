import { useState } from "react";
import type { ScenarioConfig } from "../types.ts";

/** Map pattern name to the primary node to inject failures into */
const FAILURE_TARGET: Record<string, string> = {
  "circuit-breaker": "backend",
  saga: "inventory",
  cqrs: "event-store",
  "load-balancer": "backend-3",
  "pub-sub": "broker",
  bulkhead: "backend",
  "rate-limiter": "backend",
};

interface ConfigCardProps {
  isRunning: boolean;
  patternName: string | null;
  onRun: (config: ScenarioConfig) => void;
  onReset: () => void;
}

export function ConfigCard({ isRunning, patternName, onRun, onReset }: ConfigCardProps) {
  const [requestCount, setRequestCount] = useState(20);
  const [requestsPerSecond, setRequestsPerSecond] = useState(5);
  const [failureRate, setFailureRate] = useState(0);

  const failureTarget = patternName ? (FAILURE_TARGET[patternName] ?? "backend") : "backend";

  return (
    <div className="animate-fade-in px-4 py-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <svg className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Configuration
        </span>
        {isRunning && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
            <span className="h-1 w-1 rounded-full bg-blue-500 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* Config inputs */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Requests
          </label>
          <input
            type="number"
            min={1}
            max={200}
            value={requestCount}
            onChange={(e) => setRequestCount(Number(e.target.value))}
            disabled={isRunning}
            className="w-16 bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)] px-2 py-1.5 rounded-lg text-[12px] font-mono border border-[var(--color-border-light)] outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Rate
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={50}
              value={requestsPerSecond}
              onChange={(e) => setRequestsPerSecond(Number(e.target.value))}
              disabled={isRunning}
              className="w-16 bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)] px-2 py-1.5 rounded-lg text-[12px] font-mono border border-[var(--color-border-light)] outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-40"
            />
            <span className="text-[10px] text-[var(--color-text-tertiary)]">rps</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            {failureTarget}
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={100}
              value={failureRate}
              onChange={(e) => setFailureRate(Number(e.target.value))}
              disabled={isRunning}
              className="w-16 bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)] px-2 py-1.5 rounded-lg text-[12px] font-mono border border-[var(--color-border-light)] outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-40"
            />
            <span className="text-[10px] text-[var(--color-text-tertiary)]">% fail</span>
          </div>
        </div>

        <div className="flex gap-1.5 ml-auto">
          <button
            onClick={() =>
              onRun({
                requestCount,
                requestsPerSecond,
                ...(failureRate > 0
                  ? { failureInjection: { nodeFailures: { [failureTarget]: failureRate / 100 } } }
                  : {}),
              })
            }
            disabled={isRunning}
            className="rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm shadow-blue-500/15"
          >
            {isRunning ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border-[1.5px] border-white/30 border-t-white animate-spin-slow" />
                Running
              </span>
            ) : (
              "Run"
            )}
          </button>
          {!isRunning && (
            <button
              onClick={onReset}
              className="rounded-xl px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-tertiary)] hover:bg-black/[0.03] transition-all"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
