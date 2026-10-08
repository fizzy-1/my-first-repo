import type { Metadata } from "next";
import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { requirePageAccess } from "@/server/auth/current-user";
import { listTutors } from "@/server/services/academic";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatHours, formatPercent, formatZAR } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tutors" };

export default async function TutorsPage() {
  const user = await requirePageAccess("academic.read", "academic.read.assigned");
  const tutors = await listTutors(user);
  return (
    <>
      <PageHeader title="Tutors" description="Workload, hours and capacity over the last 30 days." />
      {tutors.length === 0 ? (
        <Card>
          <EmptyState icon={UsersIcon} title="No tutor profiles" />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tutors.map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex items-center gap-3">
                <Avatar name={t.name} size="lg" />
                <div className="min-w-0">
                  <Link href={`/team/${t.userId}`} className="block truncate font-semibold hover:underline">
                    {t.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{t.specialisation}</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                  <span>Utilisation (30 days)</span>
                  <span className="tabular font-medium text-foreground">{formatPercent(t.utilisation, 0)}</span>
                </div>
                <Progress className="mt-1.5" value={t.utilisation} tone={t.utilisation > 100 ? "danger" : t.utilisation > 85 ? "warning" : "primary"} label={`${t.name} utilisation`} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Hours (30d)</dt>
                  <dd className="tabular font-medium">{formatHours(t.hours30d)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Capacity / week</dt>
                  <dd className="tabular font-medium">{t.weeklyCapacityHours}h</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Open content items</dt>
                  <dd className="tabular font-medium">{t.openItems}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Overdue items</dt>
                  <dd className={cn("tabular font-medium", t.overdueItems > 0 && "text-danger")}>{t.overdueItems}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Awaiting approval</dt>
                  <dd className="tabular font-medium">{formatHours(t.pendingHours)}</dd>
                </div>
                {t.hourlyRate !== null && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Hourly rate</dt>
                    <dd className="tabular font-medium">{formatZAR(t.hourlyRate)}</dd>
                  </div>
                )}
              </dl>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
