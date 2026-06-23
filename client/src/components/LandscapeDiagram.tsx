import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface LandscapeDiagramProps {
  diagramText: string;
  /** map of service name → status */
  serviceStatuses: Record<string, 'ok' | 'error'>;
  onNodeClick: (serviceId: string) => void;
  isDark: boolean;
}

let mermaidIdCounter = 0;

export default function LandscapeDiagram({
  diagramText,
  serviceStatuses,
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

  // Apply status colours and click handlers after SVG render or status change
  useEffect(() => {
    const el = containerRef.current;
    if (!svgReady || !el) return;
    const svgEl = el.querySelector('svg');
    if (!svgEl) return;

    const cleanups: (() => void)[] = [];

    svgEl.querySelectorAll<SVGGElement>('g[id^="flowchart-"]').forEach(nodeEl => {
      // mermaid id format: flowchart-{nodeId}-{index}
      const nodeId = nodeEl.id.replace(/^flowchart-/, '').replace(/-\d+$/, '');
      const status = serviceStatuses[nodeId];
      if (!status) return;

      // Colour the primary shape inside the node group
      const shape = nodeEl.querySelector<SVGElement>('rect, circle, polygon, ellipse');
      if (shape) {
        shape.style.fill = status === 'ok' ? '#2e6f40' : '#f33';
        shape.style.stroke = status === 'ok' ? '#4a9a5a' : '#f55';
      }

      (nodeEl as unknown as HTMLElement).style.cursor = 'pointer';
      const handler = () => onClickRef.current(nodeId);
      nodeEl.addEventListener('click', handler);
      cleanups.push(() => nodeEl.removeEventListener('click', handler));
    });

    return () => cleanups.forEach(fn => fn());
  }, [svgReady, serviceStatuses]);

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
