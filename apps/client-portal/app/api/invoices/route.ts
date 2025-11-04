import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // Get session and verify user is authenticated
    const session = await auth();
    if (!session?.user?.clientId) {
      return NextResponse.json(
        { error: "Unauthorized - No client ID in session" },
        { status: 401 }
      );
    }

    const clientId = session.user.clientId;
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");

    // Build query filter
    const where: any = {
      clientId: clientId, // CRITICAL: Only show this client's invoices
    };

    // Add status filter if provided
    if (status && status !== "all") {
      where.status = status;
    }

    // Fetch invoices
    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        client: {
          select: {
            name: true,
            company: true,
          },
        },
        project: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        issueDate: "desc",
      },
    });

    // Calculate if invoice is overdue (unpaid invoices past due date)
    const now = new Date();
    const invoicesWithOverdue = invoices.map((invoice) => ({
      ...invoice,
      isOverdue:
        invoice.status !== "paid" &&
        invoice.status !== "cancelled" &&
        invoice.dueDate < now,
    }));

    return NextResponse.json(invoicesWithOverdue);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}
