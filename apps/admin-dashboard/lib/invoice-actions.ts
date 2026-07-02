"use server";

import { prisma } from "@freelance-os/database";
import { sendEmail, generateInvoiceSentEmail } from "@freelance-os/email";
import { generateText } from "ai";
import { Temporal } from "@js-temporal/polyfill";
import { getAiModel, isAiConfigured } from "@/lib/ai-provider";
import { getJMAPConfig, getCompanyName } from "@/lib/email";

/**
 * Helper function to generate unique invoice number
 */
function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `INV-${year}${month}${day}-${random}`;
}

interface GenerateInvoiceParams {
  clientId: number;
  projectId?: number;
  startDate?: string;
  endDate?: string;
  hourlyRate: number;
  currency?: string;
  notes?: string;
  dueInDays?: number;
}

/**
 * Auto-generate invoice from time entries
 */
export async function generateInvoice(params: GenerateInvoiceParams) {
  const {
    clientId,
    projectId,
    startDate,
    endDate,
    hourlyRate,
    currency = 'USD',
    notes,
    dueInDays = 30,
  } = params;

  // Validation
  if (!clientId || !hourlyRate) {
    throw new Error('Missing required fields: clientId, hourlyRate');
  }

  if (!startDate && !endDate && !projectId) {
    throw new Error('Must provide either projectId or date range (startDate/endDate)');
  }

  // Verify client exists
  const client = await prisma.client.findUnique({
    where: { id: clientId },
  });

  if (!client) {
    throw new Error('Client not found');
  }

  // Build query for time entries
  const where: any = {
    billable: true,
    project: {
      clientId,
    },
  };

  if (projectId) {
    where.projectId = projectId;
    
    // Verify project exists and belongs to client
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    if (project.clientId !== clientId) {
      throw new Error('Project does not belong to the specified client');
    }
  }

  // Build date range using Temporal with LOCAL timezone boundaries.
  // Dates from the client represent local calendar days (e.g. "2026-03-15"
  // means March 15 in the user's timezone). We convert to the corresponding
  // UTC range so entries throughout the entire day are included.
  const localTz = Temporal.Now.timeZoneId();
  let queryStartDate: Date | undefined;
  let queryEndDate: Date | undefined;

  if (startDate) {
    const sd = Temporal.PlainDate.from(startDate);
    queryStartDate = new Date(sd.toZonedDateTime(localTz).toInstant().epochMilliseconds);
    where.startTime = {
      ...where.startTime,
      gte: queryStartDate,
    };
  }

  if (endDate) {
    const ed = Temporal.PlainDate.from(endDate);
    queryEndDate = new Date(
      ed.toZonedDateTime({ timeZone: localTz, plainTime: Temporal.PlainTime.from('23:59:59.999') }).toInstant().epochMilliseconds
    );
    where.startTime = {
      ...where.startTime,
      lte: queryEndDate,
    };
  }

  // Get billable time entries
  const timeEntries = await prisma.timeEntry.findMany({
    where,
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (timeEntries.length === 0) {
    throw new Error('No billable time entries found for the specified criteria');
  }

  // Calculate total hours and amount
  const totalMinutes = timeEntries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const totalHours = totalMinutes / 60;
  const amount = totalHours * hourlyRate;

  // Generate unique invoice number
  let invoiceNumber = generateInvoiceNumber();
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const existing = await prisma.invoice.findUnique({
      where: { invoiceNumber },
    });

    if (!existing) break;

    invoiceNumber = generateInvoiceNumber();
    attempts++;
  }

  if (attempts === maxAttempts) {
    throw new Error('Failed to generate unique invoice number');
  }

  // Create invoice
  const issueDate = new Date();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueInDays);

  // Build notes with time entry summary
  const projectSummary = timeEntries.reduce((acc, entry) => {
    const projectName = entry.project.name;
    if (!acc[projectName]) {
      acc[projectName] = 0;
    }
    acc[projectName] += entry.durationMinutes;
    return acc;
  }, {} as Record<string, number>);

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      clientId,
      projectId: projectId || null,
      amount,
      currency,
      status: 'draft',
      issueDate,
      dueDate,
      periodStart: queryStartDate ?? timeEntries[0]?.startTime ?? issueDate,
      periodEnd: queryEndDate ?? timeEntries[timeEntries.length - 1]?.startTime ?? issueDate,
      notes,
    },
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
        },
      },
    },
  });

  // Convert Decimal to number for JSON serialization
  return {
    ...invoice,
    amount: invoice.amount.toNumber(),
    summary: {
      totalHours: parseFloat(totalHours.toFixed(2)),
      hourlyRate,
      timeEntriesCount: timeEntries.length,
    },
  };
}

