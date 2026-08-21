"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import { authFetch } from "@/lib/util";
import { formatDateStr } from "./utils";

// ============================================================================
// Types
// ============================================================================

type TimeEntryWithProject = {
  projectId: number;
  startTime: string;
  durationMinutes: number;
  project: {
    color: string;
  };
};

type DayColor = {
  /** Hex color of the project with the most time logged that day */
  color: string;
  /** Total minutes logged across all projects that day, used for intensity */
  totalMinutes: number;
};

interface DatePickerCalendarProps {
  selectedDate: Temporal.PlainDate;
  onDateSelect: (date: Temporal.PlainDate) => void;
}

// ============================================================================
// Helpers
// ============================================================================

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/** Day-of-week for the 1st of a month, 0=Mon … 6=Sun */
const firstDayOfWeek = (year: number, month: number) => {
  const d = new Date(year, month - 1, 1).getDay();
  return d === 0 ? 6 : d - 1;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** A full day of logged time (8 hours) maps to the strongest tint */
const FULL_DAY_MINUTES = 480;
const MIN_ALPHA = 0.12;
const MAX_ALPHA = 0.4;

function withAlpha(hex: string, alpha: number) {
  const validHex = /^#([0-9A-Fa-f]{6})$/.test(hex) ? hex : "#94A3B8";
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const red = parseInt(validHex.slice(1, 3), 16);
  const green = parseInt(validHex.slice(3, 5), 16);
  const blue = parseInt(validHex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
}

/** Map minutes worked to a tint intensity: more time → stronger color */
function intensityForMinutes(minutes: number): number {
  const factor = Math.min(1, minutes / FULL_DAY_MINUTES);
  return MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * Math.sqrt(factor);
}

// ============================================================================
// Component
// ============================================================================

export default function DatePickerCalendar({ selectedDate, onDateSelect }: DatePickerCalendarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selectedDate.year);
  const [viewMonth, setViewMonth] = useState(selectedDate.month);

  const containerRef = useRef<HTMLDivElement>(null);

  // Re-centre the view on the selected month whenever the picker is opened
  useEffect(() => {
    if (isOpen) {
      setViewYear(selectedDate.year);
      setViewMonth(selectedDate.month);
    }
    // Only react to the picker opening, not to every selectedDate change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  // ── Time entry data for the visible month ────────────────────────────
  const [entries, setEntries] = useState<TimeEntryWithProject[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();

    async function load() {
      setLoadingEntries(true);
      try {
        const startDate = ymd(viewYear, viewMonth, 1);
        const endDate = ymd(viewYear, viewMonth, daysInMonth(viewYear, viewMonth));
        const params = new URLSearchParams({ startDate, endDate });

        const res = await authFetch(`/api/time?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Failed to fetch time entries");
        const data = await res.json();
        setEntries(data.timeEntries ?? []);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("DatePickerCalendar: failed to load time entries", err);
        }
      } finally {
        setLoadingEntries(false);
      }
    }

    load();
    return () => controller.abort();
  }, [isOpen, viewYear, viewMonth]);

  // ── Per-day dominant project + intensity ─────────────────────────────
  const dayColors = useMemo<Record<string, DayColor>>(() => {
    if (entries.length === 0) return {};

    const byDayProject = new Map<string, Map<number, { minutes: number; color: string }>>();

    for (const entry of entries) {
      const d = new Date(entry.startTime);
      const key = ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());

      if (!byDayProject.has(key)) byDayProject.set(key, new Map());
      const dayMap = byDayProject.get(key)!;

      const pid = entry.projectId;
      if (!dayMap.has(pid)) {
        dayMap.set(pid, { minutes: 0, color: entry.project.color });
      }
      dayMap.get(pid)!.minutes += entry.durationMinutes;
    }

    const result: Record<string, DayColor> = {};
    for (const [dateKey, dayMap] of byDayProject) {
      const projectsForDay = [...dayMap.values()];
      const totalMinutes = projectsForDay.reduce((sum, p) => sum + p.minutes, 0);
      const topProject = projectsForDay.sort((a, b) => b.minutes - a.minutes)[0]!;
      result[dateKey] = { color: topProject.color, totalMinutes };
    }

    return result;
  }, [entries]);

  const goToPrevMonth = useCallback(() => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  }, [viewMonth]);

  const goToNextMonth = useCallback(() => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }, [viewMonth]);

  const handleDayClick = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-").map(Number);
    onDateSelect(Temporal.PlainDate.from({ year, month, day }));
    setIsOpen(false);
  };

  const totalDays = daysInMonth(viewYear, viewMonth);
  const startOffset = firstDayOfWeek(viewYear, viewMonth);
  const selectedStr = formatDateStr(selectedDate);
  const todayStr = (() => {
    const t = Temporal.Now.plainDateISO();
    return ymd(t.year, t.month, t.day);
  })();

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        title="Pick a date"
        aria-label="Select date"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 z-30 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 shadow-lg dark:shadow-gray-900 p-3 w-[280px] select-none">
          {/* Month / year header + navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={goToPrevMonth}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
              aria-label="Previous month"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {MONTH_NAMES[viewMonth - 1]} {viewYear}
            </div>

            <button
              type="button"
              onClick={goToNextMonth}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
              aria-label="Next month"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day-of-week header */}
          <div className="grid grid-cols-7 text-center text-[10px] font-medium text-gray-400 dark:text-gray-500 mb-1">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <div key={d} className="py-0.5">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`blank-${i}`} className="w-9 h-9" />
            ))}

            {Array.from({ length: totalDays }).map((_, i) => {
              const day = i + 1;
              const dateStr = ymd(viewYear, viewMonth, day);
              const isSelected = dateStr === selectedStr;
              const isToday = dateStr === todayStr;
              const dayColor = dayColors[dateStr];

              const style: React.CSSProperties = dayColor
                ? { backgroundColor: withAlpha(dayColor.color, intensityForMinutes(dayColor.totalMinutes)) }
                : {};

              const textClass = "text-gray-700 dark:text-gray-200";

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDayClick(dateStr)}
                  style={style}
                  className={`
                    w-9 h-9 rounded-md text-xs font-medium transition-colors
                    ${!dayColor ? "hover:bg-gray-100 dark:hover:bg-gray-700" : ""}
                    ${textClass}
                    ${isSelected ? "ring-2 ring-blue-500 dark:ring-blue-400" : ""}
                    ${isToday && !isSelected ? "ring-1 ring-blue-300 dark:ring-blue-600" : ""}
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {loadingEntries && (
            <div className="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              Loading time data…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
