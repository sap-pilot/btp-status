import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ServiceWithHistory, HistoryFile } from '@shared/types';
import StatusDots from '@/components/StatusDots';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, RefreshCw, Sun, Moon, ExternalLink, Zap } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useWindowWidth } from '@/hooks/useWindowWidth';

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
  const windowWidth = useWindowWidth();
  // max-w-7xl (1280px) page with px-4 (32px) → page content width
  // table-fixed: service col w-56 (224px) + stats col w-40 (160px) + 3×px-4 cells (96px)
  // timeline td inner width = content - 224 - 160 - 96 = content - 480
  // each dot slot = w-2.5 (10px) + gap-0.5 (2px) = 12px
  const timelineWidth = Math.min(windowWidth, 1280) - 32 - 360;
  const maxDots = Math.max(8, Math.floor(timelineWidth / 12));

  const [hours, setHours] = useState(24);
  const [data, setData] = useState<ServiceWithHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshTick, setRefreshTick] = useState(0);
  const [testingAll, setTestingAll] = useState(false);
  const [syncAvailable, setSyncAvailable] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch('/api/info')
      .then(r => r.json() as Promise<{ syncRemote: boolean }>)
      .then(d => setSyncAvailable(d.syncRemote))
      .catch(() => null);
  }, []);

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
  }, [hours, refreshTick]);

  async function runSync() {
    setSyncing(true);
    try {
      await fetch('/api/sync', { method: 'POST' });
    } finally {
      setSyncing(false);
      setRefreshTick(t => t + 1);
    }
  }

  async function runAllTests() {
    setTestingAll(true);
    try {
      await Promise.all(
        data.map(svc =>
          fetch(`/api/check/${encodeURIComponent(svc.name)}`).catch(() => null),
        ),
      );
    } finally {
      setTestingAll(false);
      setRefreshTick(t => t + 1);
    }
  }

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
  const anyCurrentlyFailing = data.some(s => getServiceOverallHistory(s)[0]?.overallStatus === 500);
  const anyImperfect = data.some(s => {
    const h = getServiceOverallHistory(s);
    return h.length > 0 && getUptimePct(h) < 100;
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/images/favicon-32x32.png" alt="" className="h-5 w-5" />
            <h1 className="text-lg font-semibold">BTP Service Status</h1>
            <span className="text-xs text-muted-foreground font-mono">
              v{__APP_VERSION__}+{__COMMIT_HASH__}.{__BUILD_DATE__}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Refreshed {lastRefresh.toLocaleTimeString()}
            </span>
            <Badge
              variant={anyCurrentlyFailing ? 'destructive' : 'outline'}
              className={
                anyCurrentlyFailing ? '' :
                anyImperfect ? 'border-yellow-600 text-yellow-400' :
                'bg-green-600 hover:bg-green-600 border-green-600 text-white'
              }
            >
              {healthyServices}/{totalServices} healthy
            </Badge>
            <button
              onClick={() => void runAllTests()}
              disabled={testingAll || data.length === 0}
              className="text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-xs"
              title="Run health checks for all services"
            >
              <Zap className={`h-4 w-4 ${testingAll ? 'animate-pulse text-yellow-400' : ''}`} />
              {testingAll ? 'Running…' : 'Test all'}
            </button>
            {syncAvailable && (
              <button
                onClick={() => void runSync()}
                disabled={syncing}
                className="text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-xs"
                title="Sync response files from remote"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin text-blue-400' : ''}`} />
                {syncing ? 'Syncing…' : 'Sync'}
              </button>
            )}
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
        {loading && <span className="text-xs text-muted-foreground">Loading…</span>}

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
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-56" />  {/* service name — fixed */}
                  <col />                   {/* timeline — takes remaining space */}
                  <col className="w-40" />  {/* stats — fixed */}
                </colgroup>
                <tbody>
                  {services.map(svc => {
                    const combined = getServiceOverallHistory(svc);
                    const uptime = getUptimePct(combined);
                    const lastStatus = combined[0]?.overallStatus;
                    const lastMs = combined[0]?.responseTime ?? null;
                    const avgMs = combined.length > 0
                      ? Math.round(combined.reduce((s, h) => s + h.responseTime, 0) / combined.length)
                      : null;

                    return (
                      <tr
                        key={svc.name}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        {/* Service name — fixed width so all timelines start at the same X */}
                        <td className="px-4 py-3 align-middle">
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
                              to={`/service/${encodeURIComponent(svc.name)}`}
                              className="text-sm font-medium hover:text-primary transition-colors truncate"
                            >
                              {svc.name}
                            </Link>
                            {svc.homepage && (
                              <a
                                href={svc.homepage}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Open ${svc.name} homepage`}
                                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                                onClick={e => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground pl-4 mt-0.5">
                            {svc.endpoints.length} endpoint{svc.endpoints.length !== 1 ? 's' : ''}
                          </div>
                        </td>

                        {/* Timeline — fills all remaining width */}
                        <td className="px-4 py-3 align-middle">
                          <StatusDots history={combined} maxDots={maxDots} showUptime={false} showAvg={false} />
                        </td>

                        {/* Stats — fixed width, badge + avg/latest stacked */}
                        <td className="px-4 py-3 align-middle">
                          <div className="flex flex-col items-end gap-1">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                combined.length === 0
                                  ? 'text-muted-foreground'
                                  : lastStatus === 500
                                  ? 'border-red-600 text-red-400'
                                  : uptime < 100
                                  ? 'border-yellow-600 text-yellow-400'
                                  : 'border-green-600 text-green-400'
                              }`}
                            >
                              {combined.length > 0 ? `${uptime}% up` : 'no data'}
                            </Badge>
                            {avgMs != null && lastMs != null && (
                              <span className="text-xs text-muted-foreground whitespace-nowrap" title="average / latest response time (ms)">
                                {avgMs}/{lastMs}ms
                              </span>
                            )}
                          </div>
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
            <img src="/images/favicon-32x32.png" alt="" className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No services configured.</p>
            <p className="text-xs mt-1">Create a config.json and restart the server.</p>
          </div>
        )}
      </main>
    </div>
  );
}
