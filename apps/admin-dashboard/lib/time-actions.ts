"use server";

import { prisma } from "@freelance-os/database";
import { Temporal } from "@js-temporal/polyfill";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { getAiModel, isAiConfigured } from "@/lib/ai-provider";

/**
 * Merge two time entries into one
 */
export async function mergeTimeEntries(entryId1: number, entryId2: number) {
  // Fetch both entries
  const [entry1, entry2] = await Promise.all([
    prisma.timeEntry.findUnique({ where: { id: entryId1 } }),
    prisma.timeEntry.findUnique({ where: { id: entryId2 } }),
  ]);

  if (!entry1 || !entry2) {
    throw new Error('One or both entries not found');
  }

  // Verify they're for the same project
  if (entry1.projectId !== entry2.projectId) {
    throw new Error('Entries must be for the same project');
  }

  // Determine which is earlier
  const earlier = entry1.startTime < entry2.startTime ? entry1 : entry2;
  const later = entry1.startTime < entry2.startTime ? entry2 : entry1;

  // Merge descriptions using AI if both have descriptions
  let mergedDescription = earlier.description || later.description || null;
  
  if (earlier.description && later.description && (await isAiConfigured())) {
    try {
      const aiModel = await getAiModel();
      const { text } = await generateText({
        model: aiModel,
        prompt: `Merge these two work descriptions into a single concise description (max 100 characters):

Description 1: ${earlier.description}
Description 2: ${later.description}

Return only the merged description, nothing else.`,
      });
      mergedDescription = text.trim().substring(0, 200);
    } catch (error) {
      console.error("Error merging descriptions with AI:", error);
      // Fallback to simple concatenation
      mergedDescription = `${earlier.description} / ${later.description}`;
    }
  }

  // Calculate new duration
  const durationMs = later.endTime.getTime() - earlier.startTime.getTime();
  const durationMinutes = Math.round(durationMs / (1000 * 60));

  // Update the earlier entry with merged data
  const updatedEntry = await prisma.timeEntry.update({
    where: { id: earlier.id },
    data: {
      endTime: later.endTime,
      durationMinutes,
      description: mergedDescription,
      billable: earlier.billable || later.billable, // Keep billable if either was billable
    },
    include: {
      project: {
        include: {
          client: true,
        },
      },
    },
  });

  // Delete the later entry
  await prisma.timeEntry.delete({
    where: { id: later.id },
  });

  return {
    entry: updatedEntry,
    deletedId: later.id,
  };
}

// ─── Import RescueTime Project Times from Archive ──────────────────────────

/**
 * Check if RescueTime archive data exists for a given date.
 */
export async function hasRescueTimeArchiveData(date: string): Promise<{ hasData: boolean; entryCount: number }> {
  const count = await prisma.rescueTimeProjectTime.count({
    where: { date },
  });
  return { hasData: count > 0, entryCount: count };
}

/**
 * Import project time entries from stored RescueTime archive data for a given date.
 * Uses AI to map RescueTime projects to local projects.
 * Returns info about imported entries and any unmatched RT projects.
 */
