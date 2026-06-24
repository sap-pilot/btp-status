import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function fmtUptime(n: number): string {
  return parseFloat(n.toFixed(2)) === 100 ? '100%' : `${n.toFixed(2)}%`;
}
import { Link, useLocation, useParams } from 'react-router-dom';
import type { EvaluationMode, HistoryFile, ServiceConfig } from '@shared/types';
import StatusDots from '@/components/StatusDots';
import ResponseTimeChart from '@/components/ResponseTimeChart';
import ResponseDetailModal from '@/components/ResponseDetailModal';
import TestModal from '@/components/TestModal';
import { useTimeRange, fmtDateRange } from '@/hooks/useTimeRange';
import DateRangePicker from '@/components/DateRangePicker';
import { parseFilename } from '@/lib/parseFilename';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, AlertCircle, ExternalLink, Menu, PlayCircle, Sun, Moon, X } from 'lucide-react';
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
  { value: 'range', label: 'Date Range…' },
];

const SCHEDULE_OPTIONS = [
  { value: '300', label: 'Every 5 min' },
  { value: '600', label: 'Every 10 min' },
  { value: '900', label: 'Every 15 min' },
  { value: '1800', label: 'Every 30 min' },
  { value: '3600', label: 'Every 1 hour' },
  { value: '0', label: 'Disable autorun' },
];

function evalTriggerClass(mode: EvaluationMode): string {
  if (mode === 'alwaysok') return 'bg-emerald-950 border-emerald-700 text-emerald-300 hover:bg-emerald-900';
  if (mode === 'alwayserror') return 'bg-red-950 border-red-700 text-red-400 hover:bg-red-900';
  return ''; // condition: default shadcn trigger styling
}

