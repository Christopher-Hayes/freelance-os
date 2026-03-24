import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import { renderToStream } from '@react-pdf/renderer';
import { InvoicePDF } from '@/components/InvoicePDF';
import type { InvoicePDFData } from '@/components/InvoicePDF';

/** Get the Monday 00:00 UTC of the week containing `date`. */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sun
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Get Sunday 23:59:59 UTC of the week containing weekStart (Monday). */
function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + 6);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/** Day-of-week name. */
const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
    // Use issueDate → dueDate as the "period" for data queries.
    // But better: look at the earliest/latest time entries for this project in a reasonable window.
    // We'll use a 90-day window ending at issueDate as a generous period, or fall back to issueDate-30d → issueDate.
    const periodEnd = invoice.issueDate;
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 90);

    // ── 4. Fetch time entries for this project during the period ──
    const projectId = invoice.project?.id;
    const timeEntries = projectId
      ? await prisma.timeEntry.findMany({
          where: {
            projectId,
            startTime: { gte: periodStart, lte: periodEnd },
          },
          orderBy: { startTime: 'asc' },
        })
      : [];

    // ── 5. Build weekly time breakdown with summaries ──
    const weekMap = new Map<string, {
      weekStart: Date;
      weekEnd: Date;
      totalMinutes: number;
      entries: typeof timeEntries;
    }>();

    for (const entry of timeEntries) {
      const ws = getWeekStart(entry.startTime);
      const key = ws.toISOString().slice(0, 10);
      if (!weekMap.has(key)) {
        weekMap.set(key, { weekStart: ws, weekEnd: getWeekEnd(ws), totalMinutes: 0, entries: [] });
      }
      const week = weekMap.get(key)!;
      week.totalMinutes += entry.durationMinutes;
      week.entries.push(entry);
    }

    // Fetch weekly summaries for those weeks
    const weekKeys = Array.from(weekMap.keys());
    const weeklySummaries = projectId && weekKeys.length > 0
      ? await prisma.weeklySummary.findMany({
          where: {
            projectId,
            weekStart: { in: Array.from(weekMap.values()).map(w => w.weekStart) },
          },
        })
      : [];

    const summaryMap = new Map(weeklySummaries.map(s => [s.weekStart.toISOString().slice(0, 10), s.summary]));

    const timeBreakdown: InvoicePDFData['timeBreakdown'] = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, week]) => ({
        weekStart: week.weekStart.toISOString(),
        weekEnd: week.weekEnd.toISOString(),
        summary: summaryMap.get(key) ?? null,
        totalHours: week.totalMinutes / 60,
        entries: week.entries.map(e => ({
          date: e.startTime.toISOString().slice(0, 10),
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
            startTime: { gte: periodStart, lte: periodEnd },
          },
          _sum: { durationMinutes: true },
        });
        return {
          projectName: proj.name,
          projectColor: proj.color,
          hours: (result._sum.durationMinutes ?? 0) / 60,
          isCurrent: proj.id === projectId,
        };
      })
    );

    const projectComparison = projectHoursResults.filter(p => p.hours > 0);

    // ── 7. Daily hours heatmap ──
    const dailyMap = new Map<string, number>();
    for (const entry of timeEntries) {
      const dateKey = entry.startTime.toISOString().slice(0, 10);
      dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + entry.durationMinutes / 60);
    }

    // Fill in zero-days across complete weeks (Mon–Sun) so the heatmap
    // grid aligns with the weekly breakdown and starts on the correct Monday.
    const dailyHours: InvoicePDFData['dailyHours'] = [];
    if (timeEntries.length > 0) {
      const firstEntry = timeEntries[0]!;
      const lastEntry = timeEntries[timeEntries.length - 1]!;
      // Snap to the Monday of the first entry's week
      const firstDate = getWeekStart(firstEntry.startTime);
      // Snap to the Sunday of the last entry's week
      const lastDate = getWeekEnd(new Date(lastEntry.startTime));
      lastDate.setUTCHours(0, 0, 0, 0);

      const cursor = new Date(firstDate);
      while (cursor <= lastDate) {
        const key = cursor.toISOString().slice(0, 10);
        dailyHours.push({ date: key, hours: dailyMap.get(key) ?? 0 });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    // ── 8. Compute stats ──
    const activeDays = Array.from(dailyMap.values()).filter(h => h > 0);
    const totalHours = timeEntries.reduce((s, e) => s + e.durationMinutes, 0) / 60;
    const totalBillable = timeEntries.filter(e => e.billable).reduce((s, e) => s + e.durationMinutes, 0) / 60;

    // Most productive day of week
    const dowTotals = [0, 0, 0, 0, 0, 0, 0];
    for (const entry of timeEntries) {
      const dow = entry.startTime.getUTCDay();
      dowTotals[dow]! += entry.durationMinutes;
    }
    const bestDow = dowTotals.indexOf(Math.max(...dowTotals));

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
      mostProductiveDay: DOW_NAMES[bestDow] ?? 'N/A',
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
      // Fetch project highlights during the invoice period
      projectId
        ? prisma.projectHighlight.findMany({
            where: {
              projectId,
              date: { gte: periodStart, lte: periodEnd },
            },
            orderBy: { date: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    const invoiceHistory: InvoicePDFData['invoiceHistory'] = pastInvoices.map(inv => ({
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate.toISOString(),
      amount: Number(inv.amount),
      currency: inv.currency,
      status: inv.status,
      projectName: inv.project?.name ?? null,
    }));

    // ── 10. Assemble PDF data ──
    const invoiceData: InvoicePDFData = {
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      paidDate: invoice.paidDate?.toISOString() || null,
      status: invoice.status,
      amount: Number(invoice.amount),
      currency: invoice.currency,
      notes: invoice.notes,
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
      highlights: projectHighlights.length > 0
        ? projectHighlights.map(h => ({
            date: h.date.toISOString().slice(0, 10),
            label: h.label,
            emoji: h.emoji,
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
