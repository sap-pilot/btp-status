import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

export type NodeStatus = 'ok' | 'warn' | 'error';

const STATUS_FILL: Record<NodeStatus, string> = {
  ok:   '#2e6f40',
  warn: '#92400e',
  error: '#7f1d1d',
};
const STATUS_STROKE: Record<NodeStatus, string> = {
  ok:   '#4a9a5a',
  warn: '#d97706',
  error: '#ef4444',
};

interface LandscapeDiagramProps {
  diagramText: string;
  /** map of service name → status (coloured nodes) */
  serviceStatuses: Record<string, NodeStatus>;
  /** all known service names — any matching node gets a click handler */
  serviceNames: ReadonlySet<string>;
  onNodeClick: (serviceId: string) => void;
  isDark: boolean;
}

let mermaidIdCounter = 0;

export default function LandscapeDiagram({
  diagramText,
  serviceStatuses,
  serviceNames,
  onNodeClick,
  isDark,
}: LandscapeDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgReady, setSvgReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onClickRef = useRef(onNodeClick);
  onClickRef.current = onNodeClick;

  // Render SVG whenever diagram text or theme changes
  useEffect(() => {
    const el = containerRef.current;
    if (!diagramText || !el) return;
    let cancelled = false;
    setSvgReady(false);
    setError(null);

    void (async () => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'loose',
        });
        const id = `mmd-${++mermaidIdCounter}`;
        const { svg } = await mermaid.render(id, diagramText);
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
        const svgEl = containerRef.current.querySelector('svg');
        if (svgEl) {
          svgEl.removeAttribute('width');
          svgEl.style.width = '100%';
          svgEl.style.height = 'auto';
        }
        if (!cancelled) setSvgReady(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => { cancelled = true; };
  }, [diagramText, isDark]);

  // Post-process SVG: transparent subgraphs, status colours, click handlers
  useEffect(() => {
    const el = containerRef.current;
    if (!svgReady || !el) return;
    const svgEl = el.querySelector('svg');
    if (!svgEl) return;

    // Make subgraph (cluster) backgrounds transparent
    svgEl.querySelectorAll<SVGRectElement>('g.cluster > rect').forEach(rect => {
      rect.style.fill = 'transparent';
    });

    const cleanups: (() => void)[] = [];

    svgEl.querySelectorAll<SVGGElement>('g[id^="flowchart-"]').forEach(nodeEl => {
      // Prefer data-id (mermaid v10+), fall back to id parsing
      const nodeId =
        nodeEl.getAttribute('data-id') ??
        nodeEl.id.replace(/^flowchart-/, '').replace(/-\d+$/, '');

      const status = serviceStatuses[nodeId];

      // Apply status fill/stroke to the primary shape
      if (status) {
        const shape = nodeEl.querySelector<SVGElement>('rect, circle, polygon, ellipse');
        if (shape) {
          shape.style.fill = STATUS_FILL[status];
          shape.style.stroke = STATUS_STROKE[status];
        }
      }

      // Click handler for any node matching a known service
      if (serviceNames.has(nodeId)) {
        (nodeEl as unknown as HTMLElement).style.cursor = 'pointer';
        (nodeEl as unknown as HTMLElement).style.pointerEvents = 'all';
        const handler = (e: Event) => {
          e.stopPropagation();
          onClickRef.current(nodeId);
        };
        nodeEl.addEventListener('click', handler);
        cleanups.push(() => nodeEl.removeEventListener('click', handler));
      }
    });

    return () => cleanups.forEach(fn => fn());
  }, [svgReady, serviceStatuses, serviceNames]);

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
