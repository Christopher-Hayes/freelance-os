'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

type TimeEntry = {
  id: number;
  description: string | null;
  startTime: Date;
  durationMinutes: number;
  billable: boolean;
};

type WeeklySummary = {
  id: number;
  projectId: number;
  weekStart: string;
  summary: string;
};

type WeekData = {
  weekStart: string;
  weekEnd: string;
  entries: TimeEntry[];
  totalMinutes: number;
  summary: WeeklySummary | null;
};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  return new Date(d.setDate(diff));
}

function formatWeekRange(weekStart: Date): string {
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = end.getFullYear();
  
  if (start.getMonth() === end.getMonth()) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`;
  } else {
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
  }
}

export function WeeklySummaries({ 
  projectId, 
  timeEntries 
}: { 
  projectId: number;
  timeEntries: TimeEntry[];
}) {
  const [weekData, setWeekData] = useState<WeekData[]>([]);
  const [summaries, setSummaries] = useState<WeeklySummary[]>([]);

  // Group time entries by week
  useEffect(() => {
    if (!timeEntries.length) {
      setWeekData([]);
      return;
    }

    const weekMap = new Map<string, WeekData>();

    timeEntries.forEach(entry => {
      const entryDate = new Date(entry.startTime);
      const weekStart = getWeekStart(entryDate);
      const weekKey = weekStart.toISOString().split('T')[0]!;

      if (!weekMap.has(weekKey)) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        weekMap.set(weekKey, {
          weekStart: weekKey,
          weekEnd: weekEnd.toISOString().split('T')[0]!,
          entries: [],
          totalMinutes: 0,
          summary: null,
        });
      }

      const week = weekMap.get(weekKey)!;
      week.entries.push(entry);
      week.totalMinutes += entry.durationMinutes;
    });

    // Sort by week start (newest first)
    const weeks = Array.from(weekMap.values()).sort((a, b) => 
      new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime()
    );

    setWeekData(weeks);
  }, [timeEntries]);

  // Fetch summaries
  useEffect(() => {
    const fetchSummaries = async () => {
      try {
        const res = await fetch(`/api/weekly-summaries?projectId=${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setSummaries(data);
        }
      } catch (error) {
        console.error('Error fetching summaries:', error);
      }
    };

    fetchSummaries();
  }, [projectId]);

  // Match summaries to weeks
  useEffect(() => {
    setWeekData(prevWeeks => 
      prevWeeks.map(week => ({
        ...week,
        summary: summaries.find(s => 
          s.weekStart.split('T')[0] === week.weekStart
        ) || null,
      }))
    );
  }, [summaries]);

  if (!weekData.length) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        No time entries yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {weekData.map((week) => {
        const hasSummary = week.summary !== null;
        const hours = (week.totalMinutes / 60).toFixed(1);
        const weekStart = new Date(week.weekStart + 'T00:00:00Z');

        return (
          <div
            key={week.weekStart}
            className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg p-5"
          >
            {/* Week header */}
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatWeekRange(weekStart)}
              </h3>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {week.entries.length} {week.entries.length === 1 ? 'entry' : 'entries'} · {hours} {parseFloat(hours) === 1 ? 'hour' : 'hours'}
              </div>
            </div>

            {/* Weekly summary (if exists) */}
            {hasSummary && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-4 border border-blue-200 dark:border-blue-800 mb-4">
                <div className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
                  Weekly Summary
                </div>
                <div className="text-sm text-blue-800 dark:text-blue-300 [&_p]:my-1 [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_li]:my-0.5 [&_strong]:font-semibold">
                  <ReactMarkdown>{week.summary!.summary}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Time entries */}
            <div className="space-y-2">
              {week.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex justify-between items-start text-sm py-2 border-l-2 border-gray-200 dark:border-gray-700 pl-3"
                >
                  <div className="flex-1">
                    <div className="text-gray-900 dark:text-gray-100">
                      {entry.description || <span className="italic text-gray-500 dark:text-gray-500">No description</span>}
                    </div>
                    <div className="text-gray-500 dark:text-gray-500 text-xs mt-1">
                      {new Date(entry.startTime).toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {(entry.durationMinutes / 60).toFixed(1)}h
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-500">
                      {entry.billable ? 'Billable' : 'Non-bill'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
