import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import { renderToStream } from '@react-pdf/renderer';
import { Temporal } from '@js-temporal/polyfill';
import { InvoicePDF } from '@/components/InvoicePDF';
import type { InvoicePDFData } from '@/components/InvoicePDF';
import { getInvoiceDisplayName } from '@/lib/invoice-format';

// Use the server's local timezone so dates match what the admin sees
// on the /time page (which uses the browser's local timezone).
const localTz = Temporal.Now.timeZoneId();

/** Convert a JS Date (UTC) to a YYYY-MM-DD string in the local timezone. */
function toLocalDateStr(date: Date): string {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(localTz)
    .toPlainDate()
    .toString();
}

/** Get the local-timezone PlainDate for a JS Date. */
function toLocalPlainDate(date: Date): Temporal.PlainDate {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO(localTz)
    .toPlainDate();
}

/** Get the Monday of the week containing `date` (in local timezone). */
function getWeekStartDate(date: Date): Temporal.PlainDate {
  const local = toLocalPlainDate(date);
  // Temporal dayOfWeek: 1=Mon, 7=Sun
  return local.subtract({ days: local.dayOfWeek - 1 });
}

/** Get the Monday 00:00 (local tz) of the week containing `date`, as a JS Date. */
function getWeekStart(date: Date): Date {
  const monday = getWeekStartDate(date);
  return new Date(
    monday.toZonedDateTime({ timeZone: localTz, plainTime: Temporal.PlainTime.from('00:00:00') })
      .toInstant().epochMilliseconds
  );
}

/** Get Sunday 23:59:59 (local tz) of the week starting at `weekStart`, as a JS Date. */
function getWeekEnd(weekStart: Date): Date {
  const monday = toLocalPlainDate(weekStart);
  const sunday = monday.add({ days: 6 });
  return new Date(
    sunday.toZonedDateTime({ timeZone: localTz, plainTime: Temporal.PlainTime.from('23:59:59.999') })
      .toInstant().epochMilliseconds
  );
}

