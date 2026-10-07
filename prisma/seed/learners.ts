import type { PaymentMethod, PrismaClient, Province, SubscriptionStatus } from "@prisma/client";
import { addMonths } from "../../src/lib/dates";
import { NOW, DAY, between, chance, chunk, demoId, int, monthStartDate, rand, weighted } from "./lib";

/**
 * DEMO DATA — simulated learner-platform read-model (normally synced from the
 * learner-facing platform via /api/integrations/learner-platform/sync).
 */
const PLANS = [
  { code: "MONTHLY", name: "Matric Maths Monthly", interval: "MONTHLY" as const, price: 149, monthly: 149 },
  { code: "ANNUAL", name: "Matric Maths Annual", interval: "ANNUAL" as const, price: 1490, monthly: 124.17 },
  { code: "PREMIUM", name: "Premium (with live classes)", interval: "MONTHLY" as const, price: 249, monthly: 249 },
  { code: "SCHOOL_SEAT", name: "School partnership seat", interval: "ANNUAL" as const, price: 0, monthly: 0 },
];

const PROVINCES: [Province, number][] = [
  ["GAUTENG", 35],
  ["KWAZULU_NATAL", 18],
  ["WESTERN_CAPE", 13],
  ["EASTERN_CAPE", 9],
  ["LIMPOPO", 7],
  ["MPUMALANGA", 6],
  ["NORTH_WEST", 5],
  ["FREE_STATE", 5],
  ["NORTHERN_CAPE", 2],
];

/** Sign-up seasonality by calendar month (school year starts in January; finals in Oct–Nov). */
const SEASON = [1.6, 1.5, 1.2, 0.95, 1.0, 1.25, 1.1, 1.3, 1.5, 1.45, 0.6, 0.35];

const METHODS: [PaymentMethod, number][] = [
  ["CARD", 50],
  ["DEBIT_ORDER", 28],
  ["PAYFAST", 17],
  ["EFT", 5],
];

export interface LearnerSeedResult {
  learnerCount: number;
  activeCourseLearners: number;
}

