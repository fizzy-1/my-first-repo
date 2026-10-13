// Database. On a computer: a single SQLite file using Node's built-in driver (no native modules to install).
// Online (e.g. Vercel, which keeps no files): a Turso database, which speaks the same SQL, when
// TURSO_DATABASE_URL is set. Uploaded files then live in the database too.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Everything the workspace stores on a computer lives in this folder: back it up by copying it.
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "data"));
export const ONLINE = Boolean(process.env.TURSO_DATABASE_URL);

let driver;
if (ONLINE) {
  const { connect } = await import("./db-remote.js");
  driver = connect(process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN);
} else {
  mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });
  const sqlite = new DatabaseSync(path.join(DATA_DIR, "workspace.db"));
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  driver = {
    all: (sql, params) => sqlite.prepare(sql).all(...params),
    get: (sql, params) => sqlite.prepare(sql).get(...params),
    run: (sql, params) => sqlite.prepare(sql).run(...params),
    exec: (sql) => sqlite.exec(sql),
    begin: () => sqlite.exec("BEGIN"),
    commit: () => sqlite.exec("COMMIT"),
    rollback: () => sqlite.exec("ROLLBACK"),
    snapshot: (file) => sqlite.prepare("VACUUM INTO ?").run(file),
  };
}

driver.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','member')),
  job_title TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- One-time links for creating a password: an invite for someone new, or a reset for someone who forgot theirs.
CREATE TABLE IF NOT EXISTS account_links (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('invite','reset')),
  expires_at TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date TEXT,
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  meeting_id INTEGER REFERENCES meetings(id) ON DELETE SET NULL,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  school TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  city TEXT,
  stage TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead','contacted','meeting','proposal','won','lost')),
  value REAL NOT NULL DEFAULT 0 CHECK (value >= 0),
  learners INTEGER CHECK (learners IS NULL OR learners >= 0),
  next_follow_up TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lead_notes (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS content (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'video' CHECK (type IN ('video','lesson','worksheet','quiz','past_paper')),
  topic TEXT,
  stage TEXT NOT NULL DEFAULT 'idea' CHECK (stage IN ('idea','recording','editing','review','published')),
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
  date TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  counterparty TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  details TEXT,
  amount REAL CHECK (amount IS NULL OR amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decision_note TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  attendees TEXT,
  notes TEXT,
  decisions TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  folder TEXT NOT NULL DEFAULT 'General',
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  private INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','manager')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  annual_value REAL NOT NULL DEFAULT 0 CHECK (annual_value >= 0),
  learners INTEGER CHECK (learners IS NULL OR learners >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','renewed','ended')),
  notes TEXT,
  end_reason TEXT,
  renewed_to INTEGER,
  reminded_60 INTEGER NOT NULL DEFAULT 0,
  reminded_30 INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  metric TEXT NOT NULL DEFAULT 'manual' CHECK (metric IN ('manual','schools_won','learners_signed','content_published','new_leads','income','arr')),
  target REAL NOT NULL CHECK (target > 0),
  baseline REAL NOT NULL DEFAULT 0,
  current_value REAL NOT NULL DEFAULT 0,
  unit TEXT,
  start_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS goal_updates (
  id INTEGER PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  value REAL NOT NULL,
  note TEXT,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS budgets (
  category TEXT PRIMARY KEY,
  monthly_amount REAL NOT NULL CHECK (monthly_amount >= 0)
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','void')),
  paid_date TEXT,
  transaction_id INTEGER,
  notes TEXT,
  overdue_notified INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS contracts_end ON contracts(end_date);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS tasks_assignee ON tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS activity_created ON activity(created_at);
-- Failed sign-ins, for slowing down password guessing (kept in the database so it works across online servers).
CREATE TABLE IF NOT EXISTS auth_failures (key TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS auth_failures_key ON auth_failures(key, at);
-- Uploaded files when running online (on a computer they're files in data/uploads).
CREATE TABLE IF NOT EXISTS files (storage_key TEXT PRIMARY KEY, data BLOB NOT NULL);
`);

export const all = (sql, ...params) => driver.all(sql, params);
export const get = (sql, ...params) => driver.get(sql, params);
export const run = (sql, ...params) => driver.run(sql, params);
/** Runs fn inside a transaction: everything it writes is saved together, or not at all. */
export function transaction(fn) {
  driver.begin();
  try {
    const out = fn();
    driver.commit();
    return out;
  } catch (err) {
    driver.rollback();
    throw err;
  }
}
/** Writes a consistent copy of the whole database to a SQLite file (for backups). */
export const snapshotTo = (file) => driver.snapshot(file);

// Uploaded files: in data/uploads on a computer, in the database online.
export function saveFile(key, data) {
  if (ONLINE) run("INSERT INTO files (storage_key, data) VALUES (?, ?)", key, data);
  else writeFileSync(path.join(DATA_DIR, "uploads", key), data, { flag: "wx", mode: 0o600 });
}
export function readStoredFile(key) {
  if (ONLINE) {
    const row = get("SELECT data FROM files WHERE storage_key = ?", key);
    return row ? Buffer.from(row.data) : null;
  }
  try {
    return readFileSync(path.join(DATA_DIR, "uploads", key));
  } catch {
    return null;
  }
}
export function removeFile(key) {
  if (ONLINE) run("DELETE FROM files WHERE storage_key = ?", key);
  else {
    try {
      unlinkSync(path.join(DATA_DIR, "uploads", key));
    } catch {
      /* already gone */
    }
  }
}

// Upgrades for workspaces created by an earlier version: add columns that are missing.
function ensureColumn(table, column, definition) {
  if (!all(`PRAGMA table_info(${table})`).some((c) => c.name === column)) driver.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn("users", "must_change_password", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("activity", "audience", "TEXT NOT NULL DEFAULT 'all'");
ensureColumn("tasks", "recurrence", "TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','weekly','monthly'))");
ensureColumn("leads", "won_at", "TEXT");
ensureColumn("content", "published_at", "TEXT");
ensureColumn("sessions", "created_at", "TEXT");
ensureColumn("sessions", "last_seen", "TEXT");
ensureColumn("sessions", "device", "TEXT");

/** Records a line in the team activity feed. "manager" entries (money, private files) are hidden from members. */
export function logActivity(userId, summary, audience = "all") {
  run("INSERT INTO activity (user_id, summary, audience) VALUES (?, ?, ?)", userId ?? null, summary, audience);
}

export function getSetting(key, fallback = null) {
  return get("SELECT value FROM settings WHERE key = ?", key)?.value ?? fallback;
}
export function setSetting(key, value) {
  run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, String(value));
}
