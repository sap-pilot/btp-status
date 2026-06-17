import type { HistoryFile } from '@shared/types';

interface StatusDotsProps {
  history: HistoryFile[];
  maxDots?: number;
}

function formatTs(ms: number): string {
  return new Date(ms).toLocaleString();
}

export default function StatusDots({ history, maxDots = 48 }: StatusDotsProps) {
  const nonEmpty = history.length;
  const upCount = history.filter(h => h.overallStatus === 200).length;
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
          const color = d.overallStatus === 200 ? 'bg-green-500' : 'bg-red-500';
          const title = `${formatTs(d.timestamp)} — ${d.responseTime}ms — ${d.overallStatus === 200 ? 'OK' : 'FAIL'}`;
          return (
            <span
              key={i}
              className={`inline-block w-2.5 h-5 rounded-sm ${color} cursor-default`}
              title={title}
            />
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {uptime}% up
      </span>
      {avgMs > 0 && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          avg {avgMs}ms
        </span>
      )}
    </div>
  );
}
