import type { Metadata } from "next";
import Link from "next/link";
import { MegaphoneIcon, PlusIcon } from "lucide-react";
import { CampaignChannel, CampaignStatus } from "@prisma/client";
import { createCampaignAction, deleteCampaignAction, setCampaignStatusAction, updateCampaignAction } from "@/server/actions/marketing";
import { can, requirePageAccess } from "@/server/auth/current-user";
import { activeUserOptions } from "@/server/rbac";
import { campaignCalendar, listCampaigns, marketingOverview } from "@/server/services/marketing";
import { ChartCard } from "@/components/charts/chart-card";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { EmptyState } from "@/components/common/empty-state";
import { LinkTabs } from "@/components/common/link-tabs";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { StatusMenu } from "@/components/common/status-menu";
import { FormDialog } from "@/components/forms/form-dialog";
import { RowMenu } from "@/components/forms/row-menu";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addMonths } from "@/lib/dates";
import { CAMPAIGN_CHANNEL, CAMPAIGN_STATUS, optionsOf } from "@/lib/labels";
import { formatDate, formatNumber, formatZAR } from "@/lib/format";
import { buildHref, first, oneOf } from "@/lib/list-params";
import { CampaignCalendar } from "./campaign-calendar";
import { campaignDefaults, campaignFields } from "./fields";

export const metadata: Metadata = { title: "Marketing" };

