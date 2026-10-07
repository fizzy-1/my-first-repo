import type { ContentStage, ContentType, Priority, PrismaClient, TutorActivity } from "@prisma/client";
import { startOfWeek } from "../../src/lib/dates";
import { NOW, DAY, between, chance, dateOffset, daysAgo, demoId, int, pick, round, weighted } from "./lib";
import type { UserIds } from "./people";

/** DEMO DATA — CAPS-aligned courses, content pipeline, engagement and tutor hours. */
const COURSES = [
  {
    key: "gr12maths",
    title: "Grade 12 Mathematics",
    subject: "Mathematics",
    grade: 12,
    status: "ACTIVE" as const,
    lead: "nomvula",
    tutors: ["bongani", "fatima", "nomvula"],
    publishedShare: 0.86,
    itemsPerTopic: 9,
    topics: [
      ["Number Patterns, Sequences & Series", 1],
      ["Functions & Inverse Functions", 1],
      ["Exponential & Logarithmic Functions", 1],
      ["Finance, Growth & Decay", 1],
      ["Compound & Double Angle Identities", 2],
      ["Trigonometry in 2D & 3D", 2],
      ["Polynomials & the Factor Theorem", 2],
      ["Differential Calculus", 3],
      ["Analytical Geometry: Circles", 3],
      ["Euclidean Geometry: Proportion & Similarity", 3],
      ["Statistics: Regression & Correlation", 3],
      ["Counting Principle & Probability", 3],
    ] as [string, number][],
    engagement: [380, 790],
  },
  {
    key: "gr11maths",
    title: "Grade 11 Mathematics",
    subject: "Mathematics",
    grade: 11,
    status: "ACTIVE" as const,
    lead: "lindiwe",
    tutors: ["lindiwe", "fatima"],
    publishedShare: 0.5,
    itemsPerTopic: 5,
    topics: [
      ["Exponents & Surds", 1],
      ["Equations & Inequalities", 1],
      ["Number Patterns", 1],
      ["Analytical Geometry", 2],
      ["Functions", 2],
      ["Trigonometry", 2],
      ["Measurement", 3],
      ["Euclidean Geometry: Circle Theorems", 3],
      ["Finance, Growth & Decay", 3],
      ["Probability", 4],
      ["Statistics", 4],
    ] as [string, number][],
    engagement: [70, 170],
  },
  {
    key: "gr12lit",
    title: "Grade 12 Mathematical Literacy",
    subject: "Mathematical Literacy",
    grade: 12,
    status: "ACTIVE" as const,
    lead: "precious",
    tutors: ["precious"],
    publishedShare: 0.6,
    itemsPerTopic: 5,
    topics: [
      ["Finance", 1],
      ["Measurement", 2],
      ["Maps, Plans & Other Representations", 2],
      ["Data Handling", 3],
      ["Probability", 3],
    ] as [string, number][],
    engagement: [30, 95],
  },
  {
    key: "gr12phys",
    title: "Grade 12 Physical Sciences",
    subject: "Physical Sciences",
    grade: 12,
    status: "DRAFT" as const,
    lead: "werner",
    tutors: ["werner"],
    publishedShare: 0,
    itemsPerTopic: 3,
    topics: [
      ["Momentum & Impulse", 1],
      ["Vertical Projectile Motion", 1],
      ["Organic Chemistry", 1],
      ["Work, Energy & Power", 2],
      ["Rates of Reaction", 2],
      ["Chemical Equilibrium", 2],
      ["Acids & Bases", 3],
      ["Electrochemistry", 3],
      ["Electric Circuits", 3],
      ["Photoelectric Effect", 3],
    ] as [string, number][],
    engagement: null,
  },
];

const ITEM_TEMPLATES: [ContentType, string][] = [
  ["VIDEO", "Concept explainer"],
  ["VIDEO", "Worked examples"],
  ["LESSON", "Guided lesson"],
  ["WORKSHEET", "Practice worksheet"],
  ["QUIZ", "Topic quiz"],
  ["PAST_PAPER_MEMO", "Past paper walkthrough (NSC Nov)"],
  ["VIDEO", "Exam technique"],
  ["RESOURCE", "Summary sheet"],
  ["QUIZ", "Challenge questions"],
];

const UNPUBLISHED_STAGES: [ContentStage, number][] = [
  ["IDEA", 2],
  ["PLANNED", 3],
  ["RECORDING", 3],
  ["EDITING", 3],
  ["REVIEW", 3],
  ["APPROVED", 1],
];

