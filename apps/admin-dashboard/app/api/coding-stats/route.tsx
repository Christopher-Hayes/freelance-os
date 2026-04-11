import { ImageResponse } from "next/og";
import { getCachedCodingStats } from "@/lib/coding-stats";
import type { CodingStatsData, ForgeStats } from "@/lib/coding-stats";

export const runtime = "nodejs";

// Cache for 1 week, stale-while-revalidate for 1 day
export const revalidate = 604800;

// ──────────────────────────────────────────────────
// Theme tokens
// ──────────────────────────────────────────────────

interface Theme {
  cardBg: string;
  cardBorder: string;
  statBoxBg: string;
  statBoxBorder: string;
  titleColor: string;
  subtitleColor: string;
  statValueColor: string;
  statLabelColor: string;
  forgeUsernameColor: string;
  aiInsightColor: string;
  ossLabelColor: string;
  ossRepoColor: string;
  ossSummaryColor: string;
  forgeActivityLabelColor: string;
  forgeBarLabelColor: string;
  forgeBarPercentColor: string;
  githubForgeColor: string;
  githubIconFill: string;
  disabledBg: string;
  disabledBorder: string;
  disabledTextColor: string;
  disabledSubtextColor: string;
  errorTextColor: string;
}

const darkTheme: Theme = {
  cardBg: "#0F172A",
  cardBorder: "#1E293B",
  statBoxBg: "#0B1120",
  statBoxBorder: "#1E293B",
  titleColor: "#F1F5F9",
  subtitleColor: "#475569",
  statValueColor: "#E2E8F0",
  statLabelColor: "#64748B",
  forgeUsernameColor: "#94A3B8",
  aiInsightColor: "#94A3B8",
  ossLabelColor: "#475569",
  ossRepoColor: "#64748B",
  ossSummaryColor: "#94A3B8",
  forgeActivityLabelColor: "rgba(148, 163, 184, 0.85)",
  forgeBarLabelColor: "#94A3B8",
  forgeBarPercentColor: "#475569",
  githubForgeColor: "#E6EDF3",
  githubIconFill: "white",
  disabledBg: "#0F172A",
  disabledBorder: "#1E293B",
  disabledTextColor: "#64748B",
  disabledSubtextColor: "#334155",
  errorTextColor: "#64748B",
};

const lightTheme: Theme = {
  cardBg: "#FFFFFF",
  cardBorder: "#E2E8F0",
  statBoxBg: "#F8FAFC",
  statBoxBorder: "#E2E8F0",
  titleColor: "#0F172A",
  subtitleColor: "#94A3B8",
  statValueColor: "#0F172A",
  statLabelColor: "#94A3B8",
  forgeUsernameColor: "#475569",
  aiInsightColor: "#64748B",
  ossLabelColor: "#94A3B8",
  ossRepoColor: "#475569",
  ossSummaryColor: "#64748B",
  forgeActivityLabelColor: "rgba(71, 85, 105, 0.85)",
  forgeBarLabelColor: "#475569",
  forgeBarPercentColor: "#94A3B8",
  githubForgeColor: "#24292F",
  githubIconFill: "#24292F",
  disabledBg: "#FFFFFF",
  disabledBorder: "#E2E8F0",
  disabledTextColor: "#94A3B8",
  disabledSubtextColor: "#CBD5E1",
  errorTextColor: "#94A3B8",
};

// ──────────────────────────────────────────────────
// Forge icons (inline SVG paths for Satori compatibility)
// ──────────────────────────────────────────────────

function GitHubIcon({ size = 14, fill = "white" }: { size?: number; fill?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function GitLabIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#FC6D26"
    >
      <path d="M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 00-.867 0L16.418 9.45H7.582L4.918 1.263a.455.455 0 00-.867 0L1.386 9.452.044 13.587a.924.924 0 00.331 1.023L12 23.054l11.625-8.443a.92.92 0 00.33-1.024" />
    </svg>
  );
}

function CodebergIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 4.233 4.233">
      <path
        d="M42519.285-7078.79a.76.568 0 0 0-.738.675l33.586 125.888a87.182 87.182 0 0 0 39.381-33.763l-71.565-92.52a.76.568 0 0 0-.664-.28z"
        style={{
          fontVariationSettings: "normal",
          opacity: 1,
          vectorEffect: "none",
          fill: "url(#c)",
          fillOpacity: 1,
          stroke: "none",
          strokeWidth: 3.67846,
          strokeLinecap: "butt",
          strokeLinejoin: "miter",
          strokeMiterlimit: 2,
          strokeDasharray: "none",
          strokeDashoffset: 0,
          strokeOpacity: 1,
          paintOrder: "stroke markers fill",
          stopColor: "#000",
          stopOpacity: 1,
        }}
        transform="matrix(.02428 0 0 .02428 -1030.156 172.97)"
      />
      <path
        d="M11249.461-1883.696c-12.74 0-23.067 10.327-23.067 23.067 0 4.334 1.22 8.58 3.522 12.251l19.232-24.863c.138-.18.486-.18.624 0l19.233 24.864a23.068 23.068 0 0 0 3.523-12.252c0-12.74-10.327-23.067-23.067-23.067z"
        style={{
          opacity: 1,
          fill: "#2185d0",
          fillOpacity: 1,
          strokeWidth: 17.0055,
          paintOrder: "markers fill stroke",
          stopColor: "#000",
        }}
        transform="translate(-1030.156 172.97) scale(.09176)"
      />
    </svg>
  );
}

// ──────────────────────────────────────────────────
// Language colors (subset of GitHub linguist colors)
// ──────────────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178C6",
  JavaScript: "#F7DF1E",
  Python: "#3776AB",
  Rust: "#DEA584",
  Go: "#00ADD8",
  Java: "#B07219",
  "C#": "#239120",
  "C++": "#F34B7D",
  C: "#555555",
  Ruby: "#CC342D",
  PHP: "#4F5D95",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Scala: "#DC322F",
  Elixir: "#6E4A7E",
  Haskell: "#5E5086",
  Lua: "#000080",
  Shell: "#89E051",
  Nix: "#7E7EFF",
  HTML: "#E34C26",
  CSS: "#563D7C",
  SCSS: "#C6538C",
  Vue: "#41B883",
  Svelte: "#FF3E00",
  Zig: "#EC915C",
  OCaml: "#3BE133",
  Clojure: "#DB5855",
  Erlang: "#B83998",
};

function getLangColor(lang: string): string {
  return LANG_COLORS[lang] || "#8B8B8B";
}

// ──────────────────────────────────────────────────
// Card rendering
// ──────────────────────────────────────────────────

function ForgeIndicator({ forge, theme }: { forge: ForgeStats; theme: Theme }) {
  const icons = {
    github: <GitHubIcon size={12} fill={theme.githubIconFill} />,
    gitlab: <GitLabIcon size={12} />,
    codeberg: <CodebergIcon size={12} />,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "10px",
        color: theme.forgeUsernameColor,
      }}
    >
      {icons[forge.forge]}
      <span>{forge.username}</span>
    </div>
  );
}

