/**
 * Creates a Super Admin account — or promotes an existing user to Super Admin —
 * without loading demo data. Use it to bootstrap a production database.
 *
 *   npm run admin:create -- --email you@integralacademy.co.za --name "Your Name"
 *
 * Roles, permissions and departments are synced from src/lib/rbac.ts first.
 * Without --password a strong temporary password is generated, printed once,
 * and must be changed at first sign-in.
 */
import { randomInt } from "node:crypto";
import { parseArgs } from "node:util";
import { z } from "zod";
import { zEmail } from "@/lib/validation";
import { ROLES } from "@/lib/rbac";
import { audit, diffFields } from "@/server/audit";
import { hashPassword, passwordProblems } from "@/server/auth/password";
import { db } from "@/server/db";
import { notify } from "@/server/notify";
import { syncRbac } from "../prisma/seed/rbac";

const USAGE = `Usage: npm run admin:create -- --email <email> [--name "<full name>"] [--password <password> | --reset-password]

  --email           Account email (required).
  --name            Full name. Required for a new account; renames an existing one.
  --password        Use this password (12+ characters with upper, lower, digit and symbol).
                    Prefer the generated password: arguments can end up in shell history.
  --reset-password  For an existing account: issue a new generated temporary password.

Creates the account as Super Admin, or promotes an existing account to Super Admin
(reactivating it if it was suspended). Existing passwords are kept unless --password
or --reset-password is given; setting one signs the account out everywhere.`;

class UsageError extends Error {}

function readFlags() {
  try {
    return parseArgs({
      options: {
        email: { type: "string" },
        name: { type: "string" },
        password: { type: "string" },
        "reset-password": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
}

function parseCli() {
  const values = readFlags();
  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }
  const email = zEmail.safeParse(values.email ?? "");
  if (!email.success) throw new UsageError("--email must be a valid email address.");
  const name = z.string().trim().min(2).max(100).optional().safeParse(values.name);
  if (!name.success) throw new UsageError("--name must be 2–100 characters.");
  if (values.password !== undefined && values["reset-password"]) throw new UsageError("Use either --password or --reset-password, not both.");
  if (values.password !== undefined) {
    const problems = passwordProblems(values.password);
    if (problems.length) throw new UsageError(`--password is too weak:\n  - ${problems.join("\n  - ")}`);
  }
  return { email: email.data, name: name.data, password: values.password, resetPassword: values["reset-password"] };
}

const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%*-_=+?";

/** 20 characters from a CSPRNG with every character class guaranteed (ambiguous glyphs left out). */
function generatePassword(length = 20): string {
  const pick = (set: string) => set[randomInt(set.length)];
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  const password = chars.join("");
  if (passwordProblems(password).length) throw new Error("Generated password failed the password policy.");
  return password;
}

async function main() {
  const args = parseCli();

  console.log("› Syncing roles, permissions and departments");
  await syncRbac(db);
  const role = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  const existing = await db.user.findUnique({ where: { email: args.email }, include: { role: { select: { key: true, name: true } } } });

  if (!existing) {
    if (!args.name) throw new UsageError("--name is required when creating a new account.");
    if (args.resetPassword) throw new UsageError(`No account uses ${args.email}; --reset-password only applies to existing accounts.`);
    const name = args.name;
    const password = args.password ?? generatePassword();
    const generated = args.password ? null : password;
    const passwordHash = await hashPassword(password);
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: args.email,
          name,
          passwordHash,
          roleId: role.id,
          status: "ACTIVE",
          mustChangePassword: generated !== null,
          passwordChangedAt: generated ? null : new Date(),
        },
        select: { id: true, name: true, email: true },
      });
      await audit(
        null,
        {
          action: "admin.user_created",
          module: "admin",
          entityType: "User",
          entityId: created.id,
          summary: `${created.name} was created as ${role.name} from the command line${generated ? " with a temporary password" : ""}`,
          after: { name: created.name, email: created.email, role: role.name, mustChangePassword: generated !== null },
        },
        tx,
      );
      await notify(
        {
          userIds: [created.id],
          type: "SYSTEM",
          title: "Welcome to the Integral Academy workspace",
          body: generated
            ? `Your ${role.name} account is ready. Choose a new password on your profile to get started.`
            : `Your ${role.name} account is ready.`,
          link: "/profile",
          dedupeKey: `welcome:${created.id}`,
        },
        tx,
      );
      return created;
    });
    console.log(`✓ Created ${user.name} <${user.email}> as ${role.name}`);
    printPassword(generated);
    return;
  }

  const generated = args.resetPassword ? generatePassword() : null;
  const newPassword = args.password ?? generated;
  const passwordHash = newPassword ? await hashPassword(newPassword) : null;
  const roleChanged = existing.roleId !== role.id;
  const reactivated = existing.status !== "ACTIVE";
  const renamed = args.name !== undefined && args.name !== existing.name;
  if (!roleChanged && !reactivated && !renamed && !passwordHash) {
    console.log(`✓ ${existing.name} <${existing.email}> is already an active ${role.name}; nothing to change.`);
    return;
  }

  const changes: string[] = [];
  if (roleChanged) changes.push(`role ${existing.role.name} → ${role.name}`);
  if (reactivated) changes.push(`status ${existing.status.toLowerCase()} → active`);
  if (renamed) changes.push(`renamed to ${args.name}`);
  if (passwordHash) changes.push(generated ? "temporary password issued" : "password set");

  const revoked = await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.id },
      data: {
        roleId: role.id,
        status: "ACTIVE",
        ...(renamed ? { name: args.name } : {}),
        ...(passwordHash
          ? { passwordHash, mustChangePassword: generated !== null, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null }
          : {}),
      },
    });
    // A new password signs every device out, as an admin password reset does.
    const { count } = passwordHash ? await tx.session.deleteMany({ where: { userId: existing.id } }) : { count: 0 };
    await audit(
      null,
      {
        action: roleChanged ? "admin.user_role_changed" : passwordHash ? "admin.password_reset" : "admin.user_updated",
        module: "admin",
        entityType: "User",
        entityId: existing.id,
        summary: `${existing.name}'s account was updated from the command line (${changes.join(", ")})`,
        ...diffFields(
          { name: existing.name, role: existing.role.name, status: existing.status, mustChangePassword: existing.mustChangePassword },
          {
            name: args.name ?? existing.name,
            role: role.name,
            status: "ACTIVE",
            mustChangePassword: passwordHash ? generated !== null : existing.mustChangePassword,
          },
        ),
      },
      tx,
    );
    if (roleChanged) {
      await notify(
        {
          userIds: [existing.id],
          type: "SYSTEM",
          title: `Your role is now ${role.name}`,
          body: `Your role was changed from ${existing.role.name} to ${role.name}. ${ROLES.SUPER_ADMIN.description}`,
          link: "/profile",
        },
        tx,
      );
    }
    return count;
  });
  console.log(`✓ Updated ${args.name ?? existing.name} <${existing.email}>: ${changes.join(", ")}`);
  if (revoked) console.log(`  Signed out ${revoked} session${revoked === 1 ? "" : "s"}.`);
  printPassword(generated);
}

function printPassword(generated: string | null) {
  if (!generated) return;
  console.log("");
  console.log(`  Temporary password: ${generated}`);
  console.log("  It is shown only once. Store it securely; it must be changed at first sign-in.");
}

main()
  .catch((error: unknown) => {
    if (error instanceof UsageError) {
      console.error(`✗ ${error.message}\n\n${USAGE}`);
    } else {
      console.error("✗ Failed:", error);
    }
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
