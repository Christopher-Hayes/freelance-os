'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import type { Invoice, Client, Project, InvoiceStatus } from '@freelance-os/types';
import { EditButton, DownloadButton } from '@repo/ui';
import { sendInvoiceEmail } from '@/lib/invoice-actions';
import { authFetch } from '@/lib/util';

interface InvoiceWithRelations extends Omit<Invoice, 'createdAt' | 'updatedAt' | 'issueDate' | 'dueDate' | 'paidDate'> {
  createdAt: string;
  updatedAt: string;
  issueDate: string;
  dueDate: string;
  paidDate?: string;
  client: Pick<Client, 'id' | 'name' | 'email' | 'company'>;
  project?: Pick<Project, 'id' | 'name'> | null;
}

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [invoice, setInvoice] = useState<InvoiceWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Edit form fields
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<InvoiceStatus>('draft');
  const [dueDate, setDueDate] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (id) {
      fetchInvoice();
    }
  }, [id]);

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`/api/invoices/${id}`);
      if (!response.ok) throw new Error('Failed to fetch invoice');
      const data = await response.json();
      setInvoice(data);
      
      // Initialize form fields
      setAmount(data.amount.toString());
      setStatus(data.status);
      setDueDate(data.dueDate.split('T')[0]);
      setPaidDate(data.paidDate ? data.paidDate.split('T')[0] : '');
      setNotes(data.notes || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!invoice) return;

    setSaving(true);
    setError(null);

    try {
      const response = await authFetch(`/api/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          status,
          dueDate,
          paidDate: paidDate || null,
          notes,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update invoice');
      }

      const updatedInvoice = await response.json();
      setInvoice(updatedInvoice);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await authFetch(`/api/invoices/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete invoice');
      router.push('/invoices');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete invoice');
    }
  };

  const handleMarkAsPaid = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await authFetch(`/api/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'paid',
          paidDate: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update invoice');
      }

      const updatedInvoice = await response.json();
      setInvoice(updatedInvoice);
      setStatus('paid');
      const paidDateStr = new Date().toISOString().split('T')[0];
      if (paidDateStr) setPaidDate(paidDateStr);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsSent = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await authFetch(`/api/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'sent',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update invoice');
      }

      const updatedInvoice = await response.json();
      setInvoice(updatedInvoice);
      setStatus('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleSendEmail = async () => {
    if (!invoice) return;
    
    if (!confirm(`Send invoice ${invoice.invoiceNumber} to ${invoice.client.email}?`)) {
      return;
    }

    setSending(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await sendInvoiceEmail(parseInt(id));
      setSuccessMessage(result.message || 'Invoice sent successfully!');
      
      // Update invoice if status changed
      if (result.invoice) {
        setInvoice(result.invoice as any);
        setStatus(result.invoice.status as InvoiceStatus);
      }
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  const getStatusBadgeClass = (status: InvoiceStatus) => {
    const baseClass = 'px-3 py-1 rounded-full text-sm font-medium';
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
      month: 'long',
      day: 'numeric',
    });
  };

  const isOverdue = () => {
    if (!invoice) return false;
    if (invoice.status === 'paid' || invoice.status === 'cancelled') return false;
    return new Date(invoice.dueDate) < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500 dark:text-gray-400">Loading invoice...</div>
      </div>
    );
  }

  if (error && !invoice) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500 dark:text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500 dark:text-gray-400">Invoice not found</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Link href="/invoices" className="text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 mb-2 inline-block">
          ← Back to Invoices
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold dark:text-white mb-2">{invoice.invoiceNumber}</h1>
            <span className={getStatusBadgeClass(invoice.status)}>
              {invoice.status}
            </span>
            {isOverdue() && (
              <span className="ml-2 px-3 py-1 rounded-full text-sm font-medium bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
                Overdue
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded mb-6">
          {successMessage}
        </div>
      )}

      {editing ? (
        /* Edit Form */
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-900">
          <h2 className="text-xl font-semibold dark:text-white mb-4">Edit Invoice</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Amount
              </label>
              <input
                type="number"
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.01"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Status
              </label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label htmlFor="due-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Due Date
              </label>
              <input
                type="date"
                id="due-date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="paid-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Paid Date (Optional)
              </label>
              <input
                type="date"
                id="paid-date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="mt-6">
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
            />
          </div>

          <div className="mt-6 flex justify-between items-center">
            <div className="flex gap-4">
              <button
                onClick={handleUpdate}
                disabled={saving}
                className="bg-blue-500 dark:bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-600 dark:hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  // Reset form fields
                  setAmount(invoice.amount.toString());
                  setStatus(invoice.status);
                  const dueDateStr = invoice.dueDate.split('T')[0];
                  if (dueDateStr) setDueDate(dueDateStr);
                  const paidDateStr = invoice.paidDate ? invoice.paidDate.split('T')[0] : '';
                  if (paidDateStr !== undefined) setPaidDate(paidDateStr);
                  setNotes(invoice.notes || '');
                }}
                className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-6 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition"
              >
                Cancel
              </button>
            </div>
            <button
              onClick={handleDelete}
              className="bg-red-500 dark:bg-red-600 text-white px-6 py-2 rounded hover:bg-red-600 dark:hover:bg-red-700 transition"
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        /* View Mode */
        <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow dark:shadow-gray-900 relative">
          {/* Overlay buttons in top-right */}
          <div className="absolute top-4 right-4 flex gap-2 z-10">
            <DownloadButton href={`/api/invoices/${id}/pdf`} />
            <EditButton onClick={() => setEditing(true)} />
          </div>

          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Client</h3>
              <p className="text-lg font-semibold dark:text-white">{invoice.client.name}</p>
              {invoice.client.company && <p className="text-gray-600 dark:text-gray-400">{invoice.client.company}</p>}
              <p className="text-gray-600 dark:text-gray-400">{invoice.client.email}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Project</h3>
              <p className="text-lg dark:text-white">{invoice.project?.name || 'No specific project'}</p>
            </div>
          </div>

          <div className="border-t border-b border-gray-200 dark:border-gray-700 py-6 mb-6">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Issue Date</h3>
                <p className="text-lg dark:text-white">{formatDate(invoice.issueDate)}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Due Date</h3>
                <p className="text-lg dark:text-white">{formatDate(invoice.dueDate)}</p>
              </div>

              {invoice.paidDate && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Paid Date</h3>
                  <p className="text-lg dark:text-white">{formatDate(invoice.paidDate)}</p>
                </div>
              )}
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-2xl font-bold text-right dark:text-white">
              Amount: {formatCurrency(Number(invoice.amount), invoice.currency)}
            </h3>
          </div>

          {invoice.notes && (
            <div className="mb-8">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Notes</h3>
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          <div className="mb-8 pt-6 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
            <p>Created: {formatDate(invoice.createdAt)}</p>
            <p>Last Updated: {formatDate(invoice.updatedAt)}</p>
          </div>

          {/* Action buttons at bottom */}
          <div className="flex gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleSendEmail}
              disabled={sending || saving}
              className="bg-indigo-500 dark:bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-600 dark:hover:bg-indigo-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition flex items-center gap-2"
              title="Send invoice email to client"
            >
              {sending ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Send Invoice
                </>
              )}
            </button>
            {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
              <button
                onClick={handleMarkAsPaid}
                disabled={saving}
                className="bg-green-500 dark:bg-green-600 text-white px-4 py-2 rounded hover:bg-green-600 dark:hover:bg-green-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition"
              >
                Mark as Paid
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
