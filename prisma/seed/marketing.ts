import type { CampaignChannel, CampaignStatus, PrismaClient } from "@prisma/client";
import { startOfWeek } from "../../src/lib/dates";
import { DAY, NOW, between, demoId, round } from "./lib";
import type { UserIds } from "./people";

/** DEMO DATA — marketing campaigns and weekly performance. */
interface CampaignSeed {
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  startOffset: number;
  endOffset: number | null;
  budget: number;
  owner: string;
  members: string[];
  objective: string;
  audience: string;
  description: string;
  weeklySpend: number;
  cpl: number;
  conv: number;
}

const CAMPAIGNS: CampaignSeed[] = [
  { name: "Matric Final Exams Countdown 2026", channel: "SOCIAL_MEDIA", status: "ACTIVE", startOffset: -38, endOffset: 45, budget: 85000, owner: "johan", members: ["megan", "tshepo"], objective: "Drive 1,200 trial sign-ups before the NSC Mathematics papers.", audience: "Grade 12 learners and parents in Gauteng, KZN and Western Cape", description: "Daily exam-tip reels, past paper walkthrough clips and a countdown planner lead magnet.", weeklySpend: 7800, cpl: 38, conv: 0.24 },
  { name: "Always-on Search: Grade 12 Maths Help", channel: "SEARCH", status: "ACTIVE", startOffset: -210, endOffset: null, budget: 120000, owner: "johan", members: ["tshepo"], objective: "Capture high-intent search demand at below R60 per lead.", audience: "Searches for 'grade 12 maths help', 'calculus past papers', 'maths tutor online'", description: "Google search campaign with topic-specific landing pages.", weeklySpend: 3400, cpl: 52, conv: 0.31 },
  { name: "School Partnership Outreach — Gauteng", channel: "SCHOOL_OUTREACH", status: "ACTIVE", startOffset: -60, endOffset: 50, budget: 40000, owner: "michael", members: ["tshepo", "johan"], objective: "Book 15 principal meetings and convert 4 schools for 2027.", audience: "Principals and HODs at Gauteng public and independent schools", description: "District office introductions, school visits and a results-tracking demo.", weeklySpend: 2100, cpl: 420, conv: 0.18 },
  { name: "Parent WhatsApp Referral Programme", channel: "REFERRAL", status: "ACTIVE", startOffset: -95, endOffset: 30, budget: 25000, owner: "megan", members: ["megan"], objective: "Generate 300 referred sign-ups via parent groups.", audience: "Parents of existing learners", description: "Referral codes worth one free month shared via WhatsApp.", weeklySpend: 900, cpl: 14, conv: 0.42 },
  { name: "TikTok Maths Tips", channel: "SOCIAL_MEDIA", status: "PAUSED", startOffset: -150, endOffset: 20, budget: 30000, owner: "megan", members: ["megan"], objective: "Build awareness with short calculus and trig tips.", audience: "Grade 10–12 learners, 15–19", description: "Paused while creative is refreshed — CPL was above target.", weeklySpend: 1600, cpl: 71, conv: 0.11 },
  { name: "Back-to-School 2026", channel: "SOCIAL_MEDIA", status: "COMPLETED", startOffset: -280, endOffset: -235, budget: 60000, owner: "johan", members: ["tshepo", "megan"], objective: "Start the school year with 600 new learners.", audience: "Grade 11 and 12 learners and parents", description: "January launch with an annual-plan discount.", weeklySpend: 8900, cpl: 41, conv: 0.27 },
  { name: "Winter School Bootcamp 2026", channel: "EVENTS", status: "COMPLETED", startOffset: -120, endOffset: -88, budget: 35000, owner: "johan", members: ["tshepo"], objective: "Fill 180 seats across Johannesburg and Durban bootcamps.", audience: "Grade 12 learners", description: "Five-day holiday bootcamps focused on Paper 1 & 2 revision.", weeklySpend: 6200, cpl: 29, conv: 0.38 },
  { name: "Community Radio Matric Slots", channel: "RADIO", status: "COMPLETED", startOffset: -200, endOffset: -160, budget: 22000, owner: "tshepo", members: ["tshepo"], objective: "Reach learners outside metros.", audience: "Limpopo, Eastern Cape and North West listeners", description: "Sponsored matric study slots on community stations.", weeklySpend: 3700, cpl: 96, conv: 0.14 },
  { name: "2027 Early Bird Annual Plan", channel: "EMAIL", status: "PLANNING", startOffset: 26, endOffset: 85, budget: 60000, owner: "johan", members: ["megan", "tshepo"], objective: "Pre-sell 400 annual plans for the 2027 school year.", audience: "Current Grade 11 learners and their parents", description: "Email + social sequence with early-bird pricing (awaiting budget approval).", weeklySpend: 0, cpl: 0, conv: 0 },
  { name: "KZN School Expo Roadshow", channel: "EVENTS", status: "DRAFT", startOffset: 60, endOffset: 75, budget: 28000, owner: "tshepo", members: ["tshepo"], objective: "Meet 30 KZN schools in person.", audience: "KZN principals and maths HODs", description: "Stand at regional education expos in Durban and Pietermaritzburg.", weeklySpend: 0, cpl: 0, conv: 0 },
];

export async function seedMarketing(db: PrismaClient, users: UserIds) {
  const ids: Record<string, string> = {};
  const today = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate()));
  for (const c of CAMPAIGNS) {
    const id = demoId("cmp");
    ids[c.name] = id;
    const start = new Date(today.getTime() + c.startOffset * DAY);
    const end = c.endOffset === null ? null : new Date(today.getTime() + c.endOffset * DAY);
    await db.campaign.create({
      data: {
        id,
        name: c.name,
        description: c.description,
        objective: c.objective,
        targetAudience: c.audience,
        channel: c.channel,
        status: c.status,
        startDate: start,
        endDate: end,
        budget: c.budget,
        ownerId: users[c.owner],
        members: { create: c.members.map((m) => ({ userId: users[m] })) },
      },
    });
    if (!c.weeklySpend) continue;
    const metricEnd = end && end < today ? end : today;
    let week = startOfWeek(start);
    while (week <= metricEnd) {
      const periodStart = new Date(Date.UTC(new Date(week.getTime() + 7_200_000).getUTCFullYear(), new Date(week.getTime() + 7_200_000).getUTCMonth(), new Date(week.getTime() + 7_200_000).getUTCDate()));
      const spend = round(c.weeklySpend * between(0.75, 1.2), 0.01);
      const leads = Math.max(1, Math.round(spend / (c.cpl * between(0.8, 1.25))));
      const conversions = Math.round(leads * c.conv * between(0.8, 1.2));
      await db.campaignMetric.create({
        data: {
          id: demoId("cmm"),
          campaignId: id,
          periodStart,
          spend,
          impressions: Math.round(spend * between(55, 120)),
          clicks: Math.round(spend * between(0.9, 2.4)),
          leads,
          conversions,
          revenue: round(conversions * between(149, 260), 0.01),
        },
      });
      week = new Date(week.getTime() + 7 * DAY);
    }
  }
  return ids;
}
