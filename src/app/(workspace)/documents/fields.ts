import type { FieldDef, FieldOption, FormValues } from "@/components/forms/types";
import { DOCUMENT_ACCESS, DOCUMENT_CATEGORY, optionsOf } from "@/lib/labels";

export function documentFields(opts: { categories: string[]; folders: FieldOption[]; schools: FieldOption[]; people: FieldOption[]; canExecutive: boolean; withFile: boolean }): FieldDef[] {
  return [
    ...(opts.withFile ? ([{ type: "file", name: "file", label: "File", required: true, span: 2, accept: ".pdf,.docx,.xlsx,.pptx,.doc,.xls,.png,.jpg,.jpeg,.webp,.csv,.txt,.md", hint: "PDF, Office, image, CSV or text · max 20 MB" }] as FieldDef[]) : []),
    { type: "text", name: "title", label: "Title", required: true, span: 2 },
    { type: "textarea", name: "description", label: "Description", rows: 2 },
    { type: "select", name: "category", label: "Category", required: true, options: optionsOf(DOCUMENT_CATEGORY, opts.categories as (keyof typeof DOCUMENT_CATEGORY)[]) },
    { type: "select", name: "folderId", label: "Folder", options: opts.folders, emptyLabel: "No folder" },
    {
      type: "select",
      name: "accessLevel",
      label: "Access",
      required: true,
      options: optionsOf(DOCUMENT_ACCESS, opts.canExecutive ? undefined : ["ALL_STAFF", "DEPARTMENT", "RESTRICTED"]),
      hint: "Department = people with access to the category's module",
    },
    { type: "select", name: "schoolId", label: "Linked school", options: opts.schools, emptyLabel: "None" },
    { type: "text", name: "tags", label: "Tags", span: 2, placeholder: "Comma separated, e.g. budget, board, 2026" },
    { type: "multiselect", name: "grantUserIds", label: "Restricted access: people who can view", options: opts.people, hint: "Only used when access is Restricted." },
  ];
}

export function documentDefaults(d: {
  title: string;
  description: string | null;
  category: string;
  folderId: string | null;
  accessLevel: string;
  schoolId: string | null;
  tags: string[];
  accessGrants: { userId: string }[];
}): FormValues {
  return {
    title: d.title,
    description: d.description ?? "",
    category: d.category,
    folderId: d.folderId ?? "",
    accessLevel: d.accessLevel,
    schoolId: d.schoolId ?? "",
    tags: d.tags.join(", "),
    grantUserIds: d.accessGrants.map((g) => g.userId),
  };
}
