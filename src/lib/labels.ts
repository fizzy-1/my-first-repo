import type {
  AnnouncementLevel,
  ApprovalDecisionType,
  ApprovalStatus,
  ApprovalType,
  AttendeeResponse,
  BillingFrequency,
  BudgetType,
  BugSeverity,
  BugStatus,
  CampaignChannel,
  CampaignStatus,
  ContentStage,
  ContentType,
  CourseStatus,
  DocumentAccessLevel,
  DocumentCategory,
  EmploymentType,
  ExpenseCategory,
  ExpenseStatus,
  FeatureStatus,
  IncomeCategory,
  IncomeStatus,
  MeetingStatus,
  MeetingType,
  NotificationType,
  ObjectiveMetric,
  ObjectiveStatus,
  PartnershipStatus,
  PaymentMethod,
  Priority,
  ProjectStatus,
  Province,
  ScenarioType,
  SchoolStage,
  SchoolType,
  TaskStatus,
  TimeEntryStatus,
  TutorActivity,
  UserStatus,
} from "@prisma/client";
import type { BadgeTone } from "@/components/ui/badge";

/**
 * Human labels and badge tones for every enum. Shared by server and client
 * components (types only are imported from Prisma, so nothing server-side is
 * bundled into the browser).
 */
export interface EnumMeta {
  label: string;
  tone: BadgeTone;
}

type Meta<T extends string> = Record<T, EnumMeta>;

