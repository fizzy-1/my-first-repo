// Optional demo data so you can try the workspace before using it for real:  node seed.js
// It only runs on an empty workspace. To start over, stop the server and delete the data folder.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_DIR, get, logActivity, run, setSetting } from "./db.js";
import { hashPassword } from "./passwords.js";

if (get("SELECT COUNT(*) AS n FROM users").n > 0) {
  console.error("The workspace already has accounts, so demo data was not added.");
  console.error("To start over with demo data: stop the server, delete the data folder, then run this again.");
  process.exit(1);
}

const PASSWORD = "integral-demo-2026";
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return iso(d);
};
const monthDay = (monthsAgo, dayOfMonth) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, dayOfMonth);
  return d > now ? iso(now) : iso(d);
};
// Small deterministic random so every seed looks the same.
let state = 7;
const rand = () => ((state = (state * 16807) % 2147483647) / 2147483647);
const vary = (base, spread) => Math.round((base + (rand() - 0.5) * 2 * spread) / 10) * 10;

const insert = (table, data) => {
  const keys = Object.keys(data);
  return Number(run(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`, ...keys.map((k) => data[k] ?? null)).lastInsertRowid);
};

// ── Team ──
const hash = await hashPassword(PASSWORD);
const people = [
  ["Sipho Dlamini", "sipho@integralacademy.co.za", "admin", "Founder & CEO"],
  ["Ayesha Patel", "ayesha@integralacademy.co.za", "manager", "Operations & Finance"],
  ["Johan van der Merwe", "johan@integralacademy.co.za", "manager", "Head of Content"],
  ["Nomvula Khumalo", "nomvula@integralacademy.co.za", "member", "Maths Teacher & Presenter"],
  ["Kagiso Mokoena", "kagiso@integralacademy.co.za", "member", "School Partnerships"],
];
const [sipho, ayesha, johan, nomvula, kagiso] = people.map(([name, email, role, job]) => insert("users", { name, email, password_hash: hash, role, job_title: job }));

setSetting("company_name", "Integral Academy");
setSetting("opening_balance", "650000");
setSetting("opening_date", monthDay(12, 1));

// ── Money: 12 months of a young edtech company ──
for (let m = 11; m >= 0; m--) {
  const growth = (11 - m) / 11; // 0 → 1 across the year
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

// ── Schools pipeline ──
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
  insert("leads", { school, contact_name, contact_email: contact_name ? `principal@${school.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 16)}.school.za` : null, city, stage, value, learners, next_follow_up, owner_id, won_at: stage === "won" ? `${school.startsWith("Thuto") ? monthDay(2, 14) : day(-6)}T09:00:00.000Z` : null }),
);
insert("lead_notes", { lead_id: leadIds[2], body: "Visited the school. HOD loved the past-paper walkthroughs; asked for a quote for 180 learners.", author_id: kagiso });
insert("lead_notes", { lead_id: leadIds[2], body: "Proposal sent: R54 000 per year including teacher dashboard access.", author_id: kagiso });
insert("lead_notes", { lead_id: leadIds[4], body: "Principal is keen but needs SGB approval at the next meeting.", author_id: kagiso });
insert("lead_notes", { lead_id: leadIds[8], body: "They chose a cheaper print-based programme this year. Try again in October.", author_id: sipho });

// ── Content ──
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
for (const [title, type, topic, stage, owner_id, due_date] of content) insert("content", { title, type, topic, stage, owner_id, due_date, published_at: stage === "published" ? `${due_date}T12:00:00.000Z` : null });

// ── Meetings with decisions and action items ──
const weekly = insert("meetings", {
  title: "Weekly team check-in", date: day(-3), attendees: "Sipho, Ayesha, Johan, Nomvula, Kagiso",
  notes: "Exam season is 6 weeks away. Learner sign-ups up 18% after the TikTok series. Two schools are waiting on proposals.",
  decisions: "Prioritise past-paper memos over new topics until exams\nKagiso to focus on proposals for Mamelodi and Rustenburg\nKeep marketing spend flat this month", created_by: sipho,
});
const board = insert("meetings", {
  title: "Monthly finance review", date: day(-10), attendees: "Sipho, Ayesha",
  notes: "Burn is coming down as school licences grow. Grant second tranche depends on the impact report.",
  decisions: "Submit impact report by month end\nNo new hires until two more schools sign", created_by: ayesha,
});
insert("meetings", { title: "Content planning: exam sprint", date: day(3), attendees: "Johan, Nomvula", notes: "", decisions: "", created_by: johan });

// ── Tasks ──
const tasks = [
  ["Send Mamelodi proposal follow-up", kagiso, day(2), "high", "todo", { lead_id: leadIds[2], meeting_id: weekly }],
  ["Prepare Rustenburg proposal", kagiso, day(1), "high", "doing", { lead_id: leadIds[9], meeting_id: weekly }],
  ["Record 2024 Paper 1 memo intro", nomvula, day(-1), "medium", "todo", { meeting_id: weekly }],
  ["Write grant impact report", ayesha, day(9), "high", "doing", { meeting_id: board }],
  ["Reconcile last month's bank statement", ayesha, day(-2), "medium", "todo", { recurrence: "monthly" }],
  ["Post weekly exam tips on social media", johan, day(1), "medium", "todo", { recurrence: "weekly" }],
  ["Review trig worksheet draft", johan, day(3), "medium", "todo", {}],
  ["Update pricing sheet for 2027", sipho, day(12), "low", "todo", {}],
  ["Call Tembisa High about SGB decision", kagiso, day(-1), "medium", "todo", { lead_id: leadIds[4] }],
  ["Order second microphone", johan, day(-6), "low", "done", {}],
  ["Publish functions walkthrough", nomvula, day(-12), "medium", "done", {}],
];
for (const [title, assignee_id, due_date, priority, status, extra] of tasks)
  insert("tasks", { title, assignee_id, due_date, priority, status, created_by: sipho, completed_at: status === "done" ? new Date().toISOString() : null, ...extra });

// ── Approvals ──
insert("approvals", { title: "Ring light and backdrop for recordings", details: "Our current lighting makes the board hard to read on phones.", amount: 3800, requested_by: nomvula });
insert("approvals", { title: "Travel to Polokwane for school visits", details: "Two-day trip to meet three schools in Limpopo.", amount: 5200, requested_by: kagiso });
insert("approvals", { title: "Canva Pro for the team", amount: 2400, status: "approved", requested_by: johan, decided_by: ayesha, decision_note: "Approved — annual plan please.", decided_at: new Date(Date.now() - 5 * 86400000).toISOString() });
insert("approvals", { title: "Billboard near Bree taxi rank", amount: 45000, status: "rejected", requested_by: kagiso, decided_by: sipho, decision_note: "Too expensive for now. Let's revisit after the grant's second tranche.", decided_at: new Date(Date.now() - 12 * 86400000).toISOString() });

// ── Documents ──
const doc = (title, folder, fileName, mime, body, uploaded_by, isPrivate = 0) => {
  const key = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}${path.extname(fileName)}`;
  writeFileSync(path.join(DATA_DIR, "uploads", key), body);
  insert("documents", { title, folder, file_name: fileName, mime_type: mime, size: Buffer.byteLength(body), storage_key: key, private: isPrivate, uploaded_by });
};
doc("Team handbook", "Policies", "team-handbook.txt", "text/plain", "Integral Academy team handbook\n\n1. We put learners first.\n2. Spending over R1 000 needs approval in the workspace.\n3. Meeting decisions and action items go in Meetings.\n", sipho);
doc("2027 school pricing", "Sales", "school-pricing-2027.csv", "text/csv", "Learners,Price per year (R)\nUp to 100,24000\n101-200,42000\n201+,54000\n", sipho);
doc("Grant agreement summary", "Finance", "grant-agreement-summary.txt", "text/plain", "Innovation grant: R300 000 in two tranches. Second tranche on approval of the impact report.\n", ayesha, 1);

const note = (user_id, message, link, read = false) => insert("notifications", { user_id, message, link, read_at: read ? new Date().toISOString() : null });
for (const manager of [sipho, ayesha, johan]) {
  note(manager, "Nomvula Khumalo asked for approval: “Ring light and backdrop for recordings” (R3 800)", "approvals");
  note(manager, "Kagiso Mokoena asked for approval: “Travel to Polokwane for school visits” (R5 200)", "approvals");
}
note(sipho, "Kagiso Mokoena added a note on Mamelodi Science Academy", `pipeline?lead=${leadIds[2]}`, true);
note(nomvula, "Sipho Dlamini assigned you “Record 2024 Paper 1 memo intro”", "tasks");
note(kagiso, "Sipho Dlamini assigned you “Send Mamelodi proposal follow-up”", "tasks");
note(kagiso, "Sipho Dlamini rejected your request “Billboard near Bree taxi rank”: “Too expensive for now.”", "approvals", true);
note(johan, "Ayesha Patel approved your request “Canva Pro for the team”", "approvals", true);

logActivity(sipho, "Sipho Dlamini set up the workspace");
logActivity(kagiso, "Kagiso Mokoena added a note on Mamelodi Science Academy");
logActivity(ayesha, "Ayesha Patel approved “Canva Pro for the team”", "manager");
logActivity(nomvula, "Nomvula Khumalo updated content “Financial maths in 15 minutes”");

console.log("Demo data added. Sign in with any of these (password: " + PASSWORD + "):");
for (const [name, email, role] of people) console.log(`  ${role.padEnd(8)} ${email}  (${name})`);
console.log("Before using it for real, delete the data folder and start fresh.");