/**
 * Send invoice email to client
 */
export async function sendInvoiceEmail(invoiceId: number) {
  // Fetch invoice with client details
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
        },
      },
    },
  });

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  // Check if JMAP is configured
  let jmapConfig;
  try {
    jmapConfig = await getJMAPConfig();
  } catch (error) {
    throw new Error('Email service not configured. Please configure email settings in Settings page.');
  }

  // Generate email content
  const companyName = await getCompanyName();
  const portalUrl = process.env.CLIENT_PORTAL_URL || process.env.NEXTAUTH_URL;

  const emailContent = generateInvoiceSentEmail({
    invoice: {
      ...invoice,
      amount: invoice.amount.toNumber(),
      projectId: invoice.projectId ?? undefined,
    } as any,
    companyName,
    portalUrl,
  });

  // Send email
  await sendEmail(jmapConfig, {
    to: invoice.client.email,
    ...emailContent,
  });

  // Update invoice status to 'sent' if it was 'draft'
  let updatedInvoice = invoice;
  if (invoice.status === 'draft') {
    updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'sent' },
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
          },
        },
      },
    });
  }

  return {
    success: true,
    message: `Invoice sent to ${invoice.client.email}`,
    invoice: {
      ...updatedInvoice,
      amount: updatedInvoice.amount.toNumber(),
    },
  };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_ABBREV = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats an invoice period as a human label — "Quarter 4 of 2025 (Oct–Dec)"
 * or "March 2026" when the range lines up with a calendar quarter/month,
 * falling back to a plain date range otherwise. Computed here rather than
 * left to the AI since date arithmetic is an easy place for a model to
 * quietly get things wrong.
 */
function formatPeriodLabel(periodStart: Date, periodEnd: Date): string {
  const localTz = Temporal.Now.timeZoneId();
  const start = Temporal.Instant.fromEpochMilliseconds(periodStart.getTime()).toZonedDateTimeISO(localTz).toPlainDate();
  const end = Temporal.Instant.fromEpochMilliseconds(periodEnd.getTime()).toZonedDateTimeISO(localTz).toPlainDate();

  const startsOnMonthStart = start.day === 1;
  const endsOnMonthEnd = end.day === end.daysInMonth;

  const quarterNumber = Math.floor((start.month - 1) / 3) + 1;
  const isFullQuarter = startsOnMonthStart && endsOnMonthEnd
    && start.year === end.year
    && start.month === (quarterNumber - 1) * 3 + 1
    && end.month === start.month + 2;

  if (isFullQuarter) {
    return `Quarter ${quarterNumber} of ${start.year} (${MONTH_ABBREV[start.month - 1]}–${MONTH_ABBREV[end.month - 1]})`;
  }

  if (startsOnMonthStart && endsOnMonthEnd && start.year === end.year && start.month === end.month) {
    return `${MONTH_NAMES[start.month - 1]} ${start.year}`;
  }

  if (start.year === end.year) {
    return `${MONTH_ABBREV[start.month - 1]} ${start.day} – ${MONTH_ABBREV[end.month - 1]} ${end.day}, ${end.year}`;
  }
  return `${MONTH_ABBREV[start.month - 1]} ${start.day}, ${start.year} – ${MONTH_ABBREV[end.month - 1]} ${end.day}, ${end.year}`;
}

