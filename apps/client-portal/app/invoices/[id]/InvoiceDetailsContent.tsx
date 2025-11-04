'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Invoice, InvoiceStatus } from '@freelance-os/types';

interface InvoiceWithRelations extends Omit<Invoice, 'createdAt' | 'updatedAt' | 'issueDate' | 'dueDate' | 'paidDate'> {
  createdAt: string;
  updatedAt: string;
  issueDate: string;
  dueDate: string;
  paidDate?: string | null;
  isOverdue?: boolean;
  client: {
    name: string;
    company?: string | null;
    email: string;
  };
  project?: {
    name: string;
    description?: string | null;
  } | null;
}

export function InvoiceDetailsContent() {
  const params = useParams();
  const id = params.id as string;

  const [invoice, setInvoice] = useState<InvoiceWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchInvoice();
    }
  }, [id]);

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/invoices/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Invoice not found or you do not have access to it');
        }
        throw new Error('Failed to fetch invoice');
      }
      const data = await response.json();
      setInvoice(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status: InvoiceStatus, isOverdue: boolean = false) => {
    const baseClass = 'px-3 py-1 rounded-full text-sm font-semibold';
    
    if (isOverdue && status !== 'paid' && status !== 'cancelled') {
      return `${baseClass} bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200`;
    }
    
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

  const getDaysDifference = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-500 dark:text-gray-400">Loading invoice...</div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-red-500 dark:text-red-400 mb-4">
            {error || 'Invoice not found'}
          </div>
          <Link
            href="/invoices"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
          >
            ← Back to Invoices
          </Link>
        </div>
      </div>
    );
  }

  const daysToDue = getDaysDifference(invoice.dueDate);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/invoices"
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mb-2 inline-block"
        >
          ← Back to Invoices
        </Link>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mt-4">
          <div>
            <h1 className="text-3xl font-bold dark:text-white mb-2">
              {invoice.invoiceNumber}
            </h1>
            <div className="flex flex-wrap gap-2">
              <span className={getStatusBadgeClass(invoice.status, invoice.isOverdue || false)}>
                {invoice.isOverdue && invoice.status !== 'paid' && invoice.status !== 'cancelled' 
                  ? 'OVERDUE' 
                  : invoice.status.toUpperCase()}
              </span>
              {invoice.status === 'paid' && invoice.paidDate && (
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  Paid on {formatDate(invoice.paidDate)}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold dark:text-white">
              {formatCurrency(Number(invoice.amount), invoice.currency)}
            </div>
            {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {invoice.isOverdue ? (
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    {Math.abs(daysToDue)} days overdue
                  </span>
                ) : daysToDue === 0 ? (
                  <span className="text-orange-600 dark:text-orange-400 font-medium">
                    Due today
                  </span>
                ) : daysToDue > 0 ? (
                  <span>Due in {daysToDue} days</span>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invoice Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Invoice Information */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-900">
          <h2 className="text-xl font-semibold dark:text-white mb-4">Invoice Information</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Invoice Number</dt>
              <dd className="text-base text-gray-900 dark:text-white font-medium">{invoice.invoiceNumber}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Issue Date</dt>
              <dd className="text-base text-gray-900 dark:text-white">{formatDate(invoice.issueDate)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Due Date</dt>
              <dd className="text-base text-gray-900 dark:text-white">{formatDate(invoice.dueDate)}</dd>
            </div>
            {invoice.project && (
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Project</dt>
                <dd className="text-base text-gray-900 dark:text-white">
                  <Link
                    href={`/projects/${invoice.projectId}`}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                  >
                    {invoice.project.name}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Billing Information */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-900">
          <h2 className="text-xl font-semibold dark:text-white mb-4">Bill To</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</dt>
              <dd className="text-base text-gray-900 dark:text-white">{invoice.client.name}</dd>
            </div>
            {invoice.client.company && (
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Company</dt>
                <dd className="text-base text-gray-900 dark:text-white">{invoice.client.company}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
              <dd className="text-base text-gray-900 dark:text-white">{invoice.client.email}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-900">
          <h2 className="text-xl font-semibold dark:text-white mb-4">Notes</h2>
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}

      {/* Payment Summary */}
      <div className="bg-linear-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 p-6 rounded-lg shadow dark:shadow-gray-900 border border-blue-100 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold dark:text-white mb-2">Total Amount</h2>
            <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(Number(invoice.amount), invoice.currency)}
            </p>
          </div>
          <div className="text-right">
            <div className={getStatusBadgeClass(invoice.status, invoice.isOverdue || false)}>
              {invoice.isOverdue && invoice.status !== 'paid' && invoice.status !== 'cancelled' 
                ? 'OVERDUE' 
                : invoice.status.toUpperCase()}
            </div>
            {invoice.status === 'paid' && invoice.paidDate && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Paid on {formatDate(invoice.paidDate)}
              </p>
            )}
            {invoice.isOverdue && invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2 font-medium">
                Payment is {Math.abs(daysToDue)} days overdue
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Help Text */}
      {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            If you have any questions about this invoice, please contact your service provider.
          </p>
        </div>
      )}
    </div>
  );
}