export async function seedLearners(
  db: PrismaClient,
  schools: { id: string; seed: { province: Province; partnership?: { status: string; startMonthsAgo: number; months: number; covered: number } } }[],
): Promise<LearnerSeedResult> {
  for (const p of PLANS) {
    await db.subscriptionPlan.upsert({
      where: { code: p.code },
      create: { code: p.code, name: p.name, interval: p.interval, price: p.price, monthlyEquivalent: p.monthly },
      update: { name: p.name, price: p.price, monthlyEquivalent: p.monthly },
    });
  }
  const planIds = new Map((await db.subscriptionPlan.findMany()).map((p) => [p.code, p.id]));

  const learners: {
    id: string;
    externalId: string;
    grade: number;
    province: Province;
    schoolId: string | null;
    signedUpAt: Date;
    lastActiveAt: Date | null;
    status: "ACTIVE" | "INACTIVE";
  }[] = [];
  const subs: {
    id: string;
    externalId: string;
    learnerId: string;
    planId: string;
    status: SubscriptionStatus;
    source: "DIRECT" | "SCHOOL";
    schoolId: string | null;
    startedAt: Date;
    cancelledAt: Date | null;
    currentPeriodEnd: Date | null;
    mrr: number;
  }[] = [];
  const payments: {
    id: string;
    externalId: string;
    learnerId: string;
    subscriptionId: string;
    amount: number;
    status: "SUCCEEDED" | "FAILED";
    method: PaymentMethod;
    reference: string;
    paidAt: Date;
  }[] = [];

  const MONTHS = 20;
  let seq = 0;
  const nextExternal = (prefix: string) => `${prefix}-${(++seq).toString().padStart(6, "0")}`;

  // ── Direct (self-signup) learners ──
  for (let m = MONTHS; m >= 0; m--) {
    const monthStart = monthStartDate(m);
    const monthEnd = monthStartDate(m - 1);
    const calMonth = monthStart.getUTCMonth();
    const age = MONTHS - m;
    let count = Math.round(40 * Math.pow(1.11, age) * SEASON[calMonth] * between(0.9, 1.1));
    const span = Math.min(monthEnd.getTime(), NOW.getTime()) - monthStart.getTime();
    if (m === 0) count = Math.round(count * (span / (monthEnd.getTime() - monthStart.getTime())));

    for (let i = 0; i < count; i++) {
      const signedUpAt = new Date(monthStart.getTime() + rand() * span);
      const grade = weighted([
        [12, 70],
        [11, 20],
        [10, 10],
      ] as const);
      const id = demoId("lrn");
      const learner = {
        id,
        externalId: nextExternal("LP"),
        grade,
        province: weighted(PROVINCES),
        schoolId: null as string | null,
        signedUpAt,
        lastActiveAt: null as Date | null,
        status: "INACTIVE" as "ACTIVE" | "INACTIVE",
      };
      learners.push(learner);

      if (!chance(0.71)) {
        learner.lastActiveAt = new Date(signedUpAt.getTime() + between(0, 10) * DAY);
        continue;
      }
      const planCode = weighted([
        ["MONTHLY", 62],
        ["ANNUAL", 20],
        ["PREMIUM", 18],
      ] as const);
      const plan = PLANS.find((p) => p.code === planCode)!;
      const trialEnd = new Date(signedUpAt.getTime() + 7 * DAY);
      const subId = demoId("sub");
      const method = weighted(METHODS);

      if (trialEnd > NOW) {
        // Still in the 7-day free trial.
        subs.push({ id: subId, externalId: nextExternal("SUB"), learnerId: id, planId: planIds.get(plan.code)!, status: "TRIALING", source: "DIRECT", schoolId: null, startedAt: signedUpAt, cancelledAt: null, currentPeriodEnd: trialEnd, mrr: plan.monthly });
        learner.status = "ACTIVE";
        learner.lastActiveAt = new Date(NOW.getTime() - between(0, 2) * DAY);
        continue;
      }

      // Walk month by month deciding on churn.
      let cancelledAt: Date | null = null;
      let cursor = trialEnd;
      let months = 0;
      while (cursor < NOW) {
        const cm = new Date(cursor.getTime() + 2 * 3_600_000).getUTCMonth();
        if (plan.interval === "MONTHLY") {
          let hazard = plan.code === "PREMIUM" ? 0.035 : 0.045;
          if (grade === 12 && (cm === 11 || cm === 10)) hazard = 0.5; // matric finals finished
          if (months > 0 && chance(hazard)) {
            cancelledAt = new Date(cursor.getTime() + between(0, 20) * DAY);
            if (cancelledAt > NOW) cancelledAt = null;
            break;
          }
        } else if (months > 0 && months % 12 === 0 && chance(0.4)) {
          cancelledAt = new Date(cursor.getTime() + between(0, 10) * DAY);
          if (cancelledAt > NOW) cancelledAt = null;
          break;
        }
        // Payment for this period.
        const isPaymentMonth = plan.interval === "MONTHLY" || months % 12 === 0;
        if (isPaymentMonth) {
          const failed = chance(0.03);
          payments.push({ id: demoId("pay"), externalId: nextExternal("PAY"), learnerId: id, subscriptionId: subId, amount: plan.price, status: failed ? "FAILED" : "SUCCEEDED", method, reference: `IA-${seq}`, paidAt: cursor });
          if (failed) {
            const retry = new Date(cursor.getTime() + 3 * DAY);
            if (retry < NOW) payments.push({ id: demoId("pay"), externalId: nextExternal("PAY"), learnerId: id, subscriptionId: subId, amount: plan.price, status: "SUCCEEDED", method, reference: `IA-${seq}-R`, paidAt: retry });
          }
        }
        months += 1;
        cursor = addMonths(cursor, 1);
      }

      const pastDue = !cancelledAt && chance(0.02);
      subs.push({
        id: subId,
        externalId: nextExternal("SUB"),
        learnerId: id,
        planId: planIds.get(plan.code)!,
        status: cancelledAt ? "CANCELLED" : pastDue ? "PAST_DUE" : "ACTIVE",
        source: "DIRECT",
        schoolId: null,
        startedAt: trialEnd,
        cancelledAt,
        currentPeriodEnd: cancelledAt ? null : cursor,
        mrr: plan.monthly,
      });
      learner.status = cancelledAt ? "INACTIVE" : "ACTIVE";
      learner.lastActiveAt = cancelledAt
        ? new Date(cancelledAt.getTime() - between(0, 14) * DAY)
        : new Date(NOW.getTime() - Math.pow(rand(), 2) * 12 * DAY);
    }
  }

  // ── School-sponsored seats ──
  for (const school of schools) {
    const p = school.seed.partnership;
    if (!p || p.status === "SIGNED") continue;
    const start = monthStartDate(p.startMonthsAgo);
    const ended = p.status === "EXPIRED" ? addMonths(start, p.months) : null;
    const seats = Math.round(p.covered * between(0.8, 0.95));
    for (let i = 0; i < seats; i++) {
      const id = demoId("lrn");
      const signedUpAt = new Date(start.getTime() + between(0, 25) * DAY);
      if (signedUpAt > NOW) continue;
      learners.push({
        id,
        externalId: nextExternal("LP"),
        grade: 12,
        province: school.seed.province,
        schoolId: school.id,
        signedUpAt,
        lastActiveAt: ended ? new Date(ended.getTime() - between(0, 30) * DAY) : new Date(NOW.getTime() - Math.pow(rand(), 2) * 20 * DAY),
        status: ended ? "INACTIVE" : "ACTIVE",
      });
      subs.push({
        id: demoId("sub"),
        externalId: nextExternal("SUB"),
        learnerId: id,
        planId: planIds.get("SCHOOL_SEAT")!,
        status: ended ? "CANCELLED" : "ACTIVE",
        source: "SCHOOL",
        schoolId: school.id,
        startedAt: signedUpAt,
        cancelledAt: ended,
        currentPeriodEnd: ended,
        mrr: 0,
      });
    }
  }

  for (const batch of chunk(learners, 1000)) await db.learner.createMany({ data: batch });
  for (const batch of chunk(subs, 1000)) await db.subscription.createMany({ data: batch });
  for (const batch of chunk(payments, 2000)) await db.payment.createMany({ data: batch });

  const active = learners.filter((l) => l.status === "ACTIVE").length;
  console.log(`   learners: ${learners.length} (${active} active), subscriptions: ${subs.length}, payments: ${payments.length}`);
  void int;
  return { learnerCount: learners.length, activeCourseLearners: active };
}
