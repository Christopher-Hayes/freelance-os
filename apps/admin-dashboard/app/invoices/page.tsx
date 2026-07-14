'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
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
  StatCard,
  Surface,
} from '@repo/ui';
import type { Client, Invoice, InvoiceStatus, Project } from '@freelance-os/types';
import {
  CircleDollarSign,
  CreditCard,
  FileText,
  Filter,
  Plus,
  ReceiptText,
  Trash2,
} from 'lucide-react';
import { Temporal } from '@/lib/temporal-polyfill';
import { generateCode } from '@/lib/ai-actions';
import { formatDate } from '@/lib/datetime';
import { getInvoiceDisplayName } from '@/lib/invoice-format';
import { authFetch } from '@/lib/util';

interface InvoiceWithRelations extends Omit<Invoice, 'createdAt' | 'updatedAt' | 'issueDate' | 'dueDate' | 'paidDate' | 'periodStart' | 'periodEnd'> {
  createdAt: string;
  updatedAt: string;
  issueDate: string;
  dueDate: string;
  paidDate?: string;
  periodStart?: string;
  periodEnd?: string;
  client: Pick<Client, 'id' | 'name' | 'email' | 'company'>;
  projects: Pick<Project, 'id' | 'name'>[];
  isAllProjects: boolean;
}

const invoiceStatusVariants: Record<InvoiceStatus, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'subtle'> = {
  draft: 'subtle',
  sent: 'info',
  paid: 'success',
  overdue: 'danger',
  cancelled: 'default',
};

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge variant={invoiceStatusVariants[status]} size="sm" className="capitalize">
      {status}
    </Badge>
  );
}

