'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trash2, X } from 'lucide-react';
import { EditButton, OptionsMenu, OptionsMenuItem } from '@repo/ui';
import { parseUTC, formatDateTime } from '@/lib/datetime';
import { authFetch } from '@/lib/util';

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  emailVerified: string | null;
  clientId: number | null;
  image: string | null;
  sessions: Array<{
    id: string;
    sessionToken: string;
    expires: string;
  }>;
  accounts: Array<{
    id: string;
    provider: string;
    type: string;
  }>;
  _count: {
    sessions: number;
    accounts: number;
  };
  client: {
    id: number;
    name: string;
    email: string;
    company: string | null;
  } | null;
}

interface Client {
  id: number;
  name: string;
  email: string;
  company: string | null;
}

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5"
    >
      <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L2.294 11.232a2.25 2.25 0 0 0-.584 1.054l-.595 2.583a.75.75 0 0 0 .908.908l2.583-.595a2.25 2.25 0 0 0 1.054-.584L14.487 4.988a1.75 1.75 0 0 0 0-2.475Zm-1.414 1.06a.25.25 0 0 1 .354 0l1 1a.25.25 0 0 1 0 .354L12.06 6.3l-1.354-1.354 1.368-1.373ZM9.645 6.007l1.354 1.354-6.589 6.589a.75.75 0 0 1-.351.195l-1.661.383.383-1.661a.75.75 0 0 1 .195-.351l6.669-6.509Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5"
    >
      <path
        fillRule="evenodd"
        d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5"
    >
      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
    </svg>
  );
}

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [user, setUser] = useState<User | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline editing state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchUser();
    fetchClients();
  }, [userId]);

  // Auto-focus input when a field becomes active
  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingField]);

  async function fetchUser() {
    try {
      const response = await authFetch(`/api/users/${userId}`);
      if (!response.ok) throw new Error('Failed to fetch user');
      const data = await response.json();
      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user');
    } finally {
      setLoading(false);
    }
  }

  async function fetchClients() {
    try {
      const response = await authFetch('/api/clients');
      if (!response.ok) throw new Error('Failed to fetch clients');
      const data = await response.json();
      setClients(Array.isArray(data) ? data : data.clients ?? []);
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    }
  }

  function startEditing(field: string, currentValue: string) {
    setEditingField(field);
    setEditValue(currentValue);
    setFieldError(null);
  }

  function cancelEditing() {
    setEditingField(null);
    setEditValue('');
    setFieldError(null);
  }

  async function saveField(field: string, value: string) {
    if (!user) return;
    setSaving(true);
    setFieldError(null);

    const payload: Record<string, unknown> = {
      email: user.email,
      name: user.name,
      clientId: user.clientId?.toString() || null,
      role: user.role,
    };

    if (field === 'password') {
      payload.password = value || undefined;
    } else {
      payload[field] = field === 'clientId' ? (value || null) : (value || null);
      if (field === 'name') payload.name = value || null;
      if (field === 'email') payload.email = value;
      if (field === 'role') payload.role = value;
    }

    try {
      const response = await authFetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update');

      setEditingField(null);
      setEditValue('');
      await fetchUser();
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, field: string) {
    if (e.key === 'Enter' && field !== 'password') {
      e.preventDefault();
      saveField(field, editValue);
    }
    if (e.key === 'Escape') {
      cancelEditing();
    }
  }

  async function handleDelete() {
    try {
      const response = await authFetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      router.push('/users');
    } catch (err) {
      setShowDeleteConfirm(false);
      setFieldError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  }

  async function handleResendVerification() {
    setResendingVerification(true);
    setResendMessage(null);
    try {
      const response = await authFetch(`/api/users/${userId}/resend-verification`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send verification email');
      setResendMessage(data.message);
    } catch (err) {
      setResendMessage(err instanceof Error ? err.message : 'Failed to send verification email');
    } finally {
      setResendingVerification(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center">Loading user...</div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="p-8">
        <div className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
        <Link href="/users" className="mt-4 inline-block text-blue-600 hover:underline">
          ← Back to users
        </Link>
      </div>
    );
  }

  if (!user) return null;

  // Reusable inline-edit action buttons
  function InlineActions({ field }: { field: string }) {
    return (
      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={() => saveField(field, editValue)}
          disabled={saving}
          title="Save"
          className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/20"
        >
          <CheckIcon />
        </button>
        <button
          onClick={cancelEditing}
          disabled={saving}
          title="Cancel"
          className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          <XIcon />
        </button>
      </div>
    );
  }

  function EditButton({ field, value }: { field: string; value: string }) {
    return (
      <button
        onClick={() => startEditing(field, value)}
        title={`Edit ${field}`}
        className="ml-1.5 rounded p-1 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-600 transition-opacity dark:hover:bg-gray-700 dark:hover:text-gray-300"
      >
        <PencilIcon />
      </button>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href="/users"
          className="text-blue-600 hover:underline dark:text-blue-400 mb-4 inline-block"
        >
          ← Back to users
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {user.name || user.email}
              {' '}
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium align-middle ${
                  user.role === 'admin'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {user.role}
              </span>
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">User Details</p>
          </div>

          <OptionsMenu
            label="User options"
            triggerClassName="border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            contentClassName="w-48 border-gray-200 dark:border-gray-700 dark:bg-gray-900"
          >
            <OptionsMenuItem
              onClick={() => setShowDeleteConfirm(true)}
              tone="danger"
              icon={<Trash2 className="h-4 w-4" />}
            >
              Delete user
            </OptionsMenuItem>
          </OptionsMenu>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {fieldError && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-400">
          {fieldError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Information */}
        <div className="row-span-2 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">User Information</h2>
          <div className="space-y-4">

            {/* Email */}
            <div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Email</span>
              <div className="group mt-1 flex items-center">
                {editingField === 'email' ? (
                  <>
                    <input
                      ref={inputRef as React.RefObject<HTMLInputElement>}
                      type="email"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, 'email')}
                      className="flex-1 rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700"
                    />
                    <InlineActions field="email" />
                  </>
                ) : (
                  <>
                    <span>{user.email}</span>
                    <EditButton field="email" value={user.email} />
                  </>
                )}
              </div>
            </div>

            {/* Name */}
            <div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Name</span>
              <div className="group mt-1 flex items-center">
                {editingField === 'name' ? (
                  <>
                    <input
                      ref={inputRef as React.RefObject<HTMLInputElement>}
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, 'name')}
                      className="flex-1 rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700"
                    />
                    <InlineActions field="name" />
                  </>
                ) : (
                  <>
                    <span className={user.name ? '' : 'text-gray-400 dark:text-gray-500'}>
                      {user.name || 'No name set'}
                    </span>
                    <EditButton field="name" value={user.name || ''} />
                  </>
                )}
              </div>
            </div>

            {/* Role */}
            <div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Role</span>
              <div className="group mt-1 flex items-center">
                {editingField === 'role' ? (
                  <>
                    <select
                      ref={inputRef as React.RefObject<HTMLSelectElement>}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, 'role')}
                      className="flex-1 rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                    <InlineActions field="role" />
                  </>
                ) : (
                  <>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        user.role === 'admin'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {user.role}
                    </span>
                    <EditButton field="role" value={user.role} />
                  </>
                )}
              </div>
              {editingField === 'role' && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Admin users can access the admin dashboard. Regular users can only access the client portal.
                </p>
              )}
            </div>

            {/* Linked Client */}
            <div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Linked Client</span>
              <div className="group mt-1 flex items-center">
                {editingField === 'clientId' ? (
                  <>
                    <select
                      ref={inputRef as React.RefObject<HTMLSelectElement>}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, 'clientId')}
                      className="flex-1 rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700"
                    >
                      <option value="">Not linked</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name} - {client.company || 'No company'}
                        </option>
                      ))}
                    </select>
                    <InlineActions field="clientId" />
                  </>
                ) : (
                  <>
                    {user.client ? (
                      <Link
                        href={`/clients/${user.client.id}`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {user.client.name}
                      </Link>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">Not linked</span>
                    )}
                    <EditButton field="clientId" value={user.clientId?.toString() || ''} />
                  </>
                )}
              </div>
            </div>

            {/* Password */}
            <div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Password</span>
              <div className="group mt-1 flex items-center">
                {editingField === 'password' ? (
                  <>
                    <input
                      ref={inputRef as React.RefObject<HTMLInputElement>}
                      type="password"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, 'password')}
                      placeholder="New password"
                      className="flex-1 rounded border border-blue-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500 dark:bg-gray-700"
                    />
                    <InlineActions field="password" />
                  </>
                ) : (
                  <>
                    <span className="text-gray-400 dark:text-gray-500">••••••••</span>
                    <EditButton field="password" value="" />
                  </>
                )}
              </div>
            </div>

            {/* Email Verified */}
            <div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Email Verified
              </span>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {user.emailVerified ? (
                  <span className="text-green-700 dark:text-green-400">
                    {formatDateTime(parseUTC(user.emailVerified))}
                  </span>
                ) : (
                  <span className="text-yellow-600 dark:text-yellow-400">Not verified</span>
                )}
                <button
                  onClick={handleResendVerification}
                  disabled={resendingVerification}
                  className="rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  {resendingVerification ? 'Sending…' : 'Resend verification email'}
                </button>
              </div>
              {resendMessage && (
                <p
                  className={`mt-1 text-xs ${
                    resendMessage.toLowerCase().includes('fail') ||
                    resendMessage.toLowerCase().includes('error')
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-green-600 dark:text-green-400'
                  }`}
                >
                  {resendMessage}
                </p>
              )}
            </div>

            {/* User ID */}
            <div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">User ID</span>
              <p className="mt-1 font-mono text-sm">{user.id}</p>
            </div>
          </div>
        </div>

        {/* Linked Client detail card – only relevant for non-admin users */}
        {user.role !== 'admin' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-xl font-semibold">Linked Client</h2>
            {user.client ? (
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Client:</span>
                  <p className="mt-1">
                    <Link
                      href={`/clients/${user.client.id}`}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {user.client.name}
                    </Link>
                  </p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Company:</span>
                  <p className="mt-1">{user.client.company || '-'}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Client Email:</span>
                  <p className="mt-1">{user.client.email}</p>
                </div>
                <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                  This user has access to all projects and data for {user.client.name}.
                </div>
              </div>
            ) : (
              <div className="text-gray-600 dark:text-gray-400">
                <p>This user is not linked to any client.</p>
                <p className="mt-2 text-sm">
                  Click the pencil icon next to <strong>Linked Client</strong> in the User Information panel to link this user.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Authentication Accounts */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Authentication Methods</h2>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div className="text-sm">
                <span className="font-medium">Password</span>
                <span className="ml-2 text-gray-500 dark:text-gray-400">(credentials)</span>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div className="text-sm">
                <span className="font-medium">Email Magic Link</span>
                <span className="ml-2 text-gray-500 dark:text-gray-400">(email)</span>
              </div>
            </div>
            {user.accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
              >
                <div className="text-sm">
                  <span className="font-medium">{account.provider}</span>
                  <span className="ml-2 text-gray-500 dark:text-gray-400">({account.type})</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sessions */}
        {(() => {
          const now = new Date();
          const activeSessions = user.sessions.filter((s) => new Date(s.expires) > now);
          const expiredSessions = user.sessions.filter((s) => new Date(s.expires) <= now);
          return (
            <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <h2 className="mb-4 text-xl font-semibold">
                Sessions ({activeSessions.length} active)
              </h2>
              {activeSessions.length > 0 ? (
                <div className="space-y-3">
                  {activeSessions.map((session) => (
                    <div
                      key={session.id}
                      className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                    >
                      <div className="text-sm">
                        <span className="font-medium">Expires:</span>{' '}
                        {formatDateTime(parseUTC(session.expires))}
                      </div>
                      <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 font-mono">
                        {session.sessionToken.substring(0, 32)}...
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600 dark:text-gray-400">No active sessions</p>
              )}
              {expiredSessions.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                    {expiredSessions.length} expired session{expiredSessions.length !== 1 ? 's' : ''}
                  </summary>
                  <div className="mt-2 space-y-2">
                    {expiredSessions.map((session) => (
                      <div
                        key={session.id}
                        className="rounded-lg border border-gray-200 p-3 opacity-60 dark:border-gray-700"
                      >
                        <div className="text-sm">
                          <span className="font-medium">Expired:</span>{' '}
                          {formatDateTime(parseUTC(session.expires))}
                        </div>
                        <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 font-mono">
                          {session.sessionToken.substring(0, 32)}...
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })()}
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Delete user</h3>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
              Are you sure you want to delete{' '}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {user.name || user.email}
              </span>
              ? This will remove all their sessions and accounts and cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm text-white transition hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete user
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
