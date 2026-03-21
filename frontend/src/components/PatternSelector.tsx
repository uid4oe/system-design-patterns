import { useCallback, useEffect, useState } from "react";
import type { PatternInfo } from "../types.ts";

interface PatternSelectorProps {
  selected: string | null;
  onSelect: (pattern: string) => void;
  isStreaming?: boolean;
}

export function PatternSelector({
  selected,
  onSelect,
  isStreaming = false,
}: PatternSelectorProps) {
  const [patterns, setPatterns] = useState<PatternInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/patterns");
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data: PatternInfo[] = await response.json();
        if (!cancelled) {
          setPatterns(data);
          setLoading(false);
          if (!selected && data.length > 0 && data[0]) {
            onSelect(data[0].name);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to load patterns";
          setError(message);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = useCallback(
    (name: string) => {
      if (name !== selected && !isStreaming) {
        onSelect(name);
      }
    },
    [selected, onSelect, isStreaming],
  );

  if (loading) {
    return (
      <div role="status" aria-label="Loading patterns" className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
        <span className="h-3 w-3 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)] animate-spin-slow" />
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-amber-600">
        {error}
      </div>
    );
  }

  if (patterns.length === 0) {
    return (
      <div className="text-xs text-[var(--color-text-tertiary)]">
        No patterns
      </div>
    );
  }

  return (
    <div role="group" aria-label="Pattern selector" className="flex items-center gap-1 shrink-0">
      {patterns.map((pattern) => {
        const isActive = pattern.name === selected;
        return (
          <button
            key={pattern.name}
            type="button"
            onClick={() => handleSelect(pattern.name)}
            aria-pressed={isActive}
            disabled={isStreaming && !isActive}
            className={`shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-all duration-150 flex items-center gap-1.5 ${
              isActive
                ? "bg-[var(--color-accent)] text-white"
                : isStreaming
                  ? "text-[var(--color-text-tertiary)] opacity-40 cursor-not-allowed"
                  : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-black/[0.03]"
            }`}
            title={pattern.description}
          >
            {pattern.name}
            {isActive && isStreaming && (
              <span className="h-3 w-3 rounded-full border-[1.5px] border-white/40 border-t-white animate-spin-slow" />
            )}
          </button>
        );
      })}
    </div>
  );
}
