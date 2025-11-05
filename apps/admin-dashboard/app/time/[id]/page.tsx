"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authFetch } from '@/lib/util';

interface Client {
  id: number;
  name: string;
  company: string | null;
}

interface Project {
  id: number;
  name: string;
  clientId: number;
  status: string;
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
    clientId: number;
    client: {
      id: number;
      name: string;
    };
  };
}

export default function EditTimeEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [id, setId] = useState<string>("");
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form fields
  const [selectedClientId, setSelectedClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);

  // Unwrap params
  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  // Fetch time entry data
  useEffect(() => {
    if (!id) return;

    Promise.all([
      authFetch(`/api/time/${id}`).then((res) => res.json()),
      authFetch("/api/clients").then((res) => res.json()),
      authFetch("/api/projects").then((res) => res.json()),
    ])
      .then(([timeEntry, clientsData, projectsData]: [
        TimeEntry,
        Client[],
        Project[]
      ]) => {
        setClients(clientsData);
        setProjects(projectsData);

        // Populate form fields
        setProjectId(timeEntry.projectId.toString());
        setSelectedClientId(timeEntry.project.clientId.toString());

        const startDate = new Date(timeEntry.startTime);
        const endDate = new Date(timeEntry.endTime);

        const dateStr = startDate.toISOString().split("T")[0];
        setDate(dateStr || "");
        setStartTime(
          startDate.toTimeString().slice(0, 5) // HH:MM format
        );
        setEndTime(
          endDate.toTimeString().slice(0, 5) // HH:MM format
        );
        setDescription(timeEntry.description || "");
        setBillable(timeEntry.billable);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching data:", err);
        setError("Failed to load time entry");
        setLoading(false);
      });
  }, [id]);

  const filteredProjects = selectedClientId
    ? projects.filter((p) => p.clientId === parseInt(selectedClientId))
    : projects;

  const calculateDuration = (): number => {
    if (!startTime || !endTime) return 0;

    const [startHour = 0, startMin = 0] = startTime.split(":").map(Number);
    const [endHour = 0, endMin = 0] = endTime.split(":").map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    let duration = endMinutes - startMinutes;
    if (duration < 0) {
      duration += 24 * 60;
    }

    return duration;
  };

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (!projectId) {
        throw new Error("Please select a project");
      }

      const durationMinutes = calculateDuration();
      if (durationMinutes <= 0) {
        throw new Error("End time must be after start time");
      }

      const startDateTime = new Date(`${date}T${startTime}`).toISOString();
      const endDateTime = new Date(`${date}T${endTime}`).toISOString();

      const response = await authFetch(`/api/time/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: parseInt(projectId),
          startTime: startDateTime,
          endTime: endDateTime,
          durationMinutes,
          description,
          billable,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update time entry");
      }

      router.push("/time");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  const duration = calculateDuration();

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/time" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
            ← Back to Time Entries
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100">Edit Time Entry</h1>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          {/* Client Selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Client
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => {
                setSelectedClientId(e.target.value);
                setProjectId(""); // Reset project selection
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a client...</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                  {client.company ? ` (${client.company})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Project Selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project *
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a project...</option>
              {filteredProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.status})
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Date *
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Start Time *
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                End Time *
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Duration Display */}
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Duration:{" "}
              <span className="font-semibold text-blue-700 dark:text-blue-300">
                {formatDuration(duration)}
              </span>{" "}
              ({duration} minutes)
            </div>
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="What did you work on?"
            />
          </div>

          {/* Billable Checkbox */}
          <div className="mb-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={billable}
                onChange={(e) => setBillable(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                This time is billable
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <Link
              href="/time"
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-center"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
