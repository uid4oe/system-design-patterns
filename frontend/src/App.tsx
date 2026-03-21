import { useState, useCallback } from "react";
import { useSimulation } from "./hooks/useSimulation.ts";
import { PatternSelector } from "./components/PatternSelector.tsx";
import { TopologyView } from "./components/TopologyView.tsx";
import { MetricsPanel } from "./components/MetricsPanel.tsx";
import { EventLog } from "./components/EventLog.tsx";
import { LearnView } from "./components/LearnView.tsx";
import type { ScenarioConfig } from "./types.ts";
import type { SuggestedScenario } from "./data/pattern-content.ts";

export function App() {
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);
  const { state, run, reset } = useSimulation(selectedPattern);

  const handleTryScenario = useCallback(
    (scenario: SuggestedScenario) => {
      if (!selectedPattern || state.isRunning) return;
      const config: ScenarioConfig = {
        requestCount: scenario.requestCount,
        requestsPerSecond: scenario.requestsPerSecond,
        failureInjection: scenario.failureInjection,
      };
      run(config);
    },
    [selectedPattern, state.isRunning, run],
  );

  const handleRunCustom = useCallback(
    (config: ScenarioConfig) => {
      if (!selectedPattern || state.isRunning) return;
      run(config);
    },
    [selectedPattern, state.isRunning, run],
  );

  const handlePatternSelect = useCallback(
    (name: string) => {
      if (name !== selectedPattern && !state.isRunning) {
        setSelectedPattern(name);
        reset();
      }
    },
    [selectedPattern, state.isRunning, reset],
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden p-2 lg:p-2.5 gap-2 lg:gap-2">
      {/* Minimal header */}
      <header className="shrink-0 flex items-center justify-between px-4 py-1">
        <span className="text-base font-normal text-[var(--color-text-primary)] tracking-tight">
          Design Patterns
        </span>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
          title="View on GitHub"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
        </a>
      </header>

      {/* Main panels */}
      <main className="flex flex-1 min-h-0 flex-col lg:flex-row gap-2 lg:gap-2.5">
        {/* LEFT — Educational content (like RightPanel/LearnView in ref) */}
        <div className="flex-[3] min-h-0 glass rounded-2xl overflow-hidden">
          <LearnView
            selectedPattern={selectedPattern}
            onTryScenario={handleTryScenario}
            onRunCustom={handleRunCustom}
            isRunning={state.isRunning}
            onReset={reset}
          />
        </div>

        {/* RIGHT — Simulation (like Chat + AgentFlowSummary in ref) */}
        <div className="flex-[2] min-h-0 flex flex-col gap-2">
          <div className="flex-1 min-h-0 glass-strong rounded-2xl overflow-hidden flex flex-col">
            {state.nodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-tertiary)]">
                <svg className="h-10 w-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-13.5 0a3 3 0 0 1-3-3m3 3h13.5m0-3a3 3 0 0 0 3-3m-3 3a3 3 0 0 1 0 6m3-9a3 3 0 0 0-3-3m3 3h-13.5a3 3 0 0 1 0-6h13.5a3 3 0 0 1 3 3" />
                </svg>
                <span className="text-sm">Run a simulation to see the topology</span>
              </div>
            ) : (
              <>
                <TopologyView nodes={state.nodes} edges={state.edges} />
                <div className="shrink-0 border-t border-[var(--color-border-light)]">
                  <MetricsPanel metrics={state.metrics} isRunning={state.isRunning} />
                </div>
                <div className="shrink-0 border-t border-[var(--color-border-light)] max-h-36 overflow-y-auto custom-scrollbar">
                  <EventLog events={state.events} />
                </div>
              </>
            )}
          </div>
          {state.error && !state.isRunning && (
            <div className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-fade-in">
              {state.error}
            </div>
          )}
        </div>
      </main>

      {/* Input bar — identical to reference */}
      <div className="shrink-0">
        <div className="max-w-2xl w-full mx-auto rounded-2xl glass-strong px-3 py-2 transition-shadow">
          {/* Pattern tabs */}
          <div className="flex items-center gap-2">
            <PatternSelector
              selected={selectedPattern}
              onSelect={handlePatternSelect}
              isStreaming={state.isRunning}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
