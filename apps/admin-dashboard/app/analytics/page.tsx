'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import DailyActivityChart from './components/DailyActivityChart';
import TopAppsChart from './components/TopAppsChart';
import WeeklyTrendChart from './components/WeeklyTrendChart';
import { formatAppTitle, authFetch, syncAppDataToLocalStorage } from '@/lib/util';
import { APIFooter, Breadcrumbs, Button, Page, PageContent, PageError, PageHeader, PageLoading, Section, StatCard, Surface } from '@repo/ui';
import { generateCode } from '@/lib/ai-actions';
import { parseUTC } from '@/lib/datetime';
import { ChartColumn, Clock3, Filter, Laptop2, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Temporal } from '@/lib/temporal-polyfill';

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

function getDefaultDateRange() {
  const today = Temporal.Now.plainDateISO();
  return {
    startDate: today.subtract({ days: 30 }).toString(),
    endDate: today.toString(),
  };
}

export default function AnalyticsPage() {
  const defaults = useMemo(() => getDefaultDateRange(), []);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    syncAppDataToLocalStorage();
    fetchData();
  }, [startDate, endDate]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const [summaryRes, activityRes] = await Promise.all([
        authFetch(`/api/analytics/summary?${params}`),
        authFetch(`/api/analytics/activity?${params}`),
      ]);

      if (!summaryRes.ok || !activityRes.ok) {
        throw new Error('Failed to fetch analytics data');
      }

      const summaryData = (await summaryRes.json()) as SummaryData;
      const activityData = (await activityRes.json()) as ActivityData;

      setSummary(summaryData);
      setActivity(activityData);
    } catch (fetchError) {
      console.error('Error fetching analytics:', fetchError);
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  const dailyChartData = useMemo(() => activity?.dailyData || [], [activity?.dailyData]);
  const topAppsData = useMemo(() => activity?.topApps || [], [activity?.topApps]);
  const weeklyData = useMemo(() => summary?.weeklyData || [], [summary?.weeklyData]);

  const rangeLabel = useMemo(() => {
    if (!startDate || !endDate) return 'Custom range';

    try {
      const start = parseUTC(`${startDate}T00:00:00Z`);
      const end = parseUTC(`${endDate}T00:00:00Z`);
      return `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(start.epochMilliseconds))} – ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(end.epochMilliseconds))}`;
    } catch {
      return 'Custom range';
    }
  }, [endDate, startDate]);

  const handleGenerateCode = async (endpoint: any, language: string) => {
    return await generateCode(endpoint, language);
  };

  if (loading && !summary && !activity) {
    return <PageLoading title="Loading analytics" message="Crunching activity sessions, trends, and app usage." />;
  }

  if (error) {
    return (
      <Page>
        <PageContent>
          <PageError title="Couldn’t load analytics" message={error} retry={fetchData} />
        </PageContent>
      </Page>
    );
  }

  return (
    <Page>
      <PageContent>
        <Section className="space-y-6">
          <Breadcrumbs items={[{ label: 'Analytics' }]} LinkComponent={Link as any} />

          <PageHeader
            eyebrow="Admin dashboard"
            title="Activity analytics"
            description="Review captured activity trends, compare weekly performance, and spot the apps taking the most of your attention."
            actions={
              <Button
                variant="secondary"
                onClick={() => {
                  const nextDefaults = getDefaultDateRange();
                  setStartDate(nextDefaults.startDate);
                  setEndDate(nextDefaults.endDate);
                }}
              >
                Reset range
              </Button>
            }
          />

          <Surface className="space-y-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <Filter className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  Date range
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Adjust the reporting window to compare workload, focus, and app usage over time.</p>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
                {rangeLabel}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Start date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/60 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">End date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/60 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="flex items-end">
                <Button variant="secondary" className="w-full md:w-auto" onClick={fetchData}>
                  Refresh
                </Button>
              </div>
            </div>
          </Surface>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total hours"
              value={Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(summary?.totalHours || 0)}
              meta="Tracked from activity sessions"
              icon={<Clock3 className="h-5 w-5" />}
            />
            <StatCard
              label="Total sessions"
              value={Intl.NumberFormat().format(summary?.totalSessions || 0)}
              meta="Captured activity intervals"
              icon={<ChartColumn className="h-5 w-5" />}
            />
            <StatCard
              label="Avg daily hours"
              value={summary?.avgDailyHours.toFixed(1) || '0.0'}
              tone="info"
              meta="Average over selected range"
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <StatCard
              label="Top app"
              value={formatAppTitle(summary?.mostUsedApp?.name ?? '') || 'N/A'}
              meta={summary?.mostUsedApp ? `${summary.mostUsedApp.hours.toFixed(1)}h • ${summary.mostUsedApp.sessions} sessions` : 'No activity yet'}
              icon={<Laptop2 className="h-5 w-5" />}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Surface className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Daily activity</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Compare day-to-day workload and see how activity volume shifts across the selected range.</p>
              </div>
              <DailyActivityChart data={dailyChartData} />
            </Surface>

            <Surface className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Top apps</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">See which apps dominate your attention and how much time they consumed.</p>
              </div>
              <TopAppsChart data={topAppsData} />
            </Surface>
          </div>

          <Surface className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Weekly trends</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Spot broader momentum changes and weekly pacing with a cleaner trend overview.</p>
            </div>
            <WeeklyTrendChart data={weeklyData} />
          </Surface>

          <APIFooter
            enableApiKeys
            enableCodeGen
            onGenerateApiKey={() => {
              window.location.href = '/api-demo';
            }}
            onGenerateCode={handleGenerateCode}
            endpoints={[
              {
                method: 'GET',
                path: '/analytics/summary',
                description: 'Get activity summary for a date range',
                queryParams: [
                  {
                    name: 'startDate',
                    type: 'string',
                    description: 'Start date for analytics range (YYYY-MM-DD)',
                  },
                  {
                    name: 'endDate',
                    type: 'string',
                    description: 'End date for analytics range (YYYY-MM-DD)',
                  },
                ],
              },
              {
                method: 'GET',
                path: '/analytics/activity',
                description: 'Get detailed activity data (daily breakdown and top apps)',
                queryParams: [
                  {
                    name: 'startDate',
                    type: 'string',
                    description: 'Start date for analytics range (YYYY-MM-DD)',
                  },
                  {
                    name: 'endDate',
                    type: 'string',
                    description: 'End date for analytics range (YYYY-MM-DD)',
                  },
                  {
                    name: 'limit',
                    type: 'number',
                    description: 'Limit number of top apps returned (default: 10)',
                  },
                ],
              },
              {
                method: 'GET',
                path: '/analytics/sessions',
                description: 'Get raw activity sessions',
                queryParams: [
                  {
                    name: 'startDate',
                    type: 'string',
                    description: 'Start date for sessions (YYYY-MM-DD)',
                  },
                  {
                    name: 'endDate',
                    type: 'string',
                    description: 'End date for sessions (YYYY-MM-DD)',
                  },
                  {
                    name: 'appName',
                    type: 'string',
                    description: 'Filter by application name',
                  },
                ],
              },
            ]}
          />
        </Section>
      </PageContent>
    </Page>
  );
}