export async function seedAcademic(db: PrismaClient, users: UserIds, tutorProfiles: Record<string, string>) {
  const courseIds: Record<string, string> = {};
  const contentIds: { id: string; assignee: string | null }[] = [];

  for (const c of COURSES) {
    const courseId = demoId("crs");
    courseIds[c.key] = courseId;
    await db.course.create({
      data: {
        id: courseId,
        title: c.title,
        subject: c.subject,
        grade: c.grade,
        status: c.status,
        leadTutorId: users[c.lead],
        description: `CAPS-aligned ${c.title} campus: video lessons, worked examples, past paper practice and topic quizzes.`,
      },
    });

    for (const [ti, [topicTitle, term]] of c.topics.entries()) {
      const topicId = demoId("top");
      await db.topic.create({ data: { id: topicId, courseId, title: topicTitle, capsTerm: term, sortOrder: ti } });

      const lessonCount = c.status === "DRAFT" ? 2 : int(3, 5);
      const lessonIds: string[] = [];
      for (let li = 0; li < lessonCount; li++) {
        const id = demoId("les");
        lessonIds.push(id);
        const published = c.status !== "DRAFT" && chance(c.publishedShare + 0.1);
        await db.lesson.create({
          data: {
            id,
            topicId,
            title: `${topicTitle} — Part ${li + 1}`,
            sortOrder: li,
            status: published ? "PUBLISHED" : "DRAFT",
            durationMinutes: int(12, 35),
            publishedAt: published ? daysAgo(int(20, 480)) : null,
          },
        });
      }

      for (let ii = 0; ii < c.itemsPerTopic; ii++) {
        const [type, label] = ITEM_TEMPLATES[ii % ITEM_TEMPLATES.length];
        const published = chance(c.publishedShare);
        const stage: ContentStage = published ? "PUBLISHED" : c.status === "DRAFT" ? weighted([["IDEA", 4], ["PLANNED", 4], ["RECORDING", 2]] as const) : weighted(UNPUBLISHED_STAGES);
        const assigneeKey = pick(c.tutors);
        const id = demoId("cnt");
        // Published this month for a handful, otherwise spread across the past 18 months.
        const publishedAt = published ? (chance(0.07) ? daysAgo(int(0, 6)) : daysAgo(int(10, 540))) : null;
        const dueOffset = stage === "PUBLISHED" ? null : stage === "IDEA" ? null : int(-12, 35);
        await db.contentItem.create({
          data: {
            id,
            title: `${topicTitle}: ${label}`,
            type,
            stage,
            priority: weighted([["LOW", 2], ["MEDIUM", 5], ["HIGH", 3], ["CRITICAL", 0.5]] as [Priority, number][]),
            courseId,
            topicId,
            lessonId: type === "VIDEO" || type === "LESSON" ? pick(lessonIds) : null,
            assigneeId: users[assigneeKey],
            reviewerId: users.nomvula,
            dueDate: dueOffset === null ? null : dateOffset(dueOffset),
            publishedAt,
            estimatedHours: round(between(2, 10), 0.5),
            stageChangedAt: publishedAt ?? daysAgo(int(1, 30)),
            notes: stage === "REVIEW" ? "Check notation against the CAPS examination guidelines before approval." : null,
          },
        });
        contentIds.push({ id, assignee: assigneeKey });
      }
    }

    if (c.engagement) {
      const [from, to] = c.engagement;
      const weeks = 30;
      const thisWeek = startOfWeek(NOW);
      for (let w = weeks; w >= 1; w--) {
        const weekStart = new Date(thisWeek.getTime() - w * 7 * DAY + 2 * 3_600_000);
        const progress = (weeks - w) / weeks;
        const examBump = w <= 6 && c.grade === 12 ? 1 + (6 - w) * 0.05 : 1;
        const active = Math.round((from + (to - from) * progress) * examBump * between(0.94, 1.06));
        await db.engagementSnapshot.create({
          data: {
            id: demoId("eng"),
            courseId,
            weekStart: new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate())),
            activeLearners: active,
            lessonsCompleted: Math.round(active * between(2.8, 3.6)),
            videoMinutes: Math.round(active * between(42, 58)),
            quizAttempts: Math.round(active * between(1.5, 2.2)),
            avgQuizScore: round(between(52, 58) + progress * 7, 0.1),
          },
        });
      }
    }
  }

  // Tutor hours for the last 10 weeks.
  const activities: [TutorActivity, number][] = [
    ["RECORDING", 4],
    ["EDITING", 2],
    ["LIVE_SESSION", 3],
    ["MARKING", 2],
    ["PREPARATION", 3],
    ["REVIEW", 1],
    ["ADMIN", 1],
  ];
  for (const [key, profileId] of Object.entries(tutorProfiles)) {
    if (key === "werner" || key === "nomvula") continue;
    const own = contentIds.filter((c) => c.assignee === key);
    for (let d = 70; d >= 0; d--) {
      const day = dateOffset(-d);
      const weekday = day.getUTCDay();
      if (weekday === 0 || !chance(weekday === 6 ? 0.2 : 0.55)) continue;
      const activity = weighted(activities);
      await db.tutorTimeEntry.create({
        data: {
          id: demoId("tte"),
          tutorId: profileId,
          date: day,
          hours: round(between(1.5, 5.5), 0.5),
          activity,
          contentItemId: own.length && (activity === "RECORDING" || activity === "EDITING") ? pick(own).id : null,
          description:
            activity === "LIVE_SESSION"
              ? "Evening live revision class"
              : activity === "MARKING"
                ? "Marked learner submissions and gave feedback"
                : activity === "PREPARATION"
                  ? "Prepared worked examples and slides"
                  : null,
          status: d > 14 ? (chance(0.03) ? "REJECTED" : "APPROVED") : "SUBMITTED",
          approvedById: d > 14 ? users.nomvula : null,
        },
      });
    }
  }
  // Werner (new Physical Sciences tutor) logs prep work.
  for (let d = 30; d >= 0; d -= 3) {
    await db.tutorTimeEntry.create({
      data: {
        id: demoId("tte"),
        tutorId: tutorProfiles.werner,
        date: dateOffset(-d),
        hours: round(between(2, 4), 0.5),
        activity: "PREPARATION",
        description: "Physical Sciences course scripting",
        status: d > 14 ? "APPROVED" : "SUBMITTED",
        approvedById: d > 14 ? users.nomvula : null,
      },
    });
  }

  return { courseIds, contentIds };
}
