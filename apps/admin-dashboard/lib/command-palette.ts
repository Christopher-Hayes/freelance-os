type SearchCategory = "page" | "client" | "project" | "action";

export type CommandPaletteItem = {
  id: string;
  title: string;
  subtitle?: string;
  keywords: string[];
  href?: string;
  category: SearchCategory;
  priority: number;
  shortcut?: string;
  action?:
    | "create-client"
    | "create-project"
    | "create-invoice"
    | "create-time-entry"
    | "go-to-settings"
    | "go-to-debug";
  metadata?: Record<string, string | number | null | undefined>;
};

export const COMMAND_PALETTE_PAGES: CommandPaletteItem[] = [
  {
    id: "page-dashboard",
    title: "Dashboard",
    subtitle: "Overview of revenue, projects, and operations",
    href: "/",
    category: "page",
    priority: 100,
    keywords: ["home", "overview", "dashboard", "analytics summary"],
  },
  {
    id: "page-clients",
    title: "Clients",
    subtitle: "Browse and manage client relationships",
    href: "/clients",
    category: "page",
    priority: 99,
    keywords: ["customers", "accounts", "people", "companies"],
  },
  {
    id: "page-projects",
    title: "Projects",
    subtitle: "Track project status, notes, and hours",
    href: "/projects",
    category: "page",
    priority: 98,
    keywords: ["work", "engagements", "deliverables"],
  },
  {
    id: "page-time",
    title: "Time Tracking",
    subtitle: "Review recent entries and log new time",
    href: "/time",
    category: "page",
    priority: 97,
    keywords: ["time", "hours", "timer", "timesheet", "entries"],
  },
  {
    id: "page-invoices",
    title: "Invoices",
    subtitle: "Create, send, and review invoices",
    href: "/invoices",
    category: "page",
    priority: 96,
    keywords: ["invoice", "billing", "payments", "money", "receivables"],
  },
  {
    id: "page-analytics",
    title: "Analytics",
    subtitle: "Inspect activity and business performance",
    href: "/analytics",
    category: "page",
    priority: 95,
    keywords: ["reports", "charts", "activity", "metrics"],
  },
  {
    id: "page-users",
    title: "Users",
    subtitle: "Manage access and connected users",
    href: "/users",
    category: "page",
    priority: 94,
    keywords: ["team", "members", "accounts", "permissions"],
  },
  {
    id: "page-settings",
    title: "Settings",
    subtitle: "Configure providers, defaults, and integrations",
    href: "/settings",
    category: "page",
    priority: 93,
    keywords: ["preferences", "configuration", "integrations"],
  },
  {
    id: "page-debug",
    title: "Debug",
    subtitle: "Inspect background jobs and debugging tools",
    href: "/debug",
    category: "page",
    priority: 92,
    keywords: ["logs", "jobs", "troubleshooting"],
  },
];

export const COMMAND_PALETTE_ACTIONS: CommandPaletteItem[] = [
  {
    id: "action-new-client",
    title: "New Client",
    subtitle: "Create a client record",
    href: "/clients/new",
    category: "action",
    priority: 62,
    keywords: ["add client", "create client", "new customer", "new company"],
    shortcut: "G then C",
    action: "create-client",
  },
  {
    id: "action-new-project",
    title: "New Project",
    subtitle: "Create a project and assign it to a client",
    href: "/projects/new",
    category: "action",
    priority: 61,
    keywords: ["add project", "create project", "new engagement"],
    shortcut: "G then P",
    action: "create-project",
  },
  {
    id: "action-new-invoice",
    title: "New Invoice",
    subtitle: "Draft an invoice for completed work",
    href: "/invoices/new",
    category: "action",
    priority: 60,
    keywords: ["create invoice", "bill client", "new bill"],
    shortcut: "G then I",
    action: "create-invoice",
  },
  {
    id: "action-new-time-entry",
    title: "New Time Entry",
    subtitle: "Log billable or internal work",
    href: "/time/new",
    category: "action",
    priority: 59,
    keywords: ["log time", "track time", "new time", "create entry"],
    shortcut: "G then T",
    action: "create-time-entry",
  },
  {
    id: "action-go-settings",
    title: "Open Settings",
    subtitle: "Jump straight to configuration",
    href: "/settings",
    category: "action",
    priority: 58,
    keywords: ["settings", "preferences", "config"],
    action: "go-to-settings",
  },
  {
    id: "action-go-debug",
    title: "Open Debug Tools",
    subtitle: "Check jobs and troubleshooting utilities",
    href: "/debug",
    category: "action",
    priority: 57,
    keywords: ["debug", "jobs", "logs", "errors"],
    action: "go-to-debug",
  },
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function scoreTokenMatch(query: string, candidate: string) {
  if (!query || !candidate) {
    return 0;
  }

  if (candidate === query) {
    return 150;
  }

  if (candidate.startsWith(query)) {
    return 120 - (candidate.length - query.length) * 0.2;
  }

  const index = candidate.indexOf(query);
  if (index >= 0) {
    return 95 - index * 1.5;
  }

  let queryIndex = 0;
  let streak = 0;
  let score = 0;

  for (let i = 0; i < candidate.length && queryIndex < query.length; i += 1) {
    if (candidate[i] === query[queryIndex]) {
      streak += 1;
      score += 8 + streak * 3;
      queryIndex += 1;
    } else {
      streak = 0;
    }
  }

  if (queryIndex !== query.length) {
    return 0;
  }

  return score - Math.max(candidate.length - query.length, 0) * 0.4;
}

export function scoreCommandPaletteItem(item: CommandPaletteItem, rawQuery: string) {
  const query = normalize(rawQuery);
  if (!query) {
    return item.priority;
  }

  const fields = [item.title, item.subtitle ?? "", ...item.keywords].map(normalize);
  const bestFieldScore = fields.reduce((best, field) => Math.max(best, scoreTokenMatch(query, field)), 0);

  if (bestFieldScore <= 0) {
    return -1;
  }

  const categoryBoost =
    item.category === "page"
      ? 30
      : item.category === "client" || item.category === "project"
        ? 18
        : 8;

  return bestFieldScore + item.priority + categoryBoost;
}

export function filterAndRankCommandPaletteItems(items: CommandPaletteItem[], query: string, limit = 12) {
  return items
    .map((item) => ({ item, score: scoreCommandPaletteItem(item, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.item.title.localeCompare(right.item.title);
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}
