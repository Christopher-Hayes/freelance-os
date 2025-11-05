import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// Define types for the invoice data
export interface InvoicePDFData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  paidDate?: string | null;
  status: string;
  amount: number;
  currency: string;
  notes?: string | null;
  client: {
    name: string;
    email: string;
    company?: string | null;
  };
  project?: {
    name: string;
  } | null;
  // Freelancer/company information
  companyInfo: {
    name: string;
    freelancerName?: string | null;
    email?: string | null;
    address?: string | null;
    phone?: string | null;
    website?: string | null;
  };
  // Optional time breakdown
  timeBreakdown?: {
    weekStart: string;
    weekEnd: string;
    summary?: string | null;
    totalHours: number;
    entries: Array<{
      date: string;
      description: string | null;
      hours: number;
    }>;
  }[];
}

// Create styles
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 30,
    borderBottom: 2,
    borderBottomColor: '#2563eb',
    paddingBottom: 20,
  },
  companyName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 5,
  },
  companyDetails: {
    fontSize: 9,
    color: '#6b7280',
    lineHeight: 1.4,
  },
  invoiceTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  column: {
    flexDirection: 'column',
    width: '48%',
  },
  label: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 3,
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  value: {
    fontSize: 11,
    color: '#1f2937',
    lineHeight: 1.4,
  },
  largeValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  statusBadge: {
    backgroundColor: '#e5e7eb',
    padding: '4 8',
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
  },
  statusPaid: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
  },
  statusSent: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
  },
  statusOverdue: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  divider: {
    borderBottom: 1,
    borderBottomColor: '#e5e7eb',
    marginVertical: 15,
  },
  amountSection: {
    backgroundColor: '#f9fafb',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
    marginBottom: 20,
  },
  amountLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 5,
  },
  amountValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  notes: {
    fontSize: 10,
    color: '#4b5563',
    lineHeight: 1.5,
    marginTop: 10,
    padding: 15,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 15,
  },
  footerText: {
    fontSize: 8,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 1.4,
  },
  paymentTerms: {
    fontSize: 9,
    color: '#6b7280',
    lineHeight: 1.5,
    marginTop: 20,
    padding: 12,
    backgroundColor: '#fffbeb',
    borderLeft: 3,
    borderLeftColor: '#f59e0b',
  },
  timeBreakdownSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  weekHeader: {
    backgroundColor: '#f3f4f6',
    padding: 10,
    marginTop: 15,
    marginBottom: 8,
    borderRadius: 4,
  },
  weekTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 3,
  },
  weekHours: {
    fontSize: 9,
    color: '#6b7280',
  },
  weeklySummary: {
    fontSize: 9,
    color: '#4b5563',
    backgroundColor: '#eff6ff',
    padding: 8,
    marginVertical: 6,
    borderRadius: 3,
    borderLeft: 2,
    borderLeftColor: '#3b82f6',
    lineHeight: 1.4,
  },
  timeEntry: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  timeEntryDate: {
    fontSize: 9,
    color: '#6b7280',
    width: '20%',
  },
  timeEntryDescription: {
    fontSize: 9,
    color: '#1f2937',
    width: '60%',
  },
  timeEntryHours: {
    fontSize: 9,
    color: '#1f2937',
    textAlign: 'right',
    width: '20%',
  },
});