export async function importRescueTimeProjectTimes(date: string) {
  if (!date) {
    throw new Error("Date parameter is required (YYYY-MM-DD)");
  }

  if (!(await isAiConfigured())) {
    throw new Error("AI is not configured. Project mapping requires AI to match RescueTime projects to your local projects. Please configure an AI provider in Settings.");
  }

  // Check for existing time entries on this date to avoid duplicates
  const plainDate = Temporal.PlainDate.from(date);
  const localTz = Temporal.Now.timeZoneId();
  const dayStart = new Date(plainDate.toZonedDateTime(localTz).toInstant().epochMilliseconds);
  const dayEnd = new Date(
    plainDate.toZonedDateTime({ timeZone: localTz, plainTime: Temporal.PlainTime.from('23:59:59.999') }).toInstant().epochMilliseconds
  );

  const existingCount = await prisma.timeEntry.count({
    where: {
      startTime: { gte: dayStart, lte: dayEnd },
    },
  });

  if (existingCount > 0) {
    throw new Error(
      `Already have ${existingCount} time ${existingCount === 1 ? "entry" : "entries"} for this date. Clear existing entries first if you want to re-import.`
    );
  }

  // Fetch archived project times for this date
  const archiveTimes = await prisma.rescueTimeProjectTime.findMany({
    where: { date },
    include: { project: true },
  });

  if (archiveTimes.length === 0) {
    return {
      status: "no_archive_data" as const,
      message: "No RescueTime archive data for this date. Upload your Project History archive in Settings → RescueTime Integration.",
      entriesImported: 0,
      unmatchedProjects: [],
    };
  }

  // Get unique RT projects referenced in the time entries
  const usedRtProjects = new Map<number, string>();
  for (const t of archiveTimes) {
    if (!usedRtProjects.has(t.rtProjectId)) {
      usedRtProjects.set(t.rtProjectId, t.project.name);
    }
  }

  // Fetch our local projects
  const localProjects = await prisma.project.findMany({
    where: { status: "active" },
    include: { client: { select: { name: true } } },
  });

  if (localProjects.length === 0) {
    throw new Error("No active projects found. Please create projects before importing time entries.");
  }

  // ── Step 1: Resolve linked projects directly ────────────────────────────
  // Any RT project that has an explicit link to an app project uses that
  // mapping without touching AI. Only unlinked RT projects need AI matching.

  const directMapping = new Map<number, number>(); // rtProjectId → localProjectId
  const unlinkedRtProjectIds: number[] = [];

  for (const [rtId] of usedRtProjects) {
    const linkedProject = localProjects.find((p) => p.linkedRtProjectId === rtId);
    if (linkedProject) {
      directMapping.set(rtId, linkedProject.id);
    } else {
      unlinkedRtProjectIds.push(rtId);
    }
  }

  // ── Step 2: AI mapping only for unlinked RT projects ───────────────────

  // Build the final mapping combining direct + AI matches
  const projectMapping = new Map<number, number>(directMapping);
  const unmatchedProjects: { rtId: number; rtName: string; reason: string }[] = [];
  const lowConfidenceMatches: { rtName: string; localName: string; reason: string }[] = [];

  if (unlinkedRtProjectIds.length > 0) {
    if (!(await isAiConfigured())) {
      // If AI is not configured, unlinked projects simply go unmatched
      for (const rtId of unlinkedRtProjectIds) {
        unmatchedProjects.push({
          rtId,
          rtName: usedRtProjects.get(rtId) || `RT #${rtId}`,
          reason: "No link configured and AI is not available for matching.",
        });
      }
    } else {
      const aiModel = await getAiModel();

      const localProjectsList = localProjects.map((p) => ({
        id: p.id,
        name: p.name,
        client: p.client.name,
        notes: p.privateNotes || undefined,
      }));

      const rtProjectsList = unlinkedRtProjectIds.map((id) => ({
        id,
        name: usedRtProjects.get(id) || `RT #${id}`,
      }));

      const mappingSchema = z.object({
        mappings: z.array(
          z.object({
            rescuetimeProjectId: z.number().describe("RescueTime project ID"),
            localProjectId: z.number().nullable().describe("Local project ID, or null if no match"),
            confidence: z.enum(["high", "medium", "low"]).describe("Confidence in the match"),
            reason: z.string().describe("Brief reason for the match or why no match was found"),
          })
        ),
      });

      const { object: aiMapping } = await generateObject({
        model: aiModel,
        schema: mappingSchema,
        prompt: `You are mapping RescueTime project names to local Freelance-OS projects.

RescueTime projects (from timesheet):
${JSON.stringify(rtProjectsList, null, 2)}

Local Freelance-OS projects:
${JSON.stringify(localProjectsList, null, 2)}

For each RescueTime project, find the best matching local project based on name similarity, client context, and project notes. If no good match exists, set localProjectId to null.

Only match with "high" or "medium" confidence when the names clearly refer to the same project. Use "low" for uncertain matches - these will still be imported but the user will be informed. Set localProjectId to null if you truly cannot find any reasonable match.`,
      });

      for (const m of aiMapping.mappings) {
        const rtName = usedRtProjects.get(m.rescuetimeProjectId) || `RT #${m.rescuetimeProjectId}`;
        if (m.localProjectId !== null) {
          projectMapping.set(m.rescuetimeProjectId, m.localProjectId);
          if (m.confidence === "low") {
            const localProject = localProjects.find((p) => p.id === m.localProjectId);
            lowConfidenceMatches.push({
              rtName,
              localName: localProject?.name || `#${m.localProjectId}`,
              reason: m.reason,
            });
          }
        } else {
          unmatchedProjects.push({
            rtId: m.rescuetimeProjectId,
            rtName,
            reason: m.reason,
          });
        }
      }
    }
  }

  // Create time entries for matched projects
  const entriesToCreate: {
    projectId: number;
    description: string | null;
    startTime: Date;
    endTime: Date;
    durationMinutes: number;
    billable: boolean;
  }[] = [];

  const skippedUnmatched: string[] = [];

  for (const rtTime of archiveTimes) {
    const localProjectId = projectMapping.get(rtTime.rtProjectId);
    if (!localProjectId) {
      const rtName = usedRtProjects.get(rtTime.rtProjectId) || `RT #${rtTime.rtProjectId}`;
      if (!skippedUnmatched.includes(rtName)) {
        skippedUnmatched.push(rtName);
      }
      continue;
    }

    const durationMinutes = Math.max(1, Math.round(rtTime.durationSeconds / 60));
    const localProject = localProjects.find((p) => p.id === localProjectId);

    entriesToCreate.push({
      projectId: localProjectId,
      description: rtTime.comment || null,
      startTime: rtTime.startTime,
      endTime: rtTime.endTime,
      durationMinutes,
      billable: localProject?.billable ?? true,
    });
  }

  if (entriesToCreate.length === 0) {
    return {
      status: "imported" as const,
      message: "No RescueTime project times could be matched to local projects",
      entriesImported: 0,
      unmatchedProjects: unmatchedProjects.map((u) => u.rtName),
    };
  }

  // Bulk insert
  await prisma.timeEntry.createMany({
    data: entriesToCreate,
  });

  console.log(
    `Imported ${entriesToCreate.length} time entries from RescueTime archive for ${date}. ` +
      `${unmatchedProjects.length} projects unmatched, ${lowConfidenceMatches.length} low-confidence.`
  );

  // Build result message
  const parts: string[] = [
    `Imported ${entriesToCreate.length} time ${entriesToCreate.length === 1 ? "entry" : "entries"} from RescueTime`,
  ];

  if (directMapping.size > 0) {
    parts.push(
      `${directMapping.size} ${directMapping.size === 1 ? "project" : "projects"} matched via direct link`
    );
  }

  if (lowConfidenceMatches.length > 0) {
    parts.push(
      `${lowConfidenceMatches.length} low-confidence ${lowConfidenceMatches.length === 1 ? "match" : "matches"}: ${lowConfidenceMatches.map((m) => `"${m.rtName}" → "${m.localName}"`).join(", ")}`
    );
  }

  if (unmatchedProjects.length > 0) {
    parts.push(
      `${unmatchedProjects.length} skipped (no match): ${unmatchedProjects.map((u) => `"${u.rtName}"`).join(", ")}`
    );
  }

  return {
    status: "imported" as const,
    message: parts.join(". "),
    entriesImported: entriesToCreate.length,
    unmatchedProjects: unmatchedProjects.map((u) => u.rtName),
    lowConfidenceMatches: lowConfidenceMatches.map((m) => ({
      rtName: m.rtName,
      localName: m.localName,
    })),
  };
}

