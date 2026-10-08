import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_PERMISSIONS, PERMISSIONS, ROLE_KEYS, ROLES, hasAny, hasPermission, type Permission, type RoleKey } from "./rbac";

const grants = (role: RoleKey, permission: Permission) => ROLES[role].permissions.includes(permission);

describe("role definitions", () => {
  it("defines every role key", () => {
    assert.deepEqual(Object.keys(ROLES).sort(), [...ROLE_KEYS].sort());
  });

  it("only grants permissions that exist, without duplicates", () => {
    for (const key of ROLE_KEYS) {
      const perms = ROLES[key].permissions;
      for (const p of perms) assert.ok(p in PERMISSIONS, `${key} grants unknown permission ${p}`);
      assert.equal(new Set(perms).size, perms.length, `${key} lists a permission twice`);
    }
  });

  it("gives SUPER_ADMIN every permission", () => {
    assert.deepEqual([...ROLES.SUPER_ADMIN.permissions].sort(), [...ALL_PERMISSIONS].sort());
  });

  it("gives DIRECTOR everything except user administration", () => {
    assert.equal(grants("DIRECTOR", "admin.users"), false);
    assert.deepEqual(
      [...ROLES.DIRECTOR.permissions].sort(),
      ALL_PERMISSIONS.filter((p) => p !== "admin.users").sort(),
    );
  });

  it("keeps finance away from tutors and other non-finance staff", () => {
    for (const role of ["TUTOR", "DEVELOPER", "MARKETING_STAFF", "HEAD_TUTOR", "PRODUCT_MANAGER"] as const) {
      assert.equal(grants(role, "finance.read"), false, `${role} must not read finance`);
    }
    assert.equal(grants("FINANCE_EXECUTIVE", "finance.read"), true);
  });

  it("limits staff roles to their own work", () => {
    assert.equal(grants("TUTOR", "academic.read"), false);
    assert.equal(grants("TUTOR", "academic.read.assigned"), true);
    assert.equal(grants("DEVELOPER", "technology.write"), false);
    assert.equal(grants("MARKETING_STAFF", "marketing.write"), false);
  });

  it("lets the finance executive decide only finance approvals", () => {
    assert.equal(grants("FINANCE_EXECUTIVE", "approvals.decide.finance"), true);
    assert.equal(grants("FINANCE_EXECUTIVE", "approvals.decide"), false);
  });

  it("reserves administration permissions for Super Admin and Director", () => {
    const admin: Permission[] = ["admin.users", "admin.roles", "audit.read"];
    for (const key of ROLE_KEYS) {
      if (key === "SUPER_ADMIN" || key === "DIRECTOR") continue;
      for (const p of admin) assert.equal(grants(key, p), false, `${key} must not have ${p}`);
    }
  });
});

describe("hasPermission / hasAny", () => {
  const asSet = { permissions: new Set<string>(["finance.read", "team.read"]) };
  const asArray = { permissions: ["finance.read", "team.read"] };

  it("works with both Set and array permission holders", () => {
    for (const holder of [asSet, asArray]) {
      assert.equal(hasPermission(holder, "finance.read"), true);
      assert.equal(hasPermission(holder, "finance.write"), false);
    }
  });

  it("hasAny passes when at least one permission is held", () => {
    assert.equal(hasAny(asSet, ["finance.write", "team.read"]), true);
    assert.equal(hasAny(asArray, ["finance.write", "admin.users"]), false);
  });

  it("hasAny with no permissions listed is false", () => {
    assert.equal(hasAny(asSet, []), false);
  });

  it("resolves a role's grants end to end", () => {
    const tutor = { permissions: ROLES.TUTOR.permissions };
    assert.equal(hasAny(tutor, ["finance.read", "finance.write"]), false);
    assert.equal(hasPermission({ permissions: ROLES.SUPER_ADMIN.permissions }, "admin.users"), true);
  });
});
