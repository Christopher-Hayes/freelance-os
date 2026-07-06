"use client";

import { useEffect, useState, useMemo, useCallback, memo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Temporal } from "@/lib/temporal-polyfill";
import DayTimeline from "./components/DayTimeline";
import { APIFooter, Badge, Button, EmptySurfaceState, Input, Page, PageContent, PageError, PageHeader, PageLoading, Section, Select, StatCard, Surface, SurfaceHeader } from "@repo/ui";
import { generateCode } from '@/lib/ai-actions';
import { authFetch, formatAppTitle, syncAppDataToLocalStorage } from '@/lib/util';
import { CalendarDays, Clock3, Coins, Filter, FolderKanban, Plus, RefreshCw, Sparkles, Table2, TimerReset } from 'lucide-react';

function getAppAnalyticsHref(appClass: string) {
  return `/analytics/apps/${encodeURIComponent(appClass).replace(/\(/g, "%28").replace(/\)/g, "%29")}`;
}

interface TimeEntry {
  id: number;
  projectId: number;
  description: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  billable: boolean;
  project: {
    id: number;
    name: string;
    color: string;
    client: {
      id: number;
      name: string;
      company: string | null;
    };
  };
}

interface Summary {
  totalMinutes: number;
  totalHours: number;
  count: number;
  topAppThisWeek?: {
    appClass: string;
    hours: number;
  } | null;
  topProjectThisMonth?: {
    projectName: string;
    hours: number;
  } | null;
  hoursThisMonth?: number;
}

interface Client {
  id: number;
  name: string;
  company: string | null;
}

interface Project {
  id: number;
  name: string;
  clientId: number;
  color: string;
}

// Helper functions moved outside component
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatTime = (dateString: string) => {
  return new Date(dateString).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

const formatPlainDateLabel = (date: Temporal.PlainDate) =>
  date.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });

const formatPlainMonthLabel = (date: Temporal.PlainDate) =>
  date.toLocaleString("en-US", { month: 'long', year: 'numeric' });

