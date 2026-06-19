import type { HistoryFile } from '@shared/types';

interface StatusDotsProps {
  history: HistoryFile[];
  maxDots?: number;
  showAvg?: boolean;
  showUptime?: boolean;
  onDotClick?: (file: HistoryFile) => void;
}

function formatTs(ms: number): string {
  return new Date(ms).toLocaleString();
}

export default function StatusDots({ history, maxDots = 48, showAvg = true, showUptime = true, onDotClick }: StatusDotsProps) {
  const nonEmpty = history.length;
  const upCount = history.filter(h => h.overallStatus === 200 || h.overallStatus === 203).length;
  const uptime = nonEmpty > 0 ? Math.round((upCount / nonEmpty) * 100) : 100;
  const avgMs =
    nonEmpty > 0 ? Math.round(history.reduce((s, h) => s + h.responseTime, 0) / nonEmpty) : 0;

  // Sorted newest-last for display (left=oldest, right=newest)
  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  const dots: (HistoryFile | null)[] = [];

  if (sorted.length >= maxDots) {
    dots.push(...sorted.slice(sorted.length - maxDots));
  } else {
    const padding = maxDots - sorted.length;
    for (let i = 0; i < padding; i++) dots.push(null);
    dots.push(...sorted);
  }

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex gap-0.5 flex-shrink-0">
        {dots.map((d, i) => {
          if (!d) {
            return (
              <span
                key={i}
                className="inline-block w-2.5 h-5 rounded-sm bg-gray-700 opacity-40"
              />
            );
          }
          const color =
            d.overallStatus === 200 ? 'bg-green-500' :
            d.overallStatus === 203 ? 'bg-emerald-700' :
            d.overallStatus === 503 ? 'bg-red-900' :
            'bg-red-500';
          const label = d.overallStatus === 200 ? 'OK' : d.overallStatus === 203 ? 'OK (always)' : d.overallStatus === 503 ? 'FAIL (always)' : 'FAIL';
          const title = `${formatTs(d.timestamp)} — ${d.responseTime}ms — ${label}`;
          if (onDotClick) {
            return (
              <button
                key={i}
                type="button"
                className={`inline-block w-2.5 h-5 rounded-sm ${color} cursor-pointer hover:opacity-75 hover:scale-110 transition-transform focus:outline-none focus:ring-1 focus:ring-white/50`}
                title={title}
                onClick={() => onDotClick(d)}
              />
            );
          }
          return (
            <span
              key={i}
              className={`inline-block w-2.5 h-5 rounded-sm ${color} cursor-default`}
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
