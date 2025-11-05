'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { parseUTC, formatDateTime } from '@/lib/datetime';
import { APIFooter } from '@repo/ui';
import { generateCode } from '@/lib/ai-actions';

interface User {
  id: string;
  email: string;
  name: string | null;
  emailVerified: string | null;
  clientId: number | null;
  lastLogin: string | null;
  sessionCount: number;
  createdAt: string | null;
}

interface Client {
  id: number;
  name: string;
  email: string;
  company: string | null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    clientId: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchClients();
  }, []);

  async function fetchUsers() {
    try {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  async function fetchClients() {
    try {
      const response = await fetch('/api/clients');
      if (!response.ok) throw new Error('Failed to fetch clients');
      const data = await response.json();
      // API returns array directly, not { clients: [...] }
      setClients(data);
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          name: formData.name || null,
          clientId: formData.clientId || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      alert(data.message || 'User created successfully!');
      setFormData({ email: '', name: '', clientId: '' });
      setShowNewUserForm(false);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(userId: string) {
    if (!confirm('Are you sure you want to delete this user? This will remove all their sessions and accounts.')) {
      return;
    }

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user');
    }
  }

  function getClientName(clientId: number | null): string {
    if (!clientId) return 'Not linked';
    if (!Array.isArray(clients)) return 'Loading...';
    const client = clients.find((c) => c.id === clientId);
    return client ? `${client.name} (${client.company || 'No company'})` : 'Unknown client';
  }

  const handleGenerateCode = async (endpoint: any, language: string) => {
    return await generateCode(endpoint, language);
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Manage client portal users and their access
          </p>
        </div>
        <button
          onClick={() => setShowNewUserForm(!showNewUserForm)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {showNewUserForm ? 'Cancel' : 'New User'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {showNewUserForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Create New User</h2>
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

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                {submitting ? 'Creating...' : 'Create User'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewUserForm(false);
                  setFormData({ email: '', name: '', clientId: '' });
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold">Email</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Name</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Linked Client</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Verified</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Last Login</th>
              <th className="px-6 py-3 text-left text-sm font-semibold">Sessions</th>
              <th className="px-6 py-3 text-right text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  No users found. Create your first user to get started.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 text-sm">{user.email}</td>
                  <td className="px-6 py-4 text-sm">{user.name || '-'}</td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={
                        user.clientId
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-gray-500 dark:text-gray-500'
                      }
                    >
                      {getClientName(user.clientId)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {user.emailVerified ? (
                      <span className="text-green-700 dark:text-green-400">
                        {formatDateTime(parseUTC(user.emailVerified))}
                      </span>
                    ) : (
                      <span className="text-yellow-600 dark:text-yellow-400">Not verified</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {user.lastLogin ? formatDateTime(parseUTC(user.lastLogin)) : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm">{user.sessionCount}</td>
                  <td className="px-6 py-4 text-right text-sm">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/users/${user.id}`}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        <p>Total users: {users.length}</p>
        <p className="mt-2">
          Users can sign in to the client portal using magic link authentication. Once they verify
          their email, they'll have access to the portal data based on their linked client.
        </p>
      </div>

      <APIFooter
        enableApiKeys
        enableCodeGen
        onGenerateApiKey={() => window.location.href = '/api-demo'}
        onGenerateCode={handleGenerateCode}
        endpoints={[
          {
            method: "GET",
            path: "/users",
            description: "List all users with session info",
            queryParams: [
              {
                name: "clientId",
                type: "number",
                description: "Filter users by linked client ID",
              },
              {
                name: "verified",
                type: "boolean",
                description: "Filter by email verification status",
              },
            ],
          },
          {
            method: "POST",
            path: "/users",
            description: "Create a new user (sends magic link email)",
            body: JSON.stringify(
              {
                email: "user@example.com",
                name: "User Name",
                clientId: 1,
              },
              null,
              2
            ),
          },
          {
            method: "GET",
            path: "/users/{id}",
            description: "Get a specific user with detailed info",
          },
          {
            method: "PUT",
            path: "/users/{id}",
            description: "Update a user's information",
            body: JSON.stringify(
              {
                name: "Updated Name",
                clientId: 2,
              },
              null,
              2
            ),
          },
          {
            method: "DELETE",
            path: "/users/{id}",
            description: "Delete a user (removes sessions and accounts)",
          },
        ]}
      />
    </div>
  );
}
