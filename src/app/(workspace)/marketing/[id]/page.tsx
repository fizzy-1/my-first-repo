import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3Icon, PencilIcon, Trash2Icon } from "lucide-react";
import type { CampaignStatus } from "@prisma/client";
import { deleteCampaignAction, recordCampaignMetricAction, setCampaignStatusAction, updateCampaignAction } from "@/server/actions/marketing";
import { requirePageAccess } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors";
import { activeUserOptions } from "@/server/rbac";
import { getCampaign } from "@/server/services/marketing";
import { ChartCard } from "@/components/charts/chart-card";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { StatusMenu } from "@/components/common/status-menu";
import { UserChip } from "@/components/common/user-chip";
import { ConfirmActionButton } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toDateInput } from "@/lib/dates";
import { APPROVAL_STATUS, CAMPAIGN_CHANNEL, CAMPAIGN_STATUS } from "@/lib/labels";
import { formatDate, formatNumber, formatZAR } from "@/lib/format";
import { campaignDefaults, campaignFields, metricFields } from "../fields";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignPage(props: PageProps<"/marketing/[id]">) {
  const { id } = await props.params;
  const user = await requirePageAccess("marketing.read", "marketing.read.assigned");
  let c: Awaited<ReturnType<typeof getCampaign>>;
  try {
    c = await getCampaign(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const users = (await activeUserOptions()).map(({ value, label }) => ({ value, label }));
  const pct = c.budget ? (c.performance.spend / c.budget) * 100 : 0;
  const p = c.performance;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Marketing", href: "/marketing" }, { label: c.name }]}
        title={c.name}
        description={c.description ?? undefined}
        meta={
          <>
            <StatusMenu id={c.id} value={c.status} meta={CAMPAIGN_STATUS} options={Object.keys(CAMPAIGN_STATUS) as CampaignStatus[]} action={setCampaignStatusAction} disabled={!c.canEdit} />
            <StatusBadge meta={CAMPAIGN_CHANNEL} value={c.channel} dot={false} />
            <span className="text-xs text-muted-foreground">
              {formatDate(c.startDate)} – {c.endDate ? formatDate(c.endDate) : "ongoing"}
            </span>
          </>
        }
        actions={
          <>
            {c.canRecordMetrics && (
              <FormDialog
                title="Record weekly metrics"
                trigger={
                  <Button variant="outline">
                    <BarChart3Icon /> Record metrics
                  </Button>
                }
                action={recordCampaignMetricAction}
                fields={metricFields(c.id)}
                defaultValues={{ periodStart: toDateInput(new Date()), spend: "0", impressions: "0", clicks: "0", leads: "0", conversions: "0", revenue: "0" }}
                submitLabel="Save metrics"
              />
            )}
            {c.canEdit && (
              <>
                <FormDialog
                  title={`Edit ${c.name}`}
                  size="lg"
                  trigger={
                    <Button variant="outline">
                      <PencilIcon /> Edit
                    </Button>
                  }
                  action={updateCampaignAction}
                  fields={[{ type: "hidden", name: "id", value: c.id }, ...campaignFields(users)]}
                  defaultValues={campaignDefaults(c)}
                  submitLabel="Save changes"
                />
                <ConfirmActionButton variant="ghost" size="icon" aria-label="Delete campaign" action={deleteCampaignAction} input={{ id: c.id }} title={`Delete “${c.name}”?`} description="The campaign and all recorded metrics will be deleted." confirmLabel="Delete">
                  <Trash2Icon />
                </ConfirmActionButton>
              </>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {[
          ["Budget", formatZAR(c.budget)],
          ["Spend", formatZAR(p.spend)],
          ["Leads", formatNumber(p.leads)],
          ["Conversions", formatNumber(p.conversions)],
          ["Cost per lead", p.costPerLead !== null ? formatZAR(p.costPerLead) : "—"],
          ["Cost per acquisition", p.costPerAcquisition !== null ? formatZAR(p.costPerAcquisition) : "—"],
          ["Revenue generated", formatZAR(p.revenue)],
          ["Return on ad spend", p.roas !== null ? `${p.roas.toFixed(2)}×` : "—"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <p className="tabular mt-1 text-base font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Weekly spend" data={c.metrics} format="zar" series={[{ key: "spend", label: "Spend", slot: 1, type: "bar" }]} emptyMessage="No metrics recorded yet." />
            <ChartCard
              title="Weekly leads & conversions"
              data={c.metrics}
              series={[
                { key: "leads", label: "Leads", slot: 1, type: "line" },
                { key: "conversions", label: "Conversions", slot: 2, type: "line" },
              ]}
              emptyMessage="No metrics recorded yet."
            />
          </div>
          <SectionCard title="Weekly performance" flush>
            {c.metrics.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">No metrics recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Week of</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Impressions</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Clicks</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Conv.</TableHead>
                    <TableHead className="text-right">CPL</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...c.metrics].reverse().map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(m.periodStart)}</TableCell>
                      <TableCell className="tabular text-right">{formatZAR(m.spend)}</TableCell>
                      <TableCell className="tabular hidden text-right md:table-cell">{formatNumber(m.impressions)}</TableCell>
                      <TableCell className="tabular hidden text-right md:table-cell">{formatNumber(m.clicks)}</TableCell>
                      <TableCell className="tabular text-right">{formatNumber(m.leads)}</TableCell>
                      <TableCell className="tabular text-right">{formatNumber(m.conversions)}</TableCell>
                      <TableCell className="tabular text-right">{m.cpl !== null ? formatZAR(m.cpl) : "—"}</TableCell>
                      <TableCell className="tabular hidden text-right md:table-cell">{formatZAR(m.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </div>
        <div className="space-y-6">
          <SectionCard title="Budget">
            <div className="flex items-baseline justify-between text-sm">
              <span className="tabular font-semibold">{formatZAR(p.spend)}</span>
              <span className="tabular text-muted-foreground">of {formatZAR(c.budget)}</span>
            </div>
            <Progress className="mt-2" value={pct} tone={pct > 100 ? "danger" : pct > 90 ? "warning" : "primary"} label="Budget used" />
            <p className="mt-2 text-xs text-muted-foreground">{Math.round(pct)}% used · {formatZAR(Math.max(0, c.budget - p.spend))} remaining</p>
          </SectionCard>
          <SectionCard title="Brief">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Objective</dt>
                <dd className="mt-0.5">{c.objective ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Target audience</dt>
                <dd className="mt-0.5">{c.targetAudience ?? "—"}</dd>
              </div>
            </dl>
          </SectionCard>
          <SectionCard title="Team">
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <UserChip name={c.owner?.name} subtitle={c.owner?.jobTitle} />
                <span className="text-xs text-muted-foreground">Owner</span>
              </div>
              {c.members.map((m) => (
                <UserChip key={m.userId} name={m.user.name} subtitle={m.user.jobTitle} />
              ))}
            </div>
          </SectionCard>
          {c.approvals.length > 0 && (
            <SectionCard title="Approvals">
              <ul className="space-y-2 text-sm">
                {c.approvals.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <Link href={`/approvals/${a.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      #{a.number} {a.title}
                    </Link>
                    <StatusBadge meta={APPROVAL_STATUS} value={a.status} />
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      </div>
    </>
  );
}
