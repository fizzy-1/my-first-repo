import type { Granularity } from "@/lib/dates";

/**
 * Contract between the Executive Workspace and the learner-facing platform.
 *
 * Every learner, subscription, payment and engagement figure the executive
 * dashboard shows comes through this interface. Today it is implemented over
 * mirrored tables in the workspace database (populated by the sync endpoint
 * POST /api/integrations/learner-platform/sync). It can be swapped for a direct
 * API or warehouse implementation without touching dashboards.
 */
export interface LearnerSnapshot {
  /** Learners who have ever signed up (up to the instant). */
  totalLearners: number;
  /** Learners with any live subscription (direct, school-sponsored or trial). */
  activeLearners: number;
  /** Learners on a live, paid, direct subscription. */
  payingLearners: number;
  /** Live school-sponsored seats. */
  schoolSponsored: number;
  /** Live trials. */
  trialing: number;
}

export interface LearnerSeriesPoint {
  key: string;
  totalLearners: number;
  activeLearners: number;
  payingLearners: number;
  newLearners: number;
  churned: number;
}

export interface EngagementPoint {
  key: string;
  activeLearners: number;
  lessonsCompleted: number;
  videoMinutes: number;
  quizAttempts: number;
  avgQuizScore: number;
}

export interface LearnerPlatformSource {
  snapshotAt(at: Date): Promise<LearnerSnapshot>;
  newLearners(from: Date, to: Date): Promise<number>;
  /** Paid direct subscriptions cancelled in [from, to) (churn numerator). */
  cancellations(from: Date, to: Date): Promise<number>;
  /** Live paid direct subscriptions at an instant (churn denominator). */
  payingSubscriptionsAt(at: Date): Promise<number>;
  /** Monthly recurring revenue from direct subscriptions at an instant. */
  subscriptionMrrAt(at: Date): Promise<number>;
  /** Successful subscription payments in [from, to), bucketed. */
  subscriptionRevenue(from: Date, to: Date, granularity: Granularity): Promise<Map<string, number>>;
  subscriptionRevenueTotal(from: Date, to: Date): Promise<number>;
  learnerSeries(buckets: { key: string; start: Date; end: Date }[]): Promise<LearnerSeriesPoint[]>;
  /** Weekly engagement totals across courses (optionally one course). */
  engagementSeries(from: Date, to: Date, courseId?: string): Promise<EngagementPoint[]>;
  learnersByProvince(): Promise<{ province: string | null; count: number }[]>;
  planMix(at: Date): Promise<{ plan: string; subscriptions: number; mrr: number }[]>;
}
