import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { getClientAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const authData = await getClientAuth();
    if (!authData) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");

    // Build query filter
    const where: any = {
      clientId: authData.clientId, // CRITICAL: Only show this client's invoices
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
        projects: {
          include: {
            project: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        issueDate: "desc",
      },
    });

    // Calculate if invoice is overdue (unpaid invoices past due date)
    const now = new Date();
    const invoicesWithOverdue = invoices.map(({ projects, ...invoice }) => ({
      ...invoice,
      projects: projects.map(ip => ip.project),
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
