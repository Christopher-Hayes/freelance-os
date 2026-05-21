"use client";

import { useState } from "react";
import { useJobs } from "./JobsProvider";
import { getJobStatusColor } from "@/lib/job-utils";

export default function JobsIndicator() {
  const { activeJobs } = useJobs();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [numCompletedToShow, setNumCompletedToShow] = useState(5);

  if (activeJobs.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
      >
        {/* Animated spinner icon */}
        <svg
          className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>

        {/* Badge */}
        <span className="flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-bold text-white bg-blue-600 rounded-full">
          {activeJobs.length}
        </span>

        <span className="hidden sm:inline">
          {activeJobs.length === 1 ? "1 job" : `${activeJobs.length} jobs`}
        </span>
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowDropdown(false)}
          />

          {/* Dropdown content */}
          <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-40">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Active Background Jobs
              </h3>

              <div className="space-y-3">
                {activeJobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                  >
                    {/* Job header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {job.displayTitle}
                        </h4>
                        {job.displayDescription && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                            {job.displayDescription}
                          </p>
                        )}
                      </div>
                      <span
                        className={`ml-2 px-2 py-0.5 text-xs font-medium rounded shrink-0 ${getJobStatusColor(
                          job.status
                        )}`}
                      >
                        {job.status}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          Progress
                        </span>
                        <span className="text-xs font-medium text-gray-900 dark:text-white">
                          {job.progress}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div
                          className="bg-blue-600 dark:bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                      Started {new Date(job.startedAt || job.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>

              {showCompleted && (
                <>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mt-6 mb-3">
                    Completed Jobs
                  </h3>
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {activeJobs
                      .filter((job) => job.status === "completed")
                      .sort((a, b) => {
                        const aTime = new Date(a.completedAt || a.startedAt || a.createdAt).getTime();
                        const bTime = new Date(b.completedAt || b.startedAt || b.createdAt).getTime();
                        return bTime - aTime; // Most recent first
                      })
                      .slice(0, numCompletedToShow)
                      .map((job) => (
                        <div
                          key={job.id}
                          className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {job.displayTitle}
                              </h4>
                              {job.displayDescription && (
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                                  {job.displayDescription}
                                </p>
                              )}
                            </div>
                            <span
                              className={`ml-2 px-2 py-0.5 text-xs font-medium rounded shrink-0 ${getJobStatusColor(
                                job.status
                              )}`}
                            >
                              {job.status}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                            Completed at {new Date(job.completedAt || job.startedAt || job.createdAt).toLocaleTimeString()}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                  {activeJobs.filter((job) => job.status === "completed").length > numCompletedToShow && (
                    <button
                      onClick={() => setNumCompletedToShow(numCompletedToShow + 5)}
                      className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Show More
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 px-4 py-3">
              <button
                onClick={() => setShowCompleted(true)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Show Completed Jobs
              </button>
              <button
                onClick={() => setShowDropdown(false)}
                className="text-xs text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 px-3 py-1 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