/**
 * Generate an AI executive summary for an invoice and persist it.
 * Uses weekly summaries + time entries from the invoice period to
 * produce a concise, client-facing narrative.
 *
 * If the invoice already has an aiSummary and `force` is false, returns
 * the existing one without calling the AI.
 */
export async function generateInvoiceSummary(
  invoiceId: number,
  options?: { force?: boolean }
): Promise<{ success: boolean; summary: string }> {
  const force = options?.force ?? false;

  // 1. Fetch invoice with relations
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      client: { select: { name: true, company: true } },
      project: { select: { id: true, name: true, clientDescription: true, hourlyRate: true } },
    },
  });

  if (!invoice) throw new Error('Invoice not found');

  // Return cached summary unless forced
  if (invoice.aiSummary && !force) {
    return { success: true, summary: invoice.aiSummary };
  }

  // 2. Check AI is configured
  if (!(await isAiConfigured())) {
    throw new Error('AI is not configured. Please add an API key in Settings.');
  }

  // 3. Determine invoice period — use stored billing period if available,
  // fall back to 90 days before issue date for older invoices.
  const periodEnd = invoice.periodEnd ?? invoice.issueDate;
  const periodStart = invoice.periodStart ?? (() => {
    const fallback = new Date(invoice.issueDate);
    fallback.setDate(fallback.getDate() - 90);
    return fallback;
  })();

  // 4. Fetch billable time entries. For multi-project invoices (no projectId),
  // pull across all of the client's projects — same fallback the PDF generator
  // uses — otherwise these invoices get no time entries at all.
  const projectId = invoice.project?.id;
  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      billable: true,
      startTime: { gte: periodStart, lte: periodEnd },
      ...(projectId ? { projectId } : { project: { clientId: invoice.clientId } }),
    },
    orderBy: { startTime: 'asc' },
    select: { startTime: true, durationMinutes: true, description: true, projectId: true },
  });

  const involvedProjectIds = [...new Set(timeEntries.map(e => e.projectId))];
  const involvedProjects = involvedProjectIds.length > 0
    ? await prisma.project.findMany({
        where: { id: { in: involvedProjectIds } },
        select: { id: true, name: true },
      })
    : [];
  const projectNameById = new Map(involvedProjects.map(p => [p.id, p.name]));
  const showProjectLabels = involvedProjects.length > 1;

  // 5. Fetch weekly summaries across the same set of projects
  const weeklySummaries = involvedProjectIds.length > 0
    ? await prisma.weeklySummary.findMany({
        where: {
          projectId: { in: involvedProjectIds },
          weekStart: { gte: periodStart, lte: periodEnd },
        },
        orderBy: { weekStart: 'asc' },
        select: { weekStart: true, summary: true, projectId: true },
      })
    : [];

  // 6. Fetch project milestones during the period — concrete, dated events
  // that give the model real details to reference instead of vague prose.
  const projectHighlights = involvedProjectIds.length > 0
    ? await prisma.projectHighlight.findMany({
        where: {
          projectId: { in: involvedProjectIds },
          date: { gte: periodStart, lte: periodEnd },
        },
        orderBy: { date: 'asc' },
        select: { date: true, label: true, projectId: true },
      })
    : [];

  // 7. Compute basic stats for the prompt
  const totalMinutes = timeEntries.reduce((s, e) => s + e.durationMinutes, 0);
  const totalHours = totalMinutes / 60;
  const totalEntries = timeEntries.length;

  // Unique descriptions (for a flavour of the work done), labeled by project
  // when the invoice spans several
  const descriptions = [...new Set(
    timeEntries
      .filter((e): e is typeof e & { description: string } => !!e.description)
      .map(e => showProjectLabels ? `[${projectNameById.get(e.projectId) ?? 'Unknown project'}] ${e.description}` : e.description)
  )].slice(0, 40);

  // 8. Build prompt
  const clientLabel = invoice.client.company
    ? `${invoice.client.name} (${invoice.client.company})`
    : invoice.client.name;

  const projectsText = involvedProjects.length > 0
    ? involvedProjects.map(p => p.name).join(', ')
    : (invoice.project?.name ?? 'General work');

  // The opening line ("This invoice is for **all** X work in **period**.") is
  // assembled here rather than left to the AI, since it's just the invoice
  // scope + period restated in a fixed shape — no need to burn model
  // creativity (or risk date mistakes) on it.
  const periodLabel = formatPeriodLabel(periodStart, periodEnd);
  const openingLine = projectId
    ? `This invoice is for work on **${invoice.project!.name}** in **${periodLabel}**.`
    : `This invoice is for **all** ${invoice.client.company ?? invoice.client.name} work in **${periodLabel}**.`;

  const weeklySummaryText = weeklySummaries.length > 0
    ? weeklySummaries.map(ws => {
        const weekLabel = ws.weekStart.toISOString().slice(0, 10);
        const projectLabel = showProjectLabels ? ` — ${projectNameById.get(ws.projectId) ?? 'Unknown project'}` : '';
        return `Week of ${weekLabel}${projectLabel}:\n${ws.summary}`;
      }).join('\n\n')
    : 'No weekly summaries available.';

  const highlightsText = projectHighlights.length > 0
    ? projectHighlights.map(h => {
        const dateLabel = h.date.toISOString().slice(0, 10);
        const projectLabel = showProjectLabels ? ` (${projectNameById.get(h.projectId) ?? 'Unknown project'})` : '';
        return `- ${dateLabel}: ${h.label}${projectLabel}`;
      }).join('\n')
    : 'No milestones recorded.';

  const prompt = `You are writing a professional executive summary for an invoice being sent to a client. This summary will appear on the invoice PDF, so keep it concise, professional, and value-focused.

Client: ${clientLabel}
Project(s) worked on: ${projectsText}
${invoice.project?.clientDescription ? `Project description: ${invoice.project.clientDescription}` : ''}
Invoice period: ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}
Total hours: ${totalHours.toFixed(1)} (${totalEntries} time entries)

Weekly summaries from the period:
${weeklySummaryText}

Project milestones during the period:
${highlightsText}

Sample work descriptions from time entries:
${descriptions.length > 0 ? descriptions.join('\n') : 'No descriptions available.'}

Write the body of the summary as two parts (do not repeat the invoice period or client name — that's shown elsewhere on the invoice):

1. A short, casual 2-3 sentence overview paragraph that briefly touches on where each project stands (e.g. "kicked off", "continued", "minor work", "planning began"). Bold each project name the first time it's mentioned. Keep it high-level — save specifics for the bullets below.
2. One bullet per project in ${projectsText}, each a single sentence stating specifically what was done on that project, pulled from the weekly summaries, milestones, and work descriptions above — real feature names, fixes, or decisions, not abstractions. Bold the project name and key nouns (feature names, deliverables). Format as "- **Project Name** — did X, built Y, delivered Z."

Rules:
- Never use vague filler language like "general support," "ongoing collaboration," "maintained momentum," or "readiness for upcoming initiatives" — every claim must trace back to something in the data above. If the data is too sparse to support specifics for a project, keep its bullet shorter rather than padding it with generic language.
- Do not mention redundant details like the invoice amount, hours, or dates that are already clearly stated on the invoice.
- Use markdown formatting (bold, bullet points) to make it easy to read on the invoice PDF.

Return ONLY the overview paragraph followed by the bullet list, nothing else. Do not start with "Summary:", a heading, or any other preamble.`;

  // 8. Call AI
  const aiModel = await getAiModel();
  const { text } = await generateText({
    model: aiModel,
    prompt,
  });

  const summary = `${openingLine}\n\n${text.trim()}`;

  // 9. Persist to database
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { aiSummary: summary },
  });

  return { success: true, summary };
}
