import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LockIcon, MailIcon, PencilIcon, PhoneIcon } from "lucide-react";
import { updateTeamMemberAction } from "@/server/actions/team";
import { requirePageAccess } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors";
import { activeUserOptions, departmentOptions } from "@/server/rbac";
import { getTeamMember } from "@/server/services/team";
import { DueDate } from "@/components/common/due-date";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { UserChip } from "@/components/common/user-chip";
import { FormDialog } from "@/components/forms/form-dialog";
import type { FieldDef } from "@/components/forms/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toDateInput } from "@/lib/dates";
import { EMPLOYMENT_TYPE, optionsOf, PRIORITY, TASK_STATUS, USER_STATUS } from "@/lib/labels";
import { formatDate, formatDateTime, formatPercent, formatZAR } from "@/lib/format";

export const metadata: Metadata = { title: "Team member" };

export default async function TeamMemberPage(props: PageProps<"/team/[id]">) {
  const { id } = await props.params;
  const user = await requirePageAccess("team.read");
  let m: Awaited<ReturnType<typeof getTeamMember>>;
  try {
    m = await getTeamMember(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const [users, departments] = m.canManage ? await Promise.all([activeUserOptions(), departmentOptions()]) : [[], []];
  const fields: FieldDef[] = [
    { type: "hidden", name: "id", value: m.id },
    { type: "text", name: "jobTitle", label: "Job title", span: 2 },
    { type: "select", name: "departmentId", label: "Department", options: departments, emptyLabel: "None" },
    { type: "select", name: "managerId", label: "Reports to", options: users.filter((u) => u.value !== m.id).map(({ value, label }) => ({ value, label })), emptyLabel: "No manager" },
    { type: "select", name: "employmentType", label: "Employment type", required: true, options: optionsOf(EMPLOYMENT_TYPE) },
    { type: "date", name: "startDate", label: "Start date" },
    ...(m.sensitive
      ? ([
          { type: "heading", name: "sensitive", label: "Sensitive", description: "Visible only to finance and directors." },
          { type: "tel", name: "phone", label: "Phone" },
          { type: "money", name: "monthlyCost", label: "Monthly cost to company" },
        ] as FieldDef[])
      : []),
  ];
  const perf = m.performance;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Team", href: "/team" }, { label: m.name }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={m.name} size="lg" /> {m.name}
          </span>
        }
        description={m.jobTitle ?? undefined}
        meta={
          <>
            <StatusBadge meta={USER_STATUS} value={m.status} />
            <Badge tone="primary">{m.role.name}</Badge>
            <Badge tone="outline">{EMPLOYMENT_TYPE[m.employmentType].label}</Badge>
          </>
        }
        actions={
          m.canManage && (
            <FormDialog
              title={`Edit ${m.name}`}
              trigger={
                <Button variant="outline">
                  <PencilIcon /> Edit profile
                </Button>
              }
              action={updateTeamMemberAction}
              fields={fields}
              defaultValues={{
                jobTitle: m.jobTitle ?? "",
                departmentId: m.departmentId ?? "",
                managerId: m.managerId ?? "",
                employmentType: m.employmentType,
                startDate: toDateInput(m.startDate),
                phone: m.phone ?? "",
                monthlyCost: m.monthlyCost?.toFixed(2) ?? "",
              }}
              submitLabel="Save"
            />
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {perf ? (
            <SectionCard title="Performance" description="Task delivery over the last 90 days">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Open tasks", String(perf.openTasks)],
                  ["Overdue", String(perf.overdueTasks)],
                  ["Completed (90d)", String(perf.completed90d)],
                  ["On-time rate", perf.onTimeRate !== null ? formatPercent(perf.onTimeRate, 0) : "—"],
                  ...(perf.tutorHours30d !== null ? [["Tutor hours (30d)", `${perf.tutorHours30d}h`]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-muted/60 px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="tabular text-lg font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              <LockIcon className="size-4" /> Performance metrics are visible to the person, their manager and leadership.
            </div>
          )}
          <SectionCard title="Assigned tasks" description="Open tasks you have access to">
            {m.tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open tasks.</p>
            ) : (
              <ul className="divide-y divide-border">
                {m.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                      {t.title}
                    </Link>
                    <StatusBadge meta={PRIORITY} value={t.priority} dot={false} />
                    <StatusBadge meta={TASK_STATUS} value={t.status} />
                    <DueDate date={t.dueDate} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
        <div className="space-y-6">
          <SectionCard title="Details">
            <dl className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <MailIcon className="size-4 text-muted-foreground" />
                <a href={`mailto:${m.email}`} className="hover:underline">
                  {m.email}
                </a>
              </div>
              {m.phone && (
                <div className="flex items-center gap-2">
                  <PhoneIcon className="size-4 text-muted-foreground" />
                  <a href={`tel:${m.phone}`} className="hover:underline">
                    {m.phone}
                  </a>
                </div>
              )}
              <div className="flex justify-between gap-4 border-t border-border pt-3">
                <dt className="text-muted-foreground">Department</dt>
                <dd>{m.department?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Reports to</dt>
                <dd>{m.manager ? <Link href={`/team/${m.manager.id}`} className="hover:underline">{m.manager.name}</Link> : "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Start date</dt>
                <dd>{formatDate(m.startDate)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Last sign-in</dt>
                <dd>{m.lastLoginAt ? formatDateTime(m.lastLoginAt) : "Never"}</dd>
              </div>
              {m.tutorProfile && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Specialisation</dt>
                  <dd className="text-right">{m.tutorProfile.specialisation}</dd>
                </div>
              )}
              {m.sensitive && (
                <div className="flex justify-between gap-4 border-t border-border pt-3">
                  <dt className="flex items-center gap-1 text-muted-foreground">
                    <LockIcon className="size-3" /> Cost to company
                  </dt>
                  <dd className="tabular font-medium">{m.monthlyCost !== null ? `${formatZAR(m.monthlyCost)}/mo` : "—"}</dd>
                </div>
              )}
            </dl>
          </SectionCard>
          {m.reports.length > 0 && (
            <SectionCard title="Direct reports">
              <ul className="space-y-2.5">
                {m.reports.map((r) => (
                  <li key={r.id}>
                    <Link href={`/team/${r.id}`} className="hover:underline">
                      <UserChip name={r.name} subtitle={r.jobTitle} />
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      </div>
    </>
  );
}
