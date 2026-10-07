import { Prisma, type PrismaClient } from "@prisma/client";
import { dayKey, type Granularity } from "@/lib/dates";
import { sqlDate, sqlTs, toMap, tsBucketKey } from "@/server/sql";
import type { EngagementPoint, LearnerPlatformSource, LearnerSeriesPoint, LearnerSnapshot } from "./types";

/**
 * LearnerPlatformSource backed by the mirrored Learner / Subscription / Payment /
 * EngagementSnapshot tables. All aggregation happens in PostgreSQL (indexed on
 * startedAt, cancelledAt, signedUpAt, paidAt) — nothing is loaded row-by-row.
 */

// A subscription is "live" at instant T when it started before T and was not cancelled by T.
const live = (at: Prisma.Sql) => Prisma.sql`s."startedAt" <= ${at} AND (s."cancelledAt" IS NULL OR s."cancelledAt" > ${at})`;
const paid = Prisma.sql`s."source" = 'DIRECT' AND s."mrr" > 0 AND s."status" <> 'TRIALING'`;

export class PrismaLearnerPlatformSource implements LearnerPlatformSource {
  constructor(private readonly db: PrismaClient) {}

  async snapshotAt(at: Date): Promise<LearnerSnapshot> {
    const t = sqlTs(at);
    const [row] = await this.db.$queryRaw<
      { total: number; active: number; paying: number; school: number; trialing: number }[]
    >(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM "Learner" l WHERE l."signedUpAt" <= ${t})::int AS total,
        (SELECT COUNT(DISTINCT s."learnerId") FROM "Subscription" s WHERE ${live(t)})::int AS active,
        (SELECT COUNT(DISTINCT s."learnerId") FROM "Subscription" s WHERE ${live(t)} AND ${paid})::int AS paying,
        (SELECT COUNT(*) FROM "Subscription" s WHERE ${live(t)} AND s."source" = 'SCHOOL')::int AS school,
        (SELECT COUNT(*) FROM "Subscription" s WHERE ${live(t)} AND s."status" = 'TRIALING')::int AS trialing
    `);
    return {
      totalLearners: row.total,
      activeLearners: row.active,
      payingLearners: row.paying,
      schoolSponsored: row.school,
      trialing: row.trialing,
    };
  }

  async newLearners(from: Date, to: Date): Promise<number> {
    return this.db.learner.count({ where: { signedUpAt: { gte: from, lt: to } } });
  }

  async cancellations(from: Date, to: Date): Promise<number> {
    // Churn counts paid direct subscriptions only (expired trials and school seats are not churn).
    return this.db.subscription.count({
      where: { cancelledAt: { gte: from, lt: to }, source: "DIRECT", mrr: { gt: 0 } },
    });
  }

  async payingSubscriptionsAt(at: Date): Promise<number> {
    const t = sqlTs(at);
    const [row] = await this.db.$queryRaw<{ n: number }[]>(
      Prisma.sql`SELECT COUNT(*)::int AS n FROM "Subscription" s WHERE ${live(t)} AND ${paid}`,
    );
    return row.n;
  }

  async subscriptionMrrAt(at: Date): Promise<number> {
    const t = sqlTs(at);
    const [row] = await this.db.$queryRaw<{ mrr: number | null }[]>(
      Prisma.sql`SELECT COALESCE(SUM(s."mrr"), 0)::float AS mrr FROM "Subscription" s WHERE ${live(t)} AND ${paid}`,
    );
    return Number(row.mrr ?? 0);
  }

  async subscriptionRevenue(from: Date, to: Date, granularity: Granularity): Promise<Map<string, number>> {
    const rows = await this.db.$queryRaw<{ key: string; value: number }[]>(Prisma.sql`
      SELECT ${tsBucketKey('"paidAt"', granularity)} AS key, SUM("amount")::float AS value
      FROM "Payment"
      WHERE "status" = 'SUCCEEDED' AND "paidAt" >= ${sqlTs(from)} AND "paidAt" < ${sqlTs(to)}
      GROUP BY 1
    `);
    return toMap(rows);
  }

  async subscriptionRevenueTotal(from: Date, to: Date): Promise<number> {
    const result = await this.db.payment.aggregate({
      where: { status: "SUCCEEDED", paidAt: { gte: from, lt: to } },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  }

  async learnerSeries(buckets: { key: string; start: Date; end: Date }[]): Promise<LearnerSeriesPoint[]> {
    if (buckets.length === 0) return [];
    const keys = buckets.map((b) => b.key);
    const starts = buckets.map((b) => b.start.toISOString());
    const ends = buckets.map((b) => b.end.toISOString());
    const rows = await this.db.$queryRaw<
      { key: string; total: number; active: number; paying: number; new: number; churned: number }[]
    >(Prisma.sql`
      WITH b AS (
        SELECT key, (s::timestamptz AT TIME ZONE 'UTC') AS s, (e::timestamptz AT TIME ZONE 'UTC') AS e, ord
        FROM unnest(${keys}::text[], ${starts}::text[], ${ends}::text[]) WITH ORDINALITY AS t(key, s, e, ord)
      )
      SELECT b.key,
        (SELECT COUNT(*) FROM "Learner" l WHERE l."signedUpAt" < b.e)::int AS total,
        (SELECT COUNT(DISTINCT s."learnerId") FROM "Subscription" s
           WHERE s."startedAt" < b.e AND (s."cancelledAt" IS NULL OR s."cancelledAt" >= b.e))::int AS active,
        (SELECT COUNT(DISTINCT s."learnerId") FROM "Subscription" s
           WHERE s."startedAt" < b.e AND (s."cancelledAt" IS NULL OR s."cancelledAt" >= b.e) AND ${paid})::int AS paying,
        (SELECT COUNT(*) FROM "Learner" l WHERE l."signedUpAt" >= b.s AND l."signedUpAt" < b.e)::int AS new,
        (SELECT COUNT(*) FROM "Subscription" s
           WHERE s."cancelledAt" >= b.s AND s."cancelledAt" < b.e AND s."source" = 'DIRECT' AND s."mrr" > 0)::int AS churned
      FROM b ORDER BY b.ord
    `);
    return rows.map((r) => ({
      key: r.key,
      totalLearners: r.total,
      activeLearners: r.active,
      payingLearners: r.paying,
      newLearners: r.new,
      churned: r.churned,
    }));
  }

  async engagementSeries(from: Date, to: Date, courseId?: string): Promise<EngagementPoint[]> {
    const rows = await this.db.$queryRaw<
      { week: Date; active: number; lessons: number; minutes: number; quizzes: number; score: number | null }[]
    >(Prisma.sql`
      SELECT "weekStart" AS week,
        SUM("activeLearners")::int AS active,
        SUM("lessonsCompleted")::int AS lessons,
        SUM("videoMinutes")::int AS minutes,
        SUM("quizAttempts")::int AS quizzes,
        (SUM("avgQuizScore" * "quizAttempts") / NULLIF(SUM("quizAttempts"), 0))::float AS score
      FROM "EngagementSnapshot"
      WHERE "weekStart" >= ${sqlDate(from)} AND "weekStart" < ${sqlDate(to)}
        ${courseId ? Prisma.sql`AND "courseId" = ${courseId}` : Prisma.empty}
      GROUP BY "weekStart" ORDER BY "weekStart"
    `);
    return rows.map((r) => ({
      key: dayKey(r.week),
      activeLearners: r.active,
      lessonsCompleted: r.lessons,
      videoMinutes: r.minutes,
      quizAttempts: r.quizzes,
      avgQuizScore: Math.round(Number(r.score ?? 0) * 10) / 10,
    }));
  }

  async learnersByProvince() {
    const rows = await this.db.learner.groupBy({ by: ["province"], _count: true, orderBy: { _count: { province: "desc" } } });
    return rows.map((r) => ({ province: r.province, count: r._count }));
  }

  async planMix(at: Date) {
    const t = sqlTs(at);
    const rows = await this.db.$queryRaw<{ plan: string; subscriptions: number; mrr: number }[]>(Prisma.sql`
      SELECT p."name" AS plan, COUNT(*)::int AS subscriptions, COALESCE(SUM(s."mrr"), 0)::float AS mrr
      FROM "Subscription" s JOIN "SubscriptionPlan" p ON p."id" = s."planId"
      WHERE ${live(t)}
      GROUP BY p."name" ORDER BY subscriptions DESC
    `);
    return rows;
  }
}
