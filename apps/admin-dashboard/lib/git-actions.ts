"use server";

import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@freelance-os/database";
import { Temporal } from "@/lib/temporal-polyfill";

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────

export interface GitCommit {
  sha: string;
  message: string;
  date: string; // ISO timestamp
  repo: string; // "owner/repo"
  forge: "github" | "gitlab" | "codeberg";
  url: string;
}

function logGitDebug(message: string, meta?: Record<string, unknown>) {
  console.log(`[Git Debug] ${message}`, meta ?? {});
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getIdentityCandidates(configuredUsername: string): string[] {
  const raw = configuredUsername.trim().toLowerCase();
  const normalized = normalizeIdentity(configuredUsername);
  const parts = raw.split(/[-_.\s]+/).filter(Boolean);

  return Array.from(
    new Set([
      raw,
      normalized,
      ...parts,
      parts.join(""),
      parts.join(" "),
    ].filter(Boolean)),
  );
}

function matchesConfiguredIdentity(
  configuredUsername: string,
  authorName: string,
  authorEmail: string,
): boolean {
  const candidates = getIdentityCandidates(configuredUsername);
  const normalizedAuthorName = normalizeIdentity(authorName);
  const normalizedAuthorEmail = normalizeIdentity(authorEmail);
  const emailLocalPart = authorEmail.split("@")[0] ?? "";
  const normalizedEmailLocalPart = normalizeIdentity(emailLocalPart);

  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeIdentity(candidate);

    return (
      normalizedAuthorName.includes(normalizedCandidate) ||
      normalizedAuthorEmail.includes(normalizedCandidate) ||
      normalizedEmailLocalPart.includes(normalizedCandidate)
    );
  });
}

function isCommitWithinRange(
  commitDate: string,
  startInclusiveIso: string,
  endInclusiveIso: string,
): boolean {
  const commitMs = new Date(commitDate).getTime();
  const startMs = new Date(startInclusiveIso).getTime();
  const endMs = new Date(endInclusiveIso).getTime();

  if (Number.isNaN(commitMs) || Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return false;
  }

  return commitMs >= startMs && commitMs <= endMs;
}

interface ForgeConfig {
  token: string;
  username: string;
  baseUrl?: string;
}

// ──────────────────────────────────────────────────
// Settings helpers
// ──────────────────────────────────────────────────

async function getForgeConfigs(): Promise<{
  github: ForgeConfig | null;
  gitlab: ForgeConfig | null;
  codeberg: ForgeConfig | null;
}> {
  const settings = await prisma.setting.findUnique({
    where: { key: "main" },
  });

  return {
    github:
      settings?.githubToken && settings.githubUsername
        ? { token: settings.githubToken, username: settings.githubUsername }
        : null,
    gitlab:
      settings?.gitlabToken && settings.gitlabUsername
        ? {
            token: settings.gitlabToken,
            username: settings.gitlabUsername,
            baseUrl: settings.gitlabUrl || undefined,
          }
        : null,
    codeberg:
      settings?.codebergToken && settings.codebergUsername
        ? { token: settings.codebergToken, username: settings.codebergUsername }
        : null,
  };
}

/**
 * Check if any git forge integration is configured.
 */
export async function isAnyForgeEnabled(): Promise<boolean> {
  const configs = await getForgeConfigs();
  return !!(configs.github || configs.gitlab || configs.codeberg);
}

// ──────────────────────────────────────────────────
// GitHub — Search Commits API
// ──────────────────────────────────────────────────

