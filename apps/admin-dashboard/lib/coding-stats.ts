import { prisma } from "@freelance-os/database";
import { getFastAiModel } from "@/lib/ai-provider";
import { fetchAllForgeCommits } from "@/lib/git-actions";
import {
  generateTextWithTelemetry,
  type DebugTelemetryOptions,
} from "@/lib/ai-actions/shared";

// ──────────────────────────────────────────────────
// Fetch helper with timeout
// ──────────────────────────────────────────────────

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────

interface ForgeConfig {
  token: string;
  username: string;
  baseUrl?: string;
}

export interface ForgeStats {
  forge: "github" | "gitlab" | "codeberg";
  username: string;
  totalStars: number;
  totalRepos: number;
  commits7d: number;
  commits30d: number;
  prsOrMrs: number; // PRs (GitHub/Codeberg) or MRs (GitLab) opened this year
  issuesOpened: number; // issues opened this year
  languages: Record<string, number>; // language → repo count using that language
  recentOSSContribution: OSSContribution | null;
}

export interface OSSContribution {
  repo: string; // "owner/repo"
  forge: "github" | "gitlab" | "codeberg";
  message: string; // first commit message
  date: string;
  summary?: string; // AI-generated short description of the contribution
}

export interface CodingStatsData {
  freelancerName: string;
  forges: ForgeStats[];
  mergedLanguages: Record<string, number>; // language → total repo count across all forges
  totalCommits7d: number;
  totalCommits30d: number;
  totalStars: number;
  totalPRs: number;
  totalIssues: number;
  totalRepos: number;
  activeProjectCount: number; // from internal project tracking (count only, no names)
  weeklyHoursCoded: number; // from activity sessions (editor time in last 7 days)
  recentOSSContribution: OSSContribution | null;
  aiInsight: string; // AI-generated one-liner
  generatedAt: string; // ISO timestamp
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

// ──────────────────────────────────────────────────
// GitHub data gathering
// ──────────────────────────────────────────────────

async function fetchGitHubStats(config: ForgeConfig): Promise<ForgeStats> {
  const headers = {
    Authorization: `Bearer ${config.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  // Fetch repos (for stars, languages, repo count)
  let totalStars = 0;
  let totalRepos = 0;
  const languages: Record<string, number> = {};
  const ownedRepoNames = new Set<string>();

  try {
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 5) {
      const reposRes = await fetchWithTimeout(
        `https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner,collaborator,organization_member&sort=updated`,
        { headers }
      );
      if (!reposRes.ok) break;
      const repos: Array<{
        full_name: string;
        stargazers_count: number;
        language: string | null;
        fork: boolean;
        owner: { login: string };
      }> = await reposRes.json();

      if (repos.length === 0) break;

      for (const repo of repos) {
        if (repo.language) {
          languages[repo.language] = (languages[repo.language] || 0) + 1;
        }
        // Track repos owned by user to identify OSS contributions later
        const isOwned = repo.owner.login.toLowerCase() === config.username.toLowerCase();
        if (isOwned) {
          ownedRepoNames.add(repo.full_name.toLowerCase());
          // Only count stars and repos for repos the user actually owns
          totalRepos++;
          totalStars += repo.stargazers_count;
        }
      }

      hasMore = repos.length === 100;
      page++;
    }
  } catch (error) {
    console.error("[CodingStats] GitHub repos fetch error:", error);
  }

  // Fetch commit counts (7d and 30d)
  let commits7d = 0;
  let commits30d = 0;

  try {
    const search7dRes = await fetchWithTimeout(
      `https://api.github.com/search/commits?q=author:${config.username}+committer-date:>${sevenDaysAgo.toISOString().split("T")[0]}&per_page=1`,
      { headers }
    );
    if (search7dRes.ok) {
      const data = await search7dRes.json();
      commits7d = data.total_count ?? 0;
    }
  } catch (error) {
    console.error("[CodingStats] GitHub 7d commits error:", error);
  }

