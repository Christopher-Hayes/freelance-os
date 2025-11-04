"use client";

import { Temporal } from "@/lib/temporal-polyfill";
import { useState } from "react";

interface Project {
  id: number;
  name: string;
  color: string;
  billable: boolean;
  client: {
    name: string;
  };
}

interface TimeEntryEditFormProps {
  entryId: number;
  projectId: number;
  description: string | null;
  billable: boolean;
  startTime: Temporal.ZonedDateTime;
  endTime: Temporal.ZonedDateTime;
  projects: Project[];
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onDelete: () => void;
}

export default function TimeEntryEditForm({
  entryId,
  projectId,
  description,
  billable,
  startTime,
  endTime,
  projects,
  onSubmit,
  onCancel,
  onDelete,
}: TimeEntryEditFormProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<number>(projectId);

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
  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const showBillableToggle = selectedProject?.billable ?? true;

  return (
    <div className="absolute z-20 top-0 left-0 right-0 bg-white dark:bg-gray-800 border-2 border-blue-500 rounded shadow-2xl p-3 max-w-full w-[340px]" style={{ minHeight: '200px' }}>
      <form onSubmit={onSubmit} className="space-y-2">
        <div>
          <header className="flex justify-between gap-2 text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            <label id="project-label">
              Project
            </label>

            {showBillableToggle && (
              <div className="flex gap-2 items-center">
                <label htmlFor={`billable-${entryId}`} className="text-xs text-gray-700 dark:text-gray-300">
                  Billable
                </label>
                <input
                  type="checkbox"
                  name="billable"
                  id={`billable-${entryId}`}
                  defaultChecked={billable}
                />
              </div>
            )}
          </header>
          <select
            name="projectId"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(parseInt(e.target.value))}
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.client.name} - {project.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <textarea
            name="description"
            defaultValue={description || ''}
            rows={2}
            className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-2">
          <span>
            {formatTime(startTime)}
            {" - "}
            {formatTime(endTime)}
          </span>
          <span>
            ({durationInMinutes(startTime, endTime)} min)
          </span>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <div className="grow flex gap-2 flex-wrap">
            <button
              type="submit"
              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              className="px-3 py-1 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-100 text-xs rounded hover:bg-gray-300 dark:hover:bg-gray-500"
            >
              Cancel
            </button>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </form>
    </div>
  );
}
