// Integral Workspace Lite — a small, self-hosted workspace for a startup team.
// One process, one SQLite file, no npm dependencies:  node server.js
import http from "node:http";
import os from "node:os";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, existsSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { DATA_DIR, all, db, get, getSetting, logActivity, run, setSetting } from "./db.js";
import { hashPassword, passwordProblem, verifyPassword } from "./passwords.js";
import "./public/metrics.js"; // shared calculations (also used by the online preview)

const M = globalThis.WSMetrics;

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const SECURE_COOKIE = process.env.COOKIE_SECURE === "true";
const SESSION_DAYS = 14;
const MAX_UPLOAD = 20 * 1024 * 1024;

// ─────────────────────────── Helpers ───────────────────────────
class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function send(res, status, body, headers = {}) {
  const data = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(data);
}
async function readBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "That's too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function readJson(req, limit) {
  const raw = await readBody(req, limit);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}
function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((c) => c.trim().split("="))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]),
  );
}

// ─────────────────────────── Sessions & roles ───────────────────────────
const ROLE_RANK = { member: 1, manager: 2, admin: 3 };
const atLeast = (user, role) => ROLE_RANK[user.role] >= ROLE_RANK[role];

/** "Chrome on Windows" from a browser's user-agent string, for the signed-in devices list. */
function deviceName(ua = "") {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "an unknown device";
  return `${browser} on ${os}`;
}
/** Signs someone in. "Keep me signed in" lasts 14 days; otherwise the cookie ends with the browser (at most 12 hours). */
function createSession(req, res, userId, keep = true) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + (keep ? SESSION_DAYS * 86400000 : 12 * 3600000));
  const now = new Date().toISOString();
  run("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, last_seen, device) VALUES (?, ?, ?, ?, ?, ?)", sha256(token), userId, expires.toISOString(), now, now, deviceName(String(req.headers["user-agent"] || "")));
  res.setHeader("Set-Cookie", `ws_session=${token}; Path=/; HttpOnly; SameSite=Lax${keep ? `; Expires=${expires.toUTCString()}` : ""}${SECURE_COOKIE ? "; Secure" : ""}`);
}
const sessionHash = (req) => sha256(parseCookies(req).ws_session || "");
function currentUser(req) {
  const token = parseCookies(req).ws_session;
  if (!token) return null;
  const row = get(
    `SELECT u.id, u.name, u.email, u.role, u.job_title, u.active, u.must_change_password, s.expires_at, s.last_seen FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    sha256(token),
  );
  if (!row || !row.active || new Date(row.expires_at) < new Date()) return null;
  if (!row.last_seen || Date.now() - new Date(row.last_seen).getTime() > 5 * 60000) run("UPDATE sessions SET last_seen = ? WHERE token_hash = ?", new Date().toISOString(), sha256(token));
  return { id: row.id, name: row.name, email: row.email, role: row.role, job_title: row.job_title, must_change_password: Boolean(row.must_change_password) };
}

const DUMMY_HASH = await hashPassword(randomBytes(12).toString("hex"));

// Sign-in throttle: 5 failures per email or 20 per IP in 15 minutes.
const failures = new Map();
function throttled(keys) {
  const now = Date.now();
  return keys.some((k) => (failures.get(k) || []).filter((t) => now - t < 15 * 60000).length >= (k.startsWith("ip:") ? 20 : 5));
}
function recordFailure(keys) {
  for (const k of keys) failures.set(k, [...(failures.get(k) || []).filter((t) => Date.now() - t < 15 * 60000), Date.now()]);
}

// ─────────────────────────── Validation ───────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
/** Cleans input against a field spec. Returns only known fields; throws 422 with per-field messages. */
function validate(spec, input, { partial = false } = {}) {
  const out = {};
  const errors = {};
  for (const [name, f] of Object.entries(spec)) {
    const present = Object.prototype.hasOwnProperty.call(input, name);
    if (!present) {
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
        if (!validDate(String(v))) errors[name] = "Enter a valid date.";
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
        if (!get("SELECT id FROM users WHERE id = ? AND active = 1", v)) errors[name] = "Choose an active team member.";
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

// ─────────────────────────── Resources (simple CRUD with permission rules) ───────────────────────────
const RESOURCES = {
  tasks: {
    label: (r) => `task “${r.title}”`,
    fields: {
      title: { type: "text", required: true, max: 200 },
      notes: { type: "text", max: 5000 },
      status: { type: "enum", values: ["todo", "doing", "done"] },
      priority: { type: "enum", values: ["low", "medium", "high"] },
      due_date: { type: "date" },
      assignee_id: { type: "user" },
      meeting_id: { type: "int" },
      lead_id: { type: "int" },
      recurrence: { type: "enum", values: ["none", "weekly", "monthly"] },
    },
    list: () => all("SELECT * FROM tasks ORDER BY CASE status WHEN 'done' THEN 1 ELSE 0 END, due_date IS NULL, due_date, id DESC"),
    beforeCreate: (data, user) => ({ ...data, created_by: user.id, assignee_id: data.assignee_id ?? user.id }),
    beforeUpdate: (data, row) => ("status" in data ? { ...data, completed_at: data.status === "done" ? row.completed_at || new Date().toISOString() : null } : data),
    afterCreate: (row, user) => notify(row.assignee_id, user, `${user.name} assigned you “${row.title}”`, `tasks?task=${row.id}`),
    afterUpdate: (row, before, user) => {
      if (row.assignee_id !== before.assignee_id) notify(row.assignee_id, user, `${user.name} assigned you “${row.title}”`, `tasks?task=${row.id}`);
      if (row.status === "done" && before.status !== "done" && row.recurrence !== "none") return { next_task_due: scheduleNext(row) };
      return null;
    },
    canEdit: (user, row) => atLeast(user, "manager") || row.created_by === user.id || row.assignee_id === user.id,
    canDelete: (user, row) => atLeast(user, "manager") || row.created_by === user.id,
  },
  leads: {
    label: (r) => `school ${r.school}`,
    fields: {
      school: { type: "text", required: true, max: 200 },
      contact_name: { type: "text", max: 120 },
      contact_email: { type: "email" },
      contact_phone: { type: "text", max: 40 },
      city: { type: "text", max: 80 },
      stage: { type: "enum", values: ["lead", "contacted", "meeting", "proposal", "won", "lost"] },
      value: { type: "money" },
      learners: { type: "int" },
      next_follow_up: { type: "date" },
      owner_id: { type: "user" },
    },
    list: () => all("SELECT * FROM leads ORDER BY school"),
    beforeCreate: (data, user) => ({ ...data, owner_id: data.owner_id ?? user.id, won_at: data.stage === "won" ? new Date().toISOString() : null }),
    beforeUpdate: (data, row) => ("stage" in data ? { ...data, won_at: data.stage === "won" ? row.won_at || new Date().toISOString() : null } : data),
    canEdit: () => true,
    canDelete: (user) => atLeast(user, "manager"),
  },
  content: {
    label: (r) => `content “${r.title}”`,
    fields: {
      title: { type: "text", required: true, max: 200 },
      type: { type: "enum", values: ["video", "lesson", "worksheet", "quiz", "past_paper"] },
      topic: { type: "text", max: 120 },
      stage: { type: "enum", values: ["idea", "recording", "editing", "review", "published"] },
      owner_id: { type: "user" },
      due_date: { type: "date" },
    },
    list: () => all("SELECT * FROM content ORDER BY due_date IS NULL, due_date, id DESC"),
    beforeCreate: (data, user) => {
      if (data.stage === "published" && !atLeast(user, "manager")) throw new HttpError(403, "Only a manager can mark content as published.");
      return { ...data, owner_id: data.owner_id ?? user.id, published_at: data.stage === "published" ? new Date().toISOString() : null };
    },
    // Only managers publish: members can move their work up to Review.
    beforeUpdate: (data, row, user) => {
      if (data.stage === "published" && !atLeast(user, "manager")) throw new HttpError(403, "Only a manager can mark content as published.");
      return "stage" in data ? { ...data, published_at: data.stage === "published" ? row.published_at || new Date().toISOString() : null } : data;
    },
    afterUpdate: (row, before, user) => {
      if (row.stage === "review" && before.stage !== "review") notify(managerIds(), user, `${user.name} moved “${row.title}” to review`, `content?item=${row.id}`);
      return null;
    },
    canEdit: () => true,
    canDelete: (user) => atLeast(user, "manager"),
  },
  transactions: {
    label: (r) => `${r.kind} of R${Number(r.amount).toLocaleString("en-ZA")} (${r.description})`,
    fields: {
      kind: { type: "enum", values: ["income", "expense"], required: true },
      date: { type: "date", required: true },
      amount: { type: "money", required: true, positive: true },
      category: { type: "text", required: true, max: 60 },
      description: { type: "text", required: true, max: 200 },
      counterparty: { type: "text", max: 120 },
    },
    audience: "manager",
    canRead: (user) => atLeast(user, "manager"),
    list: () => all("SELECT * FROM transactions ORDER BY date DESC, id DESC"),
    beforeCreate: (data, user) => ({ ...data, created_by: user.id }),
    canCreate: (user) => atLeast(user, "manager"),
    canEdit: (user) => atLeast(user, "manager"),
    canDelete: (user) => atLeast(user, "manager"),
  },
  meetings: {
    label: (r) => `meeting “${r.title}”`,
    fields: {
      title: { type: "text", required: true, max: 200 },
      date: { type: "date", required: true },
      attendees: { type: "text", max: 500 },
      notes: { type: "text", max: 20000 },
      decisions: { type: "text", max: 5000 },
    },
    list: () => all("SELECT * FROM meetings ORDER BY date DESC, id DESC"),
    beforeCreate: (data, user) => ({ ...data, created_by: user.id }),
    canEdit: () => true,
    canDelete: (user, row) => atLeast(user, "manager") || row.created_by === user.id,
  },
  approvals: {
    label: (r) => `approval request “${r.title}”`,
    audience: "manager",
    fields: {
      title: { type: "text", required: true, max: 200 },
      details: { type: "text", max: 5000 },
      amount: { type: "money" },
    },
    // Managers see everything; members see their own requests.
    list: (user) =>
      atLeast(user, "manager")
        ? all("SELECT * FROM approvals ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, id DESC")
        : all("SELECT * FROM approvals WHERE requested_by = ? ORDER BY id DESC", user.id),
    beforeCreate: (data, user) => ({ ...data, requested_by: user.id }),
    afterCreate: (row, user) => notify(managerIds(), user, `${user.name} asked for approval: “${row.title}”${row.amount !== null ? ` (R${Number(row.amount).toLocaleString("en-ZA")})` : ""}`, "approvals"),
    canEdit: (user, row) => row.requested_by === user.id && row.status === "pending",
    canDelete: (user, row) => (row.requested_by === user.id && row.status === "pending") || atLeast(user, "admin"),
  },
  contracts: {
    label: (r) => `the contract with ${(get("SELECT school FROM leads WHERE id = ?", r.lead_id) || {}).school || "a school"}`,
    fields: CONTRACT_FIELDS(),
    list: () => contractRows(),
    beforeCreate: (data, user) => {
      checkContract(data);
      return { ...data, created_by: user.id };
    },
    afterCreate: (row) => {
      // A school with a contract is a customer: mark it won if it isn't already.
      run("UPDATE leads SET stage = 'won', won_at = COALESCE(won_at, ?) WHERE id = ? AND stage <> 'won'", new Date().toISOString(), row.lead_id);
    },
    beforeUpdate: (data, row) => {
      checkContract({ ...row, ...data });
      return "end_date" in data && data.end_date !== row.end_date ? { ...data, reminded_60: 0, reminded_30: 0 } : data;
    },
    canCreate: (user) => atLeast(user, "manager"),
    canEdit: (user) => atLeast(user, "manager"),
    canDelete: (user) => atLeast(user, "manager"),
  },
  invoices: {
    label: (r) => `invoice ${r.number}`,
    audience: "manager",
    fields: {
      lead_id: { type: "int", required: true },
      contract_id: { type: "int" },
      description: { type: "text", required: true, max: 300 },
      amount: { type: "money", required: true, positive: true },
      issue_date: { type: "date", required: true },
      due_date: { type: "date", required: true },
      notes: { type: "text", max: 2000 },
    },
    canRead: (user) => atLeast(user, "manager"),
    list: () => invoiceRows(),
    beforeCreate: (data, user) => {
      checkInvoice(data);
      return { ...data, number: M.nextInvoiceNumber(all("SELECT number FROM invoices")), status: "draft", created_by: user.id };
    },
    beforeUpdate: (data, row) => {
      checkInvoice({ ...row, ...data });
      return data;
    },
    canCreate: (user) => atLeast(user, "manager"),
    canEdit: (user, row) => atLeast(user, "manager") && ["draft", "sent"].includes(row.status),
    canDelete: (user, row) => atLeast(user, "manager") && row.status === "draft",
  },
  goals: {
    label: (r) => `goal “${r.title}”`,
    fields: {
      title: { type: "text", required: true, max: 200 },
      metric: { type: "enum", values: Object.keys(M.GOAL_METRICS) },
      target: { type: "money", required: true, positive: true },
      baseline: { type: "money" },
      unit: { type: "text", max: 40 },
      start_date: { type: "date", required: true },
      due_date: { type: "date", required: true },
      owner_id: { type: "user" },
      notes: { type: "text", max: 2000 },
      archived: { type: "bool" },
    },
    list: (user) => goalRows(user),
    beforeCreate: (data, user) => {
      checkGoalDates(data);
      return { ...data, baseline: data.baseline ?? 0, owner_id: data.owner_id ?? user.id, created_by: user.id };
    },
    beforeUpdate: (data, row) => {
      checkGoalDates({ ...row, ...data });
      return data;
    },
    canCreate: (user) => atLeast(user, "manager"),
    canEdit: (user) => atLeast(user, "manager"),
    canDelete: (user) => atLeast(user, "manager"),
  },
};

function invoiceRows() {
  const today = localToday();
  return all("SELECT i.*, l.school, l.contact_name, l.contact_email, l.city FROM invoices i LEFT JOIN leads l ON l.id = i.lead_id ORDER BY i.issue_date DESC, i.id DESC").map((i) => ({ ...i, state: M.invoiceState(i, today) }));
}
function checkInvoice(i) {
  if (!get("SELECT id FROM leads WHERE id = ?", i.lead_id)) throw new HttpError(422, "Choose a school.", { lead_id: "Choose a school." });
  if (i.due_date < i.issue_date) throw new HttpError(422, "The due date can't be before the invoice date.", { due_date: "Must be on or after the invoice date." });
}
function CONTRACT_FIELDS() {
  return {
    lead_id: { type: "int", required: true },
    start_date: { type: "date", required: true },
    end_date: { type: "date", required: true },
    annual_value: { type: "money", required: true },
    learners: { type: "int" },
    notes: { type: "text", max: 2000 },
  };
}
function checkContract(c) {
  if (!get("SELECT id FROM leads WHERE id = ?", c.lead_id)) throw new HttpError(422, "Choose a school.", { lead_id: "Choose a school." });
  if (c.end_date <= c.start_date) throw new HttpError(422, "The end date must be after the start date.", { end_date: "Must be after the start date." });
}
function checkGoalDates(g) {
  if (g.due_date <= g.start_date) throw new HttpError(422, "The deadline must be after the start date.", { due_date: "Must be after the start date." });
}

function insert(table, data) {
  const keys = Object.keys(data);
  const info = run(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`, ...keys.map((k) => data[k]));
  return get(`SELECT * FROM ${table} WHERE id = ?`, Number(info.lastInsertRowid));
}
function update(table, id, data) {
  const keys = Object.keys(data);
  if (keys.length) run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, ...keys.map((k) => data[k]), id);
  return get(`SELECT * FROM ${table} WHERE id = ?`, id);
}