  try {
    const search30dRes = await fetchWithTimeout(
      `https://api.github.com/search/commits?q=author:${config.username}+committer-date:>${thirtyDaysAgo.toISOString().split("T")[0]}&per_page=1`,
      { headers }
    );
    if (search30dRes.ok) {
      const data = await search30dRes.json();
      commits30d = data.total_count ?? 0;
    }
  } catch (error) {
    console.error("[CodingStats] GitHub 30d commits error:", error);
  }

  // Fetch PRs opened this year
  let prsOrMrs = 0;
  try {
    const prRes = await fetchWithTimeout(
      `https://api.github.com/search/issues?q=author:${config.username}+type:pr+created:>${yearStart.toISOString().split("T")[0]}&per_page=1`,
      { headers }
    );
    if (prRes.ok) {
      const data = await prRes.json();
      prsOrMrs = data.total_count ?? 0;
    }
  } catch (error) {
    console.error("[CodingStats] GitHub PRs error:", error);
  }

  // Fetch issues opened this year
  let issuesOpened = 0;
  try {
    const issueRes = await fetchWithTimeout(
      `https://api.github.com/search/issues?q=author:${config.username}+type:issue+created:>${yearStart.toISOString().split("T")[0]}&per_page=1`,
      { headers }
    );
    if (issueRes.ok) {
      const data = await issueRes.json();
      issuesOpened = data.total_count ?? 0;
    }
  } catch (error) {
    console.error("[CodingStats] GitHub issues error:", error);
  }

  // Find recent OSS contribution (commit to a repo not owned by user)
  let recentOSSContribution: OSSContribution | null = null;
  try {
    const ossCommitsRes = await fetchWithTimeout(
      `https://api.github.com/search/commits?q=author:${config.username}+committer-date:>${thirtyDaysAgo.toISOString().split("T")[0]}&per_page=20&sort=author-date&order=desc`,
      { headers }
    );
    if (ossCommitsRes.ok) {
      const data = await ossCommitsRes.json();
      const items = data.items ?? [];
      for (const item of items) {
        const repoName = item.repository?.full_name;
        if (repoName && !ownedRepoNames.has(repoName.toLowerCase())) {
          // Check if the repo owner is different from the user
          const repoOwner = repoName.split("/")[0]?.toLowerCase();
          if (repoOwner !== config.username.toLowerCase()) {
            recentOSSContribution = {
              repo: repoName,
              forge: "github",
              message: item.commit?.message?.split("\n")[0] ?? "",
              date: item.commit?.author?.date ?? "",
            };
            break;
          }
        }
      }
    }
  } catch (error) {
    console.error("[CodingStats] GitHub OSS contribution error:", error);
  }

  return {
    forge: "github",
    username: config.username,
    totalStars,
    totalRepos,
    commits7d,
    commits30d,
    prsOrMrs,
    issuesOpened,
    languages,
    recentOSSContribution,
  };
}

// ──────────────────────────────────────────────────
// GitLab data gathering
// ──────────────────────────────────────────────────

