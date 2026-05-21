import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { getAdminAuth, hasPermission } from "@/lib/auth";

type ForgeTestResult = {
  ok: boolean;
  status?: number;
  message: string;
  detail?: string;
};

async function testGitHub(token: string, username: string): Promise<ForgeTestResult> {
  const query = `author:${username} committer-date:>2020-01-01`;
  const url = `https://api.github.com/search/commits?q=${encodeURIComponent(query)}&per_page=1&sort=author-date&order=desc`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    return {
      ok: false,
      message: "Request failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const body = await response.text();

  if (!response.ok) {
    let detail = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body);
      if (parsed.message) detail = parsed.message;
    } catch {}
    return { ok: false, status: response.status, message: `HTTP ${response.status}`, detail };
  }

  const data = JSON.parse(body);
  const count: number = data.total_count ?? 0;
  return {
    ok: true,
    status: response.status,
    message: `Connected — found ${count} commit${count === 1 ? "" : "s"} for @${username}`,
  };
}

async function testGitLab(token: string, username: string, baseUrl?: string): Promise<ForgeTestResult> {
  const base = (baseUrl || "https://gitlab.com").replace(/\/$/, "");
  const url = `${base}/api/v4/projects?membership=true&min_access_level=20&simple=true&per_page=1`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "Private-Token": token },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    return {
      ok: false,
      message: "Request failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const body = await response.text();

  if (!response.ok) {
    let detail = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body);
      if (parsed.message) detail = parsed.message;
    } catch {}
    return { ok: false, status: response.status, message: `HTTP ${response.status}`, detail };
  }

  // Also verify identity by hitting the /user endpoint
  let identityDetail = "";
  try {
    const userRes = await fetch(`${base}/api/v4/user`, {
      headers: { "Private-Token": token },
      signal: AbortSignal.timeout(10000),
    });
    if (userRes.ok) {
      const userData = await userRes.json();
      const actualUsername: string = userData.username ?? "";
      if (actualUsername && actualUsername.toLowerCase() !== username.toLowerCase()) {
        identityDetail = ` (token belongs to @${actualUsername}, not @${username})`;
      }
    }
  } catch {}

  const projects = JSON.parse(body);
  const totalHeader = response.headers.get("x-total") ?? response.headers.get("X-Total");
  const count = totalHeader ? parseInt(totalHeader, 10) : projects.length;
  return {
    ok: true,
    status: response.status,
    message: `Connected — ${count} project${count === 1 ? "" : "s"} accessible as @${username}${identityDetail}`,
  };
}

async function testCodeberg(token: string, username: string): Promise<ForgeTestResult> {
  const url = "https://codeberg.org/api/v1/user/repos?limit=1&sort=updated&order=desc";

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    return {
      ok: false,
      message: "Request failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const body = await response.text();

  if (!response.ok) {
    let detail = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body);
      if (parsed.message) detail = parsed.message;
    } catch {}
    return { ok: false, status: response.status, message: `HTTP ${response.status}`, detail };
  }

  // Verify identity
  let identityDetail = "";
  try {
    const userRes = await fetch("https://codeberg.org/api/v1/user", {
      headers: { Authorization: `token ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (userRes.ok) {
      const userData = await userRes.json();
      const actualUsername: string = userData.login ?? "";
      if (actualUsername && actualUsername.toLowerCase() !== username.toLowerCase()) {
        identityDetail = ` (token belongs to @${actualUsername}, not @${username})`;
      }
    }
  } catch {}

  const totalHeader = response.headers.get("x-total") ?? response.headers.get("X-Total");
  const repos = JSON.parse(body);
  const count = totalHeader ? parseInt(totalHeader, 10) : repos.length;
  return {
    ok: true,
    status: response.status,
    message: `Connected — ${count} repo${count === 1 ? "" : "s"} accessible as @${username}${identityDetail}`,
  };
}

// POST /api/settings/test-forge
export async function POST(request: NextRequest) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(authData, "read:settings")) {
      return NextResponse.json(
        { error: "Forbidden - Missing permission: read:settings" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const forge: "github" | "gitlab" | "codeberg" = body.forge;

    if (!["github", "gitlab", "codeberg"].includes(forge)) {
      return NextResponse.json({ error: "Invalid forge" }, { status: 400 });
    }

    const settings = await prisma.setting.findUnique({ where: { key: "main" } });
    if (!settings) {
      return NextResponse.json<ForgeTestResult>({
        ok: false,
        message: "No settings found — save your configuration first",
      });
    }

    let result: ForgeTestResult;

    if (forge === "github") {
      if (!settings.githubToken || !settings.githubUsername) {
        return NextResponse.json<ForgeTestResult>({
          ok: false,
          message: "GitHub token and username are required",
        });
      }
      result = await testGitHub(settings.githubToken, settings.githubUsername);
    } else if (forge === "gitlab") {
      if (!settings.gitlabToken || !settings.gitlabUsername) {
        return NextResponse.json<ForgeTestResult>({
          ok: false,
          message: "GitLab token and username are required",
        });
      }
      result = await testGitLab(
        settings.gitlabToken,
        settings.gitlabUsername,
        settings.gitlabUrl || undefined
      );
    } else {
      if (!settings.codebergToken || !settings.codebergUsername) {
        return NextResponse.json<ForgeTestResult>({
          ok: false,
          message: "Codeberg token and username are required",
        });
      }
      result = await testCodeberg(settings.codebergToken, settings.codebergUsername);
    }

    return NextResponse.json<ForgeTestResult>(result);
  } catch (error) {
    console.error("Error testing forge connection:", error);
    return NextResponse.json(
      { error: "Failed to test connection" },
      { status: 500 }
    );
  }
}
