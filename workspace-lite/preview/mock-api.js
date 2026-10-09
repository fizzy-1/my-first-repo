/* Integral Workspace Lite — online preview.
 * Stands in for server.js inside the browser so the real app (public/app.js) runs unchanged:
 * every /api request is answered here from demo data kept in this browser (localStorage).
 * Permission rules mirror server.js. Also adds a small "Preview" bar for switching between demo accounts. */
(function () {
  "use strict";
  const STORE_KEY = "integral-workspace-lite-preview-v1";
  const DEMO_PASSWORD = "integral-demo-2026";
  const MAX_UPLOAD = 2 * 1024 * 1024;

  // ─────────────────────────── Dates ───────────────────────────
  const pad = (n) => String(n).padStart(2, "0");
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const localToday = () => isoDay(new Date());
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return isoDay(d);
  };
  const monthDay = (monthsAgo, dayOfMonth) => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, dayOfMonth);
    return d > now ? isoDay(now) : isoDay(d);
  };
  const nowIso = () => new Date().toISOString();
  const validDate = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  };

  // ─────────────────────────── Store ───────────────────────────
  const DEFAULTS = {
    users: { job_title: null, active: 1, must_change_password: 0 },
    tasks: { notes: null, status: "todo", priority: "medium", due_date: null, assignee_id: null, created_by: null, meeting_id: null, lead_id: null, completed_at: null },
    leads: { contact_name: null, contact_email: null, contact_phone: null, city: null, stage: "lead", value: 0, learners: null, next_follow_up: null, owner_id: null },
    lead_notes: { author_id: null },
    content: { type: "video", topic: null, stage: "idea", owner_id: null, due_date: null },
    transactions: { counterparty: null, created_by: null },
    approvals: { details: null, amount: null, status: "pending", requested_by: null, decided_by: null, decision_note: null, decided_at: null },
    meetings: { attendees: null, notes: null, decisions: null, created_by: null },
    documents: { folder: "General", private: 0, uploaded_by: null },
    activity: { user_id: null, audience: "all" },
  };
  const TABLES = Object.keys(DEFAULTS);
  let db;
  const files = {}; // storage_key → { kind: "text" | "dataurl", data }

  function emptyDb() {
    const out = { seq: {}, settings: {}, session: null, files: {} };
    for (const t of TABLES) out[t] = [];
    return out;
  }
  function insert(table, data) {
    db.seq[table] = (db.seq[table] || 0) + 1;
    const row = { id: db.seq[table], ...DEFAULTS[table], ...data, created_at: data.created_at || nowIso() };
    for (const k of Object.keys(row)) if (row[k] === undefined) row[k] = null;
    db[table].push(row);
    return row;
  }
  const byId = (table, id) => db[table].find((r) => r.id === Number(id));
  const logActivity = (userId, summary, audience = "all") => insert("activity", { user_id: userId ?? null, summary, audience });
  const getSetting = (k, fallback = null) => (db.settings[k] ?? fallback);
  const setSetting = (k, v) => {
    db.settings[k] = String(v);
  };

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...db, files }));
    } catch {
      // Over quota (big uploads) or storage blocked: keep file contents in memory only.
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ ...db, files: {} }));
      } catch {
        /* storage unavailable: the preview still works until the page is closed */
      }
    }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || !saved.seq) return false;
      db = { ...emptyDb(), ...saved };
      Object.assign(files, saved.files || {});
      delete db.files;
      return true;
    } catch {
      return false;
    }
  }

  // ─────────────────────────── Demo data (same story as seed.js) ───────────────────────────
  function seed() {
    db = emptyDb();
    for (const k of Object.keys(files)) delete files[k];
    let state = 7;
    const rand = () => (state = (state * 16807) % 2147483647) / 2147483647;
    const vary = (base, spread) => Math.round((base + (rand() - 0.5) * 2 * spread) / 10) * 10;
    const people = [
      ["Sipho Dlamini", "sipho@integralacademy.co.za", "admin", "Founder & CEO"],
      ["Ayesha Patel", "ayesha@integralacademy.co.za", "manager", "Operations & Finance"],
      ["Johan van der Merwe", "johan@integralacademy.co.za", "manager", "Head of Content"],
      ["Nomvula Khumalo", "nomvula@integralacademy.co.za", "member", "Maths Teacher & Presenter"],
      ["Kagiso Mokoena", "kagiso@integralacademy.co.za", "member", "School Partnerships"],
    ];
    const [sipho, ayesha, johan, nomvula, kagiso] = people.map(([name, email, role, job_title]) => insert("users", { name, email, role, job_title, password: DEMO_PASSWORD }).id);
    setSetting("company_name", "Integral Academy");
    setSetting("opening_balance", "650000");
    setSetting("opening_date", monthDay(12, 1));

    for (let m = 11; m >= 0; m--) {
      const growth = (11 - m) / 11;
      const tx = (kind, d, amount, category, description, counterparty) => insert("transactions", { kind, date: monthDay(m, d), amount, category, description, counterparty, created_by: ayesha });
      tx("expense", 25, 78000 + Math.round(growth * 14) * 1000, "Salaries", "Monthly salaries", "Team payroll");
      tx("expense", 1, 6500, "Rent", "Co-working desks", "Workshop17 Rosebank");
      tx("expense", 3, vary(3900, 300), "Software", "Video hosting, Google Workspace and Zoom", "Various");
      tx("expense", 10, vary(7000 + growth * 5000, 1500), "Marketing", "Social ads for learner sign-ups", "Meta Ads");
      tx("expense", 18, vary(2600, 900), "Travel", "School visits", "Fuel & Uber");
      if (m % 4 === 2) tx("expense", 14, vary(14000, 4000), "Equipment", "Recording equipment", "Takealot");
      tx("income", 5, vary(18000 + growth * 52000, 3000), "School contracts", "Monthly school licences", "Partner schools");
      tx("income", 28, vary(6000 + growth * 21000, 1500), "Learner subscriptions", "Learner subscriptions", "PayFast payouts");
      if (m === 7) tx("income", 12, 150000, "Grants", "Innovation grant (first tranche)", "Edtech innovation fund");
    }

    const leads = [
      ["Thuto-Lesedi Secondary School", "Mr T. Molefe", "Soweto", "won", 48000, 160, null, kagiso],
      ["Umlazi Comprehensive High", "Ms N. Zulu", "Durban", "won", 36000, 120, null, kagiso],
      ["Mamelodi Science Academy", "Dr P. Mahlangu", "Pretoria", "proposal", 54000, 180, day(2), kagiso],
      ["Gugulethu Senior Secondary", "Mr S. Ndlovu", "Cape Town", "meeting", 30000, 95, day(4), sipho],
      ["Tembisa High School", "Mrs L. Sithole", "Tembisa", "contacted", 42000, 140, day(-1), kagiso],
      ["Hillcrest Academy", "Mr R. Naidoo", "Pietermaritzburg", "contacted", 27000, 90, day(6), ayesha],
      ["Polokwane Maths Centre", "Ms K. Mabaso", "Polokwane", "lead", 24000, 80, day(10), kagiso],
      ["Mthatha Technical High", null, "Mthatha", "lead", 33000, 110, null, kagiso],
      ["Eastgate Girls' College", "Mrs A. Botha", "Bloemfontein", "lost", 21000, 70, null, sipho],
      ["Rustenburg Secondary", "Mr J. Kekana", "Rustenburg", "proposal", 39000, 130, day(1), sipho],
    ];
    const leadIds = leads.map(([school, contact_name, city, stage, value, learners, next_follow_up, owner_id]) =>
      insert("leads", { school, contact_name, contact_email: contact_name ? `principal@${school.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 16)}.school.za` : null, city, stage, value, learners, next_follow_up, owner_id }).id,
    );
    insert("lead_notes", { lead_id: leadIds[2], body: "Visited the school. HOD loved the past-paper walkthroughs; asked for a quote for 180 learners.", author_id: kagiso });
    insert("lead_notes", { lead_id: leadIds[2], body: "Proposal sent: R54 000 per year including teacher dashboard access.", author_id: kagiso });
    insert("lead_notes", { lead_id: leadIds[4], body: "Principal is keen but needs SGB approval at the next meeting.", author_id: kagiso });
    insert("lead_notes", { lead_id: leadIds[8], body: "They chose a cheaper print-based programme this year. Try again in October.", author_id: sipho });

    const content = [
      ["Calculus: first principles", "video", "Calculus", "published", johan, day(-20)],
      ["Functions and inverses walkthrough", "video", "Functions", "published", nomvula, day(-12)],
      ["2024 Paper 1 — full memo", "past_paper", "Exam prep", "review", nomvula, day(2)],
      ["Trigonometry identities worksheet", "worksheet", "Trigonometry", "editing", nomvula, day(5)],
      ["Probability: Venn diagrams", "lesson", "Probability", "recording", johan, day(7)],
      ["Sequences and series quiz", "quiz", "Sequences", "idea", nomvula, day(14)],
      ["Analytical geometry: circles", "video", "Analytical geometry", "idea", johan, day(21)],
      ["Financial maths in 15 minutes", "video", "Finance", "editing", nomvula, day(-2)],
    ];
    for (const [title, type, topic, stage, owner_id, due_date] of content) insert("content", { title, type, topic, stage, owner_id, due_date });

    const weekly = insert("meetings", {
      title: "Weekly team check-in", date: day(-3), attendees: "Sipho, Ayesha, Johan, Nomvula, Kagiso",
      notes: "Exam season is 6 weeks away. Learner sign-ups up 18% after the TikTok series. Two schools are waiting on proposals.",
      decisions: "Prioritise past-paper memos over new topics until exams\nKagiso to focus on proposals for Mamelodi and Rustenburg\nKeep marketing spend flat this month", created_by: sipho,
    }).id;
    const review = insert("meetings", {
      title: "Monthly finance review", date: day(-10), attendees: "Sipho, Ayesha",
      notes: "Burn is coming down as school licences grow. Grant second tranche depends on the impact report.",
      decisions: "Submit impact report by month end\nNo new hires until two more schools sign", created_by: ayesha,
    }).id;
    insert("meetings", { title: "Content planning: exam sprint", date: day(3), attendees: "Johan, Nomvula", notes: "", decisions: "", created_by: johan });

    const tasks = [
      ["Send Mamelodi proposal follow-up", kagiso, day(2), "high", "todo", { lead_id: leadIds[2], meeting_id: weekly }],
      ["Prepare Rustenburg proposal", kagiso, day(1), "high", "doing", { lead_id: leadIds[9], meeting_id: weekly }],
      ["Record 2024 Paper 1 memo intro", nomvula, day(-1), "medium", "todo", { meeting_id: weekly }],
      ["Write grant impact report", ayesha, day(9), "high", "doing", { meeting_id: review }],
      ["Reconcile last month's bank statement", ayesha, day(-2), "medium", "todo", {}],
      ["Review trig worksheet draft", johan, day(3), "medium", "todo", {}],
      ["Update pricing sheet for next year", sipho, day(12), "low", "todo", {}],
      ["Call Tembisa High about SGB decision", kagiso, day(-1), "medium", "todo", { lead_id: leadIds[4] }],
      ["Order second microphone", johan, day(-6), "low", "done", {}],
      ["Publish functions walkthrough", nomvula, day(-12), "medium", "done", {}],
    ];
    for (const [title, assignee_id, due_date, priority, status, extra] of tasks)
      insert("tasks", { title, assignee_id, due_date, priority, status, created_by: sipho, completed_at: status === "done" ? nowIso() : null, ...extra });

    insert("approvals", { title: "Ring light and backdrop for recordings", details: "Our current lighting makes the board hard to read on phones.", amount: 3800, requested_by: nomvula });
    insert("approvals", { title: "Travel to Polokwane for school visits", details: "Two-day trip to meet three schools in Limpopo.", amount: 5200, requested_by: kagiso });
    insert("approvals", { title: "Canva Pro for the team", amount: 2400, status: "approved", requested_by: johan, decided_by: ayesha, decision_note: "Approved — annual plan please.", decided_at: new Date(Date.now() - 5 * 86400000).toISOString() });
    insert("approvals", { title: "Billboard near Bree taxi rank", amount: 45000, status: "rejected", requested_by: kagiso, decided_by: sipho, decision_note: "Too expensive for now. Let's revisit after the grant's second tranche.", decided_at: new Date(Date.now() - 12 * 86400000).toISOString() });

    const doc = (title, folder, file_name, mime_type, body, uploaded_by, isPrivate = 0) => {
      const key = `seed-${db.seq.documents || 0}-${file_name}`;
      files[key] = { kind: "text", data: body };
      insert("documents", { title, folder, file_name, mime_type, size: new Blob([body]).size, storage_key: key, private: isPrivate, uploaded_by });
    };
    doc("Team handbook", "Policies", "team-handbook.txt", "text/plain", "Integral Academy team handbook\n\n1. We put learners first.\n2. Spending over R1 000 needs approval in the workspace.\n3. Meeting decisions and action items go in Meetings.\n", sipho);
    doc("Next year's school pricing", "Sales", "school-pricing.csv", "text/csv", "Learners,Price per year (R)\nUp to 100,24000\n101-200,42000\n201+,54000\n", sipho);
    doc("Grant agreement summary", "Finance", "grant-agreement-summary.txt", "text/plain", "Innovation grant: R300 000 in two tranches. Second tranche on approval of the impact report.\n", ayesha, 1);

    logActivity(sipho, "Sipho Dlamini set up the workspace");
    logActivity(kagiso, "Kagiso Mokoena added a note on Mamelodi Science Academy");
    logActivity(ayesha, "Ayesha Patel approved “Canva Pro for the team”", "manager");
    logActivity(nomvula, "Nomvula Khumalo updated content “Financial maths in 15 minutes”");
    db.session = sipho; // open signed in as the founder, so the first view shows the workspace
  }

  // ─────────────────────────── Rules shared with server.js ───────────────────────────
  class HttpError extends Error {
    constructor(status, message, fields) {
      super(message);
      this.status = status;
      this.fields = fields;
    }
  }
  const RANK = { member: 1, manager: 2, admin: 3 };
  const atLeast = (user, role) => RANK[user.role] >= RANK[role];
  function passwordProblem(pw) {
    if (typeof pw !== "string" || pw.length < 10) return "Use at least 10 characters.";
    if (pw.length > 200) return "Use at most 200 characters.";
    if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Use letters and at least one number.";
    return null;
  }
  function validate(spec, input, { partial = false } = {}) {
    const out = {};
    const errors = {};
    for (const [name, f] of Object.entries(spec)) {
      if (!Object.prototype.hasOwnProperty.call(input, name)) {
        if (!partial && f.required) errors[name] = "Required.";
        continue;
      }
      let v = input[name];
      if (v === "" || v === undefined) v = null;
      if (v === null) {
        if (f.required) errors[name] = "Required.";
        else out[name] = null;
        continue;
      }
      switch (f.type) {
        case "text":
          v = String(v).trim();
          if (f.required && !v) errors[name] = "Required.";
          else if (v.length > (f.max || 500)) errors[name] = `Keep it under ${f.max || 500} characters.`;
          break;
        case "enum":
          if (!f.values.includes(v)) errors[name] = "Choose one of the options.";
          break;
        case "date":
          if (!validDate(v)) errors[name] = "Enter a valid date.";
          break;
        case "money":
          v = Number(v);
          if (!Number.isFinite(v) || v < 0 || v > 1e10) errors[name] = "Enter a valid amount.";
          else v = Math.round(v * 100) / 100;
          if (f.positive && v <= 0) errors[name] = "Must be more than zero.";
          break;
        case "int":
          v = Number(v);
          if (!Number.isInteger(v) || v < 0) errors[name] = "Enter a whole number.";
          break;
        case "user":
          v = Number(v);
          if (!db.users.some((u) => u.id === v && u.active)) errors[name] = "Choose an active team member.";
          break;
        case "bool":
          v = v ? 1 : 0;
          break;
        case "email":
          v = String(v).trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 200) errors[name] = "Enter a valid email address.";
          break;
        default:
          break;
      }
      out[name] = v;
    }
    if (Object.keys(errors).length) throw new HttpError(422, "Please correct the highlighted fields.", errors);
    return out;
  }

  // Sorting helpers mirroring the SQL ORDER BY clauses.
  const cmp = (a, b) => (a === b ? 0 : a > b ? 1 : -1);
  const nullsLast = (a, b) => (a === null) - (b === null);
  const sortBy = (rows, ...fns) => [...rows].sort((a, b) => {
    for (const fn of fns) {
      const r = fn(a, b);
      if (r) return r;
    }
    return 0;
  });
  const byDueThenNewest = (dueKey) => [(a, b) => nullsLast(a[dueKey], b[dueKey]), (a, b) => cmp(a[dueKey], b[dueKey]), (a, b) => b.id - a.id];
  const pub = (row) => {
    const { password, ...rest } = row;
    return rest;
  };

  const RESOURCES = {
    tasks: {
      label: (r) => `task “${r.title}”`,
      fields: {
        title: { type: "text", required: true, max: 200 }, notes: { type: "text", max: 5000 },
        status: { type: "enum", values: ["todo", "doing", "done"] }, priority: { type: "enum", values: ["low", "medium", "high"] },
        due_date: { type: "date" }, assignee_id: { type: "user" }, meeting_id: { type: "int" }, lead_id: { type: "int" },
      },
      list: () => sortBy(db.tasks, (a, b) => (a.status === "done") - (b.status === "done"), ...byDueThenNewest("due_date")),
      beforeCreate: (data, user) => ({ ...data, created_by: user.id, assignee_id: data.assignee_id ?? user.id }),
      beforeUpdate: (data, row) => ("status" in data ? { ...data, completed_at: data.status === "done" ? row.completed_at || nowIso() : null } : data),
      canEdit: (user, row) => atLeast(user, "manager") || row.created_by === user.id || row.assignee_id === user.id,
      canDelete: (user, row) => atLeast(user, "manager") || row.created_by === user.id,
    },
    leads: {
      label: (r) => `school ${r.school}`,
      fields: {
        school: { type: "text", required: true, max: 200 }, contact_name: { type: "text", max: 120 }, contact_email: { type: "email" },
        contact_phone: { type: "text", max: 40 }, city: { type: "text", max: 80 },
        stage: { type: "enum", values: ["lead", "contacted", "meeting", "proposal", "won", "lost"] },
        value: { type: "money" }, learners: { type: "int" }, next_follow_up: { type: "date" }, owner_id: { type: "user" },
      },
      list: () => sortBy(db.leads, (a, b) => cmp(a.school, b.school)),
      beforeCreate: (data, user) => ({ ...data, owner_id: data.owner_id ?? user.id }),
      canEdit: () => true,
      canDelete: (user) => atLeast(user, "manager"),
      onDelete: (row) => {
        db.lead_notes = db.lead_notes.filter((n) => n.lead_id !== row.id);
        for (const t of db.tasks) if (t.lead_id === row.id) t.lead_id = null;
      },
    },
    content: {
      label: (r) => `content “${r.title}”`,
      fields: {
        title: { type: "text", required: true, max: 200 }, type: { type: "enum", values: ["video", "lesson", "worksheet", "quiz", "past_paper"] },
        topic: { type: "text", max: 120 }, stage: { type: "enum", values: ["idea", "recording", "editing", "review", "published"] },
        owner_id: { type: "user" }, due_date: { type: "date" },
      },
      list: () => sortBy(db.content, ...byDueThenNewest("due_date")),
      beforeCreate: (data, user) => ({ ...data, owner_id: data.owner_id ?? user.id }),
      beforeUpdate: (data, row, user) => {
        if (data.stage === "published" && !atLeast(user, "manager")) throw new HttpError(403, "Only a manager can mark content as published.");
        return data;
      },
      canEdit: () => true,
      canDelete: (user) => atLeast(user, "manager"),
    },
    transactions: {
      label: (r) => `${r.kind} of R${Number(r.amount).toLocaleString("en-ZA")} (${r.description})`,
      audience: "manager",
      fields: {
        kind: { type: "enum", values: ["income", "expense"], required: true }, date: { type: "date", required: true },
        amount: { type: "money", required: true, positive: true }, category: { type: "text", required: true, max: 60 },
        description: { type: "text", required: true, max: 200 }, counterparty: { type: "text", max: 120 },
      },
      canRead: (user) => atLeast(user, "manager"),
      list: () => sortBy(db.transactions, (a, b) => cmp(b.date, a.date), (a, b) => b.id - a.id),
      beforeCreate: (data, user) => ({ ...data, created_by: user.id }),
      canCreate: (user) => atLeast(user, "manager"),
      canEdit: (user) => atLeast(user, "manager"),
      canDelete: (user) => atLeast(user, "manager"),
    },
    meetings: {
      label: (r) => `meeting “${r.title}”`,
      fields: {
        title: { type: "text", required: true, max: 200 }, date: { type: "date", required: true }, attendees: { type: "text", max: 500 },
        notes: { type: "text", max: 20000 }, decisions: { type: "text", max: 5000 },
      },
      list: () => sortBy(db.meetings, (a, b) => cmp(b.date, a.date), (a, b) => b.id - a.id),
      beforeCreate: (data, user) => ({ ...data, created_by: user.id }),
      canEdit: () => true,
      canDelete: (user, row) => atLeast(user, "manager") || row.created_by === user.id,
      onDelete: (row) => {
        for (const t of db.tasks) if (t.meeting_id === row.id) t.meeting_id = null;
      },
    },
    approvals: {
      label: (r) => `approval request “${r.title}”`,
      audience: "manager",
      fields: { title: { type: "text", required: true, max: 200 }, details: { type: "text", max: 5000 }, amount: { type: "money" } },
      list: (user) =>
        atLeast(user, "manager")
          ? sortBy(db.approvals, (a, b) => (a.status !== "pending") - (b.status !== "pending"), (a, b) => b.id - a.id)
          : sortBy(db.approvals.filter((a) => a.requested_by === user.id), (a, b) => b.id - a.id),
      beforeCreate: (data, user) => ({ ...data, requested_by: user.id }),
      canEdit: (user, row) => row.requested_by === user.id && row.status === "pending",
      canDelete: (user, row) => (row.requested_by === user.id && row.status === "pending") || atLeast(user, "admin"),
    },
  };
  const checkLinks = (data) => {
    if (data.meeting_id != null && !byId("meetings", data.meeting_id)) throw new HttpError(422, "A linked record is missing.");
    if (data.lead_id != null && !byId("leads", data.lead_id)) throw new HttpError(422, "A linked record is missing.");
  };

  // ─────────────────────────── Finance & dashboard ───────────────────────────
  function lastMonths(n) {
    const out = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
    return out;
  }
  function financeSummary(months = 12) {
    const keys = lastMonths(months);
    const sum = (rows) => rows.reduce((s, t) => s + t.amount, 0);
    const series = keys.map((m) => {
      const income = sum(db.transactions.filter((t) => t.kind === "income" && t.date.slice(0, 7) === m));
      const expense = sum(db.transactions.filter((t) => t.kind === "expense" && t.date.slice(0, 7) === m));
      return { month: m, income, expense, net: income - expense };
    });
    const opening = Number(getSetting("opening_balance", "0")) || 0;
    const cash = opening + sum(db.transactions.filter((t) => t.kind === "income")) - sum(db.transactions.filter((t) => t.kind === "expense"));
    const recent = series.slice(-4, -1);
    const avgBurn = recent.length ? recent.reduce((s, m) => s + (m.expense - m.income), 0) / recent.length : 0;
    const since = `${keys.at(-3)}-01`;
    const cats = {};
    for (const t of db.transactions) if (t.kind === "expense" && t.date >= since) cats[t.category] = (cats[t.category] || 0) + t.amount;
    return {
      series, cash, openingBalance: opening, avgMonthlyBurn: avgBurn,
      runwayMonths: avgBurn > 0 ? Math.max(0, cash) / avgBurn : null,
      thisMonth: series.at(-1), lastMonth: series.at(-2),
      expenseCategories: Object.entries(cats).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total),
    };
  }
  const backupDue = () => {
    const last = getSetting("last_backup_at");
    return !last || Date.now() - new Date(last).getTime() > 7 * 86400000;
  };
  function dashboard(user) {
    const today = localToday();
    const manager = atLeast(user, "manager");
    const open = db.tasks.filter((t) => t.status !== "done");
    const due = (rows) => sortBy(rows, (a, b) => nullsLast(a.due_date, b.due_date), (a, b) => cmp(a.due_date, b.due_date));
    const groups = {};
    for (const l of db.leads) {
      groups[l.stage] = groups[l.stage] || { stage: l.stage, n: 0, value: 0 };
      groups[l.stage].n++;
      groups[l.stage].value += l.value || 0;
    }
    const contentGroups = {};
    for (const c of db.content) contentGroups[c.stage] = (contentGroups[c.stage] || 0) + 1;
    const userName = (id) => (byId("users", id) || {}).name || null;
    return {
      company: getSetting("company_name", "Integral Academy"),
      backup: atLeast(user, "admin") ? { due: backupDue(), last: getSetting("last_backup_at") } : null,
      finance: manager ? financeSummary(12) : null,
      myTasks: due(open.filter((t) => t.assignee_id === user.id)).slice(0, 8),
      overdueTasks: due(open.filter((t) => t.due_date && t.due_date < today)).slice(0, 8),
      openTasks: open.length,
      pendingApprovals: manager
        ? sortBy(db.approvals.filter((a) => a.status === "pending"), (a, b) => b.id - a.id).slice(0, 6)
        : sortBy(db.approvals.filter((a) => a.status === "pending" && a.requested_by === user.id), (a, b) => b.id - a.id),
      pipeline: Object.values(groups),
      followUps: sortBy(db.leads.filter((l) => l.next_follow_up && l.next_follow_up <= day(7) && !["won", "lost"].includes(l.stage)), (a, b) => cmp(a.next_follow_up, b.next_follow_up)).slice(0, 8),
      content: Object.entries(contentGroups).map(([stage, n]) => ({ stage, n })),
      learnersSigned: db.leads.filter((l) => l.stage === "won").reduce((s, l) => s + (l.learners || 0), 0),
      upcomingMeetings: sortBy(db.meetings.filter((m) => m.date >= today), (a, b) => cmp(a.date, b.date)).slice(0, 5),
      activity: sortBy(db.activity.filter((a) => manager || a.audience === "all"), (a, b) => b.id - a.id).slice(0, 12).map((a) => ({ summary: a.summary, created_at: a.created_at, user_name: userName(a.user_id) })),
    };
  }
  const canSeeDoc = (user, d) => !d.private || d.uploaded_by === user.id || atLeast(user, "manager");
  const DOC_TYPES = {
    ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".txt": "text/plain", ".csv": "text/csv",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };

  // ─────────────────────────── Request handling ───────────────────────────
  const currentUser = () => {
    const u = db.session ? byId("users", db.session) : null;
    return u && u.active ? { id: u.id, name: u.name, email: u.email, role: u.role, job_title: u.job_title, must_change_password: Boolean(u.must_change_password) } : null;
  };
  const readFileBody = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new HttpError(422, "Couldn't read that file."));
      if (/^text\/|csv/.test(file.type) || /\.(txt|csv)$/i.test(file.name || "")) reader.readAsText(file);
      else reader.readAsDataURL(file);
    });

  async function api(method, url, headers, rawBody) {
    const parts = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
    const body = () => {
      if (typeof rawBody !== "string" || !rawBody) return {};
      try {
        return JSON.parse(rawBody);
      } catch {
        throw new HttpError(400, "Invalid request.");
      }
    };
    if (method !== "GET" && headers["x-requested-with"] !== "workspace") throw new HttpError(403, "Request blocked.");

    if (parts[0] === "auth") {
      const userCount = db.users.length;
      if (parts[1] === "status" && method === "GET") return [200, { setupRequired: userCount === 0, user: currentUser(), company: getSetting("company_name", "Integral Academy") }];
      if (parts[1] === "setup" && method === "POST") {
        if (userCount > 0) throw new HttpError(409, "The workspace is already set up.");
        const input = body();
        const data = validate({ name: { type: "text", required: true, max: 120 }, email: { type: "email", required: true }, company: { type: "text", max: 120 } }, input);
        const problem = passwordProblem(input.password);
        if (problem) throw new HttpError(422, problem, { password: problem });
        const u = insert("users", { name: data.name, email: data.email, role: "admin", job_title: "Founder", password: input.password });
        if (data.company) setSetting("company_name", data.company);
        logActivity(u.id, `${data.name} set up the workspace`);
        db.session = u.id;
        return [201, { ok: true }];
      }
      if (parts[1] === "login" && method === "POST") {
        const input = body();
        const email = String(input.email || "").trim().toLowerCase();
        const u = db.users.find((x) => x.email.toLowerCase() === email);
        if (!u || !u.active || u.password !== String(input.password || "")) throw new HttpError(401, "Invalid email or password.");
        db.session = u.id;
        return [200, { ok: true }];
      }
      if (parts[1] === "logout" && method === "POST") {
        db.session = null;
        return [200, { ok: true }];
      }
    }

    const user = currentUser();
    if (!user) throw new HttpError(401, "Please sign in.");

    if (parts[0] === "auth" && parts[1] === "password" && method === "POST") {
      const input = body();
      const row = byId("users", user.id);
      if (String(input.current || "") !== row.password) throw new HttpError(422, "Your current password is incorrect.", { current: "Incorrect password." });
      const problem = passwordProblem(input.next);
      if (problem) throw new HttpError(422, problem, { next: problem });
      if (input.next === input.current) throw new HttpError(422, "Choose a password different from the current one.", { next: "Must be different from the current password." });
      row.password = input.next;
      row.must_change_password = 0;
      return [200, { ok: true }];
    }
    if (user.must_change_password) throw new HttpError(403, "Please choose a new password first.");

    if (parts[0] === "dashboard" && method === "GET") return [200, dashboard(user)];
    if (parts[0] === "finance" && parts[1] === "summary" && method === "GET") {
      if (!atLeast(user, "manager")) throw new HttpError(403, "Finance is for managers.");
      return [200, financeSummary(Math.min(24, Math.max(3, Number(url.searchParams.get("months")) || 12)))];
    }
    if (parts[0] === "counts" && method === "GET") {
      const mine = db.tasks.filter((t) => t.assignee_id === user.id && t.status !== "done");
      return [200, {
        myOpenTasks: mine.length,
        myOverdueTasks: mine.filter((t) => t.due_date && t.due_date < localToday()).length,
        approvalsToDecide: atLeast(user, "manager") ? db.approvals.filter((a) => a.status === "pending" && a.requested_by !== user.id).length : 0,
      }];
    }
    if (parts[0] === "calendar" && method === "GET") {
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      if (!validDate(from) || !validDate(to) || to < from) throw new HttpError(400, "Choose a valid date range.");
      if ((new Date(to) - new Date(from)) / 86400000 > 70) throw new HttpError(400, "Choose a range of two months or less.");
      const inRange = (d) => d && d >= from && d <= to;
      return [200, [
        ...db.tasks.filter((t) => inRange(t.due_date)).map((t) => ({ type: "task", id: t.id, title: t.title, date: t.due_date, done: t.status === "done", person_id: t.assignee_id })),
        ...db.leads.filter((l) => inRange(l.next_follow_up) && !["won", "lost"].includes(l.stage)).map((l) => ({ type: "followup", id: l.id, title: l.school, date: l.next_follow_up, done: false, person_id: l.owner_id })),
        ...db.content.filter((c) => inRange(c.due_date)).map((c) => ({ type: "content", id: c.id, title: c.title, date: c.due_date, done: c.stage === "published", person_id: c.owner_id })),
        ...db.meetings.filter((m) => inRange(m.date)).map((m) => ({ type: "meeting", id: m.id, title: m.title, date: m.date, done: false, person_id: null })),
      ]];
    }
    if (parts[0] === "search" && method === "GET") {
      const q = String(url.searchParams.get("q") || "").trim().slice(0, 100).toLowerCase();
      if (q.length < 2) return [200, []];
      const hit = (row, cols) => cols.some((c) => row[c] && String(row[c]).toLowerCase().includes(q));
      const manager = atLeast(user, "manager");
      const newest = (rows) => sortBy(rows, (a, b) => b.id - a.id);
      return [200, [
        ...sortBy(db.tasks.filter((r) => hit(r, ["title", "notes"])), (a, b) => (a.status === "done") - (b.status === "done"), (a, b) => b.id - a.id).slice(0, 6).map((r) => ({ type: "task", id: r.id, title: r.title, status: r.status, date: r.due_date })),
        ...sortBy(db.leads.filter((r) => hit(r, ["school", "contact_name", "contact_email", "city"])), (a, b) => cmp(a.school, b.school)).slice(0, 6).map((r) => ({ type: "lead", id: r.id, title: r.school, sub: r.city, status: r.stage })),
        ...newest(db.content.filter((r) => hit(r, ["title", "topic"]))).slice(0, 6).map((r) => ({ type: "content", id: r.id, title: r.title, sub: r.type, status: r.stage })),
        ...sortBy(db.meetings.filter((r) => hit(r, ["title", "attendees", "notes", "decisions"])), (a, b) => cmp(b.date, a.date)).slice(0, 6).map((r) => ({ type: "meeting", id: r.id, title: r.title, date: r.date })),
        ...newest(db.documents.filter((r) => hit(r, ["title", "file_name", "folder"]) && canSeeDoc(user, r))).slice(0, 6).map((r) => ({ type: "document", id: r.id, title: r.title, sub: `${r.folder} · ${r.file_name}` })),
        ...newest(db.approvals.filter((r) => hit(r, ["title", "details"]) && (manager || r.requested_by === user.id))).slice(0, 6).map((r) => ({ type: "approval", id: r.id, title: r.title, status: r.status, amount: r.amount })),
        ...(manager ? sortBy(db.transactions.filter((r) => hit(r, ["description", "counterparty", "category"])), (a, b) => cmp(b.date, a.date)).slice(0, 6).map((r) => ({ type: "transaction", id: r.id, title: r.description, date: r.date, amount: r.kind === "expense" ? -r.amount : r.amount })) : []),
        ...sortBy(db.users.filter((r) => r.active && hit(r, ["name", "email", "job_title"])), (a, b) => cmp(a.name, b.name)).slice(0, 6).map((r) => ({ type: "person", id: r.id, title: r.name, sub: r.job_title })),
      ]];
    }

    if (parts[0] === "users") {
      if (method === "GET") return [200, sortBy(db.users, (a, b) => b.active - a.active, (a, b) => cmp(a.name, b.name)).map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, job_title: u.job_title, active: u.active, created_at: u.created_at }))];
      if (!atLeast(user, "admin")) throw new HttpError(403, "Only an admin can manage the team.");
      const spec = { name: { type: "text", required: true, max: 120 }, email: { type: "email", required: true }, role: { type: "enum", values: ["admin", "manager", "member"], required: true }, job_title: { type: "text", max: 120 }, active: { type: "bool" } };
      if (method === "POST" && !parts[1]) {
        const input = body();
        const data = validate(spec, input);
        const problem = passwordProblem(input.password);
        if (problem) throw new HttpError(422, problem, { password: problem });
        if (db.users.some((u) => u.email.toLowerCase() === data.email)) throw new HttpError(422, "That email is already in use.", { email: "Already in use." });
        const created = insert("users", { ...data, active: data.active ?? 1, password: input.password, must_change_password: 1 });
        logActivity(user.id, `${user.name} added ${created.name} to the team`);
        return [201, { id: created.id }];
      }
      const target = byId("users", parts[1]);
      if (!target) throw new HttpError(404, "Not found.");
      if (method === "PATCH") {
        const input = body();
        const data = validate(spec, input, { partial: true });
        if (target.id === user.id && (data.active === 0 || (data.role && data.role !== "admin"))) throw new HttpError(422, "You can't deactivate or demote yourself.");
        const otherAdmins = db.users.filter((u) => u.role === "admin" && u.active && u.id !== target.id).length;
        if (target.role === "admin" && (data.active === 0 || (data.role && data.role !== "admin")) && otherAdmins === 0) throw new HttpError(422, "The workspace needs at least one active admin.");
        if (data.email && db.users.some((u) => u.id !== target.id && u.email.toLowerCase() === data.email)) throw new HttpError(422, "That email is already in use.", { email: "Already in use." });
        if (input.password) {
          const problem = passwordProblem(input.password);
          if (problem) throw new HttpError(422, problem, { password: problem });
          data.password = input.password;
          data.must_change_password = 1;
        }
        Object.assign(target, data);
        logActivity(user.id, `${user.name} updated ${target.name}'s account`);
        return [200, { ok: true }];
      }
    }

    if (parts[0] === "settings") {
      if (method === "GET") return [200, { company_name: getSetting("company_name", "Integral Academy"), opening_balance: Number(getSetting("opening_balance", "0")) || 0, opening_date: getSetting("opening_date", ""), last_backup_at: getSetting("last_backup_at") }];
      if (method === "PUT") {
        if (!atLeast(user, "admin")) throw new HttpError(403, "Only an admin can change settings.");
        const data = validate({ company_name: { type: "text", max: 120 }, opening_balance: { type: "money" }, opening_date: { type: "date" } }, body(), { partial: true });
        for (const [k, v] of Object.entries(data)) setSetting(k, v ?? "");
        logActivity(user.id, `${user.name} updated workspace settings`);
        return [200, { ok: true }];
      }
    }

    if (parts[0] === "approvals" && parts[2] === "decide" && method === "POST") {
      if (!atLeast(user, "manager")) throw new HttpError(403, "Only managers can decide approvals.");
      const row = byId("approvals", parts[1]);
      if (!row) throw new HttpError(404, "Not found.");
      if (row.requested_by === user.id) throw new HttpError(403, "You can't approve your own request.");
      if (row.status !== "pending") throw new HttpError(409, "This request has already been decided.");
      const data = validate({ decision: { type: "enum", values: ["approved", "rejected"], required: true }, note: { type: "text", max: 1000 } }, body());
      Object.assign(row, { status: data.decision, decided_by: user.id, decision_note: data.note ?? null, decided_at: nowIso() });
      logActivity(user.id, `${user.name} ${data.decision} “${row.title}”`, "manager");
      return [200, { ok: true }];
    }

    if (parts[0] === "leads" && parts[2] === "notes") {
      const lead = byId("leads", parts[1]);
      if (!lead) throw new HttpError(404, "Not found.");
      if (method === "GET") return [200, sortBy(db.lead_notes.filter((n) => n.lead_id === lead.id), (a, b) => b.id - a.id).map((n) => ({ ...n, author_name: (byId("users", n.author_id) || {}).name || null }))];
      if (method === "POST") {
        const data = validate({ body: { type: "text", required: true, max: 5000 } }, body());
        insert("lead_notes", { lead_id: lead.id, body: data.body, author_id: user.id });
        logActivity(user.id, `${user.name} added a note on ${lead.school}`);
        return [201, { ok: true }];
      }
    }

    if (parts[0] === "documents") {
      if (method === "GET" && !parts[1]) return [200, sortBy(db.documents.filter((d) => canSeeDoc(user, d)), (a, b) => b.id - a.id).map((d) => ({ ...d, uploader_name: (byId("users", d.uploaded_by) || {}).name || null }))];
      if (method === "POST" && !parts[1]) {
        const fileName = decodeURIComponent(String(headers["x-file-name"] || "")).replace(/[^\w.\- ()]/g, "_").slice(0, 150);
        const ext = (fileName.match(/\.[^.]+$/) || [""])[0].toLowerCase();
        if (!DOC_TYPES[ext]) throw new HttpError(422, "Upload a PDF, image, Word, Excel, PowerPoint, CSV or text file.");
        const meta = validate({ title: { type: "text", required: true, max: 200 }, folder: { type: "text", max: 60 } }, { title: decodeURIComponent(String(headers["x-title"] || "")), folder: decodeURIComponent(String(headers["x-folder"] || "")) || "General" });
        if (!(rawBody instanceof Blob) || !rawBody.size) throw new HttpError(422, "The file is empty.");
        if (rawBody.size > MAX_UPLOAD) throw new HttpError(413, "In this online preview, files can be up to 2 MB. The real workspace takes up to 20 MB.");
        const key = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}${ext}`;
        const data = await readFileBody(rawBody);
        files[key] = { kind: typeof data === "string" && data.startsWith("data:") ? "dataurl" : "text", data };
        const doc = insert("documents", { title: meta.title, folder: meta.folder || "General", file_name: fileName, mime_type: DOC_TYPES[ext], size: rawBody.size, storage_key: key, private: headers["x-private"] === "1" ? 1 : 0, uploaded_by: user.id });
        logActivity(user.id, `${user.name} uploaded “${doc.title}”`, doc.private ? "manager" : "all");
        return [201, { id: doc.id }];
      }
      const doc = byId("documents", parts[1]);
      if (!doc || !canSeeDoc(user, doc)) throw new HttpError(404, "Not found.");
      if (method === "DELETE") {
        if (!(doc.uploaded_by === user.id || atLeast(user, "manager"))) throw new HttpError(403, "Only the uploader or a manager can delete this.");
        db.documents = db.documents.filter((d) => d.id !== doc.id);
        delete files[doc.storage_key];
        logActivity(user.id, `${user.name} deleted “${doc.title}”`, doc.private ? "manager" : "all");
        return [200, { ok: true }];
      }
    }

    const resource = RESOURCES[parts[0]];
    if (resource) {
      const table = parts[0];
      if (resource.canRead && !resource.canRead(user)) throw new HttpError(403, "You don't have access to this.");
      if (method === "GET" && !parts[1]) return [200, resource.list(user)];
      if (method === "POST" && !parts[1]) {
        if (resource.canCreate && !resource.canCreate(user)) throw new HttpError(403, "You don't have access to this.");
        let data = validate(resource.fields, body());
        if (resource.beforeCreate) data = resource.beforeCreate(data, user);
        checkLinks(data);
        const row = insert(table, data);
        logActivity(user.id, `${user.name} added ${resource.label(row)}`, resource.audience);
        return [201, row];
      }
      const row = byId(table, parts[1]);
      if (!row) throw new HttpError(404, "Not found.");
      if (table === "approvals" && !atLeast(user, "manager") && row.requested_by !== user.id) throw new HttpError(404, "Not found.");
      if (method === "GET") return [200, row];
      if (method === "PATCH") {
        if (!resource.canEdit(user, row)) throw new HttpError(403, "You can't change this.");
        let data = validate(resource.fields, body(), { partial: true });
        if (resource.beforeUpdate) data = resource.beforeUpdate(data, row, user);
        checkLinks(data);
        Object.assign(row, data);
        logActivity(user.id, `${user.name} updated ${resource.label(row)}`, resource.audience);
        return [200, row];
      }
      if (method === "DELETE") {
        if (!resource.canDelete(user, row)) throw new HttpError(403, "You can't delete this.");
        db[table] = db[table].filter((r) => r.id !== row.id);
        if (resource.onDelete) resource.onDelete(row);
        logActivity(user.id, `${user.name} deleted ${resource.label(row)}`, resource.audience);
        return [200, { ok: true }];
      }
    }
    throw new HttpError(404, "Not found.");
  }

  // Answer the app's fetch("/api/...") calls here; anything else goes to the network as usual.
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const href = typeof input === "string" ? input : input.url;
    if (!href.startsWith("/api/")) return realFetch(input, init);
    const headers = {};
    for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = v;
    let status = 200;
    let payload;
    try {
      [status, payload] = await api((init.method || "GET").toUpperCase(), new URL(href, "https://preview.local"), headers, init.body);
    } catch (error) {
      if (error instanceof HttpError) {
        status = error.status;
        payload = { error: error.message, fields: error.fields };
      } else {
        console.error(error);
        status = 500;
        payload = { error: "Something went wrong. Please try again." };
      }
    }
    persist();
    renderBar();
    await new Promise((r) => setTimeout(r, 40)); // a touch of latency so loading states behave as they do on a real network
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  };

  // ─────────────────────────── Downloads become previews ───────────────────────────
  // Online previews can't save files, so file links open an in-page viewer instead.
  function overlay(title, bodyNode) {
    const wrap = document.createElement("div");
    wrap.className = "pv-overlay";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", title);
    const panel = document.createElement("div");
    panel.className = "pv-panel";
    const head = document.createElement("div");
    head.className = "pv-head";
    const h = document.createElement("h2");
    h.textContent = title;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "pv-close";
    close.textContent = "Close";
    head.append(h, close);
    panel.append(head, bodyNode);
    wrap.append(panel);
    const done = () => {
      wrap.remove();
      window.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => e.key === "Escape" && done();
    close.addEventListener("click", done);
    wrap.addEventListener("click", (e) => e.target === wrap && done());
    window.addEventListener("keydown", onKey);
    document.body.append(wrap);
    close.focus();
  }
  const para = (text, cls) => {
    const p = document.createElement("p");
    p.textContent = text;
    if (cls) p.className = cls;
    return p;
  };
  function showDocument(id) {
    const user = currentUser();
    const doc = user && byId("documents", id);
    if (!doc || !canSeeDoc(user, doc)) return;
    const body = document.createElement("div");
    body.className = "pv-body";
    const file = files[doc.storage_key];
    if (!file) body.append(para("This file's contents were too large to keep in this browser. In the real workspace, files are stored on the workspace computer."));
    else if (file.kind === "text") {
      const pre = document.createElement("pre");
      pre.className = "pv-pre";
      pre.textContent = file.data;
      body.append(pre);
    } else if (/^image\//.test(doc.mime_type)) {
      const img = document.createElement("img");
      img.src = file.data;
      img.alt = doc.title;
      img.className = "pv-img";
      body.append(img);
    } else body.append(para(`${doc.file_name} is stored. Opening ${doc.mime_type === "application/pdf" ? "PDFs" : "Office files"} needs the real workspace, where this link downloads the file.`));
    body.append(para(`${doc.file_name} · uploaded ${new Date(doc.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`, "pv-note"));
    overlay(doc.title, body);
  }
  function backupNotice() {
    const user = currentUser();
    if (!user || !atLeast(user, "admin")) return;
    setSetting("last_backup_at", nowIso());
    logActivity(user.id, `${user.name} downloaded a backup`, "manager");
    persist();
    const body = document.createElement("div");
    body.className = "pv-body";
    body.append(
      para(`In the workspace on your computer, this button saves workspace-backup-${localToday()}.zip: the whole database plus every uploaded file, ready to keep on cloud storage or a USB drive.`),
      para("This online preview can't save files, so the backup was only recorded.", "pv-note"),
    );
    overlay("Backup", body);
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[href^='/api/']");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href");
    const m = href.match(/^\/api\/documents\/(\d+)\/file/);
    if (m) showDocument(Number(m[1]));
    else if (href.startsWith("/api/backup")) backupNotice();
  }, true);

  // ─────────────────────────── Preview bar ───────────────────────────
  const ROLE_LABEL = { admin: "Admin", manager: "Manager", member: "Member" };
  let bar;
  let panelOpen = false;
  function switchTo(userId) {
    db.session = userId;
    persist();
    panelOpen = false;
    window.location.hash = "#/dashboard";
    window.dispatchEvent(new Event("ws:refresh"));
    renderBar();
  }
  function renderBar() {
    if (!bar) return;
    const user = currentUser();
    const button = (label, onClick, cls = "") => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = cls;
      b.textContent = label;
      b.addEventListener("click", onClick);
      return b;
    };
    bar.replaceChildren();
    const toggle = button("", () => {
      panelOpen = !panelOpen;
      renderBar();
    }, "pv-pill");
    toggle.setAttribute("aria-expanded", String(panelOpen));
    const tag = document.createElement("strong");
    tag.textContent = "Preview";
    const who = document.createElement("span");
    who.textContent = user ? `${user.name.split(" ")[0]} · ${ROLE_LABEL[user.role]}` : db.users.length ? "Signed out" : "Empty workspace";
    const caret = document.createElement("span");
    caret.setAttribute("aria-hidden", "true");
    caret.textContent = panelOpen ? "▾" : "▴";
    toggle.append(tag, who, caret);
    if (panelOpen) {
      const panel = document.createElement("div");
      panel.className = "pv-menu";
      panel.append(para("See the workspace as:", "pv-menu-label"));
      const people = document.createElement("div");
      people.className = "pv-people";
      for (const u of db.users.filter((x) => x.active && x.password === DEMO_PASSWORD).slice(0, 6)) {
        const b = button("", () => switchTo(u.id), user && user.id === u.id ? "pv-person pv-current" : "pv-person");
        const n = document.createElement("span");
        n.textContent = u.name;
        const r = document.createElement("small");
        r.textContent = `${ROLE_LABEL[u.role]} · ${u.job_title || ""}`;
        b.append(n, r);
        people.append(b);
      }
      if (!people.childElementCount) people.append(para("The demo accounts were removed. Reset the demo to bring them back.", "pv-note"));
      panel.append(people);
      const actions = document.createElement("div");
      actions.className = "pv-actions";
      if (user) actions.append(button("Sign out", () => switchTo(null)));
      actions.append(
        button("Reset demo data", () => {
          seed();
          switchTo(db.session);
        }),
        button("Start empty", () => {
          db = emptyDb();
          for (const k of Object.keys(files)) delete files[k];
          switchTo(null);
        }),
      );
      panel.append(actions, para(`Demo password for every account: ${DEMO_PASSWORD}. Changes stay in this browser only. The real workspace runs on your own computer.`, "pv-note"));
      bar.append(panel);
    }
    bar.append(toggle);
  }
  function mountBar() {
    bar = document.createElement("div");
    bar.className = "pv-bar";
    bar.setAttribute("aria-label", "Preview controls");
    document.body.append(bar);
    renderBar();
  }

  if (!load()) seed();
  persist();
  if (document.body) mountBar();
  else document.addEventListener("DOMContentLoaded", mountBar);
})();
