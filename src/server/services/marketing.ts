import "server-only";
import type { CampaignChannel, CampaignStatus, Prisma } from "@prisma/client";
import { addDays, dbDate, dayKey, startOfWeek } from "@/lib/dates";
import { formatShortDate, formatZAR } from "@/lib/format";
import { CAMPAIGN_STATUS } from "@/lib/labels";
import { audit, diffFields } from "@/server/audit";
import { assertCan, can, canAny, type SessionUser } from "@/server/auth/current-user";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { notify } from "@/server/notify";

/** Campaigns a user may see: all (marketing.read) or those they own / are assigned to. */
export function campaignsVisibleWhere(user: SessionUser): Prisma.CampaignWhereInput {
  if (can(user, "marketing.read")) return {};
  if (can(user, "marketing.read.assigned")) return { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] };
  return { id: "__no_access__" };
}

function assertMarketingAccess(user: SessionUser) {
  if (!canAny(user, ["marketing.read", "marketing.read.assigned"])) throw new ForbiddenError();
}

export interface CampaignPerformance {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  conversions: number;
  revenue: number;
  costPerLead: number | null;
  costPerAcquisition: number | null;
  /** Revenue ÷ spend. */
  roas: number | null;
}

function performance(metrics: { spend: Prisma.Decimal; impressions: number; clicks: number; leads: number; conversions: number; revenue: Prisma.Decimal }[]): CampaignPerformance {
  const spend = metrics.reduce((s, m) => s + Number(m.spend), 0);
  const leads = metrics.reduce((s, m) => s + m.leads, 0);
  const conversions = metrics.reduce((s, m) => s + m.conversions, 0);
  const revenue = metrics.reduce((s, m) => s + Number(m.revenue), 0);
  return {
    spend,
    impressions: metrics.reduce((s, m) => s + m.impressions, 0),
    clicks: metrics.reduce((s, m) => s + m.clicks, 0),
    leads,
    conversions,
    revenue,
    costPerLead: leads ? spend / leads : null,
    costPerAcquisition: conversions ? spend / conversions : null,
    roas: spend ? revenue / spend : null,
  };
}

export async function listCampaigns(user: SessionUser, opts: { q?: string; status?: CampaignStatus; channel?: CampaignChannel } = {}) {
  assertMarketingAccess(user);
  const rows = await db.campaign.findMany({
    where: {
      AND: [
        campaignsVisibleWhere(user),
        opts.status ? { status: opts.status } : {},
        opts.channel ? { channel: opts.channel } : {},
        opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { description: { contains: opts.q, mode: "insensitive" } }] } : {},
      ],
    },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    include: {
      owner: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true } } } },
      metrics: { select: { spend: true, impressions: true, clicks: true, leads: true, conversions: true, revenue: true } },
      approvals: { where: { status: { in: ["PENDING", "CHANGES_REQUESTED"] } }, select: { id: true, number: true, status: true } },
    },
  });
  return rows.map(({ metrics, ...c }) => ({ ...c, budget: Number(c.budget), performance: performance(metrics) }));
}

export async function marketingOverview(user: SessionUser) {
  assertMarketingAccess(user);
  const scope = campaignsVisibleWhere(user);
  const since = dbDate(addDays(new Date(), -7 * 16));
  const [weekly, byChannel] = await Promise.all([
    db.campaignMetric.groupBy({
      by: ["periodStart"],
      where: { campaign: scope, periodStart: { gte: since } },
      _sum: { spend: true, leads: true, conversions: true },
      orderBy: { periodStart: "asc" },
    }),
    db.$queryRaw<{ channel: CampaignChannel; spend: number; leads: number; conversions: number }[]>`
      SELECT c."channel", COALESCE(SUM(m."spend"), 0)::float AS spend, COALESCE(SUM(m."leads"), 0)::int AS leads, COALESCE(SUM(m."conversions"), 0)::int AS conversions
      FROM "Campaign" c LEFT JOIN "CampaignMetric" m ON m."campaignId" = c."id"
      GROUP BY c."channel" ORDER BY spend DESC`,
  ]);
  // Channel breakdown is company-wide, so only shown with full marketing access.
  return {
    weekly: weekly.map((w) => ({
      key: dayKey(w.periodStart),
      label: formatShortDate(w.periodStart),
      spend: Math.round(Number(w._sum.spend ?? 0)),
      leads: w._sum.leads ?? 0,
      conversions: w._sum.conversions ?? 0,
    })),
    byChannel: can(user, "marketing.read") ? byChannel.map((c) => ({ ...c, cpl: c.leads ? c.spend / c.leads : null })) : [],
  };
}

