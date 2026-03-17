'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [user, setUser] = useState<User | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    clientId: '',
    role: 'user',
    password: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchUser();
    fetchClients();
  }, [userId]);

  async function fetchUser() {
    try {
      const response = await authFetch(`/api/users/${userId}`);
      if (!response.ok) throw new Error('Failed to fetch user');
      const data = await response.json();
      setUser(data.user);
      setFormData({
        email: data.user.email,
        name: data.user.name || '',
        clientId: data.user.clientId?.toString() || '',
        role: data.user.role || 'user',
        password: '',
      });
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await authFetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          name: formData.name || null,
          clientId: formData.clientId || null,
          role: formData.role,
          password: formData.password || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      alert(data.message || 'User updated successfully!');
      setEditing(false);
      fetchUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        'Are you sure you want to delete this user? This will remove all their sessions and accounts.'
      )
    ) {
      return;
    }

    try {
      const response = await authFetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      alert('User deleted successfully');
      router.push('/users');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user');
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
          <div className="flex gap-2">
            {!editing ? (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
                >
                  Delete
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setEditing(false);
                  setFormData({
                    email: user.email,
                    name: user.name || '',
                    clientId: user.clientId?.toString() || '',
                    role: user.role || 'user',
                    password: '',
                  });
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Cancel Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* User Information */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">User Information</h2>
          {editing ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Link to Client</label>
                <select
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                >
                  <option value="">Not linked</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name} - {client.company || 'No company'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Admin users can access the admin dashboard. Regular users can only access the client portal.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                  placeholder="Leave blank to keep current password"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Leave blank to keep the current password unchanged.
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Email:
                </span>
                <p className="mt-1">{user.email}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Name:</span>
                <p className="mt-1">{user.name || '-'}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Role:</span>
                <p className="mt-1">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      user.role === 'admin'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {user.role}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Email Verified:
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
                  <p className={`mt-1 text-xs ${resendMessage.toLowerCase().includes('fail') || resendMessage.toLowerCase().includes('error') ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {resendMessage}
                  </p>
                )}
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  User ID:
                </span>
                <p className="mt-1 font-mono text-sm">{user.id}</p>
              </div>
            </div>
          )}
        </div>

        {/* Linked Client */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Linked Client</h2>
          {user.client ? (
            <div className="space-y-3">
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Client:
                </span>
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
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Company:
                </span>
                <p className="mt-1">{user.client.company || '-'}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Client Email:
                </span>
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
                {editing
                  ? 'Use the form above to link this user to a client.'
                  : 'Click "Edit" to link this user to a client.'}
              </p>
            </div>
          )}
        </div>

        {/* Sessions */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">
            Active Sessions ({user._count.sessions})
          </h2>
          {user.sessions.length > 0 ? (
            <div className="space-y-3">
              {user.sessions.map((session) => (
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
        </div>

        {/* Authentication Accounts */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">
            Authentication Methods ({user._count.accounts})
          </h2>
          {user.accounts.length > 0 ? (
            <div className="space-y-2">
              {user.accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                >
                  <div className="text-sm">
                    <span className="font-medium">{account.provider}</span> ({account.type})
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 dark:text-gray-400">
              No authentication methods configured. The user can sign in using email magic link.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
