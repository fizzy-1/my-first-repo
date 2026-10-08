import type { Metadata } from "next";
import { CheckIcon, CodeIcon, DatabaseIcon, TriangleAlertIcon } from "lucide-react";
import { requirePageAccess } from "@/server/auth/current-user";
import { getRoleMatrix } from "@/server/services/admin";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { moduleLabel } from "../sections";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const user = await requirePageAccess("admin.roles");
  const matrix = await getRoleMatrix(user);
  const outOfSync = matrix.roles.filter((r) => !r.synced).length + (matrix.permissionDrift > 0 ? 1 : 0);

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="What each role can see and do. Assign roles to people on the Users page."
        meta={
          outOfSync === 0 ? (
            <Badge tone="success">
              <DatabaseIcon /> Database matches the code definition
            </Badge>
          ) : (
            <Badge tone="warning">
              <TriangleAlertIcon /> Database differs from the code definition
            </Badge>
          )
        }
      />

      <Card className="mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold-soft text-gold-foreground">
          <CodeIcon className="size-4" />
        </span>
        <div className="text-sm">
          <p className="font-medium">Roles are defined in code, not edited here</p>
          <p className="mt-1 text-muted-foreground">
            Permissions and roles live in the application source and are synced into the database on every deploy, so they are
            versioned, reviewed and identical across environments. Every check is enforced on the server; the interface only hides
            what the server would refuse anyway. To change what a role can do, ask the development team to update the role definition.
          </p>
          {outOfSync > 0 && (
            <p className="mt-2 text-warning">
              The database copy is out of date. Re-run the RBAC sync (part of the seed / deploy step) to apply the current definition.
            </p>
          )}
        </div>
      </Card>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {matrix.roles.map((role) => (
          <Card key={role.key} className="flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{role.name}</p>
              {!role.synced && (
                <Badge tone="warning" title={role.differences === null ? "Role missing from the database" : `${role.differences} permission differences`}>
                  <TriangleAlertIcon /> {role.differences === null ? "Not synced" : "Out of sync"}
                </Badge>
              )}
            </div>
            <p className="text-[13px] text-muted-foreground">{role.description}</p>
            <dl className="mt-auto flex gap-6 border-t border-border pt-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Active users</dt>
                <dd className="tabular text-sm font-semibold">{formatNumber(role.activeUsers)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Permissions</dt>
                <dd className="tabular text-sm font-semibold">{formatNumber(role.permissionCount)}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>

      <SectionCard title="Permission matrix" description="Grouped by module. A tick means the role holds the permission." flush>
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 z-10 w-44 min-w-44 bg-card sm:w-auto sm:min-w-64">Permission</TableHead>
              {matrix.roles.map((role) => (
                <TableHead key={role.key} className="text-center whitespace-normal">
                  <span className="inline-block max-w-20 leading-tight">{role.name}</span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrix.modules.map(({ module, permissions }) => (
              <ModuleRows key={module} label={moduleLabel(module)} permissions={permissions} roleKeys={matrix.roles.map((r) => r.key)} />
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </>
  );
}

function ModuleRows({
  label,
  permissions,
  roleKeys,
}: {
  label: string;
  permissions: { key: string; description: string; roles: string[] }[];
  roleKeys: string[];
}) {
  return (
    <>
      <TableRow className="bg-muted/50 hover:bg-muted/50">
        <TableCell colSpan={roleKeys.length + 1} className="py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <span className="sticky left-5">{label}</span>
        </TableCell>
      </TableRow>
      {permissions.map((p) => (
        <TableRow key={p.key}>
          <TableCell className="sticky left-0 z-10 bg-card">
            <p className="text-[13px]">{p.description}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{p.key}</p>
          </TableCell>
          {roleKeys.map((role) => {
            const granted = p.roles.includes(role);
            return (
              <TableCell key={role} className="text-center">
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full",
                    granted ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground/50",
                  )}
                >
                  {granted ? <CheckIcon className="size-3.5" strokeWidth={3} aria-hidden /> : <span aria-hidden>–</span>}
                  <span className="sr-only">{granted ? "Granted" : "Not granted"}</span>
                </span>
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </>
  );
}
