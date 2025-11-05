"use client";

import { useState, useEffect } from "react";
import WeeklyBreakdownChart from "./WeeklyBreakdownChart";
import ProjectDistributionChart from "./ProjectDistributionChart";
import { APIFooter } from "@repo/ui";

interface TimeEntry {
  id: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  description: string;
  billable: boolean;
  project: {
    id: number;
    name: string;
  };
}

interface Summary {
  totalHours: string;
  billableHours: string;
  nonBillableHours: string;
  count: number;
}

interface WeeklyData {
  week: string;
  weekStart: string;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  entriesCount: number;
}

interface ProjectData {
  projectId: number;
  projectName: string;
  totalHours: number;
  billableHours: number;
  entriesCount: number;
}

export function TimeTrackingContent() {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [projectData, setProjectData] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  useEffect(() => {
    fetchProjects();
    // Set default date range to current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setStartDate(firstDay.toISOString().split("T")[0] || "");
    setEndDate(lastDay.toISOString().split("T")[0] || "");
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      fetchTimeEntries();
      fetchSummary();
    }
  }, [selectedProjectId, startDate, endDate]);

  async function fetchProjects() {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
    }
  }

  async function fetchTimeEntries() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (selectedProjectId) params.append("projectId", selectedProjectId);

      const res = await fetch(`/api/time?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTimeEntries(data.timeEntries);
        setSummary(data.summary);
      }
    } catch (error) {
      console.error("Error fetching time entries:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSummary() {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const res = await fetch(`/api/time/summary?${params}`);
      if (res.ok) {
        const data = await res.json();
        setWeeklyData(data.weekly);
        setProjectData(data.byProject);
      }
    } catch (error) {
      console.error("Error fetching time summary:", error);
    }
  }

  function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Time Tracking
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          View all time entries logged for your projects
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Total Hours
            </div>
            <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              {summary.totalHours}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Billable Hours
            </div>
            <div className="mt-2 text-3xl font-bold text-green-600 dark:text-green-400">
              {summary.billableHours}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Non-Billable Hours
            </div>
            <div className="mt-2 text-3xl font-bold text-gray-600 dark:text-gray-400">
              {summary.nonBillableHours}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Time Entries
            </div>
            <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              {summary.count}
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Weekly Breakdown
          </h2>
          <WeeklyBreakdownChart data={weeklyData} />
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Hours by Project
          </h2>
          <ProjectDistributionChart data={projectData} />
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Filters
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Project
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Time Entries List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Time Entries
          </h2>
        </div>

        {loading ? (
          <div className="p-6 text-center text-gray-600 dark:text-gray-400">
            Loading...
          </div>
        ) : timeEntries.length === 0 ? (
          <div className="p-6 text-center text-gray-600 dark:text-gray-400">
            No time entries found for the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Billable
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {timeEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {formatDate(entry.startTime)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {entry.project.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {formatTime(entry.startTime)} -{" "}
                      {formatTime(entry.endTime)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                      {formatDuration(entry.durationMinutes)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {entry.description || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {entry.billable ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                          Billable
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300">
                          Non-billable
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

            <APIFooter
        enableApiKeys
        enableCodeGen
        onGenerateApiKey={() => window.location.href = '/settings?tab=api'}
        onGenerateCode={async (endpoint: any, language: string) => {
          const response = await fetch("/api/generate-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint, language }),
          });
          if (!response.ok) throw new Error("Failed to generate code");
          const data = await response.json();
          return data.code;
        }}
        endpoints={[
          {
            method: "GET",
            path: "/time",
            description: "List your time entries",
            queryParams: [
              {
                name: "projectId",
                type: "number",
                description: "Filter by project ID",
              },
              {
                name: "startDate",
                type: "string",
                description: "Filter entries from date (YYYY-MM-DD)",
              },
              {
                name: "endDate",
                type: "string",
                description: "Filter entries to date (YYYY-MM-DD)",
              },
              {
                name: "billable",
                type: "boolean",
                description: "Filter by billable status",
              },
            ],
          },
          {
            method: "GET",
            path: "/time/summary",
            description: "Get summary of time entries by week",
            queryParams: [
              {
                name: "startDate",
                type: "string",
                description: "Start date for summary (YYYY-MM-DD)",
              },
              {
                name: "endDate",
                type: "string",
                description: "End date for summary (YYYY-MM-DD)",
              },
            ],
          },
        ]}
      />
    </div>
  );
}
