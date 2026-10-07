import type { BillingFrequency, PartnershipStatus, PrismaClient, Province, SchoolStage, SchoolType } from "@prisma/client";
import { calendarDate } from "../../src/lib/dates";
import { at, dateOffset, daysAgo, demoId, int, pick, rand } from "./lib";
import type { UserIds } from "./people";

/** DEMO DATA — fictional schools (names are invented for demonstration). */
interface SchoolSeed {
  name: string;
  type: SchoolType;
  province: Province;
  city: string;
  stage: SchoolStage;
  learners: number;
  potential: number;
  value: number;
  owner: "michael" | "johan" | "lerato" | "tshepo";
  partnership?: { status: PartnershipStatus; startMonthsAgo: number; months: number; covered: number; billing: BillingFrequency };
  lostReason?: string;
}

const SCHOOLS: SchoolSeed[] = [
  // Active partners
  { name: "Ridgeview College", type: "INDEPENDENT", province: "GAUTENG", city: "Johannesburg", stage: "ACTIVE", learners: 820, potential: 140, value: 186000, owner: "michael", partnership: { status: "ACTIVE", startMonthsAgo: 13, months: 13, covered: 120, billing: "QUARTERLY" } },
  { name: "Kopanong Secondary School", type: "PUBLIC", province: "GAUTENG", city: "Soweto", stage: "ACTIVE", learners: 1340, potential: 260, value: 96000, owner: "johan", partnership: { status: "ACTIVE", startMonthsAgo: 10, months: 24, covered: 180, billing: "QUARTERLY" } },
  { name: "Umgeni Heights High School", type: "PUBLIC", province: "KWAZULU_NATAL", city: "Durban", stage: "ACTIVE", learners: 1120, potential: 210, value: 84000, owner: "michael", partnership: { status: "ACTIVE", startMonthsAgo: 8, months: 12, covered: 150, billing: "QUARTERLY" } },
  { name: "Table Bay Academy", type: "INDEPENDENT", province: "WESTERN_CAPE", city: "Cape Town", stage: "ACTIVE", learners: 640, potential: 110, value: 142000, owner: "michael", partnership: { status: "ACTIVE", startMonthsAgo: 7, months: 12, covered: 95, billing: "MONTHLY" } },
  { name: "Thuto-Lesedi Secondary", type: "PUBLIC", province: "NORTH_WEST", city: "Rustenburg", stage: "ACTIVE", learners: 980, potential: 190, value: 62000, owner: "johan", partnership: { status: "ACTIVE", startMonthsAgo: 5, months: 12, covered: 110, billing: "QUARTERLY" } },
  { name: "Mzansi Science & Maths Academy", type: "INDEPENDENT", province: "GAUTENG", city: "Pretoria", stage: "ACTIVE", learners: 560, potential: 120, value: 128000, owner: "lerato", partnership: { status: "ACTIVE", startMonthsAgo: 3, months: 12, covered: 85, billing: "MONTHLY" } },
  // Signed, starting soon
  { name: "Vaal Triangle High School", type: "PUBLIC", province: "GAUTENG", city: "Vanderbijlpark", stage: "PARTNERSHIP", learners: 1050, potential: 200, value: 74000, owner: "johan", partnership: { status: "SIGNED", startMonthsAgo: -1, months: 12, covered: 120, billing: "QUARTERLY" } },
  { name: "Polokwane Excellence College", type: "INDEPENDENT", province: "LIMPOPO", city: "Polokwane", stage: "PARTNERSHIP", learners: 480, potential: 95, value: 88000, owner: "michael", partnership: { status: "SIGNED", startMonthsAgo: -1, months: 12, covered: 70, billing: "QUARTERLY" } },
  // Negotiation
  { name: "Highveld Girls' High School", type: "PUBLIC", province: "MPUMALANGA", city: "Mbombela", stage: "NEGOTIATION", learners: 900, potential: 170, value: 92000, owner: "michael" },
  { name: "Berea Park Secondary", type: "PUBLIC", province: "KWAZULU_NATAL", city: "Pietermaritzburg", stage: "NEGOTIATION", learners: 1210, potential: 230, value: 78000, owner: "johan" },
  { name: "St Augustine's College", type: "INDEPENDENT", province: "EASTERN_CAPE", city: "Gqeberha", stage: "NEGOTIATION", learners: 620, potential: 115, value: 134000, owner: "michael" },
  // Proposal
  { name: "Mangaung Comprehensive School", type: "PUBLIC", province: "FREE_STATE", city: "Bloemfontein", stage: "PROPOSAL", learners: 1080, potential: 200, value: 70000, owner: "tshepo" },
  { name: "Atlantic Seaboard High", type: "PUBLIC", province: "WESTERN_CAPE", city: "Cape Town", stage: "PROPOSAL", learners: 840, potential: 150, value: 82000, owner: "johan" },
  { name: "Kimberley Technical High", type: "PUBLIC", province: "NORTHERN_CAPE", city: "Kimberley", stage: "PROPOSAL", learners: 760, potential: 140, value: 58000, owner: "tshepo" },
  { name: "Lowveld Academy", type: "INDEPENDENT", province: "MPUMALANGA", city: "Nelspruit", stage: "PROPOSAL", learners: 430, potential: 80, value: 96000, owner: "michael" },
  // Meeting
  { name: "Alexandra Secondary School", type: "PUBLIC", province: "GAUTENG", city: "Johannesburg", stage: "MEETING", learners: 1420, potential: 280, value: 84000, owner: "johan" },
  { name: "East London Grammar", type: "INDEPENDENT", province: "EASTERN_CAPE", city: "East London", stage: "MEETING", learners: 520, potential: 100, value: 110000, owner: "michael" },
  { name: "Tshwane North High School", type: "PUBLIC", province: "GAUTENG", city: "Pretoria", stage: "MEETING", learners: 1180, potential: 220, value: 76000, owner: "tshepo" },
  { name: "Ballito Bay College", type: "INDEPENDENT", province: "KWAZULU_NATAL", city: "Ballito", stage: "MEETING", learners: 390, potential: 75, value: 92000, owner: "johan" },
  // Contacted
  { name: "Mthatha Secondary School", type: "PUBLIC", province: "EASTERN_CAPE", city: "Mthatha", stage: "CONTACTED", learners: 1260, potential: 240, value: 64000, owner: "tshepo" },
  { name: "Stellenberg High School", type: "PUBLIC", province: "WESTERN_CAPE", city: "Bellville", stage: "CONTACTED", learners: 1030, potential: 190, value: 72000, owner: "johan" },
  { name: "Thohoyandou Maths Centre", type: "INDEPENDENT", province: "LIMPOPO", city: "Thohoyandou", stage: "CONTACTED", learners: 350, potential: 90, value: 54000, owner: "tshepo" },
  { name: "Klerksdorp High School", type: "PUBLIC", province: "NORTH_WEST", city: "Klerksdorp", stage: "CONTACTED", learners: 960, potential: 180, value: 60000, owner: "tshepo" },
  { name: "Midrand Preparatory College", type: "INDEPENDENT", province: "GAUTENG", city: "Midrand", stage: "CONTACTED", learners: 450, potential: 85, value: 104000, owner: "michael" },
  { name: "Welkom Secondary School", type: "PUBLIC", province: "FREE_STATE", city: "Welkom", stage: "CONTACTED", learners: 880, potential: 160, value: 56000, owner: "tshepo" },
  // Prospects
  { name: "Mafikeng High School", type: "PUBLIC", province: "NORTH_WEST", city: "Mahikeng", stage: "PROSPECT", learners: 940, potential: 170, value: 58000, owner: "tshepo" },
  { name: "Umlazi Comprehensive Secondary", type: "PUBLIC", province: "KWAZULU_NATAL", city: "Umlazi", stage: "PROSPECT", learners: 1500, potential: 300, value: 80000, owner: "johan" },
  { name: "Paarl Valley High", type: "PUBLIC", province: "WESTERN_CAPE", city: "Paarl", stage: "PROSPECT", learners: 870, potential: 160, value: 66000, owner: "johan" },
  { name: "Witbank Christian College", type: "INDEPENDENT", province: "MPUMALANGA", city: "eMalahleni", stage: "PROSPECT", learners: 410, potential: 80, value: 86000, owner: "michael" },
  { name: "Upington High School", type: "PUBLIC", province: "NORTHERN_CAPE", city: "Upington", stage: "PROSPECT", learners: 690, potential: 120, value: 50000, owner: "tshepo" },
  { name: "Tembisa West Secondary", type: "PUBLIC", province: "GAUTENG", city: "Tembisa", stage: "PROSPECT", learners: 1360, potential: 260, value: 78000, owner: "tshepo" },
  { name: "Queenstown Girls' High", type: "PUBLIC", province: "EASTERN_CAPE", city: "Komani", stage: "PROSPECT", learners: 720, potential: 135, value: 62000, owner: "johan" },
  // Lost / expired
  { name: "Sandton Ridge College", type: "INDEPENDENT", province: "GAUTENG", city: "Sandton", stage: "LOST", learners: 600, potential: 110, value: 150000, owner: "michael", lostReason: "Chose an in-house tutoring programme for 2026." },
  { name: "Seshego High School", type: "PUBLIC", province: "LIMPOPO", city: "Polokwane", stage: "LOST", learners: 1100, potential: 200, value: 52000, owner: "tshepo", lostReason: "No budget available this financial year (re-approach in Feb)." },
  { name: "George Secondary School", type: "PUBLIC", province: "WESTERN_CAPE", city: "George", stage: "LOST", learners: 830, potential: 150, value: 60000, owner: "johan", partnership: { status: "EXPIRED", startMonthsAgo: 16, months: 12, covered: 90, billing: "QUARTERLY" }, lostReason: "Pilot partnership not renewed after principal changed." },
];

