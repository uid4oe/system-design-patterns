import { PATTERN_CONTENT } from "../data/pattern-content.ts";
import type { PatternContent, SuggestedScenario } from "../data/pattern-content.ts";
import { CollapsibleSection } from "./CollapsibleSection.tsx";
import { MermaidDiagram } from "./MermaidDiagram.tsx";
import type { ScenarioConfig } from "../types.ts";

/* ── Icons ──────────────────────────────────────────────────── */

const iconTarget = (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
  </svg>
);

const iconArch = (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
  </svg>
);

const iconSteps = (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
  </svg>
);

const iconNodes = (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-13.5 0a3 3 0 0 1-3-3m3 3h13.5m0-3a3 3 0 0 0 3-3m-3 3a3 3 0 0 1 0 6m3-9a3 3 0 0 0-3-3m3 3h-13.5a3 3 0 0 1 0-6h13.5a3 3 0 0 1 3 3" />
  </svg>
);

const iconTradeoffs = (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" />
  </svg>
);

/* ── Overview grid ──────────────────────────────────────────── */

function PatternOverviewGrid() {
  const patterns = Object.values(PATTERN_CONTENT);

  return (
    <div className="h-full overflow-y-auto p-5 custom-scrollbar">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
          System Design Patterns
        </h3>
        <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
          Explore distributed system design patterns through interactive simulations.
          Select a pattern below to learn how it works, then run scenarios to see it in action.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {patterns.map((p) => (
          <div
            key={p.name}
            className="flex items-start gap-3 rounded-xl border border-[var(--color-border-light)] glass-card px-3.5 py-3 transition-colors"
          >
            <span className="text-lg shrink-0 mt-0.5">{p.icon}</span>
            <div className="min-w-0">
              <span className="text-[13px] font-semibold text-[var(--color-text-primary)] capitalize">
                {p.name}
              </span>
              <p className="text-[11px] text-[var(--color-text-tertiary)] leading-relaxed mt-0.5">
                {p.tagline}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Scenario button cards ──────────────────────────────────── */

interface ScenarioCardsProps {
  scenarios: SuggestedScenario[];
  onTryScenario: (scenario: SuggestedScenario) => void;
  onRunCustom: (config: ScenarioConfig) => void;
  isRunning: boolean;
  onReset: () => void;
}

function ScenarioCards({ scenarios, onTryScenario, isRunning, onReset }: ScenarioCardsProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
        Try it
      </h4>
      <div className="grid grid-cols-1 gap-2">
        {scenarios.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onTryScenario(s)}
            disabled={isRunning}
            className="group flex items-start gap-3 rounded-xl border border-[var(--color-border-light)] glass-card px-3.5 py-3 text-left transition-all hover:border-[var(--color-accent)]/30 hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--color-accent-light)] shrink-0 mt-0.5 group-hover:bg-[var(--color-accent)] transition-colors">
              <svg className="h-3.5 w-3.5 text-[var(--color-accent)] group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[13px] font-semibold text-[var(--color-text-primary)] block">
                {s.label}
              </span>
              <span className="text-[11px] text-[var(--color-text-tertiary)] leading-relaxed block mt-0.5">
                {s.description}
              </span>
              <span className="text-[10px] font-mono text-[var(--color-text-tertiary)] mt-1 block">
                {s.requestCount} req · {s.requestsPerSecond} rps
                {s.failureInjection?.nodeFailures?.["backend"]
                  ? ` · ${Math.round((s.failureInjection.nodeFailures["backend"] ?? 0) * 100)}% failure`
                  : ""}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Pattern content view ───────────────────────────────────── */

interface PatternContentViewProps {
  pattern: PatternContent;
  onTryScenario: (scenario: SuggestedScenario) => void;
  onRunCustom: (config: ScenarioConfig) => void;
  isRunning: boolean;
  onReset: () => void;
}

function PatternContentView({
  pattern,
  onTryScenario,
  onRunCustom,
  isRunning,
  onReset,
}: PatternContentViewProps) {
  return (
    <div className="h-full overflow-y-auto p-5 custom-scrollbar">
      {/* Hero */}
      <div className="mb-5 animate-fade-in">
        <div className="flex items-center gap-2.5 mb-2">
          <span className="text-2xl">{pattern.icon}</span>
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-primary)] capitalize">
              {pattern.name}
            </h3>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {pattern.tagline}
            </p>
          </div>
        </div>
        <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
          {pattern.description}
        </p>
      </div>

      <div className="space-y-2.5">
        {/* When to Use */}
        <CollapsibleSection title="When to Use" icon={iconTarget} defaultOpen>
          <ul className="space-y-1.5">
            {pattern.whenToUse.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
                <span className="text-[var(--color-accent)] mt-1 shrink-0">&#x2022;</span>
                {item}
              </li>
            ))}
          </ul>
        </CollapsibleSection>

        {/* Architecture */}
        <CollapsibleSection title="Architecture" icon={iconArch} defaultOpen>
          <MermaidDiagram source={pattern.architectureMermaid} />
        </CollapsibleSection>

        {/* How It Works — collapsed by default to save space */}
        <CollapsibleSection title="How It Works" icon={iconSteps}>
          <ol className="space-y-2">
            {pattern.howItWorks.map((step, i) => (
              <li key={step} className="flex items-start gap-2.5 text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-accent-light)] shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-[var(--color-accent)] tabular-nums">
                    {i + 1}
                  </span>
                </span>
                {step}
              </li>
            ))}
          </ol>
        </CollapsibleSection>

        {/* Node Roles */}
        <CollapsibleSection title="Node Roles" icon={iconNodes}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--color-border-light)]">
                  <th className="text-left py-1.5 pr-3 font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider text-[10px]">Node</th>
                  <th className="text-left py-1.5 pr-3 font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider text-[10px]">Role</th>
                  <th className="text-left py-1.5 font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider text-[10px]">Description</th>
                </tr>
              </thead>
              <tbody>
                {pattern.nodes.map((node) => (
                  <tr key={node.name} className="border-b border-[var(--color-border-light)] last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-[var(--color-accent)]">{node.name}</td>
                    <td className="py-1.5 pr-3 text-[var(--color-text-secondary)]">{node.role}</td>
                    <td className="py-1.5 text-[var(--color-text-tertiary)]">{node.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>

        {/* Tradeoffs */}
        <CollapsibleSection title="Tradeoffs" icon={iconTradeoffs}>
          <div className="space-y-3">
            <div>
              <h5 className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-1.5">Pros</h5>
              <ul className="space-y-1">
                {pattern.tradeoffs.pros.map((pro) => (
                  <li key={pro} className="flex items-start gap-2 text-[12px] text-[var(--color-text-secondary)] leading-relaxed">
                    <span className="text-emerald-500 shrink-0 mt-0.5">&#x2713;</span>
                    {pro}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h5 className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mb-1.5">Cons</h5>
              <ul className="space-y-1">
                {pattern.tradeoffs.cons.map((con) => (
                  <li key={con} className="flex items-start gap-2 text-[12px] text-[var(--color-text-secondary)] leading-relaxed">
                    <span className="text-amber-500 shrink-0 mt-0.5">&#x26A0;</span>
                    {con}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CollapsibleSection>

        {/* Scenario cards — replaces ugly raw inputs */}
        <div className="pt-2">
          <ScenarioCards
            scenarios={pattern.suggestedScenarios}
            onTryScenario={onTryScenario}
            onRunCustom={onRunCustom}
            isRunning={isRunning}
            onReset={onReset}
          />
        </div>
      </div>
    </div>
  );
}

/* ── LearnView ──────────────────────────────────────────────── */

interface LearnViewProps {
  selectedPattern: string | null;
  onTryScenario: (scenario: SuggestedScenario) => void;
  onRunCustom: (config: ScenarioConfig) => void;
  isRunning: boolean;
  onReset: () => void;
}

export function LearnView({
  selectedPattern,
  onTryScenario,
  onRunCustom,
  isRunning,
  onReset,
}: LearnViewProps) {
  if (!selectedPattern) {
    return <PatternOverviewGrid />;
  }

  const content = PATTERN_CONTENT[selectedPattern];
  if (!content) {
    return <PatternOverviewGrid />;
  }

  return (
    <PatternContentView
      pattern={content}
      onTryScenario={onTryScenario}
      onRunCustom={onRunCustom}
      isRunning={isRunning}
      onReset={onReset}
    />
  );
}
