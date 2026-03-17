import Link from "next/link";
import { Temporal } from "@js-temporal/polyfill";
import { prisma } from "@freelance-os/database";
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CircleDollarSign,
  Cpu,
  Clock3,
  FolderKanban,
  Gauge,
  Lightbulb,
  LineChart,
  Radar,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { ClientDateTime } from "@/components/ClientDateTime";
import { formatAppTitle } from "@/lib/util";
import { getAppRenameMap } from "@/lib/app-analytics";

function getAppAnalyticsHref(appClass: string) {
  return `/analytics/apps/${appClass}`;
}

type TopApp = {
  appClass: string;
  appName: string;
  durationSeconds: number;
  sessions: number;
  share: number;
};

type TopProject = {
  id: number;
  name: string;
  clientName: string;
  color: string;
  minutes: number;
  share: number;
};

type TopClient = {
  id: number;
  name: string;
  color: string;
  minutes: number;
  share: number;
  projectCount: number;
};

type DashboardClientLookup = {
  id: number;
  name: string;
  color: string;
};

type DailyClientBar = {
  date: string;
  label: string;
  totalMinutes: number;
  segments: Array<{
    clientId: number;
    clientName: string;
    color: string;
    minutes: number;
  }>;
};

type RecentActivity = {
  id: number;
  appClass: string;
  appName: string;
  windowTitle: string | null;
  durationSeconds: number;
  startTime: string;
  endTime: string;
};

type DashboardData = {
  clientCount: number;
  projectCount: number;
  invoiceCount: number;
  hoursLoggedThisMonth: number;
  billableHoursLast7Days: number;
  aiTokensLast7Days: number;
  aiRunsLast7Days: number;
  avgTokensPerRun: number;
  topApps: TopApp[];
  topProjects: TopProject[];
  topClients: TopClient[];
  recentWorkDays: DailyClientBar[];
  recentActivities: RecentActivity[];
  draftInvoiceCount: number;
  overdueInvoiceCount: number;
};

type ProgressRowProps = {
  label: React.ReactNode;
  detail: string;
  value: number;
  color: string;
};

const DEFAULT_CLIENT_COLOR = "#06B6D4";
const DEFAULT_PROJECT_COLOR = "#22C55E";