async function fetchGitLabStats(config: ForgeConfig): Promise<ForgeStats> {
  const baseUrl = config.baseUrl || "https://gitlab.com";
  const headers = { "Private-Token": config.token };

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  let totalStars = 0;
  let totalRepos = 0;
  const languages: Record<string, number> = {};
  const ownedProjectIds = new Set<number>();

  // Fetch projects
  type GitLabProject = {
    id: number;
    path_with_namespace: string;
    star_count: number;
    default_branch: string | null;
    last_activity_at: string;
    namespace: { kind: string; path: string };
  };

  const allProjects: GitLabProject[] = [];

  try {
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 5) {
      const projectsRes = await fetchWithTimeout(
        `${baseUrl}/api/v4/projects?membership=true&min_access_level=20&simple=true&per_page=100&page=${page}&order_by=last_activity_at`,
        { headers }
      );
      if (!projectsRes.ok) break;
      const projects: GitLabProject[] = await projectsRes.json();
      if (projects.length === 0) break;

      for (const project of projects) {
        allProjects.push(project);
        const isOwned = project.namespace.path.toLowerCase() === config.username.toLowerCase();
        if (isOwned) {
          ownedProjectIds.add(project.id);
          // Only count stars and repos for projects the user actually owns
          totalRepos++;
          totalStars += project.star_count;
        }
      }

      hasMore = projects.length === 100;
      page++;
    }
  } catch (error) {
    console.error("[CodingStats] GitLab projects error:", error);
  }

  // Fetch languages for recent projects (top 20 by activity)
  const recentProjects = allProjects.slice(0, 20);
  await Promise.all(
    recentProjects.map(async (project) => {
      try {
        const langRes = await fetchWithTimeout(
          `${baseUrl}/api/v4/projects/${project.id}/languages`,
          { headers }
        );
        if (langRes.ok) {
          const langs: Record<string, number> = await langRes.json();
          for (const lang of Object.keys(langs)) {
            languages[lang] = (languages[lang] || 0) + 1;
          }
        }
      } catch {
        // skip individual failures
      }
    })
  );

  // Count commits via the Events API — much more accurate than per-project iteration.
  // The events API returns push events for the authenticated user directly.
  let commits7d = 0;
  let commits30d = 0;

  try {
    const after30d = thirtyDaysAgo.toISOString().split("T")[0];
    let page = 1;
    let hasMoreEvents = true;
    while (hasMoreEvents && page <= 10) {
      const eventsRes = await fetchWithTimeout(
        `${baseUrl}/api/v4/events?action=pushed&after=${after30d}&per_page=100&page=${page}`,
        { headers }
      );
      if (!eventsRes.ok) break;
      const events: Array<{
        created_at: string;
        push_data?: { commit_count: number };
      }> = await eventsRes.json();
      if (events.length === 0) break;

      for (const event of events) {
        const count = event.push_data?.commit_count ?? 0;
        commits30d += count;
        if (new Date(event.created_at).getTime() >= sevenDaysAgo.getTime()) {
          commits7d += count;
        }
      }

      hasMoreEvents = events.length === 100;
      page++;
    }
  } catch (error) {
    console.error("[CodingStats] GitLab events error:", error);
  }

  const projectsActiveRecently = allProjects.filter(
    (p) => new Date(p.last_activity_at) >= thirtyDaysAgo
  );

  // MRs opened this year
  let prsOrMrs = 0;
  try {
    const mrRes = await fetchWithTimeout(
      `${baseUrl}/api/v4/merge_requests?scope=created_by_me&created_after=${yearStart.toISOString()}&per_page=1`,
      { headers }
    );
    if (mrRes.ok) {
      // GitLab returns total in x-total header
      const total = mrRes.headers.get("x-total");
      prsOrMrs = total ? parseInt(total, 10) : 0;
    }
  } catch (error) {
    console.error("[CodingStats] GitLab MRs error:", error);
  }

  // Issues opened this year
  let issuesOpened = 0;
  try {
    const issueRes = await fetchWithTimeout(
      `${baseUrl}/api/v4/issues?scope=created_by_me&created_after=${yearStart.toISOString()}&per_page=1`,
      { headers }
    );
    if (issueRes.ok) {
      const total = issueRes.headers.get("x-total");
      issuesOpened = total ? parseInt(total, 10) : 0;
    }
  } catch (error) {
    console.error("[CodingStats] GitLab issues error:", error);
  }

  // Find OSS contribution (commit to project not owned by user)
  let recentOSSContribution: OSSContribution | null = null;
  for (const project of projectsActiveRecently.slice(0, 30)) {
    if (ownedProjectIds.has(project.id)) continue;

    try {
      const commitsRes = await fetchWithTimeout(
        `${baseUrl}/api/v4/projects/${project.id}/repository/commits?ref_name=${encodeURIComponent(project.default_branch ?? "main")}&since=${thirtyDaysAgo.toISOString()}&per_page=5`,
        { headers }
      );
      if (commitsRes.ok) {
        const commits: Array<{
          title: string;
          author_name: string;
          author_email: string;
          created_at: string;
        }> = await commitsRes.json();
        const userCommit = commits.find(
          (c) =>
            c.author_name.toLowerCase().includes(config.username.toLowerCase()) ||
            c.author_email.toLowerCase().includes(config.username.toLowerCase())
        );
        if (userCommit) {
          recentOSSContribution = {
            repo: project.path_with_namespace,
            forge: "gitlab",
            message: userCommit.title,
            date: userCommit.created_at,
          };
          break;
        }
      }
    } catch {
      // skip
    }
  }

  return {
    forge: "gitlab",
    username: config.username,
    totalStars,
    totalRepos,
    commits7d,
    commits30d,
    prsOrMrs,
    issuesOpened,
    languages,
    recentOSSContribution,
  };
}