const PROBABILITY: Record<SchoolStage, number> = { PROSPECT: 10, CONTACTED: 20, MEETING: 35, PROPOSAL: 50, NEGOTIATION: 70, PARTNERSHIP: 95, ACTIVE: 100, LOST: 0 };

const CONTACT_ROLES = ["Principal", "Deputy Principal (Academics)", "HOD: Mathematics", "Grade 12 Phase Head", "Bursar", "SGB Chairperson"];
const FIRST = ["Thabo", "Naledi", "Sibusiso", "Anele", "Pretty", "Gugu", "Mandla", "Elize", "Hendrik", "Nadia", "Rashid", "Busisiwe", "Jabu", "Karabo", "Lungile", "Marlene", "Themba", "Refilwe"];
const LAST = ["Mahlangu", "Ngcobo", "Van Wyk", "Pillay", "Mabena", "Dube", "Le Roux", "Mokoena", "Ismail", "Shabalala", "Botha", "Radebe", "Nel", "Govender", "Maseko", "Kruger"];

const NOTES = [
  "Principal keen; wants pricing per Grade 12 learner and a results-tracking report for the SGB.",
  "HOD Maths confirmed 4 Grade 12 classes (~160 learners). Mock exam results were weak in Paper 2 (Geometry & Trig).",
  "Sent proposal deck and sample learner progress report. Follow up after their staff meeting.",
  "Requested a demo for the maths department during the Thursday afternoon slot.",
  "Budget discussions with the bursar — prefer quarterly invoicing aligned to school terms.",
  "Data costs are a concern for learners; highlighted offline downloads and zero-rated roadmap item.",
  "Asked for references from other partner schools in the province.",
  "Agreed to a 2-week pilot with one Grade 12 class before committing.",
];

