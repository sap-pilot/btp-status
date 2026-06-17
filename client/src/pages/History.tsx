import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { HistoryFile, ServiceConfig } from '@shared/types';
import StatusDots from '@/components/StatusDots';
import ResponseTimeChart from '@/components/ResponseTimeChart';
import ResponseDetailModal from '@/components/ResponseDetailModal';
import TestModal from '@/components/TestModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, AlertCircle, PlayCircle, Sun, Moon } from 'lucide-react';
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
  const { theme, toggleTheme } = useTheme();
  const windowWidth = useWindowWidth();
  // max-w-5xl (1024px) page with px-4 (32px) + CardContent p-6 (48px) = 80px overhead
  // each dot slot = w-2.5 (10px) + gap-0.5 (2px) = 12px
  const dotAreaWidth = Math.min(windowWidth, 1024) - 140;
  const maxDots = Math.max(8, Math.floor(dotAreaWidth / 12));

  const [hours, setHours] = useState(24);
  const [files, setFiles] = useState<HistoryFile[]>([]);
  const [service, setService] = useState<ServiceConfig | null>(null);
  const [selected, setSelected] = useState<HistoryFile | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/services')
      .then(r => r.json() as Promise<ServiceConfig[]>)
      .then(svcs => setService(svcs.find(s => s.name === name) ?? null))
      .catch(() => null);
  }, [name]);

  const fetchHistory = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/history/${encodeURIComponent(name)}?hours=${hours}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<HistoryFile[]>;
      })
      .then(d => setFiles(d))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [name, hours]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const upCount = files.filter(f => f.overallStatus === 200).length;
  const uptime = files.length > 0 ? Math.round((upCount / files.length) * 100) : 100;
  const avgMs =
    files.length > 0
      ? Math.round(files.reduce((s, f) => s + f.responseTime, 0) / files.length)
      : 0;

  const endpointName = (idx: number): string => {
    if (!service) return `Endpoint ${idx}`;
    return service.endpoints[idx]?.name ?? `Endpoint ${idx}`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/overview"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Overview
            </Link>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-base font-semibold">{name}</h1>
            {service && (
              <Badge variant="outline" className="text-xs">
                {service.group}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setTestOpen(true)}
            >
              <PlayCircle className="h-3.5 w-3.5" />
              Run Test
            </Button>
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
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Timeline card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatusDots history={files} maxDots={maxDots} showAvg={false} />
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

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-500">{uptime}%</div>
              <div className="text-xs text-muted-foreground mt-1">Uptime</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{avgMs}ms</div>
              <div className="text-xs text-muted-foreground mt-1">Avg Response Time</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{files.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Total Checks</div>
            </CardContent>
          </Card>
        </div>

        {/* History table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Check History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-muted-foreground text-sm p-4">Loading…</div>
            ) : files.length === 0 ? (
              <div className="text-muted-foreground text-sm p-4">
                No history in the selected time range.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Response Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map(f => (
                    <TableRow
                      key={f.filename}
                      className={`cursor-pointer ${
                        f.overallStatus === 500 ? 'bg-red-950/20 hover:bg-red-950/30' : 'hover:bg-muted/30'
                      }`}
                      onClick={() => setSelected(f)}
                    >
                      <TableCell className="text-xs font-mono">
                        {formatTs(f.timestamp)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {endpointName(f.endpointIndex)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={f.overallStatus === 200 ? 'outline' : 'destructive'}
                          className={`text-xs ${
                            f.overallStatus === 200
                              ? 'border-green-600 text-green-400'
                              : ''
                          }`}
                        >
                          {f.overallStatus === 200 ? 'PASS' : 'FAIL'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {f.responseTime}ms
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
        onClose={() => setSelected(null)}
      />

      <TestModal
        serviceName={name}
        open={testOpen}
        onClose={() => setTestOpen(false)}
        onComplete={fetchHistory}
      />
    </div>
  );
}
