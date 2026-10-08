import "server-only";
import type { DocumentAccessLevel, DocumentCategory, Prisma } from "@prisma/client";
import { DOCUMENT_ACCESS, DOCUMENT_CATEGORY } from "@/lib/labels";
import { audit, diffFields } from "@/server/audit";
import { assertCan, can, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { notify } from "@/server/notify";
import { ALLOWED_TYPES, MAX_UPLOAD_BYTES, contentMatchesType, newStorageKey, sha256, storage } from "@/server/storage";
import { documentsVisibleWhere, readableCategories, writableCategories } from "./document-access";

export type DocumentSort = "updatedAt" | "title" | "createdAt";

function canManageDocument(user: SessionUser, doc: { ownerId: string }) {
  return doc.ownerId === user.id || can(user, "documents.manage");
}

export async function documentTree(user: SessionUser) {
  assertCan(user, "documents.read");
  const visible = documentsVisibleWhere(user);
  const [folders, counts] = await Promise.all([
    db.documentFolder.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    db.document.groupBy({ by: ["category", "folderId"], where: { AND: [visible, { archivedAt: null }] }, _count: true }),
  ]);
  // Only show categories the user can read (or already has visible documents in).
  const readable = new Set(can(user, "documents.manage") ? (Object.keys(DOCUMENT_CATEGORY) as DocumentCategory[]) : readableCategories(user));
  const categories = (Object.keys(DOCUMENT_CATEGORY) as DocumentCategory[])
    .filter((category) => readable.has(category) || counts.some((c) => c.category === category))
    .map((category) => ({
    category,
    count: counts.filter((c) => c.category === category).reduce((s, c) => s + c._count, 0),
    folders: folders
      .filter((f) => f.category === category)
      .map((f) => ({ id: f.id, name: f.name, count: counts.find((c) => c.folderId === f.id)?._count ?? 0 })),
  }));
  return categories;
}

export async function listDocuments(
  user: SessionUser,
  opts: { q?: string; category?: DocumentCategory; folderId?: string; tag?: string; access?: DocumentAccessLevel; archived?: boolean; sort: DocumentSort; dir: "asc" | "desc"; skip: number; take: number },
) {
  assertCan(user, "documents.read");
  const where: Prisma.DocumentWhereInput = {
    AND: [
      documentsVisibleWhere(user),
      opts.archived ? { archivedAt: { not: null } } : { archivedAt: null },
      opts.category ? { category: opts.category } : {},
      opts.folderId ? { folderId: opts.folderId } : {},
      opts.access ? { accessLevel: opts.access } : {},
      opts.tag ? { tags: { some: { tag: { name: opts.tag } } } } : {},
      opts.q
        ? {
            OR: [
              { title: { contains: opts.q, mode: "insensitive" } },
              { description: { contains: opts.q, mode: "insensitive" } },
              { tags: { some: { tag: { name: { contains: opts.q, mode: "insensitive" } } } } },
              { versions: { some: { fileName: { contains: opts.q, mode: "insensitive" } } } },
            ],
          }
        : {},
    ],
  };
  const [total, rows] = await Promise.all([
    db.document.count({ where }),
    db.document.findMany({
      where,
      orderBy: { [opts.sort]: opts.dir },
      skip: opts.skip,
      take: opts.take,
      include: {
        owner: { select: { id: true, name: true } },
        folder: { select: { name: true } },
        school: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
        versions: { orderBy: { version: "desc" }, take: 1, select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } },
      },
    }),
  ]);
  return {
    total,
    rows: rows.map(({ versions, tags, ...d }) => ({ ...d, latest: versions[0] ?? null, tags: tags.map((t) => t.tag.name), canManage: canManageDocument(user, d) })),
  };
}