// ──────────────────────────────────────────────────
// Codeberg (Gitea) data gathering
// ──────────────────────────────────────────────────

async function fetchCodebergStats(config: ForgeConfig): Promise<ForgeStats> {
  const baseUrl = "https://codeberg.org/api/v1";
  const headers = {
    Authorization: `token ${config.token}`,
    Accept: "application/json",
  };

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let totalStars = 0;
  let totalRepos = 0;
  const languages: Record<string, number> = {};

  type GiteaRepo = {
    full_name: string;
    stars_count: number;
    language: string;
    updated_at: string;
    default_branch: string;
    fork: boolean;
    owner: { login: string };
  };

  const allRepos: GiteaRepo[] = [];

  try {
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 5) {
      const reposRes = await fetchWithTimeout(
        `${baseUrl}/user/repos?limit=50&page=${page}&sort=updated&order=desc`,
        { headers }
      );
      if (!reposRes.ok) break;
      const repos: GiteaRepo[] = await reposRes.json();
      if (repos.length === 0) break;

      for (const repo of repos) {
        if (repo.language) {
          languages[repo.language] = (languages[repo.language] || 0) + 1;
        }
        allRepos.push(repo);
        // Only count stars and repos for repos the user actually owns
        if (repo.owner.login.toLowerCase() === config.username.toLowerCase()) {
          totalRepos++;
          totalStars += repo.stars_count;
        }
      }

      hasMore = repos.length === 50;
      page++;
    }
  } catch (error) {
    console.error("[CodingStats] Codeberg repos error:", error);
  }

  // Count commits via the heatmap API — same data source as the contribution graph.
  // Returns [{timestamp: unix_seconds, contributions: number}] for the whole year.
  let commits7d = 0;
  let commits30d = 0;

  try {
    const heatmapRes = await fetchWithTimeout(
      `${baseUrl}/users/${config.username}/heatmap`,
      { headers }
    );
    if (heatmapRes.ok) {
      const heatmap: Array<{ timestamp: number; contributions: number }> =
        await heatmapRes.json();
      const sevenDaysAgoMs = sevenDaysAgo.getTime();
      const thirtyDaysAgoMs = thirtyDaysAgo.getTime();
      for (const entry of heatmap) {
        const ts = entry.timestamp * 1000; // convert seconds → ms
        if (ts >= thirtyDaysAgoMs) {
          commits30d += entry.contributions;
          if (ts >= sevenDaysAgoMs) {
            commits7d += entry.contributions;
          }
        }
      }
    }
  } catch (error) {
    console.error("[CodingStats] Codeberg heatmap error:", error);
  }

  const recentRepos = allRepos.filter(
    (r) => new Date(r.updated_at) >= thirtyDaysAgo
  );

  // Count PRs (Gitea doesn't have a global search, so we count from recent repos)
  let prsOrMrs = 0;
  let issuesOpened = 0;

  // For Codeberg, we'll check the user's repos for PR/issue counts
  // This is an approximation since Gitea API doesn't have global search
  for (const repo of allRepos.slice(0, 10)) {
    try {
      const prRes = await fetchWithTimeout(
        `${baseUrl}/repos/${repo.full_name}/pulls?state=all&limit=1`,
        { headers }
      );
      if (prRes.ok) {
        // Use x-total-count header if available
        const total = prRes.headers.get("x-total-count");
        if (total) prsOrMrs += parseInt(total, 10);
      }
    } catch {
      // skip
    }
  }

  // Find OSS contribution
  let recentOSSContribution: OSSContribution | null = null;
  for (const repo of recentRepos) {
    if (repo.owner.login.toLowerCase() === config.username.toLowerCase()) continue;

    try {
      const commitsRes = await fetchWithTimeout(
        `${baseUrl}/repos/${repo.full_name}/commits?sha=${encodeURIComponent(repo.default_branch)}&since=${thirtyDaysAgo.toISOString()}&limit=5`,
        { headers }
      );
      if (commitsRes.ok) {
        const commits: Array<{
          commit: {
            message: string;
            author: { name: string; email: string; date: string };
          };
        }> = await commitsRes.json();
        const userCommit = commits.find(
          (c) =>
            c.commit.author.name
              .toLowerCase()
              .includes(config.username.toLowerCase()) ||
            c.commit.author.email
              .toLowerCase()
              .includes(config.username.toLowerCase())
        );
        if (userCommit) {
          recentOSSContribution = {
            repo: repo.full_name,
            forge: "codeberg",
            message: userCommit.commit.message.split("\n")[0] ?? "",
            date: userCommit.commit.author.date,
          };
          break;
        }
      }
    } catch {
      // skip
    }
  }

  return {
    forge: "codeberg",
    username: config.username,
    totalStars,
    totalRepos,
    commits7d,
    commits30d,
    prsOrMrs,
    issuesOpened,
    languages,
    recentOSSContribution,
  };
}

