'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Temporal } from '@js-temporal/polyfill';
import type { Client, Project } from '@freelance-os/types';
import { generateInvoice } from '@/lib/invoice-actions';
import { authFetch } from '@/lib/util';
import MiniCalendar from '@/components/MiniCalendar';

export default function NewInvoicePage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form mode
  const [mode, setMode] = useState<'manual' | 'generate'>('manual');

  // Manual form fields
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState<number | ''>('');
  const [projectId, setProjectId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [status, setStatus] = useState<'draft' | 'sent'>('draft');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0] ?? '');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  // Generate form fields
  const [hourlyRate, setHourlyRate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dueInDays, setDueInDays] = useState('30');

  // Range stats for the generate form (fetched when both dates are set)
  type RangeStats = {
    totalMinutes: number;
    entryCount: number;
    billableMinutes: number;
  };
  const [rangeStats, setRangeStats] = useState<RangeStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Fetch range stats when both start and end dates are set in generate mode
  useEffect(() => {
    if (mode !== 'generate' || !startDate || !endDate || !clientId) {
      setRangeStats(null);
      return;
    }

    const controller = new AbortController();
    setLoadingStats(true);

    (async () => {
      try {
        const params = new URLSearchParams({
          startDate,
          endDate,
          clientId: String(clientId),
        });
        if (projectId) params.set('projectId', String(projectId));

        const res = await authFetch(`/api/time?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Failed to fetch time entries');
        const data = await res.json();
        const entries = data.timeEntries ?? [];

        let totalMinutes = 0;
        let billableMinutes = 0;
        for (const e of entries) {
          totalMinutes += e.durationMinutes;
          if (e.billable) billableMinutes += e.durationMinutes;
        }

        setRangeStats({
          totalMinutes,
          entryCount: entries.length,
          billableMinutes,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Failed to fetch range stats', err);
          setRangeStats(null);
        }
      } finally {
        setLoadingStats(false);
      }
    })();

    return () => controller.abort();
  }, [mode, startDate, endDate, clientId, projectId]);

  // Missing weekdays check: weekdays in the selected range with no project time 8am–8pm
  const [missingDays, setMissingDays] = useState<string[] | null>(null);
  const [loadingMissingDays, setLoadingMissingDays] = useState(false);

  const checkStart = mode === 'generate' ? startDate : issueDate;
  const checkEnd = mode === 'generate' ? endDate : dueDate;

  useEffect(() => {
    if (!checkStart || !checkEnd) {
      setMissingDays(null);
      return;
    }

    // Cap the end at today — future dates can't have work logged
    const today = Temporal.Now.plainDateISO().toString();
    const effectiveEnd = checkEnd < today ? checkEnd : today;

    if (effectiveEnd < checkStart) {
      setMissingDays([]);
      return;
    }

    const controller = new AbortController();
    setLoadingMissingDays(true);

    (async () => {
      try {
        const params = new URLSearchParams({ startDate: checkStart, endDate: effectiveEnd });
        const res = await authFetch(`/api/time/missing-days?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error('Failed to fetch missing days');
        const data = await res.json();
        setMissingDays(data.missingDays ?? []);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Failed to fetch missing days', err);
          setMissingDays(null);
        }
      } finally {
        setLoadingMissingDays(false);
      }
    })();

    return () => controller.abort();
  }, [mode, checkStart, checkEnd]);

  // Computed billing estimate
  const billingEstimate = useMemo(() => {
    if (!rangeStats || !hourlyRate) return null;
    const rate = parseFloat(hourlyRate);
    if (isNaN(rate) || rate <= 0) return null;
    const billableHours = rangeStats.billableMinutes / 60;
    return billableHours * rate;
  }, [rangeStats, hourlyRate]);

  useEffect(() => {
    fetchClients();
    fetchProjects();
    
    // Set default due date to 30 days from now
    const defaultDueDate = new Date();
    defaultDueDate.setDate(defaultDueDate.getDate() + 30);
    const dueDateStr = defaultDueDate.toISOString().split('T')[0];
    if (dueDateStr) {
      setDueDate(dueDateStr);
    }
    
    // Generate default invoice number
    generateInvoiceNumber();
  }, []);

  const fetchClients = async () => {
    try {
      const response = await authFetch('/api/clients');
      if (!response.ok) throw new Error('Failed to fetch clients');
      const data = await response.json();
      setClients(data);
    } catch (err) {
      console.error('Error fetching clients:', err);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await authFetch('/api/projects');
      if (!response.ok) throw new Error('Failed to fetch projects');
      const data = await response.json();
      setProjects(data);
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  };

  const generateInvoiceNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    setInvoiceNumber(`INV-${year}${month}${day}-${random}`);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await authFetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNumber,
          name: name || undefined,
          clientId: Number(clientId),
          projectId: projectId ? Number(projectId) : undefined,
          amount: parseFloat(amount),
          currency,
          status,
          issueDate,
          dueDate,
          notes,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create invoice');
      }

      const invoice = await response.json();
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const invoice = await generateInvoice({
        clientId: Number(clientId),
        projectId: projectId ? Number(projectId) : undefined,
        name: name || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        hourlyRate: parseFloat(hourlyRate),
        currency,
        notes,
        dueInDays: parseInt(dueInDays),
      });

      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(
    (project) => !clientId || project.clientId === Number(clientId)
  );

  // When project selection changes, prefill hourly rate from project data
  const handleProjectChange = (newProjectId: number | '') => {
    setProjectId(newProjectId);
    if (newProjectId) {
      const selected = projects.find((p) => p.id === Number(newProjectId));
      if (selected?.hourlyRate != null) {
        setHourlyRate(String(selected.hourlyRate));
      }
    }
  };

  function formatMissingDay(dateStr: string): string {
    const d = Temporal.PlainDate.from(dateStr);
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${weekdays[d.dayOfWeek - 1]} ${months[d.month - 1]} ${d.day}`;
  }

  const missingDaysNotice = missingDays && missingDays.length > 0 ? (
    <div className="mt-6 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <svg className="h-5 w-5 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {missingDays.length === 1
              ? 'One weekday in this range has no logged project time between 8 AM and 8 PM.'
              : `${missingDays.length} weekdays in this range have no logged project time between 8 AM and 8 PM.`}
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            This might just mean those were light days — but it's worth a quick check before invoicing.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {missingDays.map((day) => (
              <li key={day} className="text-xs font-medium bg-amber-100 dark:bg-amber-800/40 text-amber-800 dark:text-amber-300 px-2 py-1 rounded">
                {formatMissingDay(day)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Link href="/invoices" className="text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 mb-2 inline-block">
          ← Back to Invoices
        </Link>
        <h1 className="text-3xl font-bold dark:text-white">Create Invoice</h1>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Mode Selector */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-900 mb-6">
        <div className="flex gap-4">
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
              mode === 'manual'
                ? 'bg-blue-500 dark:bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Manual Invoice
          </button>
          <button
            onClick={() => setMode('generate')}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition ${
              mode === 'generate'
                ? 'bg-blue-500 dark:bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Generate from Time Entries
          </button>
        </div>
      </div>

      {/* Manual Invoice Form */}
      {mode === 'manual' && (
        <form onSubmit={handleManualSubmit} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-900">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="invoice-number" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Invoice Number *
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="invoice-number"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  required
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
                />
                <button
                  type="button"
                  onClick={generateInvoiceNumber}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Generate
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="invoice-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name (Optional)
              </label>
              <input
                type="text"
                id="invoice-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Defaults to the billing period"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="client" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Client *
              </label>
              <select
                id="client"
                value={clientId}
                onChange={(e) => {
                  setClientId(Number(e.target.value));
                  setProjectId('');
                }}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} {client.company ? `(${client.company})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="project" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Project (Optional)
              </label>
              <select
                id="project"
                value={projectId}
                onChange={(e) => setProjectId(Number(e.target.value))}
                disabled={!clientId}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
              >
                <option value="">No specific project</option>
                {filteredProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Amount *
              </label>
              <input
                type="number"
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.01"
                min="0"
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="currency" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Currency
              </label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>

            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Status
              </label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'draft' | 'sent')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
              </select>
            </div>

            <MiniCalendar
              label="Issue Date *"
              value={issueDate}
              onChange={setIssueDate}
              clientId={clientId}
              projectId={projectId}
              rangeStart={issueDate}
              rangeEnd={dueDate}
            />

            <MiniCalendar
              label="Due Date *"
              value={dueDate}
              onChange={setDueDate}
              clientId={clientId}
              projectId={projectId}
              rangeStart={issueDate}
              rangeEnd={dueDate}
            />
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
              placeholder="Add any additional notes..."
            />
          </div>

          {loadingMissingDays && (
            <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">Checking for days without project time…</p>
          )}
          {missingDaysNotice}

          <div className="mt-6 flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-500 dark:bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-600 dark:hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition"
            >
              {loading ? 'Creating...' : 'Create Invoice'}
            </button>
            <Link
              href="/invoices"
              className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-6 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition inline-flex items-center"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}

      {/* Generate Invoice Form */}
      {mode === 'generate' && (
        <form onSubmit={handleGenerateSubmit} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow dark:shadow-gray-900">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="gen-client" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Client *
              </label>
              <select
                id="gen-client"
                value={clientId}
                onChange={(e) => {
                  setClientId(Number(e.target.value));
                  setProjectId('');
                  setHourlyRate('');
                }}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} {client.company ? `(${client.company})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="gen-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name (Optional)
              </label>
              <input
                type="text"
                id="gen-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Defaults to the billing period"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="gen-project" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Project (Optional)
              </label>
              <select
                id="gen-project"
                value={projectId}
                onChange={(e) => handleProjectChange(e.target.value ? Number(e.target.value) : '')}
                disabled={!clientId}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
              >
                <option value="">All projects for client</option>
                {filteredProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}{project.hourlyRate != null ? ` ($${Number(project.hourlyRate).toFixed(2)}/hr)` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="hourly-rate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Hourly Rate *
              </label>
              <input
                type="number"
                id="hourly-rate"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                step="0.01"
                min="0"
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
                placeholder="e.g., 75.00"
              />
              {projectId && hourlyRate && projects.find((p) => p.id === Number(projectId))?.hourlyRate != null && (
                <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                  Auto-filled from project rate
                </p>
              )}
            </div>

            <div>
              <label htmlFor="gen-currency" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Currency
              </label>
              <select
                id="gen-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>

            <MiniCalendar
              label="Start Date (Optional)"
              value={startDate}
              onChange={setStartDate}
              clientId={clientId}
              projectId={projectId}
              rangeStart={startDate}
              rangeEnd={endDate}
            />

            <MiniCalendar
              label="End Date (Optional)"
              value={endDate}
              onChange={setEndDate}
              clientId={clientId}
              projectId={projectId}
              rangeStart={startDate}
              rangeEnd={endDate}
            />

            <div>
              <label htmlFor="due-in-days" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Payment Due In (Days)
              </label>
              <input
                type="number"
                id="due-in-days"
                value={dueInDays}
                onChange={(e) => setDueInDays(e.target.value)}
                min="1"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Range stats summary */}
          {startDate && endDate && clientId && (
            <div className="mt-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4">
              {loadingStats ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Calculating…</p>
              ) : rangeStats ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Time Entries</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {rangeStats.entryCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total Hours</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {(rangeStats.totalMinutes / 60).toFixed(1)}h
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Billable Hours</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {(rangeStats.billableMinutes / 60).toFixed(1)}h
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Est. Amount</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {billingEstimate != null
                        ? `$${billingEstimate.toFixed(2)}`
                        : <span className="text-sm text-gray-400 dark:text-gray-500">Set rate</span>}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No time entries found in this range.</p>
              )}
            </div>
          )}

          <div className="mt-6">
            <label htmlFor="gen-notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Additional Notes
            </label>
            <textarea
              id="gen-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
              placeholder="Add any additional notes... (time entry summary will be auto-generated)"
            />
          </div>

          {loadingMissingDays && (
            <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">Checking for days without project time…</p>
          )}
          {missingDaysNotice}

          <div className="mt-6 flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-500 dark:bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-600 dark:hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 transition"
            >
              {loading ? 'Generating...' : 'Generate Invoice'}
            </button>
            <Link
              href="/invoices"
              className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-6 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition inline-flex items-center"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
