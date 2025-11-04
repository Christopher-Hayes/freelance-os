import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import { renderToStream } from '@react-pdf/renderer';
import { InvoicePDF } from '@repo/ui/InvoicePDF';
import type { InvoicePDFData } from '@repo/ui/InvoicePDF';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const invoiceId = parseInt(id);

    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }

    // Fetch invoice with related data
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: {
          select: {
            name: true,
            email: true,
            company: true,
          },
        },
        project: {
          select: {
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

    // Transform data to match PDF component expectations
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
      project: invoice.project,
    };

    // Generate PDF stream
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
        'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
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
