import type { Metadata } from "next";
import { KeyRoundIcon, LockIcon, UsersIcon } from "lucide-react";
import { UserStatus } from "@prisma/client";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { listUsers, userFormOptions, type UserSort } from "@/server/services/admin";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { USER_STATUS, optionsOf } from "@/lib/labels";
import { ROLE_KEYS, ROLES, type RoleKey } from "@/lib/rbac";
import { formatDateTime, formatRelative } from "@/lib/format";
import { oneOf, parseListParams } from "@/lib/list-params";
import { CreateUserButton, UserRowActions } from "./user-dialogs";

export const metadata: Metadata = { title: "Users" };

const SORTS = ["name", "lastLoginAt", "createdAt"] as const satisfies readonly UserSort[];

export default async function AdminUsersPage(props: PageProps<"/admin/users">) {
  const user = await requirePageAccess("admin.users");
  const sp = await props.searchParams;
  const params = parseListParams(sp, { sortable: SORTS, defaultSort: "name", defaultDir: "asc", pageSize: 25 });
  const [list, options] = await Promise.all([
    listUsers(user, {
      q: params.q || undefined,
      roleKey: oneOf<RoleKey>(params.filter("role"), ROLE_KEYS),
      departmentId: params.filter("department"),
      status: oneOf<UserStatus>(params.filter("status"), UserStatus),
      sort: params.sort,
      dir: params.dir,
      skip: params.skip,
      take: params.pageSize,
    }),
    userFormOptions(user),
  ]);
  const canAudit = can(user, "audit.read");
  const now = new Date();
  // Super Admin accounts can only be managed by a Super Admin (enforced in the service too).
  const manageable = (roleKey: RoleKey) => roleKey !== "SUPER_ADMIN" || user.roleKey === "SUPER_ADMIN";

  const columns: Column<(typeof list.rows)[number]>[] = [
    {
      key: "user",
      header: "Name",
      sortKey: "name",
      cell: (u) => (
        <div className="flex items-center gap-3 md:min-w-52">
          <Avatar name={u.name} size="sm" className="max-sm:hidden" />
          <div className="max-w-[10.5rem] min-w-0 sm:max-w-none">
            <p className="flex flex-wrap items-center gap-1.5 font-medium">
              {u.name}
              {u.id === user.id && <Badge tone="primary">You</Badge>}
              {u.locked && (
                <Badge tone="warning" title={u.lockedUntil ? `Locked until ${formatDateTime(u.lockedUntil)}` : undefined}>
                  <LockIcon /> Locked
                </Badge>
              )}
              {u.mustChangePassword && (
                <Badge tone="info" title="Signed in with a temporary password that hasn't been changed yet">
                  <KeyRoundIcon /> Temporary password
                </Badge>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
            <p className="truncate text-xs text-muted-foreground md:hidden">{u.role.name}</p>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Role", hideOnMobile: true, cell: (u) => <span className="whitespace-nowrap">{u.role.name}</span> },
    {
      key: "department",
      header: "Department",
      hideOnMobile: true,
      cell: (u) => (
        <div className="min-w-0">
          <p className="truncate">{u.department?.name ?? <span className="text-muted-foreground">—</span>}</p>
          {u.jobTitle && <p className="truncate text-xs text-muted-foreground">{u.jobTitle}</p>}
        </div>
      ),
    },
    { key: "manager", header: "Manager", hideOnMobile: true, cell: (u) => (u.manager ? u.manager.name : <span className="text-muted-foreground">—</span>) },
    { key: "status", header: "Status", cell: (u) => <StatusBadge meta={USER_STATUS} value={u.status} /> },
    {
      key: "lastLogin",
      header: "Last sign-in",
      sortKey: "lastLoginAt",
      hideOnMobile: true,
      cell: (u) => (
        <div className="text-xs whitespace-nowrap">
          {u.lastLoginAt ? (
            <span title={formatDateTime(u.lastLoginAt)}>{formatRelative(u.lastLoginAt, now)}</span>
          ) : (
            <span className="text-muted-foreground">Never</span>
          )}
          <p className="text-muted-foreground">
            {u.activeSessions ? `${u.activeSessions} active session${u.activeSessions === 1 ? "" : "s"}` : "No active sessions"}
          </p>
        </div>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (u) =>
        manageable(u.roleKey) && (
          <UserRowActions
            user={{
              id: u.id,
              name: u.name,
              email: u.email,
              status: u.status,
              roleKey: u.roleKey,
              departmentId: u.departmentId,
              jobTitle: u.jobTitle,
              managerId: u.managerId,
              manager: u.manager,
              employmentType: u.employmentType,
              locked: u.locked,
              activeSessions: u.activeSessions,
            }}
            isSelf={u.id === user.id}
            canAudit={canAudit}
            options={options}
          />
        ),
    },
  ];

  const counts = list.counts;
  return (
    <>
      <PageHeader
        title="Users"
        description="Create accounts, assign roles and control who can sign in. Every change is recorded in the audit log."
        meta={
          <>
            <Badge tone="success">{counts.ACTIVE ?? 0} active</Badge>
            {(counts.INVITED ?? 0) > 0 && <Badge tone="info">{counts.INVITED} invited</Badge>}
            {(counts.SUSPENDED ?? 0) > 0 && <Badge tone="danger">{counts.SUSPENDED} suspended</Badge>}
            {(counts.OFFBOARDED ?? 0) > 0 && <Badge tone="outline">{counts.OFFBOARDED} offboarded</Badge>}
            {counts.locked > 0 && (
              <Badge tone="warning">
                <LockIcon /> {counts.locked} locked
              </Badge>
            )}
          </>
        }
        actions={<CreateUserButton options={options} />}
      />
      <Card className="overflow-hidden">
        <TableToolbar
          searchPlaceholder="Search name, email or job title…"
          filters={[
            { param: "role", label: "Roles", options: ROLE_KEYS.map((key) => ({ value: key, label: ROLES[key].name })) },
            { param: "department", label: "Departments", options: options.departments },
            { param: "status", label: "Statuses", options: optionsOf(USER_STATUS) },
          ]}
        />
        <DataTable
          columns={columns}
          rows={list.rows}
          total={list.total}
          params={params}
          pathname="/admin/users"
          searchParams={sp}
          rowClassName={(u) => (u.status === "SUSPENDED" || u.status === "OFFBOARDED" ? "opacity-70" : undefined)}
          empty={<EmptyState icon={UsersIcon} title="No users found" description="Nothing matches these filters." />}
        />
      </Card>
    </>
  );
}
