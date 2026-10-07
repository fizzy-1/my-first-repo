import type { NotificationType, Prisma, PrismaClient } from "@prisma/client";
import { formatZAR } from "../../src/lib/format";
import { APPROVAL_TYPE } from "../../src/lib/labels";
import { DAY, NOW, chance, daysAgo, demoId, int } from "./lib";
import type { UserIds } from "./people";

/** DEMO DATA — historical audit trail / activity feed and notifications. */
export async function seedActivity(db: PrismaClient, users: UserIds, learnerCount: number) {
  const people = await db.user.findMany({ where: { id: { in: Object.values(users) } }, select: { id: true, name: true } });
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const n = Object.fromEntries(Object.entries(users).map(([key, id]) => [key, nameById.get(id)!])) as Record<string, string>;
  const minutes = (d: number, m = int(30, 600)) => new Date(daysAgo(d).getTime() - m * 60_000);

  const entries: Prisma.AuditLogCreateManyInput[] = [];
  const add = (
    actor: string | null,
    module: string,
    action: string,
    entityType: string,
    summary: string,
    createdAt: Date,
    extra: Partial<Prisma.AuditLogCreateManyInput> = {},
  ) =>
    entries.push({
      id: demoId("aud"),
      actorId: actor ? users[actor] : null,
      module,
      action,
      entityType,
      summary,
      createdAt,
      feed: true,
      ipAddress: actor ? "196.25.1.10" : null,
      ...extra,
    });

  // Approval decisions and submissions (with their real numbers).
  const decided = await db.approval.findMany({
    where: { status: { in: ["APPROVED", "REJECTED", "CHANGES_REQUESTED"] } },
    include: { decisions: { include: { decider: true } } },
  });
  for (const a of decided) {
    const d = a.decisions.find((x) => x.decision !== "SUBMITTED");
    if (!d) continue;
    const verb = d.decision === "APPROVED" ? "approved" : d.decision === "REJECTED" ? "rejected" : "requested changes to";
    entries.push({
      id: demoId("aud"),
      actorId: d.deciderId,
      module: "approvals",
      action: `approval.${d.decision.toLowerCase()}`,
      entityType: "Approval",
      entityId: a.id,
      summary: `${d.decider.name} ${verb} ${APPROVAL_TYPE[a.type].label.toLowerCase()} approval #${a.number} “${a.title}”${a.amount ? ` (${formatZAR(Number(a.amount))})` : ""}`,
      before: { status: "PENDING" },
      after: { status: d.decision, comment: d.comment },
      createdAt: d.createdAt,
      feed: true,
    });
  }
  const pending = await db.approval.findMany({ where: { status: "PENDING" }, include: { requester: true } });
  for (const a of pending) {
    entries.push({
      id: demoId("aud"),
      actorId: a.requesterId,
      module: "approvals",
      action: "approval.submitted",
      entityType: "Approval",
      entityId: a.id,
      summary: `${a.requester.name} submitted ${APPROVAL_TYPE[a.type].label.toLowerCase()} approval #${a.number} “${a.title}”${a.amount ? ` for ${formatZAR(Number(a.amount))}` : ""}`,
      after: { status: "PENDING", amount: a.amount ? Number(a.amount) : null },
      createdAt: a.createdAt,
      feed: true,
    });
  }

  // Payments received from partner schools.
  const received = await db.income.findMany({
    where: { status: "RECEIVED", category: "SCHOOL_CONTRACT", receivedAt: { gte: daysAgo(30) } },
    orderBy: { receivedAt: "desc" },
    take: 4,
  });
  for (const i of received) {
    add("ayesha", "finance", "income.received", "Income", `Payment received from ${i.customer}: INV-${i.number} (${formatZAR(Number(i.amount))})`, new Date(i.receivedAt!.getTime() + 10 * 3_600_000), {
      entityId: i.id,
      before: { status: "INVOICED" },
      after: { status: "RECEIVED" },
    });
  }

  const milestone = Math.floor(learnerCount / 500) * 500;
  add(null, "intelligence", "milestone.learners", "Milestone", `Milestone: Integral Academy passed ${milestone.toLocaleString("en-US")} registered learners`, minutes(11));
  add(null, "intelligence", "integration.learner_platform_sync", "Integration", `Learner platform sync: ${int(40, 70)} subscription payments received`, minutes(0, 90));
  add(null, "intelligence", "integration.learner_platform_sync", "Integration", `Learner platform sync: ${int(40, 70)} subscription payments received`, minutes(1, 90));

  add("tshepo", "schools", "school.created", "School", `${n.tshepo} added Tembisa West Secondary to the school pipeline`, minutes(3));
  add("michael", "schools", "school.stage_changed", "School", `${n.michael} moved Highveld Girls' High School from Proposal to Negotiation`, minutes(6), { before: { stage: "PROPOSAL" }, after: { stage: "NEGOTIATION" } });
  add("johan", "schools", "school.stage_changed", "School", `${n.johan} moved Alexandra Secondary School from Contacted to Meeting`, minutes(9), { before: { stage: "CONTACTED" }, after: { stage: "MEETING" } });
  add("michael", "schools", "partnership.signed", "Partnership", `${n.michael} recorded a signed partnership with Polokwane Excellence College (R88,000/yr)`, minutes(13));
  add("johan", "marketing", "campaign.launched", "Campaign", `${n.johan} launched campaign “Matric Final Exams Countdown 2026”`, minutes(38));
  add("johan", "marketing", "campaign.updated", "Campaign", `${n.johan} changed the budget of “Matric Final Exams Countdown 2026” from R70,000 to R85,000`, minutes(12), { before: { budget: 70000 }, after: { budget: 85000 } });
  add("megan", "marketing", "campaign.metrics", "Campaign", `${n.megan} recorded weekly metrics for “Parent WhatsApp Referral Programme” (41 leads)`, minutes(2));
  add("johan", "marketing", "campaign.status_changed", "Campaign", `${n.johan} paused campaign “TikTok Maths Tips”`, minutes(15), { before: { status: "ACTIVE" }, after: { status: "PAUSED" } });
  add("ayesha", "documents", "document.uploaded", "Document", `${n.ayesha} uploaded “Q3 2026 Management Accounts”`, minutes(5));
  add("ayesha", "documents", "document.version", "Document", `${n.ayesha} uploaded version 3 of “Expense & Approvals Policy”`, minutes(9));
  add("nomvula", "documents", "document.version", "Document", `${n.nomvula} uploaded version 5 of “CAPS Coverage Tracker 2026”`, minutes(4));
  add("kagiso", "tasks", "task.completed", "Task", `${n.kagiso} completed task “CDN cache rules for video segments”`, minutes(8));
  add("megan", "tasks", "task.completed", "Task", `${n.megan} completed task “Move R10k budget from TikTok to referrals”`, minutes(3));
  add("ayesha", "tasks", "task.completed", "Task", `${n.ayesha} completed task “September month-end close”`, minutes(4));
  add("nomvula", "technology", "bug.reported", "Bug", `${n.nomvula} reported a critical bug: “Video playback stalls on Android Go devices (2 GB RAM)”`, minutes(3));
  add("pieter", "technology", "feature.status_changed", "Feature", `${n.pieter} moved “WhatsApp weekly progress reports for parents” to Testing`, minutes(7), { before: { status: "IN_PROGRESS" }, after: { status: "TESTING" } });
  add("pieter", "technology", "feature.released", "Feature", `${n.pieter} released “Exam countdown study planner”`, minutes(14));
  add("nomvula", "academic", "content.stage_changed", "ContentItem", `${n.nomvula} approved 3 Euclidean Geometry videos for publishing`, minutes(3));
  add("nomvula", "academic", "content.published", "ContentItem", `${n.nomvula} published “Differential Calculus: Past paper walkthrough (NSC Nov)”`, minutes(5));
  add("nomvula", "strategy", "objective.progress", "Objective", `${n.nomvula} updated “Publish 240 Grade 11–12 content items” (Delayed)`, minutes(6), { before: { status: "AT_RISK" }, after: { status: "DELAYED" } });
  add("sipho", "strategy", "objective.created", "Objective", `${n.sipho} created Q4 objective “Sign 4 schools for 2027”`, minutes(20));
  add("lerato", "meetings", "meeting.decision", "Meeting", `${n.lerato} recorded a decision in Weekly Executive Meeting: prioritise Euclidean Geometry content`, minutes(7));
  add("sipho", "meetings", "meeting.decision", "Meeting", `${n.sipho} recorded 3 decisions in the Q3 2026 Board Meeting`, minutes(16));

  // Non-feed security / admin events.
  for (const key of ["sipho", "michael", "lerato", "ayesha", "johan", "nomvula", "pieter"]) {
    for (let d = 0; d < 5; d++) {
      if (!chance(0.7)) continue;
      entries.push({
        id: demoId("aud"),
        actorId: users[key],
        module: "admin",
        action: "auth.login",
        entityType: "User",
        entityId: users[key],
        summary: `${n[key]} signed in`,
        createdAt: minutes(d, int(400, 700)),
        feed: false,
        ipAddress: `196.25.${int(1, 200)}.${int(1, 254)}`,
      });
    }
  }
  entries.push({
    id: demoId("aud"),
    actorId: users.sipho,
    module: "admin",
    action: "user.role_changed",
    entityType: "User",
    entityId: users.werner,
    summary: `${n.sipho} changed ${n.werner}'s role from Developer to Tutor`,
    before: { role: "DEVELOPER" },
    after: { role: "TUTOR" },
    createdAt: minutes(150),
    feed: false,
  });
  entries.push({
    id: demoId("aud"),
    actorId: users.ayesha,
    module: "finance",
    action: "expense.updated",
    entityType: "Expense",
    summary: `${n.ayesha} changed the amount of a Mux video streaming expense from R5,980.00 to R6,240.00`,
    before: { amount: 5980 },
    after: { amount: 6240 },
    createdAt: minutes(10),
    feed: false,
  });

  await db.auditLog.createMany({ data: entries });

  // ── Notifications ──
  const notes: Prisma.NotificationCreateManyInput[] = [];
  const notifyUser = (
    userId: string,
    type: NotificationType,
    title: string,
    body: string | null,
    link: string | null,
    createdAt: Date,
    read: boolean,
    dedupeKey?: string,
  ) =>
    notes.push({
      id: demoId("ntf"),
      userId,
      type,
      title,
      body,
      link,
      createdAt,
      readAt: read ? new Date(createdAt.getTime() + 3_600_000) : null,
      dedupeKey: dedupeKey ?? null,
    });

  for (const a of pending) {
    const approvers = a.approverId
      ? [a.approverId]
      : a.type === "EXPENSE" || a.type === "PURCHASE"
        ? [users.sipho, users.michael, users.lerato, users.ayesha]
        : [users.sipho, users.michael, users.lerato];
    for (const id of approvers) {
      if (id === a.requesterId) continue;
      notifyUser(
        id,
        "APPROVAL_REQUESTED",
        `Approval requested: ${a.title}`,
        `${a.requester.name} submitted a ${APPROVAL_TYPE[a.type].label.toLowerCase()} request${a.amount ? ` for ${formatZAR(Number(a.amount))}` : ""}.`,
        `/approvals/${a.id}`,
        a.createdAt,
        chance(0.3),
      );
    }
  }
  for (const a of decided) {
    const d = a.decisions.find((x) => x.decision !== "SUBMITTED");
    if (!d) continue;
    const verb = d.decision === "APPROVED" ? "approved" : d.decision === "REJECTED" ? "rejected" : "requested changes to";
    notifyUser(a.requesterId, "APPROVAL_DECIDED", `${d.decider.name} ${verb} “${a.title}”`, d.comment, `/approvals/${a.id}`, d.createdAt, d.createdAt < daysAgo(5));
  }

  const openTasks = await db.task.findMany({ where: { status: { not: "COMPLETED" }, assigneeId: { not: null } }, include: { creator: true } });
  for (const t of openTasks) {
    if (t.creatorId !== t.assigneeId) {
      notifyUser(
        t.assigneeId!,
        "TASK_ASSIGNED",
        `New task: ${t.title}`,
        `${t.creator.name} assigned you task #${t.number}${t.meetingId ? " (meeting action item)" : ""}.`,
        `/tasks/${t.id}`,
        t.createdAt,
        t.createdAt < daysAgo(7),
      );
    }
    if (t.dueDate && t.dueDate < NOW) {
      notifyUser(t.assigneeId!, "TASK_OVERDUE", `Overdue: ${t.title}`, `Task #${t.number} is past its due date.`, `/tasks/${t.id}`, new Date(t.dueDate.getTime() + DAY / 2), false, `task-overdue:${t.id}`);
    } else if (t.dueDate && t.dueDate.getTime() - NOW.getTime() < 2 * DAY) {
      notifyUser(t.assigneeId!, "DEADLINE_UPCOMING", `Due soon: ${t.title}`, `Task #${t.number} is due within 48 hours.`, `/tasks/${t.id}`, daysAgo(0), false, `task-due:${t.id}`);
    }
  }

  const upcoming = await db.meeting.findMany({ where: { startsAt: { gt: NOW } }, include: { attendees: true, organizer: true } });
  for (const m of upcoming) {
    for (const att of m.attendees) {
      if (att.userId === m.organizerId) continue;
      notifyUser(att.userId, "MEETING_INVITATION", `Meeting invitation: ${m.title}`, `${m.organizer.name} invited you.`, `/meetings/${m.id}`, daysAgo(int(1, 6)), att.response !== "PENDING");
    }
  }

  const announcements = await db.announcement.findMany({ where: { id: { startsWith: "demo_" } } });
  for (const a of announcements) {
    for (const id of Object.values(users)) notifyUser(id, "ANNOUNCEMENT", a.title, a.body, "/dashboard", a.publishedAt, a.publishedAt < daysAgo(5));
  }
  for (const key of ["sipho", "michael", "lerato"]) {
    notifyUser(users[key], "DOCUMENT_UPLOADED", "New document: Q3 2026 Management Accounts", "Uploaded by Ayesha Patel to Finance › Reports.", "/documents?category=FINANCE", daysAgo(5), false);
  }

  await db.notification.createMany({ data: notes, skipDuplicates: true });
  return { audit: entries.length, notifications: notes.length };
}