// ──────────────────────────────────────────────────
// Local data (activity sessions, projects)
// ──────────────────────────────────────────────────

async function getLocalStats(): Promise<{
  activeProjectCount: number;
  weeklyHoursCoded: number;
}> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Active projects count (no names leaked)
  const activeProjectCount = await prisma.project.count({
    where: { status: "active" },
  });

  // Editor time in last 7 days — look for common IDE/editor app classes
  const editorPatterns = [
    "code", "vscode", "vscodium", "cursor",
    "neovim", "nvim", "vim", "gvim",
    "emacs",
    "jetbrains", "intellij", "webstorm", "pycharm", "phpstorm", "rubymine", "goland", "clion", "rider", "datagrip",
    "sublime", "atom", "zed", "helix",
    "android-studio", "xcode",
  ];

  const hiddenApps = await prisma.app.findMany({
    where: { hidden: true },
    select: { appClass: true },
  });
  const hiddenSet = new Set(hiddenApps.map((a) => a.appClass.toLowerCase()));

  const sessions = await prisma.activitySession.findMany({
    where: {
      startTime: { gte: sevenDaysAgo },
    },
    select: {
      appClass: true,
      durationSeconds: true,
    },
  });

  let totalEditorSeconds = 0;
  for (const session of sessions) {
    const appLower = session.appClass.toLowerCase();
    if (hiddenSet.has(appLower)) continue;
    if (editorPatterns.some((pattern) => appLower.includes(pattern))) {
      totalEditorSeconds += session.durationSeconds;
    }
  }

  return {
    activeProjectCount,
    weeklyHoursCoded: Math.round((totalEditorSeconds / 3600) * 10) / 10,
  };
}

// ──────────────────────────────────────────────────
// AI Insight generation
// ──────────────────────────────────────────────────

