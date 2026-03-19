'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authFetch } from '@/lib/util';

// ============================================================================
// Types
// ============================================================================

type TimeEntryWithProject = {
  id: number;
  projectId: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  description: string;
  billable: boolean;
  project: {
    id: number;
    name: string;
    color: string;
    client: {
      id: number;
      name: string;
      email: string;
      company: string | null;
    };
  };
};

/** Per-day dot info: up to 3 dots, each with a hex color */
type DayDots = {
  dots: string[]; // array of 1–3 hex colors
};

export type MiniCalendarProps = {
  /** Currently selected date in YYYY-MM-DD format */
  value: string;
  /** Called when the user picks a day */
  onChange: (date: string) => void;
  /** Filter time entries to this client (optional) */
  clientId?: number | '';
  /** When set, dots show intensity for this one project */
  projectId?: number | '';
  /** Label displayed above the calendar */
  label?: string;
  /** Start of a date range to highlight (YYYY-MM-DD) */
  rangeStart?: string;
  /** End of a date range to highlight (YYYY-MM-DD) */
  rangeEnd?: string;
};

// ============================================================================
// Helpers
// ============================================================================

/** Pad a number to 2 digits */
const pad = (n: number) => String(n).padStart(2, '0');

/** Format a Date-like year/month/day to YYYY-MM-DD */
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Get number of days in a month (1-indexed month) */
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/** Get day-of-week for the 1st of a month (0=Mon … 6=Sun) */
const firstDayOfWeek = (year: number, month: number) => {
  const d = new Date(year, month - 1, 1).getDay(); // 0=Sun
  return d === 0 ? 6 : d - 1; // convert to 0=Mon
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const DOT_THRESHOLDS = {
  low: 60,   // ≤ 1 hour  → 1 dot
  mid: 240,  // ≤ 4 hours → 2 dots
  // > 4 hours → 3 dots
};

/** Check if dateStr falls strictly between rangeStart and rangeEnd (exclusive of endpoints) */
const isInRange = (dateStr: string, rangeStart?: string, rangeEnd?: string): boolean => {
  if (!rangeStart || !rangeEnd) return false;
  return dateStr > rangeStart && dateStr < rangeEnd;
};

/** Check if dateStr is one of the range endpoints */
const isRangeEndpoint = (dateStr: string, rangeStart?: string, rangeEnd?: string): boolean => {
  if (!rangeStart || !rangeEnd) return false;
  return dateStr === rangeStart || dateStr === rangeEnd;
};

// Year range for the year picker
const YEAR_RANGE_BACK = 5;
const YEAR_RANGE_FORWARD = 2;

// ============================================================================
// Component
// ============================================================================

export default function MiniCalendar({
  value,
  onChange,
  clientId,
  projectId,
  label,
  rangeStart,
  rangeEnd,
}: MiniCalendarProps) {
  // ── Displayed month ──────────────────────────────────────────────────
  const initialYear = value ? parseInt(value.slice(0, 4), 10) : new Date().getFullYear();
  const initialMonth = value ? parseInt(value.slice(5, 7), 10) : new Date().getMonth() + 1;

  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);

  // ── Dropdown state ───────────────────────────────────────────────────
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  const yearDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(e.target as Node)) {
        setMonthDropdownOpen(false);
      }
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(e.target as Node)) {
        setYearDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Time entry data for the displayed month ──────────────────────────
  const [entries, setEntries] = useState<TimeEntryWithProject[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // Re-centre view when the selected value jumps to a different month
  useEffect(() => {
    if (!value) return;
    const y = parseInt(value.slice(0, 4), 10);
    const m = parseInt(value.slice(5, 7), 10);
    if (y !== viewYear || m !== viewMonth) {
      setViewYear(y);
      setViewMonth(m);
    }
    // Only react to `value` changes, not viewYear/viewMonth
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // ── Fetch time entries for the visible month ─────────────────────────
  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      // We need at least a clientId to show meaningful dots
      if (!clientId) {
        setEntries([]);
        return;
      }

      setLoadingEntries(true);
      try {
        const startDate = ymd(viewYear, viewMonth, 1);
        const endDate = ymd(viewYear, viewMonth, daysInMonth(viewYear, viewMonth));

        const params = new URLSearchParams({
          startDate,
          endDate,
          ...(clientId ? { clientId: String(clientId) } : {}),
        });

        const res = await authFetch(`/api/time?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Failed to fetch time entries');
        const data = await res.json();
        setEntries(data.timeEntries ?? []);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('MiniCalendar: failed to load time entries', err);
        }
      } finally {
        setLoadingEntries(false);
      }
    }

    load();
    return () => controller.abort();
  }, [viewYear, viewMonth, clientId]);

  // ── Build per-day dot map ────────────────────────────────────────────
  const dayDots = useMemo<Record<string, DayDots>>(() => {
    if (entries.length === 0) return {};

    // Group minutes per day per project
    // key = "YYYY-MM-DD", value = Map<projectId, { minutes, color, name }>
    const byDayProject = new Map<
      string,
      Map<number, { minutes: number; color: string; name: string }>
    >();

    for (const entry of entries) {
      const d = new Date(entry.startTime);
      const key = ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());

      if (!byDayProject.has(key)) byDayProject.set(key, new Map());
      const dayMap = byDayProject.get(key)!;

      const pid = entry.projectId;
      if (!dayMap.has(pid)) {
        dayMap.set(pid, {
          minutes: 0,
          color: entry.project.color,
          name: entry.project.name,
        });
      }
      dayMap.get(pid)!.minutes += entry.durationMinutes;
    }

    const result: Record<string, DayDots> = {};

    for (const [dateKey, dayMap] of byDayProject) {
      if (projectId) {
        // ── Single-project mode: dots = intensity in that project's color ──
        const proj = dayMap.get(Number(projectId));
        if (!proj) continue;

        const mins = proj.minutes;
        let count = 0;
        if (mins > DOT_THRESHOLDS.mid) count = 3;
        else if (mins > DOT_THRESHOLDS.low) count = 2;
        else if (mins > 0) count = 1;

        result[dateKey] = { dots: Array(count).fill(proj.color) };
      } else {
        // ── No project selected: top-3 projects by time, each dot = project color ──
        const sorted = [...dayMap.values()].sort((a, b) => b.minutes - a.minutes);
        const top3 = sorted.slice(0, 3);
        result[dateKey] = { dots: top3.map((p) => p.color) };
      }
    }

    return result;
  }, [entries, projectId]);

  // ── Navigation (fixed: no nested state setters) ──────────────────────
  const goToPrevMonth = useCallback(() => {
    if (viewMonth === 1) {
      setViewYear(viewYear - 1);
      setViewMonth(12);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }, [viewYear, viewMonth]);

  const goToNextMonth = useCallback(() => {
    if (viewMonth === 12) {
      setViewYear(viewYear + 1);
      setViewMonth(1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }, [viewYear, viewMonth]);

  // ── Grid computation ─────────────────────────────────────────────────
  const totalDays = daysInMonth(viewYear, viewMonth);
  const startOffset = firstDayOfWeek(viewYear, viewMonth);

  const todayStr = (() => {
    const t = new Date();
    return ymd(t.getFullYear(), t.getMonth() + 1, t.getDate());
  })();

  // Year options for the picker
  const currentRealYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentRealYear - YEAR_RANGE_BACK; y <= currentRealYear + YEAR_RANGE_FORWARD; y++) {
      years.push(y);
    }
    return years;
  }, [currentRealYear]);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="select-none">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}

      <div className="border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 p-3 w-[308px]">
        {/* Month / year header + navigation */}
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={goToPrevMonth}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"
            aria-label="Previous month"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex items-center gap-1">
            {/* Month picker */}
            <div className="relative" ref={monthDropdownRef}>
              <button
                type="button"
                onClick={() => { setMonthDropdownOpen((v) => !v); setYearDropdownOpen(false); }}
                className="text-sm font-semibold text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer px-1 py-0.5 rounded transition-colors"
              >
                {MONTH_NAMES[viewMonth - 1]}
              </button>
              {monthDropdownOpen && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg dark:shadow-gray-900 z-20 py-1 grid grid-cols-3 gap-0.5 w-[200px]">
                  {MONTH_NAMES_SHORT.map((name, i) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => { setViewMonth(i + 1); setMonthDropdownOpen(false); }}
                      className={`px-2 py-1.5 text-xs rounded transition-colors ${
                        viewMonth === i + 1
                          ? 'bg-blue-500 dark:bg-blue-600 text-white font-medium'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Year picker */}
            <div className="relative" ref={yearDropdownRef}>
              <button
                type="button"
                onClick={() => { setYearDropdownOpen((v) => !v); setMonthDropdownOpen(false); }}
                className="text-sm font-semibold text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer px-1 py-0.5 rounded transition-colors"
              >
                {viewYear}
              </button>
              {yearDropdownOpen && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg dark:shadow-gray-900 z-20 py-1 max-h-48 overflow-y-auto w-20">
                  {yearOptions.map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => { setViewYear(y); setYearDropdownOpen(false); }}
                      className={`w-full px-3 py-1.5 text-xs text-center rounded transition-colors ${
                        viewYear === y
                          ? 'bg-blue-500 dark:bg-blue-600 text-white font-medium'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={goToNextMonth}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"
            aria-label="Next month"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 text-center text-[10px] font-medium text-gray-400 dark:text-gray-500 mb-1">
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
            <div key={d} className="py-0.5">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-px">
          {/* Leading blanks */}
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`blank-${i}`} className="w-10 h-10" />
          ))}

          {/* Actual days */}
          {Array.from({ length: totalDays }).map((_, i) => {
            const day = i + 1;
            const dateStr = ymd(viewYear, viewMonth, day);
            const isSelected = dateStr === value;
            const isToday = dateStr === todayStr;
            const inRange = isInRange(dateStr, rangeStart, rangeEnd);
            const isEndpoint = isRangeEndpoint(dateStr, rangeStart, rangeEnd);
            const dots = dayDots[dateStr]?.dots ?? [];

            let cellClass: string;
            if (isSelected) {
              cellClass = 'bg-blue-500 dark:bg-blue-600 text-white';
            } else if (isEndpoint) {
              cellClass = 'bg-blue-200 dark:bg-blue-700  text-blue-700 dark:text-blue-300';
            } else if (inRange) {
              cellClass = 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300';
            } else if (isToday) {
              cellClass = 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
            } else {
              cellClass = 'hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200';
            }

            return (
              <button
                key={day}
                type="button"
                onClick={() => onChange(dateStr)}
                className={`
                  w-10 h-10 rounded-md text-xs relative
                  grid grid-cols-2 grid-rows-2 items-center justify-items-center
                  transition-colors ${cellClass}
                `}
              >
                {/* Top-left: day number */}
                <span className="text-[11px] font-medium leading-none">
                  {day}
                </span>

                {/* Top-right: dot 1 */}
                <span className="flex items-center justify-center">
                  {dots.length >= 1 && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: dots[0] }}
                    />
                  )}
                </span>

                {/* Bottom-left: dot 2 */}
                <span className="flex items-center justify-center">
                  {dots.length >= 2 && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: dots[1] }}
                    />
                  )}
                </span>

                {/* Bottom-right: dot 3 */}
                <span className="flex items-center justify-center">
                  {dots.length >= 3 && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: dots[2] }}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Loading indicator */}
        {loadingEntries && (
          <div className="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-1">
            Loading time data…
          </div>
        )}

        {/* Selected date display + clear */}
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{value || 'No date selected'}</span>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
