import { z } from "zod";
import { formatZAR } from "@/lib/format";
import { audit } from "@/server/audit";
import { db } from "@/server/db";

/**
 * Ingestion contract for the learner-facing platform. The platform (or an ETL
 * job) POSTs batches to /api/integrations/learner-platform/sync; records are
 * upserted by their platform `externalId`, so re-sending is idempotent.
 */
const iso = z.iso.datetime({ offset: true });
const PROVINCES = [
  "EASTERN_CAPE",
  "FREE_STATE",
  "GAUTENG",
  "KWAZULU_NATAL",
  "LIMPOPO",
  "MPUMALANGA",
  "NORTH_WEST",
  "NORTHERN_CAPE",
  "WESTERN_CAPE",
] as const;

export const syncPayloadSchema = z.object({
  learners: z
    .array(
      z.object({
        externalId: z.string().min(1).max(64),
        grade: z.number().int().min(1).max(12),
        province: z.enum(PROVINCES).optional(),
        schoolEmisNumber: z.string().max(32).optional(),
        signedUpAt: iso,
        lastActiveAt: iso.optional(),
        status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      }),
    )
    .max(1000)
    .default([]),
  subscriptions: z
    .array(
      z.object({
        externalId: z.string().min(1).max(64),
        learnerExternalId: z.string().min(1).max(64),
        planCode: z.string().min(1).max(32),
        status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED"]),
        source: z.enum(["DIRECT", "SCHOOL"]).default("DIRECT"),
        schoolEmisNumber: z.string().max(32).optional(),
        startedAt: iso,
        cancelledAt: iso.optional(),
        currentPeriodEnd: iso.optional(),
        mrr: z.number().min(0).max(1_000_000),
      }),
    )
    .max(1000)
    .default([]),
  payments: z
    .array(
      z.object({
        externalId: z.string().min(1).max(64),
        learnerExternalId: z.string().min(1).max(64),
        subscriptionExternalId: z.string().max(64).optional(),
        amount: z.number().min(0).max(10_000_000),
        status: z.enum(["SUCCEEDED", "FAILED", "REFUNDED"]),
        method: z.enum(["CARD", "DEBIT_ORDER", "EFT", "PAYFAST", "CASH", "OTHER"]),
        reference: z.string().max(100).optional(),
        paidAt: iso,
      }),
    )
    .max(5000)
    .default([]),
  engagement: z
    .array(
      z.object({
        courseId: z.string().min(1).max(64),
        weekStart: z.iso.date(),
        activeLearners: z.number().int().min(0),
        lessonsCompleted: z.number().int().min(0),
        videoMinutes: z.number().int().min(0),
        quizAttempts: z.number().int().min(0),
        avgQuizScore: z.number().min(0).max(100),
      }),
    )
    .max(1000)
    .default([]),
});

export type SyncPayload = z.infer<typeof syncPayloadSchema>;

