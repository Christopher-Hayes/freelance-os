import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { prisma } from "@freelance-os/database";

interface Project {
  id: number;
  name: string;
  clientDescription: string | null;
  status: string;
  totalHours: string;
  createdAt: Date;
  client: {
    name: string;
  };
  _count: {
    timeEntries: number;
  };
}

async function getProjects(): Promise<Project[]> {
  const session = await auth();

  if (!session?.user?.clientId) {
    redirect("/auth/signin");
  }

  // CRITICAL: Only fetch projects for the authenticated client
  // Explicitly select fields to prevent exposing privateNotes
  const projects = await prisma.project.findMany({
    where: {
      clientId: session.user.clientId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      name: true,
      clientDescription: true,
      // privateNotes: NEVER select this field in client portal!
      status: true,
      createdAt: true,
      client: {
        select: {
          name: true,
        },
      },
      _count: {
        select: {
          timeEntries: true,
        },
      },
    },
  });

  // Calculate total hours for each project
  const projectsWithHours: Project[] = await Promise.all(
    projects.map(async (project) => {
      const totalMinutes = await prisma.timeEntry.aggregate({
        where: {
          projectId: project.id,
        },
        _sum: {
          durationMinutes: true,
        },
      });

      return {
        id: project.id,
        name: project.name,
        clientDescription: project.clientDescription,
        status: project.status,
        createdAt: project.createdAt,
        client: project.client,
        _count: project._count,
        totalHours: totalMinutes._sum?.durationMinutes
          ? (totalMinutes._sum.durationMinutes / 60).toFixed(2)
          : "0.00",
      };
    })
  );

  return projectsWithHours;
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
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        statusStyles[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Projects
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            View all your projects and track progress
          </p>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              No projects found. Contact your administrator to create a project.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm transition hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600"
              >
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {project.name}
                  </h3>
                  <StatusBadge status={project.status} />
                </div>

                {project.clientDescription && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {project.clientDescription}
                  </p>
                )}

                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      Total Hours:
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {project.totalHours}h
                    </span>
                  </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    Time Entries:
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {project._count.timeEntries}
                  </span>
                </div>
              </div>                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Created {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