const formatWeekLabel = (date: Temporal.PlainDate) => {
  const weekStart = date.subtract({ days: date.dayOfWeek - 1 }); // Monday
  const weekEnd = weekStart.add({ days: 6 }); // Sunday
  const startStr = weekStart.toLocaleString("en-US", { month: "short", day: "numeric" });
  const endStr = weekEnd.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startStr} – ${endStr}`;
};

const TIME_DATE_QUERY_PARAM = "date";

const parseDateParam = (dateParam: string | null): Temporal.PlainDate | null => {
  if (!dateParam) return null;

  try {
    return Temporal.PlainDate.from(dateParam);
  } catch {
    return null;
  }
};

// Memoized TimeEntryRow component
const TimeEntryRow = memo(function TimeEntryRow({
  entry,
  onDelete,
}: {
  entry: TimeEntry;
  onDelete: (id: number) => void;
}) {
  const formattedDate = useMemo(
    () => formatDate(entry.startTime),
    [entry.startTime]
  );

  const formattedTimes = useMemo(() => ({
    start: formatTime(entry.startTime),
    end: formatTime(entry.endTime),
  }), [entry.startTime, entry.endTime]);

  const formattedDuration = useMemo(
    () => formatDuration(entry.durationMinutes),
    [entry.durationMinutes]
  );

  const handleDeleteClick = useCallback(() => {
    onDelete(entry.id);
  }, [entry.id, onDelete]);

  return (
    <tr className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
        {formattedDate}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
        {formattedTimes.start} - {formattedTimes.end}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
        {entry.project.client.name}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
        {entry.project.name}
      </td>
      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
        {entry.description || (
          <span className="italic text-gray-400 dark:text-gray-500">
            No description
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
        {formattedDuration}
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <Badge variant={entry.billable ? "success" : "subtle"} size="sm">
          {entry.billable ? "Billable" : "Non-billable"}
        </Badge>
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
        <Link
          href={`/time/${entry.id}`}
          className="mr-3 text-blue-600 transition-colors hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Edit
        </Link>
        <button
          onClick={handleDeleteClick}
          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
        >
          Delete
        </button>
      </td>
    </tr>
  );
});

export default function TimeEntriesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Pagination state
  const [displayCount, setDisplayCount] = useState(10);
  const [hasMore, setHasMore] = useState(false);

  // Toggle for entries table
  const [showEntriesTable, setShowEntriesTable] = useState(false);

  // Day view state - use Temporal.PlainDate
  const [selectedDate, setSelectedDate] = useState<Temporal.PlainDate>(() => {
    return parseDateParam(searchParams.get(TIME_DATE_QUERY_PARAM)) ?? Temporal.Now.plainDateISO();
  });
  const [isToday, setIsToday] = useState<boolean>(() => {
    const today = Temporal.Now.plainDateISO();
    return selectedDate.equals(today);
  });
  const [isThisWeek, setIsThisWeek] = useState<boolean>(() => {
    const today = Temporal.Now.plainDateISO();
    const startOfWeek = today.subtract({ days: today.dayOfWeek - 1 });
    const endOfWeek = startOfWeek.add({ days: 6 });
    return Temporal.PlainDate.compare(selectedDate, startOfWeek) >= 0 && Temporal.PlainDate.compare(selectedDate, endOfWeek) <= 0;
  });
  // Filters
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    const today = Temporal.Now.plainDateISO();
    setIsToday(selectedDate.equals(today));

    const startOfWeek = today.subtract({ days: today.dayOfWeek - 1 });
    const endOfWeek = startOfWeek.add({ days: 6 });
    setIsThisWeek(Temporal.PlainDate.compare(selectedDate, startOfWeek) >= 0 && Temporal.PlainDate.compare(selectedDate, endOfWeek) <= 0);
  }, [selectedDate]);

  // URL → state: runs only when searchParams changes (back/forward, external link).
  // Intentionally excludes `selectedDate` from deps — adding it would cause this effect
  // to fire when the user picks a new date, reading a stale URL (before our replace has
  // landed) and snapping back to today.
  useEffect(() => {
    const dateFromUrl = parseDateParam(searchParams.get(TIME_DATE_QUERY_PARAM));
    const nextDate = dateFromUrl ?? Temporal.Now.plainDateISO();
    const nextDateString = nextDate.toString();
    if (nextDateString !== selectedDate.toString()) {
      setSelectedDate(nextDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // State → URL: runs when the selected date changes. Does not depend on searchParams
  // so updating the URL can never re-trigger this effect and create a cycle.
  useEffect(() => {
    const today = Temporal.Now.plainDateISO().toString();
    const dateStr = selectedDate.toString();
    const url = dateStr === today
      ? pathname
      : `${pathname}?${TIME_DATE_QUERY_PARAM}=${dateStr}`;
    router.replace(url, { scroll: false });
  }, [selectedDate, pathname, router]);

  // Fetch clients and projects for filters
  useEffect(() => {
    syncAppDataToLocalStorage();
    Promise.all([
      authFetch("/api/clients").then((res) => res.json()),
      authFetch("/api/projects").then((res) => res.json()),
    ])
      .then(([clientsData, projectsData]) => {
        // Ensure we only set arrays, handle error responses
        if (Array.isArray(clientsData)) {
          setClients(clientsData);
        } else {
          console.error("Clients API returned non-array:", clientsData);
          setClients([]);
        }
        
        if (Array.isArray(projectsData)) {
          setProjects(projectsData);
        } else {
          console.error("Projects API returned non-array:", projectsData);
          setProjects([]);
        }
      })
      .catch((err) => {
        console.error("Error fetching filter data:", err);
        setClients([]);
        setProjects([]);
      });
  }, []);

  // Fetch time entries based on filters
  useEffect(() => {
    fetchTimeEntries();
  }, [selectedClientId, selectedProjectId, startDate, endDate, selectedDate]);

  const fetchTimeEntries = async () => {
    setLoading(true);
    setError("");
    setDisplayCount(10); // Reset display count when filters change

    try {
      const params = new URLSearchParams();
      if (selectedClientId) params.append("clientId", selectedClientId);
      if (selectedProjectId) params.append("projectId", selectedProjectId);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      
      // Pass the selected date for summary card calculations
      params.append("contextDate", selectedDate.toString());

      const response = await authFetch(`/api/time?${params}`);
      if (!response.ok) throw new Error("Failed to fetch time entries");

      const data = await response.json();
      setTimeEntries(data.timeEntries);
      setSummary(data.summary);
      setHasMore(data.timeEntries.length > 10);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("Are you sure you want to delete this time entry?")) return;

    try {
      const response = await authFetch(`/api/time/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete time entry");

      // Refresh list
      fetchTimeEntries();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete time entry");
    }
  }, []);

  const loadMore = useCallback(() => {
    setDisplayCount(prev => {
      const newCount = prev + 10;
      setHasMore(newCount < timeEntries.length);
      return newCount;
    });
  }, [timeEntries.length]);

  // Navigate to previous day
  const previousDay = () => {
    setSelectedDate(selectedDate.subtract({ days: 1 }));
  };

  // Navigate to next day
  const nextDay = () => {
    setSelectedDate(selectedDate.add({ days: 1 }));
  };

  const filteredProjects = selectedClientId
    ? projects.filter((p) => p.clientId === parseInt(selectedClientId))
    : projects;

  // Get visible entries
  const visibleEntries = timeEntries.slice(0, displayCount);
  const hasActiveFilters = Boolean(selectedClientId || selectedProjectId || startDate || endDate);
  const selectedClient = clients.find((client) => String(client.id) === selectedClientId);
  const selectedProject = projects.find((project) => String(project.id) === selectedProjectId);

  // Compute stats for the selected day
  const selectedDayEntries = useMemo(() => {
    const dateStr = selectedDate.toString(); // YYYY-MM-DD
    return timeEntries.filter((entry) => {
      // Compare local date of startTime against selectedDate
      const localDate = new Date(entry.startTime).toLocaleDateString("en-CA"); // yields YYYY-MM-DD
      return localDate === dateStr;
    });
  }, [timeEntries, selectedDate]);

  const selectedDayStats = useMemo(() => {
    const totalMinutes = selectedDayEntries.reduce((sum, e) => sum + e.durationMinutes, 0);
    const billableMinutes = selectedDayEntries
      .filter((e) => e.billable)
      .reduce((sum, e) => sum + e.durationMinutes, 0);
    const projectMap = new Map<string, { minutes: number; color: string }>();
    for (const entry of selectedDayEntries) {
      const existing = projectMap.get(entry.project.name);
      projectMap.set(entry.project.name, {
        minutes: (existing?.minutes ?? 0) + entry.durationMinutes,
        color: existing?.color ?? entry.project.color ?? "#94a3b8",
      });
    }
    const topProjectEntry = [...projectMap.entries()].sort((a, b) => b[1].minutes - a[1].minutes)[0];
    return {
      totalMinutes,
      totalHours: totalMinutes / 60,
      billableMinutes,
      billableHours: billableMinutes / 60,
      count: selectedDayEntries.length,
      topProject: topProjectEntry
        ? { name: topProjectEntry[0], minutes: topProjectEntry[1].minutes, color: topProjectEntry[1].color }
        : null,
    };
  }, [selectedDayEntries]);

  // Compute stats for the week containing selectedDate (Mon–Sun)
  const selectedWeekEntries = useMemo(() => {
    const weekStart = selectedDate.subtract({ days: selectedDate.dayOfWeek - 1 });
    const weekEnd = weekStart.add({ days: 6 });
    return timeEntries.filter((entry) => {
      const localDate = Temporal.PlainDate.from(
        new Date(entry.startTime).toLocaleDateString("en-CA")
      );
      return (
        Temporal.PlainDate.compare(localDate, weekStart) >= 0 &&
        Temporal.PlainDate.compare(localDate, weekEnd) <= 0
      );
    });
  }, [timeEntries, selectedDate]);

  const selectedWeekStats = useMemo(() => {
    const totalMinutes = selectedWeekEntries.reduce((sum, e) => sum + e.durationMinutes, 0);
    const billableMinutes = selectedWeekEntries
      .filter((e) => e.billable)
      .reduce((sum, e) => sum + e.durationMinutes, 0);
    const projectMap = new Map<string, { minutes: number; color: string }>();
    for (const entry of selectedWeekEntries) {
      const existing = projectMap.get(entry.project.name);
      projectMap.set(entry.project.name, {
        minutes: (existing?.minutes ?? 0) + entry.durationMinutes,
        color: existing?.color ?? entry.project.color ?? "#94a3b8",
      });
    }
    const topProjectEntry = [...projectMap.entries()].sort((a, b) => b[1].minutes - a[1].minutes)[0];
    return {
      totalMinutes,
      totalHours: totalMinutes / 60,
      billableMinutes,
      billableHours: billableMinutes / 60,
      count: selectedWeekEntries.length,
      topProject: topProjectEntry
        ? { name: topProjectEntry[0], minutes: topProjectEntry[1].minutes, color: topProjectEntry[1].color }
        : null,
    };
  }, [selectedWeekEntries]);

  const handleGenerateCode = async (endpoint: any, language: string) => {
    return await generateCode(endpoint, language);
  };

  const clearFilters = () => {
    setSelectedClientId("");
    setSelectedProjectId("");
    setStartDate("");
    setEndDate("");
  };

  if (loading && !summary && timeEntries.length === 0) {
    return <PageLoading title="Loading time tracking" message="Gathering your timeline, summaries, and recent entries." />;
  }

  return (
    <Page>
      <PageContent>
        <Section className="space-y-6">
          <PageHeader
            eyebrow="Operations"
            title="Time Tracking"
            description="Review daily activity, manage project time entries, and inspect recent logged work from one place."
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/time/new"
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Time Entry
                </Link>
              </div>
            }
          />

          <DayTimeline
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
          />

          {/* Day stats */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {isToday ? "Today" : formatPlainDateLabel(selectedDate)}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Hours logged"
                value={selectedDayStats.totalHours.toFixed(1)}
                meta={`${selectedDayStats.count} entr${selectedDayStats.count === 1 ? "y" : "ies"} recorded`}
                tone="info"
                icon={<Clock3 className="h-4 w-4" />}
              />
              <StatCard
                label="Billable hours"
                value={selectedDayStats.billableHours.toFixed(1)}
                meta={
                  selectedDayStats.totalMinutes > 0
                    ? `${Math.round((selectedDayStats.billableMinutes / selectedDayStats.totalMinutes) * 100)}% of total`
                    : "No entries"
                }
                tone="success"
                icon={<Coins className="h-4 w-4" />}
              />
              <StatCard
                label="Non-billable hours"
                value={((selectedDayStats.totalMinutes - selectedDayStats.billableMinutes) / 60).toFixed(1)}
                meta={
                  selectedDayStats.totalMinutes > 0
                    ? `${Math.round(((selectedDayStats.totalMinutes - selectedDayStats.billableMinutes) / selectedDayStats.totalMinutes) * 100)}% of total`
                    : "No entries"
                }
                tone="warning"
                icon={<TimerReset className="h-4 w-4" />}
              />
              <StatCard
                label="Top project"
                value={selectedDayStats.topProject ? (
                  <span style={{ color: selectedDayStats.topProject.color }}>
                    {selectedDayStats.topProject.name}
                  </span>
                ) : "No entries"}
                meta={
                  selectedDayStats.topProject
                    ? formatDuration(selectedDayStats.topProject.minutes)
                    : "No time logged"
                }
                tone="default"
                icon={<FolderKanban className="h-4 w-4" />}
              />
            </div>
          </div>

          {/* Week stats */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {isThisWeek ? "This week" : formatWeekLabel(selectedDate)}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={`Hours ${isThisWeek ? "this week" : `week of ${formatPlainDateLabel(startDate)}`}`}
                value={selectedWeekStats.totalHours.toFixed(1)}
                meta={`${selectedWeekStats.count} entr${selectedWeekStats.count === 1 ? "y" : "ies"} recorded`}
                tone="info"
                icon={<Clock3 className="h-4 w-4" />}
              />
              <StatCard
                label={`Billable ${isThisWeek ? "this week" : `week of ${formatPlainDateLabel(selectedDate)}`}`}
                value={selectedWeekStats.billableHours.toFixed(1)}
                meta={
                  selectedWeekStats.totalMinutes > 0
                    ? `${Math.round((selectedWeekStats.billableMinutes / selectedWeekStats.totalMinutes) * 100)}% of total`
                    : "No entries"
                }
                tone="success"
                icon={<Coins className="h-4 w-4" />}
              />
              <StatCard
                label={`Top project ${isThisWeek ? "this week" : `week of ${formatPlainDateLabel(selectedDate)}`}`}
                value={selectedWeekStats.topProject ? (
                  <span style={{ color: selectedWeekStats.topProject.color }}>
                    {selectedWeekStats.topProject.name}
                  </span>
                ) : "No entries"}
                meta={
                  selectedWeekStats.topProject
                    ? formatDuration(selectedWeekStats.topProject.minutes)
                    : "No time logged"
                }
                tone="warning"
                icon={<FolderKanban className="h-4 w-4" />}
              />
              <StatCard
                label={`Top app ${isThisWeek ? "this week" : `week of ${formatPlainDateLabel(selectedDate)}`}`}
                value={summary?.topAppThisWeek ? formatAppTitle(summary.topAppThisWeek.appClass) : "No data"}
                meta={summary?.topAppThisWeek ? (
                  <Link
                    href={getAppAnalyticsHref(summary.topAppThisWeek.appClass)}
                    className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                  >
                    {summary.topAppThisWeek.hours}h tracked · View analytics
                  </Link>
                ) : "No activity sessions"}
                tone="default"
                icon={<Sparkles className="h-4 w-4" />}
              />
            </div>
          </div>

          {/* Toggle for project entries table */}
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowEntriesTable((v) => !v)}
            >
              <Table2 className="mr-2 h-4 w-4" />
              {showEntriesTable ? "Hide project entries table" : "Show project entries table"}
            </Button>
          </div>

          {showEntriesTable && (
          <Surface>
            <SurfaceHeader
              title="Recent entries"
              description="Filter and review logged time entries across clients, projects, and date ranges."
              action={
                <div className="flex flex-wrap items-center gap-2">
                  {hasActiveFilters ? <Badge variant="info" size="sm">Filtered</Badge> : null}
                  <Button variant="secondary" size="sm" onClick={() => void fetchTimeEntries()} disabled={loading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              }
            />

            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Select
                  label="Client"
                  value={selectedClientId}
                  onChange={(e) => {
                    setSelectedClientId(e.target.value);
                    setSelectedProjectId("");
                  }}
                >
                  <option value="">All clients</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                      {client.company ? ` (${client.company})` : ""}
                    </option>
                  ))}
                </Select>

                <Select
                  label="Project"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                >
                  <option value="">All projects</option>
                  {filteredProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>

                <Input
                  label="Start date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />

                <Input
                  label="End date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <Filter className="h-4 w-4" />
                  <span>Showing {visibleEntries.length} of {timeEntries.length} entries</span>
                  <span className="hidden sm:inline text-slate-400">•</span>
                  <span className="inline-flex items-center gap-1"><CalendarDays className="h-4 w-4" /> Context date {selectedDate.toString()}</span>
                </div>

                {hasActiveFilters ? (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <TimerReset className="mr-2 h-4 w-4" />
                    Clear filters
                  </Button>
                ) : null}
              </div>

              {loading ? (
                <PageLoading title="Refreshing entries" message="Updating your recent time log for the selected filters." />
              ) : error ? (
                <PageError title="Couldn’t load time entries" message={error} retry={() => void fetchTimeEntries()} />
              ) : timeEntries.length === 0 ? (
                <EmptySurfaceState
                  title="No time entries found"
                  description="Try adjusting the filters, changing the date range, or create a new time entry."
                  action={
                    <Link
                      href="/time/new"
                      className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create time entry
                    </Link>
                  }
                />
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10">
                      <thead className="bg-slate-50 dark:bg-slate-900/80">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Time</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Client</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Project</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Description</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Duration</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white dark:divide-white/10 dark:bg-slate-950/20">
                        {visibleEntries.map((entry) => (
                          <TimeEntryRow key={entry.id} entry={entry} onDelete={handleDelete} />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {hasMore ? (
                    <div className="border-t border-slate-200 px-6 py-4 text-center dark:border-white/10">
                      <Button variant="secondary" onClick={loadMore}>
                        Load more ({timeEntries.length - displayCount} remaining)
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </Surface>
          )}
        </Section>

        <APIFooter
        enableApiKeys
        enableCodeGen
        onGenerateApiKey={() => window.location.href = '/api-demo'}
        onGenerateCode={handleGenerateCode}
        endpoints={[
          {
            method: "GET",
            path: "/time",
            description: "List all time entries with optional filters",
            queryParams: [
              {
                name: "projectId",
                type: "number",
                description: "Filter by project ID",
              },
              {
                name: "clientId",
                type: "number",
                description: "Filter by client ID",
              },
              {
                name: "startDate",
                type: "string",
                description: "Filter entries starting from date (YYYY-MM-DD)",
              },
              {
                name: "endDate",
                type: "string",
                description: "Filter entries up to date (YYYY-MM-DD)",
              },
              {
                name: "billable",
                type: "boolean",
                description: "Filter by billable status",
              },
            ],
          },
          {
            method: "POST",
            path: "/time",
            description: "Create a new time entry",
            body: JSON.stringify(
              {
                projectId: 1,
                description: "Work description",
                startTime: "2025-11-04T09:00:00Z",
                endTime: "2025-11-04T11:30:00Z",
                billable: true,
              },
              null,
              2
            ),
          },
          {
            method: "GET",
            path: "/time/{id}",
            description: "Get a specific time entry",
          },
          {
            method: "PUT",
            path: "/time/{id}",
            description: "Update a time entry",
            body: JSON.stringify(
              {
                description: "Updated description",
                billable: false,
              },
              null,
              2
            ),
          },
          {
            method: "DELETE",
            path: "/time/{id}",
            description: "Delete a time entry",
          },
        ]}
      />
      </PageContent>
    </Page>
  );
}
