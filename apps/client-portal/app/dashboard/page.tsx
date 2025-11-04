import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StatCard } from "./components/StatCard";
import { ProjectsSummary } from "./components/ProjectsSummary";
import { RecentTimeEntries } from "./components/RecentTimeEntries";
import { InvoicesSummary } from "./components/InvoicesSummary";
import { DashboardLayout } from "@/components/DashboardLayout";
import { prisma } from "@freelance-os/database";

interface DashboardData {
  client: {
    id: number;
    name: string;
    email: string;
    company: string | null;
  };
  summary: {
    totalProjects: number;
    activeProjects: number;
    totalHoursThisMonth: number;
    unpaidInvoicesCount: number;
    totalUnpaid: number;
    overdueInvoicesCount: number;
  };
  recentTimeEntries: Array<{
    id: number;
    projectName: string;
    description: string | null;
    startTime: string;
    durationHours: number;
    billable: boolean;
  }>;
  recentInvoices: Array<{
    id: number;
    invoiceNumber: string;
    status: string;
    amount: number;
    issueDate: string;
    dueDate: string | null;
  }>;
  projects: Array<{
    id: number;
    name: string;
    status: string;
    color: string;
    timeEntriesCount: number;
  }>;
}

async function getDashboardData(clientId: number): Promise<DashboardData | null> {
  try {
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
      return null;
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

    const unpaidInvoices = invoices.filter((inv) => inv.status === "sent" || inv.status === "SENT");
    const totalUnpaid = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);

    // Count overdue invoices
    const nowDate = new Date();
    const overdueInvoices = invoices.filter(
      (inv) => (inv.status === "sent" || inv.status === "SENT") && inv.dueDate && inv.dueDate < nowDate
    );

    return {
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
    };
  } catch (error) {
    console.error("Failed to fetch dashboard data:", error);
    return null;
  }
}

export default async function DashboardPage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect("/auth/signin");
  }

  // Show warning if user is not linked to a client
  if (!session.user.clientId) {
    return (
      <DashboardLayout>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-8">
          <h2 className="text-xl font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
            Account Not Linked
          </h2>
          <p className="text-yellow-800 dark:text-yellow-300">
            Your account is not yet linked to a client. Please contact an administrator to get access.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const dashboardData = await getDashboardData(session.user.clientId);

  return (
    <DashboardLayout>
      {!dashboardData ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-8">
          <h2 className="text-xl font-semibold text-red-900 dark:text-red-200 mb-2">
            Error Loading Dashboard
          </h2>
          <p className="text-red-800 dark:text-red-300">
            Unable to load your dashboard data. Please try again later.
          </p>
        </div>
      ) : (
        <>
          {/* Welcome Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Welcome back, {dashboardData.client.name}
            </h2>
            {dashboardData.client.company && (
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {dashboardData.client.company}
              </p>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="Active Projects"
              value={dashboardData.summary.activeProjects}
              subtitle={`${dashboardData.summary.totalProjects} total`}
              variant="success"
            />
            <StatCard
              title="Hours This Month"
              value={`${dashboardData.summary.totalHoursThisMonth}h`}
              variant="default"
            />
            <StatCard
              title="Unpaid Invoices"
              value={`$${dashboardData.summary.totalUnpaid.toLocaleString()}`}
              subtitle={`${dashboardData.summary.unpaidInvoicesCount} invoices`}
              variant={dashboardData.summary.unpaidInvoicesCount > 0 ? "warning" : "default"}
            />
            <StatCard
              title="Overdue Invoices"
              value={dashboardData.summary.overdueInvoicesCount}
              variant={dashboardData.summary.overdueInvoicesCount > 0 ? "danger" : "success"}
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProjectsSummary projects={dashboardData.projects} />
            <RecentTimeEntries entries={dashboardData.recentTimeEntries} />
          </div>

          {/* Invoices Section */}
          <div className="mt-6">
            <InvoicesSummary invoices={dashboardData.recentInvoices} />
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
