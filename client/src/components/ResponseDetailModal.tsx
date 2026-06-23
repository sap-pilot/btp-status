import { useEffect, useState } from 'react';
import type { HistoryFile, ResponseRecord } from '@shared/types';
import { ExternalLink } from 'lucide-react';
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

interface Props {
  file: HistoryFile | null;
  serviceName: string;
  onClose: () => void;
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

export default function ResponseDetailModal({ file, serviceName, onClose }: Props) {
  const [record, setRecord] = useState<ResponseRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setRecord(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/history/${encodeURIComponent(serviceName)}/${encodeURIComponent(file.filename)}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ResponseRecord>;
      })
      .then(data => setRecord(data))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [file, serviceName]);

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
              <Badge variant={record.overallStatus === 200 || record.overallStatus === 203 ? 'default' : 'destructive'}>
                {record.overallStatus === 200 ? 'PASS' : record.overallStatus === 203 ? 'PASS (always ok)' : record.overallStatus === 503 ? 'FAIL (always error)' : 'FAIL'}
              </Badge>
            )}
            {isBrowser && (
              <Badge variant="outline" className="text-xs border-blue-600 text-blue-400">Browser</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && <div className="text-muted-foreground text-sm p-4">Loading…</div>}
        {error && <div className="text-destructive text-sm p-4">{error}</div>}

        {record && (
          <Tabs defaultValue={screenshotUrl ? 'screenshot' : 'overview'} className="flex-1 flex flex-col min-h-0">
            <TabsList className="flex-shrink-0">
              {screenshotUrl && <TabsTrigger value="screenshot">Screenshot</TabsTrigger>}
              <TabsTrigger value="overview">Overview</TabsTrigger>
              {!isBrowser && <TabsTrigger value="request">Request</TabsTrigger>}
              {!isBrowser && <TabsTrigger value="response">Response</TabsTrigger>}
            </TabsList>

            <div className="flex-1 min-h-0 mt-2">
              {screenshotUrl && (
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
                        <Badge variant={record.overallStatus === 200 || record.overallStatus === 203 ? 'default' : 'destructive'}>
                          {record.overallStatus === 200 ? 'PASS' : record.overallStatus === 203 ? 'PASS (always ok)' : record.overallStatus === 503 ? 'FAIL (always error)' : 'FAIL'}
                        </Badge>
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

            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
