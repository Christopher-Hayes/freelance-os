import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft, BarChart3, BriefcaseBusiness, Clock3, Lightbulb, Radar, Users } from "lucide-react";
import { Breadcrumbs, Page, PageContent, PageHeader, Section, StatCard, Surface } from "@repo/ui";
import { ClientDateTime } from "@/components/ClientDateTime";
import DailyActivityChart from "@/app/analytics/components/DailyActivityChart";
import { getAppAnalytics, getAppRenameMap, getAppSessionBounds, getOrCreateApp } from "@/lib/app-analytics";
import { formatAppTitle } from "@/lib/util";
import AppNameSuggestionStream from "./AppNameSuggestionStream";
import AppOptionsMenu from "./AppOptionsMenu";
import { DashboardApiFooter } from "@/components/DashboardApiFooter";

type PageProps = {
  params: Promise<{ appClass: string }>;
  searchParams: Promise<{ startDate?: string; endDate?: string }>;
};

function formatHours(hours: number) {
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${(minutes / 60).toFixed(minutes >= 600 ? 0 : 1)}h`;
}

function formatPercent(value: number) {
  if (value <= 0) return "0%";
  if (value < 1) return "<1%";
  return `${Math.round(value)}%`;
}

function withAlpha(hex: string, alpha: number) {
  const normalized = /^#([0-9A-Fa-f]{6})$/.test(hex.trim()) ? hex.trim() : "#94A3B8";
  const red = parseInt(normalized.slice(1, 3), 16);
  const green = parseInt(normalized.slice(3, 5), 16);
  const blue = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
}

function buildMonthCalendar(dates: string[]) {
  if (dates.length === 0) return [] as Array<{ monthKey: string; label: string; weeks: string[][] }>;

  const sortedDates = [...dates].sort((a, b) => a.localeCompare(b));
  const firstDate = new Date(`${sortedDates[0]}T00:00:00Z`);
  const lastDate = new Date(`${sortedDates[sortedDates.length - 1]}T00:00:00Z`);
  const months: Array<{ monthKey: string; label: string; weeks: string[][] }> = [];

  const cursor = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), 1));
  const endCursor = new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), 1));

  while (cursor <= endCursor) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0));
    const gridStart = new Date(monthStart);
    gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
    const gridEnd = new Date(monthEnd);
    gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay()));

    const weeks: string[][] = [];
    const dayCursor = new Date(gridStart);
    while (dayCursor <= gridEnd) {
      const week: string[] = [];
      for (let day = 0; day < 7; day += 1) {
        week.push(dayCursor.toISOString().slice(0, 10));
        dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
      }
      weeks.push(week);
    }

    months.push({
      monthKey: `${year}-${String(month + 1).padStart(2, "0")}`,
      label: monthStart.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      weeks,
    });

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

function ProgressBar({ label, detail, value, color }: { label: string; detail: string; value: number; color: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <div>
          <div className="font-medium text-slate-900 dark:text-white">{label}</div>
          <div className="text-slate-500 dark:text-slate-400">{detail}</div>
        </div>
        <div className="font-medium text-slate-700 dark:text-slate-200">{formatPercent(value)}</div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, value))}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default async function AppAnalyticsDetailPage({ params, searchParams }: PageProps) {
  const [{ appClass: rawAppClass }, query] = await Promise.all([params, searchParams]);
  const appClass = decodeURIComponent(rawAppClass);

  let analytics = await getAppAnalytics(appClass, query);

  // If no sessions in the requested window and the user didn't specify a range,
  // fall back to the app's all-time bounds (covers older RescueTime imports, etc.)
  if (!analytics && !query.startDate && !query.endDate) {
    const bounds = await getAppSessionBounds(appClass);
    if (bounds) {
      analytics = await getAppAnalytics(appClass, bounds);
    }
  }

  if (!analytics) {
    notFound();
  }

  // Ensure the app row exists and fetch current state
  const appRecord = await getOrCreateApp(appClass);

  const windowTitles = analytics.topWindowTitles.map((w) => w.title);

  const renameMap = await getAppRenameMap();
  const displayName = appRecord.displayName ?? renameMap.get(appClass.toLowerCase()) ?? formatAppTitle(appClass);
  const maxHourlySeconds = Math.max(...analytics.hourlyUsage.map((item) => item.seconds), 1);
  const maxDailyHours = Math.max(...analytics.dailyUsage.map((item) => item.hours), 0);
  const dailyUsageByDate = new Map(analytics.dailyUsage.map((point) => [point.date, point]));
  const calendarMonths = buildMonthCalendar(analytics.dailyUsage.map((point) => point.date));
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <Page>
      <PageContent>
        <Section className="space-y-6">
          <Breadcrumbs items={[{ label: "Analytics", href: "/analytics" }, { label: displayName }]} LinkComponent={Link as any} />

          <PageHeader
            eyebrow="App intelligence"
            title={displayName}
            description="Dive into a single app’s usage patterns, mapped delivery work, and a few extra signals that help turn activity data into insight."
            actions={
              <div className="flex items-center gap-2">
                <Link
                  href="/analytics"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to analytics
                </Link>
                <AppOptionsMenu
                  appClass={appClass}
                  displayName={displayName}
                  hasCustomName={!!appRecord.displayName}
                />
              </div>
            }
          />

          <Suspense fallback={null}>
            <AppNameSuggestionStream
              appClass={appClass}
              displayName={displayName}
              windowTitles={windowTitles}
            />
          </Suspense>

          <Surface className="space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Tracking window</div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{analytics.summary.timerange.startDate} → {analytics.summary.timerange.endDate}</p>
                {displayName !== appClass ? (
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Shown in the UI as {displayName}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 text-xs text-slate-500 dark:text-slate-400">
                {analytics.summary.firstSeen ? (
                  <span className="rounded-full border border-slate-200 px-3 py-1 dark:border-white/10">
                    <strong>First</strong> seen <ClientDateTime value={analytics.summary.firstSeen} className="ml-1 inline" />
                  </span>
                ) : null}
                {analytics.summary.lastSeen ? (
                  <span className="rounded-full border border-slate-200 px-3 py-1 dark:border-white/10">
                    <strong>Last</strong> seen <ClientDateTime value={analytics.summary.lastSeen} className="ml-1 inline" />
                  </span>
                ) : null}
              </div>
            </div>
          </Surface>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <StatCard label="Tracked hours" value={analytics.summary.totalHours.toFixed(1)} meta="From activity sessions" icon={<Clock3 className="h-5 w-5" />} />
            <StatCard label="Sessions" value={analytics.summary.totalSessions} meta="Captured intervals" icon={<Activity className="h-5 w-5" />} />
            <StatCard label="Avg session" value={formatMinutes(analytics.summary.avgSessionMinutes)} meta="Per captured session" tone="info" icon={<BarChart3 className="h-5 w-5" />} />
            <StatCard label="Avg daily use" value={formatHours(analytics.summary.avgDailyHours)} meta={`${analytics.summary.activeDays} active days`} tone="success" icon={<Radar className="h-5 w-5" />} />
            <StatCard label="Longest session" value={formatMinutes(analytics.summary.longestSessionMinutes)} meta="Deepest single block" tone="warning" icon={<Clock3 className="h-5 w-5" />} />
            <StatCard label="Coverage" value={`${analytics.summary.coverageScore}%`} meta="Mapped into time entries" tone="info" icon={<BriefcaseBusiness className="h-5 w-5" />} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.95fr)]">
            <Surface className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Use over time</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">See how this app’s attention footprint changes across the reporting period.</p>
              </div>
              <DailyActivityChart
                data={analytics.dailyUsage.map((point) => ({
                  date: point.date,
                  totalHours: point.hours,
                  apps: { [analytics.summary.appClass]: point.hours },
                }))}
              />
            </Surface>

            <Surface className="space-y-4 col-start-1">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Usage calendar</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A month-by-month grid for spotting streaks, dormant days, and heavier bursts of activity.</p>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {calendarMonths.map((month) => (
                  <div key={month.monthKey} className="rounded-2xl border border-slate-200/80 p-4 dark:border-white/10">
                    <div className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">{month.label}</div>
                    <div className="mb-2 grid grid-cols-7 gap-2 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                      {weekdayLabels.map((label) => (
                        <div key={`${month.monthKey}-${label}`}>{label.slice(0, 1)}</div>
                      ))}
                    </div>
                    <div className="grid gap-2">
                      {month.weeks.map((week) => (
                        <div key={week[0]} className="grid grid-cols-7 gap-2">
                          {week.map((date) => {
                            const point = dailyUsageByDate.get(date);
                            const intensity = point && maxDailyHours > 0 ? point.hours / maxDailyHours : 0;
                            const currentMonth = date.slice(0, 7) === month.monthKey;
                            const isInRange = date >= analytics.summary.timerange.startDate && date <= analytics.summary.timerange.endDate;

                            return (
                              <div
                                key={date}
                                className="flex aspect-square items-center justify-center rounded-lg text-[11px] font-medium transition-transform hover:-translate-y-0.5"
                                style={{
                                  backgroundColor: !currentMonth
                                    ? withAlpha("#94A3B8", 0.05)
                                    : point
                                      ? withAlpha("#3B82F6", 0.18 + intensity * 0.5)
                                      : withAlpha("#3B82F6", 0.08),
                                  color: "#FFFFFF",
                                  opacity: isInRange ? 1 : 0.45,
                                }}
                                title={point ? `${date}: ${point.hours.toFixed(1)}h across ${point.sessions} sessions` : `${date}: no usage captured`}
                              >
                                {Number(date.slice(-2))}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-200">Less</span>
                <div className="flex items-center gap-1">
                  {[0.08, 0.18, 0.3, 0.45, 0.62].map((alpha) => (
                    <span
                      key={alpha}
                      className="h-3 w-6 rounded-full border border-slate-200/80 dark:border-white/10"
                      style={{ backgroundColor: withAlpha("#3B82F6", alpha) }}
                    />
                  ))}
                </div>
                <span className="font-medium text-slate-700 dark:text-slate-200">More</span>
              </div>
            </Surface>

            <Surface className="space-y-4 row-start-3 col-start-1">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-slate-50/80 p-4 dark:bg-slate-900/60">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Peak hour</div>
                  <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{analytics.summary.mostCommonHour?.label ?? "N/A"}</div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {analytics.summary.mostCommonHour ? `${formatHours(analytics.summary.mostCommonHour.seconds / 3600)} captured in that hour.` : "No hourly signal available yet."}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50/80 p-4 dark:bg-slate-900/60">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Busiest day</div>
                  <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{analytics.summary.busiestDay?.date ?? "N/A"}</div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {analytics.summary.busiestDay ? `${analytics.summary.busiestDay.hours.toFixed(1)} hours across ${analytics.summary.busiestDay.sessions} sessions.` : "No daily activity captured yet."}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50/80 p-4 dark:bg-slate-900/60">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Active days</div>
                  <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{analytics.summary.activeDays}</div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Usage was captured on {analytics.summary.activeDays} day{analytics.summary.activeDays === 1 ? "" : "s"} in this range.</p>
                </div>
              </div>
            </Surface>

            <Surface className="space-y-4 row-start-1 row-span-3 col-start-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Hourly rhythm</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A full-day view makes it easier to see exactly when this app tends to show up.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {analytics.hourlyUsage.map((point) => {
                  const intensity = point.seconds / maxHourlySeconds;

                  return (
                    <div
                      key={point.hour}
                      className="grid grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3 px-1 py-1.5"
                    >
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{point.label}</div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full transition-[width]"
                          style={{
                            width: `${Math.max(point.seconds > 0 ? 4 : 0, Math.min(100, intensity * 100))}%`,
                            background: `linear-gradient(90deg, ${withAlpha("#3B82F6", 0.55)} 0%, ${withAlpha("#8B5CF6", 0.95)} 100%)`,
                          }}
                        />
                      </div>
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{point.seconds > 0 ? formatHours(point.seconds / 3600) : "0h"}</div>
                    </div>
                  );
                })}
              </div>
            </Surface>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Surface className="space-y-4">
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 h-5 w-5 text-blue-500" />
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Use by client</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Attribution based on time entries that mention the app by name.</p>
                </div>
              </div>
              <div className="space-y-4">
                {analytics.clientUsage.length > 0 ? (
                  analytics.clientUsage.map((client) => (
                    <ProgressBar
                      key={client.clientId}
                      label={client.clientName}
                      detail={`${formatMinutes(client.minutes)} across ${client.entryCount} entries`}
                      value={client.share}
                      color={client.color}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                    No client attribution yet. Mentioning the app name in time-entry descriptions will make this section more informative.
                  </div>
                )}
              </div>
            </Surface>

            <Surface className="space-y-4">
              <div className="flex items-start gap-3">
                <BriefcaseBusiness className="mt-0.5 h-5 w-5 text-violet-500" />
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Use by project</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The projects most associated with this app inside logged delivery work.</p>
                </div>
              </div>
              <div className="space-y-4">
                {analytics.projectUsage.length > 0 ? (
                  analytics.projectUsage.map((project) => (
                    <ProgressBar
                      key={project.projectId}
                      label={project.projectName}
                      detail={`${project.clientName} · ${formatMinutes(project.minutes)} across ${project.entryCount} entries`}
                      value={project.share}
                      color={project.color}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                    No mapped project usage was found in the selected range.
                  </div>
                )}
              </div>
            </Surface>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <Surface className="space-y-4">
              <div className="flex items-start gap-3">
                <Lightbulb className="mt-0.5 h-5 w-5 text-amber-500" />
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Insights</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A few quick observations to help you act on the raw data faster.</p>
                </div>
              </div>
              <div className="grid gap-3">
                {analytics.insights.map((insight) => (
                  <div key={insight} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300">
                    {insight}
                  </div>
                ))}
              </div>
            </Surface>

            <Surface className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Most common window titles</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Files, pages, or contexts that show up most with this app.</p>
              </div>
              <div className="space-y-3">
                {analytics.topWindowTitles.map((window) => (
                  <div
                    key={window.title}
                    className="rounded-2xl border border-slate-200 p-4 dark:border-white/10"
                    style={{ backgroundColor: withAlpha("#3B82F6", 0.06) }}
                  >
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{window.title}</div>
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {formatHours(window.totalSeconds / 3600)} total · {window.sessions} sessions · {formatMinutes(window.avgSeconds / 60)} avg
                    </div>
                  </div>
                ))}
              </div>
            </Surface>
          </div>
          <DashboardApiFooter
            endpoints={[
              {
                method: "GET",
                path: `/api/analytics/apps/${appClass}`,
                description: "Fetch the full analytics detail for this specific app, including daily usage, hourly rhythm, window titles, client/project attribution, and insights.",
                queryParams: [
                  { name: "startDate", type: "date", required: false, description: "Inclusive start of the reporting window (YYYY-MM-DD). Defaults to 30 days ago." },
                  { name: "endDate",   type: "date", required: false, description: "Inclusive end of the reporting window (YYYY-MM-DD). Defaults to today." },
                ],
              },
              {
                method: "GET",
                path: "/api/analytics/apps",
                description: "List all tracked apps with aggregate stats (total hours, sessions, active days, coverage score) for the requested date range.",
                queryParams: [
                  { name: "startDate", type: "date", required: false, description: "Inclusive start of the reporting window (YYYY-MM-DD)." },
                  { name: "endDate",   type: "date", required: false, description: "Inclusive end of the reporting window (YYYY-MM-DD)." },
                ],
              },
            ]}
          />
        </Section>
      </PageContent>
    </Page>
  );
}