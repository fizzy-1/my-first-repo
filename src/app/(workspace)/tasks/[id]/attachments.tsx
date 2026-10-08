import Link from "next/link";
import { ArchiveIcon, DownloadIcon, FileTextIcon, LockIcon, PaperclipIcon } from "lucide-react";
import { setTaskAttachmentsAction } from "@/server/actions/documents";
import type { SessionUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors";
import { getDocument, visibleDocumentOptions } from "@/server/services/documents";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { FormDialog } from "@/components/forms/form-dialog";
import type { FieldDef } from "@/components/forms/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DOCUMENT_CATEGORY } from "@/lib/labels";
import { formatBytes } from "@/lib/format";

/** Loads a document only if this user may see it; hidden or missing documents resolve to null. */
async function visibleDocument(user: SessionUser, id: string) {
  try {
    return await getDocument(user, id);
  } catch (error) {
    if (isAppError(error) && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) return null;
    throw error;
  }
}

/**
 * Documents attached to a task. Each attachment is re-checked against the
 * viewer's document access, so restricted titles are never shown; people who
 * can update the task (assignee or task managers) can change the selection.
 */
export async function TaskAttachments({
  user,
  task,
}: {
  user: SessionUser;
  task: { id: string; number: number; canUpdateStatus: boolean; attachments: { document: { id: string } }[] };
}) {
  const [resolved, options] = await Promise.all([
    Promise.all(task.attachments.map(({ document }) => visibleDocument(user, document.id))),
    task.canUpdateStatus ? visibleDocumentOptions(user) : Promise.resolve([]),
  ]);
  const documents = resolved
    .filter((doc) => doc !== null)
    .map((doc) => ({ ...doc, current: doc.versions.find((v) => v.version === doc.currentVersion) ?? doc.versions[0] ?? null }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const restricted = resolved.length - documents.length;

  // Attached documents can be archived or older than the option list's window; keep them selectable by name.
  const known = new Set(options.map((o) => o.value));
  const choices = [
    ...documents.filter((d) => !known.has(d.id)).map((d) => ({ value: d.id, label: d.title, hint: d.archivedAt ? "Archived" : undefined })),
    ...options,
  ];
  const fields: FieldDef[] = [
    { type: "hidden", name: "taskId", value: task.id },
    ...(restricted > 0
      ? [
          {
            type: "heading" as const,
            name: "restricted",
            label: `${restricted} attachment${restricted === 1 ? "" : "s"} you can't access`,
            description: `${restricted === 1 ? "It stays" : "They stay"} attached when you save; only people with access can see or change ${restricted === 1 ? "it" : "them"}.`,
          },
        ]
      : []),
    {
      type: "multiselect",
      name: "documentIds",
      label: "Documents",
      options: choices,
      placeholder: choices.length ? "Choose documents…" : "No documents available",
      hint: choices.length
        ? "Only documents you can access are listed. Anyone who can see the task sees attachments they also have access to."
        : "Upload a document in Documents first, then attach it here.",
    },
  ];

  return (
    <SectionCard
      title={
        <span className="inline-flex items-center gap-2">
          Attachments
          {task.attachments.length > 0 && (
            <span className="tabular rounded-full bg-muted px-2 text-xs leading-5 font-medium text-muted-foreground">{task.attachments.length}</span>
          )}
        </span>
      }
      description="Documents linked from the company repository."
      flush
      actions={
        task.canUpdateStatus && (
          <FormDialog
            title={`Attachments for task #${task.number}`}
            description="Choose which repository documents are linked to this task."
            trigger={
              <Button variant="outline" size="sm">
                <PaperclipIcon /> {task.attachments.length ? "Manage" : "Attach"}
              </Button>
            }
            action={setTaskAttachmentsAction}
            fields={fields}
            defaultValues={{ documentIds: documents.map((d) => d.id) }}
            submitLabel="Save attachments"
          />
        )
      }
    >
      {task.attachments.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">
          No documents attached.{task.canUpdateStatus && " Use “Attach” to link briefs, contracts or reference material from the repository."}
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
              <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileTextIcon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <Link href={`/documents/${doc.id}`} className="truncate text-sm font-medium hover:underline">
                    {doc.title}
                  </Link>
                  {doc.archivedAt && (
                    <Badge tone="neutral" className="shrink-0">
                      <ArchiveIcon aria-hidden /> Archived
                    </Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {doc.current ? (
                    <>
                      v{doc.current.version} · {formatBytes(doc.current.sizeBytes)} · {doc.current.fileName}
                    </>
                  ) : (
                    "No file uploaded"
                  )}
                </p>
              </div>
              <StatusBadge meta={DOCUMENT_CATEGORY} value={doc.category} dot={false} className="hidden shrink-0 sm:inline-flex" />
              {doc.current && (
                <Button asChild variant="ghost" size="icon-sm" className="shrink-0">
                  <a href={`/api/documents/${doc.current.id}`} download aria-label={`Download ${doc.title} (version ${doc.current.version})`}>
                    <DownloadIcon />
                  </a>
                </Button>
              )}
            </li>
          ))}
          {restricted > 0 && (
            <li className="flex items-center gap-3 px-5 py-3 text-sm text-muted-foreground">
              <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <LockIcon className="size-4" />
              </span>
              {restricted} more document{restricted === 1 ? "" : "s"} you don&apos;t have access to
            </li>
          )}
        </ul>
      )}
    </SectionCard>
  );
}
