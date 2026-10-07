/**
 * Role-based access control definitions — the single source of truth.
 *
 * Permissions and roles are defined here in code, synced into the database by
 * the seed (Role / Permission / RolePermission tables), and loaded with every
 * session. Enforcement happens server-side in the services layer
 * (src/server/services/*) via `assertCan` and permission-scoped Prisma filters;
 * the UI only uses these definitions to hide what the server would refuse.
 *
 * This file contains data only, so it is safe to import from client components.
 */

export const PERMISSIONS = {
  // Dashboard & intelligence
  "dashboard.executive": { module: "dashboard", description: "View company-wide executive KPIs (learners, churn, pipeline)" },
  "intelligence.read": { module: "intelligence", description: "Access the Business Intelligence section" },
  "reports.export": { module: "intelligence", description: "Export reports to CSV" },

  // Finance
  "finance.read": { module: "finance", description: "View revenue, expenses, cash flow and financial KPIs" },
  "finance.write": { module: "finance", description: "Record and edit income and expenses" },
  "finance.budgets": { module: "finance", description: "Create and edit budgets" },
  "finance.projections": { module: "finance", description: "Create and edit financial projections" },

  // Schools & partnerships
  "schools.read": { module: "schools", description: "View schools, contacts and partnership pipeline" },
  "schools.write": { module: "schools", description: "Create and edit schools, contacts and partnerships" },

  // Marketing
  "marketing.read": { module: "marketing", description: "View all campaigns and marketing performance" },
  "marketing.read.assigned": { module: "marketing", description: "View campaigns the user owns or is assigned to" },
  "marketing.write": { module: "marketing", description: "Create and edit any campaign" },
  "marketing.metrics": { module: "marketing", description: "Record performance metrics on visible campaigns" },

  // Academic
  "academic.read": { module: "academic", description: "View all academic operations" },
  "academic.read.assigned": { module: "academic", description: "View content assigned to the user" },
  "academic.write": { module: "academic", description: "Manage courses and the content pipeline" },
  "academic.hours.log": { module: "academic", description: "Log own tutor hours" },
  "academic.hours.approve": { module: "academic", description: "Approve tutor hours" },

  // Product & technology
  "technology.read": { module: "technology", description: "View roadmap, all bugs and development tasks" },
  "technology.read.assigned": { module: "technology", description: "View roadmap plus bugs and tasks assigned to the user" },
  "technology.write": { module: "technology", description: "Manage roadmap features and triage bugs" },
  "technology.bugs.report": { module: "technology", description: "Report bugs" },

  // Team
  "team.read": { module: "team", description: "View the team directory" },
  "team.read.sensitive": { module: "team", description: "View sensitive team data (cost to company, phone numbers)" },
  "team.manage": { module: "team", description: "Edit team members' department, title and manager" },

  // Documents
  "documents.read": { module: "documents", description: "Access the document repository" },
  "documents.write": { module: "documents", description: "Upload documents and new versions" },
  "documents.executive": { module: "documents", description: "Access executive-level and legal documents" },
  "documents.manage": { module: "documents", description: "Manage every document, including restricted ones" },

  // Approvals
  "approvals.submit": { module: "approvals", description: "Submit items for approval" },
  "approvals.read.all": { module: "approvals", description: "View every approval request" },
  "approvals.decide": { module: "approvals", description: "Decide on any approval request" },
  "approvals.decide.finance": { module: "approvals", description: "Decide on expense and purchase approvals" },

  // Meetings
  "meetings.read.all": { module: "meetings", description: "View every meeting (not only those attended)" },
  "meetings.write": { module: "meetings", description: "Schedule meetings" },

  // Strategy
  "strategy.read": { module: "strategy", description: "View company objectives" },
  "strategy.write": { module: "strategy", description: "Create and update company objectives" },

  // Tasks
  "tasks.read.all": { module: "tasks", description: "View every task" },
  "tasks.read.department": { module: "tasks", description: "View tasks in the user's department" },
  "tasks.assign": { module: "tasks", description: "Assign tasks to other people" },

  // Calendar & announcements
  "calendar.read": { module: "calendar", description: "Use the company calendar" },
  "announcements.write": { module: "announcements", description: "Publish company announcements" },

  // Administration
  "admin.users": { module: "admin", description: "Manage users, roles assignment, passwords and sessions" },
  "admin.roles": { module: "admin", description: "View the role & permission matrix" },
  "audit.read": { module: "admin", description: "Inspect the audit trail" },
} as const satisfies Record<string, { module: string; description: string }>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_KEYS = [
  "SUPER_ADMIN",
  "DIRECTOR",
  "FINANCE_EXECUTIVE",
  "MARKETING_EXECUTIVE",
  "HEAD_TUTOR",
  "PRODUCT_MANAGER",
  "DEVELOPER",
  "MARKETING_STAFF",
  "TUTOR",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

const STAFF_BASE: Permission[] = ["team.read", "documents.read", "documents.write", "calendar.read", "technology.bugs.report"];

const EXECUTIVE_BASE: Permission[] = [
  ...STAFF_BASE,
  "dashboard.executive",
  "intelligence.read",
  "reports.export",
  "approvals.submit",
  "meetings.write",
  "strategy.read",
  "tasks.read.department",
  "tasks.assign",
];

export const ROLES: Record<RoleKey, { name: string; description: string; permissions: Permission[] }> = {
  SUPER_ADMIN: {
    name: "Super Admin",
    description: "Full access to every module, user administration and the audit trail.",
    permissions: ALL_PERMISSIONS,
  },
  DIRECTOR: {
    name: "Director",
    description: "Full executive and business access across all modules.",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "admin.users"),
  },
  FINANCE_EXECUTIVE: {
    name: "Finance Executive",
    description: "Finance workspace, budgets, projections, finance approvals and related reports.",
    permissions: [
      ...EXECUTIVE_BASE,
      "finance.read",
      "finance.write",
      "finance.budgets",
      "finance.projections",
      "schools.read",
      "marketing.read",
      "team.read.sensitive",
      "documents.executive",
      "approvals.decide.finance",
    ],
  },
  MARKETING_EXECUTIVE: {
    name: "Marketing Executive",
    description: "Marketing campaigns plus schools, sales pipeline and partnerships.",
    permissions: [
      ...EXECUTIVE_BASE,
      "marketing.read",
      "marketing.write",
      "marketing.metrics",
      "schools.read",
      "schools.write",
    ],
  },
  HEAD_TUTOR: {
    name: "Head Tutor",
    description: "Academic operations, content pipeline and tutor management.",
    permissions: [
      ...EXECUTIVE_BASE,
      "academic.read",
      "academic.write",
      "academic.hours.log",
      "academic.hours.approve",
    ],
  },
  PRODUCT_MANAGER: {
    name: "Product Manager",
    description: "Product roadmap, bugs and development, with visibility of academic content.",
    permissions: [...EXECUTIVE_BASE, "technology.read", "technology.write", "academic.read"],
  },
  DEVELOPER: {
    name: "Developer",
    description: "Roadmap visibility plus the bugs and development tasks assigned to them.",
    permissions: [...STAFF_BASE, "technology.read.assigned"],
  },
  MARKETING_STAFF: {
    name: "Marketing Staff",
    description: "Campaigns they are assigned to, including recording campaign metrics.",
    permissions: [...STAFF_BASE, "marketing.read.assigned", "marketing.metrics"],
  },
  TUTOR: {
    name: "Tutor",
    description: "Their assigned academic content and their own tutor hours.",
    permissions: [...STAFF_BASE, "academic.read.assigned", "academic.hours.log"],
  },
};

/** Minimal shape needed for permission checks (server session or client props). */
export interface PermissionHolder {
  permissions: ReadonlySet<string> | readonly string[];
}

export function hasPermission(holder: PermissionHolder, permission: Permission): boolean {
  const perms = holder.permissions;
  return Array.isArray(perms) ? perms.includes(permission) : (perms as ReadonlySet<string>).has(permission);
}

export function hasAny(holder: PermissionHolder, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => hasPermission(holder, p));
}
