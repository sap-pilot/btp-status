import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ServiceWithHistory, HistoryFile, LandscapeConfig, SiteConfig } from '@shared/types';
import StatusDots from '@/components/StatusDots';
import type { NodeStatus } from '@/components/LandscapeDiagram';
const LandscapeDiagram = lazy(() => import('@/components/LandscapeDiagram'));
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertCircle, ChevronDown, Menu, RefreshCw, Sun, Moon, ExternalLink, X, Zap } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useWindowWidth } from '@/hooks/useWindowWidth';
import { useAuth } from '@/hooks/useAuth';
import AuthButton from '@/components/AuthButton';

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
    const first = files[0];
    // If any file has an override status (203/503), use the first override found
    const override = files.find(f => f.overallStatus === 203 || f.overallStatus === 503);
    if (override) {
      combined.push({ ...first, overallStatus: override.overallStatus });
    } else {
      const allPassed = files.every(f => f.overallStatus === 200);
      combined.push({ ...first, overallStatus: allPassed ? 200 : 500 });
    }
  }
  return combined.sort((a, b) => b.timestamp - a.timestamp);
}

function fmtUptime(n: number): string {
  return parseFloat(n.toFixed(2)) === 100 ? '100%' : `${n.toFixed(2)}%`;
}

function getUptimePct(history: HistoryFile[]): number {
  if (history.length === 0) return 100;
  const up = history.filter(h => h.overallStatus === 200 || h.overallStatus === 203).length;
  return (up / history.length) * 100;
}

