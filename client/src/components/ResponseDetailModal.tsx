import { useEffect, useState } from 'react';
import type { HistoryFile, ResponseRecord } from '@shared/types';
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

  return (
    <Dialog open={!!file} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Response Detail
            {record && (
              <Badge variant={record.overallStatus === 200 ? 'default' : 'destructive'}>
                {record.overallStatus === 200 ? 'PASS' : 'FAIL'}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && <div className="text-muted-foreground text-sm p-4">Loading…</div>}
        {error && <div className="text-destructive text-sm p-4">{error}</div>}

        {record && (
          <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
            <TabsList className="flex-shrink-0">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="request">Request</TabsTrigger>
              <TabsTrigger value="response">Response</TabsTrigger>
              <TabsTrigger value="conditions">Conditions</TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-0 mt-2">
              <TabsContent value="overview" className="h-full">
                <ScrollArea className="h-full">
                  <div className="grid grid-cols-2 gap-4 p-1">
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
                      <div className="text-sm">{record.endpointName}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">HTTP Status</div>
                      <div className="text-sm">{record.response.status}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Overall Result</div>
                      <Badge variant={record.overallStatus === 200 ? 'default' : 'destructive'}>
                        {record.overallStatus === 200 ? 'PASS' : 'FAIL'}
                      </Badge>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

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

              <TabsContent value="conditions" className="h-full">
                <ScrollArea className="h-full">
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
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
