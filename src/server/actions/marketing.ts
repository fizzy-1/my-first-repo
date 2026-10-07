"use server";

import { CampaignChannel, CampaignStatus } from "@prisma/client";
import { z } from "zod";
import { argAction, formAction } from "@/server/action";
import { zDate, zEnum, zId, zIdList, zInt, zMoney, zOptionalDate, zOptionalId, zOptionalText, zText } from "@/lib/validation";
import { CAMPAIGN_STATUS } from "@/lib/labels";
import { createCampaign, deleteCampaign, recordCampaignMetric, setCampaignStatus, updateCampaign } from "@/server/services/marketing";

const campaignSchema = z.object({
  name: zText(160, "Campaign name"),
  description: zOptionalText(2000),
  objective: zOptionalText(500),
  targetAudience: zOptionalText(500),
  channel: zEnum(CampaignChannel, "a channel"),
  status: zEnum(CampaignStatus, "a status"),
  startDate: zDate,
  endDate: zOptionalDate,
  budget: zMoney,
  ownerId: zOptionalId,
  memberIds: zIdList,
});

export const createCampaignAction = formAction(campaignSchema, async (user, input) => {
  const campaign = await createCampaign(user, input);
  return { message: `Campaign “${campaign.name}” created`, id: campaign.id };
});

export const updateCampaignAction = formAction(campaignSchema.extend({ id: zId }), async (user, { id, ...input }) => {
  await updateCampaign(user, id, input);
  return "Campaign updated";
});

export const setCampaignStatusAction = argAction(z.object({ id: zId, status: zEnum(CampaignStatus) }), async (user, { id, status }) => {
  await setCampaignStatus(user, id, status);
  return `Campaign ${CAMPAIGN_STATUS[status].label.toLowerCase()}`;
});

export const deleteCampaignAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteCampaign(user, id);
  return "Campaign deleted";
});

export const recordCampaignMetricAction = formAction(
  z.object({
    campaignId: zId,
    periodStart: zDate,
    spend: zMoney,
    impressions: zInt(0, 1_000_000_000),
    clicks: zInt(0, 1_000_000_000),
    leads: zInt(0, 10_000_000),
    conversions: zInt(0, 10_000_000),
    revenue: zMoney,
  }),
  async (user, input) => {
    await recordCampaignMetric(user, input);
    return "Metrics saved";
  },
);
