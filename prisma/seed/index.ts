/**
 * Development seed: syncs RBAC + departments (structural) and loads a complete,
 * realistic DEMO dataset for Integral Academy. Every demo row id starts with
 * "demo_" so it can be removed later with `npm run demo:remove`.
 *
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { seedAcademic } from "./academic";
import { seedActivity } from "./activity";
import { seedDocuments } from "./documents";
import { seedFinance, seedProjections } from "./finance";
import { seedLearners } from "./learners";
import { DEMO_PREFIX } from "./lib";
import { seedMarketing } from "./marketing";
import { seedPeople, SEED_USERS } from "./people";
import { syncRbac } from "./rbac";
import { removeDemoData } from "./remove-demo";
import { seedSchools } from "./schools";
import { seedTechnology } from "./technology";
import { seedWork } from "./work";

const db = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing to load demo data in production. Set ALLOW_DEMO_SEED=true to override.");
  }
  const started = Date.now();
  console.log("› Syncing roles, permissions and departments");
  await syncRbac(db);

  if ((await db.user.count({ where: { id: { startsWith: DEMO_PREFIX } } })) > 0) {
    console.log("› Removing previous demo data");
    await removeDemoData(db);
  }

  console.log("› People");
  const { userIds, tutorProfiles, departments, password } = await seedPeople(db);
  console.log("› Schools & partnerships");
  const schools = await seedSchools(db, userIds);
  const schoolByName = new Map(schools.map((s) => [s.seed.name, s.id]));
  console.log("› Learner platform (learners, subscriptions, payments)");
  const learners = await seedLearners(db, schools);
  console.log("› Academic operations");
  await seedAcademic(db, userIds, tutorProfiles);
  console.log("› Finance");
  const finance = await seedFinance(db, userIds, departments, schools);
  console.log("› Marketing");
  const campaigns = await seedMarketing(db, userIds);
  console.log("› Product & technology");
  const tech = await seedTechnology(db, userIds);
  console.log("› Documents");
  const documents = await seedDocuments(db, userIds, schoolByName);
  console.log("› Projects, tasks, meetings, approvals, strategy");
  await seedWork(db, {
    users: userIds,
    departments,
    schools: schoolByName,
    campaigns,
    features: tech.featureIds,
    bugIds: tech.bugIds,
    documents,
    pendingExpenseIds: finance.pendingExpenseIds,
  });

  // Projections start from today's actual cash and paying learners.
  const [cash] = await db.$queryRaw<{ cash: number }[]>`
    SELECT (
      (SELECT COALESCE(SUM("openingBalance"),0) FROM "CashAccount") +
      (SELECT COALESCE(SUM("amount"),0) FROM "Payment" WHERE "status" = 'SUCCEEDED') +
      (SELECT COALESCE(SUM("amount"),0) FROM "Income" WHERE "status" = 'RECEIVED') -
      (SELECT COALESCE(SUM("amount"),0) FROM "Expense" WHERE "status" = 'PAID')
    )::float AS cash`;
  const paying = await db.subscription.count({ where: { status: { in: ["ACTIVE", "PAST_DUE"] }, source: "DIRECT", mrr: { gt: 0 } } });
  await seedProjections(db, userIds, cash.cash, paying);
  console.log(`   cash ≈ R${Math.round(cash.cash).toLocaleString("en-US")}, paying learners: ${paying}`);

  console.log("› Activity feed & notifications");
  const activity = await seedActivity(db, userIds, learners.learnerCount);
  console.log(`   audit entries: ${activity.audit}, notifications: ${activity.notifications}`);

  console.log(`\n✓ Demo data loaded in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
  console.log("Demo accounts (password: %s)", password);
  for (const u of SEED_USERS) console.log(`  ${u.role.padEnd(20)} ${u.email.padEnd(26)} ${u.name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
