import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { prisma } from "@freelance-os/database";

interface TimeEntry {
  id: number;
  description: string | null;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  billable: boolean;
}

interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  totalHours: string;
  createdAt: Date;
  updatedAt: Date;
  client: {
    name: string;
    email: string;
  };
  recentTimeEntries: TimeEntry[];
}

async function getProject(id: string): Promise<Project> {
  const session = await auth();

  if (!session?.user?.clientId) {
    redirect("/auth/signin");
  }

  const idNum = parseInt(id, 10);

  if (isNaN(idNum)) {
    notFound();
  }

  // CRITICAL: Verify the project belongs to the authenticated client
  const project = await prisma.project.findUnique({
    where: {
      id: idNum,
    },
    include: {
      client: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!project) {
    notFound();
  }

  // CRITICAL: Security check - ensure project belongs to this client
  if (project.clientId !== session.user.clientId) {
    notFound();
  }

  // Get total hours for this project
  const totalMinutes = await prisma.timeEntry.aggregate({
    where: {
      projectId: idNum,
    },
    _sum: {
      durationMinutes: true,
    },
  });

  // Get recent time entries (last 10)
  const recentTimeEntries = await prisma.timeEntry.findMany({
    where: {
      projectId: idNum,
    },
    orderBy: {
      startTime: "desc",
    },
    take: 10,
  });

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    client: project.client,
    totalHours: totalMinutes._sum?.durationMinutes
      ? (totalMinutes._sum.durationMinutes / 60).toFixed(2)
      : "0.00",
    recentTimeEntries,
  };
}

function StatusBadge({ status }: { status: string }) {
  const statusStyles: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    ON_HOLD:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    COMPLETED:
      "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
        statusStyles[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back button */}
        <Link
          href="/projects"
          className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          ← Back to Projects
        </Link>

        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {project.name}
              </h1>
              {project.description && (
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  {project.description}
                </p>
              )}
            </div>
            <StatusBadge status={project.status} />
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Total Hours
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {project.totalHours}h
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Time Entries
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {project.recentTimeEntries.length}
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Client</dt>
                <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                  {project.client.name}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Email</dt>
                <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                  {project.client.email}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Created</dt>
                <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                  {new Date(project.createdAt).toLocaleDateString()}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">
                  Last Updated
                </dt>
                <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                  {new Date(project.updatedAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Recent Time Entries */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Recent Time Entries
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Last 10 time entries for this project
            </p>
          </div>

          {project.recentTimeEntries.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                No time entries yet
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Billable
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {project.recentTimeEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {new Date(entry.startTime).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                        {entry.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {(entry.durationMinutes / 60).toFixed(2)}h
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {entry.billable ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:text-green-300">
                            Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:text-gray-300">
                            No
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {project.recentTimeEntries.length > 0 && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-700">
              <Link
                href="/time"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                View all time entries →
              </Link>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