const HOME_TIPS = [
  "connect RescueTime and your homepage turns into a live focus report instead of a static summary.",
  "use the debug view to inspect AI telemetry when prompts, tool calls, or token usage feel off.",
  "rename noisy raw app titles in the time view so rankings and analytics stay polished everywhere.",
  "autofill works best when projects have clear private notes that help AI match activity to client work.",
  "review the latest activity sessions before invoicing to catch billable work that never became a time entry.",
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatHoursFromSeconds(seconds: number) {
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m`;
  }

  return `${(seconds / 3600).toFixed(seconds >= 36000 ? 0 : 1)}h`;
}

function formatHoursFromMinutes(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  return `${(minutes / 60).toFixed(minutes >= 600 ? 0 : 1)}h`;
}

function formatPercent(value: number) {
  if (value <= 0) return "0%";
  if (value < 1) return "<1%";
  return `${Math.round(value)}%`;
}

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.trim();
  const validHex = /^#([0-9A-Fa-f]{6})$/.test(normalized) ? normalized : "#94A3B8";
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const red = parseInt(validHex.slice(1, 3), 16);
  const green = parseInt(validHex.slice(3, 5), 16);
  const blue = parseInt(validHex.slice(5, 7), 16);

  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
}

function formatAppName(appClass: string, renameMap?: Map<string, string>) {
  const trimmed = appClass.trim();
  if (!trimmed) return "Unknown app";

  const renamed = renameMap?.get(trimmed.toLowerCase());
  if (renamed) {
    return renamed;
  }

  return formatAppTitle(trimmed);
}

function isDefinedNumber(value: number | undefined | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function getDashboardData(): Promise<DashboardData> {
  const timeZone = Temporal.Now.timeZoneId();
  const today = Temporal.Now.plainDateISO(timeZone);
  const monthStart = Temporal.PlainDate.from({
    year: today.year,
    month: today.month,
    day: 1,
  });
  const last7DaysStart = today.subtract({ days: 6 });
  const recentWorkDayDates: Temporal.PlainDate[] = [];
  let recentWorkDayCursor = today;
  while (recentWorkDayDates.length < 5) {
    if (recentWorkDayCursor.dayOfWeek <= 5) {
      recentWorkDayDates.unshift(recentWorkDayCursor);
    }
    recentWorkDayCursor = recentWorkDayCursor.subtract({ days: 1 });
  }
  const recentWorkDayStart = recentWorkDayDates[0] ?? today;

  const monthStartDate = new Date(
    monthStart
      .toZonedDateTime({
        timeZone,
        plainTime: Temporal.PlainTime.from("00:00:00"),
      })
      .toInstant().epochMilliseconds
  );
  const last7DaysStartDate = new Date(
    last7DaysStart
      .toZonedDateTime({
        timeZone,
        plainTime: Temporal.PlainTime.from("00:00:00"),
      })
      .toInstant().epochMilliseconds
  );
  const recentWorkDayStartDate = new Date(
    recentWorkDayStart
      .toZonedDateTime({
        timeZone,
        plainTime: Temporal.PlainTime.from("00:00:00"),
      })
      .toInstant().epochMilliseconds
  );

  const [
    appRenameMap,
    clientCount,
    projectCount,
    invoiceCount,
    draftInvoiceCount,
    overdueInvoiceCount,
    monthlyTimeAggregate,
    aiTelemetryRuns,
    activitySessions,
    recentActivityRows,
    monthlyProjectGroups,
    monthlyClientGroups,
    recentTimeEntries,
  ] = await Promise.all([
    getAppRenameMap(),
    prisma.client.count(),
    prisma.project.count(),
    prisma.invoice.count(),
    prisma.invoice.count({ where: { status: "draft" } }),
    prisma.invoice.count({ where: { status: "overdue" } }),
    prisma.timeEntry.aggregate({
      where: {
        startTime: {
          gte: monthStartDate,
        },
      },
      _sum: {
        durationMinutes: true,
      },
    }),
    prisma.aiTelemetryRun.findMany({
      where: {
        createdAt: {
          gte: last7DaysStartDate,
        },
      },
      select: {
        totalTokens: true,
      },
    }),
    prisma.activitySession.findMany({
      where: {
        startTime: {
          gte: last7DaysStartDate,
        },
        ignored: false,
      },
      select: {
        appClass: true,
        durationSeconds: true,
      },
    }),
    prisma.activitySession.findMany({
      where: {
        ignored: false,
      },
      orderBy: {
        startTime: "desc",
      },
      take: 2,
      select: {
        id: true,
        appClass: true,
        windowTitle: true,
        durationSeconds: true,
        startTime: true,
        endTime: true,
      },
    }),
    prisma.timeEntry.groupBy({
      by: ["projectId"],
      where: {
        startTime: {
          gte: monthStartDate,
        },
      },
      _sum: {
        durationMinutes: true,
      },
      orderBy: {
        _sum: {
          durationMinutes: "desc",
        },
      },
      take: 4,
    }),
    prisma.timeEntry.groupBy({
      by: ["projectId"],
      where: {
        startTime: {
          gte: monthStartDate,
        },
      },
      _sum: {
        durationMinutes: true,
      },
    }),
    prisma.timeEntry.findMany({
      where: {
        startTime: {
          gte: recentWorkDayStartDate,
        },
      },
      orderBy: {
        startTime: "desc",
      },
      select: {
        projectId: true,
        startTime: true,
        durationMinutes: true,
        billable: true,
      },
    }),
  ]);

  const projectIds = Array.from(new Set(monthlyProjectGroups.map((group) => group.projectId).filter(isDefinedNumber)));
  const clientProjectIds = Array.from(new Set(monthlyClientGroups.map((group) => group.projectId).filter(isDefinedNumber)));
  const recentEntryProjectIds = Array.from(new Set(recentTimeEntries.map((entry) => entry.projectId).filter(isDefinedNumber)));
  const allReferencedProjectIds = Array.from(new Set([...projectIds, ...clientProjectIds, ...recentEntryProjectIds]));
  const projectDetails = projectIds.length
    ? await prisma.project.findMany({
      where: {
        id: { in: projectIds },
      },
      select: {
        id: true,
        name: true,
        color: true,
        clientId: true,
      },
    })
    : [];

  const relatedProjects = allReferencedProjectIds.length
    ? await prisma.project.findMany({
      where: {
        id: { in: allReferencedProjectIds },
      },
      select: {
        id: true,
        clientId: true,
      },
    })
    : [];

  const clientIds = Array.from(new Set(relatedProjects.map((project) => project.clientId).concat(projectDetails.map((project) => project.clientId))));
  const clients: DashboardClientLookup[] = clientIds.length
    ? (await prisma.client.findMany({
      where: {
        id: { in: clientIds },
      },
    })).map((client) => ({
      id: client.id,
      name: client.name,
      color: ((client as unknown) as DashboardClientLookup & { color?: string }).color || DEFAULT_CLIENT_COLOR,
    }))
    : [];

  const projectMap = new Map(projectDetails.map((project) => [project.id, project]));
  const relatedProjectMap = new Map(relatedProjects.map((project) => [project.id, project]));
  const clientMap = new Map(clients.map((client) => [client.id, client]));
  const clientAggregate = new Map<number, { name: string; color: string; minutes: number; projectIds: Set<number> }>();

  const totalActivitySeconds = activitySessions.reduce(
    (sum, session) => sum + session.durationSeconds,
    0
  );
  const appAggregate = new Map<string, { appName: string; durationSeconds: number; sessions: number }>();

  for (const session of activitySessions) {
    const appClass = session.appClass || "Unknown app";
    const appName = formatAppName(appClass, appRenameMap);
    const existing = appAggregate.get(appClass) ?? { appName, durationSeconds: 0, sessions: 0 };
    existing.appName = appName;
    existing.durationSeconds += session.durationSeconds;
    existing.sessions += 1;
    appAggregate.set(appClass, existing);
  }

  const topApps = Array.from(appAggregate.entries())
    .map(([appClass, value]) => ({
      appClass,
      appName: value.appName,
      durationSeconds: value.durationSeconds,
      sessions: value.sessions,
      share: totalActivitySeconds > 0 ? (value.durationSeconds / totalActivitySeconds) * 100 : 0,
    }))
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, 4);

  const totalMonthlyMinutes = monthlyProjectGroups.reduce(
    (sum, group) => sum + (group._sum.durationMinutes ?? 0),
    0
  );

  const topProjects: TopProject[] = monthlyProjectGroups
    .map((group) => {
      const details = projectMap.get(group.projectId);
      const minutes = group._sum.durationMinutes ?? 0;

      const client = details ? clientMap.get(details.clientId) : null;

      return details && client
        ? {
          id: details.id,
          name: details.name,
          clientName: client.name,
          color: details.color || DEFAULT_PROJECT_COLOR,
          minutes,
          share: totalMonthlyMinutes > 0 ? (minutes / totalMonthlyMinutes) * 100 : 0,
        }
        : null;
    })
    .filter((project): project is TopProject => project !== null);

  for (const group of monthlyClientGroups) {
    const minutes = group._sum.durationMinutes ?? 0;
    if (!minutes) continue;

    const project = relatedProjectMap.get(group.projectId);
    if (!project) continue;

    const client = clientMap.get(project.clientId);
    if (!client) continue;

    const current = clientAggregate.get(client.id) ?? {
      name: client.name,
      color: client.color || DEFAULT_CLIENT_COLOR,
      minutes: 0,
      projectIds: new Set<number>(),
    };

    current.minutes += minutes;
    current.projectIds.add(project.id);
    clientAggregate.set(client.id, current);
  }

  const totalClientMinutes = Array.from(clientAggregate.values()).reduce(
    (sum, client) => sum + client.minutes,
    0
  );

  const topClients: TopClient[] = Array.from(clientAggregate.entries())
    .map(([id, client]) => ({
      id,
      name: client.name,
      color: client.color,
      minutes: client.minutes,
      projectCount: client.projectIds.size,
      share: totalClientMinutes > 0 ? (client.minutes / totalClientMinutes) * 100 : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 4);

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone,
  });
  const workDayEntries = new Map<string, Map<number, { clientName: string; color: string; minutes: number }>>();

  for (const entry of recentTimeEntries) {
    const plainDate = Temporal.Instant.from(entry.startTime.toISOString())
      .toZonedDateTimeISO(timeZone)
      .toPlainDate();
    const dayOfWeek = plainDate.dayOfWeek;
    if (dayOfWeek === 6 || dayOfWeek === 7) continue;

    const dateKey = plainDate.toString();
    const dayBucket = workDayEntries.get(dateKey) ?? new Map<number, { clientName: string; color: string; minutes: number }>();
    const project = relatedProjectMap.get(entry.projectId);
    if (!project) continue;
    const client = clientMap.get(project.clientId);
    if (!client) continue;
    const clientId = client.id;
    const existing = dayBucket.get(clientId) ?? {
      clientName: client.name,
      color: client.color || DEFAULT_CLIENT_COLOR,
      minutes: 0,
    };

    existing.minutes += entry.durationMinutes;
    dayBucket.set(clientId, existing);
    workDayEntries.set(dateKey, dayBucket);
  }

  const recentWorkDays: DailyClientBar[] = recentWorkDayDates.map((plainDate) => {
    const dateKey = plainDate.toString();
    const dayBucket = workDayEntries.get(dateKey) ?? new Map();
    const segments = Array.from(dayBucket.entries())
      .map(([clientId, client]) => ({
        clientId,
        clientName: client.clientName,
        color: client.color,
        minutes: client.minutes,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    return {
      date: dateKey,
      label: dateFormatter.format(
        new Date(
          plainDate
            .toZonedDateTime({
              timeZone,
              plainTime: Temporal.PlainTime.from("12:00:00"),
            })
            .toInstant().epochMilliseconds
        )
      ),
      totalMinutes: segments.reduce((sum, segment) => sum + segment.minutes, 0),
      segments,
    };
  });

  const billableHoursLast7Days = recentTimeEntries.reduce((sum, entry) => {
    if (!entry.billable) return sum;

    const plainDate = Temporal.Instant.from(entry.startTime.toISOString())
      .toZonedDateTimeISO(timeZone)
      .toPlainDate();
    const dayOfWeek = plainDate.dayOfWeek;
    if (dayOfWeek === 6 || dayOfWeek === 7) return sum;

    return sum + entry.durationMinutes;
  }, 0) / 60;

  const aiTokensLast7Days = aiTelemetryRuns.reduce(
    (sum, run) => sum + (run.totalTokens ?? 0),
    0
  );
  const aiRunsLast7Days = aiTelemetryRuns.length;

  const recentActivities = recentActivityRows.map((activity) => ({
    id: activity.id,
    appClass: activity.appClass,
    appName: formatAppName(activity.appClass || "Unknown app", appRenameMap),
    windowTitle: activity.windowTitle,
    durationSeconds: activity.durationSeconds,
    startTime: activity.startTime.toISOString(),
    endTime: activity.endTime.toISOString(),
  }));

  return {
    clientCount,
    projectCount,
    invoiceCount,
    hoursLoggedThisMonth: (monthlyTimeAggregate._sum.durationMinutes ?? 0) / 60,
    billableHoursLast7Days,
    aiTokensLast7Days,
    aiRunsLast7Days,
    avgTokensPerRun:
      aiRunsLast7Days > 0 ? Math.round(aiTokensLast7Days / aiRunsLast7Days) : 0,
    topApps,
    topProjects,
    topClients,
  recentWorkDays,
    recentActivities,
    draftInvoiceCount,
    overdueInvoiceCount,
  };
}

function BentoCard({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-3xl border border-gray-200/70 bg-white/85 p-6 shadow-sm shadow-gray-200/60 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80 dark:shadow-black/20 ${className}`}
    >
      {children}
    </section>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-center items-center rounded-2xl border border-gray-200/70 bg-gray-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/60">
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{value}</div>
    </div>
  );
}

