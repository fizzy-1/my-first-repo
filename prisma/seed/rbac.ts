import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS, ROLES, ROLE_KEYS } from "../../src/lib/rbac";

export const DEPARTMENTS = [
  { slug: "executive", name: "Executive", description: "Directors and company leadership" },
  { slug: "finance", name: "Finance", description: "Finance, accounting and reporting" },
  { slug: "marketing", name: "Marketing", description: "Marketing, sales and school partnerships" },
  { slug: "academic", name: "Academic", description: "Curriculum, content production and tutoring" },
  { slug: "technology", name: "Technology", description: "Product, engineering and platform" },
  { slug: "operations", name: "Operations", description: "Operations, administration and learner support" },
] as const;

/**
 * Syncs the code-defined permissions, roles and departments into the database.
 * Safe to run repeatedly and in production (this is structural, not demo data).
 */
export async function syncRbac(db: PrismaClient) {
  for (const [key, def] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({
      where: { key },
      create: { key, module: def.module, description: def.description },
      update: { module: def.module, description: def.description },
    });
  }
  const permissions = await db.permission.findMany({ select: { id: true, key: true } });
  const permId = new Map(permissions.map((p) => [p.key, p.id]));

  for (const key of ROLE_KEYS) {
    const def = ROLES[key];
    const role = await db.role.upsert({
      where: { key },
      create: { key, name: def.name, description: def.description, isSystem: true },
      update: { name: def.name, description: def.description },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({
      data: def.permissions.map((p) => ({ roleId: role.id, permissionId: permId.get(p)! })),
      skipDuplicates: true,
    });
  }
  // Remove permissions that no longer exist in code.
  await db.permission.deleteMany({ where: { key: { notIn: Object.keys(PERMISSIONS) } } });

  for (const d of DEPARTMENTS) {
    await db.department.upsert({ where: { slug: d.slug }, create: d, update: { name: d.name, description: d.description } });
  }
}
