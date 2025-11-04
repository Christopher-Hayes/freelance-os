// Client types
export interface Client {
  id: number;
  email: string;
  name: string;
  company?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClientInput {
  email: string;
  name: string;
  company?: string;
}

export interface UpdateClientInput {
  email?: string;
  name?: string;
  company?: string;
}

// Project types
export type ProjectStatus = 'active' | 'completed' | 'on-hold';

export interface Project {
  id: number;
  name: string;
  description?: string;
  clientId: number;
  status: ProjectStatus;
  color: string; // Hex color code (e.g., "#22C55E")
  billable: boolean; // General billable setting for the project
  startDate?: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  clientId: number;
  status?: ProjectStatus;
  color?: string;
  billable?: boolean;
  startDate?: Date;
  endDate?: Date;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  color?: string;
  billable?: boolean;
  startDate?: Date;
  endDate?: Date;
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
  notes?: string;
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
