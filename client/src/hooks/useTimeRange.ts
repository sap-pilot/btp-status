import { useState } from 'react';

export type TimeRange =
  | { mode: 'hours'; hours: number }
  | { mode: 'dateRange'; fromDate: string; untilDate: string };

const STORAGE_KEY = 'btp-time-range';
const DEFAULT: TimeRange = { mode: 'hours', hours: 24 };

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

export function useTimeRange() {
  const [range, setRangeState] = useState<TimeRange>(load);

  function setRange(next: TimeRange) {
    setRangeState(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  const queryString =
    range.mode === 'hours'
      ? `hours=${range.hours}`
      : `from=${range.fromDate}&until=${range.untilDate}`;

  return { range, setRange, queryString };
}

export function fmtDateRange(fromDate: string, untilDate: string): string {
  const fmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const a = new Date(fromDate + 'T00:00:00').toLocaleDateString(undefined, fmt);
  const b = new Date(untilDate + 'T00:00:00').toLocaleDateString(undefined, fmt);
  return a === b ? a : `${a} – ${b}`;
}
