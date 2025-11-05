"use server";

import { prisma } from "@freelance-os/database";
import { sendEmail, generatePaymentReminderEmail, generateOverdueInvoiceEmail } from "@freelance-os/email";
import { getJMAPConfig, getCompanyName } from "@/lib/email";

interface ReminderResult {
  invoiceId: number;
  invoiceNumber: string;
  clientEmail: string;
  status: 'sent' | 'failed';
  daysUntilDue?: number;
  daysOverdue?: number;
  error?: string;
}

interface SendRemindersResult {
  success: boolean;
  type: string;
  count: number;
  results: ReminderResult[];
}

/**
 * Send payment reminders for upcoming or overdue invoices
 */
export async function sendPaymentReminders(options: {
  type?: 'upcoming' | 'overdue';
  daysThreshold?: number;
}): Promise<SendRemindersResult> {
  const { type = 'upcoming', daysThreshold = 7 } = options;

  // Check if JMAP is configured
  let jmapConfig;
  try {
    jmapConfig = await getJMAPConfig();
  } catch (error) {
    throw new Error('Email service not configured. Please configure email settings in Settings page.');
  }

  const now = new Date();
  const results: ReminderResult[] = [];
  const companyName = await getCompanyName();
  const portalUrl = process.env.CLIENT_PORTAL_URL || process.env.NEXTAUTH_URL;

  if (type === 'upcoming') {
    // Find invoices due in the next X days (unpaid/sent status)
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + daysThreshold);

    const upcomingInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['sent'] },
        dueDate: {
          gte: now,
          lte: futureDate,
        },
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
      },
    });

    // Send reminder for each invoice
    for (const invoice of upcomingInvoices) {
      const daysUntilDue = Math.ceil(
        (new Date(invoice.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const emailContent = generatePaymentReminderEmail({
        invoice: {
          ...invoice,
          amount: invoice.amount.toNumber(),
        },
        companyName,
        portalUrl,
        daysUntilDue,
      });

      try {
        await sendEmail(jmapConfig, {
          to: invoice.client.email,
          ...emailContent,
        });
        results.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientEmail: invoice.client.email,
          status: 'sent',
          daysUntilDue,
        });
      } catch (error) {
        results.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientEmail: invoice.client.email,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  } else if (type === 'overdue') {
    // Find overdue invoices
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['sent', 'overdue'] },
        dueDate: {
          lt: now,
        },
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
      },
    });

    // Send overdue notice for each invoice
    for (const invoice of overdueInvoices) {
      const daysOverdue = Math.ceil(
        (now.getTime() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      const emailContent = generateOverdueInvoiceEmail({
        invoice: {
          ...invoice,
          amount: invoice.amount.toNumber(),
        },
        companyName,
        portalUrl,
        daysOverdue,
      });

      try {
        await sendEmail(jmapConfig, {
          to: invoice.client.email,
          ...emailContent,
        });

        // Update invoice status to 'overdue' if not already
        if (invoice.status !== 'overdue') {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: 'overdue' },
          });
        }

        results.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientEmail: invoice.client.email,
          status: 'sent',
          daysOverdue,
        });
      } catch (error) {
        results.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientEmail: invoice.client.email,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  return {
    success: true,
    type,
    count: results.length,
    results,
  };
}
