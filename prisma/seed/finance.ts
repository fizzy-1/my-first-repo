import type { ExpenseCategory, ExpenseStatus, IncomeCategory, PaymentMethod, PrismaClient } from "@prisma/client";
import { calendarDate } from "../../src/lib/dates";
import { DAY, NOW, between, chance, dateOffset, demoId, int, monthStartDate, pick, round } from "./lib";
import { SEED_USERS, type UserIds } from "./people";

/** DEMO DATA — finance ledger in South African Rand. */
interface SchoolRef {
  id: string;
  seed: { name: string; value: number; partnership?: { status: string; startMonthsAgo: number; months: number; billing: string } };
}

type Dept = "executive" | "finance" | "marketing" | "academic" | "technology" | "operations";

export async function seedFinance(db: PrismaClient, users: UserIds, departments: Map<string, string>, schools: SchoolRef[]) {
  const today = dateOffset(0);
  const dept = (d: Dept) => departments.get(d)!;

  // ── Cash accounts: founders' capital (Feb 2025) and the seed round deposit (Jul 2025) ──
  await db.cashAccount.createMany({
    data: [
      { id: demoId("cash"), name: "Business Cheque Account", institution: "Demo Bank", openingBalance: 900000, openingDate: monthStartDate(20) },
      { id: demoId("cash"), name: "Seed Round Call Account", institution: "Demo Bank", openingBalance: 5300000, openingDate: monthStartDate(15) },
    ],
  });

  // ── Income: school contract invoices ──
  const income: {
    id: string;
    date: Date;
    customer: string;
    schoolId: string | null;
    description: string;
    category: IncomeCategory;
    amount: number;
    paymentMethod: PaymentMethod | null;
    reference: string;
    status: "INVOICED" | "RECEIVED" | "OVERDUE";
    dueDate: Date;
    receivedAt: Date | null;
    createdById: string;
  }[] = [];
  let inv = 1000;
  let overdueBudget = 2;
  for (const s of schools) {
    const p = s.seed.partnership;
    if (!p || p.status === "SIGNED") continue;
    const step = p.billing === "MONTHLY" ? 1 : 3;
    const amount = round(s.seed.value / (12 / step), 0.01);
    const start = monthStartDate(p.startMonthsAgo);
    for (let m = 0; m < p.months; m += step) {
      const date = calendarDate(start.getUTCFullYear(), start.getUTCMonth() + m, 1);
      if (date > today) break;
      const dueDate = new Date(date.getTime() + 30 * DAY);
      const due = dueDate < today;
      let status: "INVOICED" | "RECEIVED" | "OVERDUE" = "INVOICED";
      let receivedAt: Date | null = null;
      if (due) {
        if (overdueBudget > 0 && date > dateOffset(-75) && chance(0.6)) {
          status = "OVERDUE";
          overdueBudget -= 1;
        } else {
          status = "RECEIVED";
          receivedAt = new Date(date.getTime() + int(12, 34) * DAY);
          if (receivedAt > today) receivedAt = today;
        }
      } else if (chance(0.3)) {
        status = "RECEIVED";
        receivedAt = new Date(date.getTime() + int(5, 15) * DAY);
        if (receivedAt > today) {
          status = "INVOICED";
          receivedAt = null;
        }
      }
      income.push({
        id: demoId("inc"),
        date,
        customer: s.seed.name,
        schoolId: s.id,
        description: `Partnership fee — ${p.billing === "MONTHLY" ? "monthly" : "quarterly"} instalment`,
        category: "SCHOOL_CONTRACT",
        amount,
        paymentMethod: "EFT",
        reference: `INV-${++inv}`,
        status,
        dueDate,
        receivedAt,
        createdById: users.ayesha,
      });
    }
  }

  // ── Income: workshops, grants, sponsorship, consulting, interest ──
  const other: [number, string, string, IncomeCategory, number][] = [
    [-15, "Holiday bootcamp learners (via PayFast)", "Winter School Maths Bootcamp 2025 — Johannesburg", "WORKSHOP", 38400],
    [-14, "Parents (Saturday classes)", "Matric Prep Saturday Classes — Term 3 2025", "WORKSHOP", 22500],
    [-11, "Ubuntu Community Bank Foundation", "CSI sponsorship: township schools maths access programme", "SPONSORSHIP", 180000],
    [-8, "Learnwise EdTech (Pty) Ltd", "Curriculum review & CAPS alignment consulting", "CONSULTING", 45000],
    [-7, "Services SETA", "Skills development grant — tranche 1", "GRANT", 250000],
    [-6, "Holiday bootcamp learners (via PayFast)", "Easter Holiday Revision Camp 2026", "WORKSHOP", 29700],
    [-3, "Holiday bootcamp learners (via PayFast)", "Winter School Maths Bootcamp 2026 — JHB & Durban", "WORKSHOP", 64800],
    [-1, "Services SETA", "Skills development grant — tranche 2", "GRANT", 150000],
  ];
  for (const [monthsAgo, customer, description, category, amount] of other) {
    const date = calendarDate(today.getUTCFullYear(), today.getUTCMonth() + monthsAgo, int(5, 20));
    const receivedAt = new Date(date.getTime() + int(0, 20) * DAY);
    const received = receivedAt <= today;
    income.push({
      id: demoId("inc"),
      date,
      customer,
      schoolId: null,
      description,
      category,
      amount,
      paymentMethod: category === "WORKSHOP" ? "PAYFAST" : "EFT",
      reference: `INV-${++inv}`,
      status: received ? "RECEIVED" : "INVOICED",
      dueDate: new Date(date.getTime() + 30 * DAY),
      receivedAt: received ? receivedAt : null,
      createdById: users.ayesha,
    });
  }
  for (let m = 15; m >= 1; m--) {
    const date = calendarDate(today.getUTCFullYear(), today.getUTCMonth() - m + 1, 0); // month end
    income.push({
      id: demoId("inc"),
      date,
      customer: "Demo Bank",
      schoolId: null,
      description: "Interest earned — call account",
      category: "INTEREST",
      amount: round(between(9000, 21000) * (m / 15 + 0.3), 0.01),
      paymentMethod: "EFT",
      reference: `INT-${date.toISOString().slice(0, 7)}`,
      status: "RECEIVED",
      dueDate: date,
      receivedAt: date,
      createdById: users.ayesha,
    });
  }
  await db.income.createMany({ data: income });

  // ── Expenses ──
  const expenses: {
    id: string;
    date: Date;
    supplier: string;
    description: string;
    category: ExpenseCategory;
    departmentId: string;
    amount: number;
    status: ExpenseStatus;
    dueDate: Date | null;
    paidAt: Date | null;
    paymentMethod: PaymentMethod | null;
    reference: string | null;
    submittedById: string;
  }[] = [];

  const push = (
    date: Date,
    supplier: string,
    description: string,
    category: ExpenseCategory,
    d: Dept,
    amount: number,
    submitter: string,
    opts: { status?: ExpenseStatus; method?: PaymentMethod } = {},
  ) => {
    if (date > today) return;
    const isCurrentMonth = date >= monthStartDate(0);
    let status: ExpenseStatus = opts.status ?? "PAID";
    if (!opts.status && isCurrentMonth && chance(0.35)) status = "APPROVED";
    const paidAt = status === "PAID" ? new Date(Math.min(date.getTime() + int(0, 10) * DAY, today.getTime())) : null;
    expenses.push({
      id: demoId("exp"),
      date,
      supplier,
      description,
      category,
      departmentId: dept(d),
      amount: round(amount, 0.01),
      status,
      dueDate: status === "PAID" ? null : new Date(date.getTime() + int(7, 30) * DAY),
      paidAt: paidAt ? calendarDate(paidAt.getUTCFullYear(), paidAt.getUTCMonth(), paidAt.getUTCDate()) : null,
      paymentMethod: opts.method ?? (category === "SALARIES" || category === "CONTRACTORS" ? "EFT" : pick(["CARD", "EFT", "DEBIT_ORDER"] as const)),
      reference: `PO-${expenses.length + 3000}`,
      submittedById: submitter,
    });
  };

  for (let m = 20; m >= 0; m--) {
    const ms = monthStartDate(m);
    const age = 20 - m;
    const day = (d: number) => calendarDate(ms.getUTCFullYear(), ms.getUTCMonth(), d);
    const monthLabel = ms.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

    // Payroll per department, from each person's start date (aggregated — individual pay is not exposed here).
    const payroll = new Map<string, { salaries: number; contractors: number }>();
    for (const u of SEED_USERS) {
      if (u.startDate > ms) continue;
      const entry = payroll.get(u.department) ?? { salaries: 0, contractors: 0 };
      if (u.employmentType === "CONTRACTOR") entry.contractors += u.monthlyCost * between(0.85, 1.1);
      else entry.salaries += u.monthlyCost;
      payroll.set(u.department, entry);
    }
    for (const [d, totals] of payroll) {
      if (totals.salaries) push(day(25), "Payroll (via bank)", `Salaries — ${d[0].toUpperCase()}${d.slice(1)} (${monthLabel})`, "SALARIES", d as Dept, totals.salaries, users.ayesha, { status: day(25) <= today ? "PAID" : undefined, method: "EFT" });
      if (totals.contractors) push(day(28), "Contractor invoices", `Contractor fees — ${d[0].toUpperCase()}${d.slice(1)} (${monthLabel})`, "CONTRACTORS", d as Dept, totals.contractors, users.ayesha, { method: "EFT" });
    }

    push(day(3), "Amazon Web Services (af-south-1)", "Cloud hosting — Cape Town region", "HOSTING", "technology", 5200 + age * 420 + between(-300, 300), users.pieter, { method: "CARD" });
    push(day(3), "Mux", "Video streaming & encoding", "HOSTING", "technology", 1500 + age * 280 + between(-150, 150), users.pieter, { method: "CARD" });
    push(day(4), "Vercel", "Web hosting (Pro team)", "HOSTING", "technology", 1850, users.pieter, { method: "CARD" });
    push(day(2), "Google Workspace", "Email & productivity licences", "SOFTWARE", "operations", 160 * (6 + Math.min(age, 11)), users.lerato, { method: "CARD" });
    push(day(5), "GitHub", "Team plan & Actions minutes", "SOFTWARE", "technology", 1100 + age * 40, users.pieter, { method: "CARD" });
    if (age >= 2) push(day(6), "HubSpot", "CRM Starter seats", "SOFTWARE", "marketing", 1650, users.johan, { method: "CARD" });
    push(day(7), "Xero", "Accounting software", "SOFTWARE", "finance", 890, users.ayesha, { method: "CARD" });
    push(day(1), "Braamfontein Co-Work Hub", "Co-working desks", "OFFICE", "operations", age < 6 ? 6200 : 9400, users.lerato, { method: "DEBIT_ORDER" });
    push(day(26), "Demo Bank", "Monthly bank charges", "BANK_FEES", "finance", between(380, 690), users.ayesha, { method: "DEBIT_ORDER" });
    push(day(15), "Mokoena & Partners Inc.", "Monthly bookkeeping & payroll services", "PROFESSIONAL_FEES", "finance", 4600, users.ayesha, { method: "EFT" });

    const cal = ms.getUTCMonth();
    const season = [1.5, 1.4, 1.0, 0.8, 0.9, 1.2, 1.1, 1.2, 1.4, 1.5, 0.6, 0.4][cal];
    if (age >= 1) {
      push(day(10), "Meta Platforms Ireland", "Facebook & Instagram ads", "MARKETING", "marketing", (7000 + age * 650) * season, users.johan, { method: "CARD" });
      push(day(12), "Google Ireland", "Search ads — Grade 12 maths keywords", "MARKETING", "marketing", (5000 + age * 450) * season, users.johan, { method: "CARD" });
      if (age >= 9) push(day(14), "TikTok", "Short-form video ads", "MARKETING", "marketing", 3500 * season, users.megan, { method: "CARD" });
      push(day(18), "Uber / Flysafair", "School visits & travel", "TRAVEL", "marketing", between(1800, 8200), users.tshepo);
      push(day(20), "Freelance video editor", "Lesson video editing", "CONTENT_PRODUCTION", "academic", between(5500, 12500), users.nomvula, { method: "EFT" });
    }
    if (chance(0.3)) push(day(22), "Print Express Rosebank", "Flyers & school posters", "MARKETING", "marketing", between(2500, 9000), users.tshepo);
    if (chance(0.25)) push(day(16), "Training provider", "Team training & workshops", "TRAINING", pick(["technology", "academic", "marketing"] as Dept[]), between(3000, 9500), users.lerato);
  }

  // One-off capital and professional expenses.
  const oneOffs: [number, string, string, ExpenseCategory, Dept, number, string][] = [
    [-19, "Orms Direct", "Recording kit: 2 × mirrorless cameras, lenses, lighting", "EQUIPMENT", "academic", 28650, "nomvula"],
    [-16, "Incredible Connection", "3 × developer laptops", "EQUIPMENT", "technology", 61500, "pieter"],
    [-12, "Van Rensburg Attorneys Inc.", "Partnership agreement template & POPIA review", "PROFESSIONAL_FEES", "executive", 18500, "michael"],
    [-9, "Rode / Pro Audio SA", "Lavalier microphones & audio interface", "EQUIPMENT", "academic", 9800, "nomvula"],
    [-5, "CIPC", "Annual return & company secretarial", "PROFESSIONAL_FEES", "finance", 3200, "ayesha"],
    [-4, "Expo SA", "School expo stand — KZN Education Indaba", "MARKETING", "marketing", 14500, "johan"],
    [-2, "Studio 44 Media", "Studio hire: Winter School recordings", "CONTENT_PRODUCTION", "academic", 16800, "nomvula"],
  ];
  for (const [mo, supplier, description, category, d, amount, by] of oneOffs) {
    push(calendarDate(today.getUTCFullYear(), today.getUTCMonth() + mo, int(5, 22)), supplier, description, category, d, amount, users[by]);
  }

  // Current-month items awaiting approval (linked to approval requests in the work seed).
  const pendingSpecs: [string, string, ExpenseCategory, Dept, number, string][] = [
    ["Orms Direct", "Second recording kit for Physical Sciences course", "EQUIPMENT", "academic", 38500, "nomvula"],
    ["Expo SA", "Stand booking — Gauteng Matric Expo 2026", "MARKETING", "marketing", 12800, "johan"],
    ["Amazon Web Services (af-south-1)", "Reserved instances (1-year) for production database", "HOSTING", "technology", 46200, "pieter"],
  ];
  const pendingExpenseIds: string[] = [];
  for (const [supplier, description, category, d, amount, by] of pendingSpecs) {
    const id = demoId("exp");
    pendingExpenseIds.push(id);
    expenses.push({
      id,
      date: dateOffset(-int(1, 5)),
      supplier,
      description,
      category,
      departmentId: dept(d),
      amount,
      status: "PENDING_APPROVAL",
      dueDate: dateOffset(int(10, 25)),
      paidAt: null,
      paymentMethod: "EFT",
      reference: `PO-${expenses.length + 3000}`,
      submittedById: users[by],
    });
  }

  await db.expense.createMany({ data: expenses });

  // ── Budgets (FY2026 = calendar 2026) ──
  const fy = today.getUTCFullYear();
  const budgets: { name: string; type: "ANNUAL" | "DEPARTMENT" | "MARKETING" | "TECHNOLOGY" | "ACADEMIC"; dept: Dept | null; lines: [ExpenseCategory, number][]; by: string; notes: string }[] = [
    {
      name: `FY${fy} Company Operating Budget`,
      type: "ANNUAL",
      dept: null,
      by: "ayesha",
      notes: "Board-approved operating budget. Excludes capital raised.",
      lines: [
        ["SALARIES", 4_150_000],
        ["CONTRACTORS", 1_050_000],
        ["MARKETING", 420_000],
        ["HOSTING", 190_000],
        ["SOFTWARE", 95_000],
        ["EQUIPMENT", 90_000],
        ["CONTENT_PRODUCTION", 150_000],
        ["OFFICE", 115_000],
        ["TRAVEL", 70_000],
        ["PROFESSIONAL_FEES", 80_000],
        ["BANK_FEES", 7_000],
        ["TRAINING", 40_000],
      ],
    },
    {
      name: `Marketing Budget ${fy}`,
      type: "MARKETING",
      dept: "marketing",
      by: "johan",
      notes: "Includes paid media, events and school outreach travel.",
      lines: [
        ["MARKETING", 380_000],
        ["TRAVEL", 65_000],
        ["SOFTWARE", 22_000],
        ["SALARIES", 960_000],
      ],
    },
    {
      name: `Technology Budget ${fy}`,
      type: "TECHNOLOGY",
      dept: "technology",
      by: "pieter",
      notes: "Hosting assumes ~40% learner growth in H2.",
      lines: [
        ["HOSTING", 165_000],
        ["SOFTWARE", 18_000],
        ["EQUIPMENT", 45_000],
        ["SALARIES", 1_500_000],
        ["CONTRACTORS", 380_000],
      ],
    },
    {
      name: `Academic Budget ${fy}`,
      type: "ACADEMIC",
      dept: "academic",
      by: "nomvula",
      notes: "Content production for Gr 11/12 Maths and the Physical Sciences build.",
      lines: [
        ["CONTENT_PRODUCTION", 160_000],
        ["CONTRACTORS", 560_000],
        ["EQUIPMENT", 50_000],
        ["SALARIES", 450_000],
      ],
    },
    {
      name: `Operations Budget ${fy}`,
      type: "DEPARTMENT",
      dept: "operations",
      by: "lerato",
      notes: "Office, admin tooling and the operations team.",
      lines: [
        ["OFFICE", 115_000],
        ["SOFTWARE", 30_000],
        ["SALARIES", 552_000],
      ],
    },
  ];
  for (const b of budgets) {
    await db.budget.create({
      data: {
        id: demoId("bud"),
        name: b.name,
        type: b.type,
        fiscalYear: fy,
        departmentId: b.dept ? dept(b.dept) : null,
        notes: b.notes,
        createdById: users[b.by],
        lines: { create: b.lines.map(([category, amount]) => ({ id: demoId("bdl"), category, amount })) },
      },
    });
  }

  return { pendingExpenseIds, now: NOW };
}

