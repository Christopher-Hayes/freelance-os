import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';

// GET /api/invoices - List all invoices with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');

    const where: any = {};
    
    if (clientId) {
      where.clientId = parseInt(clientId);
    }
    
    if (projectId) {
      where.projectId = parseInt(projectId);
    }
    
    if (status) {
      where.status = status;
    }

    const invoices = await prisma.invoice.findMany({
      where,
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
      orderBy: {
        issueDate: 'desc',
      },
    });

    // Convert Decimal to number for JSON serialization
    const serializedInvoices = invoices.map(invoice => ({
      ...invoice,
      amount: invoice.amount.toNumber(),
    }));

    return NextResponse.json(serializedInvoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}

// POST /api/invoices - Create a new invoice
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      invoiceNumber,
      clientId,
      projectId,
      amount,
      currency = 'USD',
      status = 'draft',
      issueDate,
      dueDate,
      paidDate,
      notes,
    } = body;

    // Validation
    if (!invoiceNumber || !clientId || !amount || !issueDate || !dueDate) {
      return NextResponse.json(
        { error: 'Missing required fields: invoiceNumber, clientId, amount, issueDate, dueDate' },
        { status: 400 }
      );
    }

    // Check if invoice number already exists
    const existingInvoice = await prisma.invoice.findUnique({
      where: { invoiceNumber },
    });

    if (existingInvoice) {
      return NextResponse.json(
        { error: 'Invoice number already exists' },
        { status: 409 }
      );
    }

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    // Verify project exists if provided
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        return NextResponse.json(
          { error: 'Project not found' },
          { status: 404 }
        );
      }

      // Verify project belongs to client
      if (project.clientId !== clientId) {
        return NextResponse.json(
          { error: 'Project does not belong to the specified client' },
          { status: 400 }
        );
      }
    }

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        clientId,
        projectId: projectId || null,
        amount,
        currency,
        status,
        issueDate: new Date(issueDate),
        dueDate: new Date(dueDate),
        paidDate: paidDate ? new Date(paidDate) : null,
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
    const serializedInvoice = {
      ...invoice,
      amount: invoice.amount.toNumber(),
    };

    return NextResponse.json(serializedInvoice, { status: 201 });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to create invoice' },
      { status: 500 }
    );
  }
}
