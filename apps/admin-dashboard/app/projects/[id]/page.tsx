'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Check, Link2, Link2Off, Pencil, Trash2, X } from 'lucide-react';
import { APIFooter, OptionsMenu, OptionsMenuItem } from '@repo/ui';
import { generateCode } from '@/lib/ai-actions';
import { WeeklySummaries } from './WeeklySummaries';
import { ProjectHighlights } from '@/components/ProjectHighlights';
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

type Highlight = {
  id: number;
  projectId: number;
  date: string;
  label: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

type Project = {
  id: number;
  name: string;
  clientDescription: string | null;
  privateNotes: string | null;
  status: string;
  color: string;
  billable: boolean;
  hourlyRate: number | null;
  startDate: string | null;
  endDate: string | null;
  linkedRtProjectId: number | null;
  linkedRtProject: { rtProjectId: number; name: string; color: string | null } | null;
  client: Client;
  timeEntries: TimeEntry[];
  highlights: Highlight[];
  totalHours: number;
  _count: {
    timeEntries: number;
  };
};

const COLOR_PRESETS = [
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

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', classes: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  { value: 'on-hold', label: 'On Hold', classes: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  { value: 'completed', label: 'Completed', classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
];

function statusClasses(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.classes ?? 'bg-gray-100 text-gray-800';
}
function statusLabel(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [project, setProject] = useState<Project | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  // Inline editing
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

  // Confirmations
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Time entries pagination
  const [visibleEntries, setVisibleEntries] = useState(5);

  // RescueTime link picker
  const [showRtLinkPicker, setShowRtLinkPicker] = useState(false);
  const [rtProjects, setRtProjects] = useState<{ rtProjectId: number; name: string; color: string | null }[]>([]);
  const [loadingRtProjects, setLoadingRtProjects] = useState(false);
  const [rtLinkSaving, setRtLinkSaving] = useState(false);

  useEffect(() => {
    params.then(({ id }) => {
      setProjectId(id);
      fetchProject(id);
      fetchClients();
      if (searchParams.get('edit') === 'true') {
        // No longer auto-opening a full edit form; ignore this param
      }
    });
  }, [params, searchParams]);

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingField]);

  async function fetchProject(id: string) {
    try {
      setLoading(true);
      const res = await authFetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error('Failed to fetch project');
      const data = await res.json();
      setProject(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function fetchClients() {
    try {
      const res = await authFetch('/api/clients');
      if (!res.ok) throw new Error('Failed to fetch clients');
      const data = await res.json();
      setClients(data);
    } catch (err) {
      console.error('Error fetching clients:', err);
    }
  }

  function startEditing(field: string, value: string) {
    setEditingField(field);
    setEditValue(value);
    setFieldError(null);
  }

  function cancelEditing() {
    setEditingField(null);
    setEditValue('');
    setFieldError(null);
  }

  async function saveField(field: string, value: string) {
    if (!project || !projectId) return;
    setSaving(true);
    setFieldError(null);

    const payload: Record<string, unknown> = {
      name: project.name,
      clientDescription: project.clientDescription || '',
      privateNotes: project.privateNotes || '',
      clientId: project.client.id.toString(),
      status: project.status,
      color: project.color,
      billable: project.billable,
      hourlyRate: project.hourlyRate,
      startDate: project.startDate ? project.startDate.split('T')[0] : null,
      endDate: project.endDate ? project.endDate.split('T')[0] : null,
      [field]: value || null,
    };

    // Coerce certain fields
    if (field === 'billable') payload.billable = value === 'true';
    if (field === 'name') payload.name = value;
    if (field === 'hourlyRate') payload.hourlyRate = value ? parseFloat(value) : null;
    if (field === 'startDate' || field === 'endDate') payload[field] = value || null;

    try {
      const res = await authFetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setProject({
        ...data,
        timeEntries: project.timeEntries,
        highlights: project.highlights,
        totalHours: project.totalHours,
        _count: project._count,
      });
      setEditingField(null);
      setEditValue('');
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function toggleBillable() {
    if (!project || !projectId) return;
    const newValue = !project.billable;
    setSaving(true);
    try {
      const res = await authFetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: project.name,
          clientDescription: project.clientDescription || '',
          privateNotes: project.privateNotes || '',
          clientId: project.client.id.toString(),
          status: project.status,
          color: project.color,
          billable: newValue,
          hourlyRate: project.hourlyRate,
          startDate: project.startDate ? project.startDate.split('T')[0] : null,
          endDate: project.endDate ? project.endDate.split('T')[0] : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setProject({ ...project, billable: newValue });
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, field: string, isTextarea = false) {
    if (e.key === 'Enter' && !isTextarea) { e.preventDefault(); saveField(field, editValue); }
    if (e.key === 'Escape') cancelEditing();
  }

  async function handleDelete() {
    if (!projectId || !project) return;
    try {
      const res = await authFetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete project');
      router.push('/projects');
    } catch (err) {
      setShowDeleteConfirm(false);
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  }

  async function openRtLinkPicker() {
    setShowRtLinkPicker(true);
    if (rtProjects.length > 0) return;
    setLoadingRtProjects(true);
    try {
      const res = await authFetch('/api/rescuetime/projects');
      if (!res.ok) throw new Error('Failed to fetch RescueTime projects');
      const data = await res.json();
      setRtProjects(data.map((p: any) => ({ rtProjectId: p.rtProjectId, name: p.name, color: p.color })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRtProjects(false);
    }
  }

  async function handleLinkRtProject(rtProjectId: number) {
    if (!project || !projectId) return;
    setRtLinkSaving(true);
    try {
      const res = await authFetch(`/api/rescuetime/projects/${rtProjectId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to link project');
      // Refresh project to get updated linkedRtProject
      await fetchProject(projectId);
      setShowRtLinkPicker(false);
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : 'Failed to link project');
    } finally {
      setRtLinkSaving(false);
    }
  }

  async function handleUnlinkRtProject() {
    if (!project || !projectId || !project.linkedRtProjectId) return;
    setRtLinkSaving(true);
    try {
      const res = await authFetch(`/api/rescuetime/projects/${project.linkedRtProjectId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to unlink project');
      await fetchProject(projectId);
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : 'Failed to unlink project');
    } finally {
      setRtLinkSaving(false);
    }
  }

  const handleGenerateCode = async (endpoint: any, language: string) => {
    const endpointWithActualId = {
      ...endpoint,
      path: endpoint.path.replace('{id}', projectId || '1'),
    };
    return await generateCode(endpointWithActualId, language);
  };

  if (loading) {
    return <div className="p-8 animate-pulse dark:text-white">Loading project...</div>;
  }

  if (error && !project) {
    return (
      <div className="p-8">
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Error: {error}
        </div>
        <Link href="/projects" className="mt-4 inline-block text-blue-600 hover:underline dark:text-blue-400">
          ← Back to Projects
        </Link>
      </div>
    );
  }

  if (!project) return null;

  // ── Inline-edit helpers ──

  function FieldPencil({ field, value }: { field: string; value: string }) {
    return (
      <button
        onClick={() => startEditing(field, value)}
        title={`Edit ${field}`}
        className="ml-1.5 rounded p-1 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    );
  }

  function FieldActions({ field, isTextarea = false }: { field: string; isTextarea?: boolean }) {
    return (
      <div className={`flex items-center gap-1 ${isTextarea ? 'mt-2' : 'ml-2'}`}>
        <button
          onClick={() => saveField(field, editValue)}
          disabled={saving}
          title="Save"
          className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/20"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={cancelEditing}
          disabled={saving}
          title="Cancel"
          className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl p-8">
      <div className="mb-6">
        <Link href="/projects" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← Back to Projects
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      {fieldError && (
        <div className="mb-6 rounded border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {fieldError}
        </div>
      )}

      {/* ── Header ── */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <div className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: project.color || '#22C55E' }} />
            <div className="group flex items-center">
              {editingField === 'name' ? (
                <>
                  <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 'name')}
                    className="rounded border border-blue-400 bg-white px-2 py-1 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                  <FieldActions field="name" />
                </>
              ) : (
                <>
                  <h1 className="text-3xl font-bold dark:text-white">{project.name}</h1>
                  <FieldPencil field="name" value={project.name} />
                </>
              )}
            </div>

            {/* Status badge — click to cycle or inline-select */}
            {editingField === 'status' ? (
              <div className="flex items-center gap-1">
                <select
                  ref={inputRef as React.RefObject<HTMLSelectElement>}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, 'status')}
                  className="rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700 dark:text-white"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <FieldActions field="status" />
              </div>
            ) : (
              <button
                onClick={() => startEditing('status', project.status)}
                className={`rounded px-3 py-1 text-sm font-medium transition hover:opacity-80 ${statusClasses(project.status)}`}
                title="Click to change status"
              >
                {statusLabel(project.status)}
              </button>
            )}
          </div>

          <div className="text-gray-600 dark:text-gray-400">
            Client:{' '}
            {editingField === 'clientId' ? (
              <span className="inline-flex items-center gap-1">
                <select
                  ref={inputRef as React.RefObject<HTMLSelectElement>}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, 'clientId')}
                  className="rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700 dark:text-white"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.company ? ` (${c.company})` : ''}
                    </option>
                  ))}
                </select>
                <FieldActions field="clientId" />
              </span>
            ) : (
              <span className="group inline-flex items-center">
                <Link href={`/clients/${project.client.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                  {project.client.name}
                </Link>
                {project.client.company && ` (${project.client.company})`}
                <FieldPencil field="clientId" value={project.client.id.toString()} />
              </span>
            )}
          </div>
        </div>

        <OptionsMenu label="Project options">
          {project.linkedRtProject ? (
            <OptionsMenuItem
              onClick={handleUnlinkRtProject}
              icon={<Link2Off className="h-4 w-4" />}
            >
              Unlink RescueTime project
            </OptionsMenuItem>
          ) : (
            <OptionsMenuItem
              onClick={openRtLinkPicker}
              icon={<Link2 className="h-4 w-4" />}
            >
              Link to RescueTime project
            </OptionsMenuItem>
          )}
          <OptionsMenuItem
            onClick={() => setShowDeleteConfirm(true)}
            tone="danger"
            icon={<Trash2 className="h-4 w-4" />}
          >
            Delete project
          </OptionsMenuItem>
        </OptionsMenu>
      </div>

      {/* ── Stats grid ── */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Hours</div>
          <div className="text-2xl font-bold dark:text-white">{project.totalHours}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-sm text-gray-600 dark:text-gray-400">Time Entries</div>
          <div className="text-2xl font-bold dark:text-white">{project._count.timeEntries}</div>
        </div>
        {project.startDate && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="text-sm text-gray-600 dark:text-gray-400">Start Date</div>
            <div className="text-lg font-semibold dark:text-white">
              {new Date(project.startDate).toLocaleDateString()}
            </div>
          </div>
        )}
        {project.endDate && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="text-sm text-gray-600 dark:text-gray-400">End Date</div>
            <div className="text-lg font-semibold dark:text-white">
              {new Date(project.endDate).toLocaleDateString()}
            </div>
          </div>
        )}
      </div>

      {/* ── Project Details card ── */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-xl font-semibold dark:text-white">Project Details</h2>
        <dl className="space-y-5">

          {/* Client Description */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Client-Viewable Description
            </dt>
            <dd className="mt-1">
              {editingField === 'clientDescription' ? (
                <div>
                  <textarea
                    ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 'clientDescription', true)}
                    rows={3}
                    className="w-full rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                  <FieldActions field="clientDescription" isTextarea />
                </div>
              ) : (
                <div className="group flex items-start">
                  <span className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {project.clientDescription || <span className="italic text-gray-400">None</span>}
                  </span>
                  <FieldPencil field="clientDescription" value={project.clientDescription || ''} />
                </div>
              )}
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Visible to the client in their portal</p>
            </dd>
          </div>

          {/* Private Notes */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Private Notes</dt>
            <dd className="mt-1">
              {editingField === 'privateNotes' ? (
                <div>
                  <textarea
                    ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 'privateNotes', true)}
                    rows={3}
                    className="w-full rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                  <FieldActions field="privateNotes" isTextarea />
                </div>
              ) : (
                <div className="group flex items-start">
                  <span className="italic text-gray-600 dark:text-gray-400 whitespace-pre-wrap border-l-2 border-gray-300 pl-3 dark:border-gray-600">
                    {project.privateNotes || <span className="not-italic text-gray-400">None</span>}
                  </span>
                  <FieldPencil field="privateNotes" value={project.privateNotes || ''} />
                </div>
              )}
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Only visible to you</p>
            </dd>
          </div>

          {/* Billable toggle */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Billable</dt>
            <dd className="mt-1">
              <button
                onClick={toggleBillable}
                disabled={saving}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${project.billable ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'}`}
                role="switch"
                aria-checked={project.billable}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${project.billable ? 'translate-x-4' : 'translate-x-0'}`}
                />
              </button>
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                {project.billable ? 'Yes — time entries default to billable' : 'No'}
              </span>
            </dd>
          </div>

          {/* Hourly Rate */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Hourly Rate</dt>
            <dd className="group mt-1 flex items-center">
              {editingField === 'hourlyRate' ? (
                <>
                  <div className="flex items-center">
                    <span className="mr-1 text-gray-500 dark:text-gray-400">$</span>
                    <input
                      ref={inputRef as React.RefObject<HTMLInputElement>}
                      type="number"
                      step="0.01"
                      min="0"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, 'hourlyRate')}
                      className="w-32 rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="0.00"
                    />
                  </div>
                  <FieldActions field="hourlyRate" />
                </>
              ) : (
                <>
                  <span className="text-gray-900 dark:text-white">
                    {project.hourlyRate != null
                      ? `$${Number(project.hourlyRate).toFixed(2)}/hr`
                      : <span className="italic text-gray-400">Not set</span>}
                  </span>
                  <FieldPencil field="hourlyRate" value={project.hourlyRate != null ? String(project.hourlyRate) : ''} />
                </>
              )}
            </dd>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Used as the default rate when generating invoices</p>
          </div>

          {/* Color */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Color</dt>
            <dd className="mt-1">
              {editingField === 'color' ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setEditValue(p.value)}
                        className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${editValue === p.value ? 'border-gray-900 dark:border-white' : 'border-gray-300 dark:border-gray-600'}`}
                        style={{ backgroundColor: p.value }}
                        title={p.name}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-9 w-14 cursor-pointer rounded border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-700"
                    />
                    <input
                      ref={inputRef as React.RefObject<HTMLInputElement>}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, 'color')}
                      className="w-28 rounded border border-blue-400 bg-white px-2 py-1 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700 dark:text-white"
                      maxLength={7}
                      placeholder="#22C55E"
                    />
                    <div className="flex items-center gap-1">
                      <button onClick={() => saveField('color', editValue)} disabled={saving} title="Save" className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/20">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={cancelEditing} disabled={saving} title="Cancel" className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="group flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full border border-black/10 dark:border-white/20" style={{ backgroundColor: project.color || '#22C55E' }} aria-hidden="true" />
                  <span className="font-mono text-sm uppercase text-gray-900 dark:text-white">{project.color || '#22C55E'}</span>
                  <FieldPencil field="color" value={project.color || '#22C55E'} />
                </div>
              )}
            </dd>
          </div>

          {/* Start Date */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Start Date</dt>
            <dd className="group mt-1 flex items-center">
              {editingField === 'startDate' ? (
                <>
                  <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type="date"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 'startDate')}
                    className="rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                  <FieldActions field="startDate" />
                </>
              ) : (
                <>
                  <span className="text-gray-900 dark:text-white">
                    {project.startDate ? new Date(project.startDate).toLocaleDateString() : <span className="italic text-gray-400">Not set</span>}
                  </span>
                  <FieldPencil field="startDate" value={project.startDate ? project.startDate.split('T')[0] ?? '' : ''} />
                </>
              )}
            </dd>
          </div>

          {/* End Date */}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">End Date</dt>
            <dd className="group mt-1 flex items-center">
              {editingField === 'endDate' ? (
                <>
                  <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type="date"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 'endDate')}
                    className="rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                  <FieldActions field="endDate" />
                </>
              ) : (
                <>
                  <span className="text-gray-900 dark:text-white">
                    {project.endDate ? new Date(project.endDate).toLocaleDateString() : <span className="italic text-gray-400">Not set</span>}
                  </span>
                  <FieldPencil field="endDate" value={project.endDate ? project.endDate.split('T')[0] ?? '' : ''} />
                </>
              )}
            </dd>
          </div>

          {/* RescueTime Link (only shown when linked) */}
          {project.linkedRtProject && (
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">RescueTime Project</dt>
              <dd className="mt-1 flex items-center gap-2">
                {project.linkedRtProject.color && (
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border border-black/10 dark:border-white/20"
                    style={{ backgroundColor: project.linkedRtProject.color }}
                    aria-hidden="true"
                  />
                )}
                <span className="text-gray-900 dark:text-white">{project.linkedRtProject.name}</span>
                <button
                  onClick={handleUnlinkRtProject}
                  disabled={rtLinkSaving}
                  className="ml-1 flex items-center gap-1 rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                >
                  <Link2Off className="h-3 w-3" />
                  Unlink
                </button>
              </dd>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Time imports from this RT project will map directly to this project
              </p>
            </div>
          )}

        </dl>
      </div>

      {/* ── Highlights ── */}
      <div className="mb-8">
        <ProjectHighlights
          projectId={project.id}
          highlights={project.highlights ?? []}
          onHighlightsChange={(newHighlights) =>
            setProject({ ...project, highlights: newHighlights })
          }
        />
      </div>

      {/* ── Weekly Summaries ── */}
      <div className="mb-8">
        <WeeklySummaries projectId={project.id} projectName={project.name} timeEntries={project.timeEntries} />
      </div>

      {/* ── Time Entries ── */}
      <div className="mb-8">
        <h2 className="mb-4 text-xl font-semibold dark:text-white">Recent Time Entries</h2>
        {project.timeEntries.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No time entries yet</p>
        ) : (
          <>
            <div className="space-y-2">
              {project.timeEntries.slice(0, visibleEntries).map((entry) => (
                <div key={entry.id} className="flex items-start justify-between rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <div>
                    <div className="font-medium dark:text-white">{entry.description || 'No description'}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {new Date(entry.startTime).toLocaleDateString()} at {new Date(entry.startTime).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold dark:text-white">{(entry.durationMinutes / 60).toFixed(2)} hrs</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">{entry.billable ? 'Billable' : 'Non-billable'}</div>
                  </div>
                </div>
              ))}
            </div>
            {visibleEntries < project.timeEntries.length && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => setVisibleEntries((prev) => prev + 10)}
                  className="flex items-center gap-1.5 rounded px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                >
                  Show more entries ({project.timeEntries.length - visibleEntries} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <APIFooter
        enableApiKeys
        enableCodeGen
        onGenerateApiKey={() => { window.location.href = '/api-demo'; }}
        onGenerateCode={handleGenerateCode}
        endpoints={[
          { method: 'GET', path: '/projects/{id}', description: 'Get a specific project with time entries and summary', queryParams: [{ name: 'id', type: 'number', required: true, description: 'Project ID (in URL path)' }] },
          { method: 'PUT', path: '/projects/{id}', description: 'Update a project', queryParams: [{ name: 'id', type: 'number', required: true, description: 'Project ID (in URL path)' }], body: JSON.stringify({ name: 'Updated Project Name', clientId: 1, clientDescription: 'Updated description', privateNotes: 'Updated notes', status: 'completed', color: '#3B82F6', billable: true, startDate: '2025-01-01', endDate: '2025-12-31' }, null, 2) },
          { method: 'DELETE', path: '/projects/{id}', description: 'Delete a project (cascades to time entries)', queryParams: [{ name: 'id', type: 'number', required: true, description: 'Project ID (in URL path)' }] },
        ]}
      />

      {/* ── RescueTime link picker ── */}
      {showRtLinkPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowRtLinkPicker(false)} />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40">
                  <Link2 className="h-5 w-5 text-blue-500" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Link to RescueTime project
                </h3>
              </div>
              <button
                onClick={() => setShowRtLinkPicker(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              When importing RescueTime time entries, this project will be used automatically instead of relying on AI matching.
            </p>
            {loadingRtProjects ? (
              <div className="animate-pulse text-sm text-gray-500 dark:text-gray-400">Loading RescueTime projects…</div>
            ) : rtProjects.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">No RescueTime projects found. Import an archive first.</div>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {rtProjects.map((rtp) => (
                  <button
                    key={rtp.rtProjectId}
                    onClick={() => handleLinkRtProject(rtp.rtProjectId)}
                    disabled={rtLinkSaving}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-gray-800"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-black/10 dark:border-white/20"
                      style={{ backgroundColor: rtp.color ?? '#888888' }}
                      aria-hidden="true"
                    />
                    <span className="text-gray-900 dark:text-white">{rtp.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowDeleteConfirm(false)} />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/40">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Delete project?</h3>
            </div>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">{project.name}</span> and all
              associated time entries will be permanently deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
              >
                Yes, delete it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
