import type { Metadata } from "next";
import Link from "next/link";
import { ArchiveIcon, DownloadIcon, FileIcon, FileImageIcon, FileSpreadsheetIcon, FileTextIcon, FolderIcon, FolderOpenIcon, LockIcon, UploadIcon } from "lucide-react";
import { DocumentAccessLevel, DocumentCategory } from "@prisma/client";
import { archiveDocumentAction, deleteDocumentAction, uploadDocumentAction } from "@/server/actions/documents";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { activeUserOptions } from "@/server/rbac";
import { defaultCategory, writableCategories } from "@/server/services/document-access";
import { documentTree, folderOptions, listDocuments, type DocumentSort } from "@/server/services/documents";
import { schoolOptions } from "@/server/services/schools";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { FormDialog } from "@/components/forms/form-dialog";
import { RowMenu, type RowMenuItem } from "@/components/forms/row-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DOCUMENT_ACCESS, DOCUMENT_CATEGORY, optionsOf } from "@/lib/labels";
import { formatBytes, formatDate } from "@/lib/format";
import { buildHref, oneOf, parseListParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";
import { documentFields } from "./fields";

export const metadata: Metadata = { title: "Documents" };

const SORTS = ["updatedAt", "title", "createdAt"] as const satisfies readonly DocumentSort[];

function fileIcon(mime: string | undefined) {
  if (!mime) return FileIcon;
  if (mime.startsWith("image/")) return FileImageIcon;
  if (mime.includes("spreadsheet") || mime === "text/csv" || mime.includes("excel")) return FileSpreadsheetIcon;
  return FileTextIcon;
}

export default async function DocumentsPage(props: PageProps<"/documents">) {
  const user = await requirePageAccess("documents.read");
  const sp = await props.searchParams;
  const params = parseListParams(sp, { sortable: SORTS, defaultSort: "updatedAt", defaultDir: "desc", pageSize: 25 });
  const category = oneOf<DocumentCategory>(params.filter("category"), DocumentCategory);
  const folderId = params.filter("folder");
  const archived = params.filter("archived") === "1";
  const [tree, list, folders, schools, users] = await Promise.all([
    documentTree(user),
    listDocuments(user, {
      q: params.q || undefined,
      category,
      folderId,
      tag: params.filter("tag"),
      access: oneOf<DocumentAccessLevel>(params.filter("access"), DocumentAccessLevel),
      archived,
      sort: params.sort,
      dir: params.dir,
      skip: params.skip,
      take: params.pageSize,
    }),
    folderOptions(user),
    can(user, "schools.read") ? schoolOptions() : Promise.resolve([]),
    activeUserOptions(),
  ]);
  const categories = writableCategories(user);
  const fields = documentFields({ categories, folders, schools, people: users.map(({ value, label }) => ({ value, label })), canExecutive: can(user, "documents.executive"), withFile: true });

  const columns: Column<(typeof list.rows)[number]>[] = [
    {
      key: "title",
      header: "Document",
      sortKey: "title",
      cell: (d) => {
        const Icon = fileIcon(d.latest?.mimeType);
        return (
          <div className="flex min-w-64 items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <Link href={`/documents/${d.id}`} className="font-medium hover:underline">
                {d.title}
              </Link>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {d.tags.slice(0, 4).map((t) => (
                  <Link key={t} href={buildHref("/documents", sp, { tag: t, page: undefined })} className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground hover:text-foreground">
                    #{t}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "location",
      header: "Location",
      hideOnMobile: true,
      cell: (d) => (
        <span className="block max-w-40 truncate text-xs text-muted-foreground" title={d.folder ? `${DOCUMENT_CATEGORY[d.category].label} › ${d.folder.name}` : undefined}>
          {DOCUMENT_CATEGORY[d.category].label}
          {d.folder && ` › ${d.folder.name}`}
        </span>
      ),
    },
    {
      key: "access",
      header: "Access",
      cell: (d) => (
        <Badge tone={DOCUMENT_ACCESS[d.accessLevel].tone}>
          {(d.accessLevel === "RESTRICTED" || d.accessLevel === "EXECUTIVE") && <LockIcon />}
          {DOCUMENT_ACCESS[d.accessLevel].label}
        </Badge>
      ),
    },
    { key: "owner", header: "Owner", className: "hidden xl:table-cell", cell: (d) => <span className="whitespace-nowrap text-muted-foreground">{d.owner.name}</span> },
    { key: "version", header: "Ver.", hideOnMobile: true, cell: (d) => <span className="tabular text-muted-foreground">v{d.currentVersion}</span> },
    { key: "size", header: "Size", hideOnMobile: true, cell: (d) => <span className="tabular text-xs whitespace-nowrap text-muted-foreground">{d.latest ? formatBytes(d.latest.sizeBytes) : "—"}</span> },
    { key: "updated", header: "Updated", sortKey: "updatedAt", cell: (d) => <span className="text-xs whitespace-nowrap text-muted-foreground">{formatDate(d.updatedAt)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (d) => (
        <div className="flex items-center justify-end gap-1">
          {d.latest && (
            <Button asChild variant="ghost" size="icon-sm" aria-label={`Download ${d.title}`}>
              <a href={`/api/documents/${d.latest.id}`} download>
                <DownloadIcon />
              </a>
            </Button>
          )}
          {d.canManage && (
            <RowMenu
              label={d.title}
              href={`/documents/${d.id}`}
              items={[
                { label: archived ? "Restore" : "Archive", icon: "archive", action: archiveDocumentAction, input: { id: d.id, archived: !archived } } satisfies RowMenuItem,
              ]}
              remove={
                can(user, "documents.manage")
                  ? { action: deleteDocumentAction, input: { id: d.id }, title: `Permanently delete “${d.title}”?`, description: "All versions and stored files are deleted. This cannot be undone. Consider archiving instead." }
                  : undefined
              }
            />
          )}
        </div>
      ),
    },
  ];

  const treeLink = (cat?: DocumentCategory, folder?: string) => buildHref("/documents", {}, { category: cat, folder });

  return (
    <>
      <PageHeader
        title="Documents"
        description="The company document repository. You only see documents your role has access to."
        actions={
          can(user, "documents.write") && (
            <FormDialog
              title="Upload document"
              size="lg"
              trigger={
                <Button>
                  <UploadIcon /> Upload
                </Button>
              }
              openParam="document"
              action={uploadDocumentAction}
              fields={fields}
              defaultValues={{
                category: category && categories.includes(category) ? category : defaultCategory(user),
                accessLevel: "DEPARTMENT",
                ...(folderId && folders.some((f) => f.value === folderId) ? { folderId } : {}),
              }}
              submitLabel="Upload"
              successHref="/documents/{id}"
            />
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit p-2">
          <nav aria-label="Folders" className="text-sm">
            <Link href={treeLink()} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5", !category && !archived ? "bg-sidebar-active text-sidebar-active-foreground" : "hover:bg-accent")}>
              <FolderOpenIcon className="size-4" /> All documents
            </Link>
            {tree.map((c) => (
              <div key={c.category} className="mt-0.5">
                <Link
                  href={treeLink(c.category)}
                  className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5", category === c.category && !folderId ? "bg-sidebar-active text-sidebar-active-foreground" : "hover:bg-accent")}
                >
                  <FolderIcon className="size-4" />
                  <span className="flex-1">{DOCUMENT_CATEGORY[c.category].label}</span>
                  <span className="tabular text-xs text-muted-foreground">{c.count}</span>
                </Link>
                {category === c.category &&
                  c.folders.map((f) => (
                    <Link
                      key={f.id}
                      href={treeLink(c.category, f.id)}
                      className={cn("ml-5 flex items-center gap-2 rounded-lg px-2.5 py-1 text-[13px]", folderId === f.id ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
                    >
                      <span className="flex-1">{f.name}</span>
                      <span className="tabular text-xs">{f.count}</span>
                    </Link>
                  ))}
              </div>
            ))}
            <Link href={buildHref("/documents", {}, { archived: "1" })} className={cn("mt-2 flex items-center gap-2 rounded-lg border-t border-border px-2.5 py-1.5 pt-2.5 text-muted-foreground", archived ? "text-foreground" : "hover:text-foreground")}>
              <ArchiveIcon className="size-4" /> Archived
            </Link>
          </nav>
        </Card>
        <Card className="min-w-0 overflow-hidden">
          <TableToolbar
            searchPlaceholder="Search titles, tags or file names…"
            filters={[{ param: "access", label: "Access", options: optionsOf(DOCUMENT_ACCESS) }]}
          >
            {params.filter("tag") && (
              <Link href={buildHref("/documents", sp, { tag: undefined })}>
                <Badge tone="primary">#{params.filter("tag")} ×</Badge>
              </Link>
            )}
          </TableToolbar>
          <DataTable
            columns={columns}
            rows={list.rows}
            total={list.total}
            params={params}
            pathname="/documents"
            searchParams={sp}
            empty={<EmptyState icon={FolderOpenIcon} title={archived ? "No archived documents" : "No documents here"} description={archived ? undefined : "Upload a document or choose another folder."} />}
          />
        </Card>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        <StatusBadge meta={DOCUMENT_ACCESS} value="RESTRICTED" dot={false} /> documents are visible only to their owner and named people. Downloads of executive and restricted documents are recorded in the audit log.
      </p>
    </>
  );
}
