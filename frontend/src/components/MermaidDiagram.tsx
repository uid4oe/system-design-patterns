import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";

let initialized = false;

function ensureInit() {
  if (initialized) return;
  initialized = true;
  mermaid.initialize({
    startOnLoad: false,
    theme: "neutral",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    fontSize: 12,
    flowchart: {
      curve: "basis",
      padding: 12,
      htmlLabels: true,
    },
    themeVariables: {
      primaryColor: "#dbeafe",
      primaryBorderColor: "#2563eb",
      primaryTextColor: "#1e293b",
      lineColor: "#94a3b8",
      secondaryColor: "#f1f5f9",
      tertiaryColor: "#f8fafc",
    },
  });
}

interface MermaidDiagramProps {
  source: string;
}

export function MermaidDiagram({ source }: MermaidDiagramProps) {
  const id = useId().replace(/:/g, "-");
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      ensureInit();
      try {
        const { svg } = await mermaid.render(`mermaid${id}`, source);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  if (error) {
    return (
      <pre className="text-[11px] leading-relaxed bg-[var(--color-surface-tertiary)] rounded-lg p-3 overflow-x-auto font-mono text-[var(--color-text-secondary)]">
        <code>{source}</code>
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      className="rounded-lg bg-[var(--color-surface-tertiary)] p-3 overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
    />
  );
}