async function fetchGitHubCommits(
  config: ForgeConfig,
  startTime: string,
  endTime: string,
): Promise<GitCommit[]> {
  const queries = [
    `author:${config.username} committer-date:${startTime}..${endTime}`,
    `author:${config.username} author-date:${startTime}..${endTime}`,
  ];

  try {
    const allCommits: GitCommit[] = [];

    for (const query of queries) {
      const url = `https://api.github.com/search/commits?q=${encodeURIComponent(query)}&per_page=100&sort=author-date&order=desc`;

      logGitDebug("GitHub commit search starting", {
        forge: "github",
        username: config.username,
        startTime,
        endTime,
        query,
        url,
      });

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(
          `[Git] GitHub search commits failed: ${response.status} ${response.statusText}`,
        );
        logGitDebug("GitHub commit search failed", {
          forge: "github",
          query,
          status: response.status,
          statusText: response.statusText,
          bodyPreview: errorText.slice(0, 500),
        });
        continue;
      }

      const data = await response.json();

      const commits = (data.items ?? []).map(
        (item: {
          sha: string;
          commit: {
            message: string;
            author: { date: string };
          };
          repository: { full_name: string };
          html_url: string;
        }) => ({
          sha: item.sha,
          message: item.commit.message.split("\n")[0],
          date: item.commit.author.date,
          repo: item.repository.full_name,
          forge: "github" as const,
          url: item.html_url,
        }),
      );

      logGitDebug("GitHub commit search completed", {
        forge: "github",
        query,
        totalCount: data.total_count ?? commits.length,
        returnedCount: commits.length,
        sample: commits.slice(0, 5).map((commit: GitCommit) => ({
          sha: commit.sha.slice(0, 8),
          date: commit.date,
          repo: commit.repo,
          message: commit.message,
        })),
      });

      allCommits.push(...commits);
    }

    return Array.from(
      new Map(allCommits.map((commit) => [`github:${commit.sha}`, commit])).values(),
    );
  } catch (error) {
    console.error("[Git] GitHub fetch error:", error);
    logGitDebug("GitHub fetch threw", {
      forge: "github",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// ──────────────────────────────────────────────────
// GitLab — Project listing + repository commits
// ──────────────────────────────────────────────────

async function fetchGitLabCommits(
  config: ForgeConfig,
  startTime: string,
  endTime: string,
): Promise<GitCommit[]> {
  const baseUrl = config.baseUrl || "https://gitlab.com";
  const projectsUrl = `${baseUrl}/api/v4/projects?membership=true&min_access_level=20&simple=true&order_by=last_activity_at&sort=desc&per_page=100`;

  logGitDebug("GitLab project scan starting", {
    forge: "gitlab",
    username: config.username,
    startTime,
    endTime,
    url: projectsUrl,
  });

  try {
    const response = await fetch(projectsUrl, {
      headers: {
        "Private-Token": config.token,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(
        `[Git] GitLab projects failed: ${response.status} ${response.statusText}`,
      );
      logGitDebug("GitLab project scan failed", {
        forge: "gitlab",
        status: response.status,
        statusText: response.statusText,
        bodyPreview: errorText.slice(0, 500),
      });
      return [];
    }

    const projects: Array<{
      id: number;
      path_with_namespace: string;
      default_branch: string | null;
      last_activity_at: string;
      web_url: string;
    }> = await response.json();

    const sinceDate = new Date(startTime);
    const relevantProjects = projects.filter(
      (project) => new Date(project.last_activity_at) >= sinceDate,
    );

    logGitDebug("GitLab projects fetched", {
      forge: "gitlab",
      projectCount: projects.length,
      relevantProjectCount: relevantProjects.length,
      sample: relevantProjects.slice(0, 10).map((project) => ({
        id: project.id,
        repo: project.path_with_namespace,
        defaultBranch: project.default_branch,
        lastActivityAt: project.last_activity_at,
      })),
    });

    const commits: GitCommit[] = [];

    await Promise.all(
      relevantProjects.map(async (project) => {
        try {
          const defaultBranch = project.default_branch ?? "main";
          const commitsUrl = `${baseUrl}/api/v4/projects/${project.id}/repository/commits?ref_name=${encodeURIComponent(defaultBranch)}&since=${encodeURIComponent(startTime)}&until=${encodeURIComponent(endTime)}&per_page=100`;

          logGitDebug("GitLab project commit fetch starting", {
            forge: "gitlab",
            projectId: project.id,
            repo: project.path_with_namespace,
            url: commitsUrl,
          });

          const commitsRes = await fetch(commitsUrl, {
            headers: {
              "Private-Token": config.token,
            },
          });

          if (!commitsRes.ok) {
            const errorText = await commitsRes.text().catch(() => "");
            logGitDebug("GitLab project commit fetch failed", {
              forge: "gitlab",
              projectId: project.id,
              repo: project.path_with_namespace,
              status: commitsRes.status,
              statusText: commitsRes.statusText,
              bodyPreview: errorText.slice(0, 500),
            });
            return;
          }

          const projectCommits: Array<{
            id: string;
            short_id: string;
            created_at: string;
            title: string;
            author_name: string;
            author_email: string;
            web_url: string;
          }> = await commitsRes.json();

          logGitDebug("GitLab project commits fetched", {
            forge: "gitlab",
            projectId: project.id,
            repo: project.path_with_namespace,
            rawCommitCount: projectCommits.length,
            sample: projectCommits.slice(0, 5).map((commit) => ({
              sha: commit.short_id,
              date: commit.created_at,
              authorName: commit.author_name,
              authorEmail: commit.author_email,
              message: commit.title,
            })),
          });

          const matchingCommits = projectCommits.filter((commit) =>
            matchesConfiguredIdentity(
              config.username,
              commit.author_name,
              commit.author_email,
            ),
          );

          logGitDebug("GitLab project commits filtered by author", {
            forge: "gitlab",
            projectId: project.id,
            repo: project.path_with_namespace,
            username: config.username,
            identityCandidates: getIdentityCandidates(config.username),
            filteredCommitCount: matchingCommits.length,
            sample: matchingCommits.slice(0, 5).map((commit) => ({
              sha: commit.short_id,
              date: commit.created_at,
              authorName: commit.author_name,
              authorEmail: commit.author_email,
              message: commit.title,
            })),
          });

          for (const commit of matchingCommits) {
            commits.push({
              sha: commit.id,
              message: commit.title,
              date: commit.created_at,
              repo: project.path_with_namespace,
              forge: "gitlab",
              url: commit.web_url,
            });
          }
        } catch (error) {
          logGitDebug("GitLab project commit fetch threw", {
            forge: "gitlab",
            projectId: project.id,
            repo: project.path_with_namespace,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );

    logGitDebug("GitLab commit scan completed", {
      forge: "gitlab",
      commitCount: commits.length,
      sample: commits.slice(0, 5).map((commit) => ({
        sha: commit.sha.slice(0, 8),
        date: commit.date,
        repo: commit.repo,
        message: commit.message,
      })),
    });

    return commits;
  } catch (error) {
    console.error("[Git] GitLab fetch error:", error);
    logGitDebug("GitLab project scan threw", {
      forge: "gitlab",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// ──────────────────────────────────────────────────
// Codeberg (Gitea) — List repos then fetch commits
// ──────────────────────────────────────────────────

async function fetchCodebergCommits(
  config: ForgeConfig,
  startTime: string,
  endTime: string,
): Promise<GitCommit[]> {
  const baseUrl = "https://codeberg.org/api/v1";

  logGitDebug("Codeberg repo scan starting", {
    forge: "codeberg",
    username: config.username,
    startTime,
    endTime,
  });

  try {
    // Step 1: Get repos the user owns/has contributed to that were updated recently
    const reposUrl = `${baseUrl}/user/repos?limit=50&sort=updated&order=desc`;
    const reposRes = await fetch(reposUrl, {
      headers: {
        Authorization: `token ${config.token}`,
        Accept: "application/json",
      },
    });

    if (!reposRes.ok) {
      const errorText = await reposRes.text().catch(() => "");
      console.error(
        `[Git] Codeberg repos failed: ${reposRes.status} ${reposRes.statusText}`,
      );
      logGitDebug("Codeberg repo scan failed", {
        forge: "codeberg",
        status: reposRes.status,
        statusText: reposRes.statusText,
        bodyPreview: errorText.slice(0, 500),
      });
      return [];
    }

    const repos: Array<{
      full_name: string;
      html_url: string;
      updated_at: string;
      default_branch: string;
    }> = await reposRes.json();

    // Only check repos updated after our start date (rough filter)
    const sinceDate = new Date(startTime);
    const relevantRepos = repos.filter(
      (r) => new Date(r.updated_at) >= sinceDate,
    );

    logGitDebug("Codeberg repos fetched", {
      forge: "codeberg",
      repoCount: repos.length,
      relevantRepoCount: relevantRepos.length,
      sample: relevantRepos.slice(0, 10).map((repo) => ({
        repo: repo.full_name,
        updatedAt: repo.updated_at,
        defaultBranch: repo.default_branch,
      })),
    });

    const allCommits: GitCommit[] = [];

    // Step 2: Fetch commits per repo, filtered by author and date
    await Promise.all(
      relevantRepos.map(async (repo) => {
        try {
          const commitsUrl = `${baseUrl}/repos/${repo.full_name}/commits?sha=${encodeURIComponent(repo.default_branch)}&since=${encodeURIComponent(startTime)}&until=${encodeURIComponent(endTime)}&limit=50`;
          logGitDebug("Codeberg repo commit fetch starting", {
            forge: "codeberg",
            repo: repo.full_name,
            url: commitsUrl,
          });

          const commitsRes = await fetch(commitsUrl, {
            headers: {
              Authorization: `token ${config.token}`,
              Accept: "application/json",
            },
          });

          if (!commitsRes.ok) {
            const errorText = await commitsRes.text().catch(() => "");
            logGitDebug("Codeberg repo commit fetch failed", {
              forge: "codeberg",
              repo: repo.full_name,
              status: commitsRes.status,
              statusText: commitsRes.statusText,
              bodyPreview: errorText.slice(0, 500),
            });
            return;
          }

          const commits: Array<{
            sha: string;
            commit: {
              message: string;
              author: { name: string; email: string; date: string };
            };
            html_url: string;
          }> = await commitsRes.json();

          logGitDebug("Codeberg repo commits fetched", {
            forge: "codeberg",
            repo: repo.full_name,
            rawCommitCount: commits.length,
            sample: commits.slice(0, 5).map((commit) => ({
              sha: commit.sha.slice(0, 8),
              date: commit.commit.author.date,
              authorName: commit.commit.author.name,
              authorEmail: commit.commit.author.email,
              message: commit.commit.message.split("\n")[0] ?? "",
            })),
          });

          // Filter by configured identity against author name/email/local-part.
          const userCommits = commits.filter((c) => {
            return matchesConfiguredIdentity(
              config.username,
              c.commit.author.name,
              c.commit.author.email,
            );
          });

          logGitDebug("Codeberg repo commits filtered by author", {
            forge: "codeberg",
            repo: repo.full_name,
            username: config.username,
            identityCandidates: getIdentityCandidates(config.username),
            filteredCommitCount: userCommits.length,
            sample: userCommits.slice(0, 5).map((commit) => ({
              sha: commit.sha.slice(0, 8),
              date: commit.commit.author.date,
              authorName: commit.commit.author.name,
              authorEmail: commit.commit.author.email,
              message: commit.commit.message.split("\n")[0] ?? "",
            })),
          });

          for (const commit of userCommits) {
            allCommits.push({
              sha: commit.sha,
              message: commit.commit.message.split("\n")[0] ?? "",
              date: commit.commit.author.date,
              repo: repo.full_name,
              forge: "codeberg",
              url: commit.html_url,
            });
          }
        } catch (error) {
          logGitDebug("Codeberg repo commit fetch threw", {
            forge: "codeberg",
            repo: repo.full_name,
            error: error instanceof Error ? error.message : String(error),
          });
          // skip individual repo failures
        }
      }),
    );

    logGitDebug("Codeberg commit scan completed", {
      forge: "codeberg",
      totalCommitCount: allCommits.length,
      sample: allCommits.slice(0, 5).map((commit) => ({
        sha: commit.sha.slice(0, 8),
        date: commit.date,
        repo: commit.repo,
        message: commit.message,
      })),
    });

    return allCommits;
  } catch (error) {
    console.error("[Git] Codeberg fetch error:", error);
    logGitDebug("Codeberg fetch threw", {
      forge: "codeberg",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// ──────────────────────────────────────────────────
// Aggregated fetch across all configured forges
// ──────────────────────────────────────────────────

/**
 * Fetch commits from all configured git forges within a date range.
 * Returns commits sorted by date descending.
 */
export async function fetchAllForgeCommits(
  startTime: string,
  endTime: string,
): Promise<GitCommit[]> {
  const configs = await getForgeConfigs();
  const fetches: Promise<GitCommit[]>[] = [];

  logGitDebug("Aggregating forge commits", {
    startTime,
    endTime,
    configuredForges: {
      github: !!configs.github,
      gitlab: !!configs.gitlab,
      codeberg: !!configs.codeberg,
    },
  });

  if (configs.github) {
    fetches.push(fetchGitHubCommits(configs.github, startTime, endTime));
  }
  if (configs.gitlab) {
    fetches.push(fetchGitLabCommits(configs.gitlab, startTime, endTime));
  }
  if (configs.codeberg) {
    fetches.push(fetchCodebergCommits(configs.codeberg, startTime, endTime));
  }

  const results = await Promise.all(fetches);
  const rawCommits = results.flat();

  logGitDebug("Per-forge raw results completed", {
    startTime,
    endTime,
    perForgeCounts: {
      github: rawCommits.filter((commit) => commit.forge === "github").length,
      gitlab: rawCommits.filter((commit) => commit.forge === "gitlab").length,
      codeberg: rawCommits.filter((commit) => commit.forge === "codeberg").length,
    },
  });

  const allCommits = rawCommits.filter((commit) =>
    isCommitWithinRange(commit.date, startTime, endTime),
  );

  logGitDebug("Aggregated commits after final timeframe filter", {
    startTime,
    endTime,
    finalCount: allCommits.length,
    sample: allCommits.slice(0, 10).map((commit) => ({
      forge: commit.forge,
      repo: commit.repo,
      sha: commit.sha.slice(0, 8),
      date: commit.date,
      message: commit.message,
    })),
  });

  // Sort by date descending
  allCommits.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return allCommits;
}

// ──────────────────────────────────────────────────
// AI tool factory — for use by autofill & summary agents
// ──────────────────────────────────────────────────

/**
 * Create AI tools for searching git commits within a time range.
 * Used by generateAutofillSuggestions and generateWeeklySummary agents.
 */
export async function createGitCommitTools(
  startInstant: Temporal.Instant,
  endInstant: Temporal.Instant,
) {
  const defaultStartIso = startInstant.toString();
  const defaultEndIso = endInstant.toString();

  return {
    searchGitCommits: tool({
      description:
        "Search for the user's git commits across GitHub, GitLab, and Codeberg " +
        "within a specific time period. Returns commit messages, repos, and timestamps. " +
        "Use this to understand what code the user worked on and which repos map to which projects.",
      inputSchema: z.object({
        startTime: z
          .string()
          .datetime()
          .optional()
          .describe(
            `Inclusive ISO timestamp for the start of the search window. Defaults to ${defaultStartIso}.`,
          ),
        endTime: z
          .string()
          .datetime()
          .optional()
          .describe(
            `Inclusive ISO timestamp for the end of the search window. Defaults to ${defaultEndIso}.`,
          ),
        repoFilter: z
          .string()
          .optional()
          .describe(
            "Optional substring to filter repos by (e.g. 'my-project' or 'client-name'). " +
            "Leave empty to get all commits.",
          ),
      }),
      execute: async ({
        startTime,
        endTime,
        repoFilter,
      }: {
        startTime?: string;
        endTime?: string;
        repoFilter?: string;
      }) => {
        const effectiveStart = startTime ?? defaultStartIso;
        const effectiveEnd = endTime ?? defaultEndIso;

        logGitDebug("searchGitCommits tool invoked", {
          requestedStartTime: startTime ?? null,
          requestedEndTime: endTime ?? null,
          effectiveStart,
          effectiveEnd,
          repoFilter: repoFilter ?? "",
        });

        const commits = (await fetchAllForgeCommits(effectiveStart, effectiveEnd)).filter((commit) =>
          isCommitWithinRange(commit.date, effectiveStart, effectiveEnd),
        );

        if (commits.length === 0) {
          return {
            count: 0,
            message: `No git commits found between ${effectiveStart} and ${effectiveEnd} across any configured forges.`,
          };
        }

        let filtered = commits;
        if (repoFilter) {
          const lower = repoFilter.toLowerCase();
          filtered = commits.filter((c) =>
            c.repo.toLowerCase().includes(lower),
          );
        }

        console.log(
          `[Git] searchGitCommits: ${filtered.length} commits between ${effectiveStart} and ${effectiveEnd}` +
            (repoFilter ? ` matching "${repoFilter}"` : ""),
        );

        logGitDebug("searchGitCommits tool completed", {
          effectiveStart,
          effectiveEnd,
          repoFilter: repoFilter ?? "",
          rawCount: commits.length,
          filteredCount: filtered.length,
        });

        // Group by repo for a cleaner summary
        const byRepo: Record<
          string,
          Array<{ sha: string; message: string; date: string; forge: string }>
        > = {};
        for (const c of filtered) {
          const key = `${c.forge}:${c.repo}`;
          if (!byRepo[key]) byRepo[key] = [];
          byRepo[key].push({
            sha: c.sha.substring(0, 8),
            message: c.message,
            date: c.date,
            forge: c.forge,
          });
        }

        return {
          count: filtered.length,
          timeframe: {
            startTime: effectiveStart,
            endTime: effectiveEnd,
          },
          repos: Object.entries(byRepo).map(([key, repoCommits]) => ({
            repo: key,
            commitCount: repoCommits.length,
            commits: repoCommits.slice(0, 20), // cap per-repo to avoid huge payloads
          })),
        };
      },
    }),
  };
}
