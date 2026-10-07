import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * Prisma client singleton. Reused across hot reloads in development so we don't
 * exhaust database connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** Either the root client or an interactive-transaction client. */
export type DbClient = Prisma.TransactionClient;