export async function getDocument(user: SessionUser, id: string) {
  assertCan(user, "documents.read");
  const doc = await db.document.findFirst({
    where: { AND: [{ id }, documentsVisibleWhere(user)] },
    include: {
      owner: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
      school: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
      versions: { orderBy: { version: "desc" }, include: { uploadedBy: { select: { name: true } } } },
      accessGrants: { include: { user: { select: { id: true, name: true } } } },
      taskAttachments: { include: { task: { select: { id: true, number: true, title: true } } } },
    },
  });
  if (!doc) throw new NotFoundError("Document");
  const canManage = canManageDocument(user, doc);
  return {
    ...doc,
    tags: doc.tags.map((t) => t.tag.name),
    // Grant lists reveal who has access — only owners / managers see them.
    accessGrants: canManage ? doc.accessGrants : [],
    canManage,
    canUploadVersion: canManage || (can(user, "documents.write") && doc.accessLevel !== "RESTRICTED"),
  };
}

/** Resolves a version for download after checking the user may see its document. */
export async function getVersionForDownload(user: SessionUser, versionId: string) {
  if (!can(user, "documents.read")) throw new ForbiddenError();
  const version = await db.documentVersion.findFirst({
    where: { id: versionId, document: documentsVisibleWhere(user) },
    include: { document: { select: { id: true, title: true, accessLevel: true, category: true } } },
  });
  if (!version) throw new NotFoundError("Document");
  return version;
}

// ─────────────────────────── Uploads ───────────────────────────

function extensionOf(name: string) {
  return name.toLowerCase().split(".").pop() ?? "";
}

function sanitiseFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^\w.\- ()]+/g, "_").slice(0, 150) || "file";
}

async function validateFile(file: File): Promise<{ data: Buffer; mimeType: string; fileName: string }> {
  if (!file || file.size === 0) throw new ValidationError("Choose a file to upload.", { file: ["Choose a file."] });
  if (file.size > MAX_UPLOAD_BYTES) throw new ValidationError(`Files must be ${MAX_UPLOAD_BYTES / 1024 / 1024} MB or smaller.`, { file: ["File is too large."] });
  const fileName = sanitiseFileName(file.name);
  const ext = extensionOf(fileName);
  // Trust the extension allow-list, not the browser-supplied type.
  const entry = Object.entries(ALLOWED_TYPES).find(([, v]) => v.ext.includes(ext));
  if (!entry) throw new ValidationError("This file type isn't allowed. Upload PDF, Office, image, CSV or text files.", { file: ["Unsupported file type."] });
  const mimeType = entry[0];
  const data = Buffer.from(await file.arrayBuffer());
  if (!contentMatchesType(data, mimeType)) throw new ValidationError("The file contents don't match its extension.", { file: ["File appears to be corrupt or mislabelled."] });
  return { data, mimeType, fileName };
}

async function syncTags(tx: Prisma.TransactionClient, documentId: string, tags: string[]) {
  const names = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 15);
  await tx.documentTag.deleteMany({ where: { documentId } });
  for (const name of names) {
    const tag = await tx.tag.upsert({ where: { name }, create: { name }, update: {} });
    await tx.documentTag.create({ data: { documentId, tagId: tag.id } });
  }
}

export interface DocumentMeta {
  title: string;
  description?: string;
  category: DocumentCategory;
  folderId?: string;
  accessLevel: DocumentAccessLevel;
  schoolId?: string;
  tags: string[];
  grantUserIds: string[];
}

async function validateFolder(user: SessionUser, meta: DocumentMeta) {
  if (!writableCategories(user).includes(meta.category)) {
    throw new ValidationError("You can't file documents in that category.", { category: ["Choose a category your role has access to."] });
  }
  if (!meta.folderId) return;
  const folder = await db.documentFolder.findUnique({ where: { id: meta.folderId } });
  if (!folder || folder.category !== meta.category) throw new ValidationError("Choose a folder in the selected category.", { folderId: ["Folder doesn't match the category."] });
}

