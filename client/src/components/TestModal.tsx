import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
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
    <Dialog open={open} onOpenChange={open => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlayCircle className="h-4 w-4" />
            Test — {serviceName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 flex-shrink-0">
          <Button
            size="sm"
            onClick={runTest}
            disabled={running}
            className="gap-2"
          >
            {running ? (
              <>
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
                Running…
              </>
            ) : result ? (
              <>
                <RotateCw className="h-3.5 w-3.5" />
                Run Again
              </>
            ) : (
              <>
                <PlayCircle className="h-3.5 w-3.5" />
                Run Test
              </>
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

        {result && (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-4 pr-2">
              {result.details.map(ep => (
                <div key={ep.index}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${ep.passed ? 'bg-green-500' : 'bg-red-500'}`}
                    />
                    <span className="text-sm font-medium">{ep.name}</span>
                    <Badge
                      variant={ep.passed ? 'outline' : 'destructive'}
                      className={`text-xs ml-auto ${ep.passed ? 'border-green-600 text-green-400' : ''}`}
                    >
                      {ep.passed ? 'PASS' : 'FAIL'}
                    </Badge>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8 text-xs">Condition</TableHead>
                        <TableHead className="h-8 text-xs w-12">Result</TableHead>
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
                          <TableCell className="font-mono text-xs py-2 max-w-[200px] truncate">
                            {c.actual}
                          </TableCell>
                          <TableCell className="font-mono text-xs py-2">{c.expected}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {!result && !error && !running && (
          <div className="text-muted-foreground text-sm text-center py-6">
            Click "Run Test" to fire a health check against all endpoints for this service.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
