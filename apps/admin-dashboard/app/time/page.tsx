"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DayTimeline from "./components/DayTimeline";
import QuickEntryModal from "./components/QuickEntryModal";

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
}

export default function TimeEntriesPage() {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Day view state
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start at midnight local time
    return today;
  });
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [quickModalTimes, setQuickModalTimes] = useState<{
    start: Date;
    end: Date;
  } | null>(null);

  // Filters
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Fetch clients and projects for filters
  useEffect(() => {
    Promise.all([
      fetch("/api/clients").then((res) => res.json()),
      fetch("/api/projects").then((res) => res.json()),
    ])
      .then(([clientsData, projectsData]) => {
        setClients(clientsData);
        setProjects(projectsData);
      })
      .catch((err) => {
        console.error("Error fetching filter data:", err);
      });
  }, []);

  // Fetch time entries based on filters
  useEffect(() => {
    fetchTimeEntries();
  }, [selectedClientId, selectedProjectId, startDate, endDate]);

  const fetchTimeEntries = async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (selectedClientId) params.append("clientId", selectedClientId);
      if (selectedProjectId) params.append("projectId", selectedProjectId);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const response = await fetch(`/api/time?${params}`);
      if (!response.ok) throw new Error("Failed to fetch time entries");

      const data = await response.json();
      setTimeEntries(data.timeEntries);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this time entry?")) return;

    try {
      const response = await fetch(`/api/time/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete time entry");

      // Refresh list
      fetchTimeEntries();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete time entry");
    }
  };

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

  const filteredProjects = selectedClientId
    ? projects.filter((p) => p.clientId === parseInt(selectedClientId))
    : projects;

  // Handle creating entry from day timeline
  const handleCreateFromTimeline = (startTime: Date, endTime: Date) => {
    setQuickModalTimes({ start: startTime, end: endTime });
    setShowQuickModal(true);
  };

  // Handle saving from quick modal
  const handleQuickSave = async (data: {
    projectId: number;
    startTime: Date;
    endTime: Date;
    description: string;
    billable: boolean;
  }) => {
    const durationMinutes = Math.round(
      (data.endTime.getTime() - data.startTime.getTime()) / 1000 / 60
    );

    const response = await fetch("/api/time", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: data.projectId,
        startTime: data.startTime.toISOString(),
        endTime: data.endTime.toISOString(),
        durationMinutes,
        description: data.description,
        billable: data.billable,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to create time entry");
    }

    // Refresh data
    fetchTimeEntries();
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Time Tracking</h1>
          <Link
            href="/time/new"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + New Time Entry
          </Link>
        </div>

        {/* Day Timeline View */}
        <div className="mb-6">
          <DayTimeline
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onCreateEntry={handleCreateFromTimeline}
          />
        </div>

        {/* Quick Entry Modal */}
        {showQuickModal && quickModalTimes && (
          <QuickEntryModal
            isOpen={showQuickModal}
            onClose={() => setShowQuickModal(false)}
            onSave={handleQuickSave}
            initialStartTime={quickModalTimes.start}
            initialEndTime={quickModalTimes.end}
          />
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Hours</div>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {summary.totalHours.toFixed(2)}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Entries</div>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                {summary.count}
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Minutes</div>
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                {summary.totalMinutes}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Client
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => {
                  setSelectedClientId(e.target.value);
                  setSelectedProjectId(""); // Reset project filter
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                    {client.company ? ` (${client.company})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Project
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Projects</option>
                {filteredProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {(selectedClientId || selectedProjectId || startDate || endDate) && (
            <button
              onClick={() => {
                setSelectedClientId("");
                setSelectedProjectId("");
                setStartDate("");
                setEndDate("");
              }}
              className="mt-4 text-sm text-blue-600 hover:text-blue-800"
            >
              Clear all filters
            </button>
          )}
        </div>

        {/* Time Entries List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Loading time entries...
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-600 dark:text-red-400">{error}</div>
          ) : timeEntries.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No time entries found. Create your first one!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Project
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Billable
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {timeEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {formatDate(entry.startTime)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {formatTime(entry.startTime)} -{" "}
                        {formatTime(entry.endTime)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {entry.project.client.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {entry.project.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {entry.description || (
                          <span className="italic text-gray-400 dark:text-gray-500">
                            No description
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formatDuration(entry.durationMinutes)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            entry.billable
                              ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300"
                          }`}
                        >
                          {entry.billable ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Link
                          href={`/time/${entry.id}`}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mr-3"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
