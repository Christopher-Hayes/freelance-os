import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';
import { getAdminAuth, hasPermission } from '@/lib/auth';

// GET /api/invoices - List all invoices with optional filters
export async function GET(request: NextRequest) {
  try {
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

		if (!hasPermission(authData, 'read:invoices')) {
			return NextResponse.json({ error: 'Forbidden - Missing permission: read:invoices' }, { status: 403 });
		}

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');

    const where: any = {};

    if (clientId) {
      where.clientId = parseInt(clientId);
    }

    if (projectId) {
      where.projects = { some: { projectId: parseInt(projectId) } };
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
      orderBy: {
        issueDate: 'desc',
      },
    });

    // Count each client's total projects so we can tell whether an invoice's
    // selection covers all of them (vs. happening to list every one by name).
    const projectCounts = await prisma.project.groupBy({
      by: ['clientId'],
      _count: { id: true },
      where: { clientId: { in: [...new Set(invoices.map(inv => inv.clientId))] } },
    });
    const projectCountByClientId = new Map(projectCounts.map(pc => [pc.clientId, pc._count.id]));

    // Convert Decimal to number for JSON serialization; flatten the
    // InvoiceProject join rows into a simple projects/projectIds array
    const serializedInvoices = invoices.map(({ projects, ...invoice }) => {
      const clientProjectCount = projectCountByClientId.get(invoice.clientId) ?? 0;
      return {
        ...invoice,
        amount: invoice.amount.toNumber(),
        projects: projects.map(ip => ip.project),
        projectIds: projects.map(ip => ip.projectId),
        isAllProjects: projects.length === 0
          || (clientProjectCount > 0 && projects.length === clientProjectCount),
      };
    });

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
    const authData = await getAdminAuth();
    if (!authData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

		if (!hasPermission(authData, 'write:invoices')) {
			return NextResponse.json({ error: 'Forbidden - Missing permission: write:invoices' }, { status: 403 });
		}

    const body = await request.json();
    const {
      invoiceNumber,
      name,
      clientId,
      projectIds,
      amount,
      currency = 'USD',
      status = 'draft',
      issueDate,
      dueDate,
      paidDate,
      notes,
    } = body;

    const uniqueProjectIds: number[] = Array.isArray(projectIds)
      ? [...new Set(projectIds.map((id: any) => Number(id)))]
      : [];

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

    // Verify projects exist and belong to the client, if provided
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

      if (matchingProjects.some(p => p.clientId !== clientId)) {
        return NextResponse.json(
          { error: 'One or more projects do not belong to the specified client' },
          { status: 400 }
        );
      }
    }

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        name: name || null,
        clientId,
        amount,
        currency,
        status,
        issueDate: new Date(issueDate),
        dueDate: new Date(dueDate),
        paidDate: paidDate ? new Date(paidDate) : null,
        notes,
        projects: {
          create: uniqueProjectIds.map(projectId => ({ projectId })),
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

    return NextResponse.json(serializedInvoice, { status: 201 });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to create invoice' },
      { status: 500 }
    );
  }
}
