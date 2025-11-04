'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Invoice, Client, Project, InvoiceStatus } from '@freelance-os/types';

interface InvoiceWithRelations extends Omit<Invoice, 'createdAt' | 'updatedAt' | 'issueDate' | 'dueDate' | 'paidDate'> {
  createdAt: string;
  updatedAt: string;
  issueDate: string;
  dueDate: string;
  paidDate?: string;
  client: Pick<Client, 'id' | 'name' | 'email' | 'company'>;
  project?: Pick<Project, 'id' | 'name'> | null;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceWithRelations[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [clientFilter, setClientFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    fetchInvoices();
    fetchClients();
  }, [clientFilter, statusFilter]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (clientFilter) params.append('clientId', clientFilter);
      if (statusFilter) params.append('status', statusFilter);

      const response = await fetch(`/api/invoices?${params}`);
      if (!response.ok) throw new Error('Failed to fetch invoices');
      const data = await response.json();
      setInvoices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await fetch('/api/clients');
      if (!response.ok) throw new Error('Failed to fetch clients');
      const data = await response.json();
      setClients(data);
    } catch (err) {
      console.error('Error fetching clients:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;

    try {
      const response = await fetch(`/api/invoices/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete invoice');
      fetchInvoices();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete invoice');
    }
  };

  const getStatusBadgeClass = (status: InvoiceStatus) => {
    const baseClass = 'px-2 py-1 rounded-full text-xs font-medium';
    switch (status) {
      case 'draft':
        return `${baseClass} bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200`;
      case 'sent':
        return `${baseClass} bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200`;
      case 'paid':
        return `${baseClass} bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200`;
      case 'overdue':
        return `${baseClass} bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200`;
      case 'cancelled':
        return `${baseClass} bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400`;
      default:
        return baseClass;
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isOverdue = (invoice: InvoiceWithRelations) => {
    if (invoice.status === 'paid' || invoice.status === 'cancelled') return false;
    return new Date(invoice.dueDate) < new Date();
  };

  const calculateTotalAmount = () => {
    return invoices.reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  };

  const calculatePaidAmount = () => {
    return invoices
      .filter(inv => inv.status === 'paid')
      .reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  };

  const calculateOutstandingAmount = () => {
    return invoices
      .filter(inv => inv.status !== 'paid' && inv.status !== 'cancelled')
      .reduce((sum, invoice) => sum + Number(invoice.amount), 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500 dark:text-gray-400">Loading invoices...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500 dark:text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold dark:text-white">Invoices</h1>
        <Link
          href="/invoices/new"
          className="bg-blue-500 dark:bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-600 dark:hover:bg-blue-700 transition"
        >
          Create Invoice
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-900">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Total Amount</h3>
          <p className="text-2xl font-bold dark:text-white">{formatCurrency(calculateTotalAmount(), 'USD')}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-900">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Paid</h3>
          <p className="text-2xl font-bold text-green-600 dark:text-green-500">{formatCurrency(calculatePaidAmount(), 'USD')}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-900">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Outstanding</h3>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-500">{formatCurrency(calculateOutstandingAmount(), 'USD')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow dark:shadow-gray-900 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="client-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Filter by Client
            </label>
            <select
              id="client-filter"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
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
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Filter by Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setClientFilter('');
                setStatusFilter('');
              }}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Invoices List */}
      {invoices.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">No invoices found.</p>
          <Link
            href="/invoices/new"
            className="text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 font-medium"
          >
            Create your first invoice
          </Link>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Invoice #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Project
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Issue Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Due Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className={isOverdue(invoice) ? 'bg-red-50 dark:bg-red-900/20' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{invoice.client.name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{invoice.client.company}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {invoice.project?.name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {formatCurrency(Number(invoice.amount), invoice.currency)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(invoice.issueDate)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(invoice.dueDate)}
                    {isOverdue(invoice) && (
                      <span className="ml-2 text-red-600 dark:text-red-400 font-medium">Overdue</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={getStatusBadgeClass(invoice.status)}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mr-4"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => handleDelete(invoice.id)}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
