"use client";

import { useState, useEffect, useRef } from "react";
import { Button, toast } from "@repo/ui";
import { authFetch } from "@/lib/util";
import { createProjectFromRescueTime } from "@/lib/ai-actions";
import { Upload, ChevronDown, ChevronUp, Sparkles, ExternalLink, Link2, Link2Off, X } from "lucide-react";

interface ArchiveStats {
  entryCount: number;
  projectCount: number;
  dateRange: { from: string; to: string } | null;
}

interface RtProject {
  id: number;
  rtProjectId: number;
  name: string;
  color: string | null;
  notes: string[];
  archivedAt: string | null;
  billable: boolean | null;
  rate: number | null;
  currency: string | null;
  rtClientId: number | null;
  rtClientName: string | null;
  totalSeconds: number;
  entryCount: number;
  firstDate: string | null;
  lastDate: string | null;
  linkedProject: { id: number; name: string } | null;
}

interface AppProject {
  id: number;
  name: string;
  client: { name: string };
}

export function RescueTimeArchiveUpload() {
  const [stats, setStats] = useState<ArchiveStats | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showProjects, setShowProjects] = useState(false);
  const [rtProjects, setRtProjects] = useState<RtProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  // Maps rtProjectId → "creating" | "done"
  const [projectCreationState, setProjectCreationState] = useState<
    Record<number, "creating" | "done">
  >({});
  // Maps rtProjectId → newly created project id (for the link)
  const [createdProjectIds, setCreatedProjectIds] = useState<
    Record<number, number>
  >({});

  // Link picker state: which RT project is having a link picker shown
  const [linkPickerForRtId, setLinkPickerForRtId] = useState<number | null>(null);
  const [appProjects, setAppProjects] = useState<AppProject[]>([]);
  const [loadingAppProjects, setLoadingAppProjects] = useState(false);
  const [linkSavingForRtId, setLinkSavingForRtId] = useState<number | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await authFetch("/api/rescuetime/archive");
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (error) {
      console.error("Error fetching archive stats:", error);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchRtProjects = async () => {
    setLoadingProjects(true);
    try {
      const res = await authFetch("/api/rescuetime/projects");
      if (res.ok) {
        const data: RtProject[] = await res.json();
        // Sort by total time descending
        setRtProjects(data.sort((a, b) => b.totalSeconds - a.totalSeconds));
      } else {
        toast.error("Failed to load RescueTime projects");
      }
    } catch (error) {
      console.error("Error fetching RT projects:", error);
      toast.error("Failed to load RescueTime projects");
    } finally {
      setLoadingProjects(false);
    }
  };

  const fetchAppProjects = async () => {
    if (appProjects.length > 0) return;
    setLoadingAppProjects(true);
    try {
      const res = await authFetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setAppProjects(data);
      }
    } catch (error) {
      console.error("Error fetching app projects:", error);
    } finally {
      setLoadingAppProjects(false);
    }
  };

  const handleToggleProjects = () => {
    if (!showProjects && rtProjects.length === 0) {
      fetchRtProjects();
    }
    setShowProjects((v) => !v);
  };

  const handleCreateProject = async (rtProject: RtProject) => {
    setProjectCreationState((prev) => ({
      ...prev,
      [rtProject.rtProjectId]: "creating",
    }));
    try {
      const result = await createProjectFromRescueTime(rtProject.rtProjectId);
      setProjectCreationState((prev) => ({
        ...prev,
        [rtProject.rtProjectId]: "done",
      }));
      setCreatedProjectIds((prev) => ({
        ...prev,
        [rtProject.rtProjectId]: result.projectId,
      }));
      // Mark this RT project as linked locally
      setRtProjects((prev) =>
        prev.map((p) =>
          p.rtProjectId === rtProject.rtProjectId
            ? { ...p, linkedProject: { id: result.projectId, name: result.projectName } }
            : p
        )
      );
      toast.success(
        `Created "${result.projectName}" for ${result.clientName}`
      );
    } catch (error: unknown) {
      console.error("Error creating project from RescueTime:", error);
      const message =
        error instanceof Error ? error.message : "Failed to create project";
      toast.error(message);
      setProjectCreationState((prev) => {
        const next = { ...prev };
        delete next[rtProject.rtProjectId];
        return next;
      });
    }
  };

  const openLinkPicker = async (rtProjectId: number) => {
    setLinkPickerForRtId(rtProjectId);
    fetchAppProjects();
  };

  const handleLinkProject = async (rtProjectId: number, appProjectId: number, appProjectName: string) => {
    setLinkSavingForRtId(rtProjectId);
    try {
      const res = await authFetch(`/api/rescuetime/projects/${rtProjectId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: appProjectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to link project");
      setRtProjects((prev) =>
        prev.map((p) =>
          p.rtProjectId === rtProjectId
            ? { ...p, linkedProject: { id: appProjectId, name: appProjectName } }
            : p
        )
      );
      setLinkPickerForRtId(null);
      toast.success(`Linked to "${appProjectName}"`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to link project";
      toast.error(message);
    } finally {
      setLinkSavingForRtId(null);
    }
  };

  const handleUnlinkProject = async (rtProjectId: number) => {
    setLinkSavingForRtId(rtProjectId);
    try {
      const res = await authFetch(`/api/rescuetime/projects/${rtProjectId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to unlink project");
      setRtProjects((prev) =>
        prev.map((p) =>
          p.rtProjectId === rtProjectId ? { ...p, linkedProject: null } : p
        )
      );
      toast.success("Unlinked");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to unlink project";
      toast.error(message);
    } finally {
      setLinkSavingForRtId(null);
    }
  };

  const formatHours = (seconds: number) => {
    const h = seconds / 3600;
    if (h < 1) return `${Math.round(seconds / 60)}m`;
    return `${h.toFixed(1)}h`;
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);

      if (!Array.isArray(json)) {
        toast.error("Invalid file: expected a JSON array");
        return;
      }

      const res = await authFetch("/api/rescuetime/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      const result = await res.json();
      toast.success(
        `Imported ${result.entriesImported} time entries across ${result.projectsUpserted} projects (${result.dateRange.from} to ${result.dateRange.to})`
      );
      await fetchStats();
    } catch (error: unknown) {
      console.error("Error uploading archive:", error);
      const message =
        error instanceof Error ? error.message : "Failed to upload archive";
      toast.error(message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Project Time Archive
        </label>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <svg className="animate-spin -ml-0.5 mr-1.5 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5 mr-1" />
                Upload Archive
              </>
            )}
          </Button>
        </div>
      </div>

      {loadingStats ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
      ) : stats && stats.entryCount > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900/40 dark:bg-green-950/20">
            <p className="text-sm text-green-700 dark:text-green-400">
              ✓ {stats.entryCount.toLocaleString()} time entries across {stats.projectCount} projects
              {stats.dateRange && (
                <span className="text-green-600 dark:text-green-500">
                  {" "}({stats.dateRange.from} to {stats.dateRange.to})
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={handleToggleProjects}
              className="ml-3 flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30"
            >
              {showProjects ? (
                <>Hide projects <ChevronUp className="h-3 w-3" /></>
              ) : (
                <>View RescueTime Projects ({stats.projectCount}) <ChevronDown className="h-3 w-3" /></>
              )}
            </button>
          </div>

          {showProjects && (
            <div className="rounded-xl border border-slate-200 dark:border-white/10">
              {loadingProjects ? (
                <div className="flex items-center justify-center px-4 py-6">
                  <svg className="animate-spin h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">Loading projects…</span>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-white/10">
                  {rtProjects.map((project) => {
                    const creationStatus = projectCreationState[project.rtProjectId];
                    const newProjectId = createdProjectIds[project.rtProjectId];
                    const isLinked = project.linkedProject !== null;
                    const isLinkPickerOpen = linkPickerForRtId === project.rtProjectId;
                    const isSavingLink = linkSavingForRtId === project.rtProjectId;

                    return (
                      <div key={project.rtProjectId}>
                        <div className="flex items-center gap-3 px-4 py-3">
                          {/* Color swatch */}
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: project.color ?? "#94a3b8" }}
                          />

                          {/* Project info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-sm font-medium text-slate-900 dark:text-white">
                                {project.name}
                              </span>
                              {project.billable && (
                                <span className="rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                  Billable
                                </span>
                              )}
                              {project.archivedAt && (
                                <span className="rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400">
                                  Archived
                                </span>
                              )}
                            </div>

                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {project.rtClientName && <span>{project.rtClientName}</span>}
                              <span>{formatHours(project.totalSeconds)}</span>
                              {project.firstDate && project.lastDate && (
                                <span>{project.firstDate} – {project.lastDate}</span>
                              )}
                              {project.rate != null && (
                                <span>{project.rate} {project.currency ?? ""}/hr</span>
                              )}
                            </div>

                            {project.notes.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {project.notes.slice(0, 6).map((note) => (
                                  <span
                                    key={note}
                                    className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-white/5 dark:text-slate-400"
                                  >
                                    {note}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="shrink-0">
                            {isLinked ? (
                              /* Already linked — show linked indicator + unlink */
                              <div className="flex items-center gap-2">
                                <a
                                  href={`/projects/${project.linkedProject!.id}`}
                                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  <Link2 className="h-3 w-3" />
                                  {project.linkedProject!.name}
                                </a>
                                <button
                                  type="button"
                                  disabled={isSavingLink}
                                  onClick={() => handleUnlinkProject(project.rtProjectId)}
                                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-white/5 dark:hover:text-slate-300"
                                  title="Unlink"
                                >
                                  <Link2Off className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : creationStatus === "done" && newProjectId ? (
                              /* Just created — show View project link */
                              <a
                                href={`/projects/${newProjectId}`}
                                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40 transition-colors"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                View project
                              </a>
                            ) : (
                              /* Not linked, not just created — show Create + Link buttons */
                              <div className="flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={creationStatus === "creating" || isLinkPickerOpen}
                                  onClick={() => handleCreateProject(project)}
                                >
                                  {creationStatus === "creating" ? (
                                    <>
                                      <svg className="animate-spin -ml-0.5 mr-1.5 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                      </svg>
                                      Creating…
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="-ml-0.5 mr-1.5 h-3.5 w-3.5" />
                                      Create New Project
                                    </>
                                  )}
                                </Button>
                                <button
                                  type="button"
                                  disabled={creationStatus === "creating"}
                                  onClick={() => openLinkPicker(project.rtProjectId)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 transition-colors"
                                  title="Link to existing project"
                                >
                                  <Link2 className="h-3.5 w-3.5" />
                                  Link
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Inline link picker */}
                        {isLinkPickerOpen && (
                          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 dark:border-white/5 dark:bg-white/2">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                Link <span className="font-semibold text-slate-800 dark:text-slate-200">"{project.name}"</span> to an existing project:
                              </span>
                              <button
                                type="button"
                                onClick={() => setLinkPickerForRtId(null)}
                                className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {loadingAppProjects ? (
                              <p className="text-xs text-slate-500 dark:text-slate-400">Loading projects…</p>
                            ) : appProjects.length === 0 ? (
                              <p className="text-xs text-slate-500 dark:text-slate-400">No projects found.</p>
                            ) : (
                              <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                                {appProjects.map((ap) => (
                                  <button
                                    key={ap.id}
                                    type="button"
                                    disabled={isSavingLink}
                                    onClick={() => handleLinkProject(project.rtProjectId, ap.id, ap.name)}
                                    className="flex items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/5"
                                  >
                                    <span className="font-medium text-slate-800 dark:text-slate-200">{ap.name}</span>
                                    <span className="text-slate-500 dark:text-slate-400">{ap.client.name}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            No archive data yet. Upload your Project History archive from{" "}
            <a
              href="https://www.rescuetime.com/rtx/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-amber-800 dark:hover:text-amber-300"
            >
              RescueTime Settings
            </a>{" "}
            to enable project time import.
          </p>
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-500">
        Download your Project History archive from RescueTime settings and upload the JSON file here. Re-uploading will replace entries for overlapping dates.
      </p>
    </div>
  );
}
