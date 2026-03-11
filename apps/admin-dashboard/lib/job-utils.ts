import type { AiJob, AiJobWithDisplay } from "@freelance-os/types";

/**
 * Adds display information to an AI job for UI rendering
 */
export function enrichJobWithDisplay(job: AiJob): AiJobWithDisplay {
  let displayTitle = "";
  let displayDescription = "";

  switch (job.type) {
    case "autofill_time_entries": {
      const params = job.parameters as { date?: string } | undefined;
      const date = params?.date ? formatJobDate(params.date) : "Unknown date";
      displayTitle = `Autofill: ${date}`;
      
      if (job.status === "completed" && job.result) {
        const result = job.result as {
          entriesCreated?: number;
          entriesUpdated?: number;
          totalSuggestions?: number;
          activityCount?: number;
          message?: string;
        };
        if (result.message) {
          displayDescription = result.message;
        } else {
          const created = result.entriesCreated || 0;
          const updated = result.entriesUpdated || 0;
          const suggestions = result.totalSuggestions ?? created;
          const activities = result.activityCount ?? 0;
          const changes = [`created ${created}`];
          if (updated > 0) {
            changes.push(`updated ${updated}`);
          }
          displayDescription = `${changes.join(", ")} from ${suggestions} suggestions across ${activities} activities`;
        }
      } else if (job.status === "processing") {
        displayDescription = `Analyzing activities (${job.progress}%)`;
      } else if (job.status === "failed") {
        displayDescription = job.error || "Failed to process";
      } else if (job.status === "pending") {
        displayDescription = "Queued and waiting to start";
      }
      break;
    }
    default:
      displayTitle = `Unknown job type: ${job.type}`;
  }

  return {
    ...job,
    displayTitle,
    displayDescription,
  };
}

/**
 * Format date for job display.
 * dateString is "YYYY-MM-DD". We parse the parts manually so the Date
 * is constructed in local time — `new Date("2026-03-09")` is interpreted
 * as UTC midnight, which shifts back a day in US timezones.
 */
function formatJobDate(dateString: string): string {
  try {
    const parts = dateString.split("-").map(Number);
    const year = parts[0]!;
    const month = parts[1]!;
    const day = parts[2]!;
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

/**
 * Get status badge color classes
 */
export function getJobStatusColor(status: AiJob["status"]): string {
  switch (status) {
    case "pending":
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    case "processing":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "failed":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "cancelled":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
  }
}

/**
 * Check if a job is for a specific date
 */
export function isJobForDate(job: AiJob, date: string): boolean {
  if (job.type === "autofill_time_entries") {
    const params = job.parameters as { date?: string } | undefined;
    return params?.date === date;
  }
  return false;
}

/**
 * Check if there's an active job for a specific date
 */
export function hasActiveJobForDate(jobs: AiJob[], date: string): boolean {
  return jobs.some(
    (job) =>
      isJobForDate(job, date) &&
      (job.status === "pending" || job.status === "processing")
  );
}
