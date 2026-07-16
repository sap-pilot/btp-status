import { useEffect, useState } from 'react';
import type { ResponseRecord } from '@shared/types';
import { ExternalLink, LogIn } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface AuthProp {
  enabled: boolean;
  loggedIn: boolean;
  login: () => void;
}

interface Props {
  file: { filename: string } | null;
  serviceName: string;
  onClose: () => void;
  auth?: AuthProp;
}

function prettifyBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function ResponseDetailModal({ file, serviceName, onClose, auth }: Props) {
  const [record, setRecord] = useState<ResponseRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [consoleText, setConsoleText] = useState<string | null>(null);
  const [htmlText, setHtmlText] = useState<string | null>(null);
  const [retryRecords, setRetryRecords] = useState<ResponseRecord[]>([]);
  const [expandedRetry, setExpandedRetry] = useState<number | null>(null);

  const requiresLogin = auth?.enabled && !auth.loggedIn;

  useEffect(() => {
    if (!file) {
      setRecord(null);
      setNeedsAuth(false);
      return;
    }
    if (requiresLogin) {
      setRecord(null);
      setNeedsAuth(true);
      return;
    }
    setNeedsAuth(false);
    setLoading(true);
    setError(null);
    setRetryRecords([]);
    setExpandedRetry(null);
    fetch(`/api/history/${encodeURIComponent(serviceName)}/${encodeURIComponent(file.filename)}`)
      .then(r => {
        if (r.status === 401) { setNeedsAuth(true); throw new Error('401'); }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ResponseRecord>;
      })
      .then(data => setRecord(data))
      .catch(e => { if (String(e) !== 'Error: 401') setError(String(e)); })
      .finally(() => setLoading(false));
  }, [file, serviceName, requiresLogin]);

  useEffect(() => {
    if (!record) { setConsoleText(null); setHtmlText(null); return; }
    const fetchSidecar = async (sidecarFile: string) => {
      const url = `/api/download?path=${encodeURIComponent(serviceName)}/${encodeURIComponent(sidecarFile)}`;
      try {
        const r = await fetch(url);
        return r.ok ? r.text() : null;
      } catch { return null; }
    };
    void Promise.all([
      record.consoleLogFile ? fetchSidecar(record.consoleLogFile) : Promise.resolve(null),
      record.contentFile ? fetchSidecar(record.contentFile) : Promise.resolve(null),
    ]).then(([c, h]) => { setConsoleText(c); setHtmlText(h); });

    if (record.retryFiles && record.retryFiles.length > 0) {
      void Promise.all(
        record.retryFiles.map(f =>
          fetch(`/api/history/${encodeURIComponent(serviceName)}/${encodeURIComponent(f)}`)
            .then(r => r.ok ? r.json() as Promise<ResponseRecord> : null)
            .catch(() => null),
        ),
      ).then(results => setRetryRecords(results.filter((r): r is ResponseRecord => r !== null)));
    }
  }, [record, serviceName]);

  const isBrowser = record?.request.method === 'BROWSER';
  const screenshotUrl = record?.screenshotFile
    ? `/api/download?path=${encodeURIComponent(serviceName)}/${encodeURIComponent(record.screenshotFile)}`
    : null;

  return (
    <Dialog open={!!file} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Response Detail
            {record && (
              record.overallStatus === 200 ? <Badge variant="default">PASS</Badge> :
              record.overallStatus === 203 ? <Badge variant="default">PASS (always ok)</Badge> :
              record.overallStatus === 400 ? <Badge variant="outline" className="border-orange-500 text-orange-400">PARTIAL</Badge> :
              record.overallStatus === 503 ? <Badge variant="destructive">FAIL (always error)</Badge> :
              <Badge variant="destructive">FAIL</Badge>
            )}
            {isBrowser && (
              <Badge variant="outline" className="text-xs border-blue-600 text-blue-400">Browser</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {needsAuth && auth && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">Login required to view response detail.</p>
            <button
              onClick={auth.login}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <LogIn className="h-4 w-4" />
              Login
            </button>
          </div>
        )}
        {!needsAuth && loading && <div className="text-muted-foreground text-sm p-4">Loading…</div>}
        {!needsAuth && error && <div className="text-destructive text-sm p-4">{error}</div>}

        {record && (
          <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
            <TabsList className="flex-shrink-0">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              {retryRecords.length > 0 && <TabsTrigger value="retries">Retries ({retryRecords.length})</TabsTrigger>}
              {isBrowser && screenshotUrl && <TabsTrigger value="screenshot">Screenshot</TabsTrigger>}
              {isBrowser && htmlText !== null && <TabsTrigger value="pagesource">Page Source</TabsTrigger>}
              {isBrowser && consoleText !== null && <TabsTrigger value="console">Console</TabsTrigger>}
              {!isBrowser && <TabsTrigger value="request">Request</TabsTrigger>}
              {!isBrowser && <TabsTrigger value="response">Response</TabsTrigger>}
            </TabsList>

            <div className="flex-1 min-h-0 mt-2">
              {isBrowser && screenshotUrl && (
                <TabsContent value="screenshot" className="h-full">
                  <ScrollArea className="h-full">
                    <img
                      src={screenshotUrl}
                      alt="Login screenshot"
                      className="w-full rounded border border-border"
                    />
                  </ScrollArea>
                </TabsContent>
              )}

              {retryRecords.length > 0 && (
                <TabsContent value="retries" className="h-full">
                  <ScrollArea className="h-full">
                    <div className="space-y-2 p-1">
                      {retryRecords.map((rr, idx) => (
                        <div key={idx} className="border border-border rounded">
                          <button
                            className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/30 transition-colors"
                            onClick={() => setExpandedRetry(expandedRetry === idx ? null : idx)}
                          >
                            <span className="font-medium">Retry {idx + 1}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{rr.responseTime}ms</span>
                              {rr.overallStatus === 200
                                ? <Badge variant="default" className="text-xs">PASS</Badge>
                                : rr.overallStatus === 504
                                  ? <Badge variant="outline" className="text-xs border-orange-600 text-orange-500">TIMEOUT</Badge>
                                  : <Badge variant="destructive" className="text-xs">FAIL</Badge>}
                              <span className="text-muted-foreground text-xs">{expandedRetry === idx ? '▲' : '▼'}</span>
                            </div>
                          </button>
                          {expandedRetry === idx && (
                            <div className="border-t border-border px-3 py-2">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Condition</TableHead>
                                    <TableHead className="w-16">Result</TableHead>
                                    <TableHead>Actual</TableHead>
                                    <TableHead>Expected</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {rr.conditions.map((c, ci) => (
                                    <TableRow key={ci} className={c.passed ? '' : 'bg-destructive/10'}>
                                      <TableCell className="font-mono text-xs">{c.condition}</TableCell>
                                      <TableCell>
                                        <span className={c.passed ? 'text-green-500' : 'text-red-500'}>{c.passed ? '✓' : '✗'}</span>
                                      </TableCell>
                                      <TableCell className="font-mono text-xs max-w-xs truncate">{c.actual}</TableCell>
                                      <TableCell className="font-mono text-xs">{c.expected}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}

              <TabsContent value="overview" className="h-full">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-1">
                    {/* Meta grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Timestamp</div>
                        <div className="text-sm">{formatTs(record.timestamp)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Response Time</div>
                        <div className="text-sm">{record.responseTime}ms</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Endpoint</div>
                        <div className="text-sm flex items-center gap-1.5">
                          {record.endpointName}
                          {record.request.url.startsWith('http') && (
                            <a
                              href={record.request.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Open ${record.endpointName}`}
                              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">
                          {isBrowser ? 'Check Type' : 'HTTP Status'}
                        </div>
                        <div className="text-sm">
                          {isBrowser ? 'Browser IAS Login' : record.response.status}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Overall Result</div>
                        {record.overallStatus === 200 ? <Badge variant="default">PASS</Badge> :
                         record.overallStatus === 203 ? <Badge variant="default">PASS (always ok)</Badge> :
                         record.overallStatus === 400 ? <Badge variant="outline" className="border-orange-500 text-orange-400">PARTIAL (retry succeeded)</Badge> :
                         record.overallStatus === 503 ? <Badge variant="destructive">FAIL (always error)</Badge> :
                         <Badge variant="destructive">FAIL</Badge>}
                      </div>
                      {isBrowser && record.response.body && (
                        <div className="col-span-2">
                          <div className="text-xs text-muted-foreground mb-1">Result Message</div>
                          <div className="text-sm font-mono bg-muted rounded p-2 break-all">
                            {record.response.body}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Conditions */}
                    <div>
                      <div className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Conditions</div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Condition</TableHead>
                            <TableHead className="w-16">Result</TableHead>
                            <TableHead>Actual</TableHead>
                            <TableHead>Expected</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {record.conditions.map((c, i) => (
                            <TableRow key={i} className={c.passed ? '' : 'bg-destructive/10'}>
                              <TableCell className="font-mono text-xs">{c.condition}</TableCell>
                              <TableCell>
                                <span className={c.passed ? 'text-green-500' : 'text-red-500'}>
                                  {c.passed ? '✓' : '✗'}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs max-w-xs truncate">
                                {c.actual}
                              </TableCell>
                              <TableCell className="font-mono text-xs">{c.expected}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              {!isBrowser && (
                <TabsContent value="request" className="h-full">
                  <ScrollArea className="h-full">
                    <div className="space-y-4 p-1">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Method & URL</div>
                        <div className="text-sm font-mono bg-muted rounded p-2 break-all">
                          {record.request.method} {record.request.url}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Headers</div>
                        <pre className="text-xs font-mono bg-muted rounded p-2 overflow-auto">
                          {JSON.stringify(record.request.headers, null, 2)}
                        </pre>
                      </div>
                      {record.request.body && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Body</div>
                          <pre className="text-xs font-mono bg-muted rounded p-2 overflow-auto">
                            {prettifyBody(record.request.body)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}

              {!isBrowser && (
                <TabsContent value="response" className="h-full">
                  <ScrollArea className="h-full">
                    <div className="space-y-4 p-1">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Status Code</div>
                        <div className="text-sm font-mono">{record.response.status}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Headers</div>
                        <pre className="text-xs font-mono bg-muted rounded p-2 overflow-auto max-h-48">
                          {JSON.stringify(record.response.headers, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Body</div>
                        <pre className="text-xs font-mono bg-muted rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap break-all">
                          {prettifyBody(record.response.body)}
                        </pre>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}

              {isBrowser && consoleText !== null && (
                <TabsContent value="console" className="h-full">
                  <ScrollArea className="h-full">
                    <pre className="text-xs font-mono bg-muted rounded p-2 whitespace-pre-wrap break-all">
                      {consoleText || '(no console output)'}
                    </pre>
                  </ScrollArea>
                </TabsContent>
              )}

              {isBrowser && htmlText !== null && (
                <TabsContent value="pagesource" className="h-full">
                  <ScrollArea className="h-full">
                    <pre className="text-xs font-mono bg-muted rounded p-2 whitespace-pre-wrap break-all">
                      {htmlText}
                    </pre>
                  </ScrollArea>
                </TabsContent>
              )}

            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
