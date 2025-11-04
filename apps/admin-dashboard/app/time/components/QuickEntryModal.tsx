"use client";

import { useState, useEffect } from "react";

interface Project {
  id: number;
  name: string;
  clientId: number;
  billable: boolean;
  client: {
    name: string;
  };
}

interface QuickEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    projectId: number;
    startTime: Date;
    endTime: Date;
    description: string;
    billable: boolean;
  }) => Promise<void>;
  initialStartTime: Date;
  initialEndTime: Date;
}

export default function QuickEntryModal({
  isOpen,
  onClose,
  onSave,
  initialStartTime,
  initialEndTime,
}: QuickEntryModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Get the selected project to check if it tracks billable
  const selectedProject = projects.find((p) => p.id === parseInt(projectId));
  const showBillableToggle = selectedProject?.billable ?? true;

  useEffect(() => {
    if (isOpen) {
      // Fetch projects
      fetch("/api/projects")
        .then((res) => res.json())
        .then((data) => setProjects(data))
        .catch((err) => console.error("Error fetching projects:", err));
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (!projectId) {
        throw new Error("Please select a project");
      }

      await onSave({
        projectId: parseInt(projectId),
        startTime: initialStartTime,
        endTime: initialEndTime,
        description,
        billable,
      });

      // Reset form
      setProjectId("");
      setDescription("");
      setBillable(true);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const duration = Math.round(
    (initialEndTime.getTime() - initialStartTime.getTime()) / 1000 / 60
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Quick Time Entry</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded">
              {error}
            </div>
          )}

          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              <strong>Time:</strong> {formatTime(initialStartTime)} -{" "}
              {formatTime(initialEndTime)}
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300">
              <strong>Duration:</strong>{" "}
              {Math.floor(duration / 60)}h {duration % 60}m
            </div>
          </div>

          <form onSubmit={handleSubmit}>
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
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.client.name} - {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="What did you work on?"
              />
            </div>

            {showBillableToggle && (
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
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
