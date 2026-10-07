import type { Metadata } from "next";
import Link from "next/link";
import { LockIcon, UsersIcon } from "lucide-react";
import { UserStatus } from "@prisma/client";
import { requirePageAccess } from "@/server/auth/current-user";
import { departmentOptions } from "@/server/rbac";
import { departmentHeadcount, listTeam } from "@/server/services/team";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EMPLOYMENT_TYPE, optionsOf, USER_STATUS } from "@/lib/labels";
import { ROLES, ROLE_KEYS } from "@/lib/rbac";
import { formatDate, formatPercent, formatZAR } from "@/lib/format";
import { first, oneOf } from "@/lib/list-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage(props: PageProps<"/team">) {
  const user = await requirePageAccess("team.read");
  const sp = await props.searchParams;
  const [{ members, sensitive }, departments, headcount] = await Promise.all([
    listTeam(user, {
      q: first(sp.q),
      departmentId: first(sp.department),
      roleKey: oneOf(first(sp.role), ROLE_KEYS),
      status: oneOf<UserStatus>(first(sp.status), UserStatus),
    }),
    departmentOptions(),
    departmentHeadcount(user),
  ]);
  const showPerf = members.some((m) => m.performance);

  return (
    <>
      <PageHeader
        title="Team"
        description="Directors, staff and contractors across Integral Academy."
        meta={
          !sensitive && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <LockIcon className="size-3" /> Cost-to-company and contact numbers are restricted to finance and directors.
            </span>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {headcount.map((d) => (
          <Link key={d.id} href={`/team?department=${d.id}`} className="rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40">
            <p className="text-xs text-muted-foreground">{d.name}</p>
            <p className="tabular mt-1 text-lg font-semibold">{d.headcount}</p>
            {d.monthlyCost !== null && <p className="tabular text-[11px] text-muted-foreground">{formatZAR(d.monthlyCost)}/mo</p>}
          </Link>
        ))}
      </div>
      <Card className="overflow-hidden">
        <TableToolbar
          searchPlaceholder="Search name, email or title…"
          filters={[
            { param: "department", label: "Department", options: departments },
            { param: "role", label: "Role", options: ROLE_KEYS.map((k) => ({ value: k, label: ROLES[k].name })) },
            { param: "status", label: "Status", options: optionsOf(USER_STATUS) },
          ]}
        />
        {members.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No team members found" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead className="hidden lg:table-cell">Email</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden xl:table-cell">Start date</TableHead>
                {showPerf && <TableHead className="hidden text-right lg:table-cell">Open tasks</TableHead>}
                {showPerf && <TableHead className="hidden text-right lg:table-cell">On-time (90d)</TableHead>}
                {sensitive && <TableHead className="hidden text-right xl:table-cell">Cost / month</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link href={`/team/${m.id}`} className="flex min-w-52 items-center gap-3">
                      <Avatar name={m.name} />
                      <span>
                        <span className="block font-medium hover:underline">{m.name}</span>
                        <span className="block text-xs text-muted-foreground">{m.jobTitle}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{m.role.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{EMPLOYMENT_TYPE[m.employmentType].label}</span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{m.department?.name ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <a href={`mailto:${m.email}`} className="text-sm hover:underline">
                      {m.email}
                    </a>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <StatusBadge meta={USER_STATUS} value={m.status} />
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground xl:table-cell">{formatDate(m.startDate)}</TableCell>
                  {showPerf && (
                    <TableCell className="tabular hidden text-right lg:table-cell">
                      {m.performance ? (
                        <>
                          {m.performance.openTasks}
                          {m.performance.overdueTasks > 0 && <span className="ml-1 text-xs text-danger">({m.performance.overdueTasks} overdue)</span>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                  {showPerf && (
                    <TableCell className={cn("tabular hidden text-right lg:table-cell", m.performance?.onTimeRate !== null && m.performance?.onTimeRate !== undefined && m.performance.onTimeRate < 70 && "text-warning")}>
                      {m.performance?.onTimeRate !== null && m.performance?.onTimeRate !== undefined ? formatPercent(m.performance.onTimeRate, 0) : "—"}
                    </TableCell>
                  )}
                  {sensitive && <TableCell className="tabular hidden text-right xl:table-cell">{m.monthlyCost !== null ? formatZAR(m.monthlyCost) : "—"}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
