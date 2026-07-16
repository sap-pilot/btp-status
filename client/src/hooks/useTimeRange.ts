import { useState } from 'react';

export type TimeRange =
  | { mode: 'hours'; hours: number }
  | { mode: 'dateRange'; fromDate: string; untilDate: string };

const STORAGE_KEY = 'btp-time-range';
const DEFAULT: TimeRange = { mode: 'hours', hours: 12 };

function load(): TimeRange {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as TimeRange;
      if (v.mode === 'hours' && typeof v.hours === 'number') return v;
      if (v.mode === 'dateRange' && v.fromDate && v.untilDate) return v;
    }
  } catch { /* ignore */ }
  return DEFAULT;
}

export function useTimeRange(initialSearch?: string) {
  const [range, setRangeState] = useState<TimeRange>(() => {
    if (initialSearch) {
      const p = new URLSearchParams(initialSearch);
      const h = p.get('hours');
      if (h && !isNaN(Number(h)) && Number(h) > 0) return { mode: 'hours', hours: Number(h) };
    }
    return load();
  });

  function setRange(next: TimeRange) {
    setRangeState(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  // Compute query string. For date range, use local midnight/end-of-day so the
  // server query aligns with the timestamps the user sees in the history table.
  const queryString = (() => {
    if (range.mode === 'hours') return `hours=${range.hours}`;
    const [fy, fm, fd] = range.fromDate.split('-').map(Number);
    const [uy, um, ud] = range.untilDate.split('-').map(Number);
    const fromMs = new Date(fy, fm - 1, fd, 0, 0, 0, 0).getTime();
    const untilMs = new Date(uy, um - 1, ud, 23, 59, 59, 999).getTime();
    return `fromMs=${fromMs}&untilMs=${untilMs}`;
  })();

  return { range, setRange, queryString };
}

export function fmtDateRange(fromDate: string, untilDate: string): string {
  const fmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const a = new Date(fromDate + 'T00:00:00').toLocaleDateString(undefined, fmt);
  const b = new Date(untilDate + 'T00:00:00').toLocaleDateString(undefined, fmt);
  return a === b ? a : `${a} – ${b}`;
}
