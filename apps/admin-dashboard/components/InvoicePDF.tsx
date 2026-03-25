import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { Temporal } from '@js-temporal/polyfill';

// Register Twemoji so emoji characters render as inline PNG images in the PDF
Font.registerEmojiSource({
  format: 'png',
  url: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/',
});

// ── Markdown rendering for PDF ──

type InlineToken = { type: 'text' | 'bold' | 'italic' | 'code'; content: string };

/** Parse a string into inline markdown tokens (bold, italic, code, plain text). */
function parseInlineTokens(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Order matters: bold (** / __) before italic (* / _), then code
  const regex = /\*\*(.+?)\*\*|__(.+?)__|`(.+?)`|\*(.+?)\*|_(.+?)_/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) tokens.push({ type: 'bold', content: match[1] });
    else if (match[2] !== undefined) tokens.push({ type: 'bold', content: match[2] });
    else if (match[3] !== undefined) tokens.push({ type: 'code', content: match[3] });
    else if (match[4] !== undefined) tokens.push({ type: 'italic', content: match[4] });
    else if (match[5] !== undefined) tokens.push({ type: 'italic', content: match[5] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', content: text.slice(lastIndex) });
  }
  return tokens;
}

/** Render a single line with inline bold/italic/code formatting. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const InlineText: React.FC<{ text: string; style?: any }> = ({ text, style }) => {
  const tokens = parseInlineTokens(text);
  return (
    <Text style={style}>
      {tokens.map((token, i) => {
        if (token.type === 'bold') return <Text key={i} style={{ fontFamily: 'Helvetica-Bold' }}>{token.content}</Text>;
        if (token.type === 'italic') return <Text key={i} style={{ fontFamily: 'Helvetica-Oblique' }}>{token.content}</Text>;
        if (token.type === 'code') return <Text key={i} style={{ fontFamily: 'Courier' }}>{token.content}</Text>;
        return token.content;
      })}
    </Text>
  );
};

/**
 * Render a markdown string as React-PDF View/Text components.
 * Supports: headings, bullet lists, numbered lists, bold, italic, inline code, paragraphs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MarkdownPDF: React.FC<{ children: string; style?: any }> = ({ children, style }) => {
  const lines = children.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const fontSize = level === 1 ? 13 : level === 2 ? 11 : 10;
      elements.push(
        <InlineText
          key={i}
          text={headingMatch[2] ?? ''}
          style={[style, { fontSize, fontFamily: 'Helvetica-Bold', marginBottom: 4, marginTop: i > 0 ? 6 : 0 }]}
        />
      );
      return;
    }

    // Bullet list item — deliberately exclude `*` to avoid clashing with italic emphasis.
    // If this bullet has no neighboring bullet lines (isolated), render as a plain paragraph
    // to match how browsers behave when CSS hides list-style markers.
    const bulletMatch = line.match(/^[-•]\s+(.*)/);
    if (bulletMatch) {
      const isBullet = (l: string) => /^[-•]\s+/.test(l);
      const prevNonEmpty = lines.slice(0, i).reverse().find(l => l.trim() !== '');
      const nextNonEmpty = lines.slice(i + 1).find(l => l.trim() !== '');
      const isIsolated = !isBullet(prevNonEmpty ?? '') && !isBullet(nextNonEmpty ?? '');

      if (isIsolated) {
        // Single stray bullet — treat as a regular paragraph line
        elements.push(
          <InlineText key={i} text={bulletMatch[1] ?? ''} style={[style, { marginBottom: 2 }]} />
        );
      } else {
        elements.push(
          <View key={i} style={{ flexDirection: 'row', marginBottom: 2 }}>
            <Text style={[style, { marginRight: 5, color: COLORS.gray500 }]}>•</Text>
            <InlineText text={bulletMatch[1] ?? ''} style={[style, { flex: 1 }]} />
          </View>
        );
      }
      return;
    }

    // Numbered list item
    const numberedMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numberedMatch) {
      elements.push(
        <View key={i} style={{ flexDirection: 'row', marginBottom: 2 }}>
          <Text style={[style, { marginRight: 5, color: COLORS.gray500 }]}>{numberedMatch[1]}.</Text>
          <InlineText text={numberedMatch[2] ?? ''} style={[style, { flex: 1 }]} />
        </View>
      );
      return;
    }

    // Strip link syntax to plain text: [label](url) → label
    const plainLine = line.replace(/\[(.+?)\]\(.+?\)/g, '$1');

    // Empty line → paragraph spacer
    if (plainLine.trim() === '') {
      elements.push(<View key={i} style={{ marginBottom: 4 }} />);
      return;
    }

    // Regular paragraph line
    elements.push(
      <InlineText key={i} text={plainLine} style={[style, { marginBottom: 2 }]} />
    );
  });

  return <View>{elements}</View>;
};

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
    color?: string | null;
    hourlyRate?: number | null;
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
  // Actual date range of the work being billed (first and last time entry dates)
  workPeriodStart?: string | null;
  workPeriodEnd?: string | null;
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
  // --- Extended data for insights pages ---
  // Project comparison: hours on other client projects during invoice period
  projectComparison?: {
    projectName: string;
    projectColor: string;
    hours: number;
    isCurrent: boolean;
  }[];
  // Daily hours for heatmap
  dailyHours?: {
    date: string; // YYYY-MM-DD
    hours: number;
  }[];
  // Key stats
  stats?: {
    totalHours: number;
    totalDays: number; // days with entries
    avgHoursPerDay: number;
    avgHoursPerWeek: number;
    mostProductiveDay: string; // e.g. "Wednesday"
    longestStreak: number; // consecutive days
    billablePercent: number;
    totalEntries: number;
  };
  // Past invoices for this client
  invoiceHistory?: {
    invoiceNumber: string;
    issueDate: string;
    amount: number;
    currency: string;
    status: string;
    projectName?: string | null;
  }[];
  // AI-generated cover letter / executive summary
  aiSummary?: string | null;
  // Project highlights (milestones) during invoice period
  highlights?: {
    date: string; // YYYY-MM-DD
    label: string;
    emoji: string | null;
  }[];
}

// ── Color palette ──
const COLORS = {
  primary: '#2563eb',
  primaryLight: '#dbeafe',
  primaryDark: '#1e40af',
  accent: '#8b5cf6',
  accentLight: '#ede9fe',
  success: '#059669',
  successLight: '#d1fae5',
  successDark: '#065f46',
  warning: '#d97706',
  warningLight: '#fffbeb',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
  dangerDark: '#991b1b',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',
  white: '#ffffff',
};

// Create styles
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: COLORS.white,
    padding: 30,
    paddingBottom: 90, // Reserve space for absolute-positioned footer (prevents blank overflow page)
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 10,
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: COLORS.primary,
    paddingBottom: 10,
  },
  companyName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: 5,
  },
  companyDetails: {
    fontSize: 9,
    color: COLORS.gray500,
    lineHeight: 1.4,
  },
  invoiceTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  section: {
    marginBottom: 16,
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
    color: COLORS.gray500,
    marginBottom: 3,
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  value: {
    fontSize: 11,
    color: COLORS.gray800,
    lineHeight: 1.4,
  },
  largeValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  statusBadge: {
    backgroundColor: COLORS.gray200,
    padding: '4 8',
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
  },
  statusPaid: {
    backgroundColor: COLORS.successLight,
    color: COLORS.successDark,
  },
  statusSent: {
    backgroundColor: COLORS.primaryLight,
    color: COLORS.primaryDark,
  },
  statusOverdue: {
    backgroundColor: COLORS.dangerLight,
    color: COLORS.dangerDark,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: COLORS.gray200,
    marginVertical: 8,
  },
  amountSection: {
    backgroundColor: COLORS.gray50,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  amountLabel: {
    fontSize: 11,
    color: COLORS.gray500,
    marginBottom: 5,
  },
  amountValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  notes: {
    fontSize: 10,
    color: COLORS.gray600,
    lineHeight: 1.5,
    marginTop: 8,
    padding: 12,
    backgroundColor: COLORS.gray50,
    borderRadius: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: COLORS.gray200,
    paddingTop: 15,
  },
  footerText: {
    fontSize: 8,
    color: COLORS.gray400,
    textAlign: 'center',
    lineHeight: 1.4,
  },
  paymentTerms: {
    fontSize: 9,
    color: COLORS.gray500,
    lineHeight: 1.5,
    padding: 12,
    marginTop: 8,
    backgroundColor: COLORS.warningLight,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftStyle: 'solid',
    borderLeftColor: COLORS.warning,
  },
  // ── Insights page styles ──
  insightsPage: {
    flexDirection: 'column',
    backgroundColor: COLORS.white,
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: COLORS.primary,
    paddingBottom: 12,
  },
  pageTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  pageSubtitle: {
    fontSize: 9,
    color: COLORS.gray500,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: 10,
    marginTop: 5,
  },
  // Stat cards
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  statCard: {
    width: '24%',
    padding: 10,
    marginRight: '1%',
    marginBottom: 8,
    backgroundColor: COLORS.gray50,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftStyle: 'solid',
    borderLeftColor: COLORS.primary,
  },
  statCardAlt: {
    borderLeftColor: COLORS.accent,
  },
  statCardSuccess: {
    borderLeftColor: COLORS.success,
  },
  statCardWarn: {
    borderLeftColor: COLORS.warning,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.gray800,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 8,
    color: COLORS.gray500,
    textTransform: 'uppercase',
  },
  // Weekly report
  weekCard: {
    marginBottom: 14,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: COLORS.gray200,
  },
  weekCardHeader: {
    backgroundColor: COLORS.gray100,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekCardTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.gray800,
  },
  weekCardHours: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  weekCardSummary: {
    fontSize: 9,
    color: COLORS.gray600,
    padding: 10,
    lineHeight: 1.5,
    backgroundColor: COLORS.primaryLight,
    borderLeftWidth: 3,
    borderLeftStyle: 'solid',
    borderLeftColor: COLORS.primary,
    margin: 8,
    borderRadius: 3,
  },
  weekCardSummaryPlain: {
    fontSize: 9,
    color: COLORS.gray600,
    lineHeight: 1.5,
    margin: 8,
  },
  weekCardEntries: {
    padding: 8,
    paddingTop: 4,
  },
  // Bar chart
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  barLabel: {
    fontSize: 9,
    color: COLORS.gray700,
    width: '28%',
    paddingRight: 8,
  },
  barTrack: {
    flex: 1,
    height: 16,
    backgroundColor: COLORS.gray100,
    borderRadius: 3,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  barValue: {
    fontSize: 8,
    color: COLORS.gray500,
    width: '12%',
    textAlign: 'right',
    paddingLeft: 6,
  },
  // Heatmap
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  heatmapCell: {
    width: 18,
    height: 18,
    marginRight: 4,
    marginBottom: 2,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: 'semibold',
  },
  heatmapCellText: {
    fontSize: 6,
    color: COLORS.gray600,
  },
  heatmapLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 226,
    marginTop: 4,
  },
  heatmapLegendLabel: {
    fontSize: 7,
    color: COLORS.gray500,
    marginRight: 4,
  },
  heatmapLegendBox: {
    width: 12,
    height: 12,
    marginRight: 2,
    borderRadius: 2,
  },
  // Invoice history table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.gray100,
    padding: 7,
    borderRadius: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: 'row',
    padding: 7,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: COLORS.gray100,
  },
  tableCell: {
    fontSize: 9,
    color: COLORS.gray700,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: 'bold',
    color: COLORS.gray500,
    textTransform: 'uppercase',
  },
  // Time entries (carried from original)
  timeEntry: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginBottom: 1,
  },
  timeEntryDate: {
    fontSize: 8,
    color: COLORS.gray500,
    width: '20%',
  },
  timeEntryDescription: {
    fontSize: 8,
    color: COLORS.gray700,
    width: '60%',
  },
  timeEntryHours: {
    fontSize: 8,
    color: COLORS.gray800,
    fontWeight: 'bold',
    textAlign: 'right',
    width: '20%',
  },
  // AI Summary
  aiSummaryBox: {
    padding: 15,
    backgroundColor: COLORS.accentLight,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftStyle: 'solid',
    borderLeftColor: COLORS.accent,
    marginBottom: 10,
  },
  aiSummaryTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.accent,
    marginBottom: 8,
  },
  aiSummaryText: {
    fontSize: 10,
    color: COLORS.gray700,
    lineHeight: 1.6,
  },
});

// ── Helper sub-components ──

/** Horizontal bar used in bar charts. Uses View with percentage width. */
const HorizontalBar: React.FC<{
  label: string;
  value: number;
  maxValue: number;
  color: string;
  suffix?: string;
  isCurrent?: boolean;
}> = ({ label, value, maxValue, color, suffix = 'h', isCurrent }) => {
  const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, 2) : 0;
  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, isCurrent ? { fontWeight: 'bold' as const, color: COLORS.gray800 } : {}]}>
        {label}
      </Text>
      <View style={styles.barTrack}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
      </View>
      <Text style={styles.barValue}>{Math.round(value)}{suffix}</Text>
    </View>
  );
};