function StatBox({
  label,
  value,
  theme,
}: {
  label: string;
  value: string | number;
  theme: Theme;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2px",
        flex: "1",
        padding: "6px 4px",
        border: `1px solid ${theme.statBoxBorder}`,
        borderRadius: "6px",
        backgroundColor: theme.statBoxBg,
      }}
    >
      <span
        style={{
          fontSize: "16px",
          fontWeight: 700,
          color: theme.statValueColor,
        }}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
      <span
        style={{
          fontSize: "8px",
          color: theme.statLabelColor,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function LanguageBar({
  languages,
}: {
  languages: Array<{ name: string; count: number; percentage: number }>;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        width: "100%",
      }}
    >
      {/* Bar */}
      <div
        style={{
          display: "flex",
          height: "8px",
          borderRadius: "4px",
          overflow: "hidden",
          width: "100%",
        }}
      >
        {languages.map((lang) => (
          <div
            key={lang.name}
            style={{
              width: `${lang.percentage}%`,
              backgroundColor: getLangColor(lang.name),
              minWidth: "3px",
            }}
          />
        ))}
      </div>
      {/* Labels */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        {languages.slice(0, 6).map((lang) => (
          <div
            key={lang.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "9px",
              color: "#94A3B8",
            }}
          >
            <div
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: getLangColor(lang.name),
              }}
            />
            <span>{lang.name}</span>
            <span style={{ color: "#475569" }}>
              {lang.percentage.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ForgeSplitBar({ forges, theme }: { forges: ForgeStats[]; theme: Theme }) {
  const totalCommits = forges.reduce((sum, f) => sum + f.commits30d, 0);
  if (totalCommits === 0) return null;

  const FORGE_COLORS: Record<string, string> = {
    github: theme.githubForgeColor,
    gitlab: "#FC6D26",
    codeberg: "#2185D0",
  };

  const FORGE_LABELS: Record<string, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    codeberg: "Codeberg",
  };

  const forgesWithData = forges
    .filter((f) => f.commits30d > 0)
    .map((f) => ({
      ...f,
      percentage: (f.commits30d / totalCommits) * 100,
    }));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "5px",
        width: "100%",
      }}
    >
      <span
        style={{
          fontSize: "9px",
          color: theme.forgeActivityLabelColor,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        Forge Activity (30d)
      </span>
      {/* Bar */}
      <div
        style={{
          display: "flex",
          height: "6px",
          borderRadius: "3px",
          overflow: "hidden",
          width: "100%",
        }}
      >
        {forgesWithData.map((f) => (
          <div
            key={f.forge}
            style={{
              width: `${f.percentage}%`,
              backgroundColor: FORGE_COLORS[f.forge] || "#8B8B8B",
              minWidth: "3px",
            }}
          />
        ))}
      </div>
      {/* Labels */}
      <div
        style={{
          display: "flex",
          gap: "12px",
        }}
      >
        {forgesWithData.map((f) => (
          <div
            key={f.forge}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "9px",
              color: theme.forgeBarLabelColor,
            }}
          >
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: FORGE_COLORS[f.forge] || "#8B8B8B",
              }}
            />
            <span>{FORGE_LABELS[f.forge]}</span>
            <span style={{ color: theme.forgeBarPercentColor }}>
              {f.commits30d} ({f.percentage.toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsCard({ data, theme }: { data: CodingStatsData; theme: Theme }) {
  // Prepare languages
  const totalLangCount = Object.values(data.mergedLanguages).reduce(
    (sum, c) => sum + c,
    0
  );
  const sortedLangs = Object.entries(data.mergedLanguages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);
  const topLangs = sortedLangs.map(([name, count]) => ({
    name,
    count,
    percentage: totalLangCount > 0 ? (count / totalLangCount) * 100 : 0,
  }));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "600px",
        height: "320px",
        backgroundColor: theme.cardBg,
        borderRadius: "12px",
        border: `1px solid ${theme.cardBorder}`,
        padding: "20px 24px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "14px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <span
            style={{
              fontSize: "15px",
              fontWeight: 700,
              color: theme.titleColor,
              letterSpacing: "-0.3px",
            }}
          >
            {data.freelancerName}
          </span>
          <span
            style={{
              fontSize: "10px",
              color: theme.subtitleColor,
            }}
          >
            Coding Stats • updated weekly
          </span>
        </div>

        {/* Forge indicators */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
          }}
        >
          {data.forges.map((forge) => (
            <ForgeIndicator key={forge.forge} forge={forge} theme={theme} />
          ))}
        </div>
      </div>

      {/* Main stats grid */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          marginBottom: "12px",
        }}
      >
        {/* Stats row 1 */}
        <div
          style={{
            display: "flex",
            gap: "6px",
          }}
        >
          <StatBox label="Commits (7d)" value={data.totalCommits7d} theme={theme} />
          <StatBox label="This month" value={data.totalCommits30d} theme={theme} />
          <StatBox label="Stars" value={data.totalStars} theme={theme} />
          <StatBox label="PRs" value={data.totalPRs} theme={theme} />
        </div>

        {/* Stats row 2 */}
        <div
          style={{
            display: "flex",
            gap: "6px",
          }}
        >
          <StatBox label="Repos" value={data.totalRepos} theme={theme} />
          <StatBox label="Issues" value={data.totalIssues} theme={theme} />
          <StatBox
            label="Editor (7d)"
            value={`${data.weeklyHoursCoded}h`}
            theme={theme}
          />
          <StatBox label="Projects" value={data.activeProjectCount} theme={theme} />
        </div>
      </div>

      {/* Language breakdown */}
      {topLangs.length > 0 && (
        <div style={{ marginBottom: "10px", display: "flex", flexDirection: "column" }}>
          <LanguageBar languages={topLangs} />
        </div>
      )}

      {/* Forge split bar */}
      {data.forges.length > 1 && (
        <div style={{ marginBottom: "10px", display: "flex", flexDirection: "column" }}>
          <ForgeSplitBar forges={data.forges} theme={theme} />
        </div>
      )}

      {/* Bottom section: AI insight + OSS contribution */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "5px",
          marginTop: "2px",
        }}
      >
        {/* AI Insight */}
        <div
          style={{
            fontSize: "10px",
            color: theme.aiInsightColor,
            fontStyle: "italic",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "1px",
              backgroundColor: "#8B5CF6",
              transform: "rotate(45deg)",
              flexShrink: 0,
            }}
          />
          <span>{data.aiInsight}</span>
        </div>

        {/* Recent OSS contribution */}
        {data.recentOSSContribution && (
          <div
            style={{
              fontSize: "9px",
              color: theme.ossLabelColor,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: "#22C55E",
                flexShrink: 0,
              }}
            />
            <span>
              Recent open-source contribution:{" "}
              <span style={{ color: theme.ossRepoColor, marginLeft: "3px" }}>
                {data.recentOSSContribution.repo}
              </span>
              {data.recentOSSContribution.summary && (
                <span style={{ color: theme.ossSummaryColor }}>
                  {" "}— {data.recentOSSContribution.summary}
                </span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Disabled placeholder card
// ──────────────────────────────────────────────────

function DisabledCard({ theme }: { theme: Theme }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "600px",
        height: "320px",
        backgroundColor: theme.disabledBg,
        borderRadius: "12px",
        border: `1px solid ${theme.disabledBorder}`,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <span style={{ fontSize: "14px", color: theme.disabledTextColor }}>
        Coding Stats card is not enabled
      </span>
      <span style={{ fontSize: "11px", color: theme.disabledSubtextColor, marginTop: "8px" }}>
        Enable it in Settings → Integrations
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────
// Route handler
// ──────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const themeParam = searchParams.get("theme");
  const theme = themeParam === "light" ? lightTheme : darkTheme;

  try {
    const stats = await getCachedCodingStats();

    if (!stats) {
      return new ImageResponse(<DisabledCard theme={theme} />, {
        width: 600,
        height: 320,
        headers: {
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    return new ImageResponse(<StatsCard data={stats} theme={theme} />, {
      width: 600,
      height: 320,
      headers: {
        "Cache-Control": "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[CodingStats] Image generation error:", error);

    return new ImageResponse(
      <div
        style={{
          display: "flex",
          width: "600px",
          height: "320px",
          backgroundColor: theme.cardBg,
          borderRadius: "12px",
          border: `1px solid ${theme.cardBorder}`,
          justifyContent: "center",
          alignItems: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <span style={{ fontSize: "14px", color: theme.errorTextColor }}>
          Unable to generate stats card
        </span>
      </div>,
      {
        width: 600,
        height: 320,
      }
    );
  }
}
