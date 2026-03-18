'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Mail, Pencil, Trash2, X } from 'lucide-react';
import { OptionsMenu, OptionsMenuItem, OptionsMenuSeparator } from '@repo/ui';
import { authFetch } from '@/lib/util';

interface Client {
  id: number;
  name: string;
  email: string;
  company: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    projects: number;
    invoices: number;
  };
  projects?: Array<{
    id: number;
    name: string;
    status: string;
  }>;
  invoices?: Array<{
    id: number;
    invoiceNumber: string;
    amount: string;
    status: string;
  }>;
}

const CLIENT_COLOR_PRESETS = [
  '#06B6D4',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#F43F5E',
  '#F97316',
  '#EAB308',
  '#22C55E',
];

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>('');

  // Inline editing
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Confirmations / actions
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    params.then((p) => setClientId(p.id));
  }, [params]);

  useEffect(() => {
    if (!clientId) return;
    fetchClient();
  }, [clientId]);

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingField]);

  async function fetchClient() {
    try {
      const res = await authFetch(`/api/clients/${clientId}`);
      if (!res.ok) throw new Error('Failed to fetch client');
      const data = await res.json();
      setClient(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load client');
    } finally {
      setLoading(false);
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
    if (!client) return;
    setSaving(true);
    setFieldError(null);

    const payload = {
      name: client.name,
      email: client.email,
      company: client.company || '',
      color: client.color,
      [field]: value,
    };

    try {
      const res = await authFetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setClient(data);
      setEditingField(null);
      setEditValue('');
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, field: string) {
    if (e.key === 'Enter') { e.preventDefault(); saveField(field, editValue); }
    if (e.key === 'Escape') cancelEditing();
  }

  async function handleDelete() {
    try {
      const res = await authFetch(`/api/clients/${clientId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete client');
      }
      router.push('/clients');
    } catch (err) {
      setShowDeleteConfirm(false);
      setError(err instanceof Error ? err.message : 'Failed to delete client');
    }
  }

  async function handleSendWelcomeEmail() {
    setSendingEmail(true);
    setEmailMessage(null);
    try {
      const res = await authFetch(`/api/clients/${clientId}/welcome`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Failed to send email');
      setEmailMessage({ type: 'success', text: data.message || 'Welcome email sent!' });
    } catch (err) {
      setEmailMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to send email' });
    } finally {
      setSendingEmail(false);
      setShowEmailConfirm(false);
      setTimeout(() => setEmailMessage(null), 6000);
    }
  }

  if (loading) {
    return <div className="p-8 text-center dark:text-white">Loading...</div>;
  }

  if (error && !client) {
    return (
      <div className="p-8">
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
        <Link href="/clients" className="mt-4 inline-block text-blue-600 hover:underline dark:text-blue-400">
          ← Back to clients
        </Link>
      </div>
    );
  }

  if (!client) return null;

  // ── Inline-edit helpers (defined inside render so they close over state) ──

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

  function FieldActions({ field }: { field: string }) {
    return (
      <div className="ml-2 flex items-center gap-1">
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
    <div className="mx-auto max-w-4xl p-8">
      {/* ── Header ── */}
      <div className="mb-8">
        <Link href="/clients" className="mb-4 inline-block text-blue-600 hover:underline dark:text-blue-400">
          ← Back to clients
        </Link>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className="h-4 w-4 shrink-0 rounded-full border border-black/10 dark:border-white/20"
              style={{ backgroundColor: client.color || '#06B6D4' }}
              aria-hidden="true"
            />
            <div>
              <div className="group flex items-center">
                {editingField === 'name' ? (
                  <>
                    <input
                      ref={inputRef}
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
                    <h1 className="text-3xl font-bold dark:text-white">{client.name}</h1>
                    <FieldPencil field="name" value={client.name} />
                  </>
                )}
              </div>
              {(client.company || editingField === 'company') && (
                <div className="group mt-1 flex items-center">
                  {editingField === 'company' ? (
                    <>
                      <input
                        ref={inputRef}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, 'company')}
                        placeholder="Company name"
                        className="rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                      <FieldActions field="company" />
                    </>
                  ) : (
                    <>
                      <span className="text-gray-600 dark:text-gray-400">{client.company}</span>
                      <FieldPencil field="company" value={client.company || ''} />
                    </>
                  )}
                </div>
              )}
              {!client.company && editingField !== 'company' && (
                <button
                  onClick={() => startEditing('company', '')}
                  className="mt-1 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  + Add company
                </button>
              )}
            </div>
          </div>

          <OptionsMenu label="Client options">
            <OptionsMenuItem
              onClick={() => setShowEmailConfirm(true)}
              icon={<Mail className="h-4 w-4 text-slate-400 dark:text-slate-500" />}
            >
              Send welcome email
            </OptionsMenuItem>
            <OptionsMenuSeparator />
            <OptionsMenuItem
              onClick={() => setShowDeleteConfirm(true)}
              tone="danger"
              icon={<Trash2 className="h-4 w-4" />}
            >
              Delete client
            </OptionsMenuItem>
          </OptionsMenu>
        </div>
      </div>

      {/* ── Alerts ── */}
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}
      {fieldError && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {fieldError}
        </div>
      )}
      {emailMessage && (
        <div className={`mb-4 rounded border px-4 py-3 ${
          emailMessage.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
            : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
        }`}>
          {emailMessage.text}
        </div>
      )}

      <div className="space-y-6">
        {/* ── Client Information ── */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold dark:text-white">Client Information</h2>
          <dl className="space-y-4">

            {/* Email */}
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
              <dd className="group mt-1 flex items-center">
                {editingField === 'email' ? (
                  <>
                    <input
                      ref={inputRef}
                      type="email"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, 'email')}
                      className="rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                    <FieldActions field="email" />
                  </>
                ) : (
                  <>
                    <span className="text-gray-900 dark:text-white">{client.email}</span>
                    <FieldPencil field="email" value={client.email} />
                  </>
                )}
              </dd>
            </div>

            {/* Company */}
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Company</dt>
              <dd className="group mt-1 flex items-center">
                {editingField === 'company' ? (
                  <>
                    <input
                      ref={inputRef}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, 'company')}
                      placeholder="Company name"
                      className="rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                    <FieldActions field="company" />
                  </>
                ) : (
                  <>
                    <span className="text-gray-900 dark:text-white">
                      {client.company || <span className="italic text-gray-400">None</span>}
                    </span>
                    <FieldPencil field="company" value={client.company || ''} />
                  </>
                )}
              </dd>
            </div>

            {/* Color */}
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Color</dt>
              <dd className="mt-1">
                {editingField === 'color' ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {CLIENT_COLOR_PRESETS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEditValue(c)}
                          className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${editValue === c ? 'border-gray-900 dark:border-white' : 'border-gray-300 dark:border-gray-600'}`}
                          style={{ backgroundColor: c }}
                          aria-label={`Select color ${c}`}
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
                        ref={inputRef}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, 'color')}
                        className="w-28 rounded border border-blue-400 bg-white px-2 py-1 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700 dark:text-white"
                        maxLength={7}
                        placeholder="#06B6D4"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => saveField('color', editValue)}
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
                    </div>
                  </div>
                ) : (
                  <div className="group flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full border border-black/10 dark:border-white/20"
                      style={{ backgroundColor: client.color || '#06B6D4' }}
                      aria-hidden="true"
                    />
                    <span className="font-mono text-sm uppercase text-gray-900 dark:text-white">
                      {client.color || '#06B6D4'}
                    </span>
                    <FieldPencil field="color" value={client.color || '#06B6D4'} />
                  </div>
                )}
              </dd>
            </div>

            {/* Created */}
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</dt>
              <dd className="mt-1 text-gray-900 dark:text-white">
                {new Date(client.createdAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800">
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{client._count.projects}</div>
            <div className="mt-1 text-gray-600 dark:text-gray-400">
              {client._count.projects === 1 ? 'Project' : 'Projects'}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800">
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">{client._count.invoices}</div>
            <div className="mt-1 text-gray-600 dark:text-gray-400">
              {client._count.invoices === 1 ? 'Invoice' : 'Invoices'}
            </div>
          </div>
        </div>

        {/* ── Projects ── */}
        {client.projects && client.projects.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-xl font-semibold dark:text-white">Projects</h2>
            <div className="space-y-2">
              {client.projects.map((project) => (
                <div key={project.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                  <Link
                    href={`/projects/${project.id}`}
                    className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    {project.name}
                  </Link>
                  <span className={`rounded px-2 py-1 text-xs ${
                    project.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                    project.status === 'completed' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300'
                  }`}>
                    {project.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Invoices ── */}
        {client.invoices && client.invoices.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-xl font-semibold dark:text-white">Recent Invoices</h2>
            <div className="space-y-2">
              {client.invoices.slice(0, 5).map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    {invoice.invoiceNumber}
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="font-medium dark:text-white">${invoice.amount}</span>
                    <span className={`rounded px-2 py-1 text-xs ${
                      invoice.status === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                      invoice.status === 'sent' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                      invoice.status === 'overdue' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                      'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300'
                    }`}>
                      {invoice.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Delete confirmation dialog ── */}
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
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Delete client?</h3>
            </div>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">{client.name}</span> and all
              associated projects, time entries, and invoices will be permanently deleted.
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

      {/* ── Welcome email confirmation dialog ── */}
      {showEmailConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowEmailConfirm(false)} />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/40">
                <Mail className="h-5 w-5 text-indigo-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Send welcome email?</h3>
            </div>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              A welcome email will be sent to{' '}
              <span className="font-medium text-gray-700 dark:text-gray-300">{client.email}</span>.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowEmailConfirm(false)}
                disabled={sendingEmail}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSendWelcomeEmail}
                disabled={sendingEmail}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {sendingEmail ? 'Sending…' : 'Send email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
