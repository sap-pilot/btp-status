import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { PlayCircle, RotateCw } from 'lucide-react';

interface ConditionResult {
  condition: string;
  passed: boolean;
  actual: string;
  expected: string;
}

interface EndpointCheckResult {
  index: number;
  name: string;
  conditions: ConditionResult[];
  passed: boolean;
  request: { url: string; method: string; headers: Record<string, string>; body: string | null };
  response: { status: number; headers: Record<string, string>; body: string };
  responseTime: number;
}

interface CheckResult {
  success: boolean;
  message: string;
  details: EndpointCheckResult[];
}

interface Props {
  serviceName: string;
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

function prettify(body: string): string {
  if (!body) return '(empty)';
  try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
}

function HeaderTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) return <span className="text-xs text-muted-foreground italic">none</span>;
  return (
    <table className="w-full text-xs font-mono">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k} className="border-b border-border last:border-0">
            <td className="py-1 pr-3 text-muted-foreground whitespace-nowrap align-top">{k}</td>
            <td className="py-1 break-all">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
      {children}
    </div>
  );
}

export default function TestModal({ serviceName, open, onClose, onComplete }: Props) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  function handleClose() {
    setResult(null);
    setError(null);
    setElapsed(null);
    onClose();
  }

  async function runTest() {
    setRunning(true);
    setResult(null);
    setError(null);
    setElapsed(null);
    const start = Date.now();
    try {
      const resp = await fetch(`/api/check/${encodeURIComponent(serviceName)}`);
      setElapsed(Date.now() - start);
      const data = await resp.json() as CheckResult;
      setResult(data);
      onComplete();
    } catch (e) {
      setElapsed(Date.now() - start);
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  const passedCount = result?.details.filter(d => d.passed).length ?? 0;
  const totalCount = result?.details.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlayCircle className="h-4 w-4" />
            Test — {serviceName}
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button size="sm" onClick={runTest} disabled={running} className="gap-2">
            {running ? (
              <><RotateCw className="h-3.5 w-3.5 animate-spin" />Running…</>
            ) : result ? (
              <><RotateCw className="h-3.5 w-3.5" />Run Again</>
            ) : (
              <><PlayCircle className="h-3.5 w-3.5" />Run Test</>
            )}
          </Button>

          {result && (
            <Badge
              variant={result.success ? 'outline' : 'destructive'}
              className={result.success ? 'border-green-600 text-green-400' : ''}
            >
              {result.success ? 'PASS' : 'FAIL'}
            </Badge>
          )}
          {elapsed !== null && (
            <span className="text-xs text-muted-foreground">{elapsed}ms total</span>
          )}
          {result && (
            <span className="text-xs text-muted-foreground ml-auto">
              {passedCount}/{totalCount} endpoints passed
            </span>
          )}
        </div>

        {error && (
          <div className="text-destructive text-sm bg-destructive/10 rounded p-3 flex-shrink-0">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-5 pr-2">
              {result.details.map((ep, epIdx) => (
                <div key={ep.index}>
                  {epIdx > 0 && <Separator className="mb-4" />}

                  {/* Endpoint header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ep.passed ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-sm font-semibold">{ep.name}</span>
                    <span className="text-xs text-muted-foreground">{ep.responseTime}ms</span>
                    <Badge
                      variant={ep.passed ? 'outline' : 'destructive'}
                      className={`text-xs ml-auto ${ep.passed ? 'border-green-600 text-green-400' : ''}`}
                    >
                      {ep.passed ? 'PASS' : 'FAIL'}
                    </Badge>
                  </div>

                  {/* Per-endpoint tabs */}
                  <Tabs defaultValue="conditions">
                    <TabsList className="h-8">
                      <TabsTrigger value="conditions" className="text-xs h-7">
                        Conditions
                        {ep.conditions.some(c => !c.passed) && (
                          <span className="ml-1.5 text-red-400">
                            ({ep.conditions.filter(c => !c.passed).length} failed)
                          </span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="request" className="text-xs h-7">Request</TabsTrigger>
                      <TabsTrigger value="response" className="text-xs h-7">
                        Response
                        {ep.response.status > 0 && (
                          <span className={`ml-1.5 ${ep.response.status < 400 ? 'text-green-400' : 'text-red-400'}`}>
                            {ep.response.status}
                          </span>
                        )}
                      </TabsTrigger>
                    </TabsList>

                    {/* Conditions tab */}
                    <TabsContent value="conditions" className="mt-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="h-8 text-xs">Condition</TableHead>
                            <TableHead className="h-8 text-xs w-10">Result</TableHead>
                            <TableHead className="h-8 text-xs">Actual</TableHead>
                            <TableHead className="h-8 text-xs">Expected</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ep.conditions.map((c, ci) => (
                            <TableRow key={ci} className={c.passed ? '' : 'bg-destructive/10'}>
                              <TableCell className="font-mono text-xs py-2">{c.condition}</TableCell>
                              <TableCell className="py-2">
                                <span className={c.passed ? 'text-green-500' : 'text-red-500'}>
                                  {c.passed ? '✓' : '✗'}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs py-2 max-w-[220px] truncate" title={c.actual}>
                                {c.actual}
                              </TableCell>
                              <TableCell className="font-mono text-xs py-2">{c.expected}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TabsContent>

                    {/* Request tab */}
                    <TabsContent value="request" className="mt-2 space-y-4">
                      <Section label="URL">
                        <div className="font-mono text-xs bg-muted rounded px-2 py-1.5 break-all">
                          <span className="text-muted-foreground mr-2">{ep.request.method}</span>
                          {ep.request.url}
                        </div>
                      </Section>
                      <Section label="Headers">
                        <div className="bg-muted rounded px-2 py-1.5">
                          <HeaderTable headers={ep.request.headers} />
                        </div>
                      </Section>
                      <Section label="Body">
                        <pre className="font-mono text-xs bg-muted rounded px-2 py-1.5 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                          {ep.request.body ? prettify(ep.request.body) : <span className="text-muted-foreground italic">none</span>}
                        </pre>
                      </Section>
                    </TabsContent>

                    {/* Response tab */}
                    <TabsContent value="response" className="mt-2 space-y-4">
                      <Section label="Status">
                        <div className="flex items-center gap-3">
                          <span className={`font-mono text-sm font-bold ${
                            ep.response.status === 0 ? 'text-red-400' :
                            ep.response.status < 300 ? 'text-green-400' :
                            ep.response.status < 400 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {ep.response.status === 0 ? 'Connection error' : ep.response.status}
                          </span>
                          <span className="text-xs text-muted-foreground">{ep.responseTime}ms</span>
                        </div>
                      </Section>
                      <Section label="Headers">
                        <div className="bg-muted rounded px-2 py-1.5">
                          <HeaderTable headers={ep.response.headers} />
                        </div>
                      </Section>
                      <Section label="Body">
                        <pre className="font-mono text-xs bg-muted rounded px-2 py-1.5 whitespace-pre-wrap break-all max-h-48 overflow-auto">
                          {ep.response.body ? prettify(ep.response.body) : <span className="text-muted-foreground italic">empty</span>}
                        </pre>
                      </Section>
                    </TabsContent>
                  </Tabs>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {!result && !error && !running && (
          <div className="text-muted-foreground text-sm text-center py-8">
            Click "Run Test" to fire a health check against all endpoints for this service.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
