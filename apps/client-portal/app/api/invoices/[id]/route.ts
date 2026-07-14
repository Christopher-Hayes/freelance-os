import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { getClientAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authData = await getClientAuth();
    if (!authData) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const invoiceId = parseInt(id);

    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });
    }

    // Fetch invoice with client verification
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        clientId: authData.clientId, // CRITICAL: Verify this invoice belongs to this client
      },
      include: {
        client: {
          select: {
            name: true,
            company: true,
            email: true,
          },
        },
        projects: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                clientDescription: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found or access denied" },
        { status: 404 }
      );
    }

    // Calculate if invoice is overdue
    const now = new Date();
    const isOverdue =
      invoice.status !== "paid" &&
      invoice.status !== "cancelled" &&
      invoice.dueDate < now;

    const { projects, ...invoiceRest } = invoice;
    return NextResponse.json({
      ...invoiceRest,
      projects: projects.map(ip => ip.project),
      isOverdue,
    });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoice" },
      { status: 500 }
    );
  }
}