export async function uploadDocument(user: SessionUser, meta: DocumentMeta, file: File) {
  assertCan(user, "documents.write");
  if (meta.accessLevel === "EXECUTIVE" && !can(user, "documents.executive")) throw new ForbiddenError("You can't create executive-level documents.");
  await validateFolder(user, meta);
  const { data, mimeType, fileName } = await validateFile(file);
  const key = newStorageKey();
  await storage().put(key, data);
  try {
    const doc = await db.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          title: meta.title,
          description: meta.description ?? null,
          category: meta.category,
          folderId: meta.folderId ?? null,
          ownerId: user.id,
          accessLevel: meta.accessLevel,
          schoolId: meta.schoolId ?? null,
          currentVersion: 1,
          versions: { create: { version: 1, fileName, mimeType, sizeBytes: data.length, storageKey: key, checksum: sha256(data), changeNote: "Initial upload", uploadedById: user.id } },
        },
      });
      await syncTags(tx, created.id, meta.tags);
      if (meta.accessLevel === "RESTRICTED" && meta.grantUserIds.length) {
        await tx.documentAccessGrant.createMany({ data: [...new Set(meta.grantUserIds)].map((userId) => ({ documentId: created.id, userId })), skipDuplicates: true });
      }
      await audit(
        user,
        {
          action: "document.uploaded",
          module: "documents",
          entityType: "Document",
          entityId: created.id,
          summary: `${user.name} uploaded “${created.title}” (${DOCUMENT_CATEGORY[created.category].label}, ${DOCUMENT_ACCESS[created.accessLevel].label})`,
          after: { title: created.title, category: created.category, accessLevel: created.accessLevel, fileName, sizeBytes: data.length },
          // Only non-sensitive uploads appear in the shared activity feed.
          feed: created.accessLevel === "ALL_STAFF",
        },
        tx,
      );
      return created;
    });
    if (meta.accessLevel === "RESTRICTED") {
      await notify({ userIds: meta.grantUserIds, excludeUserId: user.id, type: "DOCUMENT_UPLOADED", title: `Shared with you: ${doc.title}`, body: `${user.name} gave you access to a restricted document.`, link: `/documents/${doc.id}` });
    } else if (meta.accessLevel === "ALL_STAFF" && (doc.category === "CORPORATE" || doc.category === "HR")) {
      const everyone = await db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
      await notify({ userIds: everyone.map((u) => u.id), excludeUserId: user.id, type: "DOCUMENT_UPLOADED", title: `New document: ${doc.title}`, body: `${user.name} published a company document.`, link: `/documents/${doc.id}` });
    }
    return doc;
  } catch (error) {
    await storage().delete(key).catch(() => undefined);
    throw error;
  }
}

export async function uploadNewVersion(user: SessionUser, documentId: string, file: File, changeNote?: string) {
  const doc = await getDocument(user, documentId);
  if (!doc.canUploadVersion) throw new ForbiddenError("You can't upload new versions of this document.");
  const { data, mimeType, fileName } = await validateFile(file);
  const key = newStorageKey();
  await storage().put(key, data);
  try {
    const version = doc.currentVersion + 1;
    await db.$transaction(async (tx) => {
      // Optimistic concurrency on the version counter.
      const updated = await tx.document.updateMany({ where: { id: documentId, currentVersion: doc.currentVersion }, data: { currentVersion: version } });
      if (updated.count === 0) throw new ValidationError("Someone uploaded a new version at the same time. Refresh and try again.");
      await tx.documentVersion.create({ data: { documentId, version, fileName, mimeType, sizeBytes: data.length, storageKey: key, checksum: sha256(data), changeNote: changeNote ?? null, uploadedById: user.id } });
      await audit(
        user,
        {
          action: "document.version",
          module: "documents",
          entityType: "Document",
          entityId: documentId,
          summary: `${user.name} uploaded version ${version} of “${doc.title}”`,
          before: { version: doc.currentVersion },
          after: { version, fileName, changeNote: changeNote ?? null },
          feed: doc.accessLevel === "ALL_STAFF",
        },
        tx,
      );
    });
    if (doc.ownerId !== user.id) {
      await notify({ userIds: [doc.ownerId], type: "DOCUMENT_UPLOADED", title: `New version of ${doc.title}`, body: `${user.name} uploaded version ${version}.`, link: `/documents/${documentId}` });
    }
  } catch (error) {
    await storage().delete(key).catch(() => undefined);
    throw error;
  }
}