function formatTs(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export default function History() {
  const { name = '' } = useParams<{ name: string }>();
  const location = useLocation();
  const backTo = new URLSearchParams(location.search).get('from') ?? '/overview';
  const autoOpenFilename = (location.state as { autoOpenFilename?: string } | null)?.autoOpenFilename;
  const autoOpenHandled = useRef(false);
  const initialHash = useRef(location.hash.slice(1));
  const { theme, toggleTheme } = useTheme();
  const auth = useAuth();
  const adminTooltip = auth.enabled && auth.loggedIn && !auth.isAdmin
    ? 'Condition and schedule change are available for BTP_Status_Admin only; Contact security to get this role collection assigned to enable them'
    : undefined;
  const windowWidth = useWindowWidth();
  const dotAreaWidth = Math.min(windowWidth, 1024) - 140;
  const maxDots = Math.max(8, Math.floor(dotAreaWidth / 12));
  const isMobile = windowWidth < 640;

  const { range, setRange, queryString } = useTimeRange();
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [maxStorageDays, setMaxStorageDays] = useState(7);
  const [files, setFiles] = useState<HistoryFile[]>([]);
  const [service, setService] = useState<ServiceConfig | null>(null);
  const [selected, setSelected] = useState<HistoryFile | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Evaluation mode
  const [evalMode, setEvalMode] = useState<EvaluationMode>('condition');
  const [pendingEvalMode, setPendingEvalMode] = useState<EvaluationMode | null>(null);
  const [evalConfirmOpen, setEvalConfirmOpen] = useState(false);

  // Schedule
  const [scheduleInterval, setScheduleInterval] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Table filters
  const [filterEndpoint, setFilterEndpoint] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    fetch('/api/services')
      .then(r => r.json() as Promise<ServiceConfig[]>)
      .then(svcs => setService(svcs.find(s => s.name === name) ?? null))
      .catch(() => null);
    fetch('/api/info')
      .then(r => r.json() as Promise<{ maxStorageDays?: number }>)
      .then(d => { if (d.maxStorageDays !== undefined) setMaxStorageDays(d.maxStorageDays); })
      .catch(() => null);
  }, [name]);

  useEffect(() => {
    fetch(`/api/eval-mode/${encodeURIComponent(name)}`)
      .then(r => r.json() as Promise<{ mode: EvaluationMode }>)
      .then(d => setEvalMode(d.mode))
      .catch(() => null);
    fetch(`/api/schedule/${encodeURIComponent(name)}`)
      .then(r => r.json() as Promise<{ intervalSeconds: number }>)
      .then(d => setScheduleInterval(d.intervalSeconds))
      .catch(() => null);
  }, [name]);

  const fetchHistory = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/history/${encodeURIComponent(name)}?${queryString}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<string[]>;
      })
      .then(d => setFiles(d.map(fn => parseFilename(fn) ?? { filename: fn + '.json', overallStatus: 200 as const })))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [name, queryString]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  function openFile(file: HistoryFile | null) {
    setSelected(file);
    const base = `/service/${encodeURIComponent(name)}`;
    if (file) {
      const hash = file.filename.replace(/\.(json|png)$/, '');
      window.history.replaceState(null, '', `${base}#${hash}`);
    } else {
      window.history.replaceState(null, '', base);
    }
  }

  useEffect(() => {
    if (autoOpenHandled.current || files.length === 0) return;
    const target = initialHash.current || autoOpenFilename;
    if (!target) return;
    const match = files.find(
      f => f.filename === target || f.filename === `${target}.json`,
    );
    if (match) {
      openFile(match);
      autoOpenHandled.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, autoOpenFilename]);

  async function applyEvalMode(m: EvaluationMode) {
    try {
      await fetch(`/api/eval-mode/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: m }),
      });
      setEvalMode(m);
    } catch { /* ignore */ }
  }

  function handleEvalModeChange(newMode: string) {
    const m = newMode as EvaluationMode;
    if (m === evalMode) return;
    if (m === 'condition') {
      void applyEvalMode('condition');
    } else {
      setPendingEvalMode(m);
      setEvalConfirmOpen(true);
    }
  }

  async function confirmEvalMode() {
    if (!pendingEvalMode) return;
    const m = pendingEvalMode;
    setPendingEvalMode(null);
    setEvalConfirmOpen(false);
    await applyEvalMode(m);
  }

  function cancelEvalMode() {
    setPendingEvalMode(null);
    setEvalConfirmOpen(false);
  }

  async function applySchedule(intervalSeconds: number) {
    try {
      await fetch(`/api/schedule/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalSeconds }),
      });
      setScheduleInterval(intervalSeconds);
    } catch { /* ignore */ }
  }

  const upCount = files.filter(f => f.overallStatus === 200 || f.overallStatus === 203).length;
  const failedCount = files.filter(f => f.overallStatus === 500 || f.overallStatus === 503 || f.overallStatus === 504).length;
  const uptime = files.length > 0 ? (upCount / files.length) * 100 : 100;
  const latestTs = files.reduce((max, f) => Math.max(max, f.timestamp ?? 0), 0);
  const latestFailed = files.some(
    f => Math.floor((f.timestamp ?? 0) / 1000) === Math.floor(latestTs / 1000) && (f.overallStatus === 500 || f.overallStatus === 503 || f.overallStatus === 504),
  );
  const uptimeColor = files.length === 0 ? 'text-muted-foreground' : latestFailed ? 'text-red-500' : uptime < 100 ? 'text-yellow-500' : 'text-green-500';
  const timedFiles = files.filter(f => f.overallStatus !== 504);
  const avgMs =
    timedFiles.length > 0
      ? Math.round(timedFiles.reduce((s, f) => s + (f.responseTime ?? 0), 0) / timedFiles.length)
      : 0;

  const endpointLabel = (f: HistoryFile): string => {
    if (f.endpointSlug !== undefined) {
      // New-format file: try to match sanitized config name, else show slug as-is
      const match = service?.endpoints.find(
        e => (e.name ?? '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') === f.endpointSlug,
      );
      return match?.name ?? f.endpointSlug;
    }
    return service?.endpoints[f.endpointIndex ?? 0]?.name ?? `Endpoint ${f.endpointIndex ?? 0}`;
  };


  const endpointOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: string[] = [];
    for (const f of files) {
      const label = endpointLabel(f);
      if (!seen.has(label)) { seen.add(label); opts.push(label); }
    }
    return opts.sort();
  // endpointLabel depends on service
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, service]);

  const locationOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const f of files) if (f.city) seen.add(f.city);
    return [...seen].sort();
  }, [files]);

  const hasFilter = filterEndpoint !== 'all' || filterLocation !== 'all' || filterStatus !== 'all';

  const filteredFiles = useMemo(() => {
    if (!hasFilter) return files;
    return files.filter(f => {
      if (filterEndpoint !== 'all' && endpointLabel(f) !== filterEndpoint) return false;
      if (filterLocation !== 'all' && (f.city ?? '—') !== filterLocation) return false;
      if (filterStatus !== 'all' && String(f.overallStatus) !== filterStatus) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, service, filterEndpoint, filterLocation, filterStatus, hasFilter]);

  function clearFilters() {
    setFilterEndpoint('all');
    setFilterLocation('all');
    setFilterStatus('all');
  }

  // Build schedule select value — may not match a preset if config uses a custom interval
  const scheduleValue = scheduleInterval !== null ? String(scheduleInterval) : '';
  const scheduleOptions = [...SCHEDULE_OPTIONS];
  if (
    scheduleInterval !== null &&
    !SCHEDULE_OPTIONS.find(o => o.value === String(scheduleInterval))
  ) {
    const mins = scheduleInterval / 60;
    scheduleOptions.unshift({ value: String(scheduleInterval), label: `Every ${mins}min (config)` });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to={backTo}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Overview
            </Link>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-base font-semibold">{name}</h1>
            {service?.homepage && (
              <a
                href={service.homepage}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open ${name} homepage`}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {service && (
              <Badge variant="outline" className="text-xs">
                {service.group}
              </Badge>
            )}
          </div>
          {/* Desktop controls */}
          <div className="hidden sm:flex items-center gap-2">
            {/* Evaluation Mode selector — hidden when XSUAA enabled + not logged in; disabled when logged in but not admin */}
            {(!auth.enabled || auth.loggedIn) && (
              <span title={adminTooltip}>
                <Select
                  value={evalMode}
                  onValueChange={handleEvalModeChange}
                  disabled={auth.enabled && auth.loggedIn && !auth.isAdmin}
                >
                  <SelectTrigger className={`h-8 text-xs w-36 ${evalTriggerClass(evalMode)}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="condition" className="text-xs">Condition Based</SelectItem>
                    <SelectItem value="alwaysok" className="text-xs text-emerald-400">Always OK</SelectItem>
                    <SelectItem value="alwayserror" className="text-xs text-red-400">Always Error</SelectItem>
                  </SelectContent>
                </Select>
              </span>
            )}

            {/* Schedule selector — hidden when XSUAA enabled + not logged in; disabled when logged in but not admin */}
            {(!auth.enabled || auth.loggedIn) && (
              <span title={adminTooltip}>
                <Select
                  value={scheduleValue}
                  onValueChange={v => void applySchedule(Number(v))}
                  disabled={scheduleInterval === null || (auth.enabled && auth.loggedIn && !auth.isAdmin)}
                >
                  <SelectTrigger className="h-8 text-xs w-36">
                    <SelectValue placeholder="Schedule…" />
                  </SelectTrigger>
                  <SelectContent>
                    {scheduleOptions.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
            )}

            {(!auth.enabled || auth.loggedIn) && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setTestOpen(true)}
              >
                <PlayCircle className="h-3.5 w-3.5" />
                Run Test
              </Button>
            )}
            <Select
              value={range.mode === 'dateRange' ? '' : String(range.hours)}
              onValueChange={v => {
                if (v === 'range') { setDatePickerOpen(true); }
                else setRange({ mode: 'hours', hours: Number(v) });
              }}
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                {range.mode === 'dateRange'
                  ? <span className="truncate">{fmtDateRange(range.fromDate, range.untilDate)}</span>
                  : <SelectValue />
                }
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
            <div className="max-w-5xl mx-auto px-4 py-3 space-y-3">
              {(!auth.enabled || auth.loggedIn) && (
                <div className="grid grid-cols-2 gap-2">
                  <span title={adminTooltip}>
                    <Select
                      value={evalMode}
                      onValueChange={handleEvalModeChange}
                      disabled={auth.enabled && auth.loggedIn && !auth.isAdmin}
                    >
                      <SelectTrigger className={`h-9 text-xs w-full ${evalTriggerClass(evalMode)}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="condition" className="text-xs">Condition Based</SelectItem>
                        <SelectItem value="alwaysok" className="text-xs text-emerald-400">Always OK</SelectItem>
                        <SelectItem value="alwayserror" className="text-xs text-red-400">Always Error</SelectItem>
                      </SelectContent>
                    </Select>
                  </span>
                  <span title={adminTooltip}>
                    <Select
                      value={scheduleValue}
                      onValueChange={v => void applySchedule(Number(v))}
                      disabled={scheduleInterval === null || (auth.enabled && auth.loggedIn && !auth.isAdmin)}
                    >
                      <SelectTrigger className="h-9 text-xs w-full">
                        <SelectValue placeholder="Schedule…" />
                      </SelectTrigger>
                      <SelectContent>
                        {scheduleOptions.map(o => (
                          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Select
                  value={range.mode === 'dateRange' ? '' : String(range.hours)}
                  onValueChange={v => {
                    if (v === 'range') { setDatePickerOpen(true); setMenuOpen(false); }
                    else setRange({ mode: 'hours', hours: Number(v) });
                  }}
                >
                  <SelectTrigger className="flex-1 h-9 text-xs">
                    {range.mode === 'dateRange'
                      ? <span className="truncate">{fmtDateRange(range.fromDate, range.untilDate)}</span>
                      : <SelectValue />
                    }
                  </SelectTrigger>
                  <SelectContent>
                    {HOUR_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(!auth.enabled || auth.loggedIn) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 text-xs"
                    onClick={() => { setTestOpen(true); setMenuOpen(false); }}
                  >
                    <PlayCircle className="h-3.5 w-3.5" />
                    Run Test
                  </Button>
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

      <DateRangePicker
        open={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        onApply={(from, until) => setRange({ mode: 'dateRange', fromDate: from, untilDate: until })}
        fromDate={range.mode === 'dateRange' ? range.fromDate : new Date(Date.now() - 86400000).toISOString().slice(0, 10)}
        untilDate={range.mode === 'dateRange' ? range.untilDate : new Date().toISOString().slice(0, 10)}
        maxStorageDays={maxStorageDays}
      />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="stat-grid grid grid-cols-4 gap-3 sm:gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className={`text-base sm:text-2xl font-bold ${uptimeColor}`}>{fmtUptime(uptime)}</div>
              <div className="text-xs text-muted-foreground mt-1">Uptime</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className={`text-base sm:text-2xl font-bold ${failedCount > 0 ? 'text-red-500' : ''}`}>{failedCount}</div>
              <div className="text-xs text-muted-foreground mt-1">Failed Checks</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-base sm:text-2xl font-bold">{files.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Total Checks</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-base sm:text-2xl font-bold">{avgMs > 0 ? `${avgMs}ms` : '—'}</div>
              <div className="text-xs text-muted-foreground mt-1">Avg Response Time</div>
            </CardContent>
          </Card>
        </div>

        {/* Timeline card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatusDots history={files} maxDots={maxDots} showAvg={false} onDotClick={f => openFile(f)} />
          </CardContent>
        </Card>

        {/* Response Time Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Response Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponseTimeChart files={files} service={service} />
          </CardContent>
        </Card>

        {/* History table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground shrink-0">
                History
              </CardTitle>
              {hasFilter && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {filteredFiles.length} of {files.length}
                </span>
              )}
              {files.length > 0 && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {hasFilter && (
                    <button
                      onClick={clearFilters}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Clear filters
                    </button>
                  )}
                  <Select value={filterEndpoint} onValueChange={setFilterEndpoint}>
                    <SelectTrigger className="h-7 text-xs w-auto min-w-[9rem] max-w-[14rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All endpoints</SelectItem>
                      {endpointOptions.map(ep => (
                        <SelectItem key={ep} value={ep} className="text-xs">{ep}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterLocation} onValueChange={setFilterLocation}>
                    <SelectTrigger className="h-7 text-xs w-auto min-w-[9rem] max-w-[14rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All locations</SelectItem>
                      {locationOptions.map(loc => (
                        <SelectItem key={loc} value={loc} className="text-xs">{loc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-7 text-xs w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All statuses</SelectItem>
                      <SelectItem value="200" className="text-xs">PASS</SelectItem>
                      <SelectItem value="203" className="text-xs">PASS (always ok)</SelectItem>
                      <SelectItem value="500" className="text-xs">FAIL</SelectItem>
                      <SelectItem value="503" className="text-xs">FAIL (always error)</SelectItem>
                      <SelectItem value="504" className="text-xs">TIMEOUT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-muted-foreground text-sm p-4">Loading…</div>
            ) : files.length === 0 ? (
              <div className="text-muted-foreground text-sm p-4">
                No history in the selected time range.
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="text-muted-foreground text-sm p-4">
                No checks match the current filters.{' '}
                <button onClick={clearFilters} className="underline hover:text-foreground">
                  Clear filters
                </button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp (local)</TableHead>
                    <TableHead>{isMobile ? 'Endpoint (Location)' : 'Endpoint'}</TableHead>
                    <TableHead className="hidden sm:table-cell">From Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Response Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFiles.map(f => (
                    <TableRow
                      key={f.filename}
                      className={`cursor-pointer ${
                        f.overallStatus === 500 ? 'bg-red-950/20 hover:bg-red-950/30' :
                        f.overallStatus === 503 ? 'bg-red-950/30 hover:bg-red-950/40' :
                        f.overallStatus === 504 ? 'bg-orange-950/20 hover:bg-orange-950/30' :
                        'hover:bg-muted/30'
                      }`}
                      onClick={() => openFile(f)}
                    >
                      <TableCell className="text-xs font-mono">
                        {formatTs(f.timestamp ?? 0)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {endpointLabel(f)}
                        {isMobile && (
                          <div className="text-xs text-muted-foreground mt-0.5">{f.city ?? '—'}</div>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {f.city ?? '—'}
                      </TableCell>
                      <TableCell>
                        {f.overallStatus === 200 && (
                          <Badge variant="outline" className="text-xs border-green-600 text-green-400">PASS</Badge>
                        )}
                        {f.overallStatus === 203 && (
                          <Badge variant="outline" className="text-xs border-emerald-700 text-emerald-400">PASS (always ok)</Badge>
                        )}
                        {f.overallStatus === 500 && (
                          <Badge variant="destructive" className="text-xs">FAIL</Badge>
                        )}
                        {f.overallStatus === 503 && (
                          <Badge variant="destructive" className="text-xs bg-red-900 hover:bg-red-900">FAIL (always error)</Badge>
                        )}
                        {f.overallStatus === 504 && (
                          <Badge variant="outline" className="text-xs border-orange-500 text-orange-400">TIMEOUT</Badge>
                        )}
                        {isMobile && (
                          <div className="text-xs text-muted-foreground mt-0.5">{f.responseTime ?? 0}ms</div>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-right text-sm">
                        {f.responseTime ?? 0}ms
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      <ResponseDetailModal
        file={selected}
        serviceName={name}
        onClose={() => openFile(null)}
      />

      <TestModal
        serviceName={name}
        open={testOpen}
        onClose={() => setTestOpen(false)}
        onComplete={fetchHistory}
      />

      {/* Confirmation dialog for evaluation mode changes */}
      <AlertDialog open={evalConfirmOpen} onOpenChange={open => { if (!open) cancelEvalMode(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingEvalMode === 'alwaysok'
                ? 'Set evaluation mode to Always OK?'
                : 'Set evaluation mode to Always Error?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingEvalMode === 'alwaysok'
                ? `All executions for "${name}" — including scheduled checks, manual /health/${name} requests, and Run Test — will return 200 OK regardless of the actual condition check result. Results are still recorded with status 203. Select "Condition Based" to restore normal evaluation.`
                : `All executions for "${name}" — including scheduled checks, manual /health/${name} requests, and Run Test — will return 500 error regardless of the actual condition check result (a virtual failing condition is injected). Results are recorded with status 503. Select "Condition Based" to restore normal evaluation.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void confirmEvalMode(); }}
              className={pendingEvalMode === 'alwaysok'
                ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                : 'bg-red-700 hover:bg-red-800 text-white'}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
