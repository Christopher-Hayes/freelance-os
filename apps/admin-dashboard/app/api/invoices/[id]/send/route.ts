import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import { sendEmail, generateInvoiceSentEmail } from '@freelance-os/email';

// POST /api/invoices/[id]/send - Send invoice email to client
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoiceId = parseInt(id);

    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }

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
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Check if JMAP is configured
    if (!process.env.JMAP_TOKEN || !process.env.JMAP_USERNAME) {
      return NextResponse.json(
        { error: 'Email service not configured. Please set JMAP_TOKEN and JMAP_USERNAME environment variables.' },
        { status: 503 }
      );
    }

    // Generate email content
    const companyName = process.env.COMPANY_NAME || 'Freelance-OS';
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
    await sendEmail({
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

    return NextResponse.json({
      success: true,
      message: `Invoice sent to ${invoice.client.email}`,
      invoice: {
        ...updatedInvoice,
        amount: updatedInvoice.amount.toNumber(),
      },
    });
  } catch (error) {
    console.error('Error sending invoice email:', error);
    
    // Return helpful error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        error: 'Failed to send invoice email',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
