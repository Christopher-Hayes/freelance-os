"use client";

import { Temporal } from "@/lib/temporal-polyfill";
import { useState } from "react";
import { generateTimeEntryDescription } from "@/lib/ai-actions";
import { toast } from "@repo/ui";

interface Project {
  id: number;
  name: string;
  color: string;
  billable: boolean;
  client: {
    name: string;
  };
}

interface TimeEntryCreationDialogProps {
  startTime: Temporal.ZonedDateTime;
  endTime: Temporal.ZonedDateTime;
  y: number;
  projects: Project[];
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}

export default function TimeEntryCreationDialog({
  startTime,
  endTime,
  y,
  projects,
  onSubmit,
  onCancel,
}: TimeEntryCreationDialogProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [loadingAutofill, setLoadingAutofill] = useState(false);

  const formatTime = (time: Temporal.ZonedDateTime): string => {
    return time.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const durationInMinutes = (start: Temporal.ZonedDateTime, end: Temporal.ZonedDateTime): number => {
    return Math.round(Number((end.epochNanoseconds - start.epochNanoseconds) / 60_000_000_000n));
  };

  // Get the selected project to check if it tracks billable
  const selectedProject = projects.find((p) => p.id === parseInt(selectedProjectId));
  const showBillableToggle = selectedProject?.billable ?? true;

  const handleAutofill = async () => {
    if (!selectedProjectId) {
      toast.error("Please select a project first");
      return;
    }

    setLoadingAutofill(true);
    try {
      const generatedDescription = await generateTimeEntryDescription({
        projectId: parseInt(selectedProjectId),
        startTime: startTime.toInstant().toString(),
        endTime: endTime.toInstant().toString(),
      });
      setDescription(generatedDescription);
    } catch (error) {
      console.error("Error generating description:", error);
      toast.error("Failed to generate description");
    } finally {
      setLoadingAutofill(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onCancel}
      />
      
      {/* Dialog */}
      <div 
        className="fixed inset-0 z-50 flex items-start justify-center pointer-events-none" 
        style={{ paddingTop: `${y}px` }}
      >
        <div className="bg-white dark:bg-gray-800 border-2 border-green-500 rounded-lg shadow-2xl p-4 w-[400px] pointer-events-auto">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Create Time Entry
          </h3>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Project
              </label>
              <select
                name="projectId"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                required
                autoFocus
              >
                <option value="">Select a project...</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.client.name} - {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Description
                </label>
                <button
                  type="button"
                  onClick={handleAutofill}
                  disabled={loadingAutofill || !selectedProjectId}
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!selectedProjectId ? "Select a project first" : "Use AI to generate description based on activity"}
                >
                  <svg
                    className={`w-3 h-3 ${loadingAutofill ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {loadingAutofill ? (
                      <>
                        <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </>
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    )}
                  </svg>
                  {loadingAutofill ? "Generating..." : "Autofill"}
                </button>
              </div>
              <textarea
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What did you work on?"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {showBillableToggle && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="billable"
                  id="new-billable"
                  defaultChecked={true}
                />
                <label htmlFor="new-billable" className="text-sm text-gray-700 dark:text-gray-300">
                  Billable
                </label>
              </div>
            )}

            <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-gray-600 dark:text-gray-400">Start:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatTime(startTime)}
                </span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-gray-600 dark:text-gray-400">End:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatTime(endTime)}
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1 mt-1">
                <span className="text-gray-600 dark:text-gray-400">Duration:</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {durationInMinutes(startTime, endTime)} minutes
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
              >
                Create Entry
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-100 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
