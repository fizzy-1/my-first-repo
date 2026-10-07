import type { Metadata } from "next";
import { ChartCard } from "@/components/charts/chart-card";
import { RangeSelect } from "@/components/charts/range-select";
import { requireUser } from "@/server/auth/current-user";
import { DASHBOARD_WIDGETS, getDashboard, type WidgetId } from "@/server/services/dashboard";
import { parseRange, RANGE_OPTIONS } from "@/lib/dates";
import { formatDate, formatZAR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActionCentre } from "./_components/action-centre";
import { ActivityCard } from "./_components/activity-card";
import { CustomizeDialog } from "./_components/customize-dialog";
import { KpiRow } from "./_components/kpi-row";
import { Announcements, MyWork } from "./_components/my-work";
import { PipelineCard } from "./_components/pipeline-card";
import { AcademicCard, MarketingCard, ObjectivesCard, TechnologyCard } from "./_components/snapshot-cards";

export const metadata: Metadata = { title: "Executive Dashboard" };

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Johannesburg" }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const range = parseRange(sp.range, "12m");
  const data = await getDashboard(user, range);
  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === range)?.label.toLowerCase();
  const granularityLabel = { day: "Daily", week: "Weekly", month: "Monthly" }[range === "7d" || range === "30d" ? "day" : range === "3m" ? "week" : "month"];

  const widgets: Partial<Record<WidgetId, { node: React.ReactNode; span: string }>> = {};
  const kpis = <KpiRow data={data} />;
  if (data.revenue || data.learners || data.schools) widgets.kpis = { node: kpis, span: "xl:col-span-3" };
  if (data.revenueSeries) {
    const total = data.revenueSeries.reduce((s, r) => s + r.total, 0);
    widgets.revenue = {
      span: data.schools ? "xl:col-span-2" : "xl:col-span-3",
      node: (
        <ChartCard
          title="Revenue"
          description={`${granularityLabel} revenue by stream · last ${rangeLabel}`}
          headline={<p className="tabular text-2xl font-semibold tracking-tight">{formatZAR(total)}</p>}
          data={data.revenueSeries}
          format="zar"
          height={280}
          series={[
            { key: "subscription", label: "Subscriptions", slot: 1, type: "bar", stackId: "rev" },
            { key: "school", label: "School contracts", slot: 2, type: "bar", stackId: "rev" },
            { key: "other", label: "Other income", slot: 3, type: "bar", stackId: "rev" },
          ]}
        />
      ),
    };
  }
  if (data.schools) widgets.pipeline = { span: "xl:col-span-1", node: <PipelineCard data={data.schools} /> };
  if (data.learnerSeries) {
    const last = data.learnerSeries.at(-1);
    widgets.learners = {
      span: "xl:col-span-3",
      node: (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard
            title="Learner base"
            description={`Total, active and paying learners at the end of each period · last ${rangeLabel}`}
            headline={last && <p className="tabular text-2xl font-semibold tracking-tight">{last.totalLearners.toLocaleString("en-US")} <span className="text-sm font-normal text-muted-foreground">learners</span></p>}
            data={data.learnerSeries}
            series={[
              { key: "totalLearners", label: "Total learners", slot: 1, type: "line" },
              { key: "activeLearners", label: "Active learners", slot: 2, type: "line" },
              { key: "payingLearners", label: "Paying learners", slot: 3, type: "area" },
            ]}
          />
          <ChartCard
            title="New vs churned learners"
            description={`${granularityLabel} sign-ups and paid cancellations`}
            data={data.learnerSeries}
            series={[
              { key: "newLearners", label: "New learners", slot: 1, type: "bar" },
              { key: "churned", label: "Churned learners", slot: 2, type: "bar" },
            ]}
          />
        </div>
      ),
    };
  }
  widgets.actions = { span: "xl:col-span-2", node: <ActionCentre data={data} /> };
  widgets.activity = { span: "xl:col-span-1 xl:row-span-2", node: <ActivityCard items={data.activity} /> };
  widgets.mywork = { span: "xl:col-span-2", node: <MyWork tasks={data.myTasks} meetings={data.myMeetings} /> };
  if (data.objectives) widgets.objectives = { span: "xl:col-span-1", node: <ObjectivesCard data={data.objectives} /> };
  if (data.marketing) widgets.marketing = { span: "xl:col-span-1", node: <MarketingCard data={data.marketing} /> };
  if (data.academic) widgets.academic = { span: "xl:col-span-1", node: <AcademicCard data={data.academic} /> };
  if (data.technology) widgets.technology = { span: "xl:col-span-1", node: <TechnologyCard data={data.technology} /> };

  const hidden = new Set(data.preferences.hidden);
  const ordered = data.preferences.order.filter((id) => widgets[id] && !hidden.has(id));
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{formatDate(data.periods.now)}</p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">
            {greeting(data.periods.now)}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what management needs to know and act on today.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(data.revenueSeries || data.learnerSeries) && <RangeSelect value={range} />}
          <CustomizeDialog
            widgets={DASHBOARD_WIDGETS.map((w) => ({ id: w.id, label: w.label, available: Boolean(widgets[w.id]) }))}
            order={data.preferences.order}
            hidden={data.preferences.hidden}
          />
        </div>
      </div>

      <Announcements items={data.announcements} />

      <div className="grid grid-flow-row-dense gap-6 xl:grid-cols-3">
        {ordered.map((id) => (
          <section key={id} className={cn("min-w-0", widgets[id]!.span)} aria-label={DASHBOARD_WIDGETS.find((w) => w.id === id)?.label}>
            {widgets[id]!.node}
          </section>
        ))}
      </div>
    </div>
  );
}