export async function syncLearnerPlatform(payload: SyncPayload) {
  const emis = [
    ...new Set([...payload.learners, ...payload.subscriptions].map((r) => r.schoolEmisNumber).filter((v): v is string => !!v)),
  ];
  const schools = emis.length
    ? await db.school.findMany({ where: { emisNumber: { in: emis } }, select: { id: true, emisNumber: true } })
    : [];
  const schoolByEmis = new Map(schools.map((s) => [s.emisNumber, s.id]));
  const plans = new Map((await db.subscriptionPlan.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]));

  const result = { learners: 0, subscriptions: 0, payments: 0, engagement: 0, skipped: [] as string[] };

  await db.$transaction(
    async (tx) => {
      for (const l of payload.learners) {
        const data = {
          grade: l.grade,
          province: l.province ?? null,
          schoolId: l.schoolEmisNumber ? (schoolByEmis.get(l.schoolEmisNumber) ?? null) : null,
          signedUpAt: new Date(l.signedUpAt),
          lastActiveAt: l.lastActiveAt ? new Date(l.lastActiveAt) : null,
          status: l.status ?? "ACTIVE",
        };
        await tx.learner.upsert({ where: { externalId: l.externalId }, create: { externalId: l.externalId, ...data }, update: data });
        result.learners++;
      }

      const learnerIds = async (externalIds: string[]) =>
        new Map(
          (await tx.learner.findMany({ where: { externalId: { in: externalIds } }, select: { id: true, externalId: true } })).map((l) => [
            l.externalId,
            l.id,
          ]),
        );

      const subLearners = await learnerIds(payload.subscriptions.map((s) => s.learnerExternalId));
      for (const s of payload.subscriptions) {
        const learnerId = subLearners.get(s.learnerExternalId);
        const planId = plans.get(s.planCode);
        if (!learnerId || !planId) {
          result.skipped.push(`subscription ${s.externalId}: unknown ${learnerId ? "plan" : "learner"}`);
          continue;
        }
        const data = {
          learnerId,
          planId,
          status: s.status,
          source: s.source,
          schoolId: s.schoolEmisNumber ? (schoolByEmis.get(s.schoolEmisNumber) ?? null) : null,
          startedAt: new Date(s.startedAt),
          cancelledAt: s.cancelledAt ? new Date(s.cancelledAt) : null,
          currentPeriodEnd: s.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null,
          mrr: s.mrr,
        };
        await tx.subscription.upsert({ where: { externalId: s.externalId }, create: { externalId: s.externalId, ...data }, update: data });
        result.subscriptions++;
      }

      const payLearners = await learnerIds(payload.payments.map((p) => p.learnerExternalId));
      const subIds = new Map(
        (
          await tx.subscription.findMany({
            where: { externalId: { in: payload.payments.map((p) => p.subscriptionExternalId).filter((v): v is string => !!v) } },
            select: { id: true, externalId: true },
          })
        ).map((s) => [s.externalId, s.id]),
      );
      for (const p of payload.payments) {
        const learnerId = payLearners.get(p.learnerExternalId);
        if (!learnerId) {
          result.skipped.push(`payment ${p.externalId}: unknown learner`);
          continue;
        }
        const data = {
          learnerId,
          subscriptionId: p.subscriptionExternalId ? (subIds.get(p.subscriptionExternalId) ?? null) : null,
          amount: p.amount,
          status: p.status,
          method: p.method,
          reference: p.reference ?? null,
          paidAt: new Date(p.paidAt),
        };
        await tx.payment.upsert({ where: { externalId: p.externalId }, create: { externalId: p.externalId, ...data }, update: data });
        result.payments++;
      }

      for (const e of payload.engagement) {
        const weekStart = new Date(`${e.weekStart}T00:00:00.000Z`);
        const data = {
          activeLearners: e.activeLearners,
          lessonsCompleted: e.lessonsCompleted,
          videoMinutes: e.videoMinutes,
          quizAttempts: e.quizAttempts,
          avgQuizScore: e.avgQuizScore,
        };
        const course = await tx.course.findUnique({ where: { id: e.courseId }, select: { id: true } });
        if (!course) {
          result.skipped.push(`engagement ${e.courseId}/${e.weekStart}: unknown course`);
          continue;
        }
        await tx.engagementSnapshot.upsert({
          where: { courseId_weekStart: { courseId: e.courseId, weekStart } },
          create: { courseId: e.courseId, weekStart, ...data },
          update: data,
        });
        result.engagement++;
      }
    },
    { timeout: 60_000 },
  );

  const received = payload.payments.filter((p) => p.status === "SUCCEEDED");
  await audit(null, {
    action: "integration.learner_platform_sync",
    module: "intelligence",
    entityType: "Integration",
    entityId: "learner-platform",
    summary:
      `Learner platform sync: ${result.learners} learners, ${result.subscriptions} subscriptions, ${result.payments} payments` +
      (received.length ? ` (${received.length} received, ${formatZAR(received.reduce((s, p) => s + p.amount, 0))})` : ""),
    after: { ...result, skipped: result.skipped.length },
    feed: received.length > 0,
  });
  return result;
}
