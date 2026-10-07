import type { ApprovalDecisionType, ApprovalStatus, ApprovalType, MeetingType, ObjectiveMetric, ObjectiveStatus, Priority, PrismaClient, TaskStatus } from "@prisma/client";
import { calendarDate, endOfSastDay } from "../../src/lib/dates";
import { DAY, NOW, at, chance, dateOffset, daysAgo, demoId, int, pick } from "./lib";
import type { UserIds } from "./people";

/** DEMO DATA — projects, tasks, meetings, approvals, objectives and announcements. */
type Dept = "executive" | "finance" | "marketing" | "academic" | "technology" | "operations";

export async function seedWork(
  db: PrismaClient,
  ctx: {
    users: UserIds;
    departments: Map<string, string>;
    schools: Map<string, string>;
    campaigns: Record<string, string>;
    features: Record<string, string>;
    bugIds: string[];
    documents: Map<string, string>;
    pendingExpenseIds: string[];
  },
) {
  const { users } = ctx;
  const dept = (d: Dept) => ctx.departments.get(d)!;
  const today = dateOffset(0);

  // ── Projects ──
  const projects: Record<string, string> = {};
  const projectSeeds: [string, string, "ACTIVE" | "PLANNING" | "COMPLETED" | "ON_HOLD", string, Dept, number, number][] = [
    ["Matric Exam Season 2026", "Content, live classes, support and marketing for the NSC final examinations.", "ACTIVE", "lerato", "operations", -60, 50],
    ["Physical Sciences Course Build", "Script, record and publish the Grade 12 Physical Sciences campus for launch in 2027.", "ACTIVE", "nomvula", "academic", -120, 150],
    ["Gauteng School Partnership Drive", "Convert 8 Gauteng schools for the 2027 school year.", "ACTIVE", "michael", "marketing", -60, 80],
    ["Offline Learning Release", "Ship offline downloads and data-saving mode to all Android users.", "ACTIVE", "pieter", "technology", -90, 30],
    ["Series A Preparation", "Data room, investor deck and financial model for the 2027 raise.", "PLANNING", "sipho", "executive", -20, 120],
    ["2026 Winter School", "Holiday bootcamps in Johannesburg and Durban.", "COMPLETED", "johan", "marketing", -150, -85],
  ];
  for (const [name, description, status, owner, d, start, due] of projectSeeds) {
    const id = demoId("prj");
    projects[name] = id;
    await db.project.create({ data: { id, name, description, status, ownerId: users[owner], departmentId: dept(d), startDate: dateOffset(start), dueDate: dateOffset(due) } });
  }

  // ── Meetings ──
  const meetingIds: Record<string, string> = {};
  const meetings: {
    key: string;
    title: string;
    type: MeetingType;
    day: number;
    hour: number;
    minutes: number;
    organizer: string;
    attendees: string[];
    location: string;
    agenda: string;
    notes?: string;
    decisions?: string[];
    school?: string;
  }[] = [
    {
      key: "board-q3",
      title: "Q3 2026 Board Meeting",
      type: "BOARD",
      day: -16,
      hour: 9,
      minutes: 180,
      organizer: "sipho",
      attendees: ["michael", "lerato", "ayesha"],
      location: "Boardroom, Braamfontein Co-Work Hub",
      agenda: "1. Q3 management accounts\n2. Learner growth & churn\n3. School partnership pipeline\n4. Physical Sciences 2027 launch decision\n5. Series A timing\n6. Risk register",
      notes: "Revenue ahead of budget for the quarter; hosting overspend noted. Board supportive of a Q2 2027 Series A. Runway reviewed at ~10 months — management to present cost scenarios.",
      decisions: [
        "Approve development of the Grade 12 Physical Sciences course for a 2027 launch.",
        "Begin Series A preparation in Q4 2026 with a target close in Q2 2027.",
        "Hosting spend to be reduced via reserved instances — Product to submit for approval.",
      ],
    },
    { key: "exco-1", title: "Weekly Executive Meeting", type: "EXECUTIVE", day: -7, hour: 8, minutes: 60, organizer: "lerato", attendees: ["sipho", "michael", "ayesha", "johan", "nomvula", "pieter"], location: "Google Meet", agenda: "1. KPIs review\n2. Matric exam season readiness\n3. Approvals backlog\n4. Hiring", notes: "Exam season readiness on track except Euclidean Geometry videos. Two approvals overdue.", decisions: ["Prioritise Euclidean Geometry content over new Grade 11 topics until finals."] },
    { key: "exco-2", title: "Weekly Executive Meeting", type: "EXECUTIVE", day: 0, hour: 8, minutes: 60, organizer: "lerato", attendees: ["sipho", "michael", "ayesha", "johan", "nomvula", "pieter"], location: "Google Meet", agenda: "1. KPIs review\n2. Cash runway scenarios\n3. Ridgeview renewal\n4. Exam-week support rota" },
    { key: "exco-3", title: "Weekly Executive Meeting", type: "EXECUTIVE", day: 7, hour: 8, minutes: 60, organizer: "lerato", attendees: ["sipho", "michael", "ayesha", "johan", "nomvula", "pieter"], location: "Google Meet", agenda: "1. KPIs review\n2. 2027 pricing\n3. Board pack preparation" },
    { key: "mkt-1", title: "Marketing Weekly Sync", type: "MARKETING", day: -5, hour: 10, minutes: 45, organizer: "johan", attendees: ["tshepo", "megan"], location: "Google Meet", agenda: "Campaign performance, TikTok creative refresh, referral programme results", notes: "Referral programme CPL R14 — strongest channel. TikTok paused pending new creative.", decisions: ["Shift R10k from TikTok to the referral programme for October."] },
    { key: "mkt-2", title: "Marketing Weekly Sync", type: "MARKETING", day: 2, hour: 10, minutes: 45, organizer: "johan", attendees: ["tshepo", "megan"], location: "Google Meet", agenda: "Early Bird 2027 campaign plan; expo calendar" },
    { key: "acad-1", title: "Content Review: Euclidean Geometry", type: "ACADEMIC", day: -3, hour: 14, minutes: 90, organizer: "nomvula", attendees: ["bongani", "fatima", "lindiwe"], location: "Studio", agenda: "Review recorded geometry videos against CAPS exam guidelines", notes: "Three videos approved; two need re-recording for notation consistency.", decisions: ["Adopt the NSC diagram notation conventions across all geometry content."] },
    { key: "acad-2", title: "Physical Sciences Scripting Workshop", type: "ACADEMIC", day: 3, hour: 13, minutes: 120, organizer: "nomvula", attendees: ["werner", "pieter"], location: "Studio", agenda: "Course outline sign-off; recording schedule for Term 1 topics" },
    { key: "dev-1", title: "Sprint Planning — Sprint 42", type: "DEVELOPER", day: -4, hour: 9, minutes: 60, organizer: "pieter", attendees: ["kagiso", "ruan", "zanele"], location: "Google Meet", agenda: "Sprint goal: offline downloads beta; critical bug triage", notes: "Offline downloads beta targeted for end of sprint 43. Android Go playback bug escalated to critical.", decisions: ["Freeze new feature work until the critical playback bug is fixed."] },
    { key: "dev-2", title: "Sprint Review & Demo", type: "DEVELOPER", day: 6, hour: 15, minutes: 60, organizer: "pieter", attendees: ["kagiso", "ruan", "zanele", "sipho"], location: "Google Meet", agenda: "Demo WhatsApp progress reports; offline downloads progress" },
    { key: "school-1", title: "Partnership renewal: Ridgeview College", type: "SCHOOL", day: 1, hour: 11, minutes: 60, organizer: "michael", attendees: ["johan"], location: "Ridgeview College, Johannesburg", agenda: "Review results impact, renewal pricing, add Grade 11 cohort", school: "Ridgeview College" },
    { key: "school-2", title: "Proposal presentation: Highveld Girls' High", type: "SCHOOL", day: 4, hour: 10, minutes: 60, organizer: "michael", attendees: ["tshepo"], location: "Mbombela (in person)", agenda: "Present revised proposal to principal and SGB finance committee", school: "Highveld Girls' High School" },
    { key: "school-3", title: "Discovery call: Alexandra Secondary School", type: "SCHOOL", day: -9, hour: 12, minutes: 45, organizer: "johan", attendees: ["tshepo"], location: "Phone", agenda: "Understand Grade 12 maths results and data access constraints", notes: "Strong interest; learners have limited data — offline mode is key.", decisions: ["Offer a free two-week pilot for one Grade 12 class."], school: "Alexandra Secondary School" },
    { key: "fin-1", title: "Monthly Finance Review", type: "EXECUTIVE", day: 5, hour: 14, minutes: 60, organizer: "ayesha", attendees: ["sipho", "lerato"], location: "Google Meet", agenda: "September close, AR follow-ups, hosting cost reduction, budget vs actual" },
  ];
  for (const m of meetings) {
    const id = demoId("mtg");
    meetingIds[m.key] = id;
    const startsAt = at(m.day, m.hour);
    const past = startsAt < NOW;
    await db.meeting.create({
      data: {
        id,
        title: m.title,
        type: m.type,
        status: past ? "COMPLETED" : "SCHEDULED",
        startsAt,
        endsAt: new Date(startsAt.getTime() + m.minutes * 60_000),
        location: m.location,
        videoLink: m.location === "Google Meet" ? "https://meet.google.com/demo-demo-demo" : null,
        agenda: m.agenda,
        notes: m.notes ?? null,
        organizerId: users[m.organizer],
        schoolId: m.school ? (ctx.schools.get(m.school) ?? null) : null,
        attendees: {
          create: [m.organizer, ...m.attendees].map((u, i) => ({
            userId: users[u],
            response: i === 0 ? "ACCEPTED" : past ? "ACCEPTED" : pick(["ACCEPTED", "ACCEPTED", "PENDING", "TENTATIVE"] as const),
            attended: past ? (i === 0 ? true : chance(0.92)) : null,
          })),
        },
        decisions: { create: (m.decisions ?? []).map((description) => ({ id: demoId("mdc"), description, recordedById: users[m.organizer], createdAt: new Date(startsAt.getTime() + 3_600_000) })) },
      },
    });
  }

  // ── Tasks ──
  const tasks: [string, string, Dept, TaskStatus, Priority, number | null, string, { project?: string; meeting?: string; feature?: string; bug?: number; school?: string; description?: string }?][] = [
    // Executive / board follow-ups (meeting action items)
    ["Present three cost-reduction scenarios to the board", "ayesha", "finance", "IN_PROGRESS", "HIGH", 6, "sipho", { meeting: "board-q3", project: "Series A Preparation", description: "Model 6, 9 and 12-month runway extensions with hiring and marketing levers." }],
    ["Submit reserved-instance proposal for approval", "pieter", "technology", "COMPLETED", "HIGH", -6, "sipho", { meeting: "board-q3" }],
    ["Draft Physical Sciences launch plan", "nomvula", "academic", "IN_PROGRESS", "HIGH", 12, "sipho", { meeting: "board-q3", project: "Physical Sciences Course Build" }],
    ["Prepare Series A data room index", "michael", "executive", "TODO", "MEDIUM", 21, "sipho", { meeting: "board-q3", project: "Series A Preparation" }],
    ["Re-record two Euclidean Geometry videos", "fatima", "academic", "IN_PROGRESS", "CRITICAL", 2, "nomvula", { meeting: "acad-1", project: "Matric Exam Season 2026" }],
    ["Update geometry notation in all worksheets", "bongani", "academic", "TODO", "HIGH", 5, "nomvula", { meeting: "acad-1" }],
    ["Set up pilot class for Alexandra Secondary", "tshepo", "marketing", "TODO", "HIGH", -2, "johan", { meeting: "school-3", school: "Alexandra Secondary School" }],
    ["Move R10k budget from TikTok to referrals", "megan", "marketing", "COMPLETED", "MEDIUM", -3, "johan", { meeting: "mkt-1" }],
    // Finance
    ["Chase overdue invoices from partner schools", "ayesha", "finance", "IN_PROGRESS", "HIGH", -1, "lerato", { description: "Two quarterly instalments are past due. Call bursars and resend statements." }],
    ["September month-end close", "ayesha", "finance", "COMPLETED", "HIGH", -4, "lerato"],
    ["Prepare VAT registration assessment", "ayesha", "finance", "TODO", "MEDIUM", 18, "sipho", { description: "Turnover is approaching the R1m VAT registration threshold — assess timing and impact on pricing." }],
    ["Reconcile PayFast settlements for September", "ayesha", "finance", "BLOCKED", "MEDIUM", -5, "lerato", { description: "Blocked by the duplicate webhook bug creating extra payment records.", bug: 1 }],
    // Marketing & schools
    ["Finalise Early Bird 2027 campaign assets", "megan", "marketing", "IN_PROGRESS", "HIGH", 9, "johan", { project: "Gauteng School Partnership Drive" }],
    ["Book Gauteng Matric Expo stand", "tshepo", "marketing", "TODO", "MEDIUM", 14, "johan"],
    ["Ridgeview College renewal proposal", "michael", "marketing", "IN_PROGRESS", "CRITICAL", 1, "sipho", { school: "Ridgeview College", project: "Gauteng School Partnership Drive" }],
    ["Revise Highveld Girls' High pricing", "michael", "marketing", "COMPLETED", "HIGH", -2, "michael", { school: "Highveld Girls' High School" }],
    ["Send references pack to St Augustine's College", "johan", "marketing", "TODO", "MEDIUM", 3, "michael", { school: "St Augustine's College" }],
    ["Weekly social content calendar (exam season)", "megan", "marketing", "IN_PROGRESS", "MEDIUM", 4, "johan", { project: "Matric Exam Season 2026" }],
    ["Follow up with Mangaung Comprehensive", "tshepo", "marketing", "TODO", "MEDIUM", -4, "johan", { school: "Mangaung Comprehensive School" }],
    // Academic
    ["Publish Paper 2 revision playlist", "nomvula", "academic", "TODO", "CRITICAL", 8, "lerato", { project: "Matric Exam Season 2026" }],
    ["Live revision class rota for exam weeks", "nomvula", "academic", "IN_PROGRESS", "HIGH", 5, "lerato", { project: "Matric Exam Season 2026" }],
    ["Script Momentum & Impulse lessons", "werner", "academic", "IN_PROGRESS", "MEDIUM", 16, "nomvula", { project: "Physical Sciences Course Build" }],
    ["Review Grade 11 Functions quizzes", "lindiwe", "academic", "TODO", "LOW", 20, "nomvula"],
    ["Mark Saturday class mock papers", "precious", "academic", "COMPLETED", "MEDIUM", -6, "nomvula"],
    ["Calculus worked examples — set 3", "bongani", "academic", "TODO", "MEDIUM", -1, "nomvula"],
    // Technology (development tasks)
    ["Fix ExoPlayer memory leak on Android Go", "zanele", "technology", "IN_PROGRESS", "CRITICAL", 1, "pieter", { bug: 0, feature: "Offline video downloads for low-data learners" }],
    ["Idempotency keys for PayFast webhooks", "ruan", "technology", "IN_PROGRESS", "HIGH", 3, "pieter", { bug: 1 }],
    ["Encrypted offline storage for downloads", "kagiso", "technology", "IN_PROGRESS", "HIGH", 10, "pieter", { feature: "Offline video downloads for low-data learners", project: "Offline Learning Release" }],
    ["Download manager UI (pause / resume)", "zanele", "technology", "TODO", "HIGH", 14, "pieter", { feature: "Offline video downloads for low-data learners", project: "Offline Learning Release" }],
    ["WhatsApp template approval & opt-in flow", "ruan", "technology", "IN_PROGRESS", "MEDIUM", 6, "pieter", { feature: "WhatsApp weekly progress reports for parents" }],
    ["CDN cache rules for video segments", "kagiso", "technology", "COMPLETED", "HIGH", -8, "pieter", { feature: "Video start time under 2 seconds" }],
    ["Load test live classes with 300 users", "zanele", "technology", "TODO", "HIGH", 9, "pieter", { feature: "Live revision classes (streaming)" }],
    ["School dashboard: data model & API", "ruan", "technology", "TODO", "MEDIUM", 30, "pieter", { feature: "School admin dashboard" }],
    ["Quiz timer: pause on app background", "zanele", "technology", "TODO", "HIGH", 7, "pieter", { bug: 2 }],
    ["Upgrade to Node.js 22 LTS on all services", "kagiso", "technology", "COMPLETED", "MEDIUM", -15, "pieter"],
    // Operations
    ["Exam-week learner support rota", "lerato", "operations", "IN_PROGRESS", "HIGH", 3, "sipho", { project: "Matric Exam Season 2026" }],
    ["Load-shedding contingency: backup internet for studio", "lerato", "operations", "TODO", "MEDIUM", 12, "sipho"],
    ["Renew co-working contract", "lerato", "operations", "TODO", "LOW", 25, "lerato"],
    ["POPIA annual compliance review", "lerato", "operations", "TODO", "HIGH", -3, "sipho", { description: "Annual review of processing activities, operator agreements and consent records." }],
    ["Onboard new Physical Sciences tutor", "nomvula", "academic", "COMPLETED", "MEDIUM", -40, "lerato"],
    ["Quarterly team check-ins", "sipho", "executive", "TODO", "MEDIUM", 15, "sipho"],
    ["Investor update email — September", "sipho", "executive", "COMPLETED", "MEDIUM", -10, "sipho"],
    ["2027 pricing recommendation", "johan", "marketing", "TODO", "HIGH", 10, "sipho", { description: "Recommend 2027 monthly/annual pricing using churn and conversion data." }],
  ];
  for (const [title, assignee, d, status, priority, dueOffset, creator, extra] of tasks) {
    const due = dueOffset === null ? null : endOfSastDay(dateOffset(dueOffset));
    await db.task.create({
      data: {
        id: demoId("tsk"),
        title,
        description: extra?.description ?? null,
        status,
        priority,
        dueDate: due,
        completedAt: status === "COMPLETED" ? new Date((due ?? NOW).getTime() - int(0, 2) * DAY) : null,
        assigneeId: users[assignee],
        creatorId: users[creator],
        departmentId: dept(d),
        projectId: extra?.project ? projects[extra.project] : null,
        meetingId: extra?.meeting ? meetingIds[extra.meeting] : null,
        featureId: extra?.feature ? ctx.features[extra.feature] : null,
        bugId: extra?.bug !== undefined ? ctx.bugIds[extra.bug] : null,
        schoolId: extra?.school ? (ctx.schools.get(extra.school) ?? null) : null,
        createdAt: daysAgo(int(5, 40)),
      },
    });
  }
  // A few completed tasks from earlier months for history.
  for (let i = 0; i < 18; i++) {
    const assignee = pick(["kagiso", "ruan", "megan", "tshepo", "bongani", "ayesha", "fatima", "zanele"]);
    const done = daysAgo(int(15, 160));
    await db.task.create({
      data: {
        id: demoId("tsk"),
        title: pick(["Update landing page copy", "Quarterly learner survey", "Record topic intro video", "Fix broken links in worksheets", "Partner school progress report", "Supplier onboarding", "Social media analytics report", "Refactor quiz scoring service"]),
        status: "COMPLETED",
        priority: pick(["LOW", "MEDIUM", "HIGH"] as const),
        dueDate: done,
        completedAt: done,
        assigneeId: users[assignee],
        creatorId: users[pick(["lerato", "johan", "pieter", "nomvula"])],
        departmentId: dept(assignee === "ayesha" ? "finance" : ["kagiso", "ruan", "zanele"].includes(assignee) ? "technology" : ["megan", "tshepo"].includes(assignee) ? "marketing" : "academic"),
        createdAt: new Date(done.getTime() - int(5, 20) * DAY),
      },
    });
  }

  // ── Approvals ──
  const approvals: {
    type: ApprovalType;
    title: string;
    description: string;
    amount?: number;
    priority: Priority;
    due?: number;
    requester: string;
    approver?: string;
    status: ApprovalStatus;
    created: number;
    expense?: number;
    campaign?: string;
    feature?: string;
    document?: string;
    trail: [ApprovalDecisionType, string, string | null, number][];
  }[] = [
    { type: "EXPENSE", title: "Second recording kit for Physical Sciences", description: "A dedicated camera, lighting and audio kit so Physical Sciences recordings can run in parallel with Mathematics during exam season. Quote attached from Orms Direct.", amount: 38500, priority: "HIGH", due: 4, requester: "nomvula", status: "PENDING", created: -3, expense: 0, trail: [["SUBMITTED", "nomvula", null, -3]] },
    { type: "EXPENSE", title: "Gauteng Matric Expo 2026 stand", description: "3m × 3m stand at the Gauteng Matric Expo — expected 4,000 learner visitors and 60 schools.", amount: 12800, priority: "MEDIUM", due: 9, requester: "johan", status: "PENDING", created: -2, expense: 1, trail: [["SUBMITTED", "johan", null, -2]] },
    { type: "PURCHASE", title: "AWS reserved instances (1 year) for production database", description: "Committing to a 1-year reserved instance reduces database hosting cost by ~38% (≈R4,100/month saving). Requested by the board in Q3.", amount: 46200, priority: "HIGH", due: 6, requester: "pieter", approver: "ayesha", status: "PENDING", created: -5, expense: 2, trail: [["SUBMITTED", "pieter", null, -5]] },
    { type: "CAMPAIGN", title: "2027 Early Bird Annual Plan campaign budget", description: "R60,000 budget for a 9-week email + social campaign targeting current Grade 11 learners and parents. Target: 400 annual plans pre-sold (≈R596k cash in).", amount: 60000, priority: "HIGH", due: 10, requester: "johan", status: "PENDING", created: -1, campaign: "2027 Early Bird Annual Plan", trail: [["SUBMITTED", "johan", null, -1]] },
    { type: "CONTRACT", title: "Ridgeview College partnership renewal (2027)", description: "Renew for 12 months at R198,000 (+6.5%) and add the Grade 11 cohort (40 learners). Contract template v4.", amount: 198000, priority: "CRITICAL", due: 2, requester: "michael", approver: "sipho", status: "PENDING", created: -2, document: "School Partnership Agreement Template", trail: [["SUBMITTED", "michael", null, -2]] },
    { type: "STRATEGIC_DECISION", title: "Launch Grade 12 Physical Sciences in Q2 2027", description: "Approve the go-to-market plan and R420k content budget for the Physical Sciences campus, following the board's in-principle approval.", amount: 420000, priority: "HIGH", due: 14, requester: "nomvula", status: "CHANGES_REQUESTED", created: -10, trail: [["SUBMITTED", "nomvula", null, -10], ["CHANGES_REQUESTED", "sipho", "Please split the budget between content production and marketing, and add a break-even learner estimate.", -7]] },
    { type: "PRODUCT_RELEASE", title: "Release WhatsApp weekly progress reports", description: "Release to all parents who opted in, after 2 weeks of beta with 120 families (open rate 78%).", priority: "MEDIUM", due: 12, requester: "pieter", status: "PENDING", created: -1, feature: "WhatsApp weekly progress reports for parents", trail: [["SUBMITTED", "pieter", null, -1]] },
    { type: "EXPENSE", title: "Studio hire for Winter School recordings", description: "Two days of studio hire to record the Winter School bootcamp sessions.", amount: 16800, priority: "MEDIUM", requester: "nomvula", status: "APPROVED", created: -70, trail: [["SUBMITTED", "nomvula", null, -70], ["APPROVED", "michael", "Approved — good value for reusable content.", -69]] },
    { type: "PURCHASE", title: "3 × developer laptops", description: "Replace failing laptops for the engineering team.", amount: 61500, priority: "HIGH", requester: "pieter", status: "APPROVED", created: -490, trail: [["SUBMITTED", "pieter", null, -490], ["APPROVED", "ayesha", "Within the technology equipment budget.", -488]] },
    { type: "CAMPAIGN", title: "TikTok Maths Tips — extend budget by R15,000", description: "Extend the TikTok campaign for another 6 weeks.", amount: 15000, priority: "LOW", requester: "megan", status: "REJECTED", created: -25, trail: [["SUBMITTED", "megan", null, -25], ["REJECTED", "johan", "CPL is R71 against a R45 target. Refresh creative first and resubmit with test results.", -24]] },
    { type: "EXPENSE", title: "KZN Education Indaba expo stand", description: "Expo stand to meet KZN principals and district officials.", amount: 14500, priority: "MEDIUM", requester: "johan", status: "APPROVED", created: -125, trail: [["SUBMITTED", "johan", null, -125], ["APPROVED", "michael", "Approved. Please report back on meetings booked.", -123]] },
    { type: "STRATEGIC_DECISION", title: "Adopt quarterly invoicing for public schools", description: "Align invoicing with school terms to improve collections from public schools.", priority: "MEDIUM", requester: "ayesha", status: "APPROVED", created: -200, trail: [["SUBMITTED", "ayesha", null, -200], ["APPROVED", "sipho", "Agreed — apply to all new public school contracts.", -198]] },
    { type: "OTHER", title: "Paid leave over exam period for tutors", description: "Proposal to pay tutors a retainer during the two-week exam break.", amount: 24000, priority: "LOW", requester: "nomvula", status: "WITHDRAWN", created: -40, trail: [["SUBMITTED", "nomvula", null, -40], ["WITHDRAWN", "nomvula", "Will include in 2027 tutor contracts instead.", -36]] },
  ];
  for (const a of approvals) {
    const id = demoId("apr");
    const decided = a.trail.find(([d]) => d === "APPROVED" || d === "REJECTED" || d === "WITHDRAWN");
    await db.approval.create({
      data: {
        id,
        type: a.type,
        title: a.title,
        description: a.description,
        amount: a.amount ?? null,
        status: a.status,
        priority: a.priority,
        dueDate: a.due === undefined ? null : dateOffset(a.due),
        requesterId: users[a.requester],
        approverId: a.approver ? users[a.approver] : null,
        expenseId: a.expense !== undefined ? ctx.pendingExpenseIds[a.expense] : null,
        campaignId: a.campaign ? ctx.campaigns[a.campaign] : null,
        featureId: a.feature ? ctx.features[a.feature] : null,
        documentId: a.document ? (ctx.documents.get(a.document) ?? null) : null,
        decidedAt: decided ? daysAgo(-decided[3]) : null,
        createdAt: daysAgo(-a.created),
        decisions: {
          create: a.trail.map(([decision, by, comment, offset]) => ({ id: demoId("apd"), deciderId: users[by], decision, comment, createdAt: new Date(daysAgo(-offset).getTime() + int(1, 8) * 3_600_000) })),
        },
      },
    });
  }

  // ── Objectives (strategy) ──
  const year = today.getUTCFullYear();
  const objectiveIds: Record<string, string> = {};
  const objectives: [string, string, string, Dept | null, number | null, ObjectiveMetric, string, number, number, number, ObjectiveStatus, Date, string?][] = [
    ["Reach 2,000 paying learners", "Grow the direct paying learner base to 2,000 by year end.", "johan", "marketing", null, "PAYING_LEARNERS", "learners", 520, 2000, 0, "AT_RISK", calendarDate(year, 11, 31)],
    ["Grow MRR to R400,000", "Monthly recurring revenue from subscriptions and school contracts.", "sipho", "executive", null, "MRR", "ZAR", 110000, 400000, 0, "ON_TRACK", calendarDate(year, 11, 31)],
    ["12 active school partnerships", "Active, invoicing partnerships with schools.", "michael", "marketing", null, "ACTIVE_SCHOOLS", "schools", 2, 12, 0, "AT_RISK", calendarDate(year, 11, 31)],
    ["Publish 240 Grade 11–12 content items", "Videos, lessons, worksheets and quizzes published to learners.", "nomvula", "academic", null, "PUBLISHED_CONTENT", "items", 60, 240, 0, "DELAYED", calendarDate(year, 11, 15)],
    ["Extend cash runway to 12 months", "Reach 12 months of runway at current net burn through cost control and pre-sales.", "ayesha", "finance", null, "MANUAL", "months", 6, 12, 11.2, "AT_RISK", calendarDate(year, 11, 31)],
    ["Learner satisfaction of 85%+", "Average rating from the termly learner survey.", "lerato", "operations", null, "MANUAL", "%", 72, 85, 81, "ON_TRACK", calendarDate(year, 11, 15)],
    // Q4 priorities
    ["Matric season: 2,800 active learners", "Learners with an active subscription (direct, trial or school seat) during the NSC exam window.", "nomvula", "academic", 4, "ACTIVE_LEARNERS", "learners", 2000, 2800, 0, "ON_TRACK", calendarDate(year, 10, 30), "Publish 240 Grade 11–12 content items"],
    ["Sign 4 schools for 2027", "Signed partnership agreements starting in January 2027.", "michael", "marketing", 4, "MANUAL", "schools", 0, 4, 2, "ON_TRACK", calendarDate(year, 11, 15), "12 active school partnerships"],
    ["Ship offline downloads to all Android users", "General availability of offline downloads.", "pieter", "technology", 4, "MANUAL", "%", 0, 100, 65, "AT_RISK", calendarDate(year, 10, 30)],
    ["Reduce monthly hosting cost by 20%", "Reserved instances and CDN caching.", "pieter", "technology", 4, "MANUAL", "%", 0, 20, 8, "ON_TRACK", calendarDate(year, 11, 31), "Extend cash runway to 12 months"],
    ["Pre-sell 400 early-bird annual plans", "2027 Early Bird campaign conversions.", "johan", "marketing", 4, "MANUAL", "plans", 0, 400, 0, "ON_TRACK", calendarDate(year, 11, 31), "Reach 2,000 paying learners"],
    // Completed Q3 objectives
    ["Winter School: 180 bootcamp learners", "Seats filled across Johannesburg and Durban.", "johan", "marketing", 3, "MANUAL", "learners", 0, 180, 196, "COMPLETED", calendarDate(year, 6, 31)],
    ["Release past paper practice mode", "Timed NSC past paper practice with memos.", "pieter", "technology", 3, "MANUAL", "%", 0, 100, 100, "COMPLETED", calendarDate(year, 7, 31)],
  ];
  for (const [title, description, owner, d, quarter, metric, unit, start, target, current, status, deadline] of objectives) {
    const id = demoId("obj");
    objectiveIds[title] = id;
    await db.objective.create({
      data: {
        id,
        title,
        description,
        ownerId: users[owner],
        departmentId: d ? dept(d) : null,
        year,
        quarter,
        metric,
        unit,
        startValue: start,
        targetValue: target,
        currentValue: current,
        deadline,
        status,
      },
    });
  }
  for (const o of objectives) {
    const parentTitle = o[12];
    if (parentTitle) await db.objective.update({ where: { id: objectiveIds[o[0]] }, data: { parentId: objectiveIds[parentTitle] } });
    if (o[5] === "MANUAL" && o[10] !== "COMPLETED") {
      const steps = int(2, 4);
      for (let s = 1; s <= steps; s++) {
        const value = o[7] + ((o[9] - o[7]) * s) / steps;
        await db.objectiveUpdate.create({
          data: {
            id: demoId("obu"),
            objectiveId: objectiveIds[o[0]],
            value: Math.round(value * 10) / 10,
            status: s === steps ? o[10] : "ON_TRACK",
            note: s === steps ? "Latest check-in from the weekly executive meeting." : "Monthly progress update.",
            authorId: users[o[2]],
            createdAt: daysAgo((steps - s) * 25 + int(1, 5)),
          },
        });
      }
    }
  }

  // ── Announcements ──
  await db.announcement.createMany({
    data: [
      {
        id: demoId("ann"),
        title: "NSC Mathematics exams start soon — all hands on exam support",
        body: "Live revision classes run every weekday evening until the Paper 2 exam. Please check the support rota and keep response times under 2 hours.",
        level: "IMPORTANT",
        authorId: users.lerato,
        publishedAt: daysAgo(2),
        expiresAt: new Date(NOW.getTime() + 40 * DAY),
      },
      {
        id: demoId("ann"),
        title: "Updated Expense & Approvals Policy (v3)",
        body: "All spend above R5,000 now needs an approval in the workspace before it is committed. See Documents → Corporate → Policies.",
        level: "INFO",
        authorId: users.ayesha,
        publishedAt: daysAgo(9),
        expiresAt: new Date(NOW.getTime() + 21 * DAY),
      },
    ],
  });

  return { projects, meetingIds };
}
