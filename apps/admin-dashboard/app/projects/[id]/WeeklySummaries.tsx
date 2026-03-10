'use client';

import { useState, useEffect } from 'react';
import { Temporal } from '@/lib/temporal-polyfill';
import { getWeekStart, formatWeekRange, plainDateToUTC, authFetch } from '@/lib/util';
import { generateWeeklySummary } from '@/lib/ai-actions';
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
  const [autofilling, setAutofilling] = useState(false);

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

  const handleAutofill = async () => {
    setAutofilling(true);
    try {
      // Find the 5 most recent weeks without summaries
      const weeksWithoutSummaries = weekData
        .filter(week => !week.summary)
        .slice(0, 5);

      if (weeksWithoutSummaries.length === 0) {
        toast.info('All recent weeks already have summaries!');
        return;
      }

      // Generate summaries for each week
      for (const week of weeksWithoutSummaries) {
        try {
          // Prepare entry data for AI
          const entries = week.entries.map(entry => ({
            date: new Date(entry.startTime).toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric' 
            }),
            description: entry.description || 'Work on project',
            hours: entry.durationMinutes / 60,
          }));

          // Generate summary using AI
          const summary = await generateWeeklySummary({
            projectId,
            weekStart: week.weekStart.toString(), // Convert to string for serialization
            weekEnd: week.weekEnd.toString(),     // Convert to string for serialization
            entries,
          });

          // Save the summary
          const weekStartUTC = plainDateToUTC(week.weekStart);
          const res = await authFetch('/api/weekly-summaries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              weekStart: weekStartUTC.toISOString(),
              summary,
            }),
          });

          if (!res.ok) {
            console.error(`Failed to save summary for week ${week.weekStart.toString()}`);
          }
        } catch (error) {
          console.error(`Error generating summary for week ${week.weekStart.toString()}:`, error);
        }
      }

      // Refresh summaries
      await fetchSummaries();
      toast.success(`Generated ${weeksWithoutSummaries.length} weekly summaries!`);
    } catch (error) {
      console.error('Error during autofill:', error);
      toast.error('Failed to autofill summaries');
    } finally {
      setAutofilling(false);
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
            disabled={autofilling}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 bg-blue-500/10 dark:bg-blue-500/10 rounded transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"

          >
            {autofilling ? (
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

      {weekData.map((week) => {
        const weekKey = week.weekStart.toString();
        const isEditing = editingWeek === weekKey;
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
                <button
                  onClick={() => handleEdit(week.weekStart, week.summary?.summary || '')}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  {hasSummary ? 'Edit Summary' : 'Add Summary'}
                </button>
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
                <p className="text-sm text-blue-800 dark:text-blue-300 whitespace-pre-wrap">
                  {week.summary!.summary}
                </p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
