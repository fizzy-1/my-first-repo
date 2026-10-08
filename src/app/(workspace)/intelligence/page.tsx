import type { Metadata } from "next";
import { Suspense } from "react";
import { DownloadIcon } from "lucide-react";
import { can, requirePageAccess, type SessionUser } from "@/server/auth/current-user";
import { intelligenceAccess, type IntelligenceAccess } from "@/server/services/intelligence";
import { RangeSelect } from "@/components/charts/range-select";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { parseRange, RANGE_OPTIONS, resolveRange } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { buildHref, exportHref, first, oneOf } from "@/lib/list-params";
import { AcademicTab } from "./_components/academic-tab";
import { FinancialTab } from "./_components/financial-tab";
import { LearnersTab } from "./_components/learners-tab";
import { MarketingTab } from "./_components/marketing-tab";
import { OverviewTab } from "./_components/overview-tab";
import { SchoolsTab } from "./_components/schools-tab";
import { TabSkeleton, type TabContext } from "./_components/shared";
import { SubscriptionsTab } from "./_components/subscriptions-tab";

export const metadata: Metadata = { title: "Business Intelligence" };

const TABS = {
  overview: "Overview",
  learners: "Learners",
  subscriptions: "Subscriptions & revenue",
  schools: "Schools",
  marketing: "Marketing",
  academic: "Academic",
  financial: "Financial KPIs",
} as const;

type Tab = keyof typeof TABS;

const GRANULARITY_LABEL = { day: "Daily", week: "Weekly", month: "Monthly" } as const;

/** The existing CSV report matching each tab, when the user may export it. */
function tabExport(tab: Tab, user: SessionUser, access: IntelligenceAccess): { report: string; label: string } | null {
  if (!can(user, "reports.export")) return null;
  switch (tab) {
    case "overview":
      return access.finance ? { report: "revenue", label: "Export revenue" } : access.learners ? { report: "learners", label: "Export learners" } : null;
    case "learners":
      return access.learners ? { report: "learners", label: "Export learners" } : null;
    case "subscriptions":
      return access.finance ? { report: "subscriptions", label: "Export subscriptions" } : access.learners ? { report: "learners", label: "Export learners" } : null;
    case "schools":
      return access.schools ? { report: "schools", label: "Export schools" } : null;
    case "marketing":
      return access.marketing ? { report: "campaigns", label: "Export campaigns" } : null;
    case "financial":
      return access.finance ? { report: "finance-summary", label: "Export P&L summary" } : null;
    case "academic":
      return access.academic ? { report: "academic", label: "Export academic" } : null;
  }
}

export default async function IntelligencePage(props: PageProps<"/intelligence">) {
  const user = await requirePageAccess("intelligence.read");
  const sp = await props.searchParams;
  const range = parseRange(sp.range, "12m");
  const tab = oneOf<Tab>(first(sp.tab), TABS) ?? "overview";
  const window = resolveRange(range);
  const access = intelligenceAccess(user);
  const periodLabel = RANGE_OPTIONS.find((o) => o.value === range)!.label;
  const tabHref = (key: string) => buildHref("/intelligence", sp, { tab: key === "overview" ? null : key });

  const ctx: TabContext = {
    user,
    access,
    window,
    range,
    periodLabel,
    bucketLabel: GRANULARITY_LABEL[window.granularity],
    vsPrevious: `vs previous ${periodLabel}`,
    vsStart: `vs ${formatDate(window.from)}`,
    tabHref,
  };
  const exported = tabExport(tab, user, access);

  return (
    <>
      <PageHeader
        title="Business Intelligence"
        description={`Company performance for the last ${periodLabel} (since ${formatDate(window.from)}), compared with the period before.`}
        actions={
          <>
            <RangeSelect value={range} />
            {exported && (
              <Button variant="outline" size="sm" asChild>
                <a href={exportHref(`/api/reports/${exported.report}`, { range })} download>
                  <DownloadIcon /> {exported.label}
                </a>
              </Button>
            )}
          </>
        }
      />

      <LinkTabs className="mb-6" tabs={(Object.keys(TABS) as Tab[]).map((key) => ({ label: TABS[key], href: tabHref(key), active: key === tab }))} />

      <Suspense key={`${tab}:${range}`} fallback={<TabSkeleton />}>
        {tab === "overview" && <OverviewTab ctx={ctx} />}
        {tab === "learners" && <LearnersTab ctx={ctx} />}
        {tab === "subscriptions" && <SubscriptionsTab ctx={ctx} />}
        {tab === "schools" && <SchoolsTab ctx={ctx} />}
        {tab === "marketing" && <MarketingTab ctx={ctx} />}
        {tab === "academic" && <AcademicTab ctx={ctx} />}
        {tab === "financial" && <FinancialTab ctx={ctx} />}
      </Suspense>
    </>
  );
}
