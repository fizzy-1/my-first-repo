import type { LucideIcon } from "lucide-react";
import {
  BugIcon,
  CalendarPlusIcon,
  CheckCircle2Icon,
  ClockIcon,
  FileUpIcon,
  ListPlusIcon,
  MegaphoneIcon,
  ReceiptIcon,
  SchoolIcon,
  WalletIcon,
} from "lucide-react";
import type { Permission } from "@/lib/rbac";

export interface QuickCreateItem {
  label: string;
  href: string;
  icon: LucideIcon;
  anyOf: Permission[];
}

/** Each entry deep-links to a page that auto-opens its create dialog (?new=…). */
export const QUICK_CREATE: QuickCreateItem[] = [
  { label: "New task", href: "/tasks?new=task", icon: ListPlusIcon, anyOf: [] },
  { label: "Submit for approval", href: "/approvals?new=approval", icon: CheckCircle2Icon, anyOf: ["approvals.submit"] },
  { label: "Schedule meeting", href: "/meetings?new=meeting", icon: CalendarPlusIcon, anyOf: ["meetings.write"] },
  { label: "Upload document", href: "/documents?new=document", icon: FileUpIcon, anyOf: ["documents.write"] },
  { label: "Add school", href: "/schools?new=school", icon: SchoolIcon, anyOf: ["schools.write"] },
  { label: "Record expense", href: "/finance/expenses?new=expense", icon: ReceiptIcon, anyOf: ["finance.write"] },
  { label: "Record income", href: "/finance/income?new=income", icon: WalletIcon, anyOf: ["finance.write"] },
  { label: "New campaign", href: "/marketing?new=campaign", icon: MegaphoneIcon, anyOf: ["marketing.write"] },
  { label: "Report a bug", href: "/technology/bugs?new=bug", icon: BugIcon, anyOf: ["technology.bugs.report"] },
  { label: "Log tutor hours", href: "/academic/hours?new=hours", icon: ClockIcon, anyOf: ["academic.hours.log"] },
];

export function visibleQuickCreate(permissions: readonly string[]) {
  return QUICK_CREATE.filter((item) => item.anyOf.length === 0 || item.anyOf.some((p) => permissions.includes(p)));
}