export async function getCampaign(user: SessionUser, id: string) {
  assertMarketingAccess(user);
  const campaign = await db.campaign.findFirst({
    where: { AND: [{ id }, campaignsVisibleWhere(user)] },
    include: {
      owner: { select: { id: true, name: true, jobTitle: true } },
      members: { include: { user: { select: { id: true, name: true, jobTitle: true } } } },
      metrics: { orderBy: { periodStart: "asc" } },
      approvals: { orderBy: { createdAt: "desc" }, select: { id: true, number: true, title: true, status: true, amount: true } },
    },
  });
  if (!campaign) throw new NotFoundError("Campaign");
  const perf = performance(campaign.metrics);
  return {
    ...campaign,
    budget: Number(campaign.budget),
    performance: perf,
    metrics: campaign.metrics.map((m) => ({
      ...m,
      spend: Number(m.spend),
      revenue: Number(m.revenue),
      label: formatShortDate(m.periodStart),
      cpl: m.leads ? Number(m.spend) / m.leads : null,
    })),
    approvals: campaign.approvals.map((a) => ({ ...a, amount: a.amount ? Number(a.amount) : null })),
    canEdit: can(user, "marketing.write"),
    canRecordMetrics: can(user, "marketing.metrics"),
  };
}

export interface CampaignInput {
  name: string;
  description?: string;
  objective?: string;
  targetAudience?: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  startDate: Date;
  endDate?: Date;
  budget: number;
  ownerId?: string;
  memberIds: string[];
}

export async function createCampaign(user: SessionUser, input: CampaignInput) {
  assertCan(user, "marketing.write");
  if (input.endDate && input.endDate < input.startDate) throw new ValidationError("End date must be after the start date.", { endDate: ["Must be after the start date."] });
  const campaign = await db.campaign.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      objective: input.objective ?? null,
      targetAudience: input.targetAudience ?? null,
      channel: input.channel,
      status: input.status,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      budget: input.budget,
      ownerId: input.ownerId ?? user.id,
      members: { create: [...new Set(input.memberIds)].map((userId) => ({ userId })) },
    },
  });
  await audit(user, {
    action: "campaign.created",
    module: "marketing",
    entityType: "Campaign",
    entityId: campaign.id,
    summary: `${user.name} created campaign “${campaign.name}” (${formatZAR(input.budget)} budget)`,
    after: { name: campaign.name, budget: input.budget, status: campaign.status },
    feed: true,
  });
  await notify({
    userIds: input.memberIds,
    excludeUserId: user.id,
    type: "TASK_ASSIGNED",
    title: `You've been added to campaign “${campaign.name}”`,
    link: `/marketing/${campaign.id}`,
  });
  return campaign;
}

export async function updateCampaign(user: SessionUser, id: string, input: CampaignInput) {
  assertCan(user, "marketing.write");
  const existing = await db.campaign.findUnique({ where: { id }, include: { members: true } });
  if (!existing) throw new NotFoundError("Campaign");
  if (input.endDate && input.endDate < input.startDate) throw new ValidationError("End date must be after the start date.", { endDate: ["Must be after the start date."] });
  const data = {
    name: input.name,
    description: input.description ?? null,
    objective: input.objective ?? null,
    targetAudience: input.targetAudience ?? null,
    channel: input.channel,
    status: input.status,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    budget: input.budget,
    ownerId: input.ownerId ?? existing.ownerId,
  };
  const changes = diffFields(existing, data);
  const oldMembers = new Set(existing.members.map((m) => m.userId));
  const newMembers = [...new Set(input.memberIds)];
  await db.$transaction([
    db.campaign.update({ where: { id }, data }),
    db.campaignMember.deleteMany({ where: { campaignId: id, userId: { notIn: newMembers } } }),
    db.campaignMember.createMany({ data: newMembers.map((userId) => ({ campaignId: id, userId })), skipDuplicates: true }),
  ]);
  if (changes) {
    const budgetChanged = "budget" in changes.after;
    const statusChanged = "status" in changes.after;
    await audit(user, {
      action: budgetChanged ? "campaign.budget_changed" : statusChanged ? "campaign.status_changed" : "campaign.updated",
      module: "marketing",
      entityType: "Campaign",
      entityId: id,
      summary: budgetChanged
        ? `${user.name} changed the budget of “${existing.name}” from ${formatZAR(Number(existing.budget))} to ${formatZAR(input.budget)}`
        : statusChanged
          ? `${user.name} set campaign “${existing.name}” to ${CAMPAIGN_STATUS[input.status].label}`
          : `${user.name} updated campaign “${existing.name}” (${Object.keys(changes.after).join(", ")})`,
      ...changes,
      feed: budgetChanged || statusChanged,
    });
  }
  await notify({
    userIds: newMembers.filter((m) => !oldMembers.has(m)),
    excludeUserId: user.id,
    type: "TASK_ASSIGNED",
    title: `You've been added to campaign “${input.name}”`,
    link: `/marketing/${id}`,
  });
}