function formatInvoiceDate(dateString: string) {
  return formatDate(dateString, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

function isInvoiceOverdue(invoice: InvoiceWithRelations) {
  if (invoice.status === 'paid' || invoice.status === 'cancelled') return false;

  const dueDate = Temporal.Instant.from(invoice.dueDate);
  return Temporal.Instant.compare(dueDate, Temporal.Now.instant()) < 0;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceWithRelations[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (clientFilter) params.append('clientId', clientFilter);
      if (statusFilter) params.append('status', statusFilter);

      const response = await authFetch(`/api/invoices?${params}`);
      if (!response.ok) throw new Error('Failed to fetch invoices');
      const data = await response.json();
      setInvoices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [clientFilter, statusFilter]);

  const fetchClients = useCallback(async () => {
    try {
      const response = await authFetch('/api/clients');
      if (!response.ok) throw new Error('Failed to fetch clients');
      const data = await response.json();
      setClients(data);
    } catch (err) {
      console.error('Error fetching clients:', err);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;

    try {
      const response = await authFetch(`/api/invoices/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete invoice');
      fetchInvoices();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete invoice');
    }
  }, [fetchInvoices]);

  const totals = useMemo(() => {
    const totalAmount = invoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
    const paidAmount = invoices
      .filter((invoice) => invoice.status === 'paid')
      .reduce((sum, invoice) => sum + Number(invoice.amount), 0);
    const outstandingAmount = invoices
      .filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'cancelled')
      .reduce((sum, invoice) => sum + Number(invoice.amount), 0);
    const overdueCount = invoices.filter((invoice) => isInvoiceOverdue(invoice)).length;

    return { totalAmount, paidAmount, outstandingAmount, overdueCount };
  }, [invoices]);

  const handleGenerateCode = async (endpoint: any, language: string) => {
    return await generateCode(endpoint, language);
  };

  if (loading && invoices.length === 0) {
    return <PageLoading title="Loading invoices" message="Fetching invoices, client filters, and payment status data." />;
  }

  if (error) {
    return (
      <Page>
        <PageContent>
          <PageError title="Couldn’t load invoices" message={error} retry={fetchInvoices} />
        </PageContent>
      </Page>
    );
  }

  return (
    <Page>
      <PageContent>
        <Section className="space-y-6">
          <Breadcrumbs items={[{ label: 'Invoices' }]} LinkComponent={Link as any} />

          <PageHeader
            eyebrow="Admin dashboard"
            title="Invoices"
            description="Track invoice health, monitor collections, and manage billing records with a cleaner operational view."
            actions={
              <Link href="/invoices/new">
                <Button leftIcon={<Plus className="h-4 w-4" />}>Create Invoice</Button>
              </Link>
            }
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total billed"
              value={formatCurrency(totals.totalAmount, 'USD')}
              icon={<ReceiptText className="h-5 w-5" />}
              meta={`${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`}
            />
            <StatCard
              label="Paid"
              value={formatCurrency(totals.paidAmount, 'USD')}
              tone="success"
              icon={<CreditCard className="h-5 w-5" />}
              meta="Marked paid invoices"
            />
            <StatCard
              label="Outstanding"
              value={formatCurrency(totals.outstandingAmount, 'USD')}
              tone="warning"
              icon={<CircleDollarSign className="h-5 w-5" />}
              meta="Open and unpaid invoices"
            />
            <StatCard
              label="Overdue"
              value={totals.overdueCount}
              tone={totals.overdueCount > 0 ? 'danger' : 'default'}
              icon={<FileText className="h-5 w-5" />}
              meta="Past due and still unpaid"
            />
          </div>

          <Surface className="space-y-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <Filter className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  Filters
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Refine invoices by client account or current billing status.</p>
              </div>
              <Badge variant="subtle" size="sm">{invoices.length} result{invoices.length === 1 ? '' : 's'}</Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Select
                id="client-filter"
                label="Client"
                value={clientFilter}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setClientFilter(e.target.value)}
              >
                <option value="">All clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>

              <Select
                id="status-filter"
                label="Status"
                value={statusFilter}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </Select>

              <div className="flex items-end">
                <Button
                  variant="secondary"
                  className="w-full md:w-auto"
                  onClick={() => {
                    setClientFilter('');
                    setStatusFilter('');
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </div>
          </Surface>

          {invoices.length === 0 ? (
            <EmptySurfaceState
              icon={<ReceiptText className="h-16 w-16" />}
              title="No invoices found"
              description="Create your first invoice to start tracking receivables, payment state, and project billing history in one place."
              action={
                <Link href="/invoices/new">
                  <Button leftIcon={<Plus className="h-4 w-4" />}>Create your first invoice</Button>
                </Link>
              }
            />
          ) : (
            <Surface padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10">
                  <thead className="bg-slate-50 dark:bg-slate-950/80">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Invoice</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Name</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Client</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Project</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Amount</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Issued</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Due</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-white/10 dark:bg-slate-900">
                    {invoices.map((invoice) => {
                      const overdue = isInvoiceOverdue(invoice);

                      return (
                        <tr key={invoice.id} className={overdue ? 'bg-red-50/60 dark:bg-red-950/20' : 'hover:bg-slate-50 dark:hover:bg-white/5'}>
                          <td className="px-6 py-4 align-top">
                            <Link href={`/invoices/${invoice.id}`} className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                              {invoice.invoiceNumber}
                            </Link>
                          </td>
                          <td className="px-6 py-4 align-top text-sm text-slate-600 dark:text-slate-400">
                            {getInvoiceDisplayName({ ...invoice, projectNames: invoice.projects.map(p => p.name) })}
                          </td>
                          <td className="px-6 py-4 align-top">
                            <div className="text-sm font-medium text-slate-900 dark:text-white">{invoice.client.name}</div>
                            <div className="text-sm text-slate-500 dark:text-slate-400">{invoice.client.company || invoice.client.email}</div>
                          </td>
                          <td className="px-6 py-4 align-top text-sm text-slate-600 dark:text-slate-400">
                            {(invoice.isAllProjects && invoice.projects.length > 1)
                              ? 'All projects'
                              : invoice.projects.map(p => p.name).join(', ')}
                          </td>
                          <td className="px-6 py-4 align-top text-sm font-semibold text-slate-900 dark:text-white">
                            {formatCurrency(Number(invoice.amount), invoice.currency)}
                          </td>
                          <td className="px-6 py-4 align-top text-sm text-slate-600 dark:text-slate-400">
                            {formatInvoiceDate(invoice.issueDate)}
                          </td>
                          <td className="px-6 py-4 align-top text-sm text-slate-600 dark:text-slate-400">
                            <div>{formatInvoiceDate(invoice.dueDate)}</div>
                            {overdue ? <div className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">Past due</div> : null}
                          </td>
                          <td className="px-6 py-4 align-top">
                            <InvoiceStatusBadge status={invoice.status} />
                          </td>
                          <td className="px-6 py-4 align-top">
                            <div className="flex items-center gap-2">
                              <Link href={`/invoices/${invoice.id}`}>
                                <Button variant="secondary" size="sm">View</Button>
                              </Link>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(invoice.id)}
                                leftIcon={<Trash2 className="h-4 w-4" />}
                                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Surface>
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
                path: '/invoices',
                description: 'List all invoices with optional filters',
                queryParams: [
                  {
                    name: 'clientId',
                    type: 'number',
                    description: 'Filter by client ID',
                  },
                  {
                    name: 'status',
                    type: 'string',
                    enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
                    description: 'Filter by invoice status',
                  },
                  {
                    name: 'projectId',
                    type: 'number',
                    description: 'Filter by project ID',
                  },
                  {
                    name: 'startDate',
                    type: 'string',
                    description: 'Filter by issue date >= startDate (YYYY-MM-DD)',
                  },
                  {
                    name: 'endDate',
                    type: 'string',
                    description: 'Filter by issue date <= endDate (YYYY-MM-DD)',
                  },
                ],
              },
              {
                method: 'POST',
                path: '/invoices',
                description: 'Create a new invoice',
                body: JSON.stringify(
                  {
                    clientId: 1,
                    projectId: 1,
                    invoiceNumber: 'INV-20251104-001',
                    issueDate: '2025-11-04',
                    dueDate: '2025-11-18',
                    amount: '1500.00',
                    currency: 'USD',
                    status: 'draft',
                    notes: 'Payment terms: Net 14',
                  },
                  null,
                  2
                ),
              },
              {
                method: 'GET',
                path: '/invoices/{id}',
                description: 'Get a specific invoice with details',
              },
              {
                method: 'PUT',
                path: '/invoices/{id}',
                description: 'Update an invoice',
                body: JSON.stringify(
                  {
                    status: 'sent',
                    sentDate: '2025-11-04',
                  },
                  null,
                  2
                ),
              },
              {
                method: 'DELETE',
                path: '/invoices/{id}',
                description: 'Delete an invoice',
              },
            ]}
          />
        </Section>
      </PageContent>
    </Page>
  );
}
