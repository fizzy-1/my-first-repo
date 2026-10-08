"use server";

import { DocumentAccessLevel, DocumentCategory } from "@prisma/client";
import { z } from "zod";
import { argAction, formAction } from "@/server/action";
import { zEnum, zId, zIdList, zOptionalId, zOptionalText, zText } from "@/lib/validation";
import { deleteDocument, setDocumentArchived, updateDocumentMeta, uploadDocument, uploadNewVersion, visibleDocumentIds } from "@/server/services/documents";
import { setTaskAttachments } from "@/server/services/tasks";

const tagList = z.preprocess(
  (v) => (typeof v === "string" ? v.split(",").map((t) => t.trim()).filter(Boolean) : []),
  z.array(z.string().max(40)).max(15),
);

const metaSchema = z.object({
  title: zText(200, "Title"),
  description: zOptionalText(2000),
  category: zEnum(DocumentCategory, "a category"),
  folderId: zOptionalId,
  accessLevel: zEnum(DocumentAccessLevel, "an access level"),
  schoolId: zOptionalId,
  tags: tagList,
  grantUserIds: zIdList,
});

const fileField = z.instanceof(File, { message: "Choose a file to upload." });

export const uploadDocumentAction = formAction(metaSchema.extend({ file: fileField }), async (user, { file, ...meta }) => {
  const doc = await uploadDocument(user, meta, file);
  return { message: "Document uploaded", id: doc.id };
});

export const uploadVersionAction = formAction(z.object({ documentId: zId, file: fileField, changeNote: zOptionalText(500) }), async (user, input) => {
  await uploadNewVersion(user, input.documentId, input.file, input.changeNote);
  return "New version uploaded";
});

export const updateDocumentAction = formAction(metaSchema.extend({ id: zId }), async (user, { id, ...meta }) => {
  await updateDocumentMeta(user, id, meta);
  return "Document updated";
});

export const archiveDocumentAction = argAction(z.object({ id: zId, archived: z.boolean() }), async (user, { id, archived }) => {
  await setDocumentArchived(user, id, archived);
  return archived ? "Document archived" : "Document restored";
});

export const deleteDocumentAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteDocument(user, id);
  return "Document permanently deleted";
});

export const setTaskAttachmentsAction = formAction(z.object({ taskId: zId, documentIds: zIdList }), async (user, { taskId, documentIds }) => {
  const visible = await visibleDocumentIds(user, documentIds);
  await setTaskAttachments(user, taskId, documentIds, visible);
  return "Attachments updated";
});
