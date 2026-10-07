import type { getDashboard } from "@/server/services/dashboard";

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
