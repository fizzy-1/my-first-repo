import type { Metadata } from "next";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { listProjections, projectionBaseline } from "@/server/services/finance";
import { PageHeader } from "@/components/common/page-header";
import { toDateInput } from "@/lib/dates";
import { ScenarioPlanner } from "./scenario-planner";

export const metadata: Metadata = { title: "Financial projections" };

export default async function ProjectionsPage() {
  const user = await requirePageAccess("finance.read");
  const [projections, baseline] = await Promise.all([listProjections(user), projectionBaseline()]);
  return (
    <>
      <PageHeader
        title="Financial projections"
        description="Model learner growth, pricing, school revenue and costs. Compare conservative, base and aggressive scenarios."
      />
      <ScenarioPlanner
        canSave={can(user, "finance.projections")}
        baseline={baseline}
        scenarios={projections.map(({ updatedAt: _u, startMonth, ...p }) => ({ ...p, startMonth: toDateInput(startMonth) }))}
      />
    </>
  );
}
