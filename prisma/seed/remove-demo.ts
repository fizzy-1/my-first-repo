/**
 * Removes every seeded demo row (ids prefixed "demo_") and the demo files in
 * storage, leaving real data, roles, permissions, departments and plans intact.
 *
 *   npm run demo:remove
 *
 * Audit entries written by demo users are removed with them. If real records
 * reference demo users (e.g. a real task created by a demo account), reassign
 * them first — the script stops with a foreign-key error rather than deleting
 * real data.
 */
import { PrismaClient } from "@prisma/client";
import { storage } from "../../src/server/storage";
import { DEMO_PREFIX } from "./lib";

const demo = { startsWith: DEMO_PREFIX };

export async function removeDemoData(db: PrismaClient) {
  const demoUsers = (await db.user.findMany({ where: { id: demo }, select: { id: true } })).map((u) => u.id);
  const byDemoUser = { in: demoUsers };

  const versions = await db.documentVersion.findMany({ where: { OR: [{ id: demo }, { documentId: demo }] }, select: { storageKey: true } });

  const steps: [string, () => Promise<{ count: number }>][] = [
    ["notifications", () => db.notification.deleteMany({ where: { OR: [{ id: demo }, { userId: byDemoUser }] } })],
    ["audit entries", () => db.auditLog.deleteMany({ where: { OR: [{ id: demo }, { actorId: byDemoUser }, { entityId: demo }] } })],
    ["sessions", () => db.session.deleteMany({ where: { userId: byDemoUser } })],
    ["login attempts", () => db.loginAttempt.deleteMany({ where: { email: { endsWith: "@integral.demo" } } })],
    ["dashboard preferences", () => db.dashboardPreference.deleteMany({ where: { userId: byDemoUser } })],
    ["approval decisions", () => db.approvalDecision.deleteMany({ where: { OR: [{ id: demo }, { approvalId: demo }] } })],
    ["approvals", () => db.approval.deleteMany({ where: { id: demo } })],
    ["task attachments", () => db.taskAttachment.deleteMany({ where: { OR: [{ taskId: demo }, { documentId: demo }] } })],
    ["tasks", () => db.task.deleteMany({ where: { id: demo } })],
    ["meeting decisions", () => db.meetingDecision.deleteMany({ where: { OR: [{ id: demo }, { meetingId: demo }] } })],
    ["meeting attendees", () => db.meetingAttendee.deleteMany({ where: { OR: [{ meetingId: demo }, { userId: byDemoUser }] } })],
    ["meetings", () => db.meeting.deleteMany({ where: { id: demo } })],
    ["objective updates", () => db.objectiveUpdate.deleteMany({ where: { OR: [{ id: demo }, { objectiveId: demo }] } })],
    ["objective links", () => db.objective.updateMany({ where: { id: demo }, data: { parentId: null } })],
    ["objectives", () => db.objective.deleteMany({ where: { id: demo } })],
    ["announcements", () => db.announcement.deleteMany({ where: { id: demo } })],
    ["document grants", () => db.documentAccessGrant.deleteMany({ where: { OR: [{ documentId: demo }, { userId: byDemoUser }] } })],
    ["document tags", () => db.documentTag.deleteMany({ where: { documentId: demo } })],
    ["document versions", () => db.documentVersion.deleteMany({ where: { OR: [{ id: demo }, { documentId: demo }] } })],
    ["partnership contract links", () => db.partnership.updateMany({ where: { contractDocumentId: demo }, data: { contractDocumentId: null } })],
    ["expense document links", () => db.expense.updateMany({ where: { documentId: demo }, data: { documentId: null } })],
    ["documents", () => db.document.deleteMany({ where: { id: demo } })],
    ["tags", () => db.tag.deleteMany({ where: { id: demo, documents: { none: {} } } })],
    ["folders", () => db.documentFolder.deleteMany({ where: { id: demo, documents: { none: {} } } })],
    ["campaign metrics", () => db.campaignMetric.deleteMany({ where: { OR: [{ id: demo }, { campaignId: demo }] } })],
    ["campaign members", () => db.campaignMember.deleteMany({ where: { OR: [{ campaignId: demo }, { userId: byDemoUser }] } })],
    ["campaigns", () => db.campaign.deleteMany({ where: { id: demo } })],
    ["tutor time entries", () => db.tutorTimeEntry.deleteMany({ where: { OR: [{ id: demo }, { tutorId: demo }] } })],
    ["content items", () => db.contentItem.deleteMany({ where: { id: demo } })],
    ["engagement snapshots", () => db.engagementSnapshot.deleteMany({ where: { OR: [{ id: demo }, { courseId: demo }] } })],
    ["lessons", () => db.lesson.deleteMany({ where: { id: demo } })],
    ["topics", () => db.topic.deleteMany({ where: { id: demo } })],
    ["courses", () => db.course.deleteMany({ where: { id: demo } })],
    ["tutor profiles", () => db.tutorProfile.deleteMany({ where: { id: demo } })],
    ["bugs", () => db.bug.deleteMany({ where: { id: demo } })],
    ["features", () => db.feature.deleteMany({ where: { id: demo } })],
    ["projects", () => db.project.deleteMany({ where: { id: demo } })],
    ["payments", () => db.payment.deleteMany({ where: { id: demo } })],
    ["subscriptions", () => db.subscription.deleteMany({ where: { id: demo } })],
    ["learners", () => db.learner.deleteMany({ where: { id: demo } })],
    ["income", () => db.income.deleteMany({ where: { id: demo } })],
    ["expenses", () => db.expense.deleteMany({ where: { id: demo } })],
    ["budget lines", () => db.budgetLine.deleteMany({ where: { OR: [{ id: demo }, { budgetId: demo }] } })],
    ["budgets", () => db.budget.deleteMany({ where: { id: demo } })],
    ["projections", () => db.financialProjection.deleteMany({ where: { id: demo } })],
    ["cash accounts", () => db.cashAccount.deleteMany({ where: { id: demo } })],
    ["school notes", () => db.schoolNote.deleteMany({ where: { OR: [{ id: demo }, { schoolId: demo }] } })],
    ["school contacts", () => db.schoolContact.deleteMany({ where: { OR: [{ id: demo }, { schoolId: demo }] } })],
    ["partnerships", () => db.partnership.deleteMany({ where: { OR: [{ id: demo }, { schoolId: demo }] } })],
    ["schools", () => db.school.deleteMany({ where: { id: demo } })],
    ["manager links", () => db.user.updateMany({ where: { managerId: byDemoUser }, data: { managerId: null } })],
    ["users", () => db.user.deleteMany({ where: { id: demo } })],
  ];

  for (const [label, run] of steps) {
    const { count } = await run();
    if (count) console.log(`   removed ${count} ${label}`);
  }
  let files = 0;
  for (const v of versions) {
    await storage().delete(v.storageKey).catch(() => undefined);
    files++;
  }
  if (files) console.log(`   removed ${files} stored files`);
}

if (process.argv[1]?.includes("remove-demo")) {
  const db = new PrismaClient();
  console.log("Removing demo data (ids prefixed demo_)…");
  removeDemoData(db)
    .then(() => console.log("Done. Real data, roles, permissions and departments were kept."))
    .catch((error) => {
      console.error("Demo removal stopped:", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
