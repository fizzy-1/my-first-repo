import "server-only";
import type { DocumentCategory, Prisma } from "@prisma/client";
import type { Permission } from "@/lib/rbac";
import { can, canAny, type SessionUser } from "@/server/auth/current-user";

/** Which module permission grants DEPARTMENT-level access to each category. */
export const CATEGORY_PERMISSIONS: Record<DocumentCategory, Permission[]> = {
  CORPORATE: ["strategy.read"],
  FINANCE: ["finance.read"],
  LEGAL: ["documents.executive"],
  SCHOOLS: ["schools.read"],
  MARKETING: ["marketing.read", "marketing.read.assigned"],
  ACADEMIC: ["academic.read", "academic.read.assigned"],
  TECHNOLOGY: ["technology.read", "technology.read.assigned"],
  HR: ["team.read.sensitive"],
  STRATEGY: ["strategy.read"],
};

export function readableCategories(user: SessionUser): DocumentCategory[] {
  return (Object.keys(CATEGORY_PERMISSIONS) as DocumentCategory[]).filter((c) => canAny(user, CATEGORY_PERMISSIONS[c]));
}

/**
 * Prisma filter for documents a user may see. Applied in SQL for every list,
 * search and download — never filtered after the fact.
 *  • ALL_STAFF   — anyone with documents.read
 *  • DEPARTMENT  — users who can read the category's module
 *  • EXECUTIVE   — documents.executive
 *  • RESTRICTED  — owner and explicitly granted users
 * Owners always see their own documents; documents.manage sees everything.
 */
export function documentsVisibleWhere(user: SessionUser): Prisma.DocumentWhereInput {
  if (!can(user, "documents.read")) return { id: "__no_access__" };
  if (can(user, "documents.manage")) return {};
  const or: Prisma.DocumentWhereInput[] = [
    { ownerId: user.id },
    { accessLevel: "ALL_STAFF" },
    { accessLevel: "DEPARTMENT", category: { in: readableCategories(user) } },
    { accessLevel: "RESTRICTED", accessGrants: { some: { userId: user.id } } },
  ];
  if (can(user, "documents.executive")) or.push({ accessLevel: "EXECUTIVE" });
  return { OR: or };
}