export async function seedSchools(db: PrismaClient, users: UserIds) {
  const schoolIds: { id: string; seed: SchoolSeed; emis: string }[] = [];
  const today = dateOffset(0);

  for (const [i, s] of SCHOOLS.entries()) {
    const id = demoId("sch");
    const emis = `${700000000 + i * 1371}`;
    schoolIds.push({ id, seed: s, emis });
    const open = !["ACTIVE", "PARTNERSHIP", "LOST"].includes(s.stage);
    const followUpOffset = open ? pick([-6, -3, -1, 1, 2, 3, 5, 7, 9, 12, 16]) : s.stage === "ACTIVE" ? int(10, 40) : null;
    await db.school.create({
      data: {
        id,
        name: s.name,
        emisNumber: emis,
        type: s.type,
        province: s.province,
        city: s.city,
        address: `${int(2, 180)} ${pick(["Main", "Church", "School", "Market", "Station", "Park"])} Road, ${s.city}`,
        phone: `+27 ${int(10, 58)} ${int(100, 999)} ${int(1000, 9999)}`,
        email: `info@${s.name.toLowerCase().replace(/[^a-z]+/g, "")}.demo`,
        learnerCount: s.learners,
        potentialLearners: s.potential,
        stage: s.stage,
        stageChangedAt: daysAgo(int(3, 90)),
        expectedAnnualValue: s.value,
        probability: PROBABILITY[s.stage],
        ownerId: users[s.owner],
        nextFollowUpAt: followUpOffset === null ? null : at(followUpOffset, 10),
        lostReason: s.lostReason ?? null,
        source: pick(["Referral", "School expo", "Cold outreach", "Inbound enquiry", "District office introduction"]),
        createdAt: daysAgo(s.stage === "PROSPECT" ? int(1, 40) : int(60, 420)),
      },
    });

    const contacts = int(1, 3);
    for (let c = 0; c < contacts; c++) {
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      await db.schoolContact.create({
        data: {
          id: demoId("sct"),
          schoolId: id,
          name,
          position: CONTACT_ROLES[c === 0 ? 0 : int(1, CONTACT_ROLES.length - 1)],
          email: `${name.split(" ")[0].toLowerCase()}@${s.name.toLowerCase().replace(/[^a-z]+/g, "")}.demo`,
          phone: `+27 ${int(60, 84)} ${int(100, 999)} ${int(1000, 9999)}`,
          isPrimary: c === 0,
        },
      });
    }

    if (s.stage !== "PROSPECT") {
      const noteCount = int(1, 4);
      for (let n = 0; n < noteCount; n++) {
        await db.schoolNote.create({
          data: { id: demoId("snt"), schoolId: id, authorId: users[s.owner], body: pick(NOTES), createdAt: daysAgo(int(2, 120)) },
        });
      }
    }

    if (s.partnership) {
      const p = s.partnership;
      const start = calendarDate(today.getUTCFullYear(), today.getUTCMonth() - p.startMonthsAgo, 1);
      // One active contract ends within the next few weeks so renewals show up as deadlines.
      const end = i === 0 ? dateOffset(24) : calendarDate(start.getUTCFullYear(), start.getUTCMonth() + p.months, 0);
      await db.partnership.create({
        data: {
          id: demoId("prt"),
          schoolId: id,
          status: p.status,
          startDate: start,
          endDate: end,
          annualValue: s.value,
          learnersCovered: p.covered,
          billingFrequency: p.billing,
          signedAt: new Date(start.getTime() - int(10, 30) * 86_400_000),
          notes: p.status === "EXPIRED" ? "Pilot year completed; renewal declined." : "Includes learner progress reports per term and teacher dashboard access.",
        },
      });
    }
  }

  void rand;
  return schoolIds;
}
