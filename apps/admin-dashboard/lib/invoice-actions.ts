"use server";

import { prisma } from "@freelance-os/database";
import { sendEmail, generateInvoiceSentEmail } from "@freelance-os/email";
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

  if (startDate) {
    where.startTime = {
      ...where.startTime,
      gte: new Date(startDate),
    };
  }

  if (endDate) {
    where.startTime = {
      ...where.startTime,
      lte: new Date(endDate),
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

  const autoNotes = Object.entries(projectSummary)
    .map(([project, minutes]) => {
      const hours = (minutes / 60).toFixed(2);
      return `${project}: ${hours} hours`;
    })
    .join('\n');

  const finalNotes = notes ? `${notes}\n\n${autoNotes}` : autoNotes;

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
      notes: finalNotes,
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
