import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';

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
        projects: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
              },
            },
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
    const { projects, ...invoiceRest } = invoice;
    const serializedInvoice = {
      ...invoiceRest,
      amount: invoice.amount.toNumber(),
      projects: projects.map(ip => ip.project),
      projectIds: projects.map(ip => ip.projectId),
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
    const { name, amount, status, issueDate, dueDate, paidDate, notes, aiSummary, projectIds } = body;

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

    // Verify projects exist and belong to the invoice's client, if provided
    if (projectIds !== undefined) {
      const uniqueProjectIds: number[] = Array.isArray(projectIds)
        ? [...new Set(projectIds.map((pid: any) => Number(pid)))]
        : [];

      if (uniqueProjectIds.length > 0) {
        const matchingProjects = await prisma.project.findMany({
          where: { id: { in: uniqueProjectIds } },
        });

        if (matchingProjects.length !== uniqueProjectIds.length) {
          return NextResponse.json(
            { error: 'One or more projects not found' },
            { status: 404 }
          );
        }

        if (matchingProjects.some(p => p.clientId !== existingInvoice.clientId)) {
          return NextResponse.json(
            { error: 'One or more projects do not belong to this invoice\'s client' },
            { status: 400 }
          );
        }
      }
    }

    // Build update data
    const updateData: any = {};

    if (name !== undefined) updateData.name = name || null;
    if (amount !== undefined) updateData.amount = amount;
    if (status !== undefined) updateData.status = status;
    if (issueDate !== undefined) updateData.issueDate = new Date(issueDate);
    if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
    if (paidDate !== undefined) {
      updateData.paidDate = paidDate ? new Date(paidDate) : null;
    }
    if (notes !== undefined) updateData.notes = notes;
    if (aiSummary !== undefined) updateData.aiSummary = aiSummary;
    if (projectIds !== undefined) {
      const uniqueProjectIds: number[] = Array.isArray(projectIds)
        ? [...new Set(projectIds.map((pid: any) => Number(pid)))]
        : [];
      updateData.projects = {
        deleteMany: {},
        create: uniqueProjectIds.map(projectId => ({ projectId })),
      };
    }

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
        projects: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Convert Decimal to number for JSON serialization
    const { projects, ...invoiceRest } = invoice;
    const serializedInvoice = {
      ...invoiceRest,
      amount: invoice.amount.toNumber(),
      projects: projects.map(ip => ip.project),
      projectIds: projects.map(ip => ip.projectId),
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
