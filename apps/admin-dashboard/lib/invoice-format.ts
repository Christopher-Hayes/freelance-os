import { formatDate, formatPeriodLabel } from './datetime';

/**
 * Resolves the label used to identify an invoice in lists and PDFs.
 * Falls back from the user-set name to the billing period, then the
 * project name, then the issue date — in roughly decreasing specificity.
 */
export function getInvoiceDisplayName(invoice: {
  name?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  issueDate: Date | string;
  projectNames?: string[] | null;
}): string {
  if (invoice.name) return invoice.name;
  if (invoice.periodStart && invoice.periodEnd) {
    return formatPeriodLabel(invoice.periodStart, invoice.periodEnd);
  }
  if (invoice.projectNames && invoice.projectNames.length > 0) {
    return invoice.projectNames.join(', ');
  }

  const issueDateIso = typeof invoice.issueDate === 'string' ? invoice.issueDate : invoice.issueDate.toISOString();
  return formatDate(issueDateIso);
}