export async function updateDocumentMeta(user: SessionUser, id: string, meta: DocumentMeta) {
  const existing = await db.document.findUnique({ where: { id }, include: { tags: { include: { tag: true } }, accessGrants: true } });
  if (!existing) throw new NotFoundError("Document");
  if (!canManageDocument(user, existing)) throw new ForbiddenError("Only the owner can edit this document.");
  if (meta.accessLevel === "EXECUTIVE" && !can(user, "documents.executive")) throw new ForbiddenError("You can't set executive-level access.");
  await validateFolder(user, meta);
  const data = {
    title: meta.title,
    description: meta.description ?? null,
    category: meta.category,
    folderId: meta.folderId ?? null,
    accessLevel: meta.accessLevel,
    schoolId: meta.schoolId ?? null,
  };
  const changes = diffFields(existing, data);
  const oldGrants = existing.accessGrants.map((g) => g.userId);
  const newGrants = meta.accessLevel === "RESTRICTED" ? [...new Set(meta.grantUserIds)] : [];
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data });
    await syncTags(tx, id, meta.tags);
    await tx.documentAccessGrant.deleteMany({ where: { documentId: id, userId: { notIn: newGrants } } });
    await tx.documentAccessGrant.createMany({ data: newGrants.map((userId) => ({ documentId: id, userId })), skipDuplicates: true });
    await audit(
      user,
      {
        action: changes && "accessLevel" in changes.after ? "document.access_changed" : "document.updated",
        module: "documents",
        entityType: "Document",
        entityId: id,
        summary: `${user.name} updated “${meta.title}”${changes && "accessLevel" in changes.after ? ` (access ${DOCUMENT_ACCESS[existing.accessLevel].label} → ${DOCUMENT_ACCESS[meta.accessLevel].label})` : ""}`,
        before: { ...(changes?.before ?? {}), grants: oldGrants, tags: existing.tags.map((t) => t.tag.name) },
        after: { ...(changes?.after ?? {}), grants: newGrants, tags: meta.tags },
      },
      tx,
    );
  });
  const added = newGrants.filter((g) => !oldGrants.includes(g));
  await notify({ userIds: added, excludeUserId: user.id, type: "DOCUMENT_UPLOADED", title: `Shared with you: ${meta.title}`, body: `${user.name} gave you access.`, link: `/documents/${id}` });
}

export async function setDocumentArchived(user: SessionUser, id: string, archived: boolean) {
  const existing = await db.document.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Document");
  if (!canManageDocument(user, existing)) throw new ForbiddenError();
  await db.document.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  await audit(user, { action: archived ? "document.archived" : "document.restored", module: "documents", entityType: "Document", entityId: id, summary: `${user.name} ${archived ? "archived" : "restored"} “${existing.title}”` });
}

/** Permanent deletion (documents.manage only) — removes all stored versions. */
export async function deleteDocument(user: SessionUser, id: string) {
  assertCan(user, "documents.manage");
  const existing = await db.document.findUnique({ where: { id }, include: { versions: { select: { storageKey: true } } } });
  if (!existing) throw new NotFoundError("Document");
  await db.$transaction(async (tx) => {
    await tx.partnership.updateMany({ where: { contractDocumentId: id }, data: { contractDocumentId: null } });
    await tx.expense.updateMany({ where: { documentId: id }, data: { documentId: null } });
    await tx.document.delete({ where: { id } });
    await audit(user, { action: "document.deleted", module: "documents", entityType: "Document", entityId: id, summary: `${user.name} permanently deleted “${existing.title}” (${existing.versions.length} version${existing.versions.length === 1 ? "" : "s"})`, before: { title: existing.title, category: existing.category } }, tx);
  });
  for (const v of existing.versions) await storage().delete(v.storageKey).catch(() => undefined);
}

export async function folderOptions(user: SessionUser) {
  const folders = await db.documentFolder.findMany({ where: { category: { in: writableCategories(user) } }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  return folders.map((f) => ({ value: f.id, label: `${DOCUMENT_CATEGORY[f.category].label} › ${f.name}`, hint: f.category }));
}

export async function visibleDocumentOptions(user: SessionUser) {
  const docs = await db.document.findMany({ where: { AND: [documentsVisibleWhere(user), { archivedAt: null }] }, orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, title: true } });
  return docs.map((d) => ({ value: d.id, label: d.title }));
}

export async function visibleDocumentIds(user: SessionUser, ids: string[]) {
  const docs = await db.document.findMany({ where: { AND: [{ id: { in: ids } }, documentsVisibleWhere(user)] }, select: { id: true } });
  return new Set(docs.map((d) => d.id));
}
