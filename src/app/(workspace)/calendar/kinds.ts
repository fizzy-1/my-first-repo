import {
  BanknoteArrowDownIcon,
  BanknoteArrowUpIcon,
  BookOpenIcon,
  HandshakeIcon,
  ListTodoIcon,
  MegaphoneIcon,
  PhoneCallIcon,
  RocketIcon,
  ShieldCheckIcon,
  TargetIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/rbac";
import type { CalendarKind } from "@/server/services/calendar";

/** Display order of kinds in filters and legends. */
export const KIND_ORDER: CalendarKind[] = [
  "meeting",
  "task",
  "approval",
  "contract",
  "followup",
  "receivable",
  "payable",
  "campaign",
  "content",
  "objective",
  "release",
];

/** Every kind has its own icon so chips never rely on colour alone. */
export const KIND_ICONS: Record<CalendarKind, LucideIcon> = {
  meeting: UsersIcon,
  task: ListTodoIcon,
  approval: ShieldCheckIcon,
  contract: HandshakeIcon,
  followup: PhoneCallIcon,
  receivable: BanknoteArrowDownIcon,
  payable: BanknoteArrowUpIcon,
  campaign: MegaphoneIcon,
  content: BookOpenIcon,
  objective: TargetIcon,
  release: RocketIcon,
};

export const TONE_CLASSES = {
  primary: "bg-primary-soft text-primary-soft-foreground",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  violet: "bg-violet-soft text-violet",
  neutral: "bg-muted text-muted-foreground",
} as const;

/**
 * Permissions that make a kind appear at all, mirroring the gates in
 * getCalendarEvents (null = every calendar user). Used only to decide which
 * filter chips to offer; the service enforces access itself.
 */
export const KIND_GATES: Record<CalendarKind, Permission[] | null> = {
  meeting: null,
  task: null,
  approval: null,
  contract: ["schools.read"],
  followup: ["schools.read"],
  receivable: ["finance.read"],
  payable: ["finance.read"],
  campaign: ["marketing.read", "marketing.read.assigned"],
  content: ["academic.read", "academic.read.assigned"],
  objective: ["strategy.read"],
  release: ["technology.read", "technology.read.assigned"],
};
