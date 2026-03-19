import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { getAdminAuth, hasPermission } from "@/lib/auth";

// Shape of a single entry in the RescueTime project time archive JSON
interface RTArchiveEntry {
  user_id: number;
  start_time: string; // e.g. "2023-10-16 07:25:00 -0700"
  name: string; // e.g. "3871:1100"
  duration: number; // seconds
  extra: {
    draft?: boolean;
    provenance?: string;
    comment?: string;
  };
  date: string; // YYYY-MM-DD
  end_time: string;
  project: {
    id: number;
    name: string;
    details: {
      color?: string;
      notes?: string[];
    };
    archived_at: string | null;
    billable: boolean | null;
    rate: number | null;
    currency: string | null;
    timesheets_client_id: number | null;
  };
  task: {
    id: number;
    name: string;
  } | null;
  client: {
    id: number;
    name: string;
  } | null;
  finalized: string | null;
}

/**
 * Parse RescueTime's datetime format: "2023-10-16 07:25:00 -0700"
 * into a proper Date object.
 */
function parseRTDatetime(dt: string): Date {
  // Replace the space before timezone offset with 'T' and format for ISO
  // "2023-10-16 07:25:00 -0700" → "2023-10-16T07:25:00-07:00"
  const parts = dt.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/);
  if (!parts) {
    // Fallback: try native parsing
    return new Date(dt);
  }
  const iso = `${parts[1]}T${parts[2]}${parts[3]}${parts[4]}:${parts[5]}`;
  return new Date(iso);
}

// POST /api/rescuetime/archive — Upload and store archive JSON
export async function POST(request: Request) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(authData, "write:settings")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const entries: RTArchiveEntry[] = body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: "Expected a non-empty JSON array of archive entries" },
        { status: 400 }
      );
    }

    // Validate basic structure of first entry
    const sample = entries[0]!;
    if (!sample.project?.id || !sample.start_time || !sample.date) {
      return NextResponse.json(
        { error: "Invalid archive format. Expected RescueTime Project History archive JSON." },
        { status: 400 }
      );
    }

    // Extract unique projects
    const projectMap = new Map<number, RTArchiveEntry["project"] & { clientId?: number | null; clientName?: string | null }>();
    for (const entry of entries) {
      const p = entry.project;
      if (p && !projectMap.has(p.id)) {
        projectMap.set(p.id, {
          ...p,
          clientId: entry.client?.id ?? null,
          clientName: entry.client?.name ?? null,
        });
      }
      // Update client info if this entry has it and existing doesn't
      if (p && entry.client) {
        const existing = projectMap.get(p.id)!;
        if (!existing.clientId) {
          existing.clientId = entry.client.id;
          existing.clientName = entry.client.name;
        }
      }
    }

    // Upsert projects
    let projectsUpserted = 0;
    for (const [rtId, p] of projectMap) {
      await prisma.rescueTimeProject.upsert({
        where: { rtProjectId: rtId },
        update: {
          name: p.name,
          color: p.details?.color ?? null,
          notes: p.details?.notes ?? [],
          archivedAt: p.archived_at ? parseRTDatetime(p.archived_at) : null,
          billable: p.billable,
          rate: p.rate,
          currency: p.currency,
          rtClientId: p.clientId ?? null,
          rtClientName: p.clientName ?? null,
        },
        create: {
          rtProjectId: rtId,
          name: p.name,
          color: p.details?.color ?? null,
          notes: p.details?.notes ?? [],
          archivedAt: p.archived_at ? parseRTDatetime(p.archived_at) : null,
          billable: p.billable,
          rate: p.rate,
          currency: p.currency,
          rtClientId: p.clientId ?? null,
          rtClientName: p.clientName ?? null,
        },
      });
      projectsUpserted++;
    }

    // Upsert time entries in batches using skipDuplicates
    // First, prepare all entries
    const timeEntryData = entries.map((entry) => ({
      rtProjectId: entry.project.id,
      date: entry.date,
      startTime: parseRTDatetime(entry.start_time),
      endTime: parseRTDatetime(entry.end_time),
      durationSeconds: entry.duration,
      draft: entry.extra?.draft ?? false,
      provenance: entry.extra?.provenance ?? null,
      comment: entry.extra?.comment ?? null,
    }));

    // Delete existing entries that overlap with this upload's date range, then re-insert
    const dates = entries.map((e) => e.date);
    const minDate = dates.reduce((a, b) => (a < b ? a : b));
    const maxDate = dates.reduce((a, b) => (a > b ? a : b));

    // Delete existing archive entries in the date range, then bulk insert
    const deleted = await prisma.rescueTimeProjectTime.deleteMany({
      where: {
        date: { gte: minDate, lte: maxDate },
      },
    });

    const created = await prisma.rescueTimeProjectTime.createMany({
      data: timeEntryData,
      skipDuplicates: true,
    });

    return NextResponse.json({
      projectsUpserted,
      entriesImported: created.count,
      entriesReplaced: deleted.count,
      dateRange: { from: minDate, to: maxDate },
      totalInArchive: entries.length,
    });
  } catch (error) {
    console.error("Error uploading RescueTime archive:", error);
    return NextResponse.json(
      { error: "Failed to process archive upload" },
      { status: 500 }
    );
  }
}

// GET /api/rescuetime/archive — Get archive stats
export async function GET() {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [entryCount, projectCount, dateRange] = await Promise.all([
      prisma.rescueTimeProjectTime.count(),
      prisma.rescueTimeProject.count(),
      prisma.rescueTimeProjectTime.aggregate({
        _min: { date: true },
        _max: { date: true },
      }),
    ]);

    return NextResponse.json({
      entryCount,
      projectCount,
      dateRange: entryCount > 0
        ? { from: dateRange._min.date, to: dateRange._max.date }
        : null,
    });
  } catch (error) {
    console.error("Error fetching archive stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch archive stats" },
      { status: 500 }
    );
  }
}
