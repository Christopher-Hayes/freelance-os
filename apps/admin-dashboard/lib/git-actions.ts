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
  startDate: string,
  endDate: string,
): Promise<GitCommit[]> {
  // GitHub search commits: author-date range, scoped to the authenticated user
  const query = `author:${config.username} author-date:${startDate}..${endDate}`;
  const url = `https://api.github.com/search/commits?q=${encodeURIComponent(query)}&per_page=100&sort=author-date&order=desc`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      console.error(
        `[Git] GitHub search commits failed: ${response.status} ${response.statusText}`,
      );
      return [];
    }

    const data = await response.json();

    return (data.items ?? []).map(
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
        message: item.commit.message.split("\n")[0], // first line only
        date: item.commit.author.date,
        repo: item.repository.full_name,
        forge: "github" as const,
        url: item.html_url,
      }),
    );
  } catch (error) {
    console.error("[Git] GitHub fetch error:", error);
    return [];
  }
}

// ──────────────────────────────────────────────────
// GitLab — Events API (push events)
// ──────────────────────────────────────────────────

async function fetchGitLabCommits(
  config: ForgeConfig,
  startDate: string,
  endDate: string,
): Promise<GitCommit[]> {
  const baseUrl = config.baseUrl || "https://gitlab.com";
  // GitLab events API: after/before are exclusive date boundaries
  const url = `${baseUrl}/api/v4/events?action=pushed&after=${startDate}&before=${endDate}&per_page=100`;

  try {
    const response = await fetch(url, {
      headers: {
        "Private-Token": config.token,
      },
    });

    if (!response.ok) {
      console.error(
        `[Git] GitLab events failed: ${response.status} ${response.statusText}`,
      );
      return [];
    }

    const events: Array<{
      push_data?: {
        commit_title?: string;
        commit_to?: string;
        ref?: string;
        action?: string;
      };
      project_id: number;
      created_at: string;
      action_name: string;
    }> = await response.json();

    // Resolve project paths in bulk
    const projectIds = [...new Set(events.map((e) => e.project_id))];
    const projectPaths: Record<number, string> = {};

    await Promise.all(
      projectIds.map(async (id) => {
        try {
          const projRes = await fetch(`${baseUrl}/api/v4/projects/${id}`, {
            headers: { "Private-Token": config.token },
          });
          if (projRes.ok) {
            const proj = await projRes.json();
            projectPaths[id] = proj.path_with_namespace;
          }
        } catch {
          // ignore — we'll use the numeric ID as fallback
        }
      }),
    );

    const commits: GitCommit[] = [];

    for (const event of events) {
      if (!event.push_data?.commit_to) continue;

      const repoPath =
        projectPaths[event.project_id] ?? `project/${event.project_id}`;

      commits.push({
        sha: event.push_data.commit_to,
        message: event.push_data.commit_title ?? "(no message)",
        date: event.created_at,
        repo: repoPath,
        forge: "gitlab",
        url: `${baseUrl}/${repoPath}/-/commit/${event.push_data.commit_to}`,
      });
    }

    return commits;
  } catch (error) {
    console.error("[Git] GitLab fetch error:", error);
    return [];
  }
}

// ──────────────────────────────────────────────────
// Codeberg (Gitea) — List repos then fetch commits
// ──────────────────────────────────────────────────

async function fetchCodebergCommits(
  config: ForgeConfig,
  startDate: string,
  endDate: string,
): Promise<GitCommit[]> {
  const baseUrl = "https://codeberg.org/api/v1";

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
      console.error(
        `[Git] Codeberg repos failed: ${reposRes.status} ${reposRes.statusText}`,
      );
      return [];
    }

    const repos: Array<{
      full_name: string;
      html_url: string;
      updated_at: string;
      default_branch: string;
    }> = await reposRes.json();

    // Only check repos updated after our start date (rough filter)
    const sinceDate = new Date(startDate);
    const relevantRepos = repos.filter(
      (r) => new Date(r.updated_at) >= sinceDate,
    );

    const allCommits: GitCommit[] = [];

    // Step 2: Fetch commits per repo, filtered by author and date
    await Promise.all(
      relevantRepos.map(async (repo) => {
        try {
          const commitsUrl = `${baseUrl}/repos/${repo.full_name}/commits?sha=${encodeURIComponent(repo.default_branch)}&since=${startDate}T00:00:00Z&until=${endDate}T23:59:59Z&limit=50`;
          const commitsRes = await fetch(commitsUrl, {
            headers: {
              Authorization: `token ${config.token}`,
              Accept: "application/json",
            },
          });

          if (!commitsRes.ok) return;

          const commits: Array<{
            sha: string;
            commit: {
              message: string;
              author: { name: string; email: string; date: string };
            };
            html_url: string;
          }> = await commitsRes.json();

          // Filter by author username (case-insensitive match on name or email)
          const userLower = config.username.toLowerCase();
          const userCommits = commits.filter((c) => {
            const authorName = c.commit.author.name.toLowerCase();
            const authorEmail = c.commit.author.email.toLowerCase();
            return (
              authorName.includes(userLower) ||
              authorEmail.includes(userLower)
            );
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
        } catch {
          // skip individual repo failures
        }
      }),
    );

    return allCommits;
  } catch (error) {
    console.error("[Git] Codeberg fetch error:", error);
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
  startDate: string,
  endDate: string,
): Promise<GitCommit[]> {
  const configs = await getForgeConfigs();
  const fetches: Promise<GitCommit[]>[] = [];

  if (configs.github) {
    fetches.push(fetchGitHubCommits(configs.github, startDate, endDate));
  }
  if (configs.gitlab) {
    fetches.push(fetchGitLabCommits(configs.gitlab, startDate, endDate));
  }
  if (configs.codeberg) {
    fetches.push(fetchCodebergCommits(configs.codeberg, startDate, endDate));
  }

  const results = await Promise.all(fetches);
  const allCommits = results.flat();

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
  // Convert Instants to YYYY-MM-DD strings for forge APIs
  const startDate = startInstant
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDate()
    .toString();
  const endDate = endInstant
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDate()
    .toString();

  return {
    searchGitCommits: tool({
      description:
        "Search for the user's git commits across GitHub, GitLab, and Codeberg " +
        "within the time period. Returns commit messages, repos, and timestamps. " +
        "Use this to understand what code the user worked on and which repos map to which projects.",
      inputSchema: z.object({
        repoFilter: z
          .string()
          .optional()
          .describe(
            "Optional substring to filter repos by (e.g. 'my-project' or 'client-name'). " +
            "Leave empty to get all commits.",
          ),
      }),
      execute: async ({ repoFilter }: { repoFilter?: string }) => {
        const commits = await fetchAllForgeCommits(startDate, endDate);

        if (commits.length === 0) {
          return {
            count: 0,
            message: "No git commits found in the time period across any configured forges.",
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
          `[Git] searchGitCommits: ${filtered.length} commits` +
            (repoFilter ? ` matching "${repoFilter}"` : ""),
        );

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