export default async function MarketingPage(props: PageProps<"/marketing">) {
  const user = await requirePageAccess("marketing.read", "marketing.read.assigned");
  const sp = await props.searchParams;
  const view = first(sp.view) === "calendar" ? "calendar" : "campaigns";
  const canWrite = can(user, "marketing.write");
  const now = new Date();
  const [campaigns, overview, users] = await Promise.all([
    listCampaigns(user, {
      q: first(sp.q),
      status: oneOf<CampaignStatus>(first(sp.status), CampaignStatus),
      channel: oneOf<CampaignChannel>(first(sp.channel), CampaignChannel),
    }),
    marketingOverview(user),
    activeUserOptions(),
  ]);
  const userOpts = users.map(({ value, label }) => ({ value, label }));
  const fields = campaignFields(userOpts);

  const totals = campaigns.reduce(
    (t, c) => ({
      budget: t.budget + (c.status !== "COMPLETED" ? c.budget : 0),
      spend: t.spend + c.performance.spend,
      leads: t.leads + c.performance.leads,
      conversions: t.conversions + c.performance.conversions,
      revenue: t.revenue + c.performance.revenue,
    }),
    { budget: 0, spend: 0, leads: 0, conversions: 0, revenue: 0 },
  );

  return (
    <>
      <PageHeader
        title="Marketing"
        description={can(user, "marketing.read") ? "Campaigns, spend and performance across channels." : "Campaigns you own or are assigned to."}
        actions={
          <>
            {can(user, "reports.export") && can(user, "marketing.read") && (
              <Button variant="outline" asChild>
                <a href="/api/reports/campaigns" download>
                  Export CSV
                </a>
              </Button>
            )}
            {canWrite && (
              <FormDialog
                title="New campaign"
                size="lg"
                trigger={
                  <Button>
                    <PlusIcon /> New campaign
                  </Button>
                }
                openParam="campaign"
                action={createCampaignAction}
                fields={fields}
                defaultValues={campaignDefaults()}
                submitLabel="Create campaign"
                successHref="/marketing/{id}"
              />
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Open campaign budget", formatZAR(totals.budget)],
          ["Spend to date", formatZAR(totals.spend)],
          ["Leads", formatNumber(totals.leads)],
          ["Conversions", formatNumber(totals.conversions)],
          ["Cost per lead", totals.leads ? formatZAR(totals.spend / totals.leads) : "—"],
          ["Cost per acquisition", totals.conversions ? formatZAR(totals.spend / totals.conversions) : "—"],
        ].map(([label, value]) => (
          <Card key={label} className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="tabular mt-1 text-lg font-semibold">{value}</p>
          </Card>
        ))}
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <ChartCard
          title="Weekly leads & conversions"
          description="Last 16 weeks"
          data={overview.weekly}
          series={[
            { key: "leads", label: "Leads", slot: 1, type: "bar" },
            { key: "conversions", label: "Conversions", slot: 2, type: "bar" },
          ]}
        />
        {overview.byChannel.length > 0 ? (
          <Card className="p-5">
            <h3 className="text-[15px] font-semibold">Performance by channel</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">All-time spend, leads and cost per lead</p>
            <Table className="mt-3">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                  <TableHead className="text-right">CPL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.byChannel.map((c) => (
                  <TableRow key={c.channel}>
                    <TableCell>{CAMPAIGN_CHANNEL[c.channel].label}</TableCell>
                    <TableCell className="tabular text-right">{formatZAR(c.spend)}</TableCell>
                    <TableCell className="tabular text-right">{formatNumber(c.leads)}</TableCell>
                    <TableCell className="tabular text-right">{formatNumber(c.conversions)}</TableCell>
                    <TableCell className="tabular text-right">{c.cpl !== null ? formatZAR(c.cpl) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <ChartCard
            title="Weekly spend"
            data={overview.weekly}
            format="zar"
            series={[{ key: "spend", label: "Spend", slot: 1, type: "area" }]}
          />
        )}
      </div>

      <LinkTabs
        className="mb-4"
        tabs={[
          { label: "Campaigns", href: buildHref("/marketing", sp, { view: undefined }), active: view === "campaigns", count: campaigns.length },
          { label: "Campaign calendar", href: buildHref("/marketing", sp, { view: "calendar" }), active: view === "calendar" },
        ]}
      />

      {view === "calendar" ? (
        <Card className="overflow-hidden">
          <CampaignCalendar campaigns={await campaignCalendar(user, addMonths(now, -3), addMonths(now, 4))} from={addMonths(now, -3)} months={7} now={now} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <TableToolbar
            searchPlaceholder="Search campaigns…"
            filters={[
              { param: "status", label: "Status", options: optionsOf(CAMPAIGN_STATUS) },
              { param: "channel", label: "Channel", options: optionsOf(CAMPAIGN_CHANNEL) },
            ]}
          />
          {campaigns.length === 0 ? (
            <EmptyState icon={MegaphoneIcon} title="No campaigns yet" description={canWrite ? "Create a campaign to start tracking spend and leads." : "You haven't been assigned to any campaigns."} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Dates</TableHead>
                  <TableHead className="hidden lg:table-cell">Team</TableHead>
                  <TableHead className="w-44">Spend vs budget</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="hidden text-right md:table-cell">CPL</TableHead>
                  <TableHead className="hidden text-right md:table-cell">CPA</TableHead>
                  <TableHead className="hidden text-right xl:table-cell">Revenue</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const pct = c.budget ? (c.performance.spend / c.budget) * 100 : 0;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="min-w-56">
                          <Link href={`/marketing/${c.id}`} className="font-medium hover:underline">
                            {c.name}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <StatusBadge meta={CAMPAIGN_CHANNEL} value={c.channel} dot={false} />
                            {c.approvals.length > 0 && (
                              <Link href={`/approvals/${c.approvals[0].id}`}>
                                <Badge tone="warning">Approval #{c.approvals[0].number} pending</Badge>
                              </Link>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusMenu id={c.id} value={c.status} meta={CAMPAIGN_STATUS} options={Object.keys(CAMPAIGN_STATUS) as CampaignStatus[]} action={setCampaignStatusAction} disabled={!canWrite} />
                      </TableCell>
                      <TableCell className="hidden text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                        {formatDate(c.startDate)} – {c.endDate ? formatDate(c.endDate) : "ongoing"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <AvatarStack names={[c.owner?.name, ...c.members.map((m) => m.user.name)].filter((n, i, a): n is string => !!n && a.indexOf(n) === i)} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="tabular font-medium">{formatZAR(c.performance.spend, { compact: true })}</span>
                          <span className="tabular text-muted-foreground">/ {formatZAR(c.budget, { compact: true })}</span>
                        </div>
                        <Progress className="mt-1" value={pct} tone={pct > 100 ? "danger" : pct > 90 ? "warning" : "primary"} label={`${c.name} budget used`} />
                      </TableCell>
                      <TableCell className="tabular text-right">{formatNumber(c.performance.leads)}</TableCell>
                      <TableCell className="tabular hidden text-right md:table-cell">{c.performance.costPerLead !== null ? formatZAR(c.performance.costPerLead) : "—"}</TableCell>
                      <TableCell className="tabular hidden text-right md:table-cell">{c.performance.costPerAcquisition !== null ? formatZAR(c.performance.costPerAcquisition) : "—"}</TableCell>
                      <TableCell className="tabular hidden text-right xl:table-cell">{formatZAR(c.performance.revenue)}</TableCell>
                      <TableCell className="text-right">
                        {canWrite && (
                          <RowMenu
                            label={c.name}
                            href={`/marketing/${c.id}`}
                            edit={{ title: `Edit ${c.name}`, action: updateCampaignAction, fields: [{ type: "hidden", name: "id", value: c.id }, ...fields], defaults: campaignDefaults(c), size: "lg" }}
                            remove={{ action: deleteCampaignAction, input: { id: c.id }, title: `Delete “${c.name}”?`, description: "The campaign and all of its recorded metrics will be deleted." }}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
