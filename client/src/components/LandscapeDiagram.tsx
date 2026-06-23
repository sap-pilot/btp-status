import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

export type NodeStatus = 'ok' | 'warn' | 'error';

const STATUS_FILL: Record<NodeStatus, string> = {
  ok:    '#2e6f40',
  warn:  '#92400e',
  error: '#7f1d1d',
};
const STATUS_STROKE: Record<NodeStatus, string> = {
  ok:    '#4a9a5a',
  warn:  '#d97706',
  error: '#ef4444',
};

interface LandscapeDiagramProps {
  /** Raw mermaid diagram source from config */
  diagramText: string;
  /** service name → status; only services in this landscape */
  serviceStatuses: Record<string, NodeStatus>;
  /** all service names in this landscape (even without history) for click nav */
  serviceNames: ReadonlySet<string>;
  isDark: boolean;
  /** URL to encode as ?from= in node click hrefs so the service page can navigate back here */
  returnUrl?: string;
}

let mermaidIdCounter = 0;

export default function LandscapeDiagram({
  diagramText,
  serviceStatuses,
  serviceNames,
  isDark,
  returnUrl,
}: LandscapeDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!diagramText || !el) return;
    let cancelled = false;
    setError(null);

    void (async () => {
      try {
        // Inject style + click directives at the end of the diagram string
        const lines = [diagramText.trimEnd()];
        for (const [name, status] of Object.entries(serviceStatuses)) {
          lines.push(`style ${name} fill:${STATUS_FILL[status]},stroke:${STATUS_STROKE[status]},color:#fff`);
        }
        for (const name of serviceNames) {
          const from = returnUrl ? `?from=${encodeURIComponent(returnUrl)}` : '';
          lines.push(`click ${name} "/service/${name}${from}" "Drill down into service ${name} status"`);
        }
        const augmented = lines.join('\n');

        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'loose',
        });

        const id = `mmd-${++mermaidIdCounter}`;
        const { svg } = await mermaid.render(id, augmented);
        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = svg;
        const svgEl = containerRef.current.querySelector('svg');
        if (svgEl) {
          svgEl.removeAttribute('width');
          svgEl.style.width = '100%';
          svgEl.style.height = 'auto';
          // Make subgraph cluster backgrounds transparent
          svgEl.querySelectorAll<SVGRectElement>('g.cluster > rect').forEach(rect => {
            rect.style.fill = 'transparent';
          });
        }
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => { cancelled = true; };
  // Stringify deps so the effect only re-runs when content actually changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramText, isDark, JSON.stringify(serviceStatuses), [...serviceNames].sort().join('\0')]);

  if (!diagramText) {
    return (
      <div className="text-xs text-muted-foreground p-6 text-center">
        No diagram defined for this landscape.
      </div>
    );
  }
  if (error) {
    return <div className="text-xs text-destructive p-4">Diagram error: {error}</div>;
  }
  return <div ref={containerRef} className="overflow-auto w-full" />;
}
