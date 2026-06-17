import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ServiceWithHistory, HistoryFile } from '@shared/types';
import StatusDots from '@/components/StatusDots';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, AlertCircle, RefreshCw, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

const HOUR_OPTIONS = [
  { value: '1', label: 'Last 1 hour' },
  { value: '6', label: 'Last 6 hours' },
  { value: '12', label: 'Last 12 hours' },
  { value: '24', label: 'Last 24 hours' },
  { value: '48', label: 'Last 48 hours' },
  { value: '72', label: 'Last 72 hours' },
];

function getServiceOverallHistory(service: ServiceWithHistory): HistoryFile[] {
  // Group files by timestamp bucket (same second = same check run)
  // For each check run (same-timestamp files), overall pass = ALL endpoints passed
  const byTs = new Map<number, HistoryFile[]>();
  for (const f of service.history) {
    const bucket = Math.floor(f.timestamp / 1000); // group by second
    if (!byTs.has(bucket)) byTs.set(bucket, []);
    byTs.get(bucket)!.push(f);
  }

  const combined: HistoryFile[] = [];
  for (const [, files] of byTs) {
    const allPassed = files.every(f => f.overallStatus === 200);
    const first = files[0];
    combined.push({
      ...first,
      overallStatus: allPassed ? 200 : 500,
    });
  }
  return combined.sort((a, b) => b.timestamp - a.timestamp);
}

function getUptimePct(history: HistoryFile[]): number {
  if (history.length === 0) return 100;
  const up = history.filter(h => h.overallStatus === 200).length;
  return Math.round((up / history.length) * 100);
}

export default function Overview() {
  const { theme, toggleTheme } = useTheme();
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<ServiceWithHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/overview?hours=${hours}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ServiceWithHistory[]>;
      })
      .then(d => {
        setData(d);
        setLastRefresh(new Date());
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [hours]);

  const groups = data.reduce<Record<string, ServiceWithHistory[]>>((acc, svc) => {
    const g = svc.group || 'Default';
    if (!acc[g]) acc[g] = [];
    acc[g].push(svc);
    return acc;
  }, {});

  const totalServices = data.length;
  const healthyServices = data.filter(s => {
    const h = getServiceOverallHistory(s);
    return h.length === 0 || h[0]?.overallStatus === 200;
  }).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-green-500" />
            <h1 className="text-lg font-semibold">BTP Service Status</h1>
            <span className="text-xs text-muted-foreground font-mono">
              v{__APP_VERSION__}+{__COMMIT_HASH__}.{__BUILD_DATE__}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Refreshed {lastRefresh.toLocaleTimeString()}
            </span>
            <button
              onClick={() => setHours(h => { setTimeout(() => setHours(h), 0); return h; })}
              className="text-muted-foreground hover:text-foreground"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={toggleTheme}
              className="text-muted-foreground hover:text-foreground"
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <Select value={String(hours)} onValueChange={v => setHours(Number(v))}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOUR_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Summary */}
        <div className="flex items-center gap-4">
          <Badge
            variant={healthyServices === totalServices ? 'default' : 'destructive'}
            className={healthyServices === totalServices ? 'bg-green-600 hover:bg-green-600' : ''}
          >
            {healthyServices}/{totalServices} services healthy
          </Badge>
          {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Groups */}
        {Object.entries(groups).map(([group, services]) => (
          <Card key={group}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium text-muted-foreground uppercase tracking-wider">
                {group}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2 font-medium w-48">Service</th>
                    <th className="text-left px-4 py-2 font-medium">Status Timeline</th>
                    <th className="text-right px-4 py-2 font-medium w-24">Uptime</th>
                    <th className="text-right px-4 py-2 font-medium w-24">Last Check</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map(svc => {
                    const combined = getServiceOverallHistory(svc);
                    const uptime = getUptimePct(combined);
                    const lastStatus = combined[0]?.overallStatus;
                    const lastMs = combined[0]?.responseTime;

                    return (
                      <tr
                        key={svc.name}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                lastStatus === 200
                                  ? 'bg-green-500'
                                  : lastStatus === 500
                                  ? 'bg-red-500'
                                  : 'bg-gray-500'
                              }`}
                            />
                            <Link
                              to={`/history/${encodeURIComponent(svc.name)}`}
                              className="text-sm font-medium hover:text-primary transition-colors truncate"
                            >
                              {svc.name}
                            </Link>
                          </div>
                          <div className="text-xs text-muted-foreground pl-4 mt-0.5">
                            {svc.endpoints.length} endpoint{svc.endpoints.length !== 1 ? 's' : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusDots history={combined} maxDots={48} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge
                            variant={uptime >= 90 ? 'outline' : uptime >= 70 ? 'secondary' : 'destructive'}
                            className={`text-xs ${
                              uptime >= 90
                                ? 'border-green-600 text-green-400'
                                : uptime >= 70
                                ? 'text-yellow-400'
                                : ''
                            }`}
                          >
                            {combined.length > 0 ? `${uptime}%` : 'no data'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                          {lastMs != null ? `${lastMs}ms` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}

        {!loading && data.length === 0 && !error && (
          <div className="text-center text-muted-foreground py-16">
            <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No services configured.</p>
            <p className="text-xs mt-1">Create a config.json and restart the server.</p>
          </div>
        )}
      </main>
    </div>
  );
}