async function generateOssSummary(
  contribution: OSSContribution,
  telemetry?: DebugTelemetryOptions
): Promise<string> {
  try {
    const model = await getFastAiModel();

    const prompt = `Summarize this open-source contribution in 3-6 words for a public stats card.

Repository: ${contribution.repo}
Commit message: ${contribution.message}

RULES:
- Output ONLY the summary, 3-6 words max.
- Describe WHAT was done, not just the repo name. e.g. "fixed auth token refresh", "added dark mode support", "improved build performance"
- Use past tense, lowercase, no period at end.
- No quotes, no emoji.`;

    const result = await generateTextWithTelemetry({ model, prompt }, telemetry);
    const text = result.text.trim().replace(/^["']|["']$/g, "").replace(/\.$/, "");
    return text.length > 60 ? text.substring(0, 57) + "..." : text;
  } catch (error) {
    console.error("[CodingStats] OSS summary generation error:", error);
    return "contributed code";
  }
}

// ──────────────────────────────────────────────────
// Fetch package.json from a forge repo
// ──────────────────────────────────────────────────

async function fetchRepoPackageJson(
  repo: string,
  forge: "github" | "gitlab" | "codeberg",
  configs: { github: ForgeConfig | null; gitlab: ForgeConfig | null; codeberg: ForgeConfig | null },
): Promise<Record<string, string> | null> {
  try {
    let content: string | null = null;

    if (forge === "github" && configs.github) {
      const res = await fetchWithTimeout(
        `https://api.github.com/repos/${repo}/contents/package.json`,
        {
          headers: {
            Authorization: `Bearer ${configs.github.token}`,
            Accept: "application/vnd.github.raw+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );
      if (res.ok) content = await res.text();
    } else if (forge === "gitlab" && configs.gitlab) {
      const baseUrl = configs.gitlab.baseUrl || "https://gitlab.com";
      const encodedPath = encodeURIComponent("package.json");
      // GitLab needs project ID or URL-encoded path
      const encodedRepo = encodeURIComponent(repo);
      const res = await fetchWithTimeout(
        `${baseUrl}/api/v4/projects/${encodedRepo}/repository/files/${encodedPath}/raw?ref=HEAD`,
        { headers: { "Private-Token": configs.gitlab.token } },
      );
      if (res.ok) content = await res.text();
    } else if (forge === "codeberg" && configs.codeberg) {
      const res = await fetchWithTimeout(
        `https://codeberg.org/api/v1/repos/${repo}/contents/package.json?ref=HEAD`,
        {
          headers: {
            Authorization: `token ${configs.codeberg.token}`,
            Accept: "application/json",
          },
        },
      );
      if (res.ok) {
        const data = await res.json();
        // Gitea returns base64-encoded content
        if (data.content) {
          content = Buffer.from(data.content, "base64").toString("utf-8");
        }
      }
    }

    if (!content) return null;

    const parsed = JSON.parse(content);
    // Merge dependencies and devDependencies into one flat map
    return {
      ...(parsed.dependencies ?? {}),
      ...(parsed.devDependencies ?? {}),
    };
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────
// AI Insight — based on recent tech stack trends
// ──────────────────────────────────────────────────

async function generateAiInsight(
  data: Omit<CodingStatsData, "aiInsight" | "generatedAt">,
  telemetry?: DebugTelemetryOptions
): Promise<string> {
  try {
    const model = await getFastAiModel();
    const configs = await getForgeConfigs();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Find the most active repos in the last 30 days
    const commits = await fetchAllForgeCommits(thirtyDaysAgo.toISOString(), now.toISOString());
    const repoActivity: Record<string, { count: number; forge: "github" | "gitlab" | "codeberg" }> = {};
    for (const c of commits) {
      if (!repoActivity[c.repo]) repoActivity[c.repo] = { count: 0, forge: c.forge };
      repoActivity[c.repo]!.count++;
    }

    const topRepos = Object.entries(repoActivity)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 5);

    // 2. Fetch package.json from each top repo
    const repoDeps: Array<{ repo: string; forge: string; commits: number; deps: string[] }> = [];

    await Promise.all(
      topRepos.map(async ([repo, { count, forge }]) => {
        const deps = await fetchRepoPackageJson(repo, forge, configs);
        if (deps) {
          repoDeps.push({
            repo,
            forge,
            commits: count,
            deps: Object.keys(deps),
          });
        }
      }),
    );

    if (repoDeps.length === 0) {
      // Fallback: no package.json found in any active repo
      return "Building with a polyglot stack across multiple forges";
    }

    // 3. Build a summary of recent tech activity for the AI
    const repoLines = repoDeps
      .sort((a, b) => b.commits - a.commits)
      .map((r) => `- ${r.repo} (${r.commits} commits/30d): ${r.deps.join(", ")}`)
      .join("\n");

    const prompt = `You are writing a single "insight" line for a developer's public stats card. The audience is visitors to their profile.

Here are the most active repositories in the last 30 days, with their full dependency lists from package.json:

${repoLines}

Your task:
1. Look through the dependencies and find ONE interesting, notable, or unusual technology choice.
2. Write a third-person observation about what they're recently working with.

WHAT'S INTERESTING:
- Domain-specific libraries that reveal the kind of work (e.g. three.js = 3D graphics, maplibre-gl = maps, sharp = image processing, ffmpeg = video, puppeteer = automation, d3 = data viz, playcanvas = game dev)
- New/cutting-edge tech that shows early adoption (e.g. temporal-polyfill = Temporal API early adopter, bun = new runtime, deno fresh = new framework, effect = effect system for TS)
- Unexpected tech combos (e.g. Rust + WebAssembly, AI SDK + maps, Prisma + graph database)
- Framework choices that tell a story (e.g. Next.js + tRPC, Svelte + Supabase, Hono + Cloudflare Workers)

WHAT'S NOT INTERESTING (skip these):
- Generic utilities everyone uses: zod, lodash, axios, dotenv, uuid, prettier, eslint, typescript, jest, vitest
- Standard framework deps that are obvious from the language bar: react, next, vue, express
- Build tooling: webpack, vite, turbo, tsup, esbuild (unless it's the ONLY notable thing)

STRICT OUTPUT RULES:
- One sentence, max 100 characters.
- Third person. Never "you"/"your".
- Reference the specific technology by name.
- Sound like a curious observer, not a recruiter.
- No: "developer", "coder", "impressive", "passionate", "leveraging".
- No emoji, no quotes, no hashtags.
- Do NOT mention repo names, client names, or project names.`;

    const result = await generateTextWithTelemetry({ model, prompt }, telemetry);

    const text = result.text.trim().replace(/^["']|["']$/g, "");
    return text.length > 120 ? text.substring(0, 117) + "..." : text;
  } catch (error) {
    console.error("[CodingStats] AI insight generation error:", error);
    return "Building across the open-source ecosystem";
  }
}

// ──────────────────────────────────────────────────
// Main: gather all stats
// ──────────────────────────────────────────────────

export async function gatherCodingStats(): Promise<CodingStatsData> {
  const configs = await getForgeConfigs();
  const settings = await prisma.setting.findUnique({
    where: { key: "main" },
  });

  const freelancerName = settings?.freelancerName || "Developer";

  // Fetch from all configured forges in parallel
  const forgePromises: Promise<ForgeStats>[] = [];
  if (configs.github) forgePromises.push(fetchGitHubStats(configs.github));
  if (configs.gitlab) forgePromises.push(fetchGitLabStats(configs.gitlab));
  if (configs.codeberg) forgePromises.push(fetchCodebergStats(configs.codeberg));

  const [forgeResults, local] = await Promise.all([
    Promise.allSettled(forgePromises),
    getLocalStats(),
  ]);

  const forges = forgeResults
    .filter((r): r is PromiseFulfilledResult<ForgeStats> => r.status === "fulfilled")
    .map((r) => r.value);

  forgeResults
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .forEach((r) => console.error("[CodingStats] Forge fetch failed:", r.reason));

  // Merge languages across all forges
  const mergedLanguages: Record<string, number> = {};
  for (const forge of forges) {
    for (const [lang, count] of Object.entries(forge.languages)) {
      mergedLanguages[lang] = (mergedLanguages[lang] || 0) + count;
    }
  }

  // Aggregate stats
  const totalCommits7d = forges.reduce((sum, f) => sum + f.commits7d, 0);
  const totalCommits30d = forges.reduce((sum, f) => sum + f.commits30d, 0);
  const totalStars = forges.reduce((sum, f) => sum + f.totalStars, 0);
  const totalPRs = forges.reduce((sum, f) => sum + f.prsOrMrs, 0);
  const totalIssues = forges.reduce((sum, f) => sum + f.issuesOpened, 0);
  const totalRepos = forges.reduce((sum, f) => sum + f.totalRepos, 0);

  // Pick the most recent OSS contribution across forges
  let recentOSSContribution: OSSContribution | null = null;
  for (const forge of forges) {
    if (forge.recentOSSContribution) {
      if (
        !recentOSSContribution ||
        new Date(forge.recentOSSContribution.date) >
          new Date(recentOSSContribution.date)
      ) {
        recentOSSContribution = forge.recentOSSContribution;
      }
    }
  }

  // Generate AI summary for OSS contribution
  if (recentOSSContribution) {
    recentOSSContribution.summary = await generateOssSummary(
      recentOSSContribution,
      { functionId: "coding-stats.generateOssSummary" }
    );
  }

  const baseData = {
    freelancerName,
    forges,
    mergedLanguages,
    totalCommits7d,
    totalCommits30d,
    totalStars,
    totalPRs,
    totalIssues,
    totalRepos,
    activeProjectCount: local.activeProjectCount,
    weeklyHoursCoded: local.weeklyHoursCoded,
    recentOSSContribution,
  };

  // Generate AI insight
  const aiInsight = await generateAiInsight(
    baseData,
    { functionId: "coding-stats.generateAiInsight" }
  );

  return {
    ...baseData,
    aiInsight,
    generatedAt: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────────
// Cache management
// ──────────────────────────────────────────────────

const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

/**
 * Get cached stats or generate fresh ones.
 * Stats are cached in the database for 1 week.
 */
export async function getCachedCodingStats(): Promise<CodingStatsData | null> {
  const settings = await prisma.setting.findUnique({
    where: { key: "main" },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new Prisma fields may not be in cached types yet
  const s = settings as any;

  if (!s?.codingStatsEnabled) {
    return null;
  }

  // Check if cache is valid
  if (s.codingStatsCache && s.codingStatsCachedAt) {
    const cacheAge = Date.now() - new Date(s.codingStatsCachedAt).getTime();
    if (cacheAge < CACHE_DURATION_MS) {
      try {
        return JSON.parse(s.codingStatsCache) as CodingStatsData;
      } catch {
        // Cache is corrupted, regenerate
      }
    }
  }

  // Generate fresh stats
  const stats = await gatherCodingStats();

  // Save to cache
  await prisma.setting.update({
    where: { key: "main" },
    data: {
      codingStatsCache: JSON.stringify(stats),
      codingStatsCachedAt: new Date(),
    } as any,
  });

  return stats;
}

/**
 * Force regenerate the coding stats cache.
 */
export async function regenerateCodingStatsCache(): Promise<CodingStatsData> {
  const stats = await gatherCodingStats();

  await prisma.setting.update({
    where: { key: "main" },
    data: {
      codingStatsCache: JSON.stringify(stats),
      codingStatsCachedAt: new Date(),
    } as any,
  });

  return stats;
}
