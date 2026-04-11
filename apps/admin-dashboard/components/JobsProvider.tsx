"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { toast } from "@repo/ui";
import type { AiJob, AiJobWithDisplay } from "@freelance-os/types";
import { enrichJobWithDisplay } from "@/lib/job-utils";

interface JobsContextType {
  jobs: AiJobWithDisplay[];
  activeJobs: AiJobWithDisplay[];
  isLoading: boolean;
  refreshJobs: () => Promise<void>;
  createJob: (type: AiJob["type"], parameters?: Record<string, any>) => Promise<AiJob>;
  cancelJob: (jobId: number) => Promise<void>;
}

const JobsContext = createContext<JobsContextType | undefined>(undefined);

const POLL_INTERVAL = 3000; // 3 seconds

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<AiJobWithDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Use refs for internal bookkeeping so they don't cause refreshJobs to
  // get a new reference on every call (which would trigger an infinite loop
  // via the useEffect that re-runs whenever refreshJobs changes).
  const completedJobIdsRef = useRef<Set<number>>(new Set());
  const isInitialLoadRef = useRef(true);

  const refreshJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs");
      if (!response.ok) throw new Error("Failed to fetch jobs");
      
      const rawJobs: AiJob[] = await response.json();
      const enrichedJobs = rawJobs.map(enrichJobWithDisplay);
      
      // Only show toasts after initial load (not on page refresh)
      if (!isInitialLoadRef.current) {
        // Check for newly completed jobs to show toasts
        enrichedJobs.forEach((job) => {
          if (
            job.status === "completed" &&
            !completedJobIdsRef.current.has(job.id)
          ) {
            completedJobIdsRef.current.add(job.id);
            const message = job.displayDescription
              ? `${job.displayTitle}: ${job.displayDescription}`
              : `${job.displayTitle} completed`;
            toast.success(message);
          } else if (
            job.status === "failed" &&
            !completedJobIdsRef.current.has(job.id)
          ) {
            completedJobIdsRef.current.add(job.id);
            const message = `${job.displayTitle} failed${job.error ? `: ${job.error}` : ""}`;
            toast.error(message);
          }
        });
      } else {
        // On initial load, just mark all completed/failed jobs as seen
        enrichedJobs.forEach((job) => {
          if (job.status === "completed" || job.status === "failed") {
            completedJobIdsRef.current.add(job.id);
          }
        });
        isInitialLoadRef.current = false;
      }
      
      setJobs(enrichedJobs);
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      setIsLoading(false);
    }
  }, []);

  const createJob = useCallback(
    async (type: AiJob["type"], parameters?: Record<string, any>) => {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, parameters }),
      });

      if (!response.ok) {
        throw new Error("Failed to create job");
      }

      const job: AiJob = await response.json();
      
      // Immediately refresh jobs to include the new one
      await refreshJobs();
      
      return job;
    },
    [refreshJobs]
  );

  const cancelJob = useCallback(
    async (jobId: number) => {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to cancel job");
      }

      await refreshJobs();
      toast.info("Job cancelled");
    },
    [refreshJobs]
  );

  // Initial fetch
  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  // Poll for active jobs
  useEffect(() => {
    const activeJobsExist = jobs.some(
      (job) => job.status === "pending" || job.status === "processing"
    );

    if (!activeJobsExist) return;

    const interval = setInterval(refreshJobs, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [jobs, refreshJobs]);

  const activeJobs = jobs.filter(
    (job) => job.status === "pending" || job.status === "processing"
  );

  return (
    <JobsContext.Provider
      value={{
        jobs,
        activeJobs,
        isLoading,
        refreshJobs,
        createJob,
        cancelJob,
      }}
    >
      {children}
    </JobsContext.Provider>
  );
}

export function useJobs() {
  const context = useContext(JobsContext);
  if (!context) {
    throw new Error("useJobs must be used within a JobsProvider");
  }
  return context;
}