export const InvoicePDF: React.FC<{ invoice: InvoicePDFData }> = ({ invoice }) => {
  const companyInfo = invoice.companyInfo;
  
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

  const getStatusStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return [styles.statusBadge, styles.statusPaid];
      case 'sent':
        return [styles.statusBadge, styles.statusSent];
      case 'overdue':
        return [styles.statusBadge, styles.statusOverdue];
      default:
        return styles.statusBadge;
    }
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>{companyInfo.name}</Text>
          <Text style={styles.companyDetails}>
            {companyInfo.freelancerName && `${companyInfo.freelancerName}\n`}
            {companyInfo.address && `${companyInfo.address}\n`}
            {companyInfo.email && companyInfo.phone && `${companyInfo.email} | ${companyInfo.phone}\n`}
            {!companyInfo.phone && companyInfo.email && `${companyInfo.email}\n`}
            {companyInfo.phone && !companyInfo.email && `${companyInfo.phone}\n`}
            {companyInfo.website || ''}
          </Text>
        </View>

        {/* Invoice Title and Number */}
        <View style={styles.section}>
          <Text style={styles.invoiceTitle}>INVOICE</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Text style={styles.largeValue}>{invoice.invoiceNumber}</Text>
            <View style={{ marginLeft: 15 }}>
              <Text style={getStatusStyle(invoice.status)}>{invoice.status}</Text>
            </View>
          </View>
        </View>

        {/* Billing Information */}
        <View style={styles.row}>
          <View style={styles.column}>
            <Text style={styles.label}>Bill To</Text>
            <Text style={styles.value}>{invoice.client.name}</Text>
            {invoice.client.company && (
              <Text style={styles.value}>{invoice.client.company}</Text>
            )}
            <Text style={styles.value}>{invoice.client.email}</Text>
          </View>

          <View style={styles.column}>
            <Text style={styles.label}>Invoice Details</Text>
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.value}>
                <Text style={{ fontWeight: 'bold' }}>Issue Date: </Text>
                {formatDate(invoice.issueDate)}
              </Text>
            </View>
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.value}>
                <Text style={{ fontWeight: 'bold' }}>Due Date: </Text>
                {formatDate(invoice.dueDate)}
              </Text>
            </View>
            {invoice.paidDate && (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.value}>
                  <Text style={{ fontWeight: 'bold' }}>Paid Date: </Text>
                  {formatDate(invoice.paidDate)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Project Information */}
        {invoice.project && (
          <View style={styles.section}>
            <Text style={styles.label}>Project</Text>
            <Text style={styles.value}>{invoice.project.name}</Text>
          </View>
        )}

        <View style={styles.divider} />

        {/* Time Breakdown */}
        {invoice.timeBreakdown && invoice.timeBreakdown.length > 0 && (
          <View style={styles.timeBreakdownSection}>
            <Text style={styles.label}>Time Breakdown</Text>
            
            {invoice.timeBreakdown.map((week, weekIndex) => (
              <View key={weekIndex}>
                <View style={styles.weekHeader}>
                  <Text style={styles.weekTitle}>
                    {formatDate(week.weekStart)} - {formatDate(week.weekEnd)}
                  </Text>
                  <Text style={styles.weekHours}>
                    {week.totalHours.toFixed(1)} hours
                  </Text>
                </View>
                
                {week.summary && (
                  <View style={styles.weeklySummary}>
                    <Text>{week.summary}</Text>
                  </View>
                )}
                
                {week.entries.map((entry, entryIndex) => (
                  <View key={entryIndex} style={styles.timeEntry}>
                    <Text style={styles.timeEntryDate}>{entry.date}</Text>
                    <Text style={styles.timeEntryDescription}>
                      {entry.description || 'No description'}
                    </Text>
                    <Text style={styles.timeEntryHours}>
                      {entry.hours.toFixed(1)}h
                    </Text>
                  </View>
                ))}
              </View>
            ))}
            
            <View style={styles.divider} />
          </View>
        )}

        {/* Amount */}
        <View style={styles.amountSection}>
          <Text style={styles.amountLabel}>Total Amount Due</Text>
          <Text style={styles.amountValue}>
            {formatCurrency(invoice.amount, invoice.currency)}
          </Text>
        </View>

        {/* Notes */}
        {invoice.notes && (
          <View style={styles.section}>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.notes}>{invoice.notes}</Text>
          </View>
        )}

        {/* Payment Terms */}
        <View style={styles.paymentTerms}>
          <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>Payment Terms</Text>
          <Text>
            Payment is due by {formatDate(invoice.dueDate)}. Please reference invoice number {invoice.invoiceNumber} when making payment.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Thank you for your business!{'\n'}
            {companyInfo.name}
            {companyInfo.email && ` | ${companyInfo.email}`}
            {companyInfo.phone && ` | ${companyInfo.phone}`}
          </Text>
        </View>
      </Page>
    </Document>
  );
};
