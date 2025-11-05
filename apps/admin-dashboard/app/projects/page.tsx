'use client';

import { useEffect, useState, useMemo, useCallback, memo } from 'react';
import Link from 'next/link';

type Client = {
  id: number;
  name: string;
  email: string;
};

type Project = {
  id: number;
  name: string;
  description: string | null;
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

const statusColors = {
  active: 'bg-green-100 text-green-800',
  completed: 'bg-blue-100 text-blue-800',
  'on-hold': 'bg-yellow-100 text-yellow-800',
};

const statusLabels = {
  active: 'Active',
  completed: 'Completed',
  'on-hold': 'On Hold',
};

// Memoized ProjectCard component
const ProjectCard = memo(function ProjectCard({
  project,
  onDelete,
}: {
  project: Project;
  onDelete: (id: number) => void;
}) {
  const handleDelete = useCallback(() => {
    onDelete(project.id);
  }, [project.id, onDelete]);

  return (
    <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg overflow-hidden hover:shadow-md dark:hover:shadow-gray-900 transition-shadow">
      {/* Color accent bar on the left */}
      <div className="flex">
        <div 
          className="w-1.5 shrink-0" 
          style={{ backgroundColor: project.color || '#22C55E' }}
        />
        <div className="flex-1 p-6">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {/* Color dot indicator */}
                <div 
                  className="w-3 h-3 rounded-full shrink-0" 
                  style={{ backgroundColor: project.color || '#22C55E' }}
                />
                <Link href={`/projects/${project.id}`}>
                  <h2 className="text-xl font-semibold dark:text-white hover:text-blue-600 dark:hover:text-blue-400">
                    {project.name}
                  </h2>
                </Link>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded ${
                    statusColors[project.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {statusLabels[project.status as keyof typeof statusLabels] || project.status}
                </span>
              </div>
              {project.description && (
                <p className="text-gray-600 dark:text-gray-400 mb-3">{project.description}</p>
              )}
              <div className="flex gap-6 text-sm text-gray-500 dark:text-gray-400">
                <div>
                  <span className="font-medium">Client:</span>{' '}
                  <Link
                    href={`/clients/${project.client.id}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {project.client.name}
                  </Link>
                </div>
                <div>
                  <span className="font-medium">Time Entries:</span> {project._count.timeEntries}
                </div>
                <div>
                  <span className="font-medium">Total Hours:</span> {project.totalHours}
                </div>
              </div>
              {(project.startDate || project.endDate) && (
                <div className="flex gap-6 text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {project.startDate && (
                    <div>
                      <span className="font-medium">Start:</span>{' '}
                      {new Date(project.startDate).toLocaleDateString()}
                    </div>
                  )}
                  {project.endDate && (
                    <div>
                      <span className="font-medium">End:</span>{' '}
                      {new Date(project.endDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Link
                href={`/projects/${project.id}?edit=true`}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 px-3 py-1 text-sm"
              >
                Edit
              </Link>
              <button
                onClick={handleDelete}
                className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 px-3 py-1 text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterClient, setFilterClient] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  useEffect(() => {
    fetchClients();
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [filterClient, filterStatus]);

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/clients');
      if (!res.ok) throw new Error('Failed to fetch clients');
      const data = await res.json();
      setClients(data);
    } catch (err) {
      console.error('Error fetching clients:', err);
    }
  };

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterClient) params.append('clientId', filterClient);
      if (filterStatus) params.append('status', filterStatus);
      
      const url = `/api/projects${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url);
      
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Memoize delete handler
  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Are you sure you want to delete this project? This will also delete all associated time entries.')) {
      return;
    }

    try {
      const res = await fetch(`/api/projects/${id}`, {
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

  // Memoize filtered projects
  const filteredProjects = useMemo(() => {
    return projects;
    // Note: API handles filtering, so no client-side filtering needed
  }, [projects]);

  if (loading && projects.length === 0) {
    return (
      <div className="p-8">
        <div className="animate-pulse dark:text-white">Loading projects...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 p-4 rounded">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold dark:text-white">Projects</h1>
        <Link
          href="/projects/new"
          className="bg-blue-600 dark:bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700 dark:hover:bg-blue-600"
        >
          New Project
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <div>
          <label className="block text-sm font-medium dark:text-gray-300 mb-1">Filter by Client</label>
          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          >
            <option value="">All Clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium dark:text-gray-300 mb-1">Filter by Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="on-hold">On Hold</option>
          </select>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-gray-600 dark:text-gray-400 mb-4">No projects found</p>
          <Link
            href="/projects/new"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            Create your first project
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
