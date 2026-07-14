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
  projects: {
    name: string;
  }[];
  isAllProjects?: boolean;
  // Freelancer/company information
  companyInfo: {
    name: string;
    freelancerName?: string | null;
    email?: string | null;
    address?: string | null;
    phone?: string | null;
    website?: string | null;
  };
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
        {invoice.projects.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>{!invoice.isAllProjects && invoice.projects.length === 1 ? 'Project' : 'Projects'}</Text>
            <Text style={styles.value}>
              {invoice.isAllProjects ? 'All Projects' : invoice.projects.map(p => p.name).join(', ')}
            </Text>
          </View>
        )}

        <View style={styles.divider} />

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