// ─────────────────────────── Notifications ───────────────────────────
const managerIds = () => all("SELECT id FROM users WHERE active = 1 AND role IN ('manager', 'admin')").map((r) => r.id);
/** Tells people about something that involves them (never the person who did it). */
function notify(userIds, actor, message, link) {
  for (const id of new Set([].concat(userIds))) {
    if (!id || id === actor.id || !get("SELECT id FROM users WHERE id = ? AND active = 1", id)) continue;
    run("INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)", id, message, link ?? null);
  }
}

// ─────────────────────────── Goals, contracts and the data the shared calculations need ───────────────────────────
function loadData() {
  return {
    transactions: all("SELECT kind, date, amount, category FROM transactions"),
    leads: all("SELECT id, school, stage, value, learners, won_at, created_at, owner_id FROM leads"),
    contracts: all("SELECT * FROM contracts"),
    content: all("SELECT owner_id, published_at FROM content"),
    tasks: all("SELECT assignee_id, status, due_date, completed_at FROM tasks"),
    meetings: all("SELECT date FROM meetings"),
    users: all("SELECT id, name, job_title, role, active FROM users"),
    leadNotes: all("SELECT author_id, created_at FROM lead_notes"),
    budgets: all("SELECT category, monthly_amount FROM budgets"),
    openingBalance: Number(getSetting("opening_balance", "0")),
  };
}
function contractRows() {
  const today = localToday();
  return all("SELECT c.*, l.school, l.city, l.owner_id FROM contracts c JOIN leads l ON l.id = c.lead_id ORDER BY c.end_date").map((c) => ({ ...c, state: M.contractState(c, today), days_left: M.daysBetween(today, c.end_date) }));
}
/** Goals with live progress. Money goals (income) are for managers only. */
function goalRows(user, data = loadData()) {
  const today = localToday();
  return all("SELECT * FROM goals ORDER BY archived, due_date")
    .filter((g) => atLeast(user, "manager") || !M.GOAL_METRICS[g.metric]?.finance)
    .map((g) => ({ ...g, progress: M.goalProgress(g, data, today) }));
}
const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
/** Reminds the school's owner and managers 60 and 30 days before a contract ends, and adds a renewal task. */
function checkRenewals() {
  const today = localToday();
  const system = { id: 0 };
  for (const inv of all("SELECT i.*, l.school FROM invoices i LEFT JOIN leads l ON l.id = i.lead_id WHERE i.status = 'sent' AND i.due_date < ? AND i.overdue_notified = 0", today)) {
    notify(managerIds(), system, `Invoice ${inv.number}${inv.school ? ` to ${inv.school}` : ""} is overdue (R${Number(inv.amount).toLocaleString("en-ZA")}, due ${shortDate(inv.due_date)}).`, `finance?tab=invoices&invoice=${inv.id}`);
    run("UPDATE invoices SET overdue_notified = 1 WHERE id = ?", inv.id);
  }
  for (const c of all("SELECT c.*, l.school, l.owner_id FROM contracts c JOIN leads l ON l.id = c.lead_id WHERE c.status = 'active'")) {
    const days = M.daysBetween(today, c.end_date);
    if (days < 0 || days > 60) continue;
    const people = [c.owner_id, ...managerIds()];
    const link = `contracts?contract=${c.id}`;
    if (!c.reminded_60) {
      notify(people, system, `${c.school}'s contract ends on ${shortDate(c.end_date)}. Time to talk about renewing.`, link);
      const due = M.addDays(c.end_date, -30) > today ? M.addDays(c.end_date, -30) : today;
      insert("tasks", { title: `Renew ${c.school} (contract ends ${shortDate(c.end_date)})`, priority: "high", due_date: due, assignee_id: c.owner_id, lead_id: c.lead_id });
      run("UPDATE contracts SET reminded_60 = 1, reminded_30 = ? WHERE id = ?", days <= 30 ? 1 : 0, c.id);
    } else if (days <= 30 && !c.reminded_30) {
      notify(people, system, `${c.school}'s contract ends in ${days} day${days === 1 ? "" : "s"} and hasn't been renewed yet.`, link);
      run("UPDATE contracts SET reminded_30 = 1 WHERE id = ?", c.id);
    }
  }
}

