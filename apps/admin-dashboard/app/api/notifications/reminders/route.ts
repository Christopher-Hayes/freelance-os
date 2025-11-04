import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import { sendEmail, generatePaymentReminderEmail, generateOverdueInvoiceEmail } from '@freelance-os/email';
import { getJMAPConfig } from '@/lib/email';

// POST /api/notifications/reminders - Send payment reminders for invoices
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type = 'upcoming', daysThreshold = 7 } = body;

    // Check if JMAP is configured
    let jmapConfig;
    try {
      jmapConfig = await getJMAPConfig();
    } catch (error) {
      return NextResponse.json(
        { error: 'Email service not configured. Please configure email settings in Settings page.' },
        { status: 503 }
      );
    }

    const now = new Date();
    const results = [];

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

        const companyName = process.env.COMPANY_NAME || 'Freelance-OS';
        const portalUrl = process.env.CLIENT_PORTAL_URL || process.env.NEXTAUTH_URL;

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

        const companyName = process.env.COMPANY_NAME || 'Freelance-OS';
        const portalUrl = process.env.CLIENT_PORTAL_URL || process.env.NEXTAUTH_URL;

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

    return NextResponse.json({
      success: true,
      type,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('Error sending reminders:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        error: 'Failed to send reminders',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
