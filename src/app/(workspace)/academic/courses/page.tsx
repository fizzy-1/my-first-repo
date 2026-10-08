import type { Metadata } from "next";
import { BookOpenIcon } from "lucide-react";
import { requirePageAccess } from "@/server/auth/current-user";
import { listCourses } from "@/server/services/academic";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { COURSE_STATUS } from "@/lib/labels";
import { formatNumber, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Courses & topics" };

export default async function CoursesPage() {
  const user = await requirePageAccess("academic.read", "academic.read.assigned");
  const courses = await listCourses(user);
  return (
    <>
      <PageHeader title="Courses & topics" description="CAPS-aligned topic coverage: lessons published and content items completed per topic." />
      {courses.length === 0 ? (
        <Card>
          <EmptyState icon={BookOpenIcon} title="No courses yet" />
        </Card>
      ) : (
        <div className="space-y-6">
          {courses.map((c) => (
            <Card key={c.id} className="overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-border p-5 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{c.title}</h2>
                    <StatusBadge meta={COURSE_STATUS} value={c.status} />
                    <Badge tone="outline">Grade {c.grade}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {c.description} {c.leadTutor && `Lead: ${c.leadTutor}.`}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-6 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Coverage</p>
                    <p className="tabular font-semibold">{formatPercent(c.coverage, 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Published</p>
                    <p className="tabular font-semibold">
                      {c.published}/{c.content}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Weekly active</p>
                    <p className="tabular font-semibold">{c.weeklyActive !== null ? formatNumber(c.weeklyActive) : "—"}</p>
                  </div>
                </div>
              </div>
              <ul className="divide-y divide-border">
                {c.topics.map((t) => (
                  <li key={t.id} className="grid grid-cols-1 items-center gap-2 px-5 py-3 text-sm md:grid-cols-[1fr_120px_140px_220px]">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.title}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{t.capsTerm ? `CAPS Term ${t.capsTerm}` : "—"}</span>
                    <span className="tabular text-xs text-muted-foreground">
                      {t.lessonsPublished}/{t.lessons} lessons live
                    </span>
                    <div className="flex items-center gap-2">
                      <Progress value={t.coverage} tone={t.coverage >= 80 ? "success" : t.coverage >= 40 ? "primary" : "warning"} label={`${t.title} coverage`} />
                      <span className="tabular w-16 text-right text-xs text-muted-foreground">
                        {t.contentPublished}/{t.content}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
