import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { auth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get session and verify user is authenticated
    const session = await auth();
    if (!session?.user?.clientId) {
      return NextResponse.json(
        { error: "Unauthorized - No client ID in session" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const clientId = session.user.clientId;
    const invoiceId = parseInt(id);

    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: "Invalid invoice ID" }, { status: 400 });
    }

    // Fetch invoice with client verification
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        clientId: clientId, // CRITICAL: Verify this invoice belongs to this client
      },
      include: {
        client: {
          select: {
            name: true,
            company: true,
            email: true,
          },
        },
        project: {
          select: {
            name: true,
            description: true,
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

    return NextResponse.json({
      ...invoice,
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
