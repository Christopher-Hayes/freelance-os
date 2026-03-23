"use client";

import { useState, useCallback } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import { toast } from "@repo/ui";
import { useJobs } from "@/components/JobsProvider";
import { authFetch } from "@/lib/util";
import { importRescueTimeData, deleteActivitySessionsForDate } from "@/lib/activity-actions";
import { importRescueTimeProjectTimes, mergeRescueTimeProjectEntries } from "@/lib/time-actions";
import { type TimeEntry, formatDateStr } from "../utils";

interface UseColumnActionsReturn {
  // Activity column
  importingRescueTime: boolean;
  mergingRescueTimeActivity: boolean;
  handleImportFromRescueTime: () => Promise<void>;
  handleMergeRescueTimeActivity: () => Promise<void>;
  handleDeleteDayActivity: () => Promise<void>;
  // Project column
  loadingAutofill: boolean;
  importingRescueTimeProjects: boolean;
  mergingRescueTimeProjects: boolean;
  handleAutofill: () => Promise<void>;
  handleImportProjectTimesFromRescueTime: () => Promise<void>;
  handleMergeRescueTimeProjects: () => Promise<void>;
  handleClearDayEntries: () => Promise<void>;
}

export function useColumnActions(
  selectedDate: Temporal.PlainDate,
  sessions: readonly { id: number }[],
  timeEntries: TimeEntry[],
  fetchDayData: () => Promise<void>,
  setEditingEntryId: React.Dispatch<React.SetStateAction<number | null>>
): UseColumnActionsReturn {
  const { createJob } = useJobs();

  // ── Loading state ──────────────────────────────────────────────────

  const [importingRescueTime, setImportingRescueTime] = useState(false);
  const [mergingRescueTimeActivity, setMergingRescueTimeActivity] = useState(false);
  const [loadingAutofill, setLoadingAutofill] = useState(false);
  const [importingRescueTimeProjects, setImportingRescueTimeProjects] = useState(false);
  const [mergingRescueTimeProjects, setMergingRescueTimeProjects] = useState(false);

  // ── Activity column actions ────────────────────────────────────────

  const handleImportFromRescueTime = useCallback(async () => {
    setImportingRescueTime(true);
    try {
      const dateStr = formatDateStr(selectedDate);
      const data = await importRescueTimeData(dateStr);
      if (data.sessionsImported > 0) {
        toast.success(`Imported ${data.sessionsImported} activity sessions from RescueTime!`);
        await fetchDayData();
      } else {
        toast.info(data.message || "No data imported");
      }
    } catch (error: any) {
      console.error("Error importing from RescueTime:", error);
      toast.error(error.message || "Failed to import from RescueTime");
    } finally {
      setImportingRescueTime(false);
    }
  }, [selectedDate, fetchDayData]);

  const handleMergeRescueTimeActivity = useCallback(async () => {
    setMergingRescueTimeActivity(true);
    try {
      const dateStr = formatDateStr(selectedDate);
      await createJob("merge_rescuetime_activity", { date: dateStr });
      toast.info("Merge RescueTime activity job started! You'll be notified when it completes.");
    } catch (error: any) {
      console.error("Error starting merge RescueTime activity job:", error);
      toast.error(error.message || "Failed to start merge job");
    } finally {
      setMergingRescueTimeActivity(false);
    }
  }, [selectedDate, createJob]);

  const handleDeleteDayActivity = useCallback(async () => {
    if (sessions.length === 0) {
      toast.info("No app activity to delete for this day");
      return;
    }
    try {
      const dateStr = formatDateStr(selectedDate);
      const data = await deleteActivitySessionsForDate(dateStr);
      toast.success(data.message);
      await fetchDayData();
    } catch (error: any) {
      console.error("Error deleting day activity:", error);
      toast.error(error.message || "Failed to delete app activity");
    }
  }, [sessions.length, selectedDate, fetchDayData]);

  // ── Project column actions ─────────────────────────────────────────

  const handleAutofill = useCallback(async () => {
    setLoadingAutofill(true);
    try {
      const dateStr = formatDateStr(selectedDate);
      await createJob("autofill_time_entries", { date: dateStr });
      toast.info("Autofill job started! You'll be notified when it completes.");
    } catch (error: any) {
      console.error("Error starting autofill:", error);
      toast.error(error.message || "Failed to start autofill job");
    } finally {
      setLoadingAutofill(false);
    }
  }, [selectedDate, createJob]);

  const handleImportProjectTimesFromRescueTime = useCallback(async () => {
    setImportingRescueTimeProjects(true);
    try {
      const dateStr = formatDateStr(selectedDate);
      const data = await importRescueTimeProjectTimes(dateStr);

      if (data.status === "no_archive_data") {
        toast.error(
          "No RescueTime archive data for this date. Upload your Project History archive in Settings → RescueTime Integration.",
          { duration: 8000 }
        );
        return;
      }

      if (data.entriesImported > 0) {
        toast.success(data.message);
        await fetchDayData();
        if (data.unmatchedProjects && data.unmatchedProjects.length > 0) {
          setTimeout(() => {
            toast.warning(
              `Skipped RescueTime projects with no local match: ${data.unmatchedProjects.join(", ")}`,
              { duration: 10000 }
            );
          }, 500);
        }
      } else {
        toast.info(data.message || "No project times imported");
      }
    } catch (error: any) {
      console.error("Error importing project times from RescueTime:", error);
      toast.error(error.message || "Failed to import project times from RescueTime");
    } finally {
      setImportingRescueTimeProjects(false);
    }
  }, [selectedDate, fetchDayData]);

  const handleMergeRescueTimeProjects = useCallback(async () => {
    setMergingRescueTimeProjects(true);
    try {
      const dateStr = formatDateStr(selectedDate);
      const data = await mergeRescueTimeProjectEntries(dateStr);

      if (data.status === "no_archive_data") {
        toast.error(
          "No RescueTime archive data for this date. Upload your Project History archive in Settings → RescueTime Integration.",
          { duration: 8000 }
        );
        return;
      }

      if (data.entriesMerged > 0) {
        toast.success(data.message);
        await fetchDayData();
        if (data.unmatchedProjects && data.unmatchedProjects.length > 0) {
          setTimeout(() => {
            toast.warning(
              `Skipped RescueTime projects with no local match: ${data.unmatchedProjects.join(", ")}`,
              { duration: 10000 }
            );
          }, 500);
        }
      } else {
        toast.info(data.message || "Nothing to merge");
      }
    } catch (error: any) {
      console.error("Error merging RescueTime project entries:", error);
      toast.error(error.message || "Failed to merge RescueTime project entries");
    } finally {
      setMergingRescueTimeProjects(false);
    }
  }, [selectedDate, fetchDayData]);

  const handleClearDayEntries = useCallback(async () => {
    const entriesToDelete = timeEntries.filter((entry) => entry.id !== -1);
    if (entriesToDelete.length === 0) {
      toast.info("No project entries to clear for this day");
      return;
    }
    try {
      const results = await Promise.allSettled(
        entriesToDelete.map((entry) =>
          authFetch(`/api/time/${entry.id}`, { method: "DELETE" }).then((response) => {
            if (!response.ok) throw new Error(`Failed to delete entry ${entry.id}`);
          })
        )
      );
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length > 0) {
        throw new Error(
          `Failed to clear ${failures.length} entr${failures.length === 1 ? "y" : "ies"}`
        );
      }
      await fetchDayData();
      setEditingEntryId(null);
      toast.success(
        `Cleared ${entriesToDelete.length} project ${entriesToDelete.length === 1 ? "entry" : "entries"}`
      );
    } catch (error) {
      console.error("Error clearing day entries:", error);
      toast.error("Failed to clear today's project entries");
    }
  }, [timeEntries, fetchDayData, setEditingEntryId]);

  return {
    importingRescueTime,
    mergingRescueTimeActivity,
    handleImportFromRescueTime,
    handleMergeRescueTimeActivity,
    handleDeleteDayActivity,
    loadingAutofill,
    importingRescueTimeProjects,
    mergingRescueTimeProjects,
    handleAutofill,
    handleImportProjectTimesFromRescueTime,
    handleMergeRescueTimeProjects,
    handleClearDayEntries,
  };
}