// ─── Merge RescueTime Project Entries ──────────────────────────────────────

/**
 * Merge RescueTime project time entries into existing time entries for a date.
 * Uses AI to map RT projects to local projects AND deduplicate against existing entries.
 */
export async function mergeRescueTimeProjectEntries(date: string) {
  if (!date) {
    throw new Error("Date parameter is required (YYYY-MM-DD)");
  }

  if (!(await isAiConfigured())) {
    throw new Error(
      "AI is not configured. Merging requires AI to match projects and deduplicate entries. Please configure an AI provider in Settings."
    );
  }

  // Fetch archived project times for this date
  const archiveTimes = await prisma.rescueTimeProjectTime.findMany({
    where: { date },
    include: { project: true },
  });

  if (archiveTimes.length === 0) {
    return {
      status: "no_archive_data" as const,
      message:
        "No RescueTime archive data for this date. Upload your Project History archive in Settings → RescueTime Integration.",
      entriesMerged: 0,
      unmatchedProjects: [] as string[],
    };
  }

  // Fetch existing time entries for the day
  const [year, month, day] = date.split("-").map(Number);
  const dayStart = new Date(Date.UTC(year!, month! - 1, day!, 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(year!, month! - 1, day!, 23, 59, 59, 999));

  const existingEntries = await prisma.timeEntry.findMany({
    where: {
      startTime: { gte: dayStart, lte: dayEnd },
    },
    include: {
      project: { include: { client: { select: { name: true } } } },
    },
    orderBy: { startTime: "asc" },
  });

  // Get unique RT projects
  const usedRtProjects = new Map<number, string>();
  for (const t of archiveTimes) {
    if (!usedRtProjects.has(t.rtProjectId)) {
      usedRtProjects.set(t.rtProjectId, t.project.name);
    }
  }

  // Fetch local projects
  const localProjects = await prisma.project.findMany({
    where: { status: "active" },
    include: { client: { select: { name: true } } },
  });

  if (localProjects.length === 0) {
    throw new Error(
      "No active projects found. Please create projects before merging time entries."
    );
  }

  // ── Step 1: Resolve linked projects directly ──────────────────────────
  const directMapping = new Map<number, number>();
  const unlinkedRtProjectIds: number[] = [];

  for (const [rtId] of usedRtProjects) {
    const linkedProject = localProjects.find((p) => p.linkedRtProjectId === rtId);
    if (linkedProject) {
      directMapping.set(rtId, linkedProject.id);
    } else {
      unlinkedRtProjectIds.push(rtId);
    }
  }

  // ── Step 2: AI mapping for unlinked RT projects ───────────────────────
  const projectMapping = new Map<number, number>(directMapping);
  const unmatchedProjects: { rtId: number; rtName: string; reason: string }[] = [];

  if (unlinkedRtProjectIds.length > 0) {
    const aiModel = await getAiModel();

    const localProjectsList = localProjects.map((p) => ({
      id: p.id,
      name: p.name,
      client: p.client.name,
      notes: p.privateNotes || undefined,
    }));

    const rtProjectsList = unlinkedRtProjectIds.map((id) => ({
      id,
      name: usedRtProjects.get(id) || `RT #${id}`,
    }));

    const mappingSchema = z.object({
      mappings: z.array(
        z.object({
          rescuetimeProjectId: z.number(),
          localProjectId: z.number().nullable(),
          confidence: z.enum(["high", "medium", "low"]),
          reason: z.string(),
        })
      ),
    });

    const { object: aiMapping } = await generateObject({
      model: aiModel,
      schema: mappingSchema,
      prompt: `You are mapping RescueTime project names to local Freelance-OS projects.

RescueTime projects:
${JSON.stringify(rtProjectsList, null, 2)}

Local Freelance-OS projects:
${JSON.stringify(localProjectsList, null, 2)}

For each RescueTime project, find the best matching local project. Set localProjectId to null if no match.`,
    });

    for (const m of aiMapping.mappings) {
      const rtName =
        usedRtProjects.get(m.rescuetimeProjectId) || `RT #${m.rescuetimeProjectId}`;
      if (m.localProjectId !== null) {
        projectMapping.set(m.rescuetimeProjectId, m.localProjectId);
      } else {
        unmatchedProjects.push({ rtId: m.rescuetimeProjectId, rtName, reason: m.reason });
      }
    }
  }

  // ── Step 3: Build candidate entries from RT data ──────────────────────
  const candidates: {
    idx: number;
    projectId: number;
    projectName: string;
    description: string | null;
    startTime: Date;
    endTime: Date;
    durationMinutes: number;
    billable: boolean;
  }[] = [];

  const skippedUnmatched: string[] = [];

  for (let i = 0; i < archiveTimes.length; i++) {
    const rtTime = archiveTimes[i]!;
    const localProjectId = projectMapping.get(rtTime.rtProjectId);
    if (!localProjectId) {
      const rtName = usedRtProjects.get(rtTime.rtProjectId) || `RT #${rtTime.rtProjectId}`;
      if (!skippedUnmatched.includes(rtName)) {
        skippedUnmatched.push(rtName);
      }
      continue;
    }

    const durationMinutes = Math.max(1, Math.round(rtTime.durationSeconds / 60));
    const localProject = localProjects.find((p) => p.id === localProjectId);

    candidates.push({
      idx: i,
      projectId: localProjectId,
      projectName: localProject?.name || `#${localProjectId}`,
      description: rtTime.comment || null,
      startTime: rtTime.startTime,
      endTime: rtTime.endTime,
      durationMinutes,
      billable: localProject?.billable ?? true,
    });
  }

  if (candidates.length === 0) {
    return {
      status: "merged" as const,
      message: "No RescueTime project times could be matched to local projects",
      entriesMerged: 0,
      unmatchedProjects: unmatchedProjects.map((u) => u.rtName),
    };
  }

  // ── Step 4: AI deduplication against existing entries ─────────────────
  const existingSummary = existingEntries.map((e) => ({
    id: e.id,
    project: e.project.name,
    desc: e.description,
    start: e.startTime.toISOString(),
    end: e.endTime.toISOString(),
    dur: e.durationMinutes,
  }));

  const candidateSummary = candidates.map((c) => ({
    idx: c.idx,
    project: c.projectName,
    desc: c.description,
    start: c.startTime.toISOString(),
    end: c.endTime.toISOString(),
    dur: c.durationMinutes,
  }));

  const aiModel = await getAiModel();

  const mergeSchema = z.object({
    entriesToAdd: z
      .array(z.number())
      .describe(
        "Array of candidate indices (idx) that should be ADDED because they represent genuinely new work not covered by existing entries"
      ),
    reasoning: z.string().describe("Brief summary of the merge decision"),
  });

  const { object: mergeDecision } = await generateObject({
    model: aiModel,
    schema: mergeSchema,
    prompt: `You are merging RescueTime project time entries into existing time entries for ${date}.

EXISTING time entries (${existingEntries.length} total):
${JSON.stringify(existingSummary, null, 2)}

CANDIDATE entries from RescueTime (${candidates.length} total):
${JSON.stringify(candidateSummary, null, 2)}

Rules:
- A candidate is a DUPLICATE if an existing entry covers the same project during roughly the same time window (within ~15 minutes).
- A candidate is NEW if it represents work on a time/project combination not already in existing entries.
- When in doubt, include the entry (better to have slightly extra data than miss billable work).
- Return the "idx" values of candidates that should be added.`,
  });

  const indicesToAdd = new Set(mergeDecision.entriesToAdd);
  const entriesToInsert = candidates
    .filter((c) => indicesToAdd.has(c.idx))
    .map(({ idx: _idx, projectName: _pn, ...entry }) => entry);

  if (entriesToInsert.length === 0) {
    return {
      status: "merged" as const,
      message: `All ${candidates.length} RescueTime entries already covered by existing data. Nothing to merge.`,
      entriesMerged: 0,
      unmatchedProjects: unmatchedProjects.map((u) => u.rtName),
      reasoning: mergeDecision.reasoning,
    };
  }

  await prisma.timeEntry.createMany({
    data: entriesToInsert,
  });

  const skipped = candidates.length - entriesToInsert.length;

  console.log(
    `Merged ${entriesToInsert.length} new time entries from RescueTime for ${date} (${skipped} duplicates skipped)`
  );

  const parts: string[] = [
    `Merged ${entriesToInsert.length} new ${entriesToInsert.length === 1 ? "entry" : "entries"} from RescueTime`,
  ];

  if (skipped > 0) {
    parts.push(`${skipped} duplicate${skipped === 1 ? "" : "s"} skipped`);
  }

  if (unmatchedProjects.length > 0) {
    parts.push(
      `${unmatchedProjects.length} unmatched: ${unmatchedProjects.map((u) => `"${u.rtName}"`).join(", ")}`
    );
  }

  return {
    status: "merged" as const,
    message: parts.join(". "),
    entriesMerged: entriesToInsert.length,
    unmatchedProjects: unmatchedProjects.map((u) => u.rtName),
    reasoning: mergeDecision.reasoning,
  };
}
