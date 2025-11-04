import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import { sendEmail, generateInvoiceSentEmail } from '@freelance-os/email';
import { getJMAPConfig, getCompanyName } from '@/lib/email';

// GET /api/invoices/[id] - Get a single invoice
export async function GET(
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

    // Convert Decimal to number for JSON serialization
    const serializedInvoice = {
      ...invoice,
      amount: invoice.amount.toNumber(),
    };

    return NextResponse.json(serializedInvoice);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoice' },
      { status: 500 }
    );
  }
}

// PUT /api/invoices/[id] - Update an invoice
export async function PUT(
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

    const body = await request.json();
    const { amount, status, dueDate, paidDate, notes, sendEmail: shouldSendEmail = false } = body;

    // Verify invoice exists
    const existingInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!existingInvoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: any = {};
    
    if (amount !== undefined) updateData.amount = amount;
    if (status !== undefined) updateData.status = status;
    if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
    if (paidDate !== undefined) {
      updateData.paidDate = paidDate ? new Date(paidDate) : null;
    }
    if (notes !== undefined) updateData.notes = notes;

    // If status is being set to 'paid' and paidDate is not provided, set it to now
    if (status === 'paid' && !paidDate && !existingInvoice.paidDate) {
      updateData.paidDate = new Date();
    }

    const invoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: updateData,
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

    // Send email notification if status changed to 'sent' OR if explicitly requested
    const statusChangedToSent = status === 'sent' && existingInvoice.status !== 'sent';
    if (statusChangedToSent || shouldSendEmail) {
      try {
        const jmapConfig = await getJMAPConfig();
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

        await sendEmail(jmapConfig, {
          to: invoice.client.email,
          ...emailContent,
        });

        console.log(`[Invoice] Email sent to ${invoice.client.email} for invoice ${invoice.invoiceNumber}`);
      } catch (emailError) {
        console.error('[Invoice] Failed to send email notification:', emailError);
        // Don't fail the request if email fails - log and continue
      }
    }

    // Convert Decimal to number for JSON serialization
    const serializedInvoice = {
      ...invoice,
      amount: invoice.amount.toNumber(),
    };

    return NextResponse.json(serializedInvoice);
  } catch (error) {
    console.error('Error updating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to update invoice' },
      { status: 500 }
    );
  }
}

// DELETE /api/invoices/[id] - Delete an invoice
export async function DELETE(
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

    // Verify invoice exists
    const existingInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!existingInvoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    await prisma.invoice.delete({
      where: { id: invoiceId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return NextResponse.json(
      { error: 'Failed to delete invoice' },
      { status: 500 }
    );
  }
}
