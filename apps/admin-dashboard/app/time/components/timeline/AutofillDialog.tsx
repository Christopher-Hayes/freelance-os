"use client";

import { useState } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import { toast } from "@repo/ui";

interface TimeEntrySuggestion {
  projectId: number;
  description: string;
  startTime: string;
  endTime: string;
  billable: boolean;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

interface AutofillDialogProps {
  suggestions: TimeEntrySuggestion[];
  projects: Array<{ id: number; name: string; color: string; client: { name: string } }>;
  onApply: (suggestions: TimeEntrySuggestion[]) => Promise<void>;
  onCancel: () => void;
  activityCount?: number;
  mergedCount?: number;
}

export default function AutofillDialog({
  suggestions,
  projects,
  onApply,
  onCancel,
  activityCount,
  mergedCount,
}: AutofillDialogProps) {
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(
    new Set(suggestions.map((_, i) => i))
  );
  const [applying, setApplying] = useState(false);

  const toggleSuggestion = (index: number) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedSuggestions.size === suggestions.length) {
      setSelectedSuggestions(new Set());
    } else {
      setSelectedSuggestions(new Set(suggestions.map((_, i) => i)));
    }
  };

  const handleApply = async () => {
    const selected = suggestions.filter((_, i) => selectedSuggestions.has(i));
    if (selected.length === 0) {
      toast.warning("Please select at least one suggestion to apply");
      return;
    }

    setApplying(true);
    try {
      await onApply(selected);
    } finally {
      setApplying(false);
    }
  };

  const getProjectById = (id: number) => {
    return projects.find((p) => p.id === id);
  };

  const formatTime = (isoString: string) => {
    try {
      const instant = Temporal.Instant.from(isoString);
      const zoned = instant.toZonedDateTimeISO(Temporal.Now.timeZoneId());
      return zoned.toPlainTime().toString().substring(0, 5);
    } catch {
      return isoString;
    }
  };

  const calculateDuration = (start: string, end: string) => {
    try {
      const startInstant = Temporal.Instant.from(start);
      const endInstant = Temporal.Instant.from(end);
      const durationNs = endInstant.epochNanoseconds - startInstant.epochNanoseconds;
      const minutes = Math.round(Number(durationNs) / 60_000_000_000);
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    } catch {
      return "?";
    }
  };

  const confidenceColors = {
    high: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    low: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                AI-Generated Time Entry Suggestions
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Review and select suggestions to add to your timeline
                {activityCount && mergedCount && (
                  <span className="ml-2">
                    (Analyzed {activityCount} activities, merged to {mergedCount} sessions)
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {suggestions.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-lg font-medium mb-2">No Suggestions Generated</p>
              <p className="text-sm">The AI couldn't find any activities that clearly match your projects.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Select All Toggle */}
              <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSuggestions.size === suggestions.length}
                    onChange={toggleAll}
                    className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Select All ({suggestions.length} suggestions)
                  </span>
                </label>
              </div>

              {/* Suggestions List */}
              {suggestions.map((suggestion, index) => {
                const project = getProjectById(suggestion.projectId);
                const isSelected = selectedSuggestions.has(index);

                return (
                  <div
                    key={index}
                    className={`border rounded-lg p-4 transition-all cursor-pointer ${
                      isSelected
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                    onClick={() => toggleSuggestion(index)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSuggestion(index)}
                        className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        {/* Project & Time */}
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: project?.color || "#9CA3AF" }}
                          />
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {project?.name || `Unknown Project (ID: ${suggestion.projectId})`}
                          </span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            • {formatTime(suggestion.startTime)} - {formatTime(suggestion.endTime)}
                          </span>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            ({calculateDuration(suggestion.startTime, suggestion.endTime)})
                          </span>
                          {suggestion.billable && (
                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded">
                              Billable
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        {suggestion.description && (
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                            {suggestion.description}
                          </p>
                        )}

                        {/* Reasoning & Confidence */}
                        <div className="flex items-start gap-2 text-xs">
                          <span className={`px-2 py-1 rounded font-medium ${confidenceColors[suggestion.confidence]}`}>
                            {suggestion.confidence} confidence
                          </span>
                          <span className="text-gray-600 dark:text-gray-400 flex-1">
                            {suggestion.reasoning}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {selectedSuggestions.size} of {suggestions.length} selected
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={selectedSuggestions.size === 0 || applying}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {applying ? "Applying..." : `Apply ${selectedSuggestions.size} Entries`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
