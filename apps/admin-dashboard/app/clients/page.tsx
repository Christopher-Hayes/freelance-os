'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2, ChevronRight, Mail, Plus, ReceiptText } from 'lucide-react';
import {
  APIFooter,
  Breadcrumbs,
  Button,
  EmptySurfaceState,
  Page,
  PageContent,
  PageHeader,
  PageLoading,
  Section,
  Surface,
} from '@repo/ui';
import { generateCode } from '@/lib/ai-actions';
import { authFetch } from '@/lib/util';

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
    return <PageLoading title="Loading clients" message="Pulling the latest clients and account counts." />;
  }

  return (
    <Page>
      <PageContent>
        <Section className="space-y-6">
          <Breadcrumbs items={[{ label: "Clients" }]} LinkComponent={Link as any} />

          <PageHeader
            eyebrow="Admin dashboard"
            title="Clients"
            description="Manage client relationships, track account activity, and jump into projects or invoices from a single consistent view."
            actions={
              <Button leftIcon={<Plus className="h-4 w-4" />}>
                <Link href="/clients/new">Add Client</Link>
              </Button>
            }
          />

          {clients.length === 0 ? (
            <EmptySurfaceState
              icon={<Building2 className="h-16 w-16" />}
              title="No clients yet"
              description="Create your first client to start organizing projects, time entries, and invoices around a consistent account record."
              action={
                <Link href="/clients/new">
                  <Button leftIcon={<Plus className="h-4 w-4" />}>Create your first client</Button>
                </Link>
              }
            />
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {clients.map((client) => (
                <Link key={client.id} href={`/clients/${client.id}`} className="block">
                  <Surface interactive className="h-full space-y-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <h3 className="truncate text-xl font-semibold text-slate-900 dark:text-white">{client.name}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{client.company || 'Independent client'}</p>
                      </div>
                      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-400 dark:text-slate-500" />
                    </div>

                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <Mail className="h-4 w-4 shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 dark:border-white/10">
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/80">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <Building2 className="h-3.5 w-3.5" />
                          Projects
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{client._count.projects}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/80">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <ReceiptText className="h-3.5 w-3.5" />
                          Invoices
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{client._count.invoices}</div>
                      </div>
                    </div>
                  </Surface>
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
        </Section>
      </PageContent>
    </Page>
  );
}
