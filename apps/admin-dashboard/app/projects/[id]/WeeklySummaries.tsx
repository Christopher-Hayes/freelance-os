'use client';

import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Temporal } from '@/lib/temporal-polyfill';
import { getWeekStart, formatWeekRange, plainDateToUTC, authFetch } from '@/lib/util';
import { useJobs } from '@/components/JobsProvider';
import { toast } from '@repo/ui';

type TimeEntry = {
  id: number;
  description: string | null;
  startTime: string;
  durationMinutes: number;
  billable: boolean;
};

type WeeklySummary = {
  id: number;
  projectId: number;
  weekStart: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

type WeekData = {
  weekStart: Temporal.PlainDate;
  weekEnd: Temporal.PlainDate;
  entries: TimeEntry[];
  totalMinutes: number;
  summary: WeeklySummary | null;
};

export function WeeklySummaries({ 
  projectId,
  projectName,
  timeEntries 
}: { 
  projectId: number;
  projectName: string;
  timeEntries: TimeEntry[];
}) {
  const [weekData, setWeekData] = useState<WeekData[]>([]);
  const [summaries, setSummaries] = useState<WeeklySummary[]>([]);
  const [editingWeek, setEditingWeek] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [visibleWeeks, setVisibleWeeks] = useState(3);
  const [autofillMode, setAutofillMode] = useState(false);
  const { jobs, createJob } = useJobs();

  // Track which weeks have active generation jobs
  const activeWeeklySummaryJobs = jobs.filter(
    (job) =>
      job.type === 'generate_weekly_summary' &&
      (job.status === 'pending' || job.status === 'processing') &&
      (job.parameters as any)?.projectId === projectId
  );

  const isGeneratingWeek = useCallback(
    (weekStart: string) =>
      activeWeeklySummaryJobs.some(
        (job) => (job.parameters as any)?.weekStart === weekStart
      ),
    [activeWeeklySummaryJobs]
  );

  // isAutofilling reflects the autofill button's spinner state (any active job)
  const isAutofilling = activeWeeklySummaryJobs.length > 0;

  // Clear autofill mode once all queued jobs finish
  useEffect(() => {
    if (autofillMode && activeWeeklySummaryJobs.length === 0) {
      setAutofillMode(false);
    }
  }, [activeWeeklySummaryJobs.length, autofillMode]);

  // Group time entries by week
  useEffect(() => {
    if (!timeEntries.length) {
      setWeekData([]);
      return;
    }

    const weekMap = new Map<string, WeekData>();

    timeEntries.forEach(entry => {
      const entryDate = Temporal.PlainDate.from(entry.startTime.split('T')[0]!);
      const weekStart = getWeekStart(entryDate);
      const weekKey = weekStart.toString();

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, {
          weekStart,
          weekEnd: weekStart.add({ days: 6 }),
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
      Temporal.PlainDate.compare(b.weekStart, a.weekStart)
    );

    setWeekData(weeks);
  }, [timeEntries]);

  // Fetch summaries
  useEffect(() => {
    fetchSummaries();
  }, [projectId]);

  // Match summaries to weeks
  useEffect(() => {
    setWeekData(prevWeeks => 
      prevWeeks.map(week => ({
        ...week,
        summary: summaries.find(s => 
          s.weekStart.split('T')[0] === week.weekStart.toString()
        ) || null,
      }))
    );
  }, [summaries]);

  const fetchSummaries = async () => {
    try {
      const res = await authFetch(`/api/weekly-summaries?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setSummaries(data);
      }
    } catch (error) {
      console.error('Error fetching summaries:', error);
    }
  };

  const handleEdit = (weekStart: Temporal.PlainDate, currentSummary: string) => {
    setEditingWeek(weekStart.toString());
    setEditText(currentSummary);
  };

  const handleSave = async (weekStart: Temporal.PlainDate, summaryId?: number) => {
    if (!editText.trim()) return;

    setSaving(true);
    try {
      const weekStartUTC = plainDateToUTC(weekStart);

      if (summaryId) {
        // Update existing summary
        const res = await authFetch(`/api/weekly-summaries/${summaryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ summary: editText }),
        });

        if (!res.ok) throw new Error('Failed to update summary');
      } else {
        // Create new summary
        const res = await authFetch('/api/weekly-summaries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            weekStart: weekStartUTC.toISOString(),
            summary: editText,
          }),
        });

        if (!res.ok) throw new Error('Failed to create summary');
      }

      await fetchSummaries();
      setEditingWeek(null);
      setEditText('');
      toast.success('Summary saved successfully');
    } catch (error) {
      console.error('Error saving summary:', error);
      toast.error('Failed to save summary');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingWeek(null);
    setEditText('');
  };

  const handleDelete = async (summaryId: number) => {
    try {
      const res = await authFetch(`/api/weekly-summaries/${summaryId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete summary');

      await fetchSummaries();
      toast.success('Summary deleted successfully');
    } catch (error) {
      console.error('Error deleting summary:', error);
      toast.error('Failed to delete summary');
    }
  };

  // Refresh summaries when any weekly summary job completes
  const completedJobCount = jobs.filter(
    (job) =>
      job.type === 'generate_weekly_summary' &&
      job.status === 'completed' &&
      (job.parameters as any)?.projectId === projectId
  ).length;

  useEffect(() => {
    if (completedJobCount > 0) {
      fetchSummaries();
    }
  }, [completedJobCount]);

  const prepareEntries = (week: WeekData) =>
    week.entries.map((entry) => ({
      date: new Date(entry.startTime).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      description: entry.description || 'Work on project',
      hours: entry.durationMinutes / 60,
    }));

  const handleAutofill = async () => {
    setAutofillMode(true);
    try {
      const weeksWithoutSummaries = weekData
        .filter((week) => !week.summary && !isGeneratingWeek(week.weekStart.toString()))
        .slice(0, 5);

      if (weeksWithoutSummaries.length === 0) {
        toast.info('All recent weeks already have summaries!');
        setAutofillMode(false);
        return;
      }

      for (const week of weeksWithoutSummaries) {
        await createJob('generate_weekly_summary', {
          projectId,
          projectName,
          weekStart: week.weekStart.toString(),
          weekEnd: week.weekEnd.toString(),
          entries: prepareEntries(week),
        });
      }

      toast.success(`Queued ${weeksWithoutSummaries.length} weekly summary jobs`);
    } catch (error) {
      console.error('Error during autofill:', error);
      toast.error('Failed to queue summary jobs');
      setAutofillMode(false);
    }
  };

  const handleGenerateSummary = async (week: WeekData) => {
    try {
      await createJob('generate_weekly_summary', {
        projectId,
        projectName,
        weekStart: week.weekStart.toString(),
        weekEnd: week.weekEnd.toString(),
        entries: prepareEntries(week),
      });

      toast.success('Summary generation started');
    } catch (error) {
      console.error(`Error starting summary job for week ${week.weekStart.toString()}:`, error);
      toast.error('Failed to start summary generation');
    }
  };

  if (!weekData.length) {
    return (
      <div className="text-gray-600 dark:text-gray-400">
        No time entries yet. Add some time entries to create weekly summaries.
      </div>
    );
  }

  const weeksWithoutSummaries = weekData.filter(week => !week.summary).length;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
      <h2 className="text-xl font-semibold dark:text-white">Weekly Summaries</h2>
      {/* Autofill button */}
      {weeksWithoutSummaries > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleAutofill}
            disabled={isAutofilling}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 bg-blue-500/10 dark:bg-blue-500/10 rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"

          >
            {isAutofilling ? (
              <>
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              <>
                Autofill ({Math.min(weeksWithoutSummaries, 5)} weeks)
              </>
            )}
          </button>
        </div>
      )}
      </header>

      {weekData.slice(0, visibleWeeks).map((week) => {
        const weekKey = week.weekStart.toString();
        const isEditing = editingWeek === weekKey;
        const isGenerating = isGeneratingWeek(weekKey);
        const hasSummary = week.summary !== null;
        const hours = (week.totalMinutes / 60).toFixed(1);

        return (
          <div
            key={weekKey}
            className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg p-5"
          >
            {/* Week header */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold dark:text-white">
                  {formatWeekRange(week.weekStart)}
                </h3>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {week.entries.length} {week.entries.length === 1 ? 'entry' : 'entries'} · {hours} {parseFloat(hours) === 1 ? 'hour' : 'hours'}
                </div>
              </div>
              {!isEditing && (
                <div className="flex items-center gap-2">
                  {!hasSummary && (
                    <button
                      onClick={() => handleGenerateSummary(week)}
                      disabled={isGenerating || autofillMode}
                      className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 bg-blue-500/10 dark:bg-blue-500/10 px-2.5 py-1.5 rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isGenerating ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Generating...
                        </>
                      ) : (
                        'Generate Summary'
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(week.weekStart, week.summary?.summary || '')}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    {hasSummary ? 'Edit Summary' : 'Write manually'}
                  </button>
                </div>
              )}
            </div>

            {/* Time entries */}
            <div className="space-y-2 mb-4">
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

            {/* Hour total */}
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
              Total: {hours} {parseFloat(hours) === 1 ? 'hour' : 'hours'}
            </div>

            {/* Summary section */}
            {isEditing ? (
              <div className="bg-gray-50 dark:bg-gray-900 rounded p-4 border border-gray-200 dark:border-gray-700">
                <label className="block text-sm font-medium dark:text-gray-300 mb-2">
                  Weekly Summary
                </label>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  placeholder="Describe what was accomplished this week..."
                  rows={4}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleSave(week.weekStart, week.summary?.id)}
                    disabled={saving || !editText.trim()}
                    className="bg-blue-600 dark:bg-blue-500 text-white px-4 py-2 text-sm rounded hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-blue-300 dark:disabled:bg-blue-700 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={saving}
                    className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-4 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : hasSummary ? (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-4 border border-blue-200 dark:border-blue-800">
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm font-medium text-blue-900 dark:text-blue-200">
                    Weekly Summary
                  </div>
                  <button
                    onClick={() => handleDelete(week.summary!.id)}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
                <div className="text-sm text-blue-800 dark:text-blue-300 [&_p]:my-1 [&_ul]:my-1 [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_li]:my-0.5 [&_strong]:font-semibold">
                  <ReactMarkdown>{week.summary!.summary}</ReactMarkdown>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {visibleWeeks < weekData.length && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setVisibleWeeks((prev) => prev + 3)}
            className="flex items-center gap-1.5 rounded px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
          >
            Show more weeks
          </button>
        </div>
      )}
    </div>
  );
}
