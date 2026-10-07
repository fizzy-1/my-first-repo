import type { FieldDef, FieldOption, FormValues } from "@/components/forms/types";
import { toDateInput } from "@/lib/dates";
import { CAMPAIGN_CHANNEL, CAMPAIGN_STATUS, optionsOf } from "@/lib/labels";

export function campaignFields(users: FieldOption[]): FieldDef[] {
  return [
    { type: "text", name: "name", label: "Campaign name", required: true, span: 2 },
    { type: "select", name: "channel", label: "Channel", required: true, options: optionsOf(CAMPAIGN_CHANNEL) },
    { type: "select", name: "status", label: "Status", required: true, options: optionsOf(CAMPAIGN_STATUS) },
    { type: "date", name: "startDate", label: "Start date", required: true },
    { type: "date", name: "endDate", label: "End date" },
    { type: "money", name: "budget", label: "Budget", required: true },
    { type: "select", name: "ownerId", label: "Owner", options: users, emptyLabel: "Me" },
    { type: "multiselect", name: "memberIds", label: "Assigned team", options: users },
    { type: "textarea", name: "objective", label: "Objective", rows: 2, placeholder: "Measurable outcome, e.g. 1,200 trial sign-ups at under R40 per lead" },
    { type: "textarea", name: "targetAudience", label: "Target audience", rows: 2 },
    { type: "textarea", name: "description", label: "Description", rows: 3 },
  ];
}

export function campaignDefaults(c?: {
  name: string;
  description: string | null;
  objective: string | null;
  targetAudience: string | null;
  channel: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
  budget: number;
  ownerId: string | null;
  members: { userId: string }[];
}): FormValues {
  if (!c) return { status: "DRAFT", channel: "SOCIAL_MEDIA", startDate: toDateInput(new Date()) };
  return {
    name: c.name,
    description: c.description ?? "",
    objective: c.objective ?? "",
    targetAudience: c.targetAudience ?? "",
    channel: c.channel,
    status: c.status,
    startDate: toDateInput(c.startDate),
    endDate: toDateInput(c.endDate),
    budget: c.budget.toFixed(2),
    ownerId: c.ownerId ?? "",
    memberIds: c.members.map((m) => m.userId),
  };
}

export const metricFields = (campaignId: string): FieldDef[] => [
  { type: "hidden", name: "campaignId", value: campaignId },
  { type: "date", name: "periodStart", label: "Week of", required: true, hint: "Saved against the Monday of that week; re-entering a week corrects it." },
  { type: "money", name: "spend", label: "Spend", required: true },
  { type: "number", name: "impressions", label: "Impressions", required: true, min: 0 },
  { type: "number", name: "clicks", label: "Clicks", required: true, min: 0 },
  { type: "number", name: "leads", label: "Leads", required: true, min: 0 },
  { type: "number", name: "conversions", label: "Conversions", required: true, min: 0 },
  { type: "money", name: "revenue", label: "Revenue attributed", required: true },
];
