/**
 * Runs the deadline sweep once from a server shell and prints its summary —
 * the same job as POST /api/cron/deadlines, for schedulers that run commands
 * (system cron, Kubernetes CronJob) rather than call URLs.
 *
 *   npm run jobs:deadlines            # human-readable summary
 *   npm run jobs:deadlines -- --json  # machine-readable summary
 */
import { parseArgs } from "node:util";
import { db } from "@/server/db";
import { APPROVAL_WAIT_DAYS, DUE_SOON_HOURS } from "@/server/jobs/deadline-rules";
import { runDeadlineSweep, type SweepCount } from "@/server/jobs/deadlines";

const USAGE = "Usage: npm run jobs:deadlines [-- --json]";

async function main() {
  let json: boolean;
  try {
    json = parseArgs({ options: { json: { type: "boolean", default: false } }, strict: true }).values.json;
  } catch (error) {
    console.error(`✗ ${(error as Error).message}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  const summary = await runDeadlineSweep();
  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  const row = (label: string, c: SweepCount) => `  ${label.padEnd(24)}${String(c.matched).padStart(5)} matched  ${String(c.notified).padStart(5)} notified`;
  console.log(`Deadline sweep at ${summary.ranAt} (${summary.durationMs} ms)`);
  console.log(row("Overdue tasks", summary.tasksOverdue));
  console.log(row(`Tasks due within ${DUE_SOON_HOURS}h`, summary.tasksDueSoon));
  console.log(row("School follow-ups", summary.schoolFollowUps));
  console.log(row(`Approvals waiting > ${APPROVAL_WAIT_DAYS}d`, summary.approvalsWaiting));
  console.log(row("Partnership renewals", summary.partnershipRenewals));
  console.log(`  ${"Invoices marked overdue".padEnd(24)}${String(summary.invoicesMarkedOverdue).padStart(5)}`);
  console.log(`  ${"Notifications created".padEnd(24)}${String(summary.notificationsCreated).padStart(5)}`);
}

main()
  .catch((error: unknown) => {
    console.error("✗ Deadline sweep failed:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
