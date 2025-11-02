'use client';

import { useState, useEffect, useMemo } from 'react';
import DailyActivityChart from './components/DailyActivityChart';
import TopAppsChart from './components/TopAppsChart';
import WeeklyTrendChart from './components/WeeklyTrendChart';

interface SummaryData {
  totalHours: number;
  totalSessions: number;
  avgDailyHours: number;
  mostUsedApp: {
    name: string;
    hours: number;
    sessions: number;
  } | null;
  weeklyData: Array<{ week: string; hours: number }>;
}

interface ActivityData {
  dailyData: Array<{
    date: string;
    totalHours: number;
    apps: Record<string, number>;
  }>;
  topApps: Array<{ app: string; hours: number }>;
  totalSessions: number;
}

export default function AnalyticsPage() {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const [summaryRes, activityRes] = await Promise.all([
        fetch(`/api/analytics/summary?${params}`),
        fetch(`/api/analytics/activity?${params}`),
      ]);

      const summaryData = await summaryRes.json();
      const activityData = await activityRes.json();

      setSummary(summaryData);
      setActivity(activityData);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  // Memoize chart data to prevent unnecessary re-renders
  const dailyChartData = useMemo(
    () => activity?.dailyData || [],
    [activity?.dailyData]
  );

  const topAppsData = useMemo(
    () => activity?.topApps || [],
    [activity?.topApps]
  );

  const weeklyData = useMemo(
    () => summary?.weeklyData || [],
    [summary?.weeklyData]
  );

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">
          Activity Analytics
        </h1>

        {/* Date Range Selector */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 mb-8 border border-gray-200 dark:border-gray-800">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading analytics...</p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-800">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Hours</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {summary?.totalHours.toFixed(1) || '0'}
                </p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-800">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Sessions</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {summary?.totalSessions || '0'}
                </p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-800">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Avg Daily Hours</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {summary?.avgDailyHours.toFixed(1) || '0'}
                </p>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-800">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Most Used App</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                  {summary?.mostUsedApp?.name || 'N/A'}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {summary?.mostUsedApp?.hours.toFixed(1) || '0'}h
                </p>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-800">
                <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                  Daily Activity
                </h2>
                <DailyActivityChart data={dailyChartData} />
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-800">
                <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                  Top 10 Apps
                </h2>
                <TopAppsChart data={topAppsData} />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-800">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                Weekly Trends
              </h2>
              <WeeklyTrendChart data={weeklyData} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
