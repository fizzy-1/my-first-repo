import {
  ActivityIcon,
  BanknoteIcon,
  BugIcon,
  CheckCircle2Icon,
  FileUpIcon,
  GraduationCapIcon,
  MegaphoneIcon,
  SchoolIcon,
  ScaleIcon,
  TargetIcon,
  UsersIcon,
} from "lucide-react";
import { SectionCard } from "@/components/common/section-card";
import { EmptyState } from "@/components/common/empty-state";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { DashboardData } from "./types";

const MODULE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  finance: BanknoteIcon,
  schools: SchoolIcon,
  marketing: MegaphoneIcon,
  academic: GraduationCapIcon,
  technology: BugIcon,
  documents: FileUpIcon,
  approvals: ScaleIcon,
  tasks: CheckCircle2Icon,
  strategy: TargetIcon,
  intelligence: ActivityIcon,
  team: UsersIcon,
  meetings: UsersIcon,
};

export function ActivityCard({ items }: { items: DashboardData["activity"] }) {
  return (
    <SectionCard title="Recent activity" description="Across the modules you can access">
      {items.length === 0 ? (
        <EmptyState compact icon={ActivityIcon} title="No recent activity" />
      ) : (
        <ol className="space-y-4">
          {items.map((item) => {
            const Icon = MODULE_ICON[item.module] ?? ActivityIcon;
            return (
              <li key={item.id} className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug">{item.summary}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.actor?.name ?? "System"} · <time dateTime={item.createdAt.toISOString()} title={formatDateTime(item.createdAt)}>{formatRelative(item.createdAt)}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}
