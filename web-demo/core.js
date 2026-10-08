/* Integral Academy Executive Workspace — interactive web demo core.
 * Runs entirely in the browser on a snapshot of the demo data. Modules register
 * routes with IA.route(); the shell (app.js) renders navigation and the active view.
 * Globals provided by the page: React, ReactDOM, htm, IA_ASSETS, IALib. */
(function () {
  "use strict";
  const { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext, Fragment } = React;
  const html = htm.bind(React.createElement);
  const L = IALib;

  // ─────────────────────────── Formatting ───────────────────────────
  const toDate = (v) => (v instanceof Date ? v : v ? new Date(v) : null);
  const fmt = {
    zar: (v, opts) => L.format.formatZAR(Number(v ?? 0), opts),
    zarCompact: (v) => L.format.formatZAR(Number(v ?? 0), { compact: true }),
    number: (v, opts) => L.format.formatNumber(v === null || v === undefined ? null : Number(v), opts),
    percent: (v, digits) => L.format.formatPercent(v === null || v === undefined ? null : Number(v), digits),
    delta: (v) => L.format.formatDelta(v),
    date: (v) => L.format.formatDate(toDate(v)),
    shortDate: (v) => L.format.formatShortDate(toDate(v)),
    dateTime: (v) => L.format.formatDateTime(toDate(v)),
    time: (v) => L.format.formatTime(toDate(v)),
    month: (v) => L.format.formatMonth(toDate(v)),
    weekday: (v) => L.format.formatWeekday(toDate(v)),
    relative: (v) => L.format.formatRelative(toDate(v)),
    bytes: (v) => L.format.formatBytes(Number(v ?? 0)),
    hours: (v) => L.format.formatHours(Number(v ?? 0)),
    /** Chart / table value formats used across modules. */
    value: (v, format) => {
      if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
      const n = Number(v);
      if (format === "zar") return L.format.formatZAR(n, { compact: Math.abs(n) >= 1_000_000 });
      if (format === "zarCompact") return L.format.formatZAR(n, { compact: true });
      if (format === "percent") return L.format.formatPercent(n);
      if (format === "hours") return `${L.format.formatNumber(n, { decimals: Number.isInteger(n) ? undefined : 1 })}h`;
      return L.format.formatNumber(n, { decimals: Number.isInteger(n) ? undefined : 1 });
    },
  };
  const labels = L.labels;

  // ─────────────────────────── Data & persistence ───────────────────────────
  const STORAGE_KEY = "ia-web-demo-v1";
  const PERSONAS = ["sipho", "ayesha", "johan", "nomvula", "pieter", "kagiso", "tshepo", "bongani"];
  function loadSaved() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function save(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* Storage can be unavailable (private windows, previews); the demo still works in memory. */
    }
  }
  /** Changes made in the demo, layered over the snapshot. */
  const EMPTY_OVERLAY = {
    persona: "sipho",
    patches: {}, // { collection: { id: { ...fields } } }
    created: {}, // { collection: [records] }
    deleted: {}, // { collection: { id: true } }
    read: {}, // notification id → true
    log: [], // demo audit entries: { at, actorId, summary, module }
  };

  const AppContext = createContext(null);

  /** Builds the app state hook; used once by app.js. */
  function useAppState(data) {
    const [overlay, setOverlay] = useState(() => ({ ...EMPTY_OVERLAY, ...(loadSaved() || {}) }));
    const [toasts, setToasts] = useState([]);
    const [route, setRoute] = useState(() => parseHash());
    useEffect(() => save(overlay), [overlay]);
    useEffect(() => {
      const onHash = () => setRoute(parseHash());
      window.addEventListener("hashchange", onHash);
      return () => window.removeEventListener("hashchange", onHash);
    }, []);

    const personaKey = PERSONAS.includes(overlay.persona) ? overlay.persona : "sipho";
    const persona = data.personas[personaKey];
    const permissions = useMemo(() => new Set(persona.permissions), [persona]);
    const usersById = useMemo(() => new Map(data.users.map((u) => [u.id, u])), [data]);
    const user = usersById.get(persona.userId);

    const toast = useCallback((message, tone = "success") => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t, { id, message, tone }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
    }, []);

    const update = useCallback((fn) => setOverlay((o) => fn(structuredClone(o)) ?? o), []);

    const app = useMemo(() => {
      const can = (perm) => permissions.has(perm);
      const canAny = (perms) => !perms || perms.length === 0 || perms.some((p) => permissions.has(p));
      /** Snapshot collection merged with demo changes (patches, created, deleted). */
      const collection = (name, base) => {
        const rows = base ?? data[name] ?? [];
        const patches = overlay.patches[name] || {};
        const deleted = overlay.deleted[name] || {};
        const merged = rows.filter((r) => !deleted[r.id]).map((r) => (patches[r.id] ? { ...r, ...patches[r.id] } : r));
        const created = (overlay.created[name] || []).filter((r) => !deleted[r.id]).map((r) => (patches[r.id] ? { ...r, ...patches[r.id] } : r));
        return [...created, ...merged];
      };
      /** Records of a row-level collection the persona may see (snapshot visibility + their own creations). */
      const visible = (name) => {
        const ids = new Set(persona.visible[name] || []);
        const mine = new Set((overlay.created[name] || []).map((r) => r.id));
        return collection(name).filter((r) => ids.has(r.id) || mine.has(r.id));
      };
      const patch = (name, id, fields, logSummary, module) =>
        update((o) => {
          o.patches[name] = o.patches[name] || {};
          o.patches[name][id] = { ...(o.patches[name][id] || {}), ...fields, updatedAt: new Date().toISOString() };
          if (logSummary) o.log.unshift({ at: new Date().toISOString(), actorId: user.id, summary: logSummary, module: module || name });
          return o;
        });
      const create = (name, record, logSummary, module) =>
        update((o) => {
          o.created[name] = [{ ...record, id: record.id || `web_${name}_${Date.now().toString(36)}`, createdAt: new Date().toISOString() }, ...(o.created[name] || [])];
          if (logSummary) o.log.unshift({ at: new Date().toISOString(), actorId: user.id, summary: logSummary, module: module || name });
          return o;
        });
      const remove = (name, id, logSummary, module) =>
        update((o) => {
          o.deleted[name] = { ...(o.deleted[name] || {}), [id]: true };
          if (logSummary) o.log.unshift({ at: new Date().toISOString(), actorId: user.id, summary: logSummary, module: module || name });
          return o;
        });
      const notifications = data.notifications
        .filter((n) => n.userId === user.id)
        .map((n) => (overlay.read[n.id] ? { ...n, readAt: n.readAt || new Date().toISOString() } : n));
      return {
        data,
        overlay,
        personaKey,
        persona,
        user,
        usersById,
        userName: (id) => (id ? usersById.get(id)?.name ?? "—" : "—"),
        can,
        canAny,
        collection,
        visible,
        patch,
        create,
        remove,
        notifications,
        unread: notifications.filter((n) => !n.readAt).length,
        markRead: (ids) =>
          update((o) => {
            for (const id of ids) o.read[id] = true;
            return o;
          }),
        setPersona: (key) =>
          update((o) => {
            o.persona = key;
            return o;
          }),
        reset: () => {
          setOverlay({ ...EMPTY_OVERLAY, persona: personaKey });
          toast("Demo reset to the original data");
        },
        route,
        navigate: (path) => {
          window.location.hash = path.startsWith("#") ? path : `#${path}`;
        },
        toast,
        /** Dashboard data for the persona and range (computed by the real services at export). */
        dashboard: (range) => persona.dashboards[range] || persona.dashboards["12m"],
      };
    }, [data, overlay, persona, permissions, personaKey, route, toast, update, user, usersById]);
    return { app, toasts };
  }

  const useApp = () => useContext(AppContext);

  // ─────────────────────────── Routing ───────────────────────────
  /** Routes look like #/finance/cash-flow?tab=x. Params come after "?". */
  function parseHash() {
    const raw = decodeURIComponent((window.location.hash || "").replace(/^#/, "")) || "/dashboard";
    const [pathPart, queryPart = ""] = raw.split("?");
    const path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
    const params = Object.fromEntries(new URLSearchParams(queryPart));
    return { path: path.replace(/\/+$/, "") || "/dashboard", params, segments: path.split("/").filter(Boolean) };
  }
  const routes = [];
  /** Registers a view. `path` may contain ":param" segments. `anyOf` lists permissions (any one grants access). */
  function route(path, def) {
    const parts = path.split("/").filter(Boolean);
    routes.push({ path, parts, ...def });
  }
  function matchRoute(current) {
    for (const r of routes) {
      if (r.parts.length !== current.segments.length) continue;
      const params = {};
      let ok = true;
      r.parts.forEach((p, i) => {
        if (p.startsWith(":")) params[p.slice(1)] = current.segments[i];
        else if (p !== current.segments[i]) ok = false;
      });
      if (ok) return { route: r, params: { ...current.params, ...params } };
    }
    return null;
  }
  const hrefWith = (path, params) => {
    const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ""));
    const s = q.toString();
    return `#${path}${s ? `?${s}` : ""}`;
  };

  // ─────────────────────────── Navigation config (mirrors the app) ───────────────────────────
  const NAV = [
    { label: "Overview", items: [
      { path: "/dashboard", label: "Executive Dashboard", icon: "layout-dashboard", anyOf: [] },
      { path: "/intelligence", label: "Business Intelligence", icon: "chart-column", anyOf: ["intelligence.read"] },
      { path: "/tasks", label: "Tasks", icon: "list-checks", anyOf: [], badge: "tasks" },
    ] },
    { label: "Operations", items: [
      { path: "/finance", label: "Finance", icon: "wallet", anyOf: ["finance.read"] },
      { path: "/schools", label: "Schools & Partnerships", icon: "school", anyOf: ["schools.read"] },
      { path: "/marketing", label: "Marketing", icon: "megaphone", anyOf: ["marketing.read", "marketing.read.assigned"] },
      { path: "/academic", label: "Academic", icon: "graduation-cap", anyOf: ["academic.read", "academic.read.assigned"] },
      { path: "/technology", label: "Product & Technology", icon: "cpu", anyOf: ["technology.read", "technology.read.assigned", "technology.bugs.report"] },
      { path: "/team", label: "Team", icon: "users", anyOf: ["team.read"] },
    ] },
    { label: "Workspace", items: [
      { path: "/documents", label: "Documents", icon: "folder-open", anyOf: ["documents.read"] },
      { path: "/calendar", label: "Calendar", icon: "calendar-days", anyOf: ["calendar.read"] },
      { path: "/approvals", label: "Approvals", icon: "circle-check", anyOf: [], badge: "approvals" },
      { path: "/meetings", label: "Meetings", icon: "notebook-pen", anyOf: [] },
      { path: "/strategy", label: "Strategy", icon: "target", anyOf: ["strategy.read"] },
    ] },
    { label: "Administration", items: [
      { path: "/admin", label: "Administration", icon: "settings", anyOf: ["admin.users", "admin.roles", "audit.read", "announcements.write"] },
    ] },
  ];

  // ─────────────────────────── UI primitives ───────────────────────────
  const cx = (...parts) => parts.filter(Boolean).join(" ");

  function Icon({ name, size = 16, className, style, title }) {
    const node = IA_ASSETS.icons[name] || IA_ASSETS.icons["circle-dot"];
    return html`<svg class=${className} style=${style} width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden=${title ? undefined : "true"} role=${title ? "img" : undefined}>
      ${title && html`<title>${title}</title>`}
      ${node.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
    </svg>`;
  }

  const TONES = {
    neutral: ["var(--muted)", "var(--muted-fg)"],
    primary: ["var(--primary-soft)", "var(--primary-soft-fg)"],
    gold: ["var(--gold-soft)", "var(--gold-fg)"],
    success: ["var(--success-soft)", "var(--success)"],
    warning: ["var(--warning-soft)", "var(--warning)"],
    danger: ["var(--danger-soft)", "var(--danger)"],
    info: ["var(--info-soft)", "var(--info)"],
    violet: ["var(--violet-soft)", "var(--violet)"],
    outline: ["transparent", "var(--muted-fg)"],
  };
  function Badge({ tone = "neutral", children, dot, title }) {
    const [bg, fg] = TONES[tone] || TONES.neutral;
    return html`<span title=${title} style=${{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", borderRadius: 6, padding: "1px 8px", fontSize: 12, fontWeight: 500, lineHeight: "20px", background: bg, color: fg, border: tone === "outline" ? "1px solid var(--border)" : "none" }}>
      ${dot && html`<span aria-hidden="true" style=${{ width: 6, height: 6, borderRadius: 99, background: "currentColor", opacity: 0.8 }} />`}${children}
    </span>`;
  }
  /** Badge for an enum value using the app's labels (e.g. meta = IA.labels.TASK_STATUS). */
  function StatusBadge({ meta, value }) {
    const entry = meta && meta[value];
    if (!entry) return html`<${Badge}>${value ?? "—"}<//>`;
    return html`<${Badge} tone=${entry.tone} dot>${entry.label}<//>`;
  }

  const BUTTON_STYLES = {
    primary: { background: "var(--primary)", color: "var(--primary-fg)", border: "1px solid transparent" },
    outline: { background: "var(--card)", color: "var(--fg)", border: "1px solid var(--border)" },
    ghost: { background: "transparent", color: "var(--fg)", border: "1px solid transparent" },
    danger: { background: "var(--danger)", color: "#fff", border: "1px solid transparent" },
    soft: { background: "var(--primary-soft)", color: "var(--primary-soft-fg)", border: "1px solid transparent" },
  };
  function Button({ variant = "outline", size = "md", icon, children, onClick, disabled, title, type = "button", style, ariaLabel, className }) {
    const h = size === "sm" ? 30 : size === "lg" ? 40 : 36;
    return html`<button class=${className} type=${type} title=${title} aria-label=${ariaLabel} disabled=${disabled} onClick=${onClick} style=${{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, height: h, padding: children ? (size === "sm" ? "0 10px" : "0 14px") : 0, width: children ? undefined : h, borderRadius: 8, fontSize: size === "sm" ? 12.5 : 13.5, fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap", ...BUTTON_STYLES[variant], ...style }}>
      ${icon && html`<${Icon} name=${icon} size=${size === "sm" ? 14 : 16} />`}${children}
    </button>`;
  }

  function Card({ children, style, className }) {
    return html`<div class=${className} style=${{ minWidth: 0, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow)", ...style }}>${children}</div>`;
  }
  function Section({ title, description, actions, children, flush, style }) {
    return html`<${Card} style=${{ display: "flex", flexDirection: "column", ...style }}>
      <div style=${{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "18px 20px 12px" }}>
        <div style=${{ minWidth: 0 }}>
          <h3 style=${{ margin: 0, fontSize: 15, fontWeight: 600 }}>${title}</h3>
          ${description && html`<p style=${{ margin: "2px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>${description}</p>`}
        </div>
        ${actions && html`<div style=${{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>${actions}</div>`}
      </div>
      <div style=${{ padding: flush ? 0 : "0 20px 20px", flex: 1, minWidth: 0 }}>${children}</div>
    <//>`;
  }
  function PageHeader({ title, description, actions, meta, breadcrumbs }) {
    return html`<header style=${{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
      <div style=${{ minWidth: 0, flex: "1 1 320px" }}>
        ${breadcrumbs && html`<nav aria-label="Breadcrumb" style=${{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 12.5, color: "var(--muted-fg)", marginBottom: 6 }}>
          ${breadcrumbs.map((b, i) => html`<${Fragment} key=${i}>${i > 0 && html`<span aria-hidden="true">›</span>`}${b.href ? html`<a href=${b.href} style=${{ textDecoration: "none" }}>${b.label}</a>` : html`<span>${b.label}</span>`}<//>`)}
        </nav>`}
        <h1 style=${{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em", textWrap: "balance" }}>${title}</h1>
        ${description && html`<p style=${{ margin: "4px 0 0", color: "var(--muted-fg)", maxWidth: 760 }}>${description}</p>`}
        ${meta && html`<div style=${{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 10 }}>${meta}</div>`}
      </div>
      ${actions && html`<div style=${{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>${actions}</div>`}
    </header>`;
  }
  /** KPI tile. `delta` is a % change; `goodWhen` says which direction is good. */
  function Kpi({ label, value, delta, goodWhen = "up", sub, icon, href }) {
    const hasDelta = delta !== null && delta !== undefined && Number.isFinite(Number(delta));
    const up = Number(delta) > 0, flat = Number(delta) === 0;
    const good = flat ? null : goodWhen === "up" ? up : !up;
    const body = html`<div style=${{ padding: 18, display: "grid", gap: 6 }}>
      <div style=${{ display: "flex", justifyContent: "space-between", gap: 8, color: "var(--muted-fg)", fontSize: 13 }}>
        <span>${label}</span>${icon && html`<span style=${{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 99, background: "var(--primary-soft)", color: "var(--primary-soft-fg)" }}><${Icon} name=${icon} size=${15} /></span>`}
      </div>
      <div style=${{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <span class="tabular" style=${{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em" }}>${value}</span>
        ${hasDelta && html`<${Badge} tone=${good === null ? "neutral" : good ? "success" : "danger"}><${Icon} name=${flat ? "circle-dot" : up ? "arrow-up-right" : "arrow-down-right"} size=${12} />${fmt.delta(delta)}<//>`}
      </div>
      ${sub && html`<div style=${{ fontSize: 12, color: "var(--muted-fg)" }}>${sub}</div>`}
    </div>`;
    return html`<${Card}>${href ? html`<a href=${href} style=${{ textDecoration: "none", display: "block" }}>${body}</a>` : body}<//>`;
  }
  function Grid({ min = 260, gap = 16, children, style }) {
    return html`<div style=${{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`, gap, ...style }}>${children}</div>`;
  }
  /** Tabs bound to a value. `items`: [{ id, label, count }]. */
  function Tabs({ items, value, onChange, style }) {
    return html`<div role="tablist" style=${{ display: "flex", gap: 4, overflowX: "auto", padding: 2, marginBottom: 16, ...style }}>
      ${items.map((t) => html`<button key=${t.id} role="tab" aria-selected=${value === t.id} onClick=${() => onChange(t.id)} style=${{ flexShrink: 0, height: 32, padding: "0 12px", borderRadius: 8, border: value === t.id ? "1px solid var(--border)" : "1px solid transparent", background: value === t.id ? "var(--card)" : "transparent", color: value === t.id ? "var(--fg)" : "var(--muted-fg)", fontWeight: 500, fontSize: 13, cursor: "pointer", boxShadow: value === t.id ? "var(--shadow)" : "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
        ${t.label}${t.count !== undefined && html`<span class="tabular" style=${{ fontSize: 11, padding: "0 6px", borderRadius: 99, background: value === t.id ? "var(--primary-soft)" : "var(--muted)", color: value === t.id ? "var(--primary-soft-fg)" : "var(--muted-fg)", lineHeight: "18px" }}>${t.count}</span>`}
      </button>`)}
    </div>`;
  }
  /** Sub-navigation between module pages (links). `items`: [{ path, label }]. */
  function SubNav({ items }) {
    const { route: r } = useApp();
    return html`<nav aria-label="Section" style=${{ display: "flex", gap: 4, overflowX: "auto", borderBottom: "1px solid var(--border)", marginBottom: 22 }}>
      ${items.map((it) => {
        const active = r.path === it.path;
        return html`<a key=${it.path} href=${`#${it.path}`} aria-current=${active ? "page" : undefined} style=${{ flexShrink: 0, padding: "10px 12px", fontSize: 13.5, fontWeight: 500, textDecoration: "none", color: active ? "var(--fg)" : "var(--muted-fg)", borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent", marginBottom: -1 }}>${it.label}</a>`;
      })}
    </nav>`;
  }
  function EmptyState({ icon = "inbox", title, description, action }) {
    return html`<div style=${{ display: "grid", justifyItems: "center", gap: 8, textAlign: "center", padding: "40px 20px", color: "var(--muted-fg)" }}>
      <span style=${{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: 99, background: "var(--muted)" }}><${Icon} name=${icon} size=${20} /></span>
      <strong style=${{ color: "var(--fg)", fontWeight: 600 }}>${title}</strong>
      ${description && html`<span style=${{ maxWidth: 420, fontSize: 13 }}>${description}</span>`}${action}
    </div>`;
  }
  function Progress({ value, tone = "primary", label }) {
    const color = tone === "danger" ? "var(--danger)" : tone === "warning" ? "var(--warning)" : tone === "success" ? "var(--success)" : tone === "gold" ? "var(--gold)" : "var(--primary)";
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    return html`<div role="progressbar" aria-label=${label} aria-valuenow=${Math.round(v)} aria-valuemin="0" aria-valuemax="100" style=${{ height: 8, borderRadius: 99, background: "var(--muted)", overflow: "hidden", flex: 1 }}>
      <div style=${{ width: `${v}%`, height: "100%", borderRadius: 99, background: color }} />
    </div>`;
  }
  const AVATAR_TONES = ["#1f4f8f", "#8a6420", "#0e7c66", "#b4540f", "#8e3a6b", "#4a5a9c"];
  function Avatar({ name = "?", size = 28 }) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
    return html`<span title=${name} style=${{ display: "inline-grid", placeItems: "center", width: size, height: size, borderRadius: 99, background: AVATAR_TONES[h % AVATAR_TONES.length], color: "#fff", fontSize: size * 0.38, fontWeight: 600, flexShrink: 0 }}>${initials}</span>`;
  }
  function UserChip({ id, name, subtitle }) {
    const app = useApp();
    const n = name ?? app.userName(id);
    if (!n || n === "—") return html`<span style=${{ color: "var(--muted-fg)" }}>—</span>`;
    return html`<span style=${{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}><${Avatar} name=${n} size=${24} /><span style=${{ minWidth: 0 }}><span style=${{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>${n}</span>${subtitle && html`<span style=${{ display: "block", fontSize: 11.5, color: "var(--muted-fg)" }}>${subtitle}</span>`}</span></span>`;
  }
  function DueDate({ date, done }) {
    if (!date) return html`<span style=${{ color: "var(--muted-fg)" }}>—</span>`;
    const d = toDate(date);
    const days = (d.getTime() - Date.now()) / 86400000;
    const overdue = !done && days < 0, soon = !done && !overdue && days <= 3;
    return html`<span style=${{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", color: overdue ? "var(--danger)" : soon ? "var(--warning)" : "var(--muted-fg)" }}>${(overdue || soon) && html`<${Icon} name=${overdue ? "triangle-alert" : "clock"} size=${13} />`}${fmt.date(d)}</span>`;
  }

  // ── Form controls ──
  const inputStyle = { width: "100%", height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid var(--input)", background: "var(--card)", color: "var(--fg)", fontSize: 13.5 };
  function Field({ label, children, hint, id }) {
    return html`<label for=${id} style=${{ display: "grid", gap: 6, fontSize: 13, fontWeight: 500 }}>${label}${children}${hint && html`<span style=${{ fontWeight: 400, fontSize: 12, color: "var(--muted-fg)" }}>${hint}</span>`}</label>`;
  }
  function TextInput({ id, value, onChange, placeholder, type = "text", ...rest }) {
    return html`<input id=${id} type=${type} value=${value ?? ""} placeholder=${placeholder} onInput=${(e) => onChange(e.target.value)} style=${inputStyle} ...${rest} />`;
  }
  function TextArea({ id, value, onChange, rows = 3, placeholder }) {
    return html`<textarea id=${id} rows=${rows} value=${value ?? ""} placeholder=${placeholder} onInput=${(e) => onChange(e.target.value)} style=${{ ...inputStyle, height: "auto", padding: "8px 10px", resize: "vertical" }} />`;
  }
  /** Select. `options`: [{ value, label }] or a labels meta object (IA.labels.X). */
  function Select({ id, value, onChange, options, placeholder, style, ariaLabel }) {
    const opts = Array.isArray(options) ? options : Object.entries(options || {}).map(([v, m]) => ({ value: v, label: m.label }));
    return html`<select id=${id} aria-label=${ariaLabel} value=${value ?? ""} onChange=${(e) => onChange(e.target.value)} style=${{ ...inputStyle, width: "auto", minWidth: 140, paddingRight: 28, ...style }}>
      ${placeholder !== undefined && html`<option value="">${placeholder}</option>`}
      ${opts.map((o) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}
    </select>`;
  }
  function SearchInput({ value, onChange, placeholder = "Search…" }) {
    return html`<div style=${{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
      <span style=${{ position: "absolute", left: 10, top: 10, color: "var(--muted-fg)" }}><${Icon} name="search" size=${15} /></span>
      <input type="search" aria-label=${placeholder} value=${value} placeholder=${placeholder} onInput=${(e) => onChange(e.target.value)} style=${{ ...inputStyle, paddingLeft: 32 }} />
    </div>`;
  }
  function Toolbar({ children }) {
    return html`<div style=${{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>${children}</div>`;
  }

  // ── Modal ──
  function Modal({ open, onClose, title, description, children, footer, width = 560 }) {
    useEffect(() => {
      if (!open) return undefined;
      const onKey = (e) => e.key === "Escape" && onClose();
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);
    if (!open) return null;
    return html`<div role="dialog" aria-modal="true" aria-label=${title} onClick=${(e) => e.target === e.currentTarget && onClose()} style=${{ position: "fixed", inset: 0, zIndex: 80, background: "rgb(0 0 0 / .5)", display: "grid", placeItems: "center", padding: 16 }}>
      <div style=${{ width: "100%", maxWidth: width, maxHeight: "calc(100vh - 32px)", overflow: "auto", background: "var(--card)", color: "var(--fg)", borderRadius: 16, border: "1px solid var(--border)", boxShadow: "0 20px 60px rgb(0 0 0 / .35)" }}>
        <div style=${{ display: "flex", justifyContent: "space-between", gap: 12, padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          <div><h2 style=${{ margin: 0, fontSize: 16 }}>${title}</h2>${description && html`<p style=${{ margin: "2px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>${description}</p>`}</div>
          <${Button} variant="ghost" icon="x" ariaLabel="Close" onClick=${onClose} />
        </div>
        <div style=${{ padding: 20, display: "grid", gap: 14 }}>${children}</div>
        ${footer && html`<div style=${{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>${footer}</div>`}
      </div>
    </div>`;
  }

  // ── Table with search, sort and pagination ──
  /**
   * columns: [{ key, header, render(row), sort(row) → comparable, align, hideOnMobile, width }]
   * rows: array with id. search: (row, q) → boolean. Pass `toolbar` for filters beside the search box.
   */
  function Table({ columns, rows, search, searchPlaceholder, toolbar, pageSize = 15, empty, initialSort, rowStyle, onRowClick }) {
    const [q, setQ] = useState("");
    const [sort, setSort] = useState(initialSort || null);
    const [page, setPage] = useState(0);
    const filtered = useMemo(() => {
      let out = rows;
      if (q && search) out = out.filter((r) => search(r, q.toLowerCase()));
      if (sort) {
        const col = columns.find((c) => c.key === sort.key);
        if (col && col.sort) {
          out = [...out].sort((a, b) => {
            const va = col.sort(a), vb = col.sort(b);
            if (va === vb) return 0;
            if (va === null || va === undefined) return 1;
            if (vb === null || vb === undefined) return -1;
            return (va > vb ? 1 : -1) * (sort.dir === "asc" ? 1 : -1);
          });
        }
      }
      return out;
    }, [rows, q, sort, columns, search]);
    useEffect(() => setPage(0), [q, rows.length]);
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const shown = filtered.slice(page * pageSize, page * pageSize + pageSize);
    const narrow = useNarrow();
    const cols = columns.filter((c) => !(narrow && c.hideOnMobile));
    return html`<div>
      ${(search || toolbar) && html`<${Toolbar}>${search && html`<${SearchInput} value=${q} onChange=${setQ} placeholder=${searchPlaceholder} />`}${toolbar}<//>`}
      <div style=${{ overflowX: "auto" }}>
        <table style=${{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead><tr>${cols.map((c) => html`<th key=${c.key} scope="col" style=${{ textAlign: c.align || "left", padding: "10px 16px", fontSize: 12, fontWeight: 500, color: "var(--muted-fg)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", width: c.width }}>
            ${c.sort ? html`<button onClick=${() => setSort((s) => ({ key: c.key, dir: s && s.key === c.key && s.dir === "desc" ? "asc" : "desc" }))} style=${{ background: "none", border: 0, padding: 0, cursor: "pointer", color: sort && sort.key === c.key ? "var(--fg)" : "inherit", font: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>${c.header}<span aria-hidden="true" style=${{ opacity: sort && sort.key === c.key ? 1 : 0.35 }}>${sort && sort.key === c.key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span></button>` : c.header}
          </th>`)}</tr></thead>
          <tbody>
            ${shown.length === 0 && html`<tr><td colSpan=${cols.length}>${empty || html`<${EmptyState} title="Nothing to show" description=${q ? "No rows match your search." : "No records yet."} />`}</td></tr>`}
            ${shown.map((r) => html`<tr key=${r.id} onClick=${onRowClick ? () => onRowClick(r) : undefined} style=${{ borderBottom: "1px solid var(--border)", cursor: onRowClick ? "pointer" : undefined, ...(rowStyle ? rowStyle(r) : {}) }}>
              ${cols.map((c) => html`<td key=${c.key} style=${{ padding: "10px 16px", textAlign: c.align || "left", verticalAlign: "middle" }}>${c.render ? c.render(r) : r[c.key]}</td>`)}
            </tr>`)}
          </tbody>
        </table>
      </div>
      ${filtered.length > pageSize && html`<div style=${{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 16px", fontSize: 12.5, color: "var(--muted-fg)" }}>
        <span class="tabular">Showing ${page * pageSize + 1}–${Math.min(filtered.length, (page + 1) * pageSize)} of ${filtered.length}</span>
        <span style=${{ display: "flex", gap: 6 }}>
          <${Button} size="sm" icon="chevron-left" ariaLabel="Previous page" disabled=${page === 0} onClick=${() => setPage((p) => p - 1)} />
          <${Button} size="sm" icon="chevron-right" ariaLabel="Next page" disabled=${page >= pages - 1} onClick=${() => setPage((p) => p + 1)} />
        </span>
      </div>`}
    </div>`;
  }
  function useNarrow(bp = 768) {
    const [narrow, setNarrow] = useState(() => window.innerWidth < bp);
    useEffect(() => {
      const on = () => setNarrow(window.innerWidth < bp);
      window.addEventListener("resize", on);
      return () => window.removeEventListener("resize", on);
    }, [bp]);
    return narrow;
  }

  // ─────────────────────────── Charts (validated palette, one axis, legend for 2+ series) ───────────────────────────
  const SLOT = (s) => `var(--chart-${s})`;
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function Legend({ series }) {
    if (series.length < 2) return null;
    return html`<ul style=${{ display: "flex", flexWrap: "wrap", gap: "4px 16px", listStyle: "none", margin: "0 0 8px", padding: 0, fontSize: 12, color: "var(--muted-fg)" }}>
      ${series.map((s) => html`<li key=${s.key} style=${{ display: "inline-flex", alignItems: "center", gap: 6 }}><span aria-hidden="true" style=${{ width: s.type === "line" ? 14 : 10, height: s.type === "line" ? 2 : 10, borderRadius: 3, background: SLOT(s.slot) }} />${s.label}</li>`)}
    </ul>`;
  }
  /**
   * Time-series / category chart. data: [{ label, [key]: number }]. series: [{ key, label, slot 1–6, type: "bar"|"line"|"area", stack? }].
   * format: "number" | "zar" | "zarCompact" | "percent" | "hours".
   */
  function Chart({ data, series, format = "number", height = 240 }) {
    const ref = useRef(null);
    const [w, setW] = useState(600);
    const [hover, setHover] = useState(null);
    useEffect(() => {
      if (!ref.current) return undefined;
      const ro = new ResizeObserver((e) => setW(Math.max(260, e[0].contentRect.width)));
      ro.observe(ref.current);
      return () => ro.disconnect();
    }, []);
    const stacked = series.some((s) => s.stack);
    const values = data.map((d) => (stacked ? series.filter((s) => s.type === "bar").reduce((sum, s) => sum + (Number(d[s.key]) || 0), 0) : Math.max(...series.map((s) => Number(d[s.key]) || 0))));
    const lineMax = Math.max(0, ...data.flatMap((d) => series.filter((s) => s.type !== "bar").map((s) => Number(d[s.key]) || 0)));
    const minVal = Math.min(0, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
    const max = niceMax(Math.max(...values, lineMax, 0));
    const min = minVal < 0 ? -niceMax(-minVal) : 0;
    const padL = 56, padR = 12, padT = 8, padB = 26;
    const iw = w - padL - padR, ih = height - padT - padB;
    const n = data.length || 1;
    const band = iw / n;
    const y = (v) => padT + ih - ((v - min) / (max - min || 1)) * ih;
    const x = (i) => padL + band * i + band / 2;
    const bars = series.filter((s) => s.type === "bar");
    const lines = series.filter((s) => s.type !== "bar");
    const groupW = Math.min(band * 0.7, stacked ? 24 : 24 * bars.length + 2 * (bars.length - 1));
    const barW = stacked ? groupW : Math.min(24, (groupW - 2 * (bars.length - 1)) / Math.max(1, bars.length));
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + (max - min) * t);
    const labelEvery = Math.ceil(n / Math.max(2, Math.floor(iw / 64)));
    const tickFmt = (v) => fmt.value(v, format === "zar" ? "zarCompact" : format);
    const roundTop = (x0, y0, bw, bh) => {
      const r = Math.min(4, bw / 2, Math.abs(bh));
      if (bh <= 0) return "";
      return `M${x0},${y0 + bh} L${x0},${y0 + r} Q${x0},${y0} ${x0 + r},${y0} L${x0 + bw - r},${y0} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} L${x0 + bw},${y0 + bh} Z`;
    };
    return html`<div ref=${ref} style=${{ position: "relative", width: "100%" }}>
      <${Legend} series=${series} />
      <svg width=${w} height=${height} role="img" aria-label=${series.map((s) => s.label).join(", ")} onMouseLeave=${() => setHover(null)} style=${{ display: "block", maxWidth: "100%" }}>
        ${ticks.map((t, i) => html`<g key=${i}><line x1=${padL} x2=${w - padR} y1=${y(t)} y2=${y(t)} stroke=${t === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} stroke-width="1" /><text x=${padL - 8} y=${y(t) + 4} text-anchor="end" font-size="11" fill="var(--chart-muted)">${tickFmt(t)}</text></g>`)}
        ${data.map((d, i) => {
          let acc = 0;
          return html`<g key=${i}>
            ${hover === i && html`<rect x=${padL + band * i} y=${padT} width=${band} height=${ih} fill="var(--accent)" opacity="0.5" />`}
            ${bars.map((s, j) => {
              const v = Number(d[s.key]) || 0;
              if (stacked) {
                const y0 = y(acc + v), bh = y(acc) - y0;
                acc += v;
                return html`<path key=${s.key} d=${roundTop(x(i) - barW / 2, y0 + (j > 0 ? 1 : 0), barW, Math.max(0, bh - (j > 0 ? 1 : 0)))} fill=${SLOT(s.slot)} />`;
              }
              const bx = x(i) - groupW / 2 + j * (barW + 2);
              return v >= 0 ? html`<path key=${s.key} d=${roundTop(bx, y(v), barW, y(0) - y(v))} fill=${SLOT(s.slot)} />` : html`<rect key=${s.key} x=${bx} y=${y(0)} width=${barW} height=${y(v) - y(0)} fill=${SLOT(s.slot)} />`;
            })}
            ${i % labelEvery === 0 && html`<text x=${x(i)} y=${height - 8} text-anchor="middle" font-size="11" fill="var(--chart-muted)">${d.label}</text>`}
            <rect x=${padL + band * i} y=${padT} width=${band} height=${ih} fill="transparent" onMouseEnter=${() => setHover(i)} onTouchStart=${() => setHover(i)} />
          </g>`;
        })}
        ${lines.map((s) => {
          const pts = data.map((d, i) => [x(i), y(Number(d[s.key]) || 0)]);
          const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
          return html`<g key=${s.key} style=${{ pointerEvents: "none" }}>
            ${s.type === "area" && html`<path d=${`${path} L${pts[pts.length - 1][0]},${y(Math.max(0, min))} L${pts[0][0]},${y(Math.max(0, min))} Z`} fill=${SLOT(s.slot)} opacity="0.14" />`}
            <path d=${path} fill="none" stroke=${SLOT(s.slot)} stroke-width="2" stroke-linejoin="round" />
            ${hover !== null && pts[hover] && html`<circle cx=${pts[hover][0]} cy=${pts[hover][1]} r="4" fill=${SLOT(s.slot)} stroke="var(--card)" stroke-width="2" />`}
          </g>`;
        })}
      </svg>
      ${hover !== null && data[hover] && html`<div role="tooltip" style=${{ position: "absolute", top: 28, left: Math.min(Math.max(0, x(hover) - 80), w - 190), pointerEvents: "none", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", boxShadow: "0 8px 24px rgb(0 0 0 / .18)", fontSize: 12, minWidth: 160, zIndex: 2 }}>
        <div style=${{ fontWeight: 600, marginBottom: 4 }}>${data[hover].label}</div>
        ${series.map((s) => html`<div key=${s.key} style=${{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}><span style=${{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted-fg)" }}><span style=${{ width: 8, height: 8, borderRadius: 2, background: SLOT(s.slot) }} />${s.label}</span><strong class="tabular">${fmt.value(data[hover][s.key], s.format || format)}</strong></div>`)}
      </div>`}
    </div>`;
  }
  function ChartTable({ data, series, format = "number", xLabel = "Period" }) {
    return html`<div style=${{ maxHeight: 300, overflow: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
      <table style=${{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr><th style=${{ textAlign: "left", padding: "8px 12px", color: "var(--muted-fg)", fontWeight: 500, position: "sticky", top: 0, background: "var(--card)" }}>${xLabel}</th>${series.map((s) => html`<th key=${s.key} style=${{ textAlign: "right", padding: "8px 12px", color: "var(--muted-fg)", fontWeight: 500, position: "sticky", top: 0, background: "var(--card)" }}>${s.label}</th>`)}</tr></thead>
        <tbody>${data.map((d, i) => html`<tr key=${i} style=${{ borderTop: "1px solid var(--border)" }}><td style=${{ padding: "7px 12px", color: "var(--muted-fg)" }}>${d.label}</td>${series.map((s) => html`<td key=${s.key} class="tabular" style=${{ padding: "7px 12px", textAlign: "right" }}>${fmt.value(d[s.key], s.format || format)}</td>`)}</tr>`)}</tbody>
      </table>
    </div>`;
  }
  /** Chart in a card with a chart/table toggle. */
  function ChartCard({ title, description, headline, data, series, format, height, actions, style }) {
    const [view, setView] = useState("chart");
    const hasData = (data || []).some((d) => series.some((s) => Number(d[s.key])));
    const toggle = html`<div style=${{ display: "inline-flex", padding: 2, borderRadius: 8, background: "var(--muted)" }}>
      ${[["chart", "chart-column", "Chart view"], ["table", "table", "Table view"]].map(([v, icon, label]) => html`<button key=${v} aria-label=${label} aria-pressed=${view === v} onClick=${() => setView(v)} style=${{ display: "grid", placeItems: "center", width: 28, height: 26, borderRadius: 6, border: 0, cursor: "pointer", background: view === v ? "var(--card)" : "transparent", color: view === v ? "var(--fg)" : "var(--muted-fg)" }}><${Icon} name=${icon} size=${14} /></button>`)}
    </div>`;
    return html`<${Section} title=${title} description=${description} style=${style} actions=${html`${actions}${toggle}`}>
      ${headline && html`<div class="tabular" style=${{ fontSize: 22, fontWeight: 600, margin: "-4px 0 10px" }}>${headline}</div>`}
      ${!hasData ? html`<${EmptyState} icon="chart-column" title="No data for this period" />` : view === "chart" ? html`<${Chart} data=${data} series=${series} format=${format} height=${height} />` : html`<${ChartTable} data=${data} series=${series} format=${format} />`}
    <//>`;
  }
  /** Horizontal bars for rankings. items: [{ label, value, sub? }]. */
  function BarList({ items, format = "number", slot = 1, max }) {
    const top = max ?? Math.max(1, ...items.map((i) => Number(i.value) || 0));
    return html`<ul style=${{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
      ${items.map((it, i) => html`<li key=${i} style=${{ display: "grid", gridTemplateColumns: "minmax(0, 150px) 1fr auto", alignItems: "center", gap: 10, fontSize: 13 }}>
        <span style=${{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--muted-fg)" }} title=${it.label}>${it.label}</span>
        <span style=${{ height: 14, borderRadius: 4, background: "var(--muted)", overflow: "hidden" }}><span style=${{ display: "block", height: "100%", width: `${Math.max(2, ((Number(it.value) || 0) / top) * 100)}%`, background: SLOT(it.slot || slot), borderRadius: "0 4px 4px 0" }} /></span>
        <strong class="tabular" style=${{ fontWeight: 600 }}>${fmt.value(it.value, format)}</strong>
      </li>`)}
    </ul>`;
  }

  // ── Kanban ──
  /** columns: [{ id, label }]. getColumn(item) → id. onMove(item, toId). canMove(item, toId) → boolean. */
  function Kanban({ columns, items, getColumn, renderCard, onMove, canMove = () => true, minColumnWidth = 260 }) {
    const [dragId, setDragId] = useState(null);
    const [overCol, setOverCol] = useState(null);
    return html`<div style=${{ display: "grid", gridAutoFlow: "column", gridAutoColumns: `minmax(${minColumnWidth}px, 1fr)`, gap: 12, overflowX: "auto", paddingBottom: 8 }}>
      ${columns.map((col) => {
        const list = items.filter((it) => getColumn(it) === col.id);
        return html`<div key=${col.id} onDragOver=${(e) => { e.preventDefault(); setOverCol(col.id); }} onDragLeave=${() => setOverCol(null)}
          onDrop=${(e) => { e.preventDefault(); setOverCol(null); const it = items.find((x) => x.id === dragId); if (it && getColumn(it) !== col.id && canMove(it, col.id)) onMove(it, col.id); setDragId(null); }}
          style=${{ background: overCol === col.id ? "var(--accent)" : "var(--subtle)", border: "1px solid var(--border)", borderRadius: 12, padding: 10, minHeight: 160, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style=${{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px 4px", fontWeight: 600, fontSize: 13 }}>${col.label}<span class="tabular" style=${{ fontSize: 11, color: "var(--muted-fg)", background: "var(--muted)", padding: "0 6px", borderRadius: 99 }}>${list.length}</span></div>
          ${list.map((it) => html`<div key=${it.id} draggable="true" onDragStart=${() => setDragId(it.id)} style=${{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, boxShadow: "var(--shadow)", cursor: "grab" }}>
            ${renderCard(it)}
            <div style=${{ marginTop: 8 }}><${Select} ariaLabel=${`Move ${it.title || it.name || "item"}`} value=${getColumn(it)} onChange=${(to) => to !== getColumn(it) && canMove(it, to) && onMove(it, to)} options=${columns.filter((c) => c.id === getColumn(it) || canMove(it, c.id)).map((c) => ({ value: c.id, label: c.id === getColumn(it) ? `${c.label} (current)` : `Move to ${c.label}` }))} style=${{ width: "100%", height: 30, fontSize: 12.5 }} /></div>
          </div>`)}
          ${list.length === 0 && html`<p style=${{ margin: "12px 4px", fontSize: 12.5, color: "var(--muted-fg)" }}>Nothing here.</p>`}
        </div>`;
      })}
    </div>`;
  }

  /** Simple "Access denied" body used by the router. */
  function AccessDenied() {
    return html`<${Card} style=${{ maxWidth: 560, margin: "40px auto" }}><${EmptyState} icon="lock" title="You don't have access to this area" description="This persona's role doesn't include the permission for this page. Switch persona in the top bar to explore other roles." action=${html`<a href="#/dashboard" style=${{ marginTop: 8, color: "var(--primary)", fontWeight: 500 }}>Back to the dashboard</a>`} /><//>`;
  }

  window.IA = {
    React, html, Fragment, useState, useEffect, useMemo, useCallback, useRef,
    lib: L, labels, fmt, toDate, cx,
    AppContext, useApp, useAppState, PERSONAS, route, routes, matchRoute, hrefWith, NAV,
    Icon, Badge, StatusBadge, Button, Card, Section, PageHeader, Kpi, Grid, Tabs, SubNav, EmptyState, Progress, Avatar, UserChip, DueDate,
    Field, TextInput, TextArea, Select, SearchInput, Toolbar, Modal, Table, useNarrow,
    Chart, ChartTable, ChartCard, BarList, Legend, Kanban, AccessDenied,
  };
})();
