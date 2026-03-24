'use client';

import { ChangeEvent, memo, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  APIFooter,
  Badge,
  Breadcrumbs,
  Button,
  EmptySurfaceState,
  Page,
  PageContent,
  PageError,
  PageHeader,
  PageLoading,
  Section,
  Select,
  Surface,
} from '@repo/ui';
import {
  BriefcaseBusiness,
  CalendarRange,
  ChevronRight,
  Clock3,
  Filter,
  FolderKanban,
  Plus,
  Trash2,
} from 'lucide-react';
import { generateCode } from '@/lib/ai-actions';
import { formatDate } from '@/lib/datetime';
import { authFetch } from '@/lib/util';

type Client = {
  id: number;
  name: string;
  email: string;
};

type Project = {
  id: number;
  name: string;
  clientDescription: string | null;
  privateNotes: string | null;
  status: string;
  color: string;
  startDate: string | null;
  endDate: string | null;
  client: Client;
  totalHours: number;
  _count: {
    timeEntries: number;
  };
};

const statusVariants = {
  active: 'success',
  completed: 'info',
  'on-hold': 'warning',
} as const;

const statusSortOrder: Record<string, number> = {
  active: 0,
  'on-hold': 1,
  completed: 2,
};

function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const statusDiff = (statusSortOrder[a.status] ?? 99) - (statusSortOrder[b.status] ?? 99);
    if (statusDiff !== 0) return statusDiff;

    // Within the same status group, sort by startDate descending (most recent first)
    if (a.startDate && b.startDate) return b.startDate.localeCompare(a.startDate);
    if (a.startDate) return -1; // a has a date, b doesn't → a comes first
    if (b.startDate) return 1;  // b has a date, a doesn't → b comes first
    return 0;
  });
}

const statusLabels = {
  active: 'Active',
  completed: 'Completed',
  'on-hold': 'On hold',
} as const;

function ProjectStatusBadge({ status }: { status: string }) {
  const variant = statusVariants[status as keyof typeof statusVariants] ?? 'default';
  const label = statusLabels[status as keyof typeof statusLabels] ?? status;

  return (
    <Badge variant={variant} size="sm">
      {label}
    </Badge>
  );
}

