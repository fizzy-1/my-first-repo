/* Integral Workspace Lite — the demo story, shared by seed.js (local demo) and the online preview.
 * buildDemoData() returns every table as rows with fixed ids, dated relative to today, so the numbers
 * hang together: school income comes from the contracts, a few renewals are coming up, one school churned. */
(function () {
  "use strict";
  const DEMO_PASSWORD = "integral-demo-2026";

  function buildDemoData(now = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = iso(now);
    const day = (offset) => {
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      return iso(d);
    };
    const monthDay = (monthsAgo, dayOfMonth) => {
      const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, dayOfMonth);
      return d > now ? today : iso(d);
    };
    const at = (date, hour = 9) => `${date}T${pad(hour)}:00:00.000Z`;
    const yearStart = `${now.getFullYear()}-01-01`;
    const yearEnd = `${now.getFullYear()}-12-31`;
    let state = 7;
    const rand = () => (state = (state * 16807) % 2147483647) / 2147483647;
    const vary = (base, spread) => Math.round((base + (rand() - 0.5) * 2 * spread) / 10) * 10;
    const tables = {};
    const add = (table, row) => {
      tables[table] = tables[table] || [];
      const full = { id: tables[table].length + 1, created_at: at(today, 8), ...row };
      tables[table].push(full);
      return full.id;
    };

    // ── Team ──
    const people = [
      ["Sipho Dlamini", "sipho@integralacademy.co.za", "admin", "Founder & CEO"],
      ["Ayesha Patel", "ayesha@integralacademy.co.za", "manager", "Operations & Finance"],
      ["Johan van der Merwe", "johan@integralacademy.co.za", "manager", "Head of Content"],
      ["Nomvula Khumalo", "nomvula@integralacademy.co.za", "member", "Maths Teacher & Presenter"],
      ["Kagiso Mokoena", "kagiso@integralacademy.co.za", "member", "School Partnerships"],
    ];
    const [sipho, ayesha, johan, nomvula, kagiso] = people.map(([name, email, role, job_title]) => add("users", { name, email, role, job_title, active: 1, must_change_password: 0, created_at: at(monthDay(14, 1)) }));
    const settings = { company_name: "Integral Academy", opening_balance: "1200000", opening_date: monthDay(12, 1) };

    // ── Schools: the open pipeline, then customers with contracts ──
    const email = (school) => `principal@${school.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 16)}.school.za`;
    const pipeline = [
      ["Mamelodi Science Academy", "Dr P. Mahlangu", "Pretoria", "proposal", 54000, 180, day(2), kagiso, -40],
      ["Gugulethu Senior Secondary", "Mr S. Ndlovu", "Cape Town", "meeting", 30000, 95, day(4), sipho, -25],
      ["Tembisa High School", "Mrs L. Sithole", "Tembisa", "contacted", 42000, 140, day(-1), kagiso, -18],
      ["Hillcrest Academy", "Mr R. Naidoo", "Pietermaritzburg", "contacted", 27000, 90, day(6), ayesha, -9],
      ["Polokwane Maths Centre", "Ms K. Mabaso", "Polokwane", "lead", 24000, 80, day(10), kagiso, -4],
      ["Mthatha Technical High", null, "Mthatha", "lead", 33000, 110, null, kagiso, -2],
      ["Eastgate Girls' College", "Mrs A. Botha", "Bloemfontein", "lost", 21000, 70, null, sipho, -75],
      ["Rustenburg Secondary", "Mr J. Kekana", "Rustenburg", "proposal", 39000, 130, day(1), sipho, -55],
    ];
    const lead = {};
    for (const [school, contact_name, city, stage, value, learners, next_follow_up, owner_id, createdOffset] of pipeline)
      lead[school] = add("leads", { school, contact_name, contact_email: contact_name ? email(school) : null, contact_phone: null, city, stage, value, learners, next_follow_up, owner_id, won_at: null, created_at: at(day(createdOffset), 10) });

    // [school, contact, city, learners, annual value, contract start (days from today), owner, what happened]
    const customers = [
      ["Orlando West High School", "Mr B. Khoza", "Soweto", 115, 34500, -420, kagiso, "ended"],
      ["Soshanguve Secondary School", "Mrs P. Mokoena", "Pretoria", 100, 30000, -395, kagiso, "renewed"],
      ["Alexandra High School", "Mr D. Nkosi", "Johannesburg", 140, 42000, -340, kagiso],
      ["KwaMashu Secondary", "Ms Z. Mthembu", "Durban", 110, 33000, -310, sipho],
      ["Khayelitsha Maths Academy", "Mr L. Jacobs", "Cape Town", 90, 27000, -285, kagiso],
      ["Mabopane High School", "Mrs R. Maluleke", "Pretoria", 120, 36000, -250, kagiso],
      ["Diepkloof Secondary", "Mr T. Radebe", "Soweto", 150, 45000, -220, kagiso],
      ["Seshego High School", "Ms M. Ramaphosa", "Polokwane", 80, 24000, -190, kagiso],
      ["Inanda Comprehensive", "Mr S. Ngcobo", "Durban", 130, 39000, -160, sipho],
      ["Langa High School", "Ms A. Daniels", "Cape Town", 95, 28500, -130, ayesha],
      ["Ga-Rankuwa Secondary", "Mr K. Letsoalo", "Pretoria", 105, 31500, -100, kagiso],
      ["Mitchells Plain Secondary", "Mrs F. Adams", "Cape Town", 125, 37500, -75, ayesha],
      ["Thuto-Lesedi Secondary School", "Mr T. Molefe", "Soweto", 160, 48000, -56, kagiso],
      ["Umlazi Comprehensive High", "Ms N. Zulu", "Durban", 120, 36000, -6, kagiso],
    ];
    for (const [school, contact_name, city, learners, value, start, owner_id, outcome] of customers) {
      const id = add("leads", { school, contact_name, contact_email: email(school), contact_phone: null, city, stage: outcome === "ended" ? "lost" : "won", value, learners, next_follow_up: null, owner_id, won_at: at(day(start), 11), created_at: at(day(start - 45), 10) });
      lead[school] = id;
      const first = add("contracts", { lead_id: id, start_date: day(start), end_date: day(start + 364), annual_value: value, learners, status: outcome === "ended" ? "ended" : outcome === "renewed" ? "renewed" : "active", notes: null, end_reason: outcome === "ended" ? "Moved the budget to a district-wide programme. Try again next year." : null, renewed_to: null, reminded_60: outcome ? 1 : 0, reminded_30: outcome ? 1 : 0, created_by: sipho, created_at: at(day(start), 11) });
      if (outcome === "renewed") {
        const second = add("contracts", { lead_id: id, start_date: day(start + 365), end_date: day(start + 729), annual_value: Math.round(value * 1.1), learners: learners + 10, status: "active", notes: "Renewed with 10 more learners.", end_reason: null, renewed_to: null, reminded_60: 0, reminded_30: 0, created_by: sipho, created_at: at(day(start + 340), 11) });
        tables.contracts[first - 1].renewed_to = second;
      }
    }
    const note = (school, body, author_id, offset) => add("lead_notes", { lead_id: lead[school], body, author_id, created_at: at(day(offset), 14) });
    note("Mamelodi Science Academy", "Visited the school. HOD loved the past-paper walkthroughs; asked for a quote for 180 learners.", kagiso, -12);
    note("Mamelodi Science Academy", "Proposal sent: R54 000 per year including teacher dashboard access.", kagiso, -5);
    note("Tembisa High School", "Principal is keen but needs SGB approval at the next meeting.", kagiso, -3);
    note("Eastgate Girls' College", "They chose a cheaper print-based programme this year. Try again in October.", sipho, -40);
    note("Alexandra High School", "Teachers report better Paper 1 results. Good case for renewing.", kagiso, -20);

    // ── Money: 12 months; school income follows the contracts ──
    const contractIncomeOn = (date) => Math.round(tables.contracts.filter((c) => c.start_date <= date && c.end_date >= date).reduce((s, c) => s + c.annual_value / 12, 0) / 10) * 10;
    for (let m = 11; m >= 0; m--) {
      const growth = (11 - m) / 11;
      const tx = (kind, d, amount, category, description, counterparty) => {
        if (m === 0 && d > now.getDate()) return; // this month's later payments haven't happened yet
        add("transactions", { kind, date: monthDay(m, d), amount, category, description, counterparty, created_by: ayesha, created_at: at(monthDay(m, d), 12) });
      };
      tx("expense", 25, 78000 + Math.round(growth * 14) * 1000, "Salaries", "Monthly salaries", "Team payroll");
      tx("expense", 1, 6500, "Rent", "Co-working desks", "Workshop17 Rosebank");
      tx("expense", 3, vary(3900, 300), "Software", "Video hosting, Google Workspace and Zoom", "Various");
      tx("expense", 10, vary(7000 + growth * 5000, 1500), "Marketing", "Social ads for learner sign-ups", "Meta Ads");
      tx("expense", 18, vary(2600, 900), "Travel", "School visits", "Fuel & Uber");
      if (m % 4 === 2) tx("expense", 14, vary(14000, 4000), "Equipment", "Recording equipment", "Takealot");
      const schoolIncome = contractIncomeOn(monthDay(m, 5));
      if (schoolIncome > 0) tx("income", 5, schoolIncome, "School contracts", "Monthly school licences", "Partner schools");
      tx("income", 28, vary(6000 + growth * 21000, 1500), "Learner subscriptions", "Learner subscriptions", "PayFast payouts");
      if (m === 7) tx("income", 12, 150000, "Grants", "Innovation grant (first tranche)", "Edtech innovation fund");
    }
    const budgets = [["Salaries", 95000], ["Rent", 6500], ["Software", 4500], ["Marketing", 12000], ["Travel", 3000], ["Equipment", 3000]].map(([category, monthly_amount]) => ({ category, monthly_amount }));

    // ── Content: what's in production, plus what was published over the year ──
    const content = [
      ["2024 Paper 1 — full memo", "past_paper", "Exam prep", "review", nomvula, day(2)],
      ["Trigonometry identities worksheet", "worksheet", "Trigonometry", "editing", nomvula, day(5)],
      ["Probability: Venn diagrams", "lesson", "Probability", "recording", johan, day(7)],
      ["Sequences and series quiz", "quiz", "Sequences", "idea", nomvula, day(14)],
      ["Analytical geometry: circles", "video", "Analytical geometry", "idea", johan, day(21)],
      ["Financial maths in 15 minutes", "video", "Finance", "editing", nomvula, day(-2)],
    ];
    for (const [title, type, topic, stage, owner_id, due_date] of content) add("content", { title, type, topic, stage, owner_id, due_date, published_at: null });
    const published = [
      ["Calculus: first principles", "video", "Calculus", johan, 0, 1], ["Functions and inverses walkthrough", "video", "Functions", nomvula, 0, 6],
      ["Number patterns walkthrough", "video", "Sequences", nomvula, 1, 8], ["2023 Paper 2 — full memo", "past_paper", "Exam prep", nomvula, 1, 22],
      ["Euclidean geometry: cyclic quads", "lesson", "Geometry", johan, 2, 12], ["Statistics: standard deviation", "video", "Statistics", nomvula, 3, 9],
      ["Trig graphs in 10 minutes", "video", "Trigonometry", nomvula, 3, 24], ["Exponents and surds worksheet", "worksheet", "Algebra", johan, 4, 15],
      ["Finance: annuities quiz", "quiz", "Finance", nomvula, 5, 11], ["Probability: tree diagrams", "lesson", "Probability", johan, 6, 18],
      ["Algebra: quadratic inequalities", "video", "Algebra", nomvula, 7, 7], ["Functions: exponential and log", "video", "Functions", nomvula, 8, 20],
    ];
    for (const [title, type, topic, owner_id, m, d] of published) add("content", { title, type, topic, stage: "published", owner_id, due_date: monthDay(m, d), published_at: at(monthDay(m, d), 12), created_at: at(monthDay(m + 1, d), 9) });

    // ── Meetings ──
    const weekly = add("meetings", {
      title: "Weekly team check-in", date: day(-3), attendees: "Sipho, Ayesha, Johan, Nomvula, Kagiso",
      notes: "Exam season is 6 weeks away. Learner sign-ups up 18% after the TikTok series. Two schools are waiting on proposals.",
      decisions: "Prioritise past-paper memos over new topics until exams\nKagiso to focus on proposals for Mamelodi and Rustenburg\nKeep marketing spend flat this month", created_by: sipho, created_at: at(day(-3), 15),
    });
    const review = add("meetings", {
      title: "Monthly finance review", date: day(-10), attendees: "Sipho, Ayesha",
      notes: "Burn is coming down as school licences grow. Grant second tranche depends on the impact report.",
      decisions: "Submit impact report by month end\nNo new hires until two more schools sign", created_by: ayesha, created_at: at(day(-10), 15),
    });
    add("meetings", { title: "Content planning: exam sprint", date: day(3), attendees: "Johan, Nomvula", notes: "", decisions: "", created_by: johan });
    const pastDecisions = ["Start renewal talks 60 days before contracts end", "Move Facebook spend to TikTok for two months", "Hire a part-time video editor after the grant lands", "Price next year at R300 per learner", "Pilot the teacher dashboard with two schools"];
    for (let m = 1; m <= 5; m++) add("meetings", { title: "Monthly finance review", date: monthDay(m, 20), attendees: "Sipho, Ayesha", notes: "Reviewed income, spending and the pipeline.", decisions: pastDecisions[m - 1], created_by: ayesha, created_at: at(monthDay(m, 20), 15) });

    // ── Tasks ──
    const tasks = [
      ["Send Mamelodi proposal follow-up", kagiso, day(2), "high", "todo", { lead_id: lead["Mamelodi Science Academy"], meeting_id: weekly }],
      ["Prepare Rustenburg proposal", kagiso, day(1), "high", "doing", { lead_id: lead["Rustenburg Secondary"], meeting_id: weekly }],
      ["Record 2024 Paper 1 memo intro", nomvula, day(-1), "medium", "todo", { meeting_id: weekly }],
      ["Write grant impact report", ayesha, day(9), "high", "doing", { meeting_id: review }],
      ["Reconcile last month's bank statement", ayesha, day(-2), "medium", "todo", { recurrence: "monthly" }],
      ["Post weekly exam tips on social media", johan, day(1), "medium", "todo", { recurrence: "weekly" }],
      ["Review trig worksheet draft", johan, day(3), "medium", "todo", {}],
      ["Update pricing sheet for next year", sipho, day(12), "low", "todo", {}],
      ["Call Tembisa High about SGB decision", kagiso, day(-1), "medium", "todo", { lead_id: lead["Tembisa High School"] }],
      ["Order second microphone", johan, day(-6), "low", "done", { completed_at: at(day(-5), 13) }],
      ["Publish functions walkthrough", nomvula, day(-3), "medium", "done", { completed_at: at(day(-3), 16) }],
    ];
    const doneTitles = ["Send invoices to partner schools", "Edit this week's videos", "School visit and demo", "Prepare the monthly finance pack", "Update the learner FAQ", "Plan next month's content"];
    const doers = [ayesha, nomvula, kagiso, ayesha, johan, johan];
    for (let m = 1; m <= 6; m++) for (let i = 0; i < 3 + (m % 3); i++) tasks.push([doneTitles[(m + i) % doneTitles.length], doers[(m + i) % doers.length], monthDay(m, 4 + i * 6), "medium", "done", { completed_at: at(monthDay(m, 5 + i * 6), 15) }]);
    for (const [title, assignee_id, due_date, priority, status, extra] of tasks)
      add("tasks", { title, notes: null, assignee_id, due_date, priority, status, created_by: sipho, meeting_id: null, lead_id: null, completed_at: null, recurrence: "none", ...extra });

    // ── Goals ──
    const goal = (row) => add("goals", { baseline: 0, current_value: 0, unit: null, notes: null, archived: 0, created_by: sipho, ...row });
    goal({ title: "Sign 12 new schools this year", metric: "schools_won", target: 12, start_date: yearStart, due_date: yearEnd, owner_id: kagiso });
    goal({ title: "Reach R600 000 in annual recurring revenue", metric: "arr", target: 600000, baseline: 300000, start_date: monthDay(4, 1), due_date: day(150), owner_id: sipho });
    goal({ title: "Publish 20 lessons and videos this year", metric: "content_published", target: 20, start_date: yearStart, due_date: yearEnd, owner_id: johan });
    const subs = goal({ title: "Grow learner subscriptions to 1 500", metric: "manual", target: 1500, baseline: 600, current_value: 1180, unit: "subscribers", start_date: monthDay(4, 1), due_date: day(80), owner_id: johan, notes: "From PayFast's monthly active subscriber report." });
    goal({ title: "Bring in R1.2 million income this year", metric: "income", target: 1200000, start_date: yearStart, due_date: yearEnd, owner_id: ayesha });
    for (const [value, m, text] of [[760, 3, "TikTok series launched."], [940, 2, "Exam-prep bundle went live."], [1180, 0, "Best month so far."]]) add("goal_updates", { goal_id: subs, value, note: text, author_id: johan, created_at: at(monthDay(m, 3), 10) });

    // ── Approvals ──
    add("approvals", { title: "Ring light and backdrop for recordings", details: "Our current lighting makes the board hard to read on phones.", amount: 3800, status: "pending", requested_by: nomvula, decided_by: null, decision_note: null, decided_at: null });
    add("approvals", { title: "Travel to Polokwane for school visits", details: "Two-day trip to meet three schools in Limpopo.", amount: 5200, status: "pending", requested_by: kagiso, decided_by: null, decision_note: null, decided_at: null });
    add("approvals", { title: "Canva Pro for the team", details: null, amount: 2400, status: "approved", requested_by: johan, decided_by: ayesha, decision_note: "Approved. Annual plan please.", decided_at: at(day(-5), 11) });
    add("approvals", { title: "Billboard near Bree taxi rank", details: null, amount: 45000, status: "rejected", requested_by: kagiso, decided_by: sipho, decision_note: "Too expensive for now. Let's revisit after the grant's second tranche.", decided_at: at(day(-12), 11) });

    // ── Documents (file contents included) ──
    const doc = (title, folder, file_name, mime_type, body, uploaded_by, isPrivate = 0) => add("documents", { title, folder, file_name, mime_type, body, private: isPrivate, uploaded_by });
    doc("Team handbook", "Policies", "team-handbook.txt", "text/plain", "Integral Academy team handbook\n\n1. We put learners first.\n2. Spending over R1 000 needs approval in the workspace.\n3. Meeting decisions and action items go in Meetings.\n", sipho);
    doc("Next year's school pricing", "Sales", "school-pricing.csv", "text/csv", "Learners,Price per year (R)\nUp to 100,30000\n101-200,42000\n201+,54000\n", sipho);
    doc("Grant agreement summary", "Finance", "grant-agreement-summary.txt", "text/plain", "Innovation grant: R300 000 in two tranches. Second tranche on approval of the impact report.\n", ayesha, 1);

    // ── Notifications and activity ──
    const notify = (user_id, message, link, read = false) => add("notifications", { user_id, message, link, read_at: read ? at(today, 9) : null });
    for (const manager of [sipho, ayesha, johan]) {
      notify(manager, "Nomvula Khumalo asked for approval: “Ring light and backdrop for recordings” (R3 800)", "approvals");
      notify(manager, "Kagiso Mokoena asked for approval: “Travel to Polokwane for school visits” (R5 200)", "approvals");
    }
    notify(sipho, "Kagiso Mokoena added a note on Mamelodi Science Academy", `pipeline?lead=${lead["Mamelodi Science Academy"]}`, true);
    notify(nomvula, "Sipho Dlamini assigned you “Record 2024 Paper 1 memo intro”", "tasks");
    notify(kagiso, "Sipho Dlamini assigned you “Send Mamelodi proposal follow-up”", "tasks");
    notify(kagiso, "Sipho Dlamini rejected your request “Billboard near Bree taxi rank”: “Too expensive for now.”", "approvals", true);
    notify(johan, "Ayesha Patel approved your request “Canva Pro for the team”", "approvals", true);
    const activity = (user_id, summary, audience = "all") => add("activity", { user_id, summary, audience });
    activity(sipho, "Sipho Dlamini set up the workspace");
    activity(kagiso, "Kagiso Mokoena added a note on Mamelodi Science Academy");
    activity(ayesha, "Ayesha Patel approved “Canva Pro for the team”", "manager");
    activity(nomvula, "Nomvula Khumalo updated content “Financial maths in 15 minutes”");

    return { password: DEMO_PASSWORD, people, settings, budgets, tables, ids: { sipho, ayesha, johan, nomvula, kagiso } };
  }

  globalThis.WSDemoData = { buildDemoData, DEMO_PASSWORD };
})();
