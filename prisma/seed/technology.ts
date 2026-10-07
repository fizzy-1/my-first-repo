import type { BugSeverity, BugStatus, FeatureStatus, Priority, PrismaClient } from "@prisma/client";
import { dateOffset, daysAgo, demoId, int, pick } from "./lib";
import type { UserIds } from "./people";

/** DEMO DATA — product roadmap and bug tracker. */
const FEATURES: [string, string, Priority, FeatureStatus, string, number | null][] = [
  ["Offline video downloads for low-data learners", "Let learners download lessons on Wi-Fi and watch offline, with DRM-protected storage.", "CRITICAL", "IN_PROGRESS", "kagiso", 21],
  ["WhatsApp weekly progress reports for parents", "Automated WhatsApp summaries of time spent, quiz scores and weak topics.", "HIGH", "TESTING", "ruan", 9],
  ["Video start time under 2 seconds", "Adaptive bitrate tuning and CDN edge caching for South African ISPs.", "HIGH", "TESTING", "kagiso", 12],
  ["Live revision classes (streaming)", "Scheduled live classes with chat and recordings for Premium learners.", "HIGH", "IN_PROGRESS", "zanele", 34],
  ["School admin dashboard", "Partner schools see class-level progress, attendance and topic mastery.", "HIGH", "PLANNED", "ruan", 70],
  ["AI step-by-step hints", "Guided hints on worked problems that never reveal the full answer at once.", "MEDIUM", "PLANNED", "pieter", 110],
  ["Teacher assignment tool", "Teachers assign topics and quizzes to their classes.", "MEDIUM", "PLANNED", "ruan", 95],
  ["Zero-rated data partnership integration", "Integrate with mobile networks' zero-rated education portals.", "HIGH", "BACKLOG", "pieter", null],
  ["isiZulu & Sesotho maths glossary", "Bilingual terminology glossary linked from lessons.", "MEDIUM", "BACKLOG", "pieter", null],
  ["Past paper practice mode with memos", "Timed NSC past paper practice with marking memos.", "HIGH", "RELEASED", "kagiso", -60],
  ["Debit order & payment retries", "Debit order support and smart retries for failed card payments.", "CRITICAL", "RELEASED", "ruan", -120],
  ["Learning streaks & badges", "Gamified streaks to encourage daily practice.", "LOW", "RELEASED", "zanele", -30],
  ["POPIA consent & data export", "Consent capture and self-service data export for learners and parents.", "CRITICAL", "RELEASED", "kagiso", -200],
  ["Exam countdown study planner", "Personalised revision plan counting down to each NSC paper.", "MEDIUM", "RELEASED", "zanele", -14],
];

const BUGS: [string, BugSeverity, BugStatus, string, string | null, string][] = [
  ["Video playback stalls on Android Go devices (2 GB RAM)", "CRITICAL", "OPEN", "nomvula", "zanele", "Android app 3.4.1"],
  ["PayFast webhook occasionally creates duplicate payment records", "HIGH", "IN_PROGRESS", "ayesha", "ruan", "Production"],
  ["Quiz timer keeps running after app is backgrounded", "HIGH", "OPEN", "bongani", "zanele", "Android & iOS"],
  ["Calculus lesson 4 shows wrong worked example image", "MEDIUM", "OPEN", "fatima", null, "Web"],
  ["Password reset email lands in spam for Telkom addresses", "MEDIUM", "IN_PROGRESS", "lerato", "kagiso", "Email"],
  ["Progress chart shows 0% for learners who switched plans", "HIGH", "OPEN", "nomvula", "ruan", "Web"],
  ["Downloaded videos fail to play after app update", "CRITICAL", "IN_PROGRESS", "pieter", "kagiso", "Android app 3.4.0"],
  ["Search returns no results for 'trig' abbreviations", "LOW", "OPEN", "megan", null, "Web"],
  ["Dark mode contrast too low on quiz answer options", "LOW", "OPEN", "pieter", null, "Web"],
  ["Annual plan renewal email sent twice", "MEDIUM", "RESOLVED", "ayesha", "ruan", "Email"],
  ["Live class chat freezes with >150 participants", "HIGH", "OPEN", "nomvula", "zanele", "Web"],
  ["Certificate PDF has misaligned learner name", "LOW", "RESOLVED", "lindiwe", "zanele", "Web"],
  ["Login loop on Safari when third-party cookies blocked", "HIGH", "RESOLVED", "johan", "kagiso", "Safari 17"],
  ["Topic quiz scores not saved on poor connections", "HIGH", "CLOSED", "bongani", "ruan", "Android"],
  ["Geometry diagrams render blurry on tablets", "MEDIUM", "CLOSED", "fatima", "zanele", "iPad"],
  ["Referral codes not applied at checkout", "MEDIUM", "RESOLVED", "megan", "ruan", "Web"],
  ["School dashboard export missing Grade 11 classes", "MEDIUM", "OPEN", "michael", null, "Web"],
  ["Subtitles out of sync on Finance lesson videos", "LOW", "OPEN", "precious", null, "Web"],
];

export async function seedTechnology(db: PrismaClient, users: UserIds) {
  const featureIds: Record<string, string> = {};
  for (const [title, description, priority, status, owner, offset] of FEATURES) {
    const id = demoId("ftr");
    featureIds[title] = id;
    await db.feature.create({
      data: {
        id,
        title,
        description,
        priority,
        status,
        ownerId: users[owner],
        targetDate: offset === null ? null : dateOffset(offset),
        releasedAt: status === "RELEASED" && offset !== null ? daysAgo(-offset) : null,
        createdAt: daysAgo(int(40, 300)),
      },
    });
  }
  const bugIds: string[] = [];
  for (const [title, severity, status, reporter, assignee, environment] of BUGS) {
    const id = demoId("bug");
    bugIds.push(id);
    const reportedAt = daysAgo(severity === "CRITICAL" ? int(1, 6) : int(2, 60));
    await db.bug.create({
      data: {
        id,
        title,
        severity,
        status,
        environment,
        description: `Steps to reproduce, expected and actual behaviour recorded by ${reporter}.`,
        reporterId: users[reporter],
        assigneeId: assignee ? users[assignee] : null,
        featureId: title.includes("video") || title.includes("Downloaded") ? featureIds["Offline video downloads for low-data learners"] : title.includes("Live class") ? featureIds["Live revision classes (streaming)"] : null,
        reportedAt,
        resolvedAt: status === "RESOLVED" || status === "CLOSED" ? new Date(reportedAt.getTime() + int(1, 10) * 86_400_000) : null,
      },
    });
  }
  void pick;
  return { featureIds, bugIds };
}
