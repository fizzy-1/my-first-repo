import { BookOpenCheckIcon, ClapperboardIcon, ClockIcon, GraduationCapIcon, MonitorPlayIcon, TrophyIcon } from "lucide-react";
import { academicIntelligence } from "@/server/services/intelligence";
import { ChartCard, type SeriesDef } from "@/components/charts/chart-card";
import { KpiCard } from "@/components/common/kpi-card";
import { formatHours, formatNumber, formatPercent } from "@/lib/format";
import { RankingCard } from "./ranking-card";
import { ChartGrid, Headline, RestrictedTab, StatGrid, type TabContext } from "./shared";

export async function AcademicTab({ ctx }: { ctx: TabContext }) {
  if (!ctx.access.academic) {
    return <RestrictedTab title="Requires academic access" description="Content production, tutor hours and learner engagement are available to roles with full academic access." />;
  }
  const data = await academicIntelligence(ctx.user, ctx.window);
  const typeSeries: SeriesDef[] = data.contentTypes.map((t, i) => ({ key: t.key, label: t.label, slot: (i + 1) as SeriesDef["slot"], type: "bar", stackId: "type" }));
  const quizChange = data.quizScore?.change;
  const noSnapshots = "No weekly learner-platform snapshot falls in this period yet.";

  return (
    <div className="space-y-6">
      <StatGrid className="xl:grid-cols-3">
        <KpiCard
          label={`Content published · last ${ctx.periodLabel}`}
          icon={BookOpenCheckIcon}
          value={formatNumber(data.published.value)}
          delta={data.published.delta}
          deltaLabel={ctx.vsPrevious}
          href="/academic"
          details={[{ label: "Previous period", value: formatNumber(data.published.previous) }]}
        />
        <KpiCard
          label={`Tutor hours · last ${ctx.periodLabel}`}
          icon={ClockIcon}
          value={formatHours(data.hours.value)}
          delta={data.hours.delta}
          deltaLabel={ctx.vsPrevious}
          href="/academic/hours"
          details={[{ label: "Previous period", value: formatHours(data.hours.previous) }]}
        />
        <KpiCard
          label="Weekly active learners"
          icon={GraduationCapIcon}
          value={formatNumber(data.weeklyActive?.value ?? null)}
          delta={data.weeklyActive?.delta}
          deltaLabel="vs the week before"
          details={[{ label: "Week before", value: formatNumber(data.weeklyActive?.previous ?? null) }]}
        />
        <KpiCard
          label="Average quiz score"
          icon={TrophyIcon}
          value={formatPercent(data.quizScore?.value ?? null)}
          details={[
            {
              label: "vs the week before",
              value: quizChange === null || quizChange === undefined ? "—" : `${quizChange > 0 ? "+" : ""}${quizChange.toFixed(1)} pts`,
            },
          ]}
        />
        <KpiCard
          label={`Lessons completed · last ${ctx.periodLabel}`}
          icon={MonitorPlayIcon}
          value={formatNumber(data.lessonsCompleted)}
          details={[{ label: "Source", value: "Weekly platform sync" }]}
        />
        <KpiCard
          label={`Video minutes · last ${ctx.periodLabel}`}
          icon={ClapperboardIcon}
          value={formatNumber(data.videoMinutes, { compact: true })}
          details={[{ label: "Weekly average", value: data.videoMinutes === null ? "—" : formatNumber(Math.round(data.videoMinutes / data.engagement.length), { compact: true }) }]}
        />
      </StatGrid>

      <ChartGrid>
        <ChartCard
          title="Content published"
          description={`${ctx.bucketLabel} items published, by content type · last ${ctx.periodLabel}`}
          headline={<Headline value={formatNumber(data.published.value)} caption="items" />}
          data={data.publishedTrend}
          height={280}
          series={typeSeries}
        />
        <RankingCard
          title="Tutor hours by activity"
          description={`Hours logged (excluding rejected entries) · last ${ctx.periodLabel}`}
          headline={<Headline value={formatHours(data.hours.value)} caption="logged" />}
          category="Activity"
          measure={{ key: "hours", label: "Hours", format: "hours" }}
          items={data.hoursByActivity.map((a) => ({
            key: a.key,
            label: a.label,
            value: a.hours,
            note: data.hours.value ? formatPercent((a.hours / data.hours.value) * 100, 0) : undefined,
          }))}
        />
        <ChartCard
          title="Weekly active learners"
          emptyMessage={noSnapshots}
          description="Learners active on the platform each week, across all courses"
          headline={data.weeklyActive && <Headline value={formatNumber(data.weeklyActive.value)} caption="latest week" />}
          data={data.engagement}
          series={[{ key: "activeLearners", label: "Active learners", slot: 1, type: "area" }]}
        />
        <ChartCard
          title="Average quiz score"
          emptyMessage={noSnapshots}
          description="Attempt-weighted average score each week"
          headline={data.quizScore && <Headline value={formatPercent(data.quizScore.value)} caption="latest week" />}
          data={data.engagement}
          format="percent"
          series={[{ key: "avgQuizScore", label: "Average score", slot: 1, type: "line" }]}
        />
        <ChartCard
          title="Learning activity"
          emptyMessage={noSnapshots}
          description="Lessons completed and quiz attempts each week"
          data={data.engagement}
          series={[
            { key: "lessonsCompleted", label: "Lessons completed", slot: 1, type: "bar" },
            { key: "quizAttempts", label: "Quiz attempts", slot: 2, type: "bar" },
          ]}
        />
        <ChartCard
          title="Video minutes watched"
          emptyMessage={noSnapshots}
          description="Total lesson-video minutes streamed each week"
          data={data.engagement}
          series={[{ key: "videoMinutes", label: "Video minutes", slot: 1, type: "bar" }]}
        />
      </ChartGrid>
    </div>
  );
}