// ─────────────────────────── Repeating tasks ───────────────────────────
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function advance(dateStr, recurrence) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (recurrence === "weekly") d.setDate(d.getDate() + 7);
  else {
    const dayOfMonth = d.getDate();
    d.setMonth(d.getMonth() + 1);
    if (d.getDate() !== dayOfMonth) d.setDate(0); // 31 Jan → 28/29 Feb
  }
  return isoLocal(d);
}
/** When a repeating task is done, adds the next one (once) and returns its due date. */
function scheduleNext(task) {
  let due = advance(task.due_date || localToday(), task.recurrence);
  while (due < localToday()) due = advance(due, task.recurrence);
  const exists = get("SELECT id FROM tasks WHERE title = ? AND recurrence = ? AND status <> 'done' AND due_date = ? AND assignee_id IS ?", task.title, task.recurrence, due, task.assignee_id);
  if (!exists) insert("tasks", { title: task.title, notes: task.notes, priority: task.priority, assignee_id: task.assignee_id, created_by: task.created_by, recurrence: task.recurrence, due_date: due });
  return due;
}

// ─────────────────────────── Finance & dashboard ───────────────────────────
const monthKey = (d) => d.toISOString().slice(0, 7);
function lastMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) out.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  return out;
}
function financeSummary(months = 12) {
  const keys = lastMonths(months);
  const rows = all("SELECT substr(date, 1, 7) AS m, kind, SUM(amount) AS total FROM transactions WHERE date >= ? GROUP BY m, kind", `${keys[0]}-01`);
  const series = keys.map((m) => {
    const income = rows.find((r) => r.m === m && r.kind === "income")?.total || 0;
    const expense = rows.find((r) => r.m === m && r.kind === "expense")?.total || 0;
    return { month: m, income, expense, net: income - expense };
  });
  const opening = Number(getSetting("opening_balance", "0"));
  const totals = get("SELECT COALESCE(SUM(CASE kind WHEN 'income' THEN amount ELSE 0 END),0) AS income, COALESCE(SUM(CASE kind WHEN 'expense' THEN amount ELSE 0 END),0) AS expense FROM transactions");
  const cash = opening + totals.income - totals.expense;
  const recent = series.slice(-4, -1); // last three complete months
  const avgBurn = recent.length ? recent.reduce((s, m) => s + (m.expense - m.income), 0) / recent.length : 0;
  const thisMonth = series.at(-1), lastMonth = series.at(-2);
  const categories = all(
    "SELECT category, SUM(amount) AS total FROM transactions WHERE kind = 'expense' AND date >= ? GROUP BY category ORDER BY total DESC",
    `${keys.at(-3)}-01`,
  );
  return {
    series,
    cash,
    openingBalance: opening,
    avgMonthlyBurn: avgBurn,
    runwayMonths: avgBurn > 0 ? Math.max(0, cash) / avgBurn : null,
    thisMonth,
    lastMonth,
    expenseCategories: categories,
  };
}
/** Today's date on this computer's clock (the office's time zone), as YYYY-MM-DD. */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dashboard(user) {
  const today = localToday();
  const manager = atLeast(user, "manager");
  return {
    company: getSetting("company_name", "Integral Academy"),
    backup: atLeast(user, "admin") ? { due: backupDue(), last: getSetting("last_backup_at") } : null,
    finance: manager ? financeSummary(12) : null,
    myTasks: all("SELECT * FROM tasks WHERE assignee_id = ? AND status <> 'done' ORDER BY due_date IS NULL, due_date LIMIT 8", user.id),
    overdueTasks: all("SELECT * FROM tasks WHERE status <> 'done' AND due_date < ? ORDER BY due_date LIMIT 8", today),
    openTasks: get("SELECT COUNT(*) AS n FROM tasks WHERE status <> 'done'").n,
    pendingApprovals: manager ? all("SELECT * FROM approvals WHERE status = 'pending' ORDER BY id DESC LIMIT 6") : all("SELECT * FROM approvals WHERE status = 'pending' AND requested_by = ? ORDER BY id DESC", user.id),
    pipeline: all("SELECT stage, COUNT(*) AS n, COALESCE(SUM(value),0) AS value FROM leads GROUP BY stage"),
    followUps: all("SELECT * FROM leads WHERE next_follow_up IS NOT NULL AND next_follow_up <= date(?, '+7 days') AND stage NOT IN ('won','lost') ORDER BY next_follow_up LIMIT 8", today),
    content: all("SELECT stage, COUNT(*) AS n FROM content GROUP BY stage"),
    learnersSigned: get("SELECT COALESCE(SUM(learners),0) AS n FROM leads WHERE stage = 'won'").n,
    upcomingMeetings: all("SELECT * FROM meetings WHERE date >= ? ORDER BY date LIMIT 5", today),
    goals: goalRows(user).filter((g) => !g.archived && !["missed"].includes(g.progress.status)).slice(0, 4),
    renewals: { summary: M.renewalSummary(all("SELECT * FROM contracts"), today), due: contractRows().filter((c) => ["due", "lapsed"].includes(c.state)).slice(0, 5) },
    invoices: manager ? { summary: M.invoiceSummary(all("SELECT * FROM invoices"), today), open: invoiceRows().filter((i) => i.status === "sent").sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5) } : null,
    activity: all(`SELECT a.summary, a.created_at, u.name AS user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id ${manager ? "" : "WHERE a.audience = 'all'"} ORDER BY a.id DESC LIMIT 12`),
  };
}

