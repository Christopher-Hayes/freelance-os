import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@freelance-os/database';

// Helper function to generate invoice number
function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `INV-${year}${month}${day}-${random}`;
}

// POST /api/invoices/generate - Auto-generate invoice from time entries
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      clientId,
      projectId,
      startDate,
      endDate,
      hourlyRate,
      currency = 'USD',
      notes,
      dueInDays = 30,
    } = body;

    // Validation
    if (!clientId || !hourlyRate) {
      return NextResponse.json(
        { error: 'Missing required fields: clientId, hourlyRate' },
        { status: 400 }
      );
    }

    if (!startDate && !endDate && !projectId) {
      return NextResponse.json(
        { error: 'Must provide either projectId or date range (startDate/endDate)' },
        { status: 400 }
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
        return NextResponse.json(
          { error: 'Project not found' },
          { status: 404 }
        );
      }

      if (project.clientId !== clientId) {
        return NextResponse.json(
          { error: 'Project does not belong to the specified client' },
          { status: 400 }
        );
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
      return NextResponse.json(
        { error: 'No billable time entries found for the specified criteria' },
        { status: 404 }
      );
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
      return NextResponse.json(
        { error: 'Failed to generate unique invoice number' },
        { status: 500 }
      );
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
    const serializedInvoice = {
      ...invoice,
      amount: invoice.amount.toNumber(),
      summary: {
        totalHours: parseFloat(totalHours.toFixed(2)),
        hourlyRate,
        timeEntriesCount: timeEntries.length,
      },
    };

    return NextResponse.json(serializedInvoice, { status: 201 });
  } catch (error) {
    console.error('Error generating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to generate invoice' },
      { status: 500 }
    );
  }
}
