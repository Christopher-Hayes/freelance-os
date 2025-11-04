import { NextResponse } from "next/server";
import { prisma } from "@freelance-os/database";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.clientId) {
      return NextResponse.json(
        { error: "Unauthorized - No client linked to account" },
        { status: 401 }
      );
    }

    const clientId = session.user.clientId;

    // Get client information
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
      },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    // Calculate date ranges (start of current month to start of next month)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Get projects summary
    const projects = await prisma.project.findMany({
      where: { clientId },
      select: {
        id: true,
        name: true,
        status: true,
        color: true,
        startDate: true,
        endDate: true,
        _count: {
          select: {
            timeEntries: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const activeProjects = projects.filter((p) => p.status === "active").length;
    const totalProjects = projects.length;

    // Get recent time entries (last 10)
    const recentTimeEntries = await prisma.timeEntry.findMany({
      where: {
        project: { clientId },
      },
      include: {
        project: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { startTime: "desc" },
      take: 10,
    });

    // Get total hours this month
    const monthTimeEntries = await prisma.timeEntry.findMany({
      where: {
        project: { clientId },
        startTime: {
          gte: monthStart,
          lt: monthEnd,
        },
      },
      select: {
        durationMinutes: true,
      },
    });

    const totalMinutesThisMonth = monthTimeEntries.reduce(
      (sum, entry) => sum + entry.durationMinutes,
      0
    );
    const totalHoursThisMonth = totalMinutesThisMonth / 60;

    // Get invoices summary
    const invoices = await prisma.invoice.findMany({
      where: { clientId },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        amount: true,
        issueDate: true,
        dueDate: true,
      },
      orderBy: { issueDate: "desc" },
      take: 5,
    });

    const unpaidInvoices = invoices.filter((inv) => inv.status === "SENT" || inv.status === "OVERDUE");
    const totalUnpaid = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);

    // Count overdue invoices
    const nowDate = new Date();
    const overdueInvoices = invoices.filter(
      (inv) => (inv.status === "SENT" || inv.status === "OVERDUE") && inv.dueDate && inv.dueDate < nowDate
    );

    return NextResponse.json({
      client,
      summary: {
        totalProjects,
        activeProjects,
        totalHoursThisMonth: parseFloat(totalHoursThisMonth.toFixed(2)),
        unpaidInvoicesCount: unpaidInvoices.length,
        totalUnpaid: parseFloat(totalUnpaid.toFixed(2)),
        overdueInvoicesCount: overdueInvoices.length,
      },
      recentTimeEntries: recentTimeEntries.map((entry) => ({
        id: entry.id,
        projectName: entry.project.name,
        description: entry.description,
        startTime: entry.startTime.toISOString(),
        endTime: entry.endTime?.toISOString() || null,
        durationMinutes: entry.durationMinutes,
        durationHours: parseFloat((entry.durationMinutes / 60).toFixed(2)),
        billable: entry.billable,
      })),
      recentInvoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        amount: parseFloat(Number(inv.amount).toFixed(2)),
        issueDate: inv.issueDate.toISOString(),
        dueDate: inv.dueDate?.toISOString() || null,
      })),
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        color: p.color,
        timeEntriesCount: p._count.timeEntries,
      })),
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