// ─────────────────────────── Monthly report ───────────────────────────
function monthlyReport(month) {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next = isoLocal(new Date(y, m, 1));
  const prevStart = isoLocal(new Date(y, m - 2, 1));
  const total = (kind, from, to) => get("SELECT COALESCE(SUM(amount), 0) AS t FROM transactions WHERE kind = ? AND date >= ? AND date < ?", kind, from, to).t;
  const income = total("income", start, next);
  const expense = total("expense", start, next);
  const prevIncome = total("income", prevStart, start);
  const prevExpense = total("expense", prevStart, start);
  const opening = Number(getSetting("opening_balance", "0"));
  const cashEnd = opening + total("income", "0000-01-01", next) - total("expense", "0000-01-01", next);
  const burnStart = isoLocal(new Date(y, m - 3, 1));
  const burn = (total("expense", burnStart, next) - total("income", burnStart, next)) / 3;
  const meetings = all("SELECT title, date, decisions FROM meetings WHERE date >= ? AND date < ? ORDER BY date", start, next);
  const approved = get("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS t FROM approvals WHERE status = 'approved' AND decided_at >= ? AND decided_at < ?", start, next);
  return {
    month,
    company: getSetting("company_name", "Integral Academy"),
    money: {
      income, expense, net: income - expense, prevIncome, prevExpense, cashEnd,
      avgBurn: burn, runwayMonths: burn > 0 ? Math.max(0, cashEnd) / burn : null,
      topSpending: all("SELECT category, SUM(amount) AS total FROM transactions WHERE kind = 'expense' AND date >= ? AND date < ? GROUP BY category ORDER BY total DESC LIMIT 5", start, next),
      incomeBySource: all("SELECT category, SUM(amount) AS total FROM transactions WHERE kind = 'income' AND date >= ? AND date < ? GROUP BY category ORDER BY total DESC", start, next),
    },
    schools: {
      won: all("SELECT school, value, learners FROM leads WHERE won_at >= ? AND won_at < ? ORDER BY won_at", start, next),
      newLeads: get("SELECT COUNT(*) AS n FROM leads WHERE created_at >= ? AND created_at < ?", start, next).n,
      openPipeline: get("SELECT COUNT(*) AS n, COALESCE(SUM(value), 0) AS value FROM leads WHERE stage NOT IN ('won', 'lost')"),
      learnersSigned: get("SELECT COALESCE(SUM(learners), 0) AS n FROM leads WHERE stage = 'won'").n,
    },
    content: all("SELECT title, type FROM content WHERE published_at >= ? AND published_at < ? ORDER BY published_at", start, next),
    tasksDone: get("SELECT COUNT(*) AS n FROM tasks WHERE completed_at >= ? AND completed_at < ?", start, next).n,
    decisions: meetings.map((mt) => ({ meeting: mt.title, date: mt.date, items: (mt.decisions || "").split("\n").map((d) => d.trim()).filter(Boolean) })).filter((mt) => mt.items.length),
    approvals: { approved: approved.n, approvedAmount: approved.t, rejected: get("SELECT COUNT(*) AS n FROM approvals WHERE status = 'rejected' AND decided_at >= ? AND decided_at < ?", start, next).n },
    contracts: (() => {
      const contracts = all("SELECT * FROM contracts");
      const end = next > localToday() ? localToday() : M.addDays(next, -1);
      return {
        arr: M.arrOn(contracts, end), arrStart: M.arrOn(contracts, M.addDays(start, -1)), schools: M.schoolsOn(contracts, end),
        renewed: contracts.filter((c) => c.status === "renewed" && c.end_date >= start && c.end_date < next).length,
        notRenewed: contracts.filter((c) => c.status === "ended" && c.end_date >= start && c.end_date < next).length,
      };
    })(),
  };
}

// ─────────────────────────── Bank statement import ───────────────────────────
const IMPORT_ROW = {
  kind: { type: "enum", values: ["income", "expense"], required: true },
  date: { type: "date", required: true },
  amount: { type: "money", required: true, positive: true },
  description: { type: "text", required: true, max: 200 },
  category: { type: "text", max: 60 },
};
/**
 * Adds statement rows as transactions. A row already recorded (same date, type, amount and description) is skipped,
 * counting repeats so two identical purchases on one day both import once and never twice.
 */