/** A single stat card in the grid. */
const StatCard: React.FC<{
  value: string;
  label: string;
  variant?: 'primary' | 'alt' | 'success' | 'warn';
}> = ({ value, label, variant = 'primary' }) => {
  const variantStyle = variant === 'alt' ? styles.statCardAlt
    : variant === 'success' ? styles.statCardSuccess
      : variant === 'warn' ? styles.statCardWarn
        : {};
  return (
    <View style={[styles.statCard, variantStyle]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
};

/** Get background color for heatmap cell based on hours worked. */
function heatmapColor(hours: number, maxHours: number): string {
  if (hours === 0) return COLORS.gray100;
  const intensity = Math.min(hours / Math.max(maxHours, 1), 1);
  if (intensity < 0.25) return '#dbeafe';
  if (intensity < 0.5) return '#93c5fd';
  if (intensity < 0.75) return '#3b82f6';
  return '#1d4ed8';
}

/** Status badge color for invoice history. */
function historyStatusColor(status: string): { bg: string; fg: string } {
  switch (status.toLowerCase()) {
    case 'paid': return { bg: COLORS.successLight, fg: COLORS.successDark };
    case 'sent': return { bg: COLORS.primaryLight, fg: COLORS.primaryDark };
    case 'overdue': return { bg: COLORS.dangerLight, fg: COLORS.dangerDark };
    default: return { bg: COLORS.gray200, fg: COLORS.gray700 };
  }
}

// ── Shared footer for secondary pages ──
const InsightsFooter: React.FC<{ invoiceNumber: string; companyName: string }> = ({ invoiceNumber, companyName }) => (
  <View style={styles.footer}>
    <Text style={styles.footerText}>
      {companyName} — {invoiceNumber} — Supplementary Detail
    </Text>
  </View>
);

// ══════════════════════════════════════════════════════════════════
// ── Main Component ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

export const InvoicePDF: React.FC<{ invoice: InvoicePDFData }> = ({ invoice }) => {
  const companyInfo = invoice.companyInfo;

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    // Slice to YYYY-MM-DD first — DB timestamps arrive as "2026-03-24T00:00:00.000Z"
    // and Temporal.PlainDate.from() rejects the Z designator.
    const plain = Temporal.PlainDate.from(dateString.slice(0, 10));
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(plain.year, plain.month - 1, plain.day)));
  };

  const formatDateShort = (dateString: string) => {
    const plain = Temporal.PlainDate.from(dateString.slice(0, 10));
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(plain.year, plain.month - 1, plain.day)));
  };

  const formatDueInDays = (issueDateString: string, dueDateString: string) => {
    const issueDate = Temporal.PlainDate.from(issueDateString.slice(0, 10));
    const dueDate = Temporal.PlainDate.from(dueDateString.slice(0, 10));
    const daysUntilDue = issueDate.until(dueDate, { largestUnit: 'day' }).days;

    if (daysUntilDue <= 0) {
      return '0 days';
    }

    return `${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`;
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

  const hasInsights = invoice.timeBreakdown?.length || invoice.projectComparison?.length || invoice.stats || invoice.dailyHours?.length;
  const hasHistory = invoice.invoiceHistory && invoice.invoiceHistory.length > 0;

  // Compute totals for the summary line on page 1
  const totalTimeHours = invoice.timeBreakdown?.reduce((s, w) => s + w.totalHours, 0) ?? 0;
  const totalWeeks = invoice.timeBreakdown?.length ?? 0;

  // Work period: prefer explicit fields, fall back to first/last week boundaries from timeBreakdown
  const workPeriodStart = invoice.workPeriodStart
    ?? invoice.timeBreakdown?.[0]?.weekStart
    ?? null;
  const workPeriodEnd = invoice.workPeriodEnd
    ?? invoice.timeBreakdown?.[invoice.timeBreakdown.length - 1]?.weekEnd
    ?? null;
  const hasWorkPeriod = !!(workPeriodStart && workPeriodEnd);

  // Max hours across project comparison for bar chart scaling
  const maxProjectHours = invoice.projectComparison?.reduce((m, p) => Math.max(m, p.hours), 0) ?? 0;

  // Heatmap max
  const maxDailyHours = invoice.dailyHours?.reduce((m, d) => Math.max(m, d.hours), 0) ?? 0;

  // Build highlight lookup by date for heatmap marker overlay
  // Emojis don't render in react-pdf (Helvetica has no emoji glyphs),
  // so we use numbered colored-circle markers instead.
  const sortedHighlights = (invoice.highlights ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const highlightMap = new Map<string, {
    label: string;
    index: number;
    emoji: string | null;
  }>();
  for (let i = 0; i < sortedHighlights.length; i++) {
    const h = sortedHighlights[i]!;
    highlightMap.set(h.date.slice(0, 10), { label: h.label, index: i + 1, emoji: h.emoji });
  }

  return (
    <Document>
      {/* ═════════════════════════════════════════════════════════ */}
      {/* PAGE 1 — Invoice (clean, all critical info)              */}
      {/* ═════════════════════════════════════════════════════════ */}
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
          <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.largeValue}>{invoice.invoiceNumber}</Text>
              <View style={{ marginLeft: 15 }}>
                <Text style={getStatusStyle(invoice.status)}>{invoice.status}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Billing Information */}
        <View style={styles.row}>
          <View style={styles.column}>
            <Text style={styles.label}>Bill To</Text>
            {/* <Text style={{ ...styles.value, fontWeight: 'semibold' }}>{invoice.client.name}</Text> */}
            {/* {invoice.client.company && invoice.client.company !== invoice.client.name && ( */}
              <Text style={{ ...styles.value, fontWeight: 'semibold' }}>{invoice.client.company}</Text>
            {/* )} */}
            <Text style={styles.value}>{invoice.client.email}</Text>
          </View>

          <View style={styles.column}>
            <Text style={styles.label}>Invoice Details</Text>
            <View style={{ marginBottom: 2 }}>
              <Text style={styles.value}>
                <Text style={{ fontWeight: 'bold' }}>Issue Date: </Text>
                {formatDate(invoice.issueDate)}
              </Text>
            </View>
            <View style={{ marginBottom: 2 }}>
              <Text style={styles.value}>
                <Text style={{ fontWeight: 'bold' }}>Due Date: </Text>
                {formatDate(invoice.dueDate)}
              </Text>
            </View>
            {invoice.paidDate && (
              <View style={{ marginBottom: 2 }}>
                <Text style={styles.value}>
                  <Text style={{ fontWeight: 'bold' }}>Paid Date: </Text>
                  {formatDate(invoice.paidDate)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Project + Work Period row */}
        {(invoice.project || hasWorkPeriod) && (
          <View style={[styles.row, { marginBottom: 0 }]}>
            {invoice.project && (
              <View style={styles.column}>
                <Text style={styles.label}>Project</Text>
                <Text style={styles.value}>
                  {invoice.project.name}
                  {totalTimeHours > 0 && ` — ${totalTimeHours.toFixed(1)}h across ${totalWeeks} week${totalWeeks !== 1 ? 's' : ''}`}
                </Text>
                {invoice.project.hourlyRate && (
                  <Text style={{ fontSize: 9, color: COLORS.gray500, marginTop: 2 }}>
                    Rate: {formatCurrency(invoice.project.hourlyRate, invoice.currency)} / hour
                  </Text>
                )}
              </View>
            )}
            {hasWorkPeriod && (
              <View style={styles.column}>
                <Text style={styles.label}>Work Period</Text>
                <Text style={styles.value}>{formatDate(workPeriodStart!)} – {formatDate(workPeriodEnd!)}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.divider} />

        <View style={{ ...styles.section, marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Amount */}
          <View style={styles.amountSection}>
            <Text style={styles.amountLabel}>Total Amount Due</Text>
            <Text style={styles.amountValue}>
              {formatCurrency(invoice.amount, invoice.currency)}
            </Text>
            {totalTimeHours > 0 && invoice.project?.hourlyRate && (
              <Text style={{ fontSize: 9, color: COLORS.gray500, marginTop: 4 }}>
                {totalTimeHours.toFixed(1)} hours × {formatCurrency(invoice.project.hourlyRate, invoice.currency)} / hour
              </Text>
            )}
          </View>
          {/* Notes */}
          {invoice.notes && (
            <View style={{ width: '45%' }}>
              <Text style={styles.label}>Notes</Text>
              <Text style={styles.notes}>{invoice.notes}</Text>
            </View>
          )}
        </View>

        {/* AI Summary — if provided, show on page 1 as a highlight */}
        {invoice.aiSummary && (
          <View style={styles.aiSummaryBox}>
            <Text style={styles.aiSummaryTitle}>Invoice Summary</Text>
            <MarkdownPDF style={styles.aiSummaryText}>{invoice.aiSummary}</MarkdownPDF>
          </View>
        )}


        {/* Payment Terms */}
        <View style={styles.paymentTerms}>
          <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>Payment Terms</Text>
          <Text>
            Payment due date is: {formatDate(invoice.dueDate)}. (in {formatDueInDays(invoice.issueDate, invoice.dueDate)})
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Thank you for your business!{'\n'}
            {companyInfo.name}
            {companyInfo.email && ` | ${companyInfo.email}`}
            {companyInfo.phone && ` | ${companyInfo.phone}`}
            {hasInsights ? '\nSee attached pages for detailed breakdown.' : ''}
          </Text>
        </View>
      </Page>

      {/* ═════════════════════════════════════════════════════════ */}
      {/* PAGE 2 — Stats & Project Insights                        */}
      {/* ═════════════════════════════════════════════════════════ */}
      {hasInsights && (
        <Page size="A4" style={styles.insightsPage}>
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Project Insights</Text>
            <Text style={styles.pageSubtitle}>
              {invoice.invoiceNumber}{hasWorkPeriod ? ` — ${formatDate(workPeriodStart!)} to ${formatDate(workPeriodEnd!)}` : ''}
            </Text>
          </View>

          {/* Key Stats Grid */}
          {invoice.stats && (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.sectionTitle}>Key Metrics</Text>
              <View style={styles.statsGrid}>
                <StatCard value={`${invoice.stats.totalHours.toFixed(1)}`} label="Total Hours" />
                <StatCard value={`${invoice.stats.totalDays}`} label="Active Days" variant="alt" />
                <StatCard value={`${invoice.stats.avgHoursPerDay.toFixed(1)}h`} label="Avg / Day" variant="success" />
                <StatCard value={`${invoice.stats.avgHoursPerWeek.toFixed(1)}h`} label="Avg / Week" variant="warn" />
              </View>
              {/* <View style={styles.statsGrid}>
                <StatCard value={invoice.stats.mostProductiveDay} label="Most Productive Day" />
                <StatCard value={`${invoice.stats.longestStreak}d`} label="Longest Streak" variant="alt" />
                <StatCard value={`${invoice.stats.billablePercent.toFixed(0)}%`} label="Billable" variant="success" />
                <StatCard value={`${invoice.stats.totalEntries}`} label="Time Entries" variant="warn" />
              </View> */}
            </View>
          )}

          {/* Project Time Comparison */}
          {invoice.projectComparison && invoice.projectComparison.length > 1 && (
            <View style={{ marginBottom: 10 }}>
              <Text style={styles.sectionTitle}>Time Distribution Across Projects</Text>
              <Text style={{ fontSize: 8, color: COLORS.gray400, marginBottom: 8 }}>
                All {invoice.client.name} projects{hasWorkPeriod
                  ? ` between ${formatDate(workPeriodStart!)} and ${formatDate(workPeriodEnd!)}`
                  : ' during invoice period'}.
              </Text>
              {invoice.projectComparison
                .sort((a, b) => b.hours - a.hours)
                .map((proj, i) => (
                  <HorizontalBar
                    key={i}
                    label={proj.projectName}
                    value={proj.hours}
                    maxValue={maxProjectHours}
                    color={proj.projectColor}
                    isCurrent={proj.isCurrent}
                  />
                ))}
            </View>
          )}

          {/* Daily Hours Heatmap + Highlights */}
          {invoice.dailyHours && invoice.dailyHours.length > 0 && (
            <View style={{ marginBottom: 10 }}>
              <Text style={styles.sectionTitle}>Daily Work Heatmap</Text>
              <View style={{ flexDirection: 'row' }}>
                {/* Left side: heatmap grid */}
                <View style={{ width: '50%' }}>
                  {/* Day-of-week headers */}
                  <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                    {/* Spacer to align with the left week labels */}
                    <View style={{ width: 31, marginRight: 3 }} />
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                      <View key={d} style={{ width: 20, marginRight: 2, alignItems: 'center' }}>
                        <Text style={{ fontSize: 6, color: COLORS.gray400 }}>{d}</Text>
                      </View>
                    ))}
                  </View>
                  {/* Grid — one calendar-style block per month, clipped to invoice period */}
                  {(() => {
                    // Build a lookup: date string → hours
                    const sorted = [...invoice.dailyHours].sort((a, b) => a.date.localeCompare(b.date));
                    const hoursMap = new Map<string, number>();
                    for (const d of sorted) hoursMap.set(d.date.slice(0, 10), d.hours);

                    if (sorted.length === 0) return null;

                    // Determine the date range to display
                    const firstDataDate = Temporal.PlainDate.from(sorted[0]!.date.slice(0, 10));
                    // Use the last date with actual hours > 0 so we don't show trailing blank days
                    const lastWithHours = [...sorted].reverse().find(d => d.hours > 0);
                    const effectiveLastDate = lastWithHours
                      ? Temporal.PlainDate.from(lastWithHours.date.slice(0, 10))
                      : Temporal.PlainDate.from(sorted[sorted.length - 1]!.date.slice(0, 10));
                    const rangeStart = firstDataDate.subtract({ days: firstDataDate.dayOfWeek % 7 }); // Sunday
                    // Don't pad past the effective last date — the partial week is fine
                    const rangeEnd = effectiveLastDate;

                    // Iterate day-by-day from rangeStart to rangeEnd, grouping into months then weeks
                    type DayEntry = { date: string; hours: number };
                    type MonthBlock = {
                      key: string;
                      label: string;
                      weeks: DayEntry[][];
                    };

                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];

                    const months: MonthBlock[] = [];
                    let currentMonth: MonthBlock | null = null;
                    let currentWeek: DayEntry[] = [];
                    let cursor = rangeStart;

                    while (Temporal.PlainDate.compare(cursor, rangeEnd) <= 0) {
                      const monthKey = cursor.toString().slice(0, 7);

                      // Start a new month block when the month changes
                      if (!currentMonth || currentMonth.key !== monthKey) {
                        // If the new month starts AFTER the last date with hours,
                        // don't create it — it would only contain blank cells.
                        if (Temporal.PlainDate.compare(cursor, effectiveLastDate) > 0) {
                          break;
                        }
                        // Flush trailing week cells into the previous month
                        if (currentWeek.length > 0 && currentMonth) {
                          // Pad remaining cells to finish the week row
                          while (currentWeek.length < 7) {
                            currentWeek.push({ date: '', hours: -1 });
                          }
                          currentMonth.weeks.push(currentWeek);
                          currentWeek = [];
                        }
                        currentMonth = {
                          key: monthKey,
                          label: `${monthNames[cursor.month - 1]}`,
                          weeks: [],
                        };
                        months.push(currentMonth);

                        // Pad leading empty cells if the month starts mid-week
                        const dow = cursor.dayOfWeek % 7; // 0=Sun, 1=Mon, …, 6=Sat
                        for (let p = 0; p < dow; p++) {
                          currentWeek.push({ date: '', hours: -1 });
                        }
                      }

                      const dateStr = cursor.toString();
                      const hours = hoursMap.get(dateStr) ?? 0;
                      currentWeek.push({ date: dateStr, hours });

                      // End week row on Saturday
                      if (cursor.dayOfWeek === 6) {
                        currentMonth.weeks.push(currentWeek);
                        currentWeek = [];
                      }

                      cursor = cursor.add({ days: 1 });
                    }
                    // Flush any remaining partial week
                    if (currentWeek.length > 0 && currentMonth) {
                      currentMonth.weeks.push(currentWeek);
                    }

                    return months.map((mb, mi) => (
                      <View key={mb.key} style={{ marginBottom: mi < months.length - 1 ? 10 : 0 }}>
                        {/* Month header */}
                        {/* <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: COLORS.gray700, marginBottom: 4 }}>
                          {mb.label}
                        </Text> */}
                        {mb.weeks.map((week, wi) => {
                          const weekHours = week.reduce((s, d) => s + (d.hours > 0 ? d.hours : 0), 0);
                          const weekLabel = week.find(d => d.date)?.date;
                          return (
                            <View key={wi} style={{ flexDirection: 'row', marginBottom: 2, alignItems: 'center' }}>
                              {/* Week start label on the left */}
                              <Text style={{ fontSize: 7, color: COLORS.gray400, width: 28, marginRight: 6, textAlign: 'right' }}>
                                {weekLabel ? formatDateShort(weekLabel) : ''}
                              </Text>
                              {week.map((day, di) => {
                                const hl = day.date ? highlightMap.get(day.date.slice(0, 10)) : undefined;
                                return (
                                  <View
                                    key={di}
                                    style={[
                                      styles.heatmapCell,
                                      {
                                        backgroundColor: day.hours < 0 ? 'transparent' : heatmapColor(day.hours, maxDailyHours),
                                        position: 'relative' as const,
                                      },
                                    ]}
                                  >
                                    {hl?.emoji && (
                                      <View style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: 18,
                                        height: 18,
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                      }}>
                                        <Text style={{ fontSize: 8, color: COLORS.accent, fontFamily: 'Helvetica-Bold', lineHeight: 1 }}>
                                          {hl.emoji}
                                        </Text>
                                      </View>
                                    )}
                                    {hl && (
                                      <View style={{
                                        position: 'absolute',
                                        top: -3,
                                        right: -3,
                                        width: 8,
                                        height: 8,
                                        borderRadius: 4,
                                        backgroundColor: COLORS.accent,
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                      }}>
                                        <Text style={{ fontSize: 5, color: COLORS.white, fontFamily: 'Helvetica-Bold', lineHeight: 1 }}>
                                          {hl.index}
                                        </Text>
                                      </View>
                                    )}
                                    {day.hours >= 0 && !hl && (
                                      <Text style={[styles.heatmapCellText, day.hours > maxDailyHours * 0.5 ? { color: COLORS.white } : {}]}>
                                        {day.hours > 0 ? Math.max(1, day.hours).toFixed(0) : ''}
                                      </Text>
                                    )}
                                  </View>
                                );
                              })}
                              {/* Pad remaining cells to 7 */}
                              {Array.from({ length: 7 - week.length }).map((_, pi) => (
                                <View key={`p${pi}`} style={[styles.heatmapCell, { backgroundColor: 'transparent' }]} />
                              ))}
                              {/* Week hour total on the right */}
                              <Text style={{ fontSize: 7, color: COLORS.gray500, marginLeft: 6, width: 12, textAlign: 'right' }}>
                                {weekHours > 0 ? `${Math.max(1, weekHours).toFixed(0)}h` : ''}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ));
                  })()}
                  {/* Legend */}
                  <View style={styles.heatmapLegend}>
                    <Text style={styles.heatmapLegendLabel}>Less</Text>
                    {[COLORS.gray100, '#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8'].map((c, i) => (
                      <View key={i} style={[styles.heatmapLegendBox, { backgroundColor: c }]} />
                    ))}
                    <Text style={[styles.heatmapLegendLabel, { marginLeft: 4 }]}>More</Text>
                  </View>
                </View>

                {/* Right side: highlights list */}
                {sortedHighlights.length > 0 && (
                  <View style={{ width: '50%' }}>
                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: COLORS.gray800, marginBottom: 8 }}>
                      Highlights
                    </Text>
                    {sortedHighlights.map((hl, i) => (
                      <View key={i} style={{ flexDirection: 'row', marginBottom: 10, alignItems: 'flex-start' }}>
                        <View style={{
                          width: 12,
                          height: 12,
                          borderRadius: 6,
                          backgroundColor: COLORS.accent,
                          justifyContent: 'center',
                          alignItems: 'center',
                          marginRight: 8,
                          marginTop: 2,
                        }}>
                          <Text style={{ fontSize: 6, color: COLORS.white, fontFamily: 'Helvetica-Bold', lineHeight: 1 }}>
                            {i + 1}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 10, marginRight: 4, lineHeight: 1.2 }}>
                          {hl.emoji || '⭐'}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 8, color: COLORS.gray800, lineHeight: 1.3 }}>
                            {hl.label}
                          </Text>
                          <Text style={{ fontSize: 7, color: COLORS.gray400, marginTop: 1 }}>
                            {formatDateShort(hl.date)}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}

          <InsightsFooter invoiceNumber={invoice.invoiceNumber} companyName={companyInfo.name} />
        </Page>
      )}

      {/* ═════════════════════════════════════════════════════════ */}
      {/* PAGE 3 — Weekly Detail                                    */}
      {/* ═════════════════════════════════════════════════════════ */}
      {invoice.timeBreakdown && invoice.timeBreakdown.length > 0 && (
        <Page size="A4" style={styles.insightsPage} wrap>
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Weekly Breakdown</Text>
            <Text style={styles.pageSubtitle}>
              {invoice.project?.name ?? 'All Projects'} — {totalTimeHours.toFixed(1)} total hours
            </Text>
          </View>

          {/* Visual weekly bar summary first */}
          {/* <View style={{ marginBottom: 20 }}>
            {invoice.timeBreakdown.map((week, i) => {
              const maxWeekHours = Math.max(...invoice.timeBreakdown!.map(w => w.totalHours));
              return (
                <HorizontalBar
                  key={i}
                  label={`${formatDateShort(week.weekStart)} – ${formatDateShort(week.weekEnd)}`}
                  value={week.totalHours}
                  maxValue={maxWeekHours}
                  color={invoice.project?.color ?? COLORS.primary}
                />
              );
            })}
          </View> */}

          {/* Detailed cards per week */}
          {invoice.timeBreakdown.map((week, weekIndex) => (
            <View key={weekIndex} style={styles.weekCard} wrap={false}>
              <View style={styles.weekCardHeader}>
                <Text style={styles.weekCardTitle}>
                  {formatDate(week.weekStart)} — {formatDate(week.weekEnd)}
                </Text>
                <Text style={styles.weekCardHours}>
                  {week.totalHours.toFixed(1)}h
                </Text>
              </View>

              {week.summary && (
                <View style={invoice.timeBreakdown!.length > 5 ? styles.weekCardSummaryPlain : styles.weekCardSummary}>
                  <MarkdownPDF style={{ fontSize: 9, color: COLORS.gray600, lineHeight: 1.5 }}>{week.summary}</MarkdownPDF>
                </View>
              )}

              {/* Only show this detailed info if invoice less than 5 weeks long */}
              {invoice.timeBreakdown!.length <= 5 && (
                <View style={styles.weekCardEntries}>
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
              )}
            </View>
          ))}

          <InsightsFooter invoiceNumber={invoice.invoiceNumber} companyName={companyInfo.name} />
        </Page>
      )}

      {/* ═════════════════════════════════════════════════════════ */}
      {/* PAGE 4 — Invoice History                                  */}
      {/* ═════════════════════════════════════════════════════════ */}
      {hasHistory && (
        <Page size="A4" style={styles.insightsPage}>
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>Invoice History</Text>
            <Text style={styles.pageSubtitle}>
              Previous invoices for {invoice.client.name}
            </Text>
          </View>

          {/* Running total */}
          {(() => {
            const totalPaid = invoice.invoiceHistory!
              .filter(h => h.status.toLowerCase() === 'paid')
              .reduce((s, h) => s + h.amount, 0);
            const totalAll = invoice.invoiceHistory!.reduce((s, h) => s + h.amount, 0) + invoice.amount;
            return (
              <View style={{ flexDirection: 'row', marginBottom: 20 }}>
                <StatCard value={formatCurrency(totalPaid, invoice.currency)} label="Total Paid" variant="success" />
                <StatCard value={formatCurrency(totalAll, invoice.currency)} label="Lifetime Total" variant="alt" />
                <StatCard value={`${invoice.invoiceHistory!.length + 1}`} label="Total Invoices" />
                <StatCard
                  value={formatCurrency(totalAll / (invoice.invoiceHistory!.length + 1), invoice.currency)}
                  label="Avg Invoice"
                  variant="warn"
                />
              </View>
            );
          })()}

          {/* Amount trend — horizontal bars */}
          <View style={{ marginBottom: 20 }}>
            <Text style={styles.sectionTitle}>Invoice Amounts Over Time</Text>
            {(() => {
              const all = [...(invoice.invoiceHistory ?? []), {
                invoiceNumber: invoice.invoiceNumber,
                issueDate: invoice.issueDate,
                amount: invoice.amount,
                currency: invoice.currency,
                status: invoice.status,
                projectName: invoice.project?.name,
              }];
              const maxAmt = Math.max(...all.map(h => h.amount));
              return all.map((h, i) => (
                <HorizontalBar
                  key={i}
                  label={formatDateShort(h.issueDate)}
                  value={h.amount}
                  maxValue={maxAmt}
                  color={h.invoiceNumber === invoice.invoiceNumber ? COLORS.primary : COLORS.gray300}
                  suffix={` ${h.currency}`}
                  isCurrent={h.invoiceNumber === invoice.invoiceNumber}
                />
              ));
            })()}
          </View>

          {/* Table */}
          <View>
            <Text style={styles.sectionTitle}>Detail</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { width: '22%' }]}>Invoice #</Text>
              <Text style={[styles.tableHeaderCell, { width: '18%' }]}>Date</Text>
              <Text style={[styles.tableHeaderCell, { width: '25%' }]}>Project</Text>
              <Text style={[styles.tableHeaderCell, { width: '18%', textAlign: 'right' }]}>Amount</Text>
              <Text style={[styles.tableHeaderCell, { width: '17%', textAlign: 'center' }]}>Status</Text>
            </View>
            {invoice.invoiceHistory!.map((h, i) => {
              const sc = historyStatusColor(h.status);
              return (
                <View key={i} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { width: '22%' }]}>{h.invoiceNumber}</Text>
                  <Text style={[styles.tableCell, { width: '18%' }]}>{formatDateShort(h.issueDate)}</Text>
                  <Text style={[styles.tableCell, { width: '25%' }]}>{h.projectName ?? '—'}</Text>
                  <Text style={[styles.tableCell, { width: '18%', textAlign: 'right', fontWeight: 'bold' }]}>
                    {formatCurrency(h.amount, h.currency)}
                  </Text>
                  <View style={{ width: '17%', alignItems: 'center' }}>
                    <Text style={{
                      fontSize: 7,
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      backgroundColor: sc.bg,
                      color: sc.fg,
                      padding: '2 6',
                      borderRadius: 3,
                    }}>
                      {h.status}
                    </Text>
                  </View>
                </View>
              );
            })}
            {/* Current invoice row highlighted */}
            <View style={[styles.tableRow, { backgroundColor: COLORS.primaryLight }]}>
              <Text style={[styles.tableCell, { width: '22%', fontWeight: 'bold' }]}>{invoice.invoiceNumber}</Text>
              <Text style={[styles.tableCell, { width: '18%' }]}>{formatDateShort(invoice.issueDate)}</Text>
              <Text style={[styles.tableCell, { width: '25%' }]}>{invoice.project?.name ?? '—'}</Text>
              <Text style={[styles.tableCell, { width: '18%', textAlign: 'right', fontWeight: 'bold' }]}>
                {formatCurrency(invoice.amount, invoice.currency)}
              </Text>
              <View style={{ width: '17%', alignItems: 'center' }}>
                <Text style={{
                  fontSize: 7,
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  backgroundColor: COLORS.primaryDark,
                  color: COLORS.white,
                  padding: '2 6',
                  borderRadius: 3,
                }}>
                  current
                </Text>
              </View>
            </View>
          </View>

          <InsightsFooter invoiceNumber={invoice.invoiceNumber} companyName={companyInfo.name} />
        </Page>
      )}
    </Document>
  );
};