/** Day-of-week name (Temporal dayOfWeek: 1=Mon … 7=Sun). */
const DOW_NAMES_TEMPORAL: Record<number, string> = {
  1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday',
  5: 'Friday', 6: 'Saturday', 7: 'Sunday',
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const inline = request.nextUrl.searchParams.get('view') === 'true';
    const invoiceId = parseInt(id);

    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }

    // ── 1. Fetch invoice with related data ──
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            company: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            color: true,
            hourlyRate: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // ── 2. Fetch settings ──
    const settings = await prisma.setting.findUnique({
      where: { key: 'main' },
    });
    const companyInfo = {
      name: settings?.companyName || 'Your Company',
      freelancerName: settings?.freelancerName,
      email: settings?.freelancerEmail,
      address: settings?.address,
      phone: settings?.phone,
      website: settings?.website,
    };

    // ── 3. Determine invoice period ──
    // Use the stored billing period if available (set during invoice generation).
    // Fall back to a 90-day window ending at issueDate for older invoices
    // that were created before periodStart/periodEnd were tracked.
    const periodEnd = invoice.periodEnd ?? invoice.issueDate;
    const periodStart = invoice.periodStart ?? (() => {
      const fallback = new Date(invoice.issueDate);
      fallback.setDate(fallback.getDate() - 90);
      return fallback;
    })();

    // ── 4. Fetch BILLABLE time entries for the invoice period ──
    // The invoice amount is calculated from billable entries only, so the PDF
    // must use the same filter to keep hours and dollars consistent.
    // For multi-project invoices (no projectId), fetch across all client projects.
    const projectId = invoice.project?.id;
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        billable: true,
        startTime: { gte: periodStart, lte: periodEnd },
        ...(projectId
          ? { projectId }
          : { project: { clientId: invoice.client.id } }),
      },
      orderBy: { startTime: 'asc' },
    });

    // Collect the distinct project IDs that appear in the entries (used below).
    const involvedProjectIds = [...new Set(timeEntries.map(e => e.projectId))];

    // ── 5. Build weekly time breakdown with summaries ──
    const weekMap = new Map<string, {
      weekStart: Date;
      weekEnd: Date;
      totalMinutes: number;
      entries: typeof timeEntries;
    }>();

    for (const entry of timeEntries) {
      const ws = getWeekStart(entry.startTime);
      const key = toLocalDateStr(ws);
      if (!weekMap.has(key)) {
        weekMap.set(key, { weekStart: ws, weekEnd: getWeekEnd(ws), totalMinutes: 0, entries: [] });
      }
      const week = weekMap.get(key)!;
      week.totalMinutes += entry.durationMinutes;
      week.entries.push(entry);
    }

    // Fetch weekly summaries for those weeks.
    // WeeklySummary.weekStart is stored as Monday 00:00:00 UTC (a calendar-date
    // convention, not a real timestamp). Build UTC-midnight Dates from our local
    // Monday date-strings so the Prisma query matches the DB values.
    const weekKeys = Array.from(weekMap.keys());
    const utcMondayDates = weekKeys.map(key => {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(Date.UTC(y!, m! - 1, d!));
    });
    const weeklySummaries = involvedProjectIds.length > 0 && weekKeys.length > 0
      ? await prisma.weeklySummary.findMany({
          where: {
            projectId: { in: involvedProjectIds },
            weekStart: { in: utcMondayDates },
          },
          include: { project: { select: { name: true } } },
        })
      : [];

    // Key by the UTC date portion (Monday date string) — matches weekMap keys.
    // For multi-project invoices, combine each project's summary under a bold heading.
    const summaryMap = new Map<string, string>();
    for (const s of weeklySummaries) {
      const key = s.weekStart.toISOString().slice(0, 10);
      const text = projectId ? s.summary : `**${s.project.name}**\n${s.summary}`;
      const existing = summaryMap.get(key);
      summaryMap.set(key, existing ? `${existing}\n\n${text}` : text);
    }

    const timeBreakdown: InvoicePDFData['timeBreakdown'] = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, week]) => ({
        weekStart: toLocalDateStr(week.weekStart),
        weekEnd: toLocalDateStr(week.weekEnd),
        summary: summaryMap.get(key) ?? null,
        totalHours: week.totalMinutes / 60,
        entries: week.entries.map(e => ({
          date: toLocalDateStr(e.startTime),
          description: e.description,
          hours: e.durationMinutes / 60,
        })),
      }));

    // ── 6. Project comparison: all client projects during invoice period ──
    const allClientProjects = await prisma.project.findMany({
      where: { clientId: invoice.client.id },
      select: { id: true, name: true, color: true },
    });

    const projectHoursResults = await Promise.all(
      allClientProjects.map(async (proj) => {
        const result = await prisma.timeEntry.aggregate({
          where: {
            projectId: proj.id,
            billable: true,
            startTime: { gte: periodStart, lte: periodEnd },
          },
          _sum: { durationMinutes: true },
        });
        return {
          projectName: proj.name,
          projectColor: proj.color,
          hours: (result._sum.durationMinutes ?? 0) / 60,
          isCurrent: projectId ? proj.id === projectId : involvedProjectIds.includes(proj.id),
        };
      })
    );

    const projectComparison = projectHoursResults.filter(p => p.hours > 0);
    const projectNameById = new Map(allClientProjects.map(p => [p.id, p.name]));

    // ── 7. Daily hours heatmap ──
    // Group by LOCAL date (not UTC) so the heatmap matches the /time page.
    const dailyMap = new Map<string, number>();
    for (const entry of timeEntries) {
      const dateKey = toLocalDateStr(entry.startTime);
      dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + entry.durationMinutes / 60);
    }

    // Fill in zero-days across complete weeks (Mon–Sun) so the heatmap
    // grid aligns with the weekly breakdown and starts on the correct Monday.
    const dailyHours: InvoicePDFData['dailyHours'] = [];
    if (timeEntries.length > 0) {
      const firstEntry = timeEntries[0]!;
      const lastEntry = timeEntries[timeEntries.length - 1]!;
      // Snap to the Monday of the first entry's week (local timezone)
      const firstDate = getWeekStartDate(firstEntry.startTime);
      // Snap to the Sunday of the last entry's week (local timezone)
      const lastMonday = getWeekStartDate(lastEntry.startTime);
      const lastDate = lastMonday.add({ days: 6 });

      let cursor = firstDate;
      while (Temporal.PlainDate.compare(cursor, lastDate) <= 0) {
        const key = cursor.toString(); // YYYY-MM-DD
        dailyHours.push({ date: key, hours: dailyMap.get(key) ?? 0 });
        cursor = cursor.add({ days: 1 });
      }
    }

    // ── 8. Compute stats ──
    const activeDays = Array.from(dailyMap.values()).filter(h => h > 0);
    const totalHours = timeEntries.reduce((s, e) => s + e.durationMinutes, 0) / 60;
    const totalBillable = timeEntries.filter(e => e.billable).reduce((s, e) => s + e.durationMinutes, 0) / 60;

    // Most productive day of week (Temporal dayOfWeek: 1=Mon … 7=Sun)
    const dowTotals = new Map<number, number>();
    for (const entry of timeEntries) {
      const dow = toLocalPlainDate(entry.startTime).dayOfWeek;
      dowTotals.set(dow, (dowTotals.get(dow) ?? 0) + entry.durationMinutes);
    }
    let bestDow = 1;
    let bestDowMinutes = 0;
    for (const [dow, mins] of dowTotals) {
      if (mins > bestDowMinutes) { bestDow = dow; bestDowMinutes = mins; }
    }

    // Longest consecutive-day streak
    let longestStreak = 0;
    let currentStreak = 0;
    if (dailyHours.length > 0) {
      for (const d of dailyHours) {
        if (d.hours > 0) {
          currentStreak++;
          longestStreak = Math.max(longestStreak, currentStreak);
        } else {
          currentStreak = 0;
        }
      }
    }

    const stats: InvoicePDFData['stats'] = timeEntries.length > 0 ? {
      totalHours,
      totalDays: activeDays.length,
      avgHoursPerDay: activeDays.length > 0 ? totalHours / activeDays.length : 0,
      avgHoursPerWeek: weekMap.size > 0 ? totalHours / weekMap.size : 0,
      mostProductiveDay: DOW_NAMES_TEMPORAL[bestDow] ?? 'N/A',
      longestStreak,
      billablePercent: totalHours > 0 ? (totalBillable / totalHours) * 100 : 0,
      totalEntries: timeEntries.length,
    } : undefined;

    // ── 9. Invoice history for this client ──
    const [pastInvoices, projectHighlights] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          clientId: invoice.client.id,
          id: { not: invoice.id },
        },
        include: {
          project: { select: { name: true } },
        },
        orderBy: { issueDate: 'asc' },
      }),
      // Fetch project highlights during the invoice period (all billed projects)
      involvedProjectIds.length > 0
        ? prisma.projectHighlight.findMany({
            where: {
              projectId: { in: involvedProjectIds },
              date: { gte: periodStart, lte: periodEnd },
            },
            orderBy: { date: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    const invoiceHistory: InvoicePDFData['invoiceHistory'] = pastInvoices.map(inv => ({
      invoiceNumber: inv.invoiceNumber,
      issueDate: toLocalDateStr(inv.issueDate),
      periodStart: inv.periodStart ? toLocalDateStr(inv.periodStart) : null,
      amount: Number(inv.amount),
      currency: inv.currency,
      status: inv.status,
      name: getInvoiceDisplayName({ ...inv, projectName: inv.project?.name ?? null }),
    }));

    // ── 10. Assemble PDF data ──
    // Invoice dates (issueDate, dueDate, paidDate) are stored as real timestamps
    // via `new Date()`, so convert to local date strings to match the /invoices view.
    const invoiceData: InvoicePDFData = {
      invoiceNumber: invoice.invoiceNumber,
      name: getInvoiceDisplayName({ ...invoice, projectName: invoice.project?.name ?? null }),
      issueDate: toLocalDateStr(invoice.issueDate),
      dueDate: toLocalDateStr(invoice.dueDate),
      paidDate: invoice.paidDate ? toLocalDateStr(invoice.paidDate) : null,
      status: invoice.status,
      amount: Number(invoice.amount),
      currency: invoice.currency,
      notes: invoice.notes,
      workPeriodStart: timeEntries.length > 0 ? toLocalDateStr(timeEntries[0]!.startTime) : null,
      workPeriodEnd: timeEntries.length > 0 ? toLocalDateStr(timeEntries[timeEntries.length - 1]!.startTime) : null,
      periodStart: toLocalDateStr(periodStart),
      client: {
        name: invoice.client.name,
        email: invoice.client.email,
        company: invoice.client.company,
      },
      project: invoice.project ? {
        name: invoice.project.name,
        color: invoice.project.color,
        hourlyRate: invoice.project.hourlyRate ? Number(invoice.project.hourlyRate) : null,
      } : null,
      companyInfo,
      timeBreakdown: timeBreakdown.length > 0 ? timeBreakdown : undefined,
      projectComparison: projectComparison.length > 0 ? projectComparison : undefined,
      dailyHours: dailyHours.length > 0 ? dailyHours : undefined,
      stats,
      invoiceHistory: invoiceHistory.length > 0 ? invoiceHistory : undefined,
      aiSummary: invoice.aiSummary,
      // Highlight dates are pure calendar dates (@db.Date) stored as midnight UTC,
      // NOT timestamps — extract the date portion directly without timezone conversion.
      highlights: projectHighlights.length > 0
        ? projectHighlights.map(h => ({
            date: h.date.toISOString().slice(0, 10),
            label: h.label,
            emoji: h.emoji,
            projectName: projectNameById.get(h.projectId) ?? null,
          }))
        : undefined,
    };

    // ── 11. Generate PDF stream ──
    const stream = await renderToStream(<InvoicePDF invoice={invoiceData} />);

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    // Return PDF with appropriate headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': inline
          ? `inline; filename="${invoice.invoiceNumber}.pdf"`
          : `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}
