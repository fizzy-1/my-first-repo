import { db } from "@/server/db";
import { PrismaLearnerPlatformSource } from "./prisma-source";
import type { LearnerPlatformSource } from "./types";

/**
 * The active learner-platform data source. To read directly from the learner
 * platform's API or a warehouse instead of the mirrored tables, implement
 * `LearnerPlatformSource` and return it here.
 */
export const learnerPlatform: LearnerPlatformSource = new PrismaLearnerPlatformSource(db);

export type { LearnerPlatformSource, LearnerSnapshot, LearnerSeriesPoint, EngagementPoint } from "./types";
