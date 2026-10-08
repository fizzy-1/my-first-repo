import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveIcon, DownloadIcon, FileUpIcon, LockIcon, PencilIcon } from "lucide-react";
import { archiveDocumentAction, updateDocumentAction, uploadVersionAction } from "@/server/actions/documents";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors";
import { activeUserOptions } from "@/server/rbac";
import { writableCategories } from "@/server/services/document-access";
import { folderOptions, getDocument } from "@/server/services/documents";
import { schoolOptions } from "@/server/services/schools";
import { storage, ALLOWED_TYPES } from "@/server/storage";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { ActionButton } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DOCUMENT_ACCESS, DOCUMENT_CATEGORY } from "@/lib/labels";
import { formatBytes, formatDateTime } from "@/lib/format";
import { documentDefaults, documentFields } from "../fields";

export const metadata: Metadata = { title: "Document" };

async function readTextPreview(storageKey: string): Promise<string | null> {
  const file = await storage().get(storageKey);
  if (!file || file.size > 200_000) return null;
  return new Response(file.stream).text();
}

export default async function DocumentPage(props: PageProps<"/documents/[id]">) {
  const { id } = await props.params;
  const user = await requirePageAccess("documents.read");
  let doc: Awaited<ReturnType<typeof getDocument>>;
  try {
    doc = await getDocument(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const latest = doc.versions[0];
  const previewable = latest && ALLOWED_TYPES[latest.mimeType]?.preview;
  const isText = latest && (latest.mimeType === "text/plain" || latest.mimeType === "text/csv");
  const text = isText ? await readTextPreview(latest.storageKey) : null;
  const [folders, schools, users] = doc.canManage
    ? await Promise.all([folderOptions(user), can(user, "schools.read") ? schoolOptions() : Promise.resolve([]), activeUserOptions()])
    : [[], [], []];

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Documents", href: "/documents" },
          { label: DOCUMENT_CATEGORY[doc.category].label, href: `/documents?category=${doc.category}` },
          ...(doc.folder ? [{ label: doc.folder.name, href: `/documents?category=${doc.category}&folder=${doc.folder.id}` }] : []),
          { label: doc.title },
        ]}
        title={doc.title}
        description={doc.description ?? undefined}
        meta={
          <>
            <Badge tone={DOCUMENT_ACCESS[doc.accessLevel].tone}>
              {(doc.accessLevel === "RESTRICTED" || doc.accessLevel === "EXECUTIVE") && <LockIcon />}
              {DOCUMENT_ACCESS[doc.accessLevel].label}
            </Badge>
            <StatusBadge meta={DOCUMENT_CATEGORY} value={doc.category} dot={false} />
            <Badge tone="outline">v{doc.currentVersion}</Badge>
            {doc.archivedAt && <Badge tone="warning">Archived</Badge>}
            {doc.tags.map((t) => (
              <Link key={t} href={`/documents?tag=${encodeURIComponent(t)}`} className="rounded bg-muted px-1.5 text-xs text-muted-foreground hover:text-foreground">
                #{t}
              </Link>
            ))}
          </>
        }
        actions={
          <>
            {latest && (
              <Button asChild variant="outline">
                <a href={`/api/documents/${latest.id}`} download>
                  <DownloadIcon /> Download
                </a>
              </Button>
            )}
            {doc.canUploadVersion && (
              <FormDialog
                title="Upload new version"
                description={`This will become version ${doc.currentVersion + 1}. Earlier versions stay available.`}
                trigger={
                  <Button variant="outline">
                    <FileUpIcon /> New version
                  </Button>
                }
                action={uploadVersionAction}
                fields={[
                  { type: "hidden", name: "documentId", value: doc.id },
                  { type: "file", name: "file", label: "File", required: true, span: 2 },
                  { type: "textarea", name: "changeNote", label: "What changed?", rows: 2 },
                ]}
                submitLabel="Upload version"
              />
            )}
            {doc.canManage && (
              <>
                <FormDialog
                  title="Edit document"
                  size="lg"
                  trigger={
                    <Button variant="outline">
                      <PencilIcon /> Edit
                    </Button>
                  }
                  action={updateDocumentAction}
                  fields={[{ type: "hidden", name: "id", value: doc.id }, ...documentFields({ categories: writableCategories(user), folders, schools, people: users.map(({ value, label }) => ({ value, label })), canExecutive: can(user, "documents.executive"), withFile: false })]}
                  defaultValues={documentDefaults(doc)}
                  submitLabel="Save"
                />
                <ActionButton variant="ghost" action={archiveDocumentAction} input={{ id: doc.id, archived: !doc.archivedAt }}>
                  <ArchiveIcon /> {doc.archivedAt ? "Restore" : "Archive"}
                </ActionButton>
              </>
            )}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-h-[480px] overflow-hidden">
          {!latest ? (
            <p className="p-6 text-sm text-muted-foreground">No file uploaded.</p>
          ) : !previewable ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
              <p className="text-sm text-muted-foreground">Preview isn&apos;t available for this file type.</p>
              <Button asChild>
                <a href={`/api/documents/${latest.id}`} download>
                  <DownloadIcon /> Download {latest.fileName}
                </a>
              </Button>
            </div>
          ) : latest.mimeType === "application/pdf" ? (
            <iframe src={`/api/documents/${latest.id}?inline=1`} title={`Preview of ${doc.title}`} className="h-[75vh] w-full border-0 bg-white" />
          ) : latest.mimeType.startsWith("image/") ? (
            <div className="flex items-center justify-center bg-muted/40 p-6">
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin file stream */}
              <img src={`/api/documents/${latest.id}?inline=1`} alt={doc.title} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
            </div>
          ) : (
            <pre className="max-h-[75vh] overflow-auto p-6 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">{text ?? "File is too large to preview — download it instead."}</pre>
          )}
        </Card>
        <div className="min-w-0 space-y-6">
          <SectionCard title="Details">
            <dl className="space-y-2.5 text-sm">
              {[
                ["Owner", doc.owner.name],
                ["Uploaded", formatDateTime(doc.createdAt)],
                ["Last updated", formatDateTime(doc.updatedAt)],
                ["File", latest ? `${latest.fileName} · ${formatBytes(latest.sizeBytes)}` : "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 truncate text-right" title={value}>
                    {value}
                  </dd>
                </div>
              ))}
              {doc.school && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">School</dt>
                  <dd>
                    <Link href={`/schools/${doc.school.id}`} className="hover:underline">
                      {doc.school.name}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </SectionCard>
          <SectionCard title="Version history">
            <ol className="space-y-3">
              {doc.versions.map((v) => (
                <li key={v.id} className="flex items-start gap-3 text-sm">
                  <Badge tone={v.version === doc.currentVersion ? "primary" : "neutral"}>v{v.version}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{v.changeNote ?? v.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.uploadedBy.name} · {formatDateTime(v.createdAt)} · {formatBytes(v.sizeBytes)}
                    </p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground" title="SHA-256 checksum">
                      {v.checksum.slice(0, 16)}…
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="icon-sm" aria-label={`Download version ${v.version}`}>
                    <a href={`/api/documents/${v.id}`} download>
                      <DownloadIcon />
                    </a>
                  </Button>
                </li>
              ))}
            </ol>
          </SectionCard>
          {doc.canManage && doc.accessLevel === "RESTRICTED" && (
            <SectionCard title="People with access" description="Plus the owner and document managers">
              {doc.accessGrants.length === 0 ? (
                <p className="text-sm text-muted-foreground">Only the owner can see this document.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {doc.accessGrants.map((g) => (
                    <li key={g.userId}>{g.user.name}</li>
                  ))}
                </ul>
              )}
            </SectionCard>
          )}
          {doc.taskAttachments.length > 0 && (
            <SectionCard title="Attached to tasks">
              <ul className="space-y-1.5 text-sm">
                {doc.taskAttachments.map((a) => (
                  <li key={a.task.id}>
                    <Link href={`/tasks/${a.task.id}`} className="hover:underline">
                      #{a.task.number} {a.task.title}
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
