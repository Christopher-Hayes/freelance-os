"use server";

import { prisma } from "@freelance-os/database";
import { generateText, Output } from "ai";
import { z } from "zod";
import { Temporal } from "@/lib/temporal-polyfill";
import { getAiModel, getFastAiModel, isAiConfigured } from "@/lib/ai-provider";
import { searchEmailsByKeyword } from "@/lib/jmap-provider";
import { searchEventsByDateRange, isWebdavEnabled } from "@/lib/webdav-provider";
import { PROVIDER_OPTIONS_FAST } from "@/lib/ai-actions/shared";

export interface SuggestedHighlight {
  date: string; // YYYY-MM-DD
  label: string;
  emoji: string; // Suggested emoji icon
  reason: string; // Why the AI suggested this
}

/**
 * Use AI to suggest project highlights based on emails, calendar events,
 * time entries, and other available signals.
 */
export async function suggestProjectHighlights(
  projectId: number
): Promise<{ suggestions: SuggestedHighlight[]; error?: string }> {
  try {
    if (!(await isAiConfigured())) {
      return { suggestions: [], error: "AI is not configured. Please add an API key in Settings." };
    }

    // Fetch the project with its client and existing highlights
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: { select: { name: true, email: true, company: true } },
        highlights: { select: { date: true, label: true } },
        timeEntries: {
          orderBy: { startTime: "asc" },
          select: { startTime: true, endTime: true, durationMinutes: true, description: true },
        },
      },
    });

    if (!project) {
      return { suggestions: [], error: "Project not found" };
    }

    // Determine the time range to search
    const firstEntry = project.timeEntries[0];
    const lastEntry = project.timeEntries[project.timeEntries.length - 1];

    const startDate = project.startDate
      ?? firstEntry?.startTime
      ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // fallback: 1 year ago

    const endDate = project.endDate
      ?? lastEntry?.endTime
      ?? new Date();

    const startInstant = Temporal.Instant.from(startDate.toISOString());
    const endInstant = Temporal.Instant.from(endDate.toISOString());

    // ── Gather context from integrations ──

    const settings = await prisma.setting.findUnique({ where: { key: "main" } });
    const contextSections: string[] = [];

    // Search emails for project-related communications
    if (settings?.jmapToken && settings?.canReadMailbox) {
      try {
        // Search using project name and client name as keywords
        const searchTerms = [project.name, project.client.name];
        if (project.client.company) searchTerms.push(project.client.company);

        const allEmails: { date: string; from: string; subject: string; preview: string }[] = [];
        for (const term of searchTerms) {
          const emails = await searchEmailsByKeyword(term, startInstant, endInstant, 15);
          for (const e of emails) {
            allEmails.push({
              date: e.date.toISOString().split("T")[0]!,
              from: e.from,
              subject: e.subject,
              preview: e.preview.substring(0, 120),
            });
          }
        }

        // Deduplicate by subject+date
        const seen = new Set<string>();
        const uniqueEmails = allEmails.filter((e) => {
          const key = `${e.date}:${e.subject}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (uniqueEmails.length > 0) {
          contextSections.push(
            `RELATED EMAILS (${uniqueEmails.length}):\n` +
              uniqueEmails
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((e) => `  ${e.date} | From: ${e.from} | Subject: ${e.subject}`)
                .join("\n")
          );
        }
      } catch (e) {
        console.warn("Could not search emails for highlights:", e);
      }
    }

    // Search calendar events
    if (settings?.canReadCalendar && await isWebdavEnabled()) {
      try {
        const events = await searchEventsByDateRange(startInstant, endInstant);

        // Filter events related to this project or client
        const lowerProject = project.name.toLowerCase();
        const lowerClient = project.client.name.toLowerCase();
        const lowerCompany = project.client.company?.toLowerCase();

        const relevantEvents = events.filter((e) => {
          const text = `${e.summary} ${e.description || ""} ${e.attendees.join(" ")}`.toLowerCase();
          return (
            text.includes(lowerProject) ||
            text.includes(lowerClient) ||
            (lowerCompany && text.includes(lowerCompany))
          );
        });

        if (relevantEvents.length > 0) {
          contextSections.push(
            `RELATED CALENDAR EVENTS (${relevantEvents.length}):\n` +
              relevantEvents
                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                .map(
                  (e) =>
                    `  ${e.startTime.split("T")[0]} | ${e.summary}${e.attendees.length > 0 ? ` (${e.attendees.length} attendees)` : ""}`
                )
                .join("\n")
          );
        }
      } catch (e) {
        console.warn("Could not search calendar events for highlights:", e);
      }
    }

    // Build time entry summary
    const timeEntrySummary = buildTimeEntrySummary(project.timeEntries);

    // Build existing highlights list so AI avoids duplicates
    const existingHighlights = project.highlights
      .map((h: { date: Date; label: string }) => `- ${h.date.toISOString().split("T")[0]}: ${h.label}`)
      .join("\n");

    const aiModel = await getAiModel();

    const highlightsSchema = z.object({
      suggestions: z.array(
        z.object({
          date: z.string().describe("Date in YYYY-MM-DD format"),
          label: z
            .string()
            .max(100)
            .describe("Short label, 2-5 words describing the significance of this date"),
          emoji: z
            .string()
            .describe("A single emoji that best represents this highlight (e.g. 🚀 for launch, 🎉 for celebration, 🏁 for completion, 👋 for kickoff, 🔧 for technical work, 💡 for idea/pivot, 📅 for scheduled milestone, ⚠️ for issue/blocker)"),
          reason: z
            .string()
            .max(200)
            .describe("Brief explanation of why this date is significant"),
        })
      ),
    });

    const result = await generateText({
      model: aiModel,
      output: Output.object({ schema: highlightsSchema }),
      prompt: `You are analyzing a freelance project to identify significant dates ("highlights") that would be useful to annotate on project timeline charts.

PROJECT DETAILS:
- Name: ${project.name}
- Client: ${project.client.name}${project.client.company ? ` (${project.client.company})` : ""}
- Client email: ${project.client.email}
- Status: ${project.status}
- Date range: ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}
${project.clientDescription ? `- Description: ${project.clientDescription}` : ""}
${project.privateNotes ? `- Notes: ${project.privateNotes}` : ""}

TIME ENTRY PATTERNS:
${timeEntrySummary}

${contextSections.length > 0 ? contextSections.join("\n\n") + "\n" : ""}
${existingHighlights ? `EXISTING HIGHLIGHTS (do NOT duplicate these):\n${existingHighlights}\n` : ""}

INSTRUCTIONS:
Identify up to 5 significant dates during this project. Look for:
- Project kickoff / first day of work
- Launch dates, soft launches, go-live dates
- Major milestones or pivots (mentioned in emails, calendar events, or descriptions)
- Periods where work intensity changed dramatically (big gaps, sudden increases)
- Important meetings or decisions
- Project completion / final delivery

Each label should be 2-5 words, like: "Project kickoff", "Initial launch", "Dropped WebGL approach", "Client review meeting"
Also pick a fitting single emoji for each highlight.
Only suggest dates that fall within the project date range.
Do NOT suggest highlights that already exist.

Return your suggestions ordered by date.`,
    });

    return { suggestions: result.output.suggestions };
  } catch (error) {
    console.error("Error suggesting project highlights:", error);
    return {
      suggestions: [],
      error: error instanceof Error ? error.message : "Failed to suggest highlights",
    };
  }
}

/**
 * Build a concise summary of time entry patterns for the AI to analyze.
 */
function buildTimeEntrySummary(
  timeEntries: { startTime: Date; endTime: Date; durationMinutes: number; description: string | null }[]
): string {
  if (timeEntries.length === 0) return "No time entries recorded.";

  // Group by week
  const weeklyBuckets = new Map<string, { totalMinutes: number; descriptions: string[]; entryCount: number }>();

  for (const entry of timeEntries) {
    const date = Temporal.PlainDate.from(entry.startTime.toISOString().split("T")[0]!);
    // Get the Monday of this week
    const dayOfWeek = date.dayOfWeek; // 1=Monday, 7=Sunday
    const monday = date.subtract({ days: dayOfWeek - 1 });
    const weekKey = monday.toString();

    const bucket = weeklyBuckets.get(weekKey) ?? { totalMinutes: 0, descriptions: [], entryCount: 0 };
    bucket.totalMinutes += entry.durationMinutes;
    bucket.entryCount += 1;
    if (entry.description && bucket.descriptions.length < 3) {
      bucket.descriptions.push(entry.description);
    }
    weeklyBuckets.set(weekKey, bucket);
  }

  // Build summary string
  const lines: string[] = [];
  const sortedWeeks = Array.from(weeklyBuckets.entries()).sort(([a], [b]) => a.localeCompare(b));

  let prevWeek: string | null = null;
  for (const [weekStart, data] of sortedWeeks) {
    // Detect gaps
    if (prevWeek) {
      const prev = Temporal.PlainDate.from(prevWeek);
      const curr = Temporal.PlainDate.from(weekStart);
      const daysBetween = prev.until(curr).days;
      if (daysBetween > 14) {
        lines.push(`  [${Math.round(daysBetween / 7)} week gap]`);
      }
    }

    const hours = (data.totalMinutes / 60).toFixed(1);
    const descSnippet = data.descriptions.length > 0
      ? ` — ${data.descriptions.slice(0, 2).join("; ")}`
      : "";
    lines.push(`  Week of ${weekStart}: ${hours}h (${data.entryCount} entries)${descSnippet}`);
    prevWeek = weekStart;
  }

  return lines.join("\n");
}

/**
 * Use AI to suggest a single emoji for a highlight label.
 */
export async function suggestEmojiForHighlight(
  label: string,
  currentEmoji?: string
): Promise<{ emoji: string; error?: string }> {
  try {
    if (!(await isAiConfigured())) {
      return { emoji: "", error: "AI is not configured." };
    }

    const model = await getFastAiModel();
    const result = await generateText({
      model,
      providerOptions: PROVIDER_OPTIONS_FAST,
      output: Output.object({
        schema: z.object({
          emoji: z.string().describe("A single emoji character that best represents this project milestone or highlight"),
        }),
      }),
      prompt: `Pick a single emoji that best represents this project milestone or highlight label: "${label}"`
        + (currentEmoji ? ` Do not use this emoji: ${currentEmoji}` : ""),
    });

    const emoji = result.output.emoji?.trim() ?? "";
    if (!emoji) {
      return { emoji: "", error: "AI returned no emoji" };
    }

    return { emoji };
  } catch (err) {
    console.error("suggestEmojiForHighlight error:", err);
    return { emoji: "", error: err instanceof Error ? err.message : "Failed to suggest emoji" };
  }
}
