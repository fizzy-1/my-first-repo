/* Integral Workspace Lite — in-browser server for claude.ai.
 * Stands in for server.js inside the browser so the real app (public/app.js) runs unchanged:
 * every /api request is answered here. Permission rules mirror server.js. Two modes:
 *  - Preview (default): demo data kept in this browser (localStorage), plus a "Preview" bar for switching demo accounts.
 *  - Hosted (window.WS_HOSTED): the team's real data in the artifact's shared database, people signed in with their
 *    claude.ai accounts, roles from the Share menu (Owner = admin, Editor = manager, Contributor = member). */
(function () {
  "use strict";
  const HOSTED = Boolean(window.WS_HOSTED);
  const STORE_KEY = "integral-workspace-lite-preview-v3";
  const M = window.WSMetrics;
  window.WS_PREVIEW = true; // no printing or direct file saves inside claude.ai
  const DEMO_PASSWORD = "integral-demo-2026";
  const MAX_UPLOAD = (HOSTED ? 5 : 2) * 1024 * 1024;

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
    tasks: { notes: null, status: "todo", priority: "medium", due_date: null, assignee_id: null, created_by: null, meeting_id: null, lead_id: null, completed_at: null, recurrence: "none" },
    leads: { contact_name: null, contact_email: null, contact_phone: null, city: null, stage: "lead", value: 0, learners: null, next_follow_up: null, owner_id: null, won_at: null },
    lead_notes: { author_id: null },
    content: { type: "video", topic: null, stage: "idea", owner_id: null, due_date: null, published_at: null },
    transactions: { counterparty: null, created_by: null },
    approvals: { details: null, amount: null, status: "pending", requested_by: null, decided_by: null, decision_note: null, decided_at: null },
    meetings: { attendees: null, notes: null, decisions: null, created_by: null },
    documents: { folder: "General", private: 0, uploaded_by: null },
    activity: { user_id: null, audience: "all" },
    notifications: { link: null, read_at: null },
    contracts: { learners: null, status: "active", notes: null, end_reason: null, renewed_to: null, reminded_60: 0, reminded_30: 0, created_by: null },
    goals: { metric: "manual", baseline: 0, current_value: 0, unit: null, owner_id: null, notes: null, archived: 0, created_by: null },
    goal_updates: { note: null, author_id: null },
  };
  const TABLES = Object.keys(DEFAULTS);
  let db;
  const files = {}; // storage_key → { kind: "text" | "dataurl", data }

  function emptyDb() {
    const out = { seq: {}, settings: {}, session: null, files: {}, budgets: [] };
    for (const t of TABLES) out[t] = [];
    return out;
  }
  // Hosted rows get random numeric ids so two people adding things at once never collide.
  const cloudId = () => Math.floor(Date.now() * 1000 + Math.random() * 1000);
  function insert(table, data) {
    let id;
    if (HOSTED) id = cloudId();
    else id = db.seq[table] = (db.seq[table] || 0) + 1;
    const row = { id, ...DEFAULTS[table], ...data, created_at: data.created_at || nowIso() };
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

  // ─────────────────────────── Hosted: the team's shared database on claude.ai ───────────────────────────
  // Rows live in the artifact's database, one document each; this browser keeps a live copy in memory (db above),
  // answers the app's requests from it, and writes back only the documents a request changed.
  const cloud = { state: "loading", ready: Promise.resolve(), db: null, user: null, uid: null, level: null, role: null, myName: "", busy: 0, pending: [], remote: new Map(), shadow: new Map(), chains: new Map() };
  const HOSTED_MESSAGES = {
    unavailable: "This workspace runs inside claude.ai. Open it from claude.ai while signed in.",
    signed_out: "Sign in to claude.ai to open the workspace.",
    view_only: "You can see this page but not use the workspace. Ask the owner to share it with you as an Editor, or as a Contributor where their plan offers it.",
    deactivated: "An admin has turned off your access to this workspace. Ask them to turn it back on.",
    error: "The workspace couldn't load its data. Reload the page to try again.",
  };
  const ROLE_FOR_LEVEL = { owner: "admin", admin: "manager", interact: "member" };
  const canWriteMoney = () => cloud.level === "owner" || cloud.level === "admin";
  const myRow = () => db.users.find((u) => u.uid === cloud.uid);
  const notice = (message) => window.dispatchEvent(new CustomEvent("ws:notice", { detail: { message } }));
  // Money (transactions, manager-only activity, private files, opening balance, budgets) lives under "money/", which the
  // database itself lets only Editors and the Owner read or write. Everything else is shared with the team.
  const COLLECTIONS = [
    ["tasks", "tasks"], ["leads", "leads"], ["lead_notes", "lead_notes"], ["content", "content"], ["meetings", "meetings"],
    ["approvals", "approvals"], ["notifications", "notifications"], ["contracts", "contracts"], ["goals", "goals"], ["goal_updates", "goal_updates"],
    ["users", "members"], ["activity", "activity"], ["documents", "documents"],
    ["activity", "money/ledger/activity"], ["transactions", "money/ledger/transactions"], ["documents", "money/vault/documents"],
  ];
  function pathFor(table, row) {
    if (table === "users") return `members/${row.uid}`;
    if (table === "transactions") return `money/ledger/transactions/${row.id}`;
    if (table === "activity") return row.audience === "manager" ? `money/ledger/activity/${row.id}` : `activity/${row.id}`;
    if (table === "documents") return row.private ? `money/vault/documents/${row.id}` : `documents/${row.id}`;
    return `${table}/${row.id}`;
  }
  const isMoneyPath = (path) => path.startsWith("money/");
  /** JSON with sorted keys, so the same data always compares equal whichever side wrote it. */
  function canon(value) {
    if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(value[k])}`).join(",")}}`;
    return JSON.stringify(value === undefined ? null : value);
  }
  function serialize(table, row) {
    const copy = { ...row };
    if (table === "users") {
      delete copy.name; // names come from claude.ai profiles (or the person's own display name) when shown
      delete copy.email;
      delete copy.password;
    }
    return canon(copy);
  }
  /** Every document this browser believes should exist, as path → canonical JSON. */
  function localDocs() {
    const out = new Map();
    for (const table of TABLES)
      for (const row of db[table]) {
        const path = pathFor(table, row);
        if (!isMoneyPath(path) || canWriteMoney()) out.set(path, serialize(table, row));
      }
    if (db.settings.company_name != null || cloud.shadow.has("meta/settings")) out.set("meta/settings", canon({ company_name: db.settings.company_name ?? null }));
    if (canWriteMoney()) {
      const money = { opening_balance: db.settings.opening_balance ?? null, opening_date: db.settings.opening_date ?? null, last_backup_at: db.settings.last_backup_at ?? null };
      if (Object.values(money).some((v) => v !== null) || cloud.shadow.has("money/settings")) out.set("money/settings", canon(money));
      if (db.budgets.length || cloud.shadow.has("money/budgets")) out.set("money/budgets", canon({ items: db.budgets }));
    }
    return out;
  }
  // Writes go through a small queue: a few at a time, retrying when the database asks us to slow down.
  const queue = [];
  let active = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function queued(task) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject, tries: 0 });
      pump();
    });
  }
  function pump() {
    while (active < 6 && queue.length) {
      const job = queue.shift();
      active++;
      job.task().then(job.resolve, async (e) => {
        if (e && (e.code === "resource_exhausted" || e.code === "unavailable") && job.tries < 5) {
          job.tries++;
          await sleep(700 * job.tries + Math.random() * 500);
          queue.push(job);
        } else job.reject(e);
      }).finally(() => {
        active--;
        pump();
      });
    }
  }
  function writeDoc(path, body) {
    const prev = cloud.chains.get(path) || Promise.resolve();
    const next = prev.then(() => queued(() => (body === null ? cloud.db.doc(path).delete() : cloud.db.doc(path).set(body)))).catch((e) => syncFailed(path, e));
    cloud.chains.set(path, next);
    next.then(() => cloud.chains.get(path) === next && cloud.chains.delete(path));
    return next;
  }
  function syncFailed(path, e) {
    notice(e && e.code === "quota_exceeded" ? "The workspace's storage is full. Delete old records or files to make room."
      : e && e.code === "invalid_argument" ? "You don't have permission to change that, so it wasn't saved."
      : "A change couldn't be saved. Check your connection and try again.");
    cloud.shadow.delete(path);
    const body = cloud.remote.get(path);
    applyDoc(path, body === undefined ? null : JSON.parse(body)); // back to what the database holds
    remoteChanged();
  }
  /** Sends this browser's changes: new or edited documents are written, removed ones deleted. */
  function cloudSync() {
    if (cloud.state !== "ready" && cloud.state !== "joining") return;
    const local = localDocs();
    for (const [path, json] of local) if (cloud.shadow.get(path) !== json) {
      cloud.shadow.set(path, json);
      writeDoc(path, JSON.parse(json));
    }
    for (const path of [...cloud.shadow.keys()]) if (!local.has(path) && (!isMoneyPath(path) || canWriteMoney())) {
      cloud.shadow.delete(path);
      writeDoc(path, null);
    }
  }
  function applyDoc(path, body) {
    if (path === "meta/settings") {
      if (body && body.company_name != null) db.settings.company_name = String(body.company_name);
      return;
    }
    if (path === "money/settings") {
      for (const k of ["opening_balance", "opening_date", "last_backup_at"]) if (body && body[k] != null) db.settings[k] = String(body[k]);
      return;
    }
    if (path === "money/budgets") {
      db.budgets = body && Array.isArray(body.items) ? body.items.map((b) => ({ ...b })) : [];
      return;
    }
    const cut = path.lastIndexOf("/");
    const coll = path.slice(0, cut);
    const docId = path.slice(cut + 1);
    const entry = COLLECTIONS.find(([, c]) => c === coll);
    if (!entry) return;
    const table = entry[0];
    const i = db[table].findIndex(table === "users" ? (r) => r.uid === docId : (r) => String(r.id) === docId && pathFor(table, r) === path);
    if (!body) {
      if (i >= 0) db[table].splice(i, 1);
      return;
    }
    const row = { ...DEFAULTS[table], ...body };
    if (table === "users" && i >= 0) row.name = db[table][i].name;
    if (i >= 0) db[table][i] = row;
    else db[table].push(row);
  }
  let remoteTimer = null;
  function remoteChanged() {
    clearTimeout(remoteTimer);
    remoteTimer = setTimeout(() => window.dispatchEvent(new Event("ws:remote")), 600);
  }
  /** Changes arriving from the database (other people, or our own writes confirmed). */
  function receive(changes) {
    if (cloud.busy) {
      cloud.pending.push(...changes); // applied once the request in progress has finished
      return;
    }
    let changed = false;
    for (const { path, body } of changes) {
      const json = body ? canon(body) : null;
      if (json === null) cloud.remote.delete(path);
      else cloud.remote.set(path, json);
      if ((cloud.shadow.get(path) ?? null) === json) continue; // our own write coming back
      if (json === null) cloud.shadow.delete(path);
      else cloud.shadow.set(path, json);
      applyDoc(path, json === null ? null : JSON.parse(json));
      changed = true;
    }
    if (changed) remoteChanged();
  }
  function flushPending() {
    if (cloud.busy || !cloud.pending.length) return;
    const changes = cloud.pending.splice(0);
    receive(changes);
  }
  async function resolveNames() {
    if (cloud.state !== "ready") return;
    const uids = db.users.map((u) => u.uid).filter(Boolean);
    const profiles = uids.length ? await cloud.user.profiles(uids) : {};
    for (const u of db.users) u.name = u.display_name || (profiles[u.uid] && profiles[u.uid].name) || "Team member";
    const mine = myRow();
    if (mine) cloud.myName = mine.name;
  }
  /** Keeps the database small: notifications older than 90 days and all but the latest 300 activity lines go. */
  function pruneOld() {
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    const before = db.notifications.length + db.activity.length;
    db.notifications = db.notifications.filter((n) => String(n.created_at) >= cutoff);
    for (const audience of ["all", "manager"]) {
      const lines = sortBy(db.activity.filter((a) => (a.audience || "all") === audience), (a, b) => cmp(String(b.created_at), String(a.created_at)));
      const drop = new Set(lines.slice(300).map((a) => a.id));
      if (drop.size) db.activity = db.activity.filter((a) => !drop.has(a.id));
    }
    return before !== db.notifications.length + db.activity.length;
  }
  async function startCloud() {
    try {
      cloud.db = await window.claude.use("db");
      cloud.user = await window.claude.use("user");
      if (!cloud.db || !cloud.user) return void (cloud.state = "unavailable");
      const me = await cloud.user.me();
      if (!me.id) return void (cloud.state = "signed_out");
      cloud.uid = me.id;
      cloud.myName = me.name;
      const write = await cloud.user.can("data.write");
      cloud.level = me.isOwner ? "owner" : me.canEdit ? "admin" : write === false ? "view" : "interact";
      if (cloud.level === "view") return void (cloud.state = "view_only");
      cloud.role = ROLE_FOR_LEVEL[cloud.level];
      const collections = COLLECTIONS.map(([, c]) => c).filter((c) => canWriteMoney() || !isMoneyPath(c));
      const docs = ["meta/settings", ...(canWriteMoney() ? ["money/settings", "money/budgets"] : [])];
      const onError = (e) => notice(e && e.code === "revoked" ? "Your access to this workspace changed. Reload the page." : "Live updates stopped. Reload the page to reconnect.");
      await new Promise((resolve) => {
        let waiting = collections.length + docs.length;
        const arrived = () => --waiting <= 0 && resolve();
        setTimeout(resolve, 12000);
        for (const c of collections) {
          let first = true;
          cloud.db.collection(c).onSnapshot((snap) => {
            receive(snap.docChanges().map((ch) => ({ path: `${c}/${ch.doc.id}`, body: ch.type === "removed" ? null : ch.doc.data() })));
            if (first) {
              first = false;
              arrived();
            }
          }, onError);
        }
        for (const d of docs) {
          let first = true;
          cloud.db.doc(d).onSnapshot((snap) => {
            receive([{ path: d, body: snap.exists ? snap.data() : null }]);
            if (first) {
              first = false;
              arrived();
            }
          }, onError);
        }
      });
      // Joining: everyone who opens the workspace gets a member record; their role follows their sharing level.
      cloud.state = "joining";
      const mine = myRow();
      if (!mine) insert("users", { uid: cloud.uid, role: cloud.role, job_title: null, active: 1, display_name: null });
      else if (mine.role !== cloud.role) mine.role = cloud.role;
      if (myRow() && !myRow().active) {
        cloudSync();
        return void (cloud.state = "deactivated");
      }
      pruneOld();
      cloud.state = "ready";
      const lease = await cloud.db.doc("locks/renewals").acquire({ holder: cloud.uid, ttlMs: 60000 }).catch(() => ({ acquired: false }));
      if (lease.acquired) checkRenewals(); // one person at a time sends renewal reminders
      cloudSync();
    } catch (error) {
      console.error(error);
      cloud.state = "error";
    }
  }

  // Files are stored in the database in pieces (each document holds up to 256 KB).
  const CHUNK = 180000;
  const filePath = (doc, i) => `${doc.private ? "money/vault/filedata" : "filedata"}/${doc.storage_key}/parts/${i}`;
  const readDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new HttpError(422, "Couldn't read that file."));
    reader.readAsDataURL(blob);
  });
  async function storeFile(doc, blob) {
    const url = await readDataUrl(blob);
    const parts = [];
    for (let i = 0; i < url.length; i += CHUNK) parts.push(url.slice(i, i + CHUNK));
    try {
      await Promise.all(parts.map((d, i) => queued(() => cloud.db.doc(filePath(doc, i)).set({ d }))));
    } catch (e) {
      throw new HttpError(507, e && e.code === "quota_exceeded" ? "The workspace's storage is full. Delete old files to make room." : "The file couldn't be stored. Try again.");
    }
    return parts.length;
  }
  async function readFile(doc) {
    const snaps = await Promise.all(Array.from({ length: doc.parts || 0 }, (_, i) => cloud.db.doc(filePath(doc, i)).get()));
    if (!snaps.length || snaps.some((sn) => !sn.exists)) throw new Error("missing");
    return snaps.map((sn) => sn.data().d).join("");
  }
  function dataUrlToBlob(url, type) {
    const bytes = atob(url.slice(url.indexOf(",") + 1));
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    return new Blob([buf], { type });
  }
  async function saveFile(filename, data) {
    const downloads = await window.claude.use("downloads");
    if (!downloads) return notice("Saving files isn't available in this view.");
    try {
      await downloads.save({ filename, data });
    } catch (e) {
      if (e && e.code !== "declined") notice(e.code === "rejected_extension" ? "That type of file can't be saved from here." : "The file couldn't be saved.");
    }
  }

  function persist() {
    if (HOSTED) return cloudSync();
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

  // ─────────────────────────── Demo data (preview/demo-data.js, the same story seed.js uses) ───────────────────────────
  function seed() {
    db = emptyDb();
    for (const k of Object.keys(files)) delete files[k];
    const demo = window.WSDemoData.buildDemoData();
    for (const [table, rows] of Object.entries(demo.tables)) {
      if (table === "documents") continue;
      db[table] = rows.map((r) => ({ ...r }));
      db.seq[table] = rows.length;
    }
    db.users = db.users.map((u) => ({ ...u, password: DEMO_PASSWORD }));
    db.documents = demo.tables.documents.map(({ body, ...d }) => {
      const key = `seed-${d.id}-${d.file_name}`;
      files[key] = { kind: "text", data: body };
      return { ...d, storage_key: key, size: new Blob([body]).size };
    });
    db.seq.documents = db.documents.length;
    db.settings = { ...demo.settings };
    db.budgets = demo.budgets.map((b) => ({ ...b }));
    db.session = demo.ids.sipho; // open signed in as the founder, so the first view shows the workspace
    checkRenewals();
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
        recurrence: { type: "enum", values: ["none", "weekly", "monthly"] },
      },
      list: () => sortBy(db.tasks, (a, b) => (a.status === "done") - (b.status === "done"), ...byDueThenNewest("due_date")),
      beforeCreate: (data, user) => ({ ...data, created_by: user.id, assignee_id: data.assignee_id ?? user.id }),
      beforeUpdate: (data, row) => ("status" in data ? { ...data, completed_at: data.status === "done" ? row.completed_at || nowIso() : null } : data),
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
        school: { type: "text", required: true, max: 200 }, contact_name: { type: "text", max: 120 }, contact_email: { type: "email" },
        contact_phone: { type: "text", max: 40 }, city: { type: "text", max: 80 },
        stage: { type: "enum", values: ["lead", "contacted", "meeting", "proposal", "won", "lost"] },
        value: { type: "money" }, learners: { type: "int" }, next_follow_up: { type: "date" }, owner_id: { type: "user" },
      },
      list: () => sortBy(db.leads, (a, b) => cmp(a.school, b.school)),
      beforeCreate: (data, user) => ({ ...data, owner_id: data.owner_id ?? user.id, won_at: data.stage === "won" ? nowIso() : null }),
      beforeUpdate: (data, row) => ("stage" in data ? { ...data, won_at: data.stage === "won" ? row.won_at || nowIso() : null } : data),
      canEdit: () => true,
      canDelete: (user) => atLeast(user, "manager"),
      onDelete: (row) => {
        db.lead_notes = db.lead_notes.filter((n) => n.lead_id !== row.id);
        db.contracts = db.contracts.filter((c) => c.lead_id !== row.id);
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
      beforeCreate: (data, user) => {
        if (data.stage === "published" && !atLeast(user, "manager")) throw new HttpError(403, "Only a manager can mark content as published.");
        return { ...data, owner_id: data.owner_id ?? user.id, published_at: data.stage === "published" ? nowIso() : null };
      },
      beforeUpdate: (data, row, user) => {
        if (data.stage === "published" && !atLeast(user, "manager")) throw new HttpError(403, "Only a manager can mark content as published.");
        return "stage" in data ? { ...data, published_at: data.stage === "published" ? row.published_at || nowIso() : null } : data;
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
      afterCreate: (row, user) => notify(managerIds(), user, `${user.name} asked for approval: “${row.title}”${row.amount !== null ? ` (R${Number(row.amount).toLocaleString("en-ZA")})` : ""}`, "approvals"),
      canEdit: (user, row) => row.requested_by === user.id && row.status === "pending",
      canDelete: (user, row) => (row.requested_by === user.id && row.status === "pending") || atLeast(user, "admin"),
    },
    contracts: {
      label: (r) => `the contract with ${(byId("leads", r.lead_id) || {}).school || "a school"}`,
      fields: {
        lead_id: { type: "int", required: true }, start_date: { type: "date", required: true }, end_date: { type: "date", required: true },
        annual_value: { type: "money", required: true }, learners: { type: "int" }, notes: { type: "text", max: 2000 },
      },
      list: () => contractRows(),
      beforeCreate: (data, user) => {
        checkContract(data);
        return { ...data, created_by: user.id };
      },
      afterCreate: (row) => {
        const lead = byId("leads", row.lead_id);
        if (lead && lead.stage !== "won") Object.assign(lead, { stage: "won", won_at: lead.won_at || nowIso() });
      },
      beforeUpdate: (data, row) => {
        checkContract({ ...row, ...data });
        return "end_date" in data && data.end_date !== row.end_date ? { ...data, reminded_60: 0, reminded_30: 0 } : data;
      },
      canCreate: (user) => atLeast(user, "manager"),
      canEdit: (user) => atLeast(user, "manager"),
      canDelete: (user) => atLeast(user, "manager"),
    },
    goals: {
      label: (r) => `goal “${r.title}”`,
      fields: {
        title: { type: "text", required: true, max: 200 }, metric: { type: "enum", values: Object.keys(M.GOAL_METRICS) },
        target: { type: "money", required: true, positive: true }, baseline: { type: "money" }, unit: { type: "text", max: 40 },
        start_date: { type: "date", required: true }, due_date: { type: "date", required: true }, owner_id: { type: "user" },
        notes: { type: "text", max: 2000 }, archived: { type: "bool" },
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
      onDelete: (row) => {
        db.goal_updates = db.goal_updates.filter((u) => u.goal_id !== row.id);
      },
      canCreate: (user) => atLeast(user, "manager"),
      canEdit: (user) => atLeast(user, "manager"),
      canDelete: (user) => atLeast(user, "manager"),
    },
  };
  function checkContract(c) {
    if (!byId("leads", c.lead_id)) throw new HttpError(422, "Choose a school.", { lead_id: "Choose a school." });
    if (c.end_date <= c.start_date) throw new HttpError(422, "The end date must be after the start date.", { end_date: "Must be after the start date." });
  }
  function checkGoalDates(g) {
    if (g.due_date <= g.start_date) throw new HttpError(422, "The deadline must be after the start date.", { due_date: "Must be after the start date." });
  }
  const checkLinks = (data) => {
    if (data.meeting_id != null && !byId("meetings", data.meeting_id)) throw new HttpError(422, "A linked record is missing.");
    if (data.lead_id != null && !byId("leads", data.lead_id)) throw new HttpError(422, "A linked record is missing.");
  };

  // ─────────────────────────── Notifications & repeating tasks ───────────────────────────
  const managerIds = () => db.users.filter((u) => u.active && (u.role === "manager" || u.role === "admin")).map((u) => u.id);
  function notify(userIds, actor, message, link) {
    for (const id of new Set([].concat(userIds))) {
      const target = id && id !== actor.id && byId("users", id);
      if (target && target.active) insert("notifications", { user_id: id, actor_id: actor.id || null, message, link: link ?? null });
    }
  }
  function advance(dateStr, recurrence) {
    const d = new Date(`${dateStr}T00:00:00`);
    if (recurrence === "weekly") d.setDate(d.getDate() + 7);
    else {
      const dayOfMonth = d.getDate();
      d.setMonth(d.getMonth() + 1);
      if (d.getDate() !== dayOfMonth) d.setDate(0);
    }
    return isoDay(d);
  }
  function scheduleNext(task) {
    let due = advance(task.due_date || localToday(), task.recurrence);
    while (due < localToday()) due = advance(due, task.recurrence);
    const exists = db.tasks.some((t) => t.title === task.title && t.recurrence === task.recurrence && t.status !== "done" && t.due_date === due && t.assignee_id === task.assignee_id);
    if (!exists) insert("tasks", { title: task.title, notes: task.notes, priority: task.priority, assignee_id: task.assignee_id, created_by: task.created_by, recurrence: task.recurrence, due_date: due });
    return due;
  }

  // ─────────────────────────── Goals, contracts, shared calculations ───────────────────────────
  const loadData = () => ({
    transactions: db.transactions, leads: db.leads, contracts: db.contracts, content: db.content, tasks: db.tasks, meetings: db.meetings,
    users: db.users, leadNotes: db.lead_notes, budgets: db.budgets, openingBalance: Number(getSetting("opening_balance", "0")) || 0,
  });
  function contractRows() {
    const today = localToday();
    return sortBy(db.contracts, (a, b) => cmp(a.end_date, b.end_date)).map((c) => {
      const lead = byId("leads", c.lead_id) || {};
      return { ...c, school: lead.school, city: lead.city, owner_id: lead.owner_id ?? null, state: M.contractState(c, today), days_left: M.daysBetween(today, c.end_date) };
    });
  }
  function goalRows(user) {
    const data = loadData();
    const today = localToday();
    return sortBy(db.goals, (a, b) => a.archived - b.archived, (a, b) => cmp(a.due_date, b.due_date))
      .filter((g) => atLeast(user, "manager") || !M.GOAL_METRICS[g.metric]?.finance)
      .map((g) => ({ ...g, progress: M.goalProgress(g, data, today) }));
  }
  const shortDate = (date) => new Date(`${date}T00:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  function checkRenewals() {
    const today = localToday();
    const system = { id: 0 };
    for (const c of db.contracts.filter((x) => x.status === "active")) {
      const days = M.daysBetween(today, c.end_date);
      const lead = byId("leads", c.lead_id);
      if (!lead || days < 0 || days > 60) continue;
      const people = [lead.owner_id, ...managerIds()];
      const link = `contracts?contract=${c.id}`;
      if (!c.reminded_60) {
        notify(people, system, `${lead.school}'s contract ends on ${shortDate(c.end_date)}. Time to talk about renewing.`, link);
        const due = M.addDays(c.end_date, -30) > today ? M.addDays(c.end_date, -30) : today;
        insert("tasks", { title: `Renew ${lead.school} (contract ends ${shortDate(c.end_date)})`, priority: "high", due_date: due, assignee_id: lead.owner_id, lead_id: lead.id });
        c.reminded_60 = 1;
        c.reminded_30 = days <= 30 ? 1 : 0;
      } else if (days <= 30 && !c.reminded_30) {
        notify(people, system, `${lead.school}'s contract ends in ${days} day${days === 1 ? "" : "s"} and hasn't been renewed yet.`, link);
        c.reminded_30 = 1;
      }
    }
  }

  // ─────────────────────────── Monthly report & statement import ───────────────────────────
  function monthlyReport(month) {
    const [y, m] = month.split("-").map(Number);
    const start = `${month}-01`;
    const next = isoDay(new Date(y, m, 1));
    const prevStart = isoDay(new Date(y, m - 2, 1));
    const total = (kind, from, to) => db.transactions.filter((t) => t.kind === kind && t.date >= from && t.date < to).reduce((s, t) => s + t.amount, 0);
    const income = total("income", start, next);
    const expense = total("expense", start, next);
    const cashEnd = (Number(getSetting("opening_balance", "0")) || 0) + total("income", "0000-01-01", next) - total("expense", "0000-01-01", next);
    const burnStart = isoDay(new Date(y, m - 3, 1));
    const burn = (total("expense", burnStart, next) - total("income", burnStart, next)) / 3;
    const inMonth = (v) => v && v >= start && v < next;
    const byCategory = (kind) => {
      const out = {};
      for (const t of db.transactions) if (t.kind === kind && t.date >= start && t.date < next) out[t.category] = (out[t.category] || 0) + t.amount;
      return Object.entries(out).map(([category, sum]) => ({ category, total: sum })).sort((a, b) => b.total - a.total);
    };
    const decided = (status) => db.approvals.filter((a) => a.status === status && inMonth(a.decided_at));
    const openLeads = db.leads.filter((l) => !["won", "lost"].includes(l.stage));
    return {
      month,
      company: getSetting("company_name", "Integral Academy"),
      money: {
        income, expense, net: income - expense, prevIncome: total("income", prevStart, start), prevExpense: total("expense", prevStart, start), cashEnd,
        avgBurn: burn, runwayMonths: burn > 0 ? Math.max(0, cashEnd) / burn : null, topSpending: byCategory("expense").slice(0, 5), incomeBySource: byCategory("income"),
      },
      schools: {
        won: sortBy(db.leads.filter((l) => inMonth(l.won_at)), (a, b) => cmp(a.won_at, b.won_at)).map((l) => ({ school: l.school, value: l.value, learners: l.learners })),
        newLeads: db.leads.filter((l) => inMonth(l.created_at)).length,
        openPipeline: { n: openLeads.length, value: openLeads.reduce((s, l) => s + (l.value || 0), 0) },
        learnersSigned: db.leads.filter((l) => l.stage === "won").reduce((s, l) => s + (l.learners || 0), 0),
      },
      content: sortBy(db.content.filter((c) => inMonth(c.published_at)), (a, b) => cmp(a.published_at, b.published_at)).map((c) => ({ title: c.title, type: c.type })),
      tasksDone: db.tasks.filter((t) => inMonth(t.completed_at)).length,
      decisions: sortBy(db.meetings.filter((mt) => inMonth(mt.date)), (a, b) => cmp(a.date, b.date)).map((mt) => ({ meeting: mt.title, date: mt.date, items: (mt.decisions || "").split("\n").map((d) => d.trim()).filter(Boolean) })).filter((mt) => mt.items.length),
      approvals: { approved: decided("approved").length, approvedAmount: decided("approved").reduce((s, a) => s + (a.amount || 0), 0), rejected: decided("rejected").length },
      contracts: (() => {
        const end = next > localToday() ? localToday() : M.addDays(next, -1);
        return {
          arr: M.arrOn(db.contracts, end), arrStart: M.arrOn(db.contracts, M.addDays(start, -1)), schools: M.schoolsOn(db.contracts, end),
          renewed: db.contracts.filter((c) => c.status === "renewed" && c.end_date >= start && c.end_date < next).length,
          notRenewed: db.contracts.filter((c) => c.status === "ended" && c.end_date >= start && c.end_date < next).length,
        };
      })(),
    };
  }
  const IMPORT_ROW = {
    kind: { type: "enum", values: ["income", "expense"], required: true },
    date: { type: "date", required: true },
    amount: { type: "money", required: true, positive: true },
    description: { type: "text", required: true, max: 200 },
    category: { type: "text", max: 60 },
  };
  function importTransactions(rows, user) {
    const alreadyThere = new Map();
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
    for (const r of ready) {
      const k = `${r.date}|${r.kind}|${r.amount}|${r.description.toLowerCase()}`;
      if (!alreadyThere.has(k)) alreadyThere.set(k, db.transactions.filter((t) => t.date === r.date && t.kind === r.kind && t.amount === r.amount && t.description.toLowerCase() === r.description.toLowerCase()).length);
      if (alreadyThere.get(k) > 0) {
        alreadyThere.set(k, alreadyThere.get(k) - 1);
        duplicates++;
        continue;
      }
      const earlier = sortBy(db.transactions.filter((t) => t.kind === r.kind && t.description.toLowerCase() === r.description.toLowerCase()), (a, b) => cmp(b.date, a.date))[0];
      insert("transactions", { kind: r.kind, date: r.date, amount: r.amount, description: r.description, category: r.category || (earlier && earlier.category) || "Uncategorised", created_by: user.id });
      imported++;
    }
    if (imported) logActivity(user.id, `${user.name} imported ${imported} transactions from a bank statement`, "manager");
    return { imported, duplicates, invalid };
  }

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
      goals: goalRows(user).filter((g) => !g.archived && g.progress.status !== "missed").slice(0, 4),
      renewals: { summary: M.renewalSummary(db.contracts, today), due: contractRows().filter((c) => ["due", "lapsed"].includes(c.state)).slice(0, 5) },
      activity: sortBy(db.activity.filter((a) => manager || a.audience === "all"), (a, b) => b.id - a.id).slice(0, 12).map((a) => ({ summary: String(a.summary).replace("{actor}", userName(a.user_id) || "Someone"), created_at: a.created_at, user_name: userName(a.user_id) })),
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
    if (HOSTED) {
      const me = cloud.state === "ready" ? myRow() : null;
      return me && me.active ? { id: me.id, name: "{actor}", email: null, role: cloud.role, job_title: me.job_title, must_change_password: false } : null;
    }
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

    if (HOSTED && parts[0] === "auth") {
      if (parts[1] === "status" && method === "GET") {
        const u = currentUser();
        return [200, { setupRequired: false, user: u ? { ...u, name: cloud.myName || "there" } : null, company: getSetting("company_name", "Integral Academy"), hosted: { state: cloud.state, message: HOSTED_MESSAGES[cloud.state] || null } }];
      }
      throw new HttpError(404, "Signing in is handled by claude.ai in the hosted workspace.");
    }
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
        unreadNotifications: db.notifications.filter((n) => n.user_id === user.id && !n.read_at).length,
      }];
    }
    if (parts[0] === "notifications") {
      const mine = db.notifications.filter((n) => n.user_id === user.id);
      if (method === "GET" && !parts[1]) return [200, { unread: mine.filter((n) => !n.read_at).length, items: sortBy(mine, (a, b) => cmp(String(b.created_at), String(a.created_at)) || b.id - a.id).slice(0, 30).map(({ id, actor_id, message, link, read_at, created_at }) => ({ id, message: String(message).replace("{actor}", (byId("users", actor_id) || {}).name || "Someone"), link, read_at, created_at })) }];
      if (method === "POST" && parts[1] === "read") {
        const input = body();
        const ids = Array.isArray(input.ids) ? input.ids.map(Number) : null;
        for (const n of mine) if (!n.read_at && (!ids || ids.includes(n.id))) n.read_at = nowIso();
        return [200, { ok: true }];
      }
    }
    if (parts[0] === "goals" && parts[1] && parts[2] === "progress") {
      const goal = byId("goals", parts[1]);
      if (!goal || (!atLeast(user, "manager") && M.GOAL_METRICS[goal.metric]?.finance)) throw new HttpError(404, "Not found.");
      if (method === "GET") return [200, sortBy(db.goal_updates.filter((u) => u.goal_id === goal.id), (a, b) => b.id - a.id).map((u) => ({ ...u, author_name: (byId("users", u.author_id) || {}).name || null }))];
      if (method === "POST") {
        if (goal.metric !== "manual") throw new HttpError(422, "This goal updates itself from the workspace's data.");
        if (!(atLeast(user, "manager") || goal.owner_id === user.id)) throw new HttpError(403, "Only the goal's owner or a manager can update progress.");
        const data = validate({ value: { type: "money", required: true }, note: { type: "text", max: 1000 } }, body());
        insert("goal_updates", { goal_id: goal.id, value: data.value, note: data.note ?? null, author_id: user.id });
        goal.current_value = data.value;
        logActivity(user.id, `${user.name} updated progress on “${goal.title}”`);
        return [200, { ok: true }];
      }
    }
    if (parts[0] === "contracts" && parts[1] === "summary" && method === "GET") return [200, M.renewalSummary(db.contracts, localToday())];
    if (parts[0] === "contracts" && parts[1] && ["renew", "end"].includes(parts[2]) && method === "POST") {
      if (!atLeast(user, "manager")) throw new HttpError(403, "Only managers can change contracts.");
      const c = byId("contracts", parts[1]);
      if (!c) throw new HttpError(404, "Not found.");
      const school = (byId("leads", c.lead_id) || {}).school;
      if (c.status !== "active") throw new HttpError(409, "This contract has already been renewed or closed.");
      if (parts[2] === "end") {
        const data = validate({ reason: { type: "text", max: 500 } }, body());
        Object.assign(c, { status: "ended", end_reason: data.reason ?? null });
        logActivity(user.id, `${user.name} recorded that ${school} is not renewing`);
        return [200, { ok: true }];
      }
      const data = validate({ start_date: { type: "date", required: true }, end_date: { type: "date", required: true }, annual_value: { type: "money", required: true }, learners: { type: "int" }, notes: { type: "text", max: 2000 } }, body());
      checkContract({ ...data, lead_id: c.lead_id });
      const next = insert("contracts", { ...data, lead_id: c.lead_id, created_by: user.id });
      Object.assign(c, { status: "renewed", renewed_to: next.id });
      logActivity(user.id, `${user.name} renewed the contract with ${school} (R${Number(data.annual_value).toLocaleString("en-ZA")} a year)`);
      return [200, next];
    }
    if (parts[0] === "budgets") {
      if (!atLeast(user, "manager")) throw new HttpError(403, "Budgets are for managers.");
      if (method === "GET") return [200, sortBy(db.budgets, (a, b) => cmp(a.category, b.category))];
      if (method === "PUT") {
        const input = body();
        if (!Array.isArray(input.items) || input.items.length > 100) throw new HttpError(422, "Send a list of budget lines.");
        const items = input.items.map((it) => validate({ category: { type: "text", required: true, max: 60 }, monthly_amount: { type: "money", required: true } }, it || {}));
        const merged = {};
        for (const it of items) if (it.monthly_amount > 0) merged[it.category] = it.monthly_amount;
        db.budgets = Object.entries(merged).map(([category, monthly_amount]) => ({ category, monthly_amount }));
        logActivity(user.id, `${user.name} updated the monthly budget`, "manager");
        return [200, { ok: true }];
      }
    }
    if (parts[0] === "finance" && ["budget", "forecast"].includes(parts[1]) && method === "GET") {
      if (!atLeast(user, "manager")) throw new HttpError(403, "Finance is for managers.");
      const data = loadData();
      const monthOk = (v) => (v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null);
      if (parts[1] === "budget") {
        const month = url.searchParams.get("month") || localToday().slice(0, 7);
        if (!monthOk(month)) throw new HttpError(400, "Choose a month.");
        return [200, M.budgetVsActual(data.budgets, data.transactions, month, localToday())];
      }
      const q = (k) => url.searchParams.get(k);
      return [200, M.forecast(data, localToday(), { months: q("months"), extraSpend: Math.max(0, Number(q("extra_spend")) || 0), extraSpendFrom: monthOk(q("extra_spend_from")), extraIncome: Math.max(0, Number(q("extra_income")) || 0), extraIncomeFrom: monthOk(q("extra_income_from")) })];
    }
    if (parts[0] === "stats" && method === "GET") {
      const data = loadData();
      const today = localToday();
      const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(url.searchParams.get("month") || "") ? url.searchParams.get("month") : today.slice(0, 7);
      return [200, { matrix: M.statsMatrix(data, today, { months: Number(url.searchParams.get("months")) || 12, includeFinance: atLeast(user, "manager") }), team: M.teamMatrix(data, today, month), month }];
    }
    if (parts[0] === "report" && method === "GET") {
      if (!atLeast(user, "manager")) throw new HttpError(403, "Reports are for managers.");
      const month = url.searchParams.get("month") || localToday().slice(0, 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > localToday().slice(0, 7)) throw new HttpError(400, "Choose a month up to this one.");
      return [200, monthlyReport(month)];
    }
    if (parts[0] === "transactions" && parts[1] === "import" && method === "POST") {
      if (!atLeast(user, "manager")) throw new HttpError(403, "You don't have access to this.");
      const input = body();
      if (!Array.isArray(input.rows) || input.rows.length === 0) throw new HttpError(422, "There are no rows to import.");
      if (input.rows.length > 2000) throw new HttpError(422, "Import at most 2 000 rows at a time.");
      return [200, importTransactions(input.rows, user)];
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
        ...db.contracts.filter((c) => inRange(c.end_date)).map((c) => { const lead = byId("leads", c.lead_id) || {}; return { type: "renewal", id: c.id, title: `${lead.school} contract ends`, date: c.end_date, done: c.status !== "active", person_id: lead.owner_id ?? null }; }),
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

    if (HOSTED && parts[0] === "users") {
      if (method === "GET") return [200, sortBy(db.users, (a, b) => b.active - a.active, (a, b) => cmp(a.name, b.name)).map((u) => ({ id: u.id, name: u.name, email: null, role: u.role, job_title: u.job_title, active: u.active, created_at: u.created_at, display_name: u.display_name || null }))];
      if (method === "POST") throw new HttpError(403, "To add someone, share this page with them from claude.ai's Share menu.");
      const target = byId("users", parts[1]);
      if (!target) throw new HttpError(404, "Not found.");
      if (method === "PATCH") {
        const input = body();
        const self = target.id === user.id;
        if (!self && !atLeast(user, "admin")) throw new HttpError(403, "Only an admin can change other people's details.");
        const data = validate(self ? { display_name: { type: "text", max: 80 }, job_title: { type: "text", max: 120 } } : { job_title: { type: "text", max: 120 }, active: { type: "bool" } }, input, { partial: true });
        Object.assign(target, data);
        if (!self) logActivity(user.id, `{actor} updated ${target.name}'s details`);
        return [200, { ok: true }];
      }
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
      notify(row.requested_by, user, `${user.name} ${data.decision} your request “${row.title}”${data.note ? `: “${data.note}”` : ""}`, "approvals");
      return [200, { ok: true }];
    }

    if (parts[0] === "leads" && parts[2] === "notes") {
      const lead = byId("leads", parts[1]);
      if (!lead) throw new HttpError(404, "Not found.");
      if (method === "GET") return [200, sortBy(db.lead_notes.filter((n) => n.lead_id === lead.id), (a, b) => b.id - a.id).map((n) => ({ ...n, author_name: (byId("users", n.author_id) || {}).name || null }))];
      if (method === "POST") {
        const data = validate({ body: { type: "text", required: true, max: 5000 } }, body());
        insert("lead_notes", { lead_id: lead.id, body: data.body, author_id: user.id });
        notify(lead.owner_id, user, `${user.name} added a note on ${lead.school}`, `pipeline?lead=${lead.id}`);
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
        if (rawBody.size > MAX_UPLOAD) throw new HttpError(413, HOSTED ? "Files can be up to 5 MB here." : "In this online preview, files can be up to 2 MB. The real workspace takes up to 20 MB.");
        if (HOSTED) {
          const isPrivate = headers["x-private"] === "1";
          if (isPrivate && !atLeast(user, "manager")) throw new HttpError(403, "Only managers can upload private files here.");
          const pending = { title: meta.title, folder: meta.folder || "General", file_name: fileName, mime_type: DOC_TYPES[ext], size: rawBody.size, storage_key: `f${cloudId()}`, private: isPrivate ? 1 : 0, uploaded_by: user.id };
          pending.parts = await storeFile(pending, rawBody);
          const doc = insert("documents", pending);
          logActivity(user.id, `${user.name} uploaded “${doc.title}”`, doc.private ? "manager" : "all");
          return [201, { id: doc.id }];
        }
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
        if (HOSTED) for (let i = 0; i < (doc.parts || 0); i++) queued(() => cloud.db.doc(filePath(doc, i)).delete()).catch(() => {});
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
        if (resource.afterCreate) resource.afterCreate(row, user);
        logActivity(user.id, `${user.name} added ${resource.label(row)}`, resource.audience);
        return [201, row];
      }
      const row = byId(table, parts[1]);
      if (!row) throw new HttpError(404, "Not found.");
      if (table === "approvals" && !atLeast(user, "manager") && row.requested_by !== user.id) throw new HttpError(404, "Not found.");
      if (table === "goals" && !atLeast(user, "manager") && M.GOAL_METRICS[row.metric]?.finance) throw new HttpError(404, "Not found.");
      if (method === "GET") return [200, row];
      if (method === "PATCH") {
        if (!resource.canEdit(user, row)) throw new HttpError(403, "You can't change this.");
        let data = validate(resource.fields, body(), { partial: true });
        if (resource.beforeUpdate) data = resource.beforeUpdate(data, row, user);
        checkLinks(data);
        const before = { ...row };
        Object.assign(row, data);
        const extra = resource.afterUpdate ? resource.afterUpdate(row, before, user) : null;
        logActivity(user.id, `${user.name} updated ${resource.label(row)}`, resource.audience);
        return [200, extra ? { ...row, ...extra } : row];
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
    const method = (init.method || "GET").toUpperCase();
    try {
      if (HOSTED) {
        await cloud.ready;
        await resolveNames();
        cloud.busy++;
      }
      try {
        [status, payload] = await api(method, new URL(href, "https://preview.local"), headers, init.body);
      } finally {
        if (HOSTED) cloud.busy--;
      }
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
    if (HOSTED) {
      if (method !== "GET") cloudSync();
      flushPending();
    } else {
      persist();
      renderBar();
      await new Promise((r) => setTimeout(r, 40)); // a touch of latency so loading states behave as they do on a real network
    }
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
  async function cloudOpenDocument(id, inline) {
    const user = currentUser();
    const doc = user && byId("documents", id);
    if (!doc || !canSeeDoc(user, doc)) return;
    let url;
    try {
      url = await readFile(doc);
    } catch {
      return notice("That file couldn't be opened. Try again in a moment.");
    }
    const blob = dataUrlToBlob(url, doc.mime_type);
    if (inline && (/^image\//.test(doc.mime_type) || /^text\//.test(doc.mime_type))) {
      const body = document.createElement("div");
      body.className = "pv-body";
      if (/^image\//.test(doc.mime_type)) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = doc.title;
        img.className = "pv-img";
        body.append(img);
      } else {
        const pre = document.createElement("pre");
        pre.className = "pv-pre";
        pre.textContent = await blob.text();
        body.append(pre);
      }
      const save = document.createElement("button");
      save.type = "button";
      save.className = "pv-close";
      save.textContent = `Save ${doc.file_name}`;
      save.addEventListener("click", () => saveFile(doc.file_name, blob));
      body.append(save);
      return overlay(doc.title, body);
    }
    await saveFile(doc.file_name, blob);
  }
  async function cloudBackup() {
    const user = currentUser();
    if (!user || !atLeast(user, "admin")) return;
    const snapshot = { exported_at: nowIso(), company: getSetting("company_name", "Integral Academy"), settings: { ...db.settings }, budgets: db.budgets };
    for (const t of TABLES) snapshot[t] = db[t].map((r) => JSON.parse(serialize(t, r)));
    setSetting("last_backup_at", nowIso());
    logActivity(user.id, "{actor} downloaded a backup", "manager");
    cloudSync();
    await saveFile(`workspace-backup-${localToday()}.json`, JSON.stringify(snapshot, null, 1));
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[href^='/api/']");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href");
    const m = href.match(/^\/api\/documents\/(\d+)\/file/);
    if (HOSTED) {
      if (m) cloudOpenDocument(Number(m[1]), href.includes("inline=1"));
      else if (href.startsWith("/api/backup")) cloudBackup();
      return;
    }
    if (m) showDocument(Number(m[1]));
    else if (href.startsWith("/api/backup")) backupNotice();
  }, true);

  window.addEventListener("ws:preview-file", (e) => {
    if (HOSTED) return void saveFile(e.detail.name, e.detail.text);
    const body = document.createElement("div");
    body.className = "pv-body";
    body.append(para(`In the workspace on your computer, this saves ${e.detail.name}. Online previews can't save files, so here is what it contains:`));
    const pre = document.createElement("pre");
    pre.className = "pv-pre";
    pre.textContent = e.detail.text.split("\n").slice(0, 40).join("\n") + (e.detail.text.split("\n").length > 40 ? "\n…" : "");
    body.append(pre);
    overlay(e.detail.name, body);
  });

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

  if (HOSTED) {
    db = emptyDb();
    cloud.ready = startCloud();
  } else {
    if (!load()) seed();
    else checkRenewals();
    persist();
    if (document.body) mountBar();
    else document.addEventListener("DOMContentLoaded", mountBar);
  }
})();