export const TASK_STATUS: Meta<TaskStatus> = {
  TODO: { label: "To do", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  BLOCKED: { label: "Blocked", tone: "danger" },
  COMPLETED: { label: "Completed", tone: "success" },
};

export const PRIORITY: Meta<Priority> = {
  LOW: { label: "Low", tone: "neutral" },
  MEDIUM: { label: "Medium", tone: "info" },
  HIGH: { label: "High", tone: "warning" },
  CRITICAL: { label: "Critical", tone: "danger" },
};

export const PROJECT_STATUS: Meta<ProjectStatus> = {
  PLANNING: { label: "Planning", tone: "neutral" },
  ACTIVE: { label: "Active", tone: "info" },
  ON_HOLD: { label: "On hold", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "outline" },
};

export const APPROVAL_TYPE: Meta<ApprovalType> = {
  EXPENSE: { label: "Expense", tone: "primary" },
  CAMPAIGN: { label: "Marketing campaign", tone: "violet" },
  CONTRACT: { label: "Contract", tone: "info" },
  PURCHASE: { label: "Purchase", tone: "primary" },
  PRODUCT_RELEASE: { label: "Product release", tone: "info" },
  STRATEGIC_DECISION: { label: "Strategic decision", tone: "violet" },
  OTHER: { label: "Other", tone: "neutral" },
};

export const APPROVAL_STATUS: Meta<ApprovalStatus> = {
  PENDING: { label: "Pending", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "info" },
  WITHDRAWN: { label: "Withdrawn", tone: "outline" },
};

export const APPROVAL_DECISION: Meta<ApprovalDecisionType> = {
  SUBMITTED: { label: "Submitted", tone: "neutral" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CHANGES_REQUESTED: { label: "Requested changes", tone: "info" },
  RESUBMITTED: { label: "Resubmitted", tone: "neutral" },
  WITHDRAWN: { label: "Withdrew", tone: "outline" },
};

export const NOTIFICATION_TYPE: Meta<NotificationType> = {
  TASK_ASSIGNED: { label: "Task assigned", tone: "info" },
  APPROVAL_REQUESTED: { label: "Approval requested", tone: "warning" },
  APPROVAL_DECIDED: { label: "Approval decided", tone: "success" },
  DEADLINE_UPCOMING: { label: "Upcoming deadline", tone: "warning" },
  TASK_OVERDUE: { label: "Overdue", tone: "danger" },
  DOCUMENT_UPLOADED: { label: "New document", tone: "primary" },
  MEETING_INVITATION: { label: "Meeting invitation", tone: "violet" },
  ANNOUNCEMENT: { label: "Announcement", tone: "primary" },
  SYSTEM: { label: "System", tone: "neutral" },
};

export const ANNOUNCEMENT_LEVEL: Meta<AnnouncementLevel> = {
  INFO: { label: "Info", tone: "info" },
  IMPORTANT: { label: "Important", tone: "warning" },
  CRITICAL: { label: "Critical", tone: "danger" },
};

export const USER_STATUS: Meta<UserStatus> = {
  ACTIVE: { label: "Active", tone: "success" },
  INVITED: { label: "Invited", tone: "info" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
  OFFBOARDED: { label: "Offboarded", tone: "outline" },
};

export const EMPLOYMENT_TYPE: Meta<EmploymentType> = {
  DIRECTOR: { label: "Director", tone: "violet" },
  EMPLOYEE: { label: "Employee", tone: "neutral" },
  CONTRACTOR: { label: "Contractor", tone: "info" },
  INTERN: { label: "Intern", tone: "outline" },
};

export const PROVINCE: Meta<Province> = {
  EASTERN_CAPE: { label: "Eastern Cape", tone: "neutral" },
  FREE_STATE: { label: "Free State", tone: "neutral" },
  GAUTENG: { label: "Gauteng", tone: "neutral" },
  KWAZULU_NATAL: { label: "KwaZulu-Natal", tone: "neutral" },
  LIMPOPO: { label: "Limpopo", tone: "neutral" },
  MPUMALANGA: { label: "Mpumalanga", tone: "neutral" },
  NORTH_WEST: { label: "North West", tone: "neutral" },
  NORTHERN_CAPE: { label: "Northern Cape", tone: "neutral" },
  WESTERN_CAPE: { label: "Western Cape", tone: "neutral" },
};

export const PAYMENT_METHOD: Meta<PaymentMethod> = {
  CARD: { label: "Card", tone: "neutral" },
  DEBIT_ORDER: { label: "Debit order", tone: "neutral" },
  EFT: { label: "EFT", tone: "neutral" },
  PAYFAST: { label: "PayFast", tone: "neutral" },
  CASH: { label: "Cash", tone: "neutral" },
  OTHER: { label: "Other", tone: "neutral" },
};

export const INCOME_CATEGORY: Meta<IncomeCategory> = {
  SCHOOL_CONTRACT: { label: "School contract", tone: "primary" },
  WORKSHOP: { label: "Workshop", tone: "info" },
  GRANT: { label: "Grant", tone: "violet" },
  SPONSORSHIP: { label: "Sponsorship", tone: "violet" },
  CONSULTING: { label: "Consulting", tone: "info" },
  INTEREST: { label: "Interest", tone: "neutral" },
  OTHER: { label: "Other", tone: "neutral" },
};

export const INCOME_STATUS: Meta<IncomeStatus> = {
  INVOICED: { label: "Invoiced", tone: "info" },
  RECEIVED: { label: "Received", tone: "success" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "outline" },
};

export const EXPENSE_CATEGORY: Meta<ExpenseCategory> = {
  SALARIES: { label: "Salaries", tone: "neutral" },
  CONTRACTORS: { label: "Contractors", tone: "neutral" },
  MARKETING: { label: "Marketing", tone: "neutral" },
  HOSTING: { label: "Hosting & cloud", tone: "neutral" },
  SOFTWARE: { label: "Software & SaaS", tone: "neutral" },
  EQUIPMENT: { label: "Equipment", tone: "neutral" },
  CONTENT_PRODUCTION: { label: "Content production", tone: "neutral" },
  OFFICE: { label: "Office & co-working", tone: "neutral" },
  TRAVEL: { label: "Travel", tone: "neutral" },
  PROFESSIONAL_FEES: { label: "Professional fees", tone: "neutral" },
  BANK_FEES: { label: "Bank fees", tone: "neutral" },
  TRAINING: { label: "Training", tone: "neutral" },
  OTHER: { label: "Other", tone: "neutral" },
};

export const EXPENSE_STATUS: Meta<ExpenseStatus> = {
  PENDING_APPROVAL: { label: "Pending approval", tone: "warning" },
  APPROVED: { label: "Approved · unpaid", tone: "info" },
  PAID: { label: "Paid", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

export const BUDGET_TYPE: Meta<BudgetType> = {
  ANNUAL: { label: "Annual (company)", tone: "primary" },
  DEPARTMENT: { label: "Department", tone: "neutral" },
  MARKETING: { label: "Marketing", tone: "violet" },
  TECHNOLOGY: { label: "Technology", tone: "info" },
  ACADEMIC: { label: "Academic", tone: "success" },
};

export const SCENARIO: Meta<ScenarioType> = {
  CONSERVATIVE: { label: "Conservative", tone: "warning" },
  BASE: { label: "Base", tone: "info" },
  AGGRESSIVE: { label: "Aggressive", tone: "success" },
  CUSTOM: { label: "Custom", tone: "neutral" },
};

export const SCHOOL_TYPE: Meta<SchoolType> = {
  PUBLIC: { label: "Public", tone: "neutral" },
  INDEPENDENT: { label: "Independent", tone: "neutral" },
};

export const SCHOOL_STAGE: Meta<SchoolStage> = {
  PROSPECT: { label: "Prospect", tone: "neutral" },
  CONTACTED: { label: "Contacted", tone: "info" },
  MEETING: { label: "Meeting", tone: "info" },
  PROPOSAL: { label: "Proposal", tone: "violet" },
  NEGOTIATION: { label: "Negotiation", tone: "warning" },
  PARTNERSHIP: { label: "Partnership", tone: "primary" },
  ACTIVE: { label: "Active", tone: "success" },
  LOST: { label: "Lost", tone: "outline" },
};

export const SCHOOL_PIPELINE: SchoolStage[] = [
  "PROSPECT",
  "CONTACTED",
  "MEETING",
  "PROPOSAL",
  "NEGOTIATION",
  "PARTNERSHIP",
  "ACTIVE",
];

export const PARTNERSHIP_STATUS: Meta<PartnershipStatus> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SIGNED: { label: "Signed", tone: "info" },
  ACTIVE: { label: "Active", tone: "success" },
  EXPIRED: { label: "Expired", tone: "warning" },
  TERMINATED: { label: "Terminated", tone: "danger" },
};

export const BILLING_FREQUENCY: Meta<BillingFrequency> = {
  MONTHLY: { label: "Monthly", tone: "neutral" },
  QUARTERLY: { label: "Quarterly", tone: "neutral" },
  ANNUALLY: { label: "Annually", tone: "neutral" },
};

export const CAMPAIGN_STATUS: Meta<CampaignStatus> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PLANNING: { label: "Planning", tone: "info" },
  ACTIVE: { label: "Active", tone: "success" },
  PAUSED: { label: "Paused", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "outline" },
};

export const CAMPAIGN_CHANNEL: Meta<CampaignChannel> = {
  SOCIAL_MEDIA: { label: "Social media", tone: "violet" },
  SEARCH: { label: "Search ads", tone: "info" },
  EMAIL: { label: "Email", tone: "primary" },
  SCHOOL_OUTREACH: { label: "School outreach", tone: "success" },
  EVENTS: { label: "Events", tone: "warning" },
  CONTENT: { label: "Content / SEO", tone: "info" },
  RADIO: { label: "Radio", tone: "neutral" },
  REFERRAL: { label: "Referral", tone: "primary" },
  OTHER: { label: "Other", tone: "neutral" },
};

export const COURSE_STATUS: Meta<CourseStatus> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  ACTIVE: { label: "Active", tone: "success" },
  ARCHIVED: { label: "Archived", tone: "outline" },
};

export const CONTENT_TYPE: Meta<ContentType> = {
  VIDEO: { label: "Video", tone: "violet" },
  LESSON: { label: "Lesson", tone: "primary" },
  WORKSHEET: { label: "Worksheet", tone: "info" },
  QUIZ: { label: "Quiz", tone: "warning" },
  PAST_PAPER_MEMO: { label: "Past paper memo", tone: "neutral" },
  RESOURCE: { label: "Resource", tone: "neutral" },
};

export const CONTENT_STAGE: Meta<ContentStage> = {
  IDEA: { label: "Idea", tone: "neutral" },
  PLANNED: { label: "Planned", tone: "info" },
  RECORDING: { label: "Recording", tone: "violet" },
  EDITING: { label: "Editing", tone: "violet" },
  REVIEW: { label: "Review", tone: "warning" },
  APPROVED: { label: "Approved", tone: "primary" },
  PUBLISHED: { label: "Published", tone: "success" },
};

export const CONTENT_PIPELINE: ContentStage[] = ["IDEA", "PLANNED", "RECORDING", "EDITING", "REVIEW", "APPROVED", "PUBLISHED"];

export const TUTOR_ACTIVITY: Meta<TutorActivity> = {
  RECORDING: { label: "Recording", tone: "violet" },
  EDITING: { label: "Editing", tone: "violet" },
  LIVE_SESSION: { label: "Live session", tone: "success" },
  MARKING: { label: "Marking", tone: "info" },
  PREPARATION: { label: "Preparation", tone: "primary" },
  REVIEW: { label: "Review", tone: "warning" },
  ADMIN: { label: "Admin", tone: "neutral" },
};

export const TIME_ENTRY_STATUS: Meta<TimeEntryStatus> = {
  SUBMITTED: { label: "Submitted", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

export const FEATURE_STATUS: Meta<FeatureStatus> = {
  BACKLOG: { label: "Backlog", tone: "neutral" },
  PLANNED: { label: "Planned", tone: "info" },
  IN_PROGRESS: { label: "In progress", tone: "violet" },
  TESTING: { label: "Testing", tone: "warning" },
  RELEASED: { label: "Released", tone: "success" },
};

export const FEATURE_PIPELINE: FeatureStatus[] = ["BACKLOG", "PLANNED", "IN_PROGRESS", "TESTING", "RELEASED"];

export const BUG_SEVERITY: Meta<BugSeverity> = {
  CRITICAL: { label: "Critical", tone: "danger" },
  HIGH: { label: "High", tone: "warning" },
  MEDIUM: { label: "Medium", tone: "info" },
  LOW: { label: "Low", tone: "neutral" },
};

export const BUG_STATUS: Meta<BugStatus> = {
  OPEN: { label: "Open", tone: "danger" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  RESOLVED: { label: "Resolved", tone: "success" },
  CLOSED: { label: "Closed", tone: "outline" },
};

export const DOCUMENT_CATEGORY: Meta<DocumentCategory> = {
  CORPORATE: { label: "Corporate", tone: "primary" },
  FINANCE: { label: "Finance", tone: "success" },
  LEGAL: { label: "Legal", tone: "danger" },
  SCHOOLS: { label: "Schools", tone: "info" },
  MARKETING: { label: "Marketing", tone: "violet" },
  ACADEMIC: { label: "Academic", tone: "warning" },
  TECHNOLOGY: { label: "Technology", tone: "info" },
  HR: { label: "HR", tone: "neutral" },
  STRATEGY: { label: "Strategy", tone: "primary" },
};

export const DOCUMENT_ACCESS: Meta<DocumentAccessLevel> = {
  ALL_STAFF: { label: "All staff", tone: "success" },
  DEPARTMENT: { label: "Department", tone: "info" },
  EXECUTIVE: { label: "Executive", tone: "violet" },
  RESTRICTED: { label: "Restricted", tone: "danger" },
};

export const MEETING_TYPE: Meta<MeetingType> = {
  BOARD: { label: "Board", tone: "violet" },
  EXECUTIVE: { label: "Executive", tone: "primary" },
  MARKETING: { label: "Marketing", tone: "warning" },
  ACADEMIC: { label: "Academic", tone: "success" },
  DEVELOPER: { label: "Developer", tone: "info" },
  SCHOOL: { label: "School", tone: "info" },
  OTHER: { label: "Other", tone: "neutral" },
};

export const MEETING_STATUS: Meta<MeetingStatus> = {
  SCHEDULED: { label: "Scheduled", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "outline" },
};

export const ATTENDEE_RESPONSE: Meta<AttendeeResponse> = {
  PENDING: { label: "Awaiting reply", tone: "neutral" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  DECLINED: { label: "Declined", tone: "danger" },
  TENTATIVE: { label: "Tentative", tone: "warning" },
};

export const OBJECTIVE_STATUS: Meta<ObjectiveStatus> = {
  ON_TRACK: { label: "On track", tone: "success" },
  AT_RISK: { label: "At risk", tone: "warning" },
  DELAYED: { label: "Delayed", tone: "danger" },
  COMPLETED: { label: "Completed", tone: "primary" },
};

export const OBJECTIVE_METRIC: Meta<ObjectiveMetric> = {
  MANUAL: { label: "Manual updates", tone: "neutral" },
  PAYING_LEARNERS: { label: "Live: paying learners", tone: "primary" },
  ACTIVE_LEARNERS: { label: "Live: active learners", tone: "primary" },
  MRR: { label: "Live: MRR", tone: "primary" },
  ACTIVE_SCHOOLS: { label: "Live: active school partnerships", tone: "primary" },
  CASH_BALANCE: { label: "Live: cash balance", tone: "primary" },
  PUBLISHED_CONTENT: { label: "Live: published content items", tone: "primary" },
};

/** Options for <select>s built from a meta map, preserving declaration order. */
export function optionsOf<T extends string>(meta: Meta<T>, only?: readonly T[]): { value: T; label: string }[] {
  const keys = (only ?? (Object.keys(meta) as T[])) as T[];
  return keys.map((value) => ({ value, label: meta[value].label }));
}