function ProgressRow({
  label,
  detail,
  value,
  color,
}: ProgressRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium text-gray-950 dark:text-white">{label}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">{detail}</div>
        </div>
        <div className="text-sm font-medium text-gray-600 dark:text-gray-300">{formatPercent(value)}</div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(value, 6)}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

export default async function Page() {
  const data = await getDashboardData();
  const tipIndex = Math.abs(todayTipSeed()) % HOME_TIPS.length;
  const activeTip = HOME_TIPS[tipIndex];
  const maxRecentWorkDayMinutes = Math.max(...data.recentWorkDays.map((day) => day.totalMinutes), 1);
  const recentWorkDayLegend = Array.from(
    new Map(
      data.recentWorkDays
        .flatMap((day) => day.segments)
        .map((segment) => [segment.clientId, {
          clientId: segment.clientId,
          clientName: segment.clientName,
          color: segment.color || DEFAULT_CLIENT_COLOR,
        }])
    ).values()
  );

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="mx-auto space-y-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-gray-950 dark:text-white md:text-5xl">
                A sharper pulse on your freelance business.
              </h1>
              <div className="mt-4 flex max-w-2xl items-start gap-3 rounded-2xl text-sm text-gray-900/70 dark:text-white/70">
                <span>Btw, you can {activeTip}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-md">
            <MetricPill label="Clients" value={formatNumber(data.clientCount)} />
            <MetricPill label="Projects" value={formatNumber(data.projectCount)} />
            <MetricPill label="Invoices" value={formatNumber(data.invoiceCount)} />
            <MetricPill label={new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date())}
              value={data.hoursLoggedThisMonth.toFixed(1)} />
          </div>
        </div>

        <div className="grid auto-rows-[minmax(220px,auto)] grid-cols-1 gap-5 lg:grid-cols-12">
          <BentoCard className="bg-linear-to-br from-gray-950 via-gray-900 to-blue-950 text-white dark:border-gray-800 lg:col-span-7 lg:row-span-2">
            <div className="flex h-full flex-col justify-between gap-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-blue-100/80">
                    <Gauge className="h-3.5 w-3.5" />
                    Control center
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">
                    Keep common next steps close, while the latest operating signals stay front and center.
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100/70">
                    Jump into the work that matters most, then use the extra space for a quick read on what’s driving focus this week.
                  </p>
                </div>
                <Workflow className="hidden h-10 w-10 text-blue-200/80 md:block" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Link
                  href="/clients/new"
                  className="group rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                >
                  <Users className="h-5 w-5 text-blue-200" />
                  <div className="mt-8 text-lg font-medium">Add client</div>
                  <div className="mt-1 text-sm text-blue-100/70">Start a new relationship and capture billing details.</div>
                </Link>
                <Link
                  href="/projects/new"
                  className="group rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                >
                  <FolderKanban className="h-5 w-5 text-emerald-200" />
                  <div className="mt-8 text-lg font-medium">Create project</div>
                  <div className="mt-1 text-sm text-blue-100/70">Spin up scoped work with client context and rates.</div>
                </Link>
                <Link
                  href="/time/new"
                  className="group rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                >
                  <Clock3 className="h-5 w-5 text-amber-200" />
                  <div className="mt-8 text-lg font-medium">Log time</div>
                  <div className="mt-1 text-sm text-blue-100/70">Turn recent focus into billable entries before it fades.</div>
                </Link>
                <Link
                  href="/invoices/new"
                  className="group rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                >
                  <CircleDollarSign className="h-5 w-5 text-fuchsia-200" />
                  <div className="mt-8 text-lg font-medium">Create invoice</div>
                  <div className="mt-1 text-sm text-blue-100/70">Package recent work into something ready to send.</div>
                </Link>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-blue-100/70">Client time mix</div>
                      <div className="mt-1 text-sm text-blue-100/80">Last 5 work days, stacked by client</div>
                    </div>
                    <Radar className="h-4 w-4 text-blue-200/80" />
                  </div>
                  <div className="mt-5 flex h-40 items-end gap-3">
                    {data.recentWorkDays.length > 0 ? data.recentWorkDays.map((day) => (
                      <div key={day.date} className="flex h-full flex-1 flex-col justify-end items-center gap-2">
                        <div className="flex h-34 w-full items-end overflow-hidden rounded-2xl bg-white/5 px-1 pb-1">
                          <div
                            className="flex w-full flex-col-reverse overflow-hidden rounded-2xl"
                            style={{ height: `${Math.max(18, Math.round((day.totalMinutes / maxRecentWorkDayMinutes) * 128))}px` }}
                          >
                            {day.segments.map((segment) => (
                              <div
                                key={`${day.date}-${segment.clientId}`}
                                className="blur-sm transform scale-125"
                                style={{
                                  height: `${(segment.minutes / day.totalMinutes) * 100}%`,
                                  backgroundColor: withAlpha(segment.color || DEFAULT_CLIENT_COLOR, 0.95),
                                }}
                                title={`${segment.clientName}: ${formatHoursFromMinutes(segment.minutes)}`}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="text-[11px] leading-none text-blue-100/65">{day.label}</div>
                      </div>
                    )) : (
                      <div className="flex h-full w-full items-end justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 pb-3 text-center text-xs text-blue-100/60">
                        Daily client time will show up here once time entries land during the work week.
                      </div>
                    )}
                  </div>
                  {recentWorkDayLegend.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-blue-100/70">
                      {recentWorkDayLegend.map((item) => (
                        <div key={item.clientId} className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="max-w-28 truncate">{item.clientName}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-blue-100/70">Draft invoices</div>
                    <div className="mt-2 text-2xl font-semibold">{formatNumber(data.draftInvoiceCount)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-blue-100/70">Overdue invoices</div>
                    <div className="mt-2 text-2xl font-semibold">{formatNumber(data.overdueInvoiceCount)}</div>
                  </div>
                  <div className="col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-blue-100/70">7-day Hours billable</div>
                    <div className="mt-2 text-2xl font-semibold">{formatNumber(Math.round(data.billableHoursLast7Days))}</div>
                  </div>
                  <Link
                    href="/debug"
                    className="col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-blue-100/70">AI debug</div>
                      <Cpu className="h-4 w-4 text-blue-200/80" />
                    </div>
                    <div className="mt-2 text-sm text-blue-100/80">Inspect telemetry, prompts, and tool calls</div>
                  </Link>
                </div>
              </div>
            </div>
          </BentoCard>

          <BentoCard className="lg:col-span-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  AI usage
                </div>
                <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">Token burn over the last 7 days</h2>
              </div>
              <div className="rounded-2xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                <Bot className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <MetricPill label="Total tokens" value={formatCompactNumber(data.aiTokensLast7Days)} />
              <MetricPill label="Runs" value={formatNumber(data.aiRunsLast7Days)} />
              <MetricPill label="Avg / run" value={formatCompactNumber(data.avgTokensPerRun)} />
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-gray-200 p-4 dark:border-gray-800">
              <div className="flex items-center justify-between gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span>
                  {data.aiRunsLast7Days > 0
                    ? `AI runs are averaging ${formatCompactNumber(data.avgTokensPerRun)} tokens per run.`
                    : "No AI telemetry runs were captured in the last 7 days yet."}
                </span>
                <Link
                  href="/debug"
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                >
                  Open debug
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </BentoCard>

          <BentoCard className="lg:col-span-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  Activity ranking
                </div>
                <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">Most used apps this week</h2>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                <BriefcaseBusiness className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {data.topApps.length > 0 ? (
                data.topApps.map((app, index) => (
                  <ProgressRow
                    key={app.appClass}
                    label={
                      <>
                        {index + 1}.{" "}
                        <Link
                          href={getAppAnalyticsHref(app.appClass)}
                          className="transition hover:text-emerald-700 dark:hover:text-emerald-300"
                        >
                          {app.appName}
                        </Link>
                      </>
                    }
                    detail={`${formatHoursFromSeconds(app.durationSeconds)} across ${app.sessions} sessions`}
                    value={app.share}
                    color={index === 0 ? "#10B981" : index === 1 ? "#14B8A6" : index === 2 ? "#06B6D4" : "#64748B"}
                  />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
                  No recent activity sessions yet. Once new sessions are synced, the leaderboard will populate here.
                </div>
              )}
            </div>
          </BentoCard>

          <BentoCard className="lg:col-span-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  Project focus
                </div>
                <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">Top projects this month</h2>
              </div>
              <div className="rounded-2xl bg-violet-50 p-3 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300">
                <FolderKanban className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {data.topProjects.length > 0 ? (
                data.topProjects.map((project, index) => (
                  <ProgressRow
                    key={project.id}
                    label={`${index + 1}. ${project.name}`}
                    detail={`${project.clientName} · ${formatHoursFromMinutes(project.minutes)}`}
                    value={project.share}
                    color={project.color || DEFAULT_PROJECT_COLOR}
                  />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
                  No time entries logged this month yet.
                </div>
              )}
            </div>
          </BentoCard>

          <BentoCard className="lg:col-span-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  Live feed
                </div>
                <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">Latest app sessions</h2>
              </div>
              <div className="rounded-2xl bg-amber-50 p-3 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300">
                <Clock3 className="h-5 w-5" />
              </div>
            </div>

            {data.recentActivities.length > 0 ? (
              <div className="mt-6 space-y-4">
                {data.recentActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="rounded-2xl border border-gray-200/70 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-950/50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Link
                          href={getAppAnalyticsHref(activity.appClass)}
                          className="text-base font-semibold text-gray-950 transition hover:text-blue-700 dark:text-white dark:hover:text-blue-300"
                        >
                          {activity.appName}
                        </Link>
                        <div className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                          {activity.windowTitle || "No window title captured for this session."}
                        </div>
                      </div>
                      <div className="text-sm font-medium text-amber-700 dark:text-amber-300">
                        {formatHoursFromSeconds(activity.durationSeconds)}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Started</div>
                        <ClientDateTime
                          value={activity.startTime}
                          className="mt-1 block text-sm font-medium text-gray-950 dark:text-white"
                        />
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Ended</div>
                        <ClientDateTime
                          value={activity.endTime}
                          className="mt-1 block text-sm font-medium text-gray-950 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <Link
                  href="/time"
                  className="inline-flex items-center gap-2 text-sm font-medium text-amber-700 transition hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
                >
                  Review tracked activity
                  <span aria-hidden>→</span>
                </Link>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-gray-200 p-6 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
                No activity sessions have been pushed to the database yet.
              </div>
            )}
          </BentoCard>

          <BentoCard className="lg:col-span-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  Client focus
                </div>
                <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">Top clients this month</h2>
              </div>
              <div className="rounded-2xl bg-rose-50 p-3 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">
                <LineChart className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {data.topClients.length > 0 ? (
                data.topClients.map((client, index) => (
                  <ProgressRow
                    key={client.id}
                    label={`${index + 1}. ${client.name}`}
                    detail={`${formatHoursFromMinutes(client.minutes)} across ${client.projectCount} project${client.projectCount === 1 ? "" : "s"}`}
                    value={client.share}
                    color={client.color || DEFAULT_CLIENT_COLOR}
                  />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
                  No client time distribution yet because this month doesn’t have any logged project hours.
                </div>
              )}
            </div>
          </BentoCard>
        </div>
      </div>
    </div>
  );
}

function todayTipSeed() {
  const today = Temporal.Now.plainDateISO();
  return today.year * 10_000 + today.month * 100 + today.day;
}
