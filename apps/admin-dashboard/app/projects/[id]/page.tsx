'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { APIFooter } from '@repo/ui';
import { generateCode } from '@/lib/ai-actions';
import { WeeklySummaries } from './WeeklySummaries';
import { authFetch } from '@/lib/util';

type Client = {
  id: number;
  name: string;
  email: string;
  company: string | null;
};

type TimeEntry = {
  id: number;
  description: string | null;
  startTime: string;
  durationMinutes: number;
  billable: boolean;
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
  timeEntries: TimeEntry[];
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

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    clientDescription: '',
    privateNotes: '',
    clientId: '',
    status: 'active',
    color: '#22C55E', // Default green
    billable: true, // Default billable
    startDate: '',
    endDate: '',
  });

  // Preset color options
  const colorPresets = [
    { name: 'Green', value: '#22C55E' },
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Purple', value: '#A855F7' },
    { name: 'Red', value: '#EF4444' },
    { name: 'Orange', value: '#F97316' },
    { name: 'Yellow', value: '#EAB308' },
    { name: 'Pink', value: '#EC4899' },
    { name: 'Teal', value: '#14B8A6' },
    { name: 'Indigo', value: '#6366F1' },
    { name: 'Cyan', value: '#06B6D4' },
  ];

  useEffect(() => {
    params.then(({ id }) => {
      setProjectId(id);
      fetchProject(id);
      fetchClients();
      
      // Check if we should start in edit mode
      const shouldEdit = searchParams.get('edit') === 'true';
      if (shouldEdit) {
        setEditing(true);
      }
    });
  }, [params, searchParams]);

  const fetchProject = async (id: string) => {
    try {
      setLoading(true);
      const res = await authFetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error('Failed to fetch project');
      const data = await res.json();
      setProject(data);
      setFormData({
        name: data.name,
        clientDescription: data.clientDescription || '',
        privateNotes: data.privateNotes || '',
        clientId: data.client.id.toString(),
        status: data.status,
        color: data.color || '#22C55E',
        billable: data.billable ?? true,
        startDate: data.startDate ? data.startDate.split('T')[0] : '',
        endDate: data.endDate ? data.endDate.split('T')[0] : '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await authFetch('/api/clients');
      if (!res.ok) throw new Error('Failed to fetch clients');
      const data = await res.json();
      setClients(data);
    } catch (err) {
      console.error('Error fetching clients:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;

    setSaving(true);
    setError(null);

    try {
      const res = await authFetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          startDate: formData.startDate || null,
          endDate: formData.endDate || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update project');
      }

      const updatedProject = await res.json();
      setProject({
        ...updatedProject,
        timeEntries: project?.timeEntries || [],
        totalHours: project?.totalHours || 0,
        _count: project?._count || { timeEntries: 0 },
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleDelete = async () => {
    if (!projectId || !project) return;
    
    if (!confirm('Are you sure you want to delete this project? This will also delete all associated time entries.')) {
      return;
    }

    try {
      const res = await authFetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete project');
      
      const result = await res.json();
      alert(`Project deleted successfully. ${result.deletedTimeEntries} time entries were also deleted.`);
      router.push('/projects');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  const handleGenerateCode = async (endpoint: any, language: string) => {
    // Replace {id} placeholder with actual project ID in the path
    const endpointWithActualId = {
      ...endpoint,
      path: endpoint.path.replace('{id}', projectId || '1'),
    };
    
    return await generateCode(endpointWithActualId, language);
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse dark:text-white">Loading project...</div>
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="p-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 p-4 rounded">
          Error: {error}
        </div>
        <Link href="/projects" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mt-4 inline-block">
          ← Back to Projects
        </Link>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <Link href="/projects" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm">
          ← Back to Projects
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 p-4 rounded mb-6">
          {error}
        </div>
      )}

      {editing ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          <h1 className="text-3xl font-bold dark:text-white mb-6">Edit Project</h1>

          <div>
            <label htmlFor="name" className="block text-sm font-medium dark:text-gray-300 mb-2">
              Project Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            />
          </div>

          <div>
            <label htmlFor="clientId" className="block text-sm font-medium dark:text-gray-300 mb-2">
              Client *
            </label>
            <select
              id="clientId"
              name="clientId"
              required
              value={formData.clientId}
              onChange={handleChange}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} {client.company ? `(${client.company})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="clientDescription" className="block text-sm font-medium dark:text-gray-300 mb-2">
              Client-Viewable Description
            </label>
            <textarea
              id="clientDescription"
              name="clientDescription"
              value={formData.clientDescription}
              onChange={handleChange}
              rows={3}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              This description will be visible to the client in their portal
            </p>
          </div>

          <div>
            <label htmlFor="privateNotes" className="block text-sm font-medium dark:text-gray-300 mb-2">
              Private Notes
            </label>
            <textarea
              id="privateNotes"
              name="privateNotes"
              value={formData.privateNotes}
              onChange={handleChange}
              rows={3}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              These notes are only visible to you and can include AI activity matching rules
            </p>
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium dark:text-gray-300 mb-2">
              Status
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            >
              <option value="active">Active</option>
              <option value="on-hold">On Hold</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                name="billable"
                checked={formData.billable}
                onChange={(e) => setFormData((prev) => ({ ...prev, billable: e.target.checked }))}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
              />
              <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Billable Project
              </span>
            </label>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              When enabled, time entries will default to billable and show billable tracking options
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium dark:text-gray-300 mb-2">
              Project Color
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {colorPresets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, color: preset.value }))}
                  className={`w-10 h-10 rounded-full border-2 transition-all ${
                    formData.color === preset.value
                      ? 'border-gray-900 dark:border-white scale-110'
                      : 'border-gray-300 dark:border-gray-600 hover:scale-105'
                  }`}
                  style={{ backgroundColor: preset.value }}
                  title={preset.name}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                id="color"
                name="color"
                value={formData.color}
                onChange={handleChange}
                className="h-10 w-20 border border-gray-300 dark:border-gray-600 rounded cursor-pointer"
              />
              <input
                type="text"
                value={formData.color}
                onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
                placeholder="#22C55E"
                className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium dark:text-gray-300 mb-2">
                Start Date
              </label>
              <input
                type="date"
                id="startDate"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
            </div>

            <div>
              <label htmlFor="endDate" className="block text-sm font-medium dark:text-gray-300 mb-2">
                End Date
              </label>
              <input
                type="date"
                id="endDate"
                name="endDate"
                value={formData.endDate}
                onChange={handleChange}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 dark:bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-blue-300 dark:disabled:bg-blue-700 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
                if (project) {
                  setFormData({
                    name: project.name,
                    clientDescription: project.clientDescription || '',
                    privateNotes: project.privateNotes || '',
                    clientId: project.client.id.toString(),
                    status: project.status,
                    color: project.color || '#22C55E',
                    billable: (project as any).billable ?? true,
                    startDate: project.startDate ? (project.startDate.split('T')[0] ?? '') : '',
                    endDate: project.endDate ? (project.endDate.split('T')[0] ?? '') : '',
                  });
                }
              }}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-6 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div>
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                {/* Color dot indicator */}
                <div 
                  className="w-4 h-4 rounded-full shrink-0" 
                  style={{ backgroundColor: project.color || '#22C55E' }}
                />
                <h1 className="text-3xl font-bold dark:text-white">{project.name}</h1>
                <span
                  className={`px-3 py-1 text-sm font-medium rounded ${
                    statusColors[project.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {statusLabels[project.status as keyof typeof statusLabels] || project.status}
                </span>
              </div>
              <div className="text-gray-600 dark:text-gray-400">
                Client:{' '}
                <Link
                  href={`/clients/${project.client.id}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {project.client.name}
                </Link>
                {project.client.company && ` (${project.client.company})`}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="bg-blue-600 dark:bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700 dark:hover:bg-blue-600"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="bg-red-600 dark:bg-red-500 text-white px-4 py-2 rounded hover:bg-red-700 dark:hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>

          {(project.clientDescription || project.privateNotes) && (
            <div className="mb-6 space-y-4">
              {project.clientDescription && (
                <div>
                  <h2 className="text-lg font-semibold dark:text-white mb-2">Client-Viewable Description</h2>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{project.clientDescription}</p>
                </div>
              )}
              {project.privateNotes && (
                <div>
                  <h2 className="text-lg font-semibold dark:text-white mb-2">Private Notes</h2>
                  <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap italic border-l-2 border-gray-300 dark:border-gray-600 pl-3">
                    {project.privateNotes}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div 
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800" 
            >
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Hours</div>
              <div className="text-2xl font-bold dark:text-white">{project.totalHours}</div>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">Time Entries</div>
              <div className="text-2xl font-bold dark:text-white">{project._count.timeEntries}</div>
            </div>
            {project.startDate && (
              <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">Start Date</div>
                <div className="text-lg font-semibold dark:text-white">
                  {new Date(project.startDate).toLocaleDateString()}
                </div>
              </div>
            )}
            {project.endDate && (
              <div className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">End Date</div>
                <div className="text-lg font-semibold dark:text-white">
                  {new Date(project.endDate).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>

          <div className="mb-8">
            <WeeklySummaries projectId={project.id} projectName={project.name} timeEntries={project.timeEntries} />
          </div>

          <div>
            <h2 className="text-xl font-semibold dark:text-white mb-4">Recent Time Entries</h2>
            {project.timeEntries.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400">No time entries yet</p>
            ) : (
              <div className="space-y-2">
                {project.timeEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded p-4 flex justify-between items-start"
                  >
                    <div>
                      <div className="font-medium dark:text-white">
                        {entry.description || 'No description'}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {new Date(entry.startTime).toLocaleDateString()} at{' '}
                        {new Date(entry.startTime).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold dark:text-white">
                        {(entry.durationMinutes / 60).toFixed(2)} hrs
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {entry.billable ? 'Billable' : 'Non-billable'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <APIFooter
        enableApiKeys
        enableCodeGen
        onGenerateApiKey={() => window.location.href = '/api-demo'}
        onGenerateCode={handleGenerateCode}
        endpoints={[
          {
            method: "GET",
            path: "/projects/{id}",
            description: "Get a specific project with time entries and summary",
            queryParams: [
              {
                name: "id",
                type: "number",
                required: true,
                description: "Project ID (in URL path)",
              },
            ],
          },
          {
            method: "PUT",
            path: "/projects/{id}",
            description: "Update a project",
            queryParams: [
              {
                name: "id",
                type: "number",
                required: true,
                description: "Project ID (in URL path)",
              },
            ],
            body: JSON.stringify(
              {
                name: "Updated Project Name",
                clientId: 1,
                clientDescription: "Updated description",
                privateNotes: "Updated notes",
                status: "completed",
                color: "#3B82F6",
                billable: true,
                startDate: "2025-01-01",
                endDate: "2025-12-31",
              },
              null,
              2
            ),
          },
          {
            method: "DELETE",
            path: "/projects/{id}",
            description: "Delete a project (cascades to time entries)",
            queryParams: [
              {
                name: "id",
                type: "number",
                required: true,
                description: "Project ID (in URL path)",
              },
            ],
          },
        ]}
      />
    </div>
  );
}