function importTransactions(rows, user) {
  const alreadyThere = new Map();
  const key = (r) => `${r.date}|${r.kind}|${r.amount}|${r.description.toLowerCase()}`;
  const invalid = [];
  const ready = [];
  rows.forEach((raw, i) => {
    try {
      ready.push(validate(IMPORT_ROW, raw && typeof raw === "object" ? raw : {}));
    } catch (error) {
      invalid.push({ row: i + 1, error: error.fields ? Object.entries(error.fields).map(([f, msg]) => `${f}: ${msg}`).join(" ") : error.message });
    }
  });
  let imported = 0;
  let duplicates = 0;
  db.exec("BEGIN");
  try {
    for (const r of ready) {
      const k = key(r);
      if (!alreadyThere.has(k)) alreadyThere.set(k, get("SELECT COUNT(*) AS n FROM transactions WHERE date = ? AND kind = ? AND amount = ? AND lower(description) = ?", r.date, r.kind, r.amount, r.description.toLowerCase()).n);
      if (alreadyThere.get(k) > 0) {
        alreadyThere.set(k, alreadyThere.get(k) - 1);
        duplicates++;
        continue;
      }
      // Reuse the category last used for the same description, so regular payments sort themselves.
      const category = r.category || get("SELECT category FROM transactions WHERE lower(description) = ? AND kind = ? ORDER BY date DESC LIMIT 1", r.description.toLowerCase(), r.kind)?.category || "Uncategorised";
      insert("transactions", { kind: r.kind, date: r.date, amount: r.amount, description: r.description, category, created_by: user.id });
      imported++;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  if (imported) logActivity(user.id, `${user.name} imported ${imported} transactions from a bank statement`, "manager");
  return { imported, duplicates, invalid };
}

// ─────────────────────────── Documents ───────────────────────────
const DOC_TYPES = {
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".txt": "text/plain", ".csv": "text/csv",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const canSeeDoc = (user, d) => !d.private || d.uploaded_by === user.id || atLeast(user, "manager");

// ─────────────────────────── Backups ───────────────────────────
/** Builds a .zip in memory (deflate, no zip64, so under 4 GB). files: [{ name, data: Buffer }]. */
function zipFiles(files) {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const deflated = deflateRawSync(file.data);
    const stored = deflated.length >= file.data.length;
    const body = stored ? file.data : deflated;
    const crc = crc32(file.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(stored ? 0 : 8, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(file.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    parts.push(header, name, body);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(stored ? 0 : 8, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(file.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + body.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}
const MAX_BACKUP = 1024 * 1024 * 1024;
/** A consistent copy of the database plus every uploaded file, laid out like the data folder. */
function buildBackup() {
  const snapshot = path.join(os.tmpdir(), `workspace-backup-${randomBytes(6).toString("hex")}.db`);
  try {
    db.prepare("VACUUM INTO ?").run(snapshot);
    const files = [{ name: "data/workspace.db", data: readFileSync(snapshot) }];
    let total = files[0].data.length;
    const uploads = path.join(DATA_DIR, "uploads");
    for (const name of readdirSync(uploads)) {
      const file = path.join(uploads, name);
      if (!statSync(file).isFile()) continue;
      total += statSync(file).size;
      if (total > MAX_BACKUP) throw new HttpError(413, "The workspace is too big to download as one file. Copy the data folder instead (see the README).");
      files.push({ name: `data/uploads/${name}`, data: readFileSync(file) });
    }
    return zipFiles(files);
  } finally {
    rmSync(snapshot, { force: true });
  }
}
const backupDue = () => {
  const last = getSetting("last_backup_at");
  return !last || Date.now() - new Date(last).getTime() > 7 * 86400000;
};

// ─────────────────────────── API router ───────────────────────────
async function api(req, res, url) {
  const method = req.method;
  const parts = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
  // Mutations must come from our own page: a custom header can't be sent cross-site without CORS.
  if (method !== "GET" && req.headers["x-requested-with"] !== "workspace") throw new HttpError(403, "Request blocked.");

  // ── Auth ──
  if (parts[0] === "auth") {
    const userCount = get("SELECT COUNT(*) AS n FROM users").n;
    if (parts[1] === "status" && method === "GET") {
      return send(res, 200, { setupRequired: userCount === 0, user: currentUser(req), company: getSetting("company_name", "Integral Academy") });
    }
    if (parts[1] === "setup" && method === "POST") {
      if (userCount > 0) throw new HttpError(409, "The workspace is already set up.");
      const body = await readJson(req);
      const data = validate({ name: { type: "text", required: true, max: 120 }, email: { type: "email", required: true }, company: { type: "text", max: 120 } }, body);
      const problem = passwordProblem(body.password);
      if (problem) throw new HttpError(422, problem, { password: problem });
      const info = run("INSERT INTO users (name, email, password_hash, role, job_title) VALUES (?, ?, ?, 'admin', 'Founder')", data.name, data.email, await hashPassword(body.password));
      if (data.company) setSetting("company_name", data.company);
      logActivity(Number(info.lastInsertRowid), `${data.name} set up the workspace`);
      createSession(req, res, Number(info.lastInsertRowid));
      return send(res, 201, { ok: true });
    }
    if (parts[1] === "login" && method === "POST") {
      const body = await readJson(req);
      const email = String(body.email || "").trim().toLowerCase();
      const keys = [`ip:${req.socket.remoteAddress}`, `email:${email}`];
      if (throttled(keys)) throw new HttpError(429, "Too many sign-in attempts. Wait 15 minutes and try again.");
      const user = get("SELECT * FROM users WHERE email = ?", email);
      // Always run one hash so a wrong email takes as long as a wrong password.
      const passwordOk = await verifyPassword(String(body.password || ""), user ? user.password_hash : DUMMY_HASH);
      const ok = user && user.active && passwordOk;
      if (!ok) {
        recordFailure(keys);
        throw new HttpError(401, "Invalid email or password.");
      }
      createSession(req, res, user.id, body.keep !== false);
      return send(res, 200, { ok: true });
    }
    if (parts[1] === "logout" && method === "POST") {
      const token = parseCookies(req).ws_session;
      if (token) run("DELETE FROM sessions WHERE token_hash = ?", sha256(token));
      res.setHeader("Set-Cookie", "ws_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
      return send(res, 200, { ok: true });
    }
  }

  const user = currentUser(req);
  if (!user) throw new HttpError(401, "Please sign in.");

  if (parts[0] === "auth" && parts[1] === "password" && method === "POST") {
    const body = await readJson(req);
    const row = get("SELECT password_hash FROM users WHERE id = ?", user.id);
    if (!(await verifyPassword(String(body.current || ""), row.password_hash))) throw new HttpError(422, "Your current password is incorrect.", { current: "Incorrect password." });
    const problem = passwordProblem(body.next);
    if (problem) throw new HttpError(422, problem, { next: problem });
    if (body.next === body.current) throw new HttpError(422, "Choose a password different from the current one.", { next: "Must be different from the current password." });
    run("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?", await hashPassword(body.next), user.id);
    const token = sha256(parseCookies(req).ws_session || "");
    run("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", user.id, token);
    return send(res, 200, { ok: true });
  }
  // ── Where you're signed in ──
  if (parts[0] === "auth" && parts[1] === "sessions") {
    const mine = sessionHash(req);
    if (method === "GET" && !parts[2])
      return send(res, 200, all("SELECT token_hash, device, created_at, last_seen, expires_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen DESC", user.id, new Date().toISOString())
        .map((s) => ({ id: s.token_hash.slice(0, 16), current: s.token_hash === mine, device: s.device || "A browser", created_at: s.created_at, last_seen: s.last_seen, expires_at: s.expires_at }))
        .sort((a, b) => b.current - a.current));
    if (method === "POST" && parts[2] === "others") {
      const n = run("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", user.id, mine).changes;
      return send(res, 200, { signedOut: n });
    }
    if (method === "DELETE" && /^[0-9a-f]{16}$/.test(parts[2] || "")) {
      run("DELETE FROM sessions WHERE user_id = ? AND substr(token_hash, 1, 16) = ?", user.id, parts[2]);
      return send(res, 200, { ok: true, current: mine.startsWith(parts[2]) });
    }
  }
  // Someone signed in with a temporary password must choose their own before doing anything else.
  if (user.must_change_password) throw new HttpError(403, "Please choose a new password first.");

  if (parts[0] === "dashboard" && method === "GET") return send(res, 200, dashboard(user));
  if (parts[0] === "finance" && parts[1] === "summary" && method === "GET") {
    if (!atLeast(user, "manager")) throw new HttpError(403, "Finance is for managers.");
    return send(res, 200, financeSummary(Math.min(24, Math.max(3, Number(url.searchParams.get("months")) || 12))));
  }

  // ── Badge counts for the navigation ──
  if (parts[0] === "counts" && method === "GET") {
    return send(res, 200, {
      myOpenTasks: get("SELECT COUNT(*) AS n FROM tasks WHERE assignee_id = ? AND status <> 'done'", user.id).n,
      myOverdueTasks: get("SELECT COUNT(*) AS n FROM tasks WHERE assignee_id = ? AND status <> 'done' AND due_date < ?", user.id, localToday()).n,
      approvalsToDecide: atLeast(user, "manager") ? get("SELECT COUNT(*) AS n FROM approvals WHERE status = 'pending' AND (requested_by IS NULL OR requested_by <> ?)", user.id).n : 0,
      unreadNotifications: get("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", user.id).n,
    });
  }

  // ── Notifications ──
  if (parts[0] === "notifications") {
    if (method === "GET" && !parts[1]) {
      return send(res, 200, {
        unread: get("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", user.id).n,
        items: all("SELECT id, message, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30", user.id),
      });
    }
    if (method === "POST" && parts[1] === "read") {
      const body = await readJson(req);
      const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger).slice(0, 100) : null;
      const at = new Date().toISOString();
      if (ids) for (const id of ids) run("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL", at, id, user.id);
      else run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", at, user.id);
      return send(res, 200, { ok: true });
    }
  }

  // ── Calendar: everything with a date in a range (at most ~2 months) ──
  if (parts[0] === "calendar" && method === "GET") {
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    if (!validDate(from) || !validDate(to) || to < from) throw new HttpError(400, "Choose a valid date range.");
    if ((new Date(to) - new Date(from)) / 86400000 > 70) throw new HttpError(400, "Choose a range of two months or less.");
    return send(res, 200, [
      ...all("SELECT id, title, due_date AS date, status, assignee_id FROM tasks WHERE due_date BETWEEN ? AND ?", from, to).map((r) => ({ type: "task", id: r.id, title: r.title, date: r.date, done: r.status === "done", person_id: r.assignee_id })),
      ...all("SELECT id, school AS title, next_follow_up AS date, owner_id FROM leads WHERE next_follow_up BETWEEN ? AND ? AND stage NOT IN ('won','lost')", from, to).map((r) => ({ type: "followup", id: r.id, title: r.title, date: r.date, done: false, person_id: r.owner_id })),
      ...all("SELECT id, title, due_date AS date, stage, owner_id FROM content WHERE due_date BETWEEN ? AND ?", from, to).map((r) => ({ type: "content", id: r.id, title: r.title, date: r.date, done: r.stage === "published", person_id: r.owner_id })),
      ...all("SELECT id, title, date FROM meetings WHERE date BETWEEN ? AND ?", from, to).map((r) => ({ type: "meeting", id: r.id, title: r.title, date: r.date, done: false, person_id: null })),
      ...all("SELECT c.id, c.end_date, c.status, l.school, l.owner_id FROM contracts c JOIN leads l ON l.id = c.lead_id WHERE c.end_date BETWEEN ? AND ?", from, to).map((r) => ({ type: "renewal", id: r.id, title: `${r.school} contract ends`, date: r.end_date, done: r.status !== "active", person_id: r.owner_id })),
    ]);
  }

  // ── Search across the workspace (only what this person may see) ──
  if (parts[0] === "search" && method === "GET") {
    const q = String(url.searchParams.get("q") || "").trim().slice(0, 100);
    if (q.length < 2) return send(res, 200, []);
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const find = (sql, cols, ...extra) => all(sql.replace("$MATCH", `(${cols.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(" OR ")})`), ...cols.map(() => like), ...extra);
    const manager = atLeast(user, "manager");
    const results = [
      ...find("SELECT id, title, status, due_date FROM tasks WHERE $MATCH ORDER BY status = 'done', id DESC LIMIT 6", ["title", "notes"]).map((r) => ({ type: "task", id: r.id, title: r.title, status: r.status, date: r.due_date })),
      ...find("SELECT id, school, city, stage FROM leads WHERE $MATCH ORDER BY school LIMIT 6", ["school", "contact_name", "contact_email", "city"]).map((r) => ({ type: "lead", id: r.id, title: r.school, sub: r.city, status: r.stage })),
      ...find("SELECT id, title, type, stage FROM content WHERE $MATCH ORDER BY id DESC LIMIT 6", ["title", "topic"]).map((r) => ({ type: "content", id: r.id, title: r.title, sub: r.type, status: r.stage })),
      ...find("SELECT id, title, date FROM meetings WHERE $MATCH ORDER BY date DESC LIMIT 6", ["title", "attendees", "notes", "decisions"]).map((r) => ({ type: "meeting", id: r.id, title: r.title, date: r.date })),
      ...find("SELECT * FROM documents WHERE $MATCH ORDER BY id DESC LIMIT 20", ["title", "file_name", "folder"]).filter((d) => canSeeDoc(user, d)).slice(0, 6).map((r) => ({ type: "document", id: r.id, title: r.title, sub: `${r.folder} · ${r.file_name}` })),
      ...(manager
        ? find("SELECT id, title, status, amount FROM approvals WHERE $MATCH ORDER BY id DESC LIMIT 6", ["title", "details"])
        : find("SELECT id, title, status, amount FROM approvals WHERE $MATCH AND requested_by = ? ORDER BY id DESC LIMIT 6", ["title", "details"], user.id)
      ).map((r) => ({ type: "approval", id: r.id, title: r.title, status: r.status, amount: r.amount })),
      ...(manager ? find("SELECT id, description, date, amount, kind FROM transactions WHERE $MATCH ORDER BY date DESC LIMIT 6", ["description", "counterparty", "category"]).map((r) => ({ type: "transaction", id: r.id, title: r.description, date: r.date, amount: r.kind === "expense" ? -r.amount : r.amount })) : []),
      ...find("SELECT id, name, job_title FROM users WHERE $MATCH AND active = 1 ORDER BY name LIMIT 6", ["name", "email", "job_title"]).map((r) => ({ type: "person", id: r.id, title: r.name, sub: r.job_title })),
    ];
    return send(res, 200, results);
  }

  // ── Team (everyone can list names; admins manage) ──
  if (parts[0] === "users") {
    if (method === "GET") {
      return send(res, 200, all("SELECT id, name, email, role, job_title, active, created_at FROM users ORDER BY active DESC, name"));
    }
    if (!atLeast(user, "admin")) throw new HttpError(403, "Only an admin can manage the team.");
    const spec = { name: { type: "text", required: true, max: 120 }, email: { type: "email", required: true }, role: { type: "enum", values: ["admin", "manager", "member"], required: true }, job_title: { type: "text", max: 120 }, active: { type: "bool" } };
    if (method === "POST" && !parts[1]) {
      const body = await readJson(req);
      const data = validate(spec, body);
      const problem = passwordProblem(body.password);
      if (problem) throw new HttpError(422, problem, { password: problem });
      if (get("SELECT id FROM users WHERE email = ?", data.email)) throw new HttpError(422, "That email is already in use.", { email: "Already in use." });
      const created = insert("users", { ...data, active: data.active ?? 1, password_hash: await hashPassword(body.password), must_change_password: 1 });
      logActivity(user.id, `${user.name} added ${created.name} to the team`);
      return send(res, 201, { id: created.id });
    }
    const id = Number(parts[1]);
    const target = get("SELECT * FROM users WHERE id = ?", id);
    if (!target) throw new HttpError(404, "Not found.");
    if (method === "PATCH") {
      const body = await readJson(req);
      const data = validate(spec, body, { partial: true });
      if (id === user.id && (data.active === 0 || (data.role && data.role !== "admin"))) throw new HttpError(422, "You can't deactivate or demote yourself.");
      const otherAdmins = get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id <> ?", id).n;
      if (target.role === "admin" && (data.active === 0 || (data.role && data.role !== "admin")) && otherAdmins === 0) throw new HttpError(422, "The workspace needs at least one active admin.");
      if (body.password) {
        const problem = passwordProblem(body.password);
        if (problem) throw new HttpError(422, problem, { password: problem });
        data.password_hash = await hashPassword(body.password);
        data.must_change_password = 1;
      }
      update("users", id, data);
      if (data.active === 0 || data.password_hash) run("DELETE FROM sessions WHERE user_id = ?", id);
      logActivity(user.id, `${user.name} updated ${target.name}'s account`);
      return send(res, 200, { ok: true });
    }
  }

  // ── Backup download (admin) ──
  if (parts[0] === "backup" && method === "GET") {
    if (!atLeast(user, "admin")) throw new HttpError(403, "Only an admin can download backups.");
    const zip = buildBackup();
    setSetting("last_backup_at", new Date().toISOString());
    logActivity(user.id, `${user.name} downloaded a backup`, "manager");
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Length": zip.length,
      "Content-Disposition": `attachment; filename="workspace-backup-${localToday()}.zip"`,
      "Cache-Control": "no-store",
    });
    return res.end(zip);
  }

  // ── Settings (admin) ──
  if (parts[0] === "settings") {
    if (method === "GET") return send(res, 200, { company_name: getSetting("company_name", "Integral Academy"), opening_balance: Number(getSetting("opening_balance", "0")), opening_date: getSetting("opening_date", ""), last_backup_at: getSetting("last_backup_at") });
    if (method === "PUT") {
      if (!atLeast(user, "admin")) throw new HttpError(403, "Only an admin can change settings.");
      const data = validate({ company_name: { type: "text", max: 120 }, opening_balance: { type: "money" }, opening_date: { type: "date" } }, await readJson(req), { partial: true });
      for (const [k, v] of Object.entries(data)) setSetting(k, v ?? "");
      logActivity(user.id, `${user.name} updated workspace settings`);
      return send(res, 200, { ok: true });
    }
  }

  // ── Approvals decision ──
  if (parts[0] === "approvals" && parts[2] === "decide" && method === "POST") {
    if (!atLeast(user, "manager")) throw new HttpError(403, "Only managers can decide approvals.");
    const row = get("SELECT * FROM approvals WHERE id = ?", Number(parts[1]));
    if (!row) throw new HttpError(404, "Not found.");
    if (row.requested_by === user.id) throw new HttpError(403, "You can't approve your own request.");
    if (row.status !== "pending") throw new HttpError(409, "This request has already been decided.");
    const body = validate({ decision: { type: "enum", values: ["approved", "rejected"], required: true }, note: { type: "text", max: 1000 } }, await readJson(req));
    update("approvals", row.id, { status: body.decision, decided_by: user.id, decision_note: body.note ?? null, decided_at: new Date().toISOString() });
    logActivity(user.id, `${user.name} ${body.decision} “${row.title}”`, "manager");
    notify(row.requested_by, user, `${user.name} ${body.decision} your request “${row.title}”${body.note ? `: “${body.note}”` : ""}`, "approvals");
    return send(res, 200, { ok: true });
  }

  // ── Lead notes ──
  if (parts[0] === "leads" && parts[2] === "notes") {
    const lead = get("SELECT * FROM leads WHERE id = ?", Number(parts[1]));
    if (!lead) throw new HttpError(404, "Not found.");
    if (method === "GET") return send(res, 200, all("SELECT n.*, u.name AS author_name FROM lead_notes n LEFT JOIN users u ON u.id = n.author_id WHERE lead_id = ? ORDER BY n.id DESC", lead.id));
    if (method === "POST") {
      const data = validate({ body: { type: "text", required: true, max: 5000 } }, await readJson(req));
      insert("lead_notes", { lead_id: lead.id, body: data.body, author_id: user.id });
      notify(lead.owner_id, user, `${user.name} added a note on ${lead.school}`, `pipeline?lead=${lead.id}`);
      logActivity(user.id, `${user.name} added a note on ${lead.school}`);
      return send(res, 201, { ok: true });
    }
  }

  // ── Documents ──
  if (parts[0] === "documents") {
    if (method === "GET" && !parts[1]) {
      return send(res, 200, all("SELECT d.*, u.name AS uploader_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by ORDER BY d.id DESC").filter((d) => canSeeDoc(user, d)));
    }
    if (method === "POST" && !parts[1]) {
      const fileName = decodeURIComponent(String(req.headers["x-file-name"] || "")).replace(/[^\w.\- ()]/g, "_").slice(0, 150);
      const ext = path.extname(fileName).toLowerCase();
      if (!DOC_TYPES[ext]) throw new HttpError(422, "Upload a PDF, image, Word, Excel, PowerPoint, CSV or text file.");
      const meta = validate({ title: { type: "text", required: true, max: 200 }, folder: { type: "text", max: 60 } }, { title: decodeURIComponent(String(req.headers["x-title"] || "")), folder: decodeURIComponent(String(req.headers["x-folder"] || "")) || "General" });
      const data = await readBody(req, MAX_UPLOAD);
      if (!data.length) throw new HttpError(422, "The file is empty.");
      const key = `${Date.now()}-${randomBytes(8).toString("hex")}${ext}`;
      writeFileSync(path.join(DATA_DIR, "uploads", key), data, { flag: "wx", mode: 0o600 });
      const doc = insert("documents", { title: meta.title, folder: meta.folder || "General", file_name: fileName, mime_type: DOC_TYPES[ext], size: data.length, storage_key: key, private: req.headers["x-private"] === "1" ? 1 : 0, uploaded_by: user.id });
      logActivity(user.id, `${user.name} uploaded “${doc.title}”`, doc.private ? "manager" : "all");
      return send(res, 201, { id: doc.id });
    }
    const doc = get("SELECT * FROM documents WHERE id = ?", Number(parts[1]));
    if (!doc || !canSeeDoc(user, doc)) throw new HttpError(404, "Not found.");
    if (method === "GET" && parts[2] === "file") {
      const file = path.join(DATA_DIR, "uploads", doc.storage_key);
      if (!existsSync(file)) throw new HttpError(404, "The file is missing.");
      const inline = url.searchParams.get("inline") === "1" && /^(application\/pdf|image\/)/.test(doc.mime_type);
      res.writeHead(200, {
        "Content-Type": doc.mime_type,
        "Content-Length": statSync(file).size,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      });
      return createReadStream(file).pipe(res);
    }
    if (method === "DELETE") {
      if (!(doc.uploaded_by === user.id || atLeast(user, "manager"))) throw new HttpError(403, "Only the uploader or a manager can delete this.");
      run("DELETE FROM documents WHERE id = ?", doc.id);
      try {
        unlinkSync(path.join(DATA_DIR, "uploads", doc.storage_key));
      } catch {
        /* already gone */
      }
      logActivity(user.id, `${user.name} deleted “${doc.title}”`, doc.private ? "manager" : "all");
      return send(res, 200, { ok: true });
    }
  }

  // ── Goals: progress check-ins for goals updated by hand ──
  if (parts[0] === "goals" && parts[1] && parts[2] === "progress") {
    const goal = get("SELECT * FROM goals WHERE id = ?", Number(parts[1]));
    if (!goal || (!atLeast(user, "manager") && M.GOAL_METRICS[goal.metric]?.finance)) throw new HttpError(404, "Not found.");
    if (method === "GET") return send(res, 200, all("SELECT g.*, u.name AS author_name FROM goal_updates g LEFT JOIN users u ON u.id = g.author_id WHERE goal_id = ? ORDER BY g.id DESC LIMIT 50", goal.id));
    if (method === "POST") {
      if (goal.metric !== "manual") throw new HttpError(422, "This goal updates itself from the workspace's data.");
      if (!(atLeast(user, "manager") || goal.owner_id === user.id)) throw new HttpError(403, "Only the goal's owner or a manager can update progress.");
      const data = validate({ value: { type: "money", required: true }, note: { type: "text", max: 1000 } }, await readJson(req));
      insert("goal_updates", { goal_id: goal.id, value: data.value, note: data.note ?? null, author_id: user.id });
      run("UPDATE goals SET current_value = ? WHERE id = ?", data.value, goal.id);
      logActivity(user.id, `${user.name} updated progress on “${goal.title}”`);
      return send(res, 200, { ok: true });
    }
  }

  // ── Contracts: renew, or record that a school isn't renewing ──
  // ── Invoices: summary, send, record payment, void; the details printed on every invoice ──
  if (parts[0] === "invoices" || parts[0] === "invoice-settings") {
    if (!atLeast(user, "manager")) throw new HttpError(403, "Invoices are for managers.");
    if (parts[0] === "invoice-settings") {
      if (method === "GET") return send(res, 200, { invoice_from: getSetting("invoice_from", ""), invoice_bank: getSetting("invoice_bank", ""), vat_number: getSetting("vat_number", "") });
      if (method === "PUT") {
        const data = validate({ invoice_from: { type: "text", max: 600 }, invoice_bank: { type: "text", max: 600 }, vat_number: { type: "text", max: 40 } }, await readJson(req), { partial: true });
        for (const [k, v] of Object.entries(data)) setSetting(k, v ?? "");
        return send(res, 200, { ok: true });
      }
    }
    if (parts[1] === "summary" && method === "GET") return send(res, 200, M.invoiceSummary(all("SELECT * FROM invoices"), localToday()));
    if (parts[1] && ["send", "pay", "void"].includes(parts[2]) && method === "POST") {
      const inv = get("SELECT i.*, l.school FROM invoices i LEFT JOIN leads l ON l.id = i.lead_id WHERE i.id = ?", Number(parts[1]));
      if (!inv) throw new HttpError(404, "Not found.");
      if (parts[2] === "send") {
        if (inv.status !== "draft") throw new HttpError(409, "Only a draft can be marked as sent.");
        update("invoices", inv.id, { status: "sent" });
        logActivity(user.id, `${user.name} marked invoice ${inv.number} as sent`, "manager");
        return send(res, 200, { ok: true });
      }
      if (parts[2] === "void") {
        if (!["draft", "sent"].includes(inv.status)) throw new HttpError(409, "A paid invoice can't be voided. Record a refund as an expense instead.");
        update("invoices", inv.id, { status: "void" });
        logActivity(user.id, `${user.name} voided invoice ${inv.number}`, "manager");
        return send(res, 200, { ok: true });
      }
      if (!["draft", "sent"].includes(inv.status)) throw new HttpError(409, "This invoice is already paid or void.");
      const data = validate({ paid_date: { type: "date", required: true } }, await readJson(req));
      const tx = insert("transactions", { kind: "income", date: data.paid_date, amount: inv.amount, category: inv.contract_id ? "School contracts" : "Services", description: `Invoice ${inv.number}${inv.school ? `: ${inv.school}` : ""}`, counterparty: inv.school || null, created_by: user.id });
      update("invoices", inv.id, { status: "paid", paid_date: data.paid_date, transaction_id: tx.id });
      logActivity(user.id, `${user.name} recorded payment of invoice ${inv.number} (R${Number(inv.amount).toLocaleString("en-ZA")})`, "manager");
      return send(res, 200, { ok: true, transaction_id: tx.id });
    }
  }
  if (parts[0] === "contracts" && parts[1] === "summary" && method === "GET") return send(res, 200, M.renewalSummary(all("SELECT * FROM contracts"), localToday()));
  if (parts[0] === "contracts" && parts[1] && ["renew", "end"].includes(parts[2]) && method === "POST") {
    if (!atLeast(user, "manager")) throw new HttpError(403, "Only managers can change contracts.");
    const c = get("SELECT c.*, l.school FROM contracts c JOIN leads l ON l.id = c.lead_id WHERE c.id = ?", Number(parts[1]));
    if (!c) throw new HttpError(404, "Not found.");
    if (c.status !== "active") throw new HttpError(409, "This contract has already been renewed or closed.");
    if (parts[2] === "end") {
      const data = validate({ reason: { type: "text", max: 500 } }, await readJson(req));
      update("contracts", c.id, { status: "ended", end_reason: data.reason ?? null });
      logActivity(user.id, `${user.name} recorded that ${c.school} is not renewing`);
      return send(res, 200, { ok: true });
    }
    const data = validate({ start_date: { type: "date", required: true }, end_date: { type: "date", required: true }, annual_value: { type: "money", required: true }, learners: { type: "int" }, notes: { type: "text", max: 2000 } }, await readJson(req));
    checkContract({ ...data, lead_id: c.lead_id });
    const next = insert("contracts", { ...data, lead_id: c.lead_id, created_by: user.id });
    update("contracts", c.id, { status: "renewed", renewed_to: next.id });
    logActivity(user.id, `${user.name} renewed the contract with ${c.school} (R${Number(data.annual_value).toLocaleString("en-ZA")} a year)`);
    return send(res, 200, next);
  }

  // ── Budgets, budget vs actual, and the cash forecast (managers) ──
  if (parts[0] === "budgets") {
    if (!atLeast(user, "manager")) throw new HttpError(403, "Budgets are for managers.");
    if (method === "GET") return send(res, 200, all("SELECT * FROM budgets ORDER BY category"));
    if (method === "PUT") {
      const body = await readJson(req);
      if (!Array.isArray(body.items) || body.items.length > 100) throw new HttpError(422, "Send a list of budget lines.");
      const items = body.items.map((it) => validate({ category: { type: "text", required: true, max: 60 }, monthly_amount: { type: "money", required: true } }, it || {}));
      db.exec("BEGIN");
      try {
        run("DELETE FROM budgets");
        for (const it of items) if (it.monthly_amount > 0) run("INSERT INTO budgets (category, monthly_amount) VALUES (?, ?) ON CONFLICT(category) DO UPDATE SET monthly_amount = excluded.monthly_amount", it.category, it.monthly_amount);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      logActivity(user.id, `${user.name} updated the monthly budget`, "manager");
      return send(res, 200, { ok: true });
    }
  }
  if (parts[0] === "finance" && ["budget", "forecast"].includes(parts[1]) && method === "GET") {
    if (!atLeast(user, "manager")) throw new HttpError(403, "Finance is for managers.");
    const data = loadData();
    if (parts[1] === "budget") {
      const month = url.searchParams.get("month") || localToday().slice(0, 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, "Choose a month.");
      return send(res, 200, M.budgetVsActual(data.budgets, data.transactions, month, localToday()));
    }
    const q = (k) => url.searchParams.get(k);
    const monthOk = (v) => (v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null);
    return send(res, 200, M.forecast(data, localToday(), { months: q("months"), extraSpend: Math.max(0, Number(q("extra_spend")) || 0), extraSpendFrom: monthOk(q("extra_spend_from")), extraIncome: Math.max(0, Number(q("extra_income")) || 0), extraIncomeFrom: monthOk(q("extra_income_from")) }));
  }

  // ── Stats: monthly matrix and team matrix ──
  if (parts[0] === "stats" && method === "GET") {
    const data = loadData();
    const today = localToday();
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(url.searchParams.get("month") || "") ? url.searchParams.get("month") : today.slice(0, 7);
    return send(res, 200, { matrix: M.statsMatrix(data, today, { months: Number(url.searchParams.get("months")) || 12, includeFinance: atLeast(user, "manager") }), team: M.teamMatrix(data, today, month), month });
  }

  // ── Monthly update report (managers) ──
  if (parts[0] === "report" && method === "GET") {
    if (!atLeast(user, "manager")) throw new HttpError(403, "Reports are for managers.");
    const month = url.searchParams.get("month") || localToday().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > localToday().slice(0, 7)) throw new HttpError(400, "Choose a month up to this one.");
    return send(res, 200, monthlyReport(month));
  }

  // ── Bank statement import (managers) ──
  if (parts[0] === "transactions" && parts[1] === "import" && method === "POST") {
    if (!atLeast(user, "manager")) throw new HttpError(403, "You don't have access to this.");
    const body = await readJson(req, 4 * 1024 * 1024);
    if (!Array.isArray(body.rows) || body.rows.length === 0) throw new HttpError(422, "There are no rows to import.");
    if (body.rows.length > 2000) throw new HttpError(422, "Import at most 2 000 rows at a time.");
    return send(res, 200, importTransactions(body.rows, user));
  }

  // ── Generic resources ──
  const resource = RESOURCES[parts[0]];
  if (resource) {
    const table = parts[0];
    if (resource.canRead && !resource.canRead(user)) throw new HttpError(403, "You don't have access to this.");
    if (method === "GET" && !parts[1]) return send(res, 200, resource.list(user));
    if (method === "POST" && !parts[1]) {
      if (resource.canCreate && !resource.canCreate(user)) throw new HttpError(403, "You don't have access to this.");
      let data = validate(resource.fields, await readJson(req));
      if (resource.beforeCreate) data = resource.beforeCreate(data, user);
      const row = insert(table, data);
      if (resource.afterCreate) resource.afterCreate(row, user);
      logActivity(user.id, `${user.name} added ${resource.label(row)}`, resource.audience);
      return send(res, 201, row);
    }
    const row = get(`SELECT * FROM ${table} WHERE id = ?`, Number(parts[1]));
    if (!row) throw new HttpError(404, "Not found.");
    if (table === "approvals" && !atLeast(user, "manager") && row.requested_by !== user.id) throw new HttpError(404, "Not found.");
    if (table === "goals" && !atLeast(user, "manager") && M.GOAL_METRICS[row.metric]?.finance) throw new HttpError(404, "Not found.");
    if (method === "GET") return send(res, 200, row);
    if (method === "PATCH") {
      if (!resource.canEdit(user, row)) throw new HttpError(403, "You can't change this.");
      let data = validate(resource.fields, await readJson(req), { partial: true });
      if (resource.beforeUpdate) data = resource.beforeUpdate(data, row, user);
      const updated = update(table, row.id, data);
      const extra = resource.afterUpdate ? resource.afterUpdate(updated, row, user) : null;
      if (extra) Object.assign(updated, extra);
      logActivity(user.id, `${user.name} updated ${resource.label(updated)}`, resource.audience);
      return send(res, 200, updated);
    }
    if (method === "DELETE") {
      if (!resource.canDelete(user, row)) throw new HttpError(403, "You can't delete this.");
      run(`DELETE FROM ${table} WHERE id = ?`, row.id);
      logActivity(user.id, `${user.name} deleted ${resource.label(row)}`, resource.audience);
      return send(res, 200, { ok: true });
    }
  }
  throw new HttpError(404, "Not found.");
}

// ─────────────────────────── Static files ───────────────────────────
const STATIC_TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "SAMEORIGIN",
};
function serveStatic(req, res, url) {
  let file;
  try {
    file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
  } catch {
    return send(res, 400, { error: "Bad request." });
  }
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) return send(res, 404, { error: "Not found." });
  if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(PUBLIC, "index.html");
  res.writeHead(200, { "Content-Type": STATIC_TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": file.endsWith("index.html") ? "no-cache" : "public, max-age=3600", ...SECURITY_HEADERS });
  res.end(readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/health") return send(res, 200, { status: "ok" });
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (error) {
    if (error instanceof HttpError) return send(res, error.status, { error: error.message, fields: error.fields });
    if (String(error?.message).includes("FOREIGN KEY")) return send(res, 422, { error: "A linked record is missing." });
    console.error(error);
    return send(res, 500, { error: "Something went wrong. Please try again." });
  }
});

// Expired sessions are cleared hourly.
setInterval(() => {
  run("DELETE FROM sessions WHERE expires_at < ?", new Date().toISOString());
  run("DELETE FROM notifications WHERE created_at < datetime('now', '-90 days')");
  checkRenewals();
}, 3600000).unref();
checkRenewals();

/** Opens the default browser (used by the double-click start scripts). */
function openBrowser(target) {
  const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", target]] : process.platform === "darwin" ? ["open", [target]] : ["xdg-open", [target]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    /* no browser available: the address is printed instead */
  }
}
const LOCAL_URL = `http://localhost:${PORT}`;
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use — the workspace is probably already running. Open ${LOCAL_URL}`);
    if (process.argv.includes("--open")) openBrowser(LOCAL_URL);
  } else console.error(error);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  if (process.argv.includes("--open")) openBrowser(LOCAL_URL);
  console.log(`Integral Workspace Lite is running on ${LOCAL_URL}`);
  if (HOST === "0.0.0.0") {
    const addresses = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === "IPv4" && !a.internal).map((a) => `http://${a.address}:${PORT}`);
    if (addresses.length) console.log(`Others on your network can use: ${addresses.join("  or  ")}`);
  }
  console.log("Keep this window open while the team is using the workspace. Press Ctrl+C to stop it.");
  if (get("SELECT COUNT(*) AS n FROM users").n === 0) console.log("Open it in a browser to create the first admin account.");
});

export { db };
