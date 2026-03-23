"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Temporal } from "@/lib/temporal-polyfill";
import { syncAppDataToLocalStorage, authFetch } from "@/lib/util";
import type { AiJobWithDisplay } from "@freelance-os/types";
import { type ActivitySession, type TimeEntry, type Project, formatDateStr } from "../utils";

interface UseDayTimelineDataReturn {
  sessions: ActivitySession[];
  timeEntries: TimeEntry[];
  projects: Project[];
  loading: boolean;
  timeAgo: string;
  isClient: boolean;
  currentTime: Temporal.ZonedDateTime;
  fetchDayData: () => Promise<void>;
  setTimeEntries: React.Dispatch<React.SetStateAction<TimeEntry[]>>;
}

export function useDayTimelineData(
  selectedDate: Temporal.PlainDate,
  jobs: AiJobWithDisplay[]
): UseDayTimelineDataReturn {
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(Date.now());
  const [timeAgo, setTimeAgo] = useState<string>("");
  const [isClient, setIsClient] = useState(false);
  const [currentTime, setCurrentTime] = useState<Temporal.ZonedDateTime>(() =>
    Temporal.Now.zonedDateTimeISO()
  );

  const completedJobIdsRef = useRef<Set<number>>(new Set());

  // ── Data fetching ──────────────────────────────────────────────────────

  const fetchProjects = useCallback(async () => {
    try {
      const response = await authFetch("/api/projects");
      const data = await response.json();
      setProjects(data);
    } catch (error) {
      console.error("Error fetching projects:", error);
    }
  }, []);

  const fetchDayData = useCallback(async () => {
    setLoading(true);
    const dateStr = formatDateStr(selectedDate);
    try {
      const [sessionsRes, entriesRes] = await Promise.all([
        authFetch(`/api/activity-sessions?date=${dateStr}`),
        authFetch(`/api/time?startDate=${dateStr}&endDate=${dateStr}`),
      ]);
      const sessionsData = await sessionsRes.json();
      const entriesData = await entriesRes.json();
      setSessions(sessionsData.sessions || []);
      setTimeEntries(entriesData.timeEntries || []);
      setLastRefreshTime(Date.now());
    } catch (error) {
      console.error("Error fetching day data:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // ── Effects ────────────────────────────────────────────────────────────

  // Client-side hydration flag
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch projects once on mount
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Fetch day data when date changes
  useEffect(() => {
    syncAppDataToLocalStorage();
    fetchDayData();
  }, [fetchDayData]);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Temporal.Now.zonedDateTimeISO());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Update "time ago" display every 30 seconds
  useEffect(() => {
    const updateTimeAgo = () => {
      const secondsAgo = Math.floor((Date.now() - lastRefreshTime) / 1000);
      if (secondsAgo < 60) {
        setTimeAgo("just now");
      } else if (secondsAgo < 3600) {
        setTimeAgo(`${Math.floor(secondsAgo / 60)}m ago`);
      } else {
        setTimeAgo(`${Math.floor(secondsAgo / 3600)}h ago`);
      }
    };
    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 30000);
    return () => clearInterval(interval);
  }, [lastRefreshTime]);

  // Refresh day data when autofill jobs complete
  useEffect(() => {
    const dateStr = formatDateStr(selectedDate);
    const completedJobs = jobs.filter(
      (job) =>
        job.type === "autofill_time_entries" &&
        job.status === "completed" &&
        job.parameters?.date === dateStr
    );
    const newlyCompletedJobs = completedJobs.filter(
      (job) => !completedJobIdsRef.current.has(job.id)
    );
    if (newlyCompletedJobs.length > 0) {
      newlyCompletedJobs.forEach((job) => completedJobIdsRef.current.add(job.id));
      fetchDayData();
    }
  }, [jobs, selectedDate, fetchDayData]);

  // Auto-refresh when returning to tab after 5+ minutes (today only)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const isToday =
          Temporal.PlainDate.compare(selectedDate, Temporal.Now.plainDateISO()) === 0;
        if (!isToday) return;
        const timeSinceLastRefresh = Date.now() - lastRefreshTime;
        if (timeSinceLastRefresh >= 5 * 60 * 1000) {
          console.log(
            "Auto-refreshing activity data after being away for",
            Math.round(timeSinceLastRefresh / 1000 / 60),
            "minutes"
          );
          fetchDayData();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [lastRefreshTime, selectedDate, fetchDayData]);

  return {
    sessions,
    timeEntries,
    projects,
    loading,
    timeAgo,
    isClient,
    currentTime,
    fetchDayData,
    setTimeEntries,
  };
}
