// Client types
export interface Client {
  id: number;
  email: string;
  name: string;
  company?: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClientInput {
  email: string;
  name: string;
  company?: string;
  color?: string;
}

export interface UpdateClientInput {
  email?: string;
  name?: string;
  company?: string;
  color?: string;
}

// Project types
export type ProjectStatus = 'active' | 'completed' | 'on-hold';

export interface Project {
  id: number;
  name: string;
  clientDescription?: string; // Client-viewable description
  privateNotes?: string; // Private notes (admin-only, for AI matching)
  clientId: number;
  status: ProjectStatus;
  color: string; // Hex color code (e.g., "#22C55E")
  billable: boolean; // General billable setting for the project
  hourlyRate?: number; // Default hourly rate for invoicing
  startDate?: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  name: string;
  clientDescription?: string;
  privateNotes?: string;
  clientId: number;
  status?: ProjectStatus;
  color?: string;
  billable?: boolean;
  hourlyRate?: number;
  startDate?: Date;
  endDate?: Date;
}

export interface UpdateProjectInput {
  name?: string;
  clientDescription?: string;
  privateNotes?: string;
  status?: ProjectStatus;
  color?: string;
  billable?: boolean;
  hourlyRate?: number | null;
  startDate?: Date;
  endDate?: Date;
}

// Project highlight types
export type ProjectHighlightSource = 'manual' | 'ai-suggested';

export interface ProjectHighlight {
  id: number;
  projectId: number;
  date: Date;
  label: string;
  emoji?: string;
  source: ProjectHighlightSource;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectHighlightInput {
  date: string; // YYYY-MM-DD
  label: string;
  emoji?: string;
  source?: ProjectHighlightSource;
}

export interface UpdateProjectHighlightInput {
  date?: string; // YYYY-MM-DD
  label?: string;
  emoji?: string | null;
}

// Time tracking types
export interface TimeEntry {
  id: number;
  projectId: number;
  description?: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  billable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTimeEntryInput {
  projectId: number;
  description?: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  billable?: boolean;
}

export interface TimeEntryGrouped {
  date: string;
  totalMinutes: number;
  entries: TimeEntry[];
}

// Weekly summary types
export interface WeeklySummary {
  id: number;
  projectId: number;
  weekStart: Date; // Monday of the week at 00:00:00 UTC
  summary: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWeeklySummaryInput {
  projectId: number;
  weekStart: Date;
  summary: string;
}

export interface UpdateWeeklySummaryInput {
  summary: string;
}

export interface WeeklySummaryWithStats {
  id: number;
  projectId: number;
  weekStart: Date;
  weekEnd: Date;
  summary: string;
  totalMinutes: number;
  timeEntries: TimeEntry[];
  createdAt: Date;
  updatedAt: Date;
}

// Invoice types
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface Invoice {
  id: number;
  invoiceNumber: string;
  clientId: number;
  projectId?: number;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  paidDate?: Date;
  periodStart?: Date;
  periodEnd?: Date;
  notes?: string;
  aiSummary?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInvoiceInput {
  invoiceNumber: string;
  clientId: number;
  projectId?: number;
  amount: number;
  currency?: string;
  status?: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  paidDate?: Date;
  notes?: string;
}

export interface UpdateInvoiceInput {
  amount?: number;
  status?: InvoiceStatus;
  dueDate?: Date;
  paidDate?: Date;
  notes?: string;
}

// App metadata types
export interface App {
  id: number;
  appClass: string;
  displayName?: string;
  hidden: boolean;
  suggestedName?: string;
  suggestNameDismissed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateAppInput {
  displayName?: string | null;
  hidden?: boolean;
  suggestedName?: string | null;
  suggestNameDismissed?: boolean;
}

// Activity tracking types (from existing utility)
export interface ActivitySession {
  id: number;
  startTime: Date;
  endTime: Date;
  appClass: string;
  windowTitle?: string;
  durationSeconds: number;
  createdAt: Date;
}

export interface ActivitySummary {
  id: number;
  appClass: string;
  activityDetails?: string;
  totalDurationSeconds: number;
  sessionCount: number;
  firstSeen: Date;
  lastSeen: Date;
  submittedAt: Date;
}

// Analytics types
export interface ActivityAnalytics {
  totalHours: number;
  topApps: Array<{
    appClass: string;
    hours: number;
    percentage: number;
  }>;
  dailyBreakdown: Array<{
    date: string;
    hours: number;
  }>;
}

export interface ProjectAnalytics {
  totalBillableHours: number;
  totalNonBillableHours: number;
  weeklyBreakdown: Array<{
    weekStart: string;
    weekEnd: string;
    hours: number;
  }>;
}

// Client portal types
export interface ClientPortalSession {
  clientId: number;
  email: string;
  name: string;
}

export interface ClientDashboardData {
  projects: Project[];
  recentTimeEntries: TimeEntry[];
  invoices: Invoice[];
  totalHoursThisMonth: number;
}

// CalDAV provider types
export interface CalDavProvider {
  id: number;
  name: string;
  url: string;
  username: string;
  password: string; // masked (••••••••) when returned from API
  enabled: boolean;
  allowedCalendars: string[]; // calendar URLs to restrict (empty = all calendars)
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface CreateCalDavProviderInput {
  name: string;
  url: string;
  username: string;
  password: string;
  enabled?: boolean;
  allowedCalendars?: string[];
}

export interface UpdateCalDavProviderInput {
  name?: string;
  url?: string;
  username?: string;
  password?: string; // ignored if equals MASK_VALUE
  enabled?: boolean;
  allowedCalendars?: string[];
}

// Settings types
export type AiProvider = 'openai' | 'gemini';

export interface Setting {
  id: number;
  key: string;
  value: string;
  rescuetimeKey?: string;
  openaiKey?: string;
  googleApiKey?: string;
  aiProvider?: AiProvider;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateSettingInput {
  value?: string;
  rescuetimeKey?: string;
  openaiKey?: string;
  googleApiKey?: string;
  aiProvider?: AiProvider;
}

// AI Job types
export type AiJobType = 'autofill_time_entries' | 'merge_rescuetime_activity' | 'generate_weekly_summary'; // Future: 'generate_invoice_description', 'analyze_productivity', etc.
export type AiJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface AiJob {
  id: number;
  type: AiJobType;
  status: AiJobStatus;
  progress: number; // 0-100
  parameters?: Record<string, any>; // Job-specific parameters
  result?: Record<string, any>; // Job-specific results
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;
}

export interface AiTelemetryToolCall {
  id: number;
  telemetryRunId: number;
  toolCallId?: string;
  toolName: string;
  stepNumber?: number;
  success: boolean;
  durationMs?: number;
  argsJson?: unknown;
  resultJson?: unknown;
  error?: string;
  createdAt: Date;
}

export interface AiTelemetryStep {
  id: number;
  telemetryRunId: number;
  stepNumber: number;
  modelProvider?: string;
  modelId?: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  promptPreview?: string;
  outputPreview?: string;
  providerMetadata?: unknown;
  toolCallsJson?: unknown;
  createdAt: Date;
}

export interface AiTelemetryRun {
  id: number;
  jobId?: number | null;
  functionId: string;
  operation: string;
  modelProvider?: string;
  modelId?: string;
  status: string;
  metadata?: Record<string, any>;
  inputPreview?: string;
  outputPreview?: string;
  responseText?: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  totalDurationMs?: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  steps?: AiTelemetryStep[];
  toolCalls?: AiTelemetryToolCall[];
}

export interface AiJobDebug extends AiJob {
  telemetryRuns?: AiTelemetryRun[];
}

export interface CreateAiJobInput {
  type: AiJobType;
  parameters?: Record<string, any>;
}

export interface AiJobWithDisplay extends AiJob {
  displayTitle: string;
  displayDescription?: string;
}

// API Key types
export interface ApiKey {
  id: string;
  name: string;
  key: string; // Only returned on creation (hashed in DB)
  userId: string;
  clientId?: number;
  permissions: string[];
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

export interface CreateApiKeyInput {
  name: string;
  permissions: string[];
  expiresAt?: Date;
  userId?: string; // Admin can specify userId, clients use their own
}

export interface ApiKeyListItem {
  id: string;
  name: string;
  permissions: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

// User types
export type UserRole = "admin" | "user";

export interface User {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  clientId: number | null;
  createdAt?: Date;
}

// Auth provider configuration
export interface AuthProviderConfig {
  id: string;
  provider: string;
  enabled: boolean;
  config?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}