export default function Overview() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const auth = useAuth();
  const windowWidth = useWindowWidth();
  // max-w-7xl (1280px) page with px-4 (32px) → page content width
  // table-fixed: service col w-56 (224px) + stats col w-40 (160px) + 3×px-4 cells (96px)
  // timeline td inner width = content - 224 - 160 - 96 = content - 480
  // each dot slot = w-2.5 (10px) + gap-0.5 (2px) = 12px
  const timelineWidth = Math.min(windowWidth, 1280) - 32 - 224; // 170 (name col) + 110 (badge col) - ~24 card/border, timeline td px-0
  const maxDots = Math.max(8, Math.floor(timelineWidth / 12));
  const isMobile = windowWidth < 640;

  const [hours, setHours] = useState(24);
  const [data, setData] = useState<ServiceWithHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshTick, setRefreshTick] = useState(0);
  const [testingAll, setTestingAll] = useState(false);
  const [syncAvailable, setSyncAvailable] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [serverCity, setServerCity] = useState<string>('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [landscapes, setLandscapes] = useState<LandscapeConfig[]>([]);
  const [sites, setSites] = useState<SiteConfig[]>([]);
  const [activeLandscape, setActiveLandscape] = useState<string>(() => {
    const h = window.location.hash;
    return h.startsWith('#landscape-') ? decodeURIComponent(h.slice('#landscape-'.length)) : '';
  });

  useEffect(() => {
    fetch('/api/info')
      .then(r => r.json() as Promise<{ syncRemote: boolean; city?: string; sites?: SiteConfig[] }>)
      .then(d => {
        setSyncAvailable(d.syncRemote);
        if (d.city && d.city !== 'unknown') setServerCity(d.city);
        if (d.sites) setSites(d.sites);
      })
      .catch(() => null);
    fetch('/api/landscapes')
      .then(r => r.json() as Promise<LandscapeConfig[]>)
      .then(ls => {
        setLandscapes(ls);
        setActiveLandscape(prev => {
          if (prev && ls.some(l => l.name === prev)) return prev;
          return ls[0]?.name ?? '';
        });
      })
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
    const last = h[0]?.overallStatus;
    return h.length === 0 || last === 200 || last === 203;
  }).length;
  const anyCurrentlyFailing = data.some(s => {
    const last = getServiceOverallHistory(s)[0]?.overallStatus;
    return last === 500 || last === 503;
  });
  const anyImperfect = data.some(s => {
    const h = getServiceOverallHistory(s);
    return h.length > 0 && getUptimePct(h) < 100;
  });

  // Aggregate stats — raw endpoint files for check/response counts; combined runs for uptime
  const allFiles = data.flatMap(s => s.history);
  const totalChecks = allFiles.length;
  const failedChecks = allFiles.filter(f => f.overallStatus === 500 || f.overallStatus === 503).length;
  const avgResponseTime = totalChecks > 0
    ? Math.round(allFiles.reduce((s, f) => s + f.responseTime, 0) / totalChecks)
    : 0;
  // Use combined per-run history so multi-endpoint services don't dilute the uptime %
  const allCombinedRuns = data.flatMap(s => getServiceOverallHistory(s));
  const overallUptime = allCombinedRuns.length > 0
    ? allCombinedRuns.filter(h => h.overallStatus === 200 || h.overallStatus === 203).length / allCombinedRuns.length * 100
    : 100;
  const overallUptimeColor = anyCurrentlyFailing ? 'text-red-500' : overallUptime < 100 ? 'text-yellow-500' : 'text-green-500';

  // Per-service status for diagram coloring (3 states)
  const serviceStatusMap = useMemo<Record<string, NodeStatus>>(() => {
    const map: Record<string, NodeStatus> = {};
    for (const svc of data) {
      const combined = getServiceOverallHistory(svc);
      const last = combined[0]?.overallStatus;
      if (last === 500 || last === 503) {
        map[svc.name] = 'error';
      } else if (last === 200 || last === 203) {
        const allOk = combined.every(h => h.overallStatus === 200 || h.overallStatus === 203);
        map[svc.name] = allOk ? 'ok' : 'warn';
      }
    }
    return map;
  }, [data]);

  // Per-landscape availability badge
  function landscapeBadgeProps(landscapeName: string) {
    const svcs = data.filter(s => s.landscapes?.includes(landscapeName));
    if (svcs.length === 0) return { label: '—', cls: '' };
    const statuses = svcs.map(s => getServiceOverallHistory(s)[0]?.overallStatus);
    const anyFail = statuses.some(st => st === 500 || st === 503);
    const allOk = statuses.every(st => st === 200 || st === 203 || st === undefined);
    const combinedRuns = svcs.flatMap(s => getServiceOverallHistory(s));
    const uptime = combinedRuns.length > 0
      ? combinedRuns.filter(h => h.overallStatus === 200 || h.overallStatus === 203).length / combinedRuns.length * 100
      : 100;
    const label = fmtUptime(uptime);
    if (anyFail) return { label, cls: 'border-red-600 text-red-400' };
    if (!allOk) return { label, cls: 'border-yellow-600 text-yellow-400' };
    return { label, cls: 'border-green-600 text-green-400' };
  }

  function handleLandscapeChange(name: string) {
    setActiveLandscape(name);
    window.location.hash = `#landscape-${encodeURIComponent(name)}`;
  }

  const appTitle = `BTP Status${serverCity ? ` (${serverCity})` : ''}`;

  useEffect(() => {
    document.title = appTitle;
  }, [appTitle]);

  const currentSiteUrl = sites.find(s => {
    try { return new URL(s.url).origin === window.location.origin; } catch { return false; }
  })?.url ?? '';

  function handleSiteSwitch(url: string) {
    if (url && url !== currentSiteUrl) window.location.replace(url);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/images/favicon-32x32.png" alt="" className="h-5 w-5" />
            <h1 className="text-base sm:text-lg font-semibold">{appTitle}</h1>
            {sites.length >= 2 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors" title="Switch site">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {sites.map(s => (
                    <DropdownMenuItem
                      key={s.url}
                      className={`text-xs cursor-pointer${s.url === currentSiteUrl ? ' font-semibold' : ''}`}
                      onSelect={() => handleSiteSwitch(s.url)}
                    >
                      {s.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <a
              href="https://github.com/sap-pilot/btp-status/releases"
              target="_blank"
              rel="noopener noreferrer"
              title={`v${__APP_VERSION__}+${__COMMIT_HASH__} built at: ${new Date(__BUILD_DATE__).toLocaleString(undefined, { timeZoneName: 'short' })}`}
              className="text-xs text-muted-foreground font-mono hover:text-foreground transition-colors"
            >
              v{__APP_VERSION__}+{__COMMIT_HASH__}
            </a>
          </div>
          {/* Desktop controls */}
          <div className="hidden sm:flex items-center gap-3">
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
            {(!auth.enabled || auth.loggedIn) && (
              <button
                onClick={() => void runAllTests()}
                disabled={testingAll || data.length === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-xs"
                title="Run health checks for all services"
              >
                <Zap className={`h-4 w-4 ${testingAll ? 'animate-pulse text-yellow-400' : ''}`} />
                {testingAll ? 'Running…' : 'Test all'}
              </button>
            )}
            {syncAvailable && (!auth.enabled || auth.loggedIn) && (
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
            <button
              onClick={toggleTheme}
              className="text-muted-foreground hover:text-foreground"
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <AuthButton auth={auth} />
          </div>
          {/* Mobile hamburger */}
          <button
            className="sm:hidden text-muted-foreground hover:text-foreground p-1"
            onClick={() => setMenuOpen(o => !o)}
            title={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div className="sm:hidden border-t border-border bg-background">
            <div className="max-w-7xl mx-auto px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Refreshed {lastRefresh.toLocaleTimeString()}</span>
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
              </div>
              <div className="flex items-center gap-2">
                <Select value={String(hours)} onValueChange={v => setHours(Number(v))}>
                  <SelectTrigger className="flex-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOUR_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(!auth.enabled || auth.loggedIn) && (
                  <button
                    onClick={() => void runAllTests()}
                    disabled={testingAll || data.length === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-xs"
                    title="Run health checks for all services"
                  >
                    <Zap className={`h-4 w-4 ${testingAll ? 'animate-pulse text-yellow-400' : ''}`} />
                    {testingAll ? 'Running…' : 'Test all'}
                  </button>
                )}
                {syncAvailable && (!auth.enabled || auth.loggedIn) && (
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
                <AuthButton auth={auth} />
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {loading && <span className="text-xs text-muted-foreground">Loading…</span>}

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Aggregate stats */}
        {data.length > 0 && (
          <div className="grid grid-cols-4 gap-3 sm:gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className={`text-base sm:text-2xl font-bold ${overallUptimeColor}`}>{fmtUptime(overallUptime)}</div>
                <div className="text-xs text-muted-foreground mt-1">Overall Uptime</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className={`text-base sm:text-2xl font-bold ${failedChecks > 0 ? 'text-red-500' : ''}`}>{failedChecks}</div>
                <div className="text-xs text-muted-foreground mt-1">Failed Checks</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-base sm:text-2xl font-bold">{totalChecks}</div>
                <div className="text-xs text-muted-foreground mt-1">Total Checks</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-base sm:text-2xl font-bold">{avgResponseTime > 0 ? `${avgResponseTime}ms` : '—'}</div>
                <div className="text-xs text-muted-foreground mt-1">Avg Response Time</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Landscape tabs */}
        {landscapes.length > 0 && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <Tabs value={activeLandscape} onValueChange={handleLandscapeChange}>
                <TabsList className="flex-wrap h-auto gap-1 mb-4">
                  {landscapes.map(ls => {
                    const badge = landscapeBadgeProps(ls.name);
                    return (
                      <TabsTrigger key={ls.name} value={ls.name} className="gap-2">
                        {ls.name}
                        {badge.label !== '—' && (
                          <Badge variant="outline" className={`text-xs ${badge.cls}`}>
                            {badge.label}
                          </Badge>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                {landscapes.map(ls => {
                  // Filter to only services belonging to this landscape
                  const lsStatuses: Record<string, NodeStatus> = {};
                  const lsNames = new Set<string>();
                  for (const svc of data) {
                    if (!svc.landscapes?.includes(ls.name)) continue;
                    lsNames.add(svc.name);
                    const st = serviceStatusMap[svc.name];
                    if (st) lsStatuses[svc.name] = st;
                  }
                  return (
                    <TabsContent key={ls.name} value={ls.name}>
                      <Suspense fallback={<div className="text-xs text-muted-foreground p-6 text-center">Loading diagram…</div>}>
                        <LandscapeDiagram
                          diagramText={ls.diagram}
                          serviceStatuses={lsStatuses}
                          serviceNames={lsNames}
                          isDark={theme === 'dark'}
                          returnUrl={`/overview#landscape-${encodeURIComponent(ls.name)}`}
                        />
                      </Suspense>
                    </TabsContent>
                  );
                })}
              </Tabs>
            </CardContent>
          </Card>
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
              <table className={`w-full ${isMobile ? '' : 'table-fixed'}`}>
                {!isMobile && (
                  <colgroup>
                    <col className="w-[170px]" />
                    <col />
                    <col className="w-[110px]" />
                  </colgroup>
                )}
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
                                lastStatus === 200 ? 'bg-green-500' :
                                lastStatus === 203 ? 'bg-emerald-700' :
                                lastStatus === 503 ? 'bg-red-900' :
                                lastStatus === 500 ? 'bg-red-500' :
                                'bg-gray-500'
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

                        {/* Timeline — hidden on mobile */}
                        {!isMobile && (
                          <td className="px-0 py-3 align-middle">
                            <StatusDots
                              history={combined}
                              maxDots={maxDots}
                              showUptime={false}
                              showAvg={false}
                              onDotClick={file => navigate(
                                `/service/${encodeURIComponent(svc.name)}`,
                                { state: { autoOpenFilename: file.filename } },
                              )}
                            />
                          </td>
                        )}

                        {/* Stats — fixed width, badge + avg/latest stacked */}
                        <td className="px-2 py-3 align-middle">
                          <div className="flex flex-col items-end gap-1">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                combined.length === 0
                                  ? 'text-muted-foreground'
                                  : lastStatus === 500 || lastStatus === 503
                                  ? 'border-red-600 text-red-400'
                                  : uptime < 100
                                  ? 'border-yellow-600 text-yellow-400'
                                  : 'border-green-600 text-green-400'
                              }`}
                            >
                              {combined.length > 0 ? `${fmtUptime(uptime)} up` : 'no data'}
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