export async function setCampaignStatus(user: SessionUser, id: string, status: CampaignStatus) {
  assertCan(user, "marketing.write");
  const existing = await db.campaign.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Campaign");
  if (existing.status === status) return;
  await db.campaign.update({ where: { id }, data: { status } });
  await audit(user, {
    action: "campaign.status_changed",
    module: "marketing",
    entityType: "Campaign",
    entityId: id,
    summary: status === "ACTIVE" && existing.status !== "PAUSED" ? `${user.name} launched campaign “${existing.name}”` : `${user.name} set campaign “${existing.name}” to ${CAMPAIGN_STATUS[status].label}`,
    before: { status: existing.status },
    after: { status },
    feed: true,
  });
}

export async function deleteCampaign(user: SessionUser, id: string) {
  assertCan(user, "marketing.write");
  const existing = await db.campaign.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Campaign");
  await db.campaign.delete({ where: { id } });
  await audit(user, {
    action: "campaign.deleted",
    module: "marketing",
    entityType: "Campaign",
    entityId: id,
    summary: `${user.name} deleted campaign “${existing.name}”`,
    before: { name: existing.name, budget: Number(existing.budget), status: existing.status },
  });
}

export interface MetricInput {
  campaignId: string;
  periodStart: Date;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  conversions: number;
  revenue: number;
}

/** Records (or corrects) a week's figures. Staff may only record for campaigns they can see. */
export async function recordCampaignMetric(user: SessionUser, input: MetricInput) {
  assertCan(user, "marketing.metrics");
  const campaign = await db.campaign.findFirst({ where: { AND: [{ id: input.campaignId }, campaignsVisibleWhere(user)] } });
  if (!campaign) throw new NotFoundError("Campaign");
  if (input.conversions > input.leads) throw new ValidationError("Conversions cannot exceed leads.", { conversions: ["Cannot exceed leads."] });
  const weekStart = dbDate(startOfWeek(new Date(input.periodStart.getTime() + 12 * 3_600_000)));
  const data = { spend: input.spend, impressions: input.impressions, clicks: input.clicks, leads: input.leads, conversions: input.conversions, revenue: input.revenue };
  const existing = await db.campaignMetric.findUnique({ where: { campaignId_periodStart: { campaignId: campaign.id, periodStart: weekStart } } });
  await db.campaignMetric.upsert({
    where: { campaignId_periodStart: { campaignId: campaign.id, periodStart: weekStart } },
    create: { campaignId: campaign.id, periodStart: weekStart, ...data },
    update: data,
  });
  await audit(user, {
    action: existing ? "campaign.metrics_corrected" : "campaign.metrics",
    module: "marketing",
    entityType: "Campaign",
    entityId: campaign.id,
    summary: `${user.name} ${existing ? "corrected" : "recorded"} metrics for “${campaign.name}”, week of ${formatShortDate(weekStart)} (${input.leads} leads, ${formatZAR(input.spend)} spend)`,
    before: existing ? { spend: Number(existing.spend), leads: existing.leads, conversions: existing.conversions } : null,
    after: data,
    feed: !existing,
  });
}

/** Campaigns overlapping a window, for the campaign calendar. */
export async function campaignCalendar(user: SessionUser, from: Date, to: Date) {
  assertMarketingAccess(user);
  return db.campaign.findMany({
    where: {
      AND: [
        campaignsVisibleWhere(user),
        { startDate: { lte: dbDate(to) } },
        { OR: [{ endDate: null }, { endDate: { gte: dbDate(from) } }] },
      ],
    },
    orderBy: { startDate: "asc" },
    select: { id: true, name: true, status: true, channel: true, startDate: true, endDate: true, budget: true },
  });
}
