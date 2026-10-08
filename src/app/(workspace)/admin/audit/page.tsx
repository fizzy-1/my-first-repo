import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon, ScrollTextIcon, XIcon } from "lucide-react";
import { requirePageAccess } from "@/server/auth/current-user";
import { auditFilterOptions, auditFiltersFromParams, describeAuditEntity, listAuditLogs } from "@/server/services/admin";
import { Pagination } from "@/components/data-table/data-table";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { buildHref, exportHref, first, parseListParams } from "@/lib/list-params";
import { moduleLabel } from "../sections";
import { AuditTable } from "./audit-table";
import { DateRangeFilter } from "./date-range-filter";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditLogPage(props: PageProps<"/admin/audit">) {
  const user = await requirePageAccess("audit.read");
  const sp = await props.searchParams;
  const params = parseListParams(sp, { sortable: ["createdAt"] as const, defaultSort: "createdAt", defaultDir: "desc", pageSize: 50 });
  const filters = auditFiltersFromParams((name) => first(sp[name]));
  const [list, options, entity] = await Promise.all([
    listAuditLogs(user, filters, { dir: params.dir, skip: params.skip, take: params.pageSize }),
    auditFilterOptions(user),
    filters.entityType && filters.entityId ? describeAuditEntity(user, filters.entityType, filters.entityId) : Promise.resolve(null),
  ]);
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every important change in the workspace: who did what, when, and the values before and after. Entries can't be edited or deleted."
        actions={
          <Button variant="outline" asChild>
            <a href={exportHref("/api/reports/audit", sp)} download>
              <DownloadIcon /> Export CSV
            </a>
          </Button>
        }
        meta={
          filters.entityId && (
            <Badge tone="primary" className="py-1 pr-1">
              History of {filters.entityType ?? "record"}: {entity ?? filters.entityId}
              <Link
                href={buildHref("/admin/audit", sp, { entityType: undefined, entityId: undefined, page: undefined })}
                className="ml-1 rounded-sm p-0.5 hover:bg-primary/20"
                aria-label="Show all records"
              >
                <XIcon />
              </Link>
            </Badge>
          )
        }
      />
      <Card className="overflow-hidden">
        <TableToolbar
          searchPlaceholder="Search summaries or record ids…"
          filters={[
            { param: "actor", label: "Users", options: [{ value: "system", label: "System" }, ...options.actors] },
            { param: "module", label: "Modules", options: options.modules.map((m) => ({ value: m, label: moduleLabel(m) })) },
            { param: "action", label: "Actions", options: options.actions.map((a) => ({ value: a, label: a })) },
            { param: "entityType", label: "Record types", options: options.entityTypes.map((e) => ({ value: e, label: e })) },
          ]}
        >
          <DateRangeFilter />
        </TableToolbar>
        <AuditTable
          rows={list.rows}
          dir={params.dir}
          sortHref={buildHref("/admin/audit", sp, { sort: "createdAt", dir: params.dir === "desc" ? "asc" : "desc", page: undefined })}
          empty={
            <EmptyState
              icon={ScrollTextIcon}
              title={filtered ? "No entries match these filters" : "No audit entries yet"}
              description={filtered ? "Try a wider date range or clear some filters." : "Changes made in the workspace will be recorded here."}
            />
          }
        />
        <Pagination total={list.total} params={params} pathname="/admin/audit" searchParams={sp} />
      </Card>
    </>
  );
}
