'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { EmptyState, Breadcrumbs, APIFooter } from '@repo/ui';
import { authFetch } from '@/lib/util';
import { generateCode } from '@/lib/ai-actions';

type Client = {
  id: number;
  name: string;
  email: string;
  company: string | null;
  _count: {
    projects: number;
    invoices: number;
  };
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/clients')
      .then(async res => {
        const data = await res.json();
        if (data.error) {
          console.error('API error:', data.error);
          setLoading(false);
          return;
        }
        setClients(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching clients:', err);
        setLoading(false);
      });
  }, []);

  const handleGenerateCode = async (endpoint: any, language: string) => {
    return await generateCode(endpoint, language);
  };

  if (loading) {
    return <div className="p-8"><div className="text-gray-600 dark:text-gray-400">Loading...</div></div>;
  }

  return (
    <div className="p-8">
      <Breadcrumbs items={[{ label: "Clients" }]} LinkComponent={Link as any} />
      
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">Clients</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your client relationships</p>
        </div>
        <Link
          href="/clients/new"
          className="bg-blue-600 dark:bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium inline-flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Client
        </Link>
      </div>

      {clients.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
          title="No clients yet"
          description="Get started by creating your first client. Clients are the foundation of your freelance business."
          action={
            <Link
              href="/clients/new"
              className="inline-flex items-center gap-2 bg-blue-600 dark:bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create your first client
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 hover:shadow-lg dark:hover:shadow-gray-900 transition-all p-6 block border border-transparent hover:border-blue-500 dark:hover:border-blue-400"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {client.name}
                  </h3>
                  {client.company && (
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{client.company}</p>
                  )}
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {client.email}
                </p>
                
                <div className="flex gap-4 pt-3 border-t border-gray-200 dark:border-gray-700 mt-3">
                  <div className="text-sm flex items-center gap-1">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {client._count.projects}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {client._count.projects === 1 ? 'project' : 'projects'}
                    </span>
                  </div>
                  <div className="text-sm flex items-center gap-1">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {client._count.invoices}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {client._count.invoices === 1 ? 'invoice' : 'invoices'}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
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
            path: "/clients",
            description: "List all clients with project and invoice counts",
            queryParams: [
              {
                name: "page",
                type: "number",
                description: "Page number for pagination",
              },
              {
                name: "limit",
                type: "number",
                description: "Number of items per page (default: 50)",
              },
              {
                name: "search",
                type: "string",
                description: "Search by client name, email, or company",
              },
            ],
          },
          {
            method: "POST",
            path: "/clients",
            description: "Create a new client",
            body: JSON.stringify(
              {
                name: "Client Name",
                email: "client@example.com",
                company: "Company Name",
                phone: "+1234567890",
                address: "123 Main St",
              },
              null,
              2
            ),
          },
          {
            method: "GET",
            path: "/clients/{id}",
            description: "Get a specific client with related data",
          },
          {
            method: "PUT",
            path: "/clients/{id}",
            description: "Update a client's information",
            body: JSON.stringify(
              {
                name: "Updated Name",
                email: "newemail@example.com",
              },
              null,
              2
            ),
          },
          {
            method: "DELETE",
            path: "/clients/{id}",
            description: "Delete a client (cascades to projects, time entries, and invoices)",
          },
        ]}
      />
    </div>
  );
}