export async function seedProjections(db: PrismaClient, users: UserIds, startingCash: number, payingLearners: number) {
  const today = dateOffset(0);
  const startMonth = calendarDate(today.getUTCFullYear(), today.getUTCMonth() + 1, 1);
  const scenarios = [
    { name: "Conservative — slower 2027 intake", scenario: "CONSERVATIVE" as const, newL: 220, growth: 0.005, churn: 0.065, price: 152, school: 55000, schoolGrowth: 0.01, salaries: 395000, salaryGrowth: 0.005, marketing: 30000, tech: 26000, other: 24000, notes: "Assumes no new school partnerships beyond those signed and flat paid media." },
    { name: "Base — 2027 operating plan", scenario: "BASE" as const, newL: 300, growth: 0.02, churn: 0.05, price: 159, school: 72000, schoolGrowth: 0.03, salaries: 405000, salaryGrowth: 0.01, marketing: 48000, tech: 30000, other: 26000, notes: "Board base case: Physical Sciences launch in Q2 and 4 new schools per term." },
    { name: "Aggressive — Series A growth", scenario: "AGGRESSIVE" as const, newL: 420, growth: 0.04, churn: 0.04, price: 165, school: 95000, schoolGrowth: 0.06, salaries: 470000, salaryGrowth: 0.02, marketing: 95000, tech: 42000, other: 32000, notes: "Requires Series A funding: national marketing push and two additional developers." },
  ];
  for (const s of scenarios) {
    await db.financialProjection.create({
      data: {
        id: demoId("prj"),
        name: s.name,
        scenario: s.scenario,
        startMonth,
        horizonMonths: 18,
        startingLearners: payingLearners,
        monthlyNewLearners: s.newL,
        newLearnerGrowthRate: s.growth,
        monthlyChurnRate: s.churn,
        avgSubscriptionPrice: s.price,
        schoolRevenueMonthly: s.school,
        schoolRevenueGrowthRate: s.schoolGrowth,
        salariesMonthly: s.salaries,
        salaryGrowthRate: s.salaryGrowth,
        marketingMonthly: s.marketing,
        technologyMonthly: s.tech,
        otherExpensesMonthly: s.other,
        startingCash: Math.round(startingCash),
        notes: s.notes,
        createdById: users.ayesha,
      },
    });
  }
}