function formatProjectDate(dateString: string | null) {
  if (!dateString) return null;
  return formatDate(dateString, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const ProjectCard = memo(function ProjectCard({
  project,
  onDelete,
}: {
  project: Project;
  onDelete: (id: number) => void;
}) {
  const handleDelete = useCallback(() => {
    onDelete(project.id);
  }, [onDelete, project.id]);

  const startLabel = formatProjectDate(project.startDate);
  const endLabel = formatProjectDate(project.endDate);

  return (
    <Surface interactive className="overflow-hidden p-0">
      <div className="flex h-full">
        <div className="w-1.5 shrink-0" style={{ backgroundColor: project.color || '#22C55E' }} />
        <div className="flex flex-1 flex-col gap-5 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color || '#22C55E' }}
                  aria-hidden="true"
                />
                <Link href={`/projects/${project.id}`} className="min-w-0">
                  <h2 className="truncate text-xl font-semibold text-slate-900 transition-colors hover:text-blue-600 dark:text-white dark:hover:text-blue-400">
                    {project.name}
                  </h2>
                </Link>
                <ProjectStatusBadge status={project.status} />
              </div>

              {project.clientDescription ? (
                <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">{project.clientDescription}</p>
              ) : null}

              {project.privateNotes ? (
                <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                  <span className="font-medium">Private notes:</span> {project.privateNotes}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2 self-start">
              <Link href={`/projects/${project.id}?edit=true`}>
                <Button variant="secondary" size="sm">Edit</Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                leftIcon={<Trash2 className="h-4 w-4" />}
                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
              >
                Delete
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/80">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                <BriefcaseBusiness className="h-3.5 w-3.5" />
                Client
              </div>
              <Link href={`/clients/${project.client.id}`} className="font-medium text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400">
                {project.client.name}
              </Link>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/80">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                <Clock3 className="h-3.5 w-3.5" />
                Time entries
              </div>
              <div className="text-lg font-semibold text-slate-900 dark:text-white">{project._count.timeEntries}</div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/80">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                <FolderKanban className="h-3.5 w-3.5" />
                Total hours
              </div>
              <div className="text-lg font-semibold text-slate-900 dark:text-white">{project.totalHours}</div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/80">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                <CalendarRange className="h-3.5 w-3.5" />
                Schedule
              </div>
              <div className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                <div>{startLabel ? `Start · ${startLabel}` : 'No start date'}</div>
                <div>{endLabel ? `End · ${endLabel}` : 'No end date'}</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-white/10">
            <div className="text-sm text-slate-500 dark:text-slate-400">Open project details to review entries, summaries, and edit settings.</div>
            <Link href={`/projects/${project.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
              View project
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </Surface>
  );
});

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterClient, setFilterClient] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('active');

  const fetchClients = useCallback(async () => {
    try {
      const res = await authFetch('/api/clients');
      if (!res.ok) throw new Error('Failed to fetch clients');
      const data = await res.json();
      setClients(data);
    } catch (err) {
      console.error('Error fetching clients:', err);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filterClient) params.append('clientId', filterClient);
      if (filterStatus) params.append('status', filterStatus);

      const url = `/api/projects${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await authFetch(url);

      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [filterClient, filterStatus]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Are you sure you want to delete this project? This will also delete all associated time entries.')) {
      return;
    }

    try {
      const res = await authFetch(`/api/projects/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete project');

      const result = await res.json();
      alert(`Project deleted successfully. ${result.deletedTimeEntries} time entries were also deleted.`);
      fetchProjects();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete project');
    }
  }, [fetchProjects]);

  const projectCountLabel = useMemo(() => {
    if (projects.length === 1) return '1 project';
    return `${projects.length} projects`;
  }, [projects.length]);

  const handleGenerateCode = async (endpoint: any, language: string) => {
    return await generateCode(endpoint, language);
  };

  if (loading && projects.length === 0) {
    return <PageLoading title="Loading projects" message="Fetching projects, clients, and activity counts." />;
  }

  if (error) {
    return (
      <Page>
        <PageContent>
          <PageError title="Couldn’t load projects" message={error} retry={fetchProjects} />
        </PageContent>
      </Page>
    );
  }

  return (
    <Page>
      <PageContent>
        <Section className="space-y-6">
          <Breadcrumbs items={[{ label: 'Projects' }]} LinkComponent={Link as any} />

          <PageHeader
            eyebrow="Admin dashboard"
            title="Projects"
            description="Track delivery status, monitor billable effort, and keep each engagement aligned with its client record."
            actions={
              <Link href="/projects/new">
                <Button leftIcon={<Plus className="h-4 w-4" />}>New Project</Button>
              </Link>
            }
          />

          <Surface className="space-y-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <Filter className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  Filters
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Narrow the project list by client or current delivery status.</p>
              </div>
              <Badge variant="subtle" size="sm">{projectCountLabel}</Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Select label="Client" value={filterClient} onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilterClient(e.target.value)}>
                <option value="">All clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>

              <Select label="Status" value={filterStatus} onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilterStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="on-hold">On hold</option>
              </Select>

              <div className="flex items-end">
                <Button
                  variant="secondary"
                  size="md"
                  className="w-full md:w-auto"
                  onClick={() => {
                    setFilterClient('');
                    setFilterStatus('');
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </div>
          </Surface>

          {projects.length === 0 ? (
            <EmptySurfaceState
              icon={<FolderKanban className="h-16 w-16" />}
              title="No projects found"
              description="Create your first project to start organizing work, tracking time entries, and connecting activity back to clients."
              action={
                <Link href="/projects/new">
                  <Button leftIcon={<Plus className="h-4 w-4" />}>Create your first project</Button>
                </Link>
              }
            />
          ) : (
            <div className="grid gap-5">
              {sortProjects(projects).map((project) => (
                <ProjectCard key={project.id} project={project} onDelete={handleDelete} />
              ))}
            </div>
          )}

          <APIFooter
            enableApiKeys
            enableCodeGen
            onGenerateApiKey={() => {
              window.location.href = '/api-demo';
            }}
            onGenerateCode={handleGenerateCode}
            endpoints={[
              {
                method: 'GET',
                path: '/projects',
                description: 'List all projects with optional filtering',
                queryParams: [
                  {
                    name: 'clientId',
                    type: 'number',
                    description: 'Filter projects by client ID',
                  },
                  {
                    name: 'status',
                    type: 'string',
                    enum: ['active', 'completed', 'on-hold'],
                    description: 'Filter by project status',
                  },
                  {
                    name: 'sortBy',
                    type: 'string',
                    enum: ['name', 'startDate', 'endDate', 'createdAt'],
                    description: 'Sort field (default: createdAt desc)',
                  },
                ],
              },
              {
                method: 'POST',
                path: '/projects',
                description: 'Create a new project',
                body: JSON.stringify(
                  {
                    name: 'Project Name',
                    clientId: 1,
                    clientDescription: 'Description visible to client',
                    privateNotes: 'Internal notes',
                    status: 'active',
                    color: '#22C55E',
                    startDate: '2025-01-01',
                    endDate: '2025-12-31',
                  },
                  null,
                  2
                ),
              },
              {
                method: 'GET',
                path: '/projects/{id}',
                description: 'Get a specific project with time entries',
              },
              {
                method: 'PUT',
                path: '/projects/{id}',
                description: 'Update a project',
                body: JSON.stringify(
                  {
                    name: 'Updated Project Name',
                    status: 'completed',
                  },
                  null,
                  2
                ),
              },
              {
                method: 'DELETE',
                path: '/projects/{id}',
                description: 'Delete a project (cascades to time entries)',
              },
            ]}
          />
        </Section>
      </PageContent>
    </Page>
  );
}
