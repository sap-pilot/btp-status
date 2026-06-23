import type { HistoryFile } from '@shared/types';

interface StatusDotsProps {
  history: HistoryFile[];
  maxDots?: number;
  showAvg?: boolean;
  showUptime?: boolean;
  onDotClick?: (file: HistoryFile) => void;
}

function dotTooltip(d: HistoryFile): string {
  const date = new Date(d.timestamp);
  const label =
    d.overallStatus === 200 ? 'OK' :
    d.overallStatus === 203 ? 'OK (always ok)' :
    d.overallStatus === 503 ? 'FAIL (always error)' : 'FAIL';
  return [
    d.filename,
    `date: ${date.toLocaleDateString()}`,
    `time: ${date.toLocaleTimeString()}`,
    `from: ${d.city ?? 'unknown'}`,
    `response time: ${d.responseTime} ms`,
    `status: ${d.overallStatus} ${label}`,
  ].join('\n');
}

export default function StatusDots({ history, maxDots = 48, showAvg = true, showUptime = true, onDotClick }: StatusDotsProps) {
  const nonEmpty = history.length;
  const upCount = history.filter(h => h.overallStatus === 200 || h.overallStatus === 203).length;
  const uptime = nonEmpty > 0 ? Math.round((upCount / nonEmpty) * 100) : 100;
  const avgMs =
    nonEmpty > 0 ? Math.round(history.reduce((s, h) => s + h.responseTime, 0) / nonEmpty) : 0;

  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  const hasOverflow = sorted.length > maxDots;

  // When overflowing: shrink dots to fit all in the same ~maxDots*12px budget.
  // Gap collapses to 1px; dotPx is the computed per-dot width (min 1px).
  const dotPx = hasOverflow
    ? Math.max(1, Math.floor((maxDots * 12 - (sorted.length - 1)) / sorted.length))
    : null;

  // Normal mode: pad left with empty slots. Overflow mode: show all dots.
  const displayDots: (HistoryFile | null)[] = hasOverflow
    ? sorted
    : [...Array(maxDots - sorted.length).fill(null), ...sorted];

  const dotStyle = dotPx !== null ? { width: `${dotPx}px` } : undefined;
  const widthClass = dotPx !== null ? '' : 'w-2.5';
  const gapClass = hasOverflow ? 'gap-px' : 'gap-0.5';

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className={`flex ${gapClass} flex-shrink-0`}>
        {displayDots.map((d, i) => {
          if (!d) {
            return (
              <span
                key={i}
                className={`inline-block ${widthClass} h-5 rounded-sm bg-gray-700 opacity-40`}
                style={dotStyle}
              />
            );
          }
          const color =
            d.overallStatus === 200 ? 'bg-green-500' :
            d.overallStatus === 203 ? 'bg-emerald-700' :
            d.overallStatus === 503 ? 'bg-red-900' :
            'bg-red-500';
          const title = dotTooltip(d);
          if (onDotClick) {
            return (
              <button
                key={i}
                type="button"
                className={`inline-block ${widthClass} h-5 rounded-sm ${color} cursor-pointer hover:opacity-75 hover:scale-110 transition-transform focus:outline-none focus:ring-1 focus:ring-white/50`}
                style={dotStyle}
                title={title}
                onClick={() => onDotClick(d)}
              />
            );
          }
          return (
            <span
              key={i}
              className={`inline-block ${widthClass} h-5 rounded-sm ${color} cursor-default`}
              style={dotStyle}
              title={title}
            />
          );
        })}
      </div>
      {showUptime && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {uptime}% up
        </span>
      )}
      {showAvg && avgMs > 0 && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          avg {avgMs}ms
        </span>
      )}
    </div>
  );
}
