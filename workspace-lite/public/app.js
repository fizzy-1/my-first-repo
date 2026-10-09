/* Integral Workspace Lite — the single-page app: sign-in, shell and every view.
 * Talks to server.js over /api. The server enforces all permissions; the checks here only hide buttons. */
(function () {
  "use strict";
  const { html, Fragment, useState, useEffect, useMemo, useCallback, useRef, fmt, today, addDays, toDate } = UI;
  const { Icon, Badge, StatusBadge, Button, Card, Section, PageHeader, Kpi, Grid, Tabs, EmptyState, Avatar, UserChip, DueDate } = UI;
  const { Field, TextInput, TextArea, Select, Modal, Table, ChartCard, BarList, Kanban } = UI;
  const AppContext = React.createContext(null);
  const useApp = () => React.useContext(AppContext);

  // ─────────────────────────── API ───────────────────────────
  async function api(method, path, body, headers = {}) {
    const isFile = body instanceof Blob;
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { "X-Requested-With": "workspace", ...(body !== undefined && !isFile ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : isFile ? body : JSON.stringify(body),
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && !path.startsWith("/api/auth/")) window.dispatchEvent(new Event("ws:signed-out"));
      const err = new Error((data && data.error) || "Something went wrong. Please try again.");
      err.status = res.status;
      err.fields = data && data.fields;
      throw err;
    }
    if (method !== "GET") window.dispatchEvent(new Event("ws:changed"));
    return data;
  }
  /** Loads a GET endpoint; `reload()` refetches while keeping the current data on screen. */
  function useResource(path) {
    const [state, setState] = useState({ data: null, error: null, loading: true });
    const [n, setN] = useState(0);
    useEffect(() => {
      if (!path) return undefined;
      let live = true;
      setState((s) => ({ ...s, loading: true }));
      api("GET", path)
        .then((data) => live && setState({ data, error: null, loading: false }))
        .catch((error) => live && setState((s) => ({ data: s.data, error, loading: false })));
      return () => {
        live = false;
      };
    }, [path, n]);
    const reload = useCallback(() => setN((x) => x + 1), []);
    return { ...state, reload };
  }
  /** Renders a resource: spinner on first load, error box on failure, otherwise `render(data)`. */
  function Loaded({ res, children }) {
    if (res.error && !res.data) return html`<${Card} style=${{ padding: 8 }}><${EmptyState} icon="triangle-alert" title="Couldn't load this" description=${res.error.message} action=${html`<${Button} size="sm" icon="refresh-cw" onClick=${res.reload}>Try again<//>`} /><//>`;
    if (!res.data) return html`<div style=${{ padding: 40, textAlign: "center", color: "var(--muted-fg)" }}>Loading…</div>`;
    return children(res.data);
  }

  // ─────────────────────────── Labels ───────────────────────────
  const META = {
    taskStatus: { todo: { label: "To do", tone: "neutral" }, doing: { label: "In progress", tone: "info" }, done: { label: "Done", tone: "success" } },
    priority: { low: { label: "Low", tone: "neutral" }, medium: { label: "Medium", tone: "warning" }, high: { label: "High", tone: "danger" } },
    leadStage: {
      lead: { label: "New lead", tone: "neutral" }, contacted: { label: "Contacted", tone: "info" }, meeting: { label: "Meeting set", tone: "violet" },
      proposal: { label: "Proposal sent", tone: "gold" }, won: { label: "Won", tone: "success" }, lost: { label: "Lost", tone: "danger" },
    },
    contentStage: {
      idea: { label: "Idea", tone: "neutral" }, recording: { label: "Recording", tone: "info" }, editing: { label: "Editing", tone: "violet" },
      review: { label: "In review", tone: "warning" }, published: { label: "Published", tone: "success" },
    },
    contentType: { video: { label: "Video" }, lesson: { label: "Lesson" }, worksheet: { label: "Worksheet" }, quiz: { label: "Quiz" }, past_paper: { label: "Past paper" } },
    approval: { pending: { label: "Pending", tone: "warning" }, approved: { label: "Approved", tone: "success" }, rejected: { label: "Rejected", tone: "danger" } },
    role: { admin: { label: "Admin", tone: "gold" }, manager: { label: "Manager", tone: "primary" }, member: { label: "Member", tone: "neutral" } },
    kind: { income: { label: "Income", tone: "success" }, expense: { label: "Expense", tone: "neutral" } },
    recurrence: { none: { label: "Does not repeat" }, weekly: { label: "Every week" }, monthly: { label: "Every month" } },
    goalStatus: {
      on_track: { label: "On track", tone: "success" }, at_risk: { label: "At risk", tone: "warning" }, behind: { label: "Behind", tone: "danger" },
      achieved: { label: "Achieved", tone: "primary" }, missed: { label: "Missed", tone: "danger" }, not_started: { label: "Not started", tone: "neutral" },
    },
    contractState: {
      active: { label: "Active", tone: "success" }, due: { label: "Renewal due", tone: "warning" }, lapsed: { label: "Ended, no decision", tone: "danger" },
      upcoming: { label: "Starts soon", tone: "info" }, not_renewing: { label: "Not renewing", tone: "neutral" }, renewed: { label: "Renewed", tone: "primary" }, ended: { label: "Ended", tone: "neutral" },
    },
  };
  const GOAL_METRICS = window.WSMetrics.GOAL_METRICS;
  const nextDueMessage = (r, fallback) => (r && r.next_task_due ? `Done. The next one is due ${fmt.date(r.next_task_due)}.` : fallback);
  const columnsOf = (meta) => Object.entries(meta).map(([id, m]) => ({ id, label: m.label }));
  const RANK = { member: 1, manager: 2, admin: 3 };
  const atLeast = (user, role) => RANK[user.role] >= RANK[role];

  // ─────────────────────────── Theme ───────────────────────────
  const readTheme = () => {
    try {
      return localStorage.getItem("ws-theme") || "system";
    } catch {
      return "system";
    }
  };
  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("ws-theme", theme);
    } catch {
      /* storage unavailable: the choice lasts for this visit */
    }
  }
  applyTheme(readTheme());
  const isDark = () => document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);

  // ─────────────────────────── Routing ───────────────────────────
  function parseHash() {
    const raw = (window.location.hash || "").replace(/^#\/?/, "");
    const [p, q = ""] = raw.split("?");
    return { path: p || "dashboard", params: Object.fromEntries(new URLSearchParams(q)) };
  }
  const go = (path) => {
    window.location.hash = `#/${path}`;
  };
  /** Opens the record named by a URL parameter (e.g. #/tasks?task=12) once its list has loaded. */
  function useOpenFromParam(param, rows, open) {
    const handled = useRef(null);
    useEffect(() => {
      if (!param) {
        handled.current = null;
        return;
      }
      if (!rows || handled.current === param) return;
      handled.current = param;
      const row = rows.find((r) => r.id === Number(param));
      if (row) open(row);
    }, [param, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  }

  // ─────────────────────────── Forms ───────────────────────────
  /**
   * Generic form in a modal. fields: [{ name, label, type, options, required, full, hint, placeholder }].
   * types: text, email, password, textarea, select, date, money, number, user, checkbox.
   * onSubmit(values) may throw an API error; its per-field messages are shown under the fields.
   */
  function FormModal({ open, onClose, title, description, fields, initial, submitLabel = "Save", onSubmit, extraFooter, width, children }) {
    const [values, setValues] = useState({});
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
      if (!open) return;
      setValues(Object.fromEntries(fields.map((f) => [f.name, initial?.[f.name] ?? f.default ?? (f.type === "checkbox" ? false : "")])));
      setErrors({});
      setFormError("");
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
    const submit = async (e) => {
      if (e) e.preventDefault();
      setBusy(true);
      setErrors({});
      setFormError("");
      try {
        const out = {};
        for (const f of fields) if (!f.show || f.show(values)) out[f.name] = f.type === "checkbox" ? Boolean(values[f.name]) : values[f.name] ?? "";
        await onSubmit(out);
      } catch (err) {
        setErrors(err.fields || {});
        setFormError(err.message);
      } finally {
        setBusy(false);
      }
    };
    const set = (name, v) => setValues((s) => ({ ...s, [name]: v }));
    return html`<${Modal} open=${open} onClose=${onClose} title=${title} description=${description} width=${width}
      footer=${html`${extraFooter}<span style=${{ flex: 1 }} /><${Button} onClick=${onClose}>Cancel<//><${Button} variant="primary" disabled=${busy} onClick=${submit}>${busy ? "Saving…" : submitLabel}<//>`}>
      <form class="form-grid" onSubmit=${submit} noValidate>
        ${fields.filter((f) => !f.show || f.show(values)).map((f) => html`<${FormField} key=${f.name} f=${typeof f.hint === "function" ? { ...f, hint: f.hint(values) } : f} value=${values[f.name]} error=${errors[f.name]} onChange=${(v) => set(f.name, v)} />`)}
        <button type="submit" hidden />
      </form>
      ${formError && html`<div role="alert" style=${{ padding: "8px 12px", borderRadius: 8, background: "var(--danger-soft)", color: "var(--danger)", fontSize: 13 }}>${formError}</div>`}
      ${children}
    <//>`;
  }
  function FormField({ f, value, error, onChange }) {
    const { users } = useApp();
    const id = `f-${f.name}`;
    const label = html`${f.label}${f.required && html`<span aria-hidden="true" style=${{ color: "var(--danger)" }}> *</span>`}`;
    let control;
    if (f.type === "textarea") control = html`<${TextArea} id=${id} value=${value} onChange=${onChange} rows=${f.rows || 4} placeholder=${f.placeholder} />`;
    else if (f.type === "select") control = html`<${Select} id=${id} value=${value} onChange=${onChange} options=${f.options} placeholder=${f.placeholder} style=${{ width: "100%" }} />`;
    else if (f.type === "user") {
      const options = users.filter((u) => u.active || u.id === Number(value)).map((u) => ({ value: u.id, label: u.name }));
      control = html`<${Select} id=${id} value=${value} onChange=${onChange} options=${options} placeholder=${f.placeholder ?? "Unassigned"} style=${{ width: "100%" }} />`;
    } else if (f.type === "checkbox")
      return html`<label class=${f.full ? "full" : ""} style=${{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}><input id=${id} type="checkbox" checked=${Boolean(value)} onChange=${(e) => onChange(e.target.checked)} />${f.label}${f.hint && html`<span style=${{ color: "var(--muted-fg)", fontSize: 12 }}>— ${f.hint}</span>`}</label>`;
    else {
      const type = { money: "number", number: "number", date: "date", email: "email", password: "password" }[f.type] || "text";
      control = html`<${TextInput} id=${id} type=${type} value=${value} onChange=${onChange} placeholder=${f.placeholder} step=${f.type === "money" ? "0.01" : f.type === "number" ? "1" : undefined} min=${f.type === "money" || f.type === "number" ? "0" : undefined} autoComplete=${f.autoComplete} list=${f.list} />`;
    }
    return html`<${Field} id=${id} label=${label} hint=${f.hint} error=${error} className=${f.full ? "full" : ""}>${control}<//>`;
  }
  /** Small confirm dialog used before deletes. */
  function useConfirm() {
    const [state, setState] = useState(null);
    const confirm = (message, action) => setState({ message, action });
    const dialog = html`<${Modal} open=${Boolean(state)} onClose=${() => setState(null)} title="Are you sure?" width=${420}
      footer=${html`<${Button} onClick=${() => setState(null)}>Cancel<//><${Button} variant="danger" onClick=${async () => { const a = state.action; setState(null); await a(); }}>Delete<//>`}>
      <p style=${{ margin: 0 }}>${state && state.message}</p>
    <//>`;
    return [confirm, dialog];
  }
  /** Wraps an async action with toasts for success and failure. */
  function useAction() {
    const { toast } = useApp();
    return useCallback(
      async (fn, success) => {
        try {
          const out = await fn();
          if (success) toast(success);
          return out;
        } catch (err) {
          toast(err.message, "danger");
          return undefined;
        }
      },
      [toast],
    );
  }
  const Muted = ({ children }) => html`<span style=${{ color: "var(--muted-fg)", fontSize: 12.5 }}>${children}</span>`;
  const Money = ({ value }) => html`<span class="tabular">${fmt.zar(value)}</span>`;

  // ─────────────────────────── Field specs ───────────────────────────
  const TASK_FIELDS = [
    { name: "title", label: "Task", type: "text", required: true, full: true, placeholder: "What needs doing?" },
    { name: "assignee_id", label: "Assigned to", type: "user" },
    { name: "due_date", label: "Due", type: "date" },
    { name: "priority", label: "Priority", type: "select", options: META.priority, default: "medium" },
    { name: "status", label: "Status", type: "select", options: META.taskStatus, default: "todo" },
    { name: "recurrence", label: "Repeats", type: "select", options: META.recurrence, default: "none", hint: "When it's done, the next one is added automatically." },
    { name: "notes", label: "Notes", type: "textarea", full: true, rows: 3 },
  ];
  const LEAD_FIELDS = [
    { name: "school", label: "School", type: "text", required: true, full: true },
    { name: "contact_name", label: "Contact person", type: "text" },
    { name: "contact_email", label: "Contact email", type: "email" },
    { name: "contact_phone", label: "Contact phone", type: "text" },
    { name: "city", label: "Town / city", type: "text" },
    { name: "stage", label: "Stage", type: "select", options: META.leadStage, default: "lead" },
    { name: "owner_id", label: "Owner", type: "user" },
    { name: "value", label: "Deal value (R per year)", type: "money" },
    { name: "learners", label: "Grade 12 learners", type: "number" },
    { name: "next_follow_up", label: "Next follow-up", type: "date" },
  ];
  const CONTENT_FIELDS = (canPublish) => [
    { name: "title", label: "Title", type: "text", required: true, full: true, placeholder: "e.g. Calculus: first principles" },
    { name: "type", label: "Type", type: "select", options: META.contentType, default: "video" },
    { name: "topic", label: "Topic", type: "text", placeholder: "e.g. Calculus" },
    { name: "stage", label: "Stage", type: "select", options: canPublish ? META.contentStage : Object.fromEntries(Object.entries(META.contentStage).filter(([k]) => k !== "published")), default: "idea", hint: canPublish ? undefined : "A manager marks work as published." },
    { name: "owner_id", label: "Owner", type: "user" },
    { name: "due_date", label: "Due", type: "date" },
  ];
  const TX_FIELDS = [
    { name: "kind", label: "Type", type: "select", options: META.kind, default: "expense", required: true },
    { name: "date", label: "Date", type: "date", required: true },
    { name: "amount", label: "Amount (R)", type: "money", required: true },
    { name: "category", label: "Category", type: "text", required: true, list: "tx-categories", placeholder: "e.g. Software" },
    { name: "description", label: "Description", type: "text", required: true, full: true },
    { name: "counterparty", label: "Paid to / received from", type: "text", full: true },
  ];
  const APPROVAL_FIELDS = [
    { name: "title", label: "What do you need approved?", type: "text", required: true, full: true, placeholder: "e.g. New microphone for recordings" },
    { name: "amount", label: "Amount (R)", type: "money", hint: "Leave empty if there's no cost." },
    { name: "details", label: "Why is it needed?", type: "textarea", full: true },
  ];
  const MEETING_FIELDS = [
    { name: "title", label: "Meeting", type: "text", required: true, full: true, placeholder: "e.g. Weekly team check-in" },
    { name: "date", label: "Date", type: "date", required: true },
    { name: "attendees", label: "Attendees", type: "text", placeholder: "Names, comma separated" },
    { name: "notes", label: "Notes", type: "textarea", full: true, rows: 6 },
    { name: "decisions", label: "Decisions", type: "textarea", full: true, rows: 3, hint: "One decision per line." },
  ];

  // ─────────────────────────── Dashboard ───────────────────────────
  function DashboardView() {
    const { user, userName, toast } = useApp();
    const res = useResource("/api/dashboard");
    const act = useAction();
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    return html`<${Fragment}>
      <${PageHeader} title=${`${greeting}, ${user.name.split(" ")[0]}`} description=${new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />
      <${Loaded} res=${res}>${(d) => {
        const open = d.pipeline.filter((p) => !["won", "lost"].includes(p.stage));
        const won = d.pipeline.find((p) => p.stage === "won");
        const f = d.finance;
        const complete = async (t) => {
          const r = await act(() => api("PATCH", `/api/tasks/${t.id}`, { status: "done" }));
          if (r) toast(nextDueMessage(r, "Task completed"));
          res.reload();
        };
        return html`<div style=${{ display: "grid", gap: 16 }}>
          ${d.backup && d.backup.due && html`<${Card} style=${{ padding: "12px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, background: "var(--gold-soft)", color: "var(--gold-fg)", fontSize: 13.5 }}>
            <${Icon} name="shield-check" /><span style=${{ flex: "1 1 260px" }}>${d.backup.last ? `Your last backup was on ${fmt.date(d.backup.last)}.` : "You haven't downloaded a backup yet."} Keep a copy of the workspace somewhere safe.</span>
            <a href="#/team" style=${{ fontWeight: 600 }}>Back up now</a>
          <//>`}
          <${Grid} min=${185}>
            ${f && html`<${Kpi} label="Cash on hand" icon="wallet" value=${fmt.zar(f.cash, { compact: Math.abs(f.cash) >= 1e6 })} sub=${f.runwayMonths === null ? "Not burning cash" : `About ${fmt.number(f.runwayMonths, { decimals: 1 })} months of runway`} href="#/finance" />`}
            ${f && html`<${Kpi} label="Net this month" icon="trending-up" value=${fmt.zar(f.thisMonth.net)} sub=${`Income ${fmt.zar(f.thisMonth.income)} · Spend ${fmt.zar(f.thisMonth.expense)}`} href="#/finance" />`}
            <${Kpi} label="Open tasks" icon="list-checks" value=${fmt.number(d.openTasks)} sub=${d.overdueTasks.length ? `${d.overdueTasks.length} overdue` : "Nothing overdue"} href="#/tasks" />
            <${Kpi} label="Open pipeline" icon="school" value=${fmt.zar(open.reduce((s, p) => s + p.value, 0))} sub=${`${open.reduce((s, p) => s + p.n, 0)} schools in progress`} href="#/pipeline" />
            <${Kpi} label="Learners signed" icon="graduation-cap" value=${fmt.number(d.learnersSigned)} sub=${`${won ? won.n : 0} schools won`} href="#/pipeline" />
          <//>
          ${f && html`<${ChartCard} title="Income and spending" description="Last 12 months" format="zar" height=${220}
            data=${f.series.map((m) => ({ label: fmt.month(m.month), income: m.income, expense: m.expense }))}
            series=${[{ key: "income", label: "Income", slot: 1, type: "bar" }, { key: "expense", label: "Spending", slot: 2, type: "bar" }]} />`}
          <${Grid} min=${320}>
            <${Section} title="My tasks" description="Open tasks assigned to you" actions=${html`<a href="#/tasks" style=${{ fontSize: 13, color: "var(--primary)" }}>All tasks</a>`}>
              ${d.myTasks.length === 0 ? html`<${EmptyState} icon="check" title="You're all caught up" />` : d.myTasks.map((t) => html`<div class="list-row" key=${t.id}>
                <input type="checkbox" aria-label=${`Mark “${t.title}” done`} onChange=${() => complete(t)} />
                <span style=${{ flex: 1, minWidth: 0 }}>${t.title}</span>
                ${t.priority === "high" && html`<${StatusBadge} meta=${META.priority} value="high" />`}
                <${DueDate} date=${t.due_date} />
              </div>`)}
            <//>
            <${Section} title="Follow-ups this week" description="Schools waiting to hear from us" actions=${html`<a href="#/pipeline" style=${{ fontSize: 13, color: "var(--primary)" }}>Pipeline</a>`}>
              ${d.followUps.length === 0 ? html`<${EmptyState} icon="school" title="No follow-ups due" />` : d.followUps.map((l) => html`<a class="list-row" key=${l.id} href=${`#/pipeline?lead=${l.id}`} style=${{ textDecoration: "none" }}>
                <span style=${{ flex: 1, minWidth: 0 }}><strong style=${{ fontWeight: 500 }}>${l.school}</strong><br /><${Muted}>${l.contact_name || "No contact yet"} · ${userName(l.owner_id)}<//></span>
                <span style=${{ display: "grid", justifyItems: "end", gap: 4, flexShrink: 0 }}><${DueDate} date=${l.next_follow_up} /><${StatusBadge} meta=${META.leadStage} value=${l.stage} /></span>
              </a>`)}
            <//>
            <${Section} title=${atLeast(user, "manager") ? "Waiting for approval" : "My pending requests"} actions=${html`<a href="#/approvals" style=${{ fontSize: 13, color: "var(--primary)" }}>Approvals</a>`}>
              ${d.pendingApprovals.length === 0 ? html`<${EmptyState} icon="circle-check" title="Nothing pending" />` : d.pendingApprovals.map((a) => html`<div class="list-row" key=${a.id}>
                <span style=${{ flex: 1, minWidth: 0 }}>${a.title}<br /><${Muted}>${userName(a.requested_by)} · ${fmt.relative(a.created_at)}<//></span>
                ${a.amount !== null && html`<strong><${Money} value=${a.amount} /></strong>`}
              </div>`)}
            <//>
            <${Section} title="Goals" description="Are we on pace?" actions=${html`<a href="#/goals" style=${{ fontSize: 13, color: "var(--primary)" }}>All goals</a>`}>
              ${d.goals.length === 0 ? html`<${EmptyState} icon="target" title="No goals set" description=${atLeast(user, "manager") ? "Add one on the Goals page." : null} />` : d.goals.map((g) => html`<a class="list-row" key=${g.id} href="#/goals" style=${{ textDecoration: "none", display: "grid", gap: 6 }}>
                <span style=${{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style=${{ fontSize: 13.5, fontWeight: 500 }}>${g.title}</span><${StatusBadge} meta=${META.goalStatus} value=${g.progress.status} /></span>
                <${GoalMeter} g=${g} compact=${true} />
              </a>`)}
            <//>
            <${Section} title="Renewals coming up" description=${`${fmt.zar(d.renewals.summary.arr)} a year under contract`} actions=${html`<a href="#/contracts" style=${{ fontSize: 13, color: "var(--primary)" }}>Contracts</a>`}>
              ${d.renewals.due.length === 0 ? html`<${EmptyState} icon="refresh-cw" title="No renewals due" description="Nothing ends in the next 90 days." /> ` : d.renewals.due.map((c) => html`<a class="list-row" key=${c.id} href=${`#/contracts?contract=${c.id}`} style=${{ textDecoration: "none" }}>
                <span style=${{ flex: 1, minWidth: 0 }}><strong style=${{ fontWeight: 500 }}>${c.school}</strong><br /><${Muted}>${fmt.zar(c.annual_value)} a year · ${userName(c.owner_id)}<//></span>
                <${DaysLeft} c=${c} />
              </a>`)}
            <//>
            <${Section} title="Content production" description="Lessons and videos by stage" actions=${html`<a href="#/content" style=${{ fontSize: 13, color: "var(--primary)" }}>Board</a>`}>
              ${d.content.length === 0 ? html`<${EmptyState} icon="video" title="No content planned yet" />` : html`<${BarList} items=${Object.keys(META.contentStage).map((k) => ({ label: META.contentStage[k].label, value: d.content.find((c) => c.stage === k)?.n || 0 }))} />`}
            <//>
            <${Section} title="Coming up" description="Next meetings">
              ${d.upcomingMeetings.length === 0 ? html`<${EmptyState} icon="calendar-days" title="No meetings scheduled" />` : d.upcomingMeetings.map((m) => html`<a class="list-row" key=${m.id} href=${`#/meetings?meeting=${m.id}`} style=${{ textDecoration: "none" }}>
                <span style=${{ flex: 1 }}>${m.title}</span><${Muted}>${fmt.date(m.date)}<//>
              </a>`)}
            <//>
            <${Section} title="Recent activity">
              ${d.activity.length === 0 ? html`<${EmptyState} icon="activity" title="No activity yet" />` : d.activity.map((a, i) => html`<div class="list-row" key=${i} style=${{ alignItems: "flex-start" }}>
                <${Avatar} name=${a.user_name || "?"} size=${24} />
                <span style=${{ flex: 1, minWidth: 0, fontSize: 13 }}>${a.summary}<br /><${Muted}>${fmt.relative(a.created_at)}<//></span>
              </div>`)}
            <//>
          <//>
        </div>`;
      }}<//>
    <//>`;
  }

  // ─────────────────────────── Tasks ───────────────────────────
  function canEditTask(user, t) {
    return atLeast(user, "manager") || t.created_by === user.id || t.assignee_id === user.id;
  }
  function TaskModal({ task, open, onClose, onSaved, defaults }) {
    const { user } = useApp();
    const act = useAction();
    const [confirm, confirmDialog] = useConfirm();
    const canDelete = task && (atLeast(user, "manager") || task.created_by === user.id);
    return html`<${Fragment}>
      <${FormModal} open=${open} onClose=${onClose} title=${task ? "Edit task" : "New task"} fields=${TASK_FIELDS} initial=${task || { assignee_id: user.id, ...defaults }}
        submitLabel=${task ? "Save" : "Add task"}
        onSubmit=${async (v) => {
          if (task) onSaved(nextDueMessage(await api("PATCH", `/api/tasks/${task.id}`, v), "Task updated"));
          else {
            await api("POST", "/api/tasks", { ...v, lead_id: defaults && defaults.lead_id, meeting_id: defaults && defaults.meeting_id });
            onSaved("Task added");
          }
        }}
        extraFooter=${canDelete && html`<${Button} variant="ghost" icon="trash-2" style=${{ color: "var(--danger)" }} onClick=${() => confirm(`Delete “${task.title}”?`, async () => { await act(() => api("DELETE", `/api/tasks/${task.id}`)); onSaved("Task deleted"); })}>Delete<//>`} />
      ${confirmDialog}
    <//>`;
  }
  function TasksView({ params }) {
    const { user, userName, toast } = useApp();
    const res = useResource("/api/tasks");
    const act = useAction();
    const [scope, setScope] = useState("mine");
    const [view, setView] = useState("list");
    const [editing, setEditing] = useState(null); // null | "new" | task
    useOpenFromParam(params.task, res.data, setEditing);
    const saved = (msg) => {
      setEditing(null);
      toast(msg);
      res.reload();
    };
    const setStatus = async (t, status) => {
      const r = await act(() => api("PATCH", `/api/tasks/${t.id}`, { status }));
      if (r && r.next_task_due) toast(nextDueMessage(r));
      res.reload();
    };
    return html`<${Fragment}>
      <${PageHeader} title="Tasks" description="Everything the team is working on." actions=${html`
        <div style=${{ display: "inline-flex", padding: 2, borderRadius: 8, background: "var(--muted)" }}>
          ${[["list", "list", "List"], ["board", "kanban", "Board"]].map(([v, icon, label]) => html`<button key=${v} aria-pressed=${view === v} onClick=${() => setView(v)} style=${{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", borderRadius: 6, border: 0, cursor: "pointer", background: view === v ? "var(--card)" : "transparent", color: view === v ? "var(--fg)" : "var(--muted-fg)", fontSize: 13 }}><${Icon} name=${icon} size=${14} />${label}</button>`)}
        </div>
        <${Button} variant="primary" icon="plus" onClick=${() => setEditing("new")}>New task<//>`} />
      <${Loaded} res=${res}>${(tasks) => {
        const mine = tasks.filter((t) => t.assignee_id === user.id);
        const shown = scope === "mine" ? mine.filter((t) => t.status !== "done") : scope === "open" ? tasks.filter((t) => t.status !== "done") : scope === "done" ? tasks.filter((t) => t.status === "done") : tasks;
        const tabs = html`<${Tabs} value=${scope} onChange=${setScope} items=${[
          { id: "mine", label: "My open tasks", count: mine.filter((t) => t.status !== "done").length },
          { id: "open", label: "All open", count: tasks.filter((t) => t.status !== "done").length },
          { id: "done", label: "Done", count: tasks.filter((t) => t.status === "done").length },
        ]} />`;
        if (view === "board")
          return html`${tabs}<${Kanban} columns=${columnsOf(META.taskStatus)} items=${scope === "done" ? shown : scope === "mine" ? mine : tasks} getColumn=${(t) => t.status}
            canMove=${(t) => canEditTask(user, t)} onMove=${(t, to) => setStatus(t, to)}
            renderCard=${(t) => html`<button onClick=${() => setEditing(t)} style=${{ all: "unset", cursor: "pointer", display: "grid", gap: 6, width: "100%" }}>
              <strong style=${{ fontWeight: 500 }}>${t.title}</strong>
              <span style=${{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}><${StatusBadge} meta=${META.priority} value=${t.priority} /><${DueDate} date=${t.due_date} done=${t.status === "done"} /></span>
              <${UserChip} name=${t.assignee_id ? userName(t.assignee_id) : null} />
            </button>`} />`;
        return html`${tabs}<${Card}><${Table} rows=${shown} search=${(t, q) => `${t.title} ${t.notes || ""} ${userName(t.assignee_id)}`.toLowerCase().includes(q)} searchPlaceholder="Search tasks…" pageSize=${20}
          onRowClick=${(t) => setEditing(t)}
          empty=${html`<${EmptyState} icon="list-checks" title=${scope === "mine" ? "No open tasks for you" : "No tasks here"} description="Add a task to get started." />`}
          columns=${[
            { key: "done", header: html`<span class="sr-only">Done</span>`, width: 36, render: (t) => html`<input type="checkbox" aria-label=${`Mark “${t.title}” ${t.status === "done" ? "not done" : "done"}`} checked=${t.status === "done"} disabled=${!canEditTask(user, t)} onClick=${(e) => e.stopPropagation()} onChange=${() => setStatus(t, t.status === "done" ? "todo" : "done")} />` },
            { key: "title", header: "Task", sort: (t) => t.title.toLowerCase(), render: (t) => html`<span style=${{ textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? "var(--muted-fg)" : undefined }}>${t.title}</span>${t.recurrence && t.recurrence !== "none" && html` <span title=${`Repeats ${t.recurrence === "weekly" ? "every week" : "every month"}`} aria-label=${`Repeats ${t.recurrence === "weekly" ? "every week" : "every month"}`} style=${{ color: "var(--muted-fg)", display: "inline-flex", verticalAlign: "-2px" }}><${Icon} name="refresh-cw" size=${13} /></span>`}${t.notes && html`<br /><${Muted}>${t.notes.slice(0, 90)}${t.notes.length > 90 ? "…" : ""}<//>`}` },
            { key: "assignee", header: "Assigned to", hideOnMobile: true, sort: (t) => userName(t.assignee_id), render: (t) => html`<${UserChip} name=${t.assignee_id ? userName(t.assignee_id) : null} />` },
            { key: "priority", header: "Priority", hideOnMobile: true, sort: (t) => ({ high: 0, medium: 1, low: 2 })[t.priority], render: (t) => html`<${StatusBadge} meta=${META.priority} value=${t.priority} />` },
            { key: "status", header: "Status", hideOnMobile: true, render: (t) => html`<${StatusBadge} meta=${META.taskStatus} value=${t.status} />` },
            { key: "due", header: "Due", sort: (t) => t.due_date, render: (t) => html`<${DueDate} date=${t.due_date} done=${t.status === "done"} />` },
          ]} /><//>`;
      }}<//>
      <${TaskModal} open=${Boolean(editing)} task=${editing === "new" ? null : editing} onClose=${() => { setEditing(null); if (params.task) go("tasks"); }} onSaved=${(msg) => { saved(msg); if (params.task) go("tasks"); }} />
    <//>`;
  }

  // ─────────────────────────── Schools pipeline ───────────────────────────
  function LeadDetail({ lead, onClose, onChanged }) {
    const { user, userName, toast } = useApp();
    const notes = useResource(lead ? `/api/leads/${lead.id}/notes` : null);
    const contracts = useResource(lead ? "/api/contracts" : null);
    const act = useAction();
    const [note, setNote] = useState("");
    const [editing, setEditing] = useState(false);
    const [taskOpen, setTaskOpen] = useState(false);
    const [contractOpen, setContractOpen] = useState(false);
    const [confirm, confirmDialog] = useConfirm();
    useEffect(() => setNote(""), [lead && lead.id]);
    if (!lead) return null;
    const addNote = async () => {
      if (!note.trim()) return;
      const ok = await act(() => api("POST", `/api/leads/${lead.id}/notes`, { body: note }), "Note added");
      if (ok) {
        setNote("");
        notes.reload();
      }
    };
    const row = (icon, label, value) => html`<div style=${{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}><span style=${{ color: "var(--muted-fg)", display: "inline-flex" }}><${Icon} name=${icon} size=${15} /></span><span style=${{ color: "var(--muted-fg)", width: 110 }}>${label}</span><span style=${{ minWidth: 0, overflowWrap: "anywhere" }}>${value || "—"}</span></div>`;
    return html`<${Fragment}>
      <${Modal} open=${!editing && !taskOpen && !contractOpen} onClose=${onClose} title=${lead.school} description=${[lead.city, META.leadStage[lead.stage].label].filter(Boolean).join(" · ")} width=${640}
        footer=${html`${atLeast(user, "manager") && html`<${Button} variant="ghost" icon="trash-2" style=${{ color: "var(--danger)" }} onClick=${() => confirm(`Delete ${lead.school} and its notes?`, async () => { await act(() => api("DELETE", `/api/leads/${lead.id}`), "School removed"); onChanged(true); })}>Delete<//>`}
          <span style=${{ flex: 1 }} /><${Button} icon="list-checks" onClick=${() => setTaskOpen(true)}>Add follow-up task<//><${Button} variant="primary" icon="pencil" onClick=${() => setEditing(true)}>Edit<//>`}>
        <div style=${{ display: "grid", gap: 8 }}>
          ${row("circle-user", "Contact", lead.contact_name)}
          ${row("mail", "Email", lead.contact_email && html`<a href=${`mailto:${lead.contact_email}`}>${lead.contact_email}</a>`)}
          ${row("phone", "Phone", lead.contact_phone && html`<a href=${`tel:${lead.contact_phone}`}>${lead.contact_phone}</a>`)}
          ${row("banknote", "Deal value", lead.value ? `${fmt.zar(lead.value)} / year` : null)}
          ${row("graduation-cap", "Learners", lead.learners !== null ? fmt.number(lead.learners) : null)}
          ${row("clock", "Follow up", lead.next_follow_up && html`<${DueDate} date=${lead.next_follow_up} />`)}
          ${row("briefcase", "Owner", userName(lead.owner_id))}
          ${(() => {
            const mine = (contracts.data || []).filter((c) => c.lead_id === lead.id).sort((a, b) => b.start_date.localeCompare(a.start_date));
            const current = mine.find((c) => ["active", "due", "lapsed", "upcoming", "not_renewing"].includes(c.state));
            const value = current
              ? html`<a href=${`#/contracts?contract=${current.id}`} style=${{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>${fmt.zar(current.annual_value)} a year until ${fmt.date(current.end_date)} <${StatusBadge} meta=${META.contractState} value=${current.state} /></a>`
              : atLeast(user, "manager") ? html`<${Button} size="sm" variant="soft" icon="plus" onClick=${() => setContractOpen(true)}>Add contract<//>` : mine.length ? "No current contract" : null;
            return row("file-text", "Contract", value);
          })()}
        </div>
        <div style=${{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "grid", gap: 10 }}>
          <strong style=${{ fontSize: 14 }}>Notes</strong>
          <${TextArea} value=${note} onChange=${setNote} rows=${2} placeholder="Log a call, email or visit…" />
          <div><${Button} size="sm" variant="soft" icon="plus" disabled=${!note.trim()} onClick=${addNote}>Add note<//></div>
          ${notes.data && notes.data.length === 0 && html`<${Muted}>No notes yet.<//>`}
          ${(notes.data || []).map((n) => html`<div key=${n.id} style=${{ padding: "10px 12px", borderRadius: 10, background: "var(--subtle)", border: "1px solid var(--border)" }}>
            <div class="pre" style=${{ fontSize: 13.5 }}>${n.body}</div>
            <${Muted}>${n.author_name || "Someone"} · ${fmt.relative(n.created_at)}<//>
          </div>`)}
        </div>
      <//>
      <${FormModal} open=${editing} onClose=${() => setEditing(false)} title=${`Edit ${lead.school}`} fields=${LEAD_FIELDS} initial=${lead}
        onSubmit=${async (v) => {
          await api("PATCH", `/api/leads/${lead.id}`, v);
          setEditing(false);
          toast("School updated");
          onChanged(false);
        }} />
      <${FormModal} open=${contractOpen} onClose=${() => setContractOpen(false)} title=${`Add a contract with ${lead.school}`} fields=${contractFields([lead])}
        initial=${{ lead_id: lead.id, start_date: today(), end_date: plusYear(today()), annual_value: lead.value || "", learners: lead.learners ?? "" }} submitLabel="Add contract"
        onSubmit=${async (v) => {
          await api("POST", "/api/contracts", v);
          setContractOpen(false);
          toast(lead.stage === "won" ? "Contract added" : `Contract added and ${lead.school} marked as won`);
          contracts.reload();
          onChanged(false);
        }} />
      <${TaskModal} open=${taskOpen} task=${null} defaults=${{ lead_id: lead.id, title: `Follow up with ${lead.school}`, assignee_id: lead.owner_id || user.id, due_date: lead.next_follow_up || addDays(today(), 2) }}
        onClose=${() => setTaskOpen(false)} onSaved=${(msg) => { setTaskOpen(false); toast(msg); }} />
      ${confirmDialog}
    <//>`;
  }
  function PipelineView({ params }) {
    const { userName, toast } = useApp();
    const res = useResource("/api/leads");
    const act = useAction();
    const [view, setView] = useState("board");
    const [adding, setAdding] = useState(false);
    const openId = params.lead ? Number(params.lead) : null;
    const open = (res.data || []).find((l) => l.id === openId) || null;
    const move = async (l, stage) => {
      await act(() => api("PATCH", `/api/leads/${l.id}`, { stage }), `${l.school} moved to ${META.leadStage[stage].label}`);
      res.reload();
    };
    return html`<${Fragment}>
      <${PageHeader} title="Schools pipeline" description="Every school we're talking to, from first contact to signed." actions=${html`
        <${Select} ariaLabel="View" value=${view} onChange=${setView} options=${[{ value: "board", label: "Board view" }, { value: "list", label: "List view" }]} />
        <${Button} variant="primary" icon="plus" onClick=${() => setAdding(true)}>Add school<//>`} />
      <${Loaded} res=${res}>${(leads) => {
        const stages = Object.keys(META.leadStage);
        const summary = html`<${Grid} min=${150} gap=${10} style=${{ marginBottom: 16 }}>${stages.map((s) => {
          const list = leads.filter((l) => l.stage === s);
          return html`<${Card} key=${s} style=${{ padding: "10px 14px" }}><${Muted}>${META.leadStage[s].label}<//><div class="tabular" style=${{ fontWeight: 600, fontSize: 16 }}>${fmt.zar(list.reduce((t, l) => t + l.value, 0), { compact: true })}</div><${Muted}>${list.length} ${list.length === 1 ? "school" : "schools"}<//><//>`;
        })}<//>`;
        if (view === "list")
          return html`${summary}<${Card}><${Table} rows=${leads} search=${(l, q) => `${l.school} ${l.city || ""} ${l.contact_name || ""}`.toLowerCase().includes(q)} searchPlaceholder="Search schools…" onRowClick=${(l) => go(`pipeline?lead=${l.id}`)}
            columns=${[
              { key: "school", header: "School", sort: (l) => l.school.toLowerCase(), render: (l) => html`<strong style=${{ fontWeight: 500 }}>${l.school}</strong><br /><${Muted}>${l.city || ""}<//>` },
              { key: "stage", header: "Stage", sort: (l) => stages.indexOf(l.stage), render: (l) => html`<${StatusBadge} meta=${META.leadStage} value=${l.stage} />` },
              { key: "contact", header: "Contact", hideOnMobile: true, render: (l) => l.contact_name || html`<${Muted}>—<//>` },
              { key: "value", header: "Value", align: "right", sort: (l) => l.value, render: (l) => html`<${Money} value=${l.value} />` },
              { key: "follow", header: "Follow up", hideOnMobile: true, sort: (l) => l.next_follow_up, render: (l) => html`<${DueDate} date=${l.next_follow_up} done=${["won", "lost"].includes(l.stage)} />` },
              { key: "owner", header: "Owner", hideOnMobile: true, render: (l) => html`<${UserChip} name=${l.owner_id ? userName(l.owner_id) : null} />` },
            ]} /><//>`;
        return html`${summary}<${Kanban} columns=${columnsOf(META.leadStage)} items=${leads} getColumn=${(l) => l.stage} onMove=${move} minColumnWidth=${230}
          renderCard=${(l) => html`<button onClick=${() => go(`pipeline?lead=${l.id}`)} style=${{ all: "unset", cursor: "pointer", display: "grid", gap: 4, width: "100%" }}>
            <strong style=${{ fontWeight: 600 }}>${l.school}</strong>
            <${Muted}>${[l.city, l.contact_name].filter(Boolean).join(" · ") || "No contact yet"}<//>
            <span style=${{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
              <span class="tabular" style=${{ fontWeight: 600 }}>${l.value ? fmt.zar(l.value) : "—"}</span>
              ${l.next_follow_up && !["won", "lost"].includes(l.stage) && html`<${DueDate} date=${l.next_follow_up} />`}
            </span>
          </button>`} />`;
      }}<//>
      <${FormModal} open=${adding} onClose=${() => setAdding(false)} title="Add a school" fields=${LEAD_FIELDS} submitLabel="Add school"
        onSubmit=${async (v) => {
          await api("POST", "/api/leads", v);
          setAdding(false);
          toast("School added");
          res.reload();
        }} />
      <${LeadDetail} lead=${open} onClose=${() => go("pipeline")} onChanged=${(removed) => { if (removed) go("pipeline"); res.reload(); }} />
    <//>`;
  }

  // ─────────────────────────── Content ───────────────────────────
  function ContentView({ params }) {
    const { user, userName, toast } = useApp();
    const res = useResource("/api/content");
    const act = useAction();
    const [editing, setEditing] = useState(null);
    useOpenFromParam(params.item, res.data, setEditing);
    const [confirm, confirmDialog] = useConfirm();
    const manager = atLeast(user, "manager");
    const move = async (c, stage) => {
      await act(() => api("PATCH", `/api/content/${c.id}`, { stage }), `Moved to ${META.contentStage[stage].label}`);
      res.reload();
    };
    const item = editing && editing !== "new" ? editing : null;
    return html`<${Fragment}>
      <${PageHeader} title="Content" description="Lessons, videos, worksheets and past-paper walkthroughs on their way to learners." actions=${html`<${Button} variant="primary" icon="plus" onClick=${() => setEditing("new")}>New item<//>`} />
      <${Loaded} res=${res}>${(items) => html`<${Kanban} columns=${columnsOf(META.contentStage)} items=${items} getColumn=${(c) => c.stage} onMove=${move} minColumnWidth=${220}
        canMove=${(c, to) => manager || (to !== "published" && c.stage !== "published")}
        renderCard=${(c) => html`<button onClick=${() => setEditing(c)} style=${{ all: "unset", cursor: "pointer", display: "grid", gap: 6, width: "100%" }}>
          <strong style=${{ fontWeight: 500 }}>${c.title}</strong>
          <span style=${{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}><${Badge} tone="outline">${META.contentType[c.type].label}<//>${c.topic && html`<${Muted}>${c.topic}<//>`}</span>
          <span style=${{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><${UserChip} name=${c.owner_id ? userName(c.owner_id) : null} />${c.stage !== "published" && html`<${DueDate} date=${c.due_date} />`}</span>
        </button>`} />`}<//>
      <${FormModal} open=${Boolean(editing)} onClose=${() => { setEditing(null); if (params.item) go("content"); }} title=${item ? "Edit content" : "New content item"} fields=${CONTENT_FIELDS(manager || (item && item.stage === "published"))} initial=${item || { owner_id: user.id }}
        submitLabel=${item ? "Save" : "Add"}
        extraFooter=${item && manager && html`<${Button} variant="ghost" icon="trash-2" style=${{ color: "var(--danger)" }} onClick=${() => confirm(`Delete “${item.title}”?`, async () => { await act(() => api("DELETE", `/api/content/${item.id}`), "Deleted"); setEditing(null); res.reload(); })}>Delete<//>`}
        onSubmit=${async (v) => {
          if (item) await api("PATCH", `/api/content/${item.id}`, item.stage === "published" && !manager ? { ...v, stage: undefined } : v);
          else await api("POST", "/api/content", v);
          setEditing(null);
          toast(item ? "Saved" : "Added to the board");
          res.reload();
        }} />
      ${confirmDialog}
    <//>`;
  }

  // ─────────────────────────── Goals ───────────────────────────
  const plusYear = (iso) => {
    const d = toDate(iso);
    d.setFullYear(d.getFullYear() + 1);
    return addDays(UI.isoDate(d), -1);
  };
  function goalValue(g, v) {
    if (g.progress.unit === "zar") return fmt.zar(v, { compact: Math.abs(v) >= 1e6 });
    return `${fmt.number(v, { decimals: Number.isInteger(v) ? 0 : 1 })}${g.metric === "manual" && g.unit ? ` ${g.unit}` : ""}`;
  }
  const GOAL_TONE = { on_track: "success", at_risk: "warning", behind: "danger", missed: "danger", achieved: "primary", not_started: "primary" };
  function goalPace(g) {
    const p = g.progress;
    if (p.status === "achieved") return "Target reached.";
    if (p.status === "missed") return `Deadline passed at ${goalValue(g, p.current)}.`;
    if (p.status === "not_started") return `Starts ${fmt.date(g.start_date)}.`;
    const expected = p.unit === "zar" || p.target >= 50 ? Math.round(p.expected) : Math.round(p.expected * 10) / 10;
    return `Expected about ${goalValue(g, expected)} by today. ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} left.`;
  }
  function GoalMeter({ g, compact }) {
    const p = g.progress;
    const span = p.target - p.baseline;
    const marker = ["achieved", "missed", "not_started"].includes(p.status) || !span ? null : ((p.expected - p.baseline) / span) * 100;
    return html`<div style=${{ display: "grid", gap: 6 }}>
      <div style=${{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "2px 8px" }}>
        <strong class="tabular" style=${{ fontSize: compact ? 15 : 20, fontWeight: 600 }}>${goalValue(g, p.current)}</strong>
        <${Muted}>of ${goalValue(g, p.target)}<//>
      </div>
      <${UI.Progress} value=${p.pct} tone=${GOAL_TONE[p.status]} label=${`${g.title}: ${Math.round(p.pct)}%`} marker=${marker} markerLabel="Where you should be by today" />
    </div>`;
  }
  const goalFields = (editing) => [
    { name: "title", label: "Goal", type: "text", required: true, full: true, placeholder: "e.g. Sign 12 new schools this year" },
    { name: "metric", label: "How progress is measured", type: "select", options: Object.fromEntries(Object.entries(GOAL_METRICS).map(([k, m]) => [k, { label: m.label }])), default: "schools_won", full: true,
      hint: (v) => (v.metric === "manual" ? "You update the number yourself as you go." : v.metric === "arr" ? "Uses the contracts running on each day." : "Counted automatically from the workspace between the start date and the deadline.") },
    { name: "target", label: "Target", type: "money", required: true },
    { name: "baseline", label: "Starting value", type: "money", show: (v) => v.metric === "manual" || v.metric === "arr", hint: "Where you are now, so progress counts from here." },
    { name: "unit", label: "Unit", type: "text", show: (v) => v.metric === "manual", placeholder: "e.g. subscribers" },
    { name: "start_date", label: "Start", type: "date", required: true, default: today() },
    { name: "due_date", label: "Deadline", type: "date", required: true },
    { name: "owner_id", label: "Owner", type: "user" },
    { name: "notes", label: "Notes", type: "textarea", full: true, rows: 2 },
    ...(editing ? [{ name: "archived", label: "Archived", type: "checkbox", hint: "hidden from the current goals" }] : []),
  ];
  function GoalsView() {
    const { user, userName, toast } = useApp();
    const manager = atLeast(user, "manager");
    const res = useResource("/api/goals");
    const act = useAction();
    const [tab, setTab] = useState("current");
    const [editing, setEditing] = useState(null);
    const [updating, setUpdating] = useState(null);
    const [history, setHistory] = useState(null);
    const historyRes = useResource(history ? `/api/goals/${history.id}/progress` : null);
    const [confirm, confirmDialog] = useConfirm();
    const item = editing && editing !== "new" ? editing : null;
    const now = today();
    return html`<${Fragment}>
      <${PageHeader} title="Goals" description="What the team is aiming for, and whether you're on pace to get there." actions=${manager && html`<${Button} variant="primary" icon="plus" onClick=${() => setEditing("new")}>New goal<//>`} />
      <${Loaded} res=${res}>${(goals) => {
        const current = goals.filter((g) => !g.archived && g.due_date >= now);
        const past = goals.filter((g) => !g.archived && g.due_date < now);
        const archived = goals.filter((g) => g.archived);
        const shown = tab === "current" ? current : tab === "past" ? past : archived;
        const counts = (st) => current.filter((g) => g.progress.status === st).length;
        return html`
          ${current.length > 0 && html`<div style=${{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            ${["on_track", "at_risk", "behind", "achieved"].filter((st) => counts(st)).map((st) => html`<${Badge} key=${st} tone=${META.goalStatus[st].tone} dot>${counts(st)} ${META.goalStatus[st].label.toLowerCase()}<//>`)}
          </div>`}
          <${Tabs} value=${tab} onChange=${setTab} items=${[{ id: "current", label: "Current", count: current.length }, { id: "past", label: "Past", count: past.length }, { id: "archived", label: "Archived", count: archived.length }]} />
          ${shown.length === 0 ? html`<${Card}><${EmptyState} icon="target" title=${tab === "current" ? "No goals yet" : "Nothing here"} description=${tab === "current" && manager ? "Set a goal such as “Sign 12 schools this year”. Most goals track themselves from the workspace." : null} /><//>`
          : html`<${Grid} min=${340}>${shown.map((g) => html`<${Card} key=${g.id} style=${{ padding: 18, display: "grid", gap: 12, alignContent: "start" }}>
            <div style=${{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <strong style=${{ fontSize: 15, fontWeight: 600, textWrap: "balance" }}>${g.title}</strong>
              <${StatusBadge} meta=${META.goalStatus} value=${g.progress.status} />
            </div>
            <${GoalMeter} g=${g} />
            <${Muted}>${goalPace(g)}<//>
            <div style=${{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", fontSize: 12.5, color: "var(--muted-fg)" }}>
              <${UserChip} name=${g.owner_id ? userName(g.owner_id) : null} />
              <span style=${{ display: "inline-flex", alignItems: "center", gap: 4 }}><${Icon} name=${g.metric === "manual" ? "pencil" : "refresh-cw"} size=${12} />${GOAL_METRICS[g.metric].label}</span>
              <span>Due ${fmt.date(g.due_date)}</span>
            </div>
            ${g.notes && html`<${Muted}>${g.notes}<//>`}
            <div style=${{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              ${g.metric === "manual" && (manager || g.owner_id === user.id) && html`<${Button} size="sm" variant="soft" icon="trending-up" onClick=${() => setUpdating(g)}>Update progress<//>`}
              ${g.metric === "manual" && html`<${Button} size="sm" variant="ghost" icon="clock" onClick=${() => setHistory(g)}>History<//>`}
              ${manager && html`<${Button} size="sm" variant="ghost" icon="pencil" onClick=${() => setEditing(g)}>Edit<//>`}
            </div>
          <//>`)}<//>`}`;
      }}<//>
      <${FormModal} open=${Boolean(editing)} onClose=${() => setEditing(null)} title=${item ? "Edit goal" : "New goal"} fields=${goalFields(Boolean(item))} initial=${item ? { ...item, archived: Boolean(item.archived) } : { owner_id: user.id }} submitLabel=${item ? "Save" : "Add goal"}
        extraFooter=${item && html`<${Button} variant="ghost" icon="trash-2" style=${{ color: "var(--danger)" }} onClick=${() => confirm(`Delete “${item.title}” and its history?`, async () => { await act(() => api("DELETE", `/api/goals/${item.id}`), "Goal deleted"); setEditing(null); res.reload(); })}>Delete<//>`}
        onSubmit=${async (v) => {
          if (item) await api("PATCH", `/api/goals/${item.id}`, v);
          else await api("POST", "/api/goals", v);
          setEditing(null);
          toast(item ? "Goal saved" : "Goal added");
          res.reload();
        }} />
      <${FormModal} open=${Boolean(updating)} onClose=${() => setUpdating(null)} title=${updating ? `Update “${updating.title}”` : ""} description=${updating ? `Currently ${goalValue(updating, updating.progress.current)} of ${goalValue(updating, updating.progress.target)}.` : ""}
        fields=${[{ name: "value", label: updating && updating.unit ? `New total (${updating.unit})` : "New total", type: "money", required: true }, { name: "note", label: "What changed?", type: "textarea", full: true, rows: 2 }]}
        initial=${updating ? { value: updating.current_value } : null} submitLabel="Save progress"
        onSubmit=${async (v) => {
          await api("POST", `/api/goals/${updating.id}/progress`, v);
          setUpdating(null);
          toast("Progress saved");
          res.reload();
        }} />
      <${Modal} open=${Boolean(history)} onClose=${() => setHistory(null)} title=${history ? history.title : ""} description="Progress updates, newest first" width=${480}>
        ${historyRes.data && historyRes.data.length === 0 && html`<${Muted}>No updates yet.<//>`}
        ${(historyRes.data || []).map((u) => html`<div class="list-row" key=${u.id} style=${{ alignItems: "flex-start" }}>
          <strong class="tabular" style=${{ minWidth: 80 }}>${history ? goalValue(history, u.value) : u.value}</strong>
          <span style=${{ flex: 1, minWidth: 0, fontSize: 13 }}>${u.note || html`<${Muted}>No note<//>`}<br /><${Muted}>${u.author_name || "Someone"} · ${fmt.date(u.created_at)}<//></span>
        </div>`)}
      <//>
      ${confirmDialog}
    <//>`;
  }

  // ─────────────────────────── Contracts & renewals ───────────────────────────
  const contractFields = (leads) => [
    { name: "lead_id", label: "School", type: "select", required: true, full: true, placeholder: "Choose a school",
      options: [...leads].sort((a, b) => (b.stage === "won") - (a.stage === "won") || a.school.localeCompare(b.school)).map((l) => ({ value: l.id, label: `${l.school}${l.stage === "won" ? "" : ` (${META.leadStage[l.stage].label})`}` })) },
    { name: "start_date", label: "Starts", type: "date", required: true },
    { name: "end_date", label: "Ends", type: "date", required: true, hint: "Usually a year after the start." },
    { name: "annual_value", label: "Value per year (R)", type: "money", required: true },
    { name: "learners", label: "Learners covered", type: "number" },
    { name: "notes", label: "Notes", type: "textarea", full: true, rows: 2 },
  ];
  const renewFields = [
    { name: "start_date", label: "New term starts", type: "date", required: true },
    { name: "end_date", label: "New term ends", type: "date", required: true },
    { name: "annual_value", label: "Value per year (R)", type: "money", required: true },
    { name: "learners", label: "Learners covered", type: "number" },
    { name: "notes", label: "Notes", type: "textarea", full: true, rows: 2 },
  ];
  function DaysLeft({ c }) {
    if (["renewed", "ended", "not_renewing"].includes(c.state)) return html`<${Muted}>${c.state === "not_renewing" ? `Ends ${fmt.date(c.end_date)}` : `Ended ${fmt.date(c.end_date)}`}<//>`;
    if (c.state === "upcoming") return html`<${Muted}>Starts ${fmt.date(c.start_date)}<//>`;
    const d = c.days_left;
    const tone = d < 0 ? "var(--danger)" : d <= 30 ? "var(--danger)" : d <= 60 ? "var(--warning)" : "var(--muted-fg)";
    return html`<span class="tabular" style=${{ display: "inline-flex", alignItems: "center", gap: 4, color: tone, whiteSpace: "nowrap", fontSize: 13 }}>${d <= 60 && html`<${Icon} name=${d <= 30 ? "triangle-alert" : "clock"} size=${13} />`}${d < 0 ? `Ended ${-d} day${d === -1 ? "" : "s"} ago` : `${d} day${d === 1 ? "" : "s"} left`}</span>`;
  }
  /** Renew / not renewing / edit dialogs for one contract, shared by the contracts page and the dashboard. */
  function useContractActions(onChanged) {
    const { toast } = useApp();
    const [renewing, setRenewing] = useState(null);
    const [ending, setEnding] = useState(null);
    const dialogs = html`
      <${FormModal} open=${Boolean(renewing)} onClose=${() => setRenewing(null)} title=${renewing ? `Renew ${renewing.school}` : ""} description="Starts a new term. The current contract is marked as renewed." fields=${renewFields}
        initial=${renewing ? { start_date: addDays(renewing.end_date, 1), end_date: plusYear(addDays(renewing.end_date, 1)), annual_value: renewing.annual_value, learners: renewing.learners } : null} submitLabel="Renew contract"
        onSubmit=${async (v) => {
          await api("POST", `/api/contracts/${renewing.id}/renew`, v);
          toast(`${renewing.school} renewed`);
          setRenewing(null);
          onChanged();
        }} />
      <${FormModal} open=${Boolean(ending)} onClose=${() => setEnding(null)} title=${ending ? `${ending.school} isn't renewing` : ""} description=${ending ? `The contract still runs until ${fmt.date(ending.end_date)}.` : ""}
        fields=${[{ name: "reason", label: "Why not?", type: "textarea", full: true, rows: 3, hint: "Helps when you try again next year." }]} submitLabel="Save"
        onSubmit=${async (v) => {
          await api("POST", `/api/contracts/${ending.id}/end`, v);
          toast("Saved");
          setEnding(null);
          onChanged();
        }} />`;
    return { renew: setRenewing, end: setEnding, dialogs };
  }
  function ContractsView({ params }) {
    const { user, userName, toast } = useApp();
    const manager = atLeast(user, "manager");
    const res = useResource("/api/contracts");
    const summary = useResource("/api/contracts/summary");
    const leads = useResource("/api/leads");
    const act = useAction();
    const [filter, setFilter] = useState("");
    const [editing, setEditing] = useState(null);
    const [confirm, confirmDialog] = useConfirm();
    const reload = () => {
      res.reload();
      summary.reload();
    };
    const actions = useContractActions(reload);
    const openId = params.contract ? Number(params.contract) : null;
    const open = (res.data || []).find((c) => c.id === openId) || null;
    const item = editing && editing !== "new" ? editing : null;
    return html`<${Fragment}>
      <${PageHeader} title="Contracts & renewals" description="Every school under contract, what they're worth, and which renewals need attention." actions=${manager && html`<${Button} variant="primary" icon="plus" onClick=${() => setEditing("new")}>Add contract<//>`} />
      <${Loaded} res=${summary}>${(s) => html`<${Grid} min=${200} style=${{ marginBottom: 16 }}>
        <${Kpi} label="Annual recurring revenue" icon="banknote" value=${fmt.zar(s.arr)} sub=${`${fmt.zar(s.arr / 12)} a month`} />
        <${Kpi} label="Schools under contract" icon="school" value=${fmt.number(s.schools)} sub=${`${fmt.number(s.learners)} learners covered`} />
        <${Kpi} label="Renewals to decide" icon="clock" value=${fmt.number(s.dueCount)} sub=${s.dueCount ? `${fmt.zar(s.dueValue)} a year at stake` : "Nothing due in the next 90 days"} />
        <${Kpi} label="Renewal rate" icon="refresh-cw" value=${s.renewalRate === null ? "—" : fmt.percent(s.renewalRate * 100)} sub=${s.renewed + s.notRenewed ? `${s.renewed} renewed, ${s.notRenewed} didn't, last 12 months` : "No renewals decided yet"} />
      <//>`}<//>
      <${Loaded} res=${res}>${(rows) => {
        const due = rows.filter((c) => ["due", "lapsed"].includes(c.state)).sort((a, b) => a.days_left - b.days_left);
        const shown = filter ? rows.filter((c) => c.state === filter) : rows;
        return html`<div style=${{ display: "grid", gap: 16 }}>
          ${due.length > 0 && html`<${Section} title="Needs a decision" description="Contracts ending within 90 days. Reminders go out at 60 and 30 days.">
            ${due.map((c) => html`<div class="list-row" key=${c.id} style=${{ flexWrap: "wrap" }}>
              <button onClick=${() => go(`contracts?contract=${c.id}`)} style=${{ all: "unset", cursor: "pointer", flex: "1 1 220px", minWidth: 0 }}><strong style=${{ fontWeight: 500 }}>${c.school}</strong><br /><${Muted}>${fmt.zar(c.annual_value)} a year · ends ${fmt.date(c.end_date)} · ${userName(c.owner_id)}<//></button>
              <${DaysLeft} c=${c} />
              ${manager && html`<span style=${{ display: "flex", gap: 6 }}><${Button} size="sm" variant="primary" icon="refresh-cw" onClick=${() => actions.renew(c)}>Renew<//><${Button} size="sm" onClick=${() => actions.end(c)}>Not renewing<//></span>`}
            </div>`)}
          <//>`}
          <${Card}><${Table} rows=${shown} search=${(c, q) => c.school.toLowerCase().includes(q)} searchPlaceholder="Search schools…" onRowClick=${(c) => go(`contracts?contract=${c.id}`)}
            toolbar=${html`<${Select} ariaLabel="Status" value=${filter} onChange=${setFilter} placeholder="All contracts" options=${META.contractState} />`}
            empty=${html`<${EmptyState} icon="file-text" title="No contracts yet" description="Add a contract when a school signs, so renewals and recurring revenue track themselves." />`}
            columns=${[
              { key: "school", header: "School", sort: (c) => c.school.toLowerCase(), render: (c) => html`<strong style=${{ fontWeight: 500 }}>${c.school}</strong><br /><${Muted}>${c.city || ""}<//>` },
              { key: "term", header: "Term", hideOnMobile: true, sort: (c) => c.end_date, render: (c) => html`<span style=${{ whiteSpace: "nowrap" }}>${fmt.shortDate(c.start_date)} – ${fmt.date(c.end_date)}</span>` },
              { key: "value", header: "Per year", align: "right", sort: (c) => c.annual_value, render: (c) => html`<${Money} value=${c.annual_value} />` },
              { key: "learners", header: "Learners", align: "right", hideOnMobile: true, sort: (c) => c.learners || 0, render: (c) => (c.learners ? fmt.number(c.learners) : "—") },
              { key: "state", header: "Status", render: (c) => html`<${StatusBadge} meta=${META.contractState} value=${c.state} />` },
              { key: "left", header: "Time left", hideOnMobile: true, sort: (c) => c.days_left, render: (c) => html`<${DaysLeft} c=${c} />` },
            ]} /><//>
        </div>`;
      }}<//>
      ${open && html`<${Modal} open=${true} onClose=${() => go("contracts")} title=${open.school} description=${`${fmt.date(open.start_date)} – ${fmt.date(open.end_date)}`} width=${560}
        footer=${html`${manager && html`<${Button} variant="ghost" icon="trash-2" style=${{ color: "var(--danger)" }} onClick=${() => confirm(`Delete this contract with ${open.school}? Use “Not renewing” instead if the school is leaving.`, async () => { await act(() => api("DELETE", `/api/contracts/${open.id}`), "Contract deleted"); go("contracts"); reload(); })}>Delete<//>`}
          <span style=${{ flex: 1 }} />
          ${manager && open.status === "active" && html`<${Button} onClick=${() => actions.end(open)}>Not renewing<//><${Button} icon="refresh-cw" onClick=${() => actions.renew(open)}>Renew<//>`}
          ${manager && html`<${Button} variant="primary" icon="pencil" onClick=${() => setEditing(open)}>Edit<//>`}`}>
        <div style=${{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}><${StatusBadge} meta=${META.contractState} value=${open.state} /><${DaysLeft} c=${open} /></div>
        <div class="form-grid">
          <div><${Muted}>Value per year<//><div class="tabular" style=${{ fontSize: 18, fontWeight: 600 }}>${fmt.zar(open.annual_value)}</div></div>
          <div><${Muted}>Learners<//><div class="tabular" style=${{ fontSize: 18, fontWeight: 600 }}>${open.learners ? fmt.number(open.learners) : "—"}</div></div>
          <div><${Muted}>School owner<//><div>${userName(open.owner_id)}</div></div>
        </div>
        ${open.notes && html`<p class="pre" style=${{ margin: 0, fontSize: 13.5 }}>${open.notes}</p>`}
        ${open.end_reason && html`<div style=${{ fontSize: 13, padding: "8px 12px", borderRadius: 8, background: "var(--subtle)", border: "1px solid var(--border)" }}>Not renewing: ${open.end_reason}</div>`}
        <div>
          <strong style=${{ fontSize: 13 }}>All terms with this school</strong>
          ${(res.data || []).filter((c) => c.lead_id === open.lead_id).sort((a, b) => b.start_date.localeCompare(a.start_date)).map((c) => html`<div class="list-row" key=${c.id} style=${{ fontSize: 13 }}>
            <span style=${{ flex: 1 }}>${fmt.date(c.start_date)} – ${fmt.date(c.end_date)}</span><span class="tabular">${fmt.zar(c.annual_value)}</span><${StatusBadge} meta=${META.contractState} value=${c.state} />
          </div>`)}
        </div>
        <a href=${`#/pipeline?lead=${open.lead_id}`} style=${{ fontSize: 13, color: "var(--primary)" }}>Open the school's notes and follow-ups</a>
      <//>`}
      <${FormModal} open=${Boolean(editing)} onClose=${() => setEditing(null)} title=${item ? `Edit contract with ${item.school}` : "Add a contract"} fields=${contractFields(leads.data || [])}
        initial=${item || { start_date: today(), end_date: plusYear(today()) }} submitLabel=${item ? "Save" : "Add contract"}
        onSubmit=${async (v) => {
          if (item) await api("PATCH", `/api/contracts/${item.id}`, v);
          else await api("POST", "/api/contracts", v);
          setEditing(null);
          toast(item ? "Contract saved" : "Contract added");
          reload();
        }} />
      ${actions.dialogs}
      ${confirmDialog}
    <//>`;
  }

  // ─────────────────────────── Calendar ───────────────────────────
  const EVENT_TYPES = {
    meeting: { label: "Meeting", icon: "notebook-pen", slot: 5, href: (e) => `meetings?meeting=${e.id}` },
    task: { label: "Task due", icon: "list-checks", slot: 1, href: (e) => `tasks?task=${e.id}` },
    followup: { label: "School follow-up", icon: "school", slot: 4, href: (e) => `pipeline?lead=${e.id}` },
    content: { label: "Content due", icon: "video", slot: 3, href: (e) => `content?item=${e.id}` },
    renewal: { label: "Contract ends", icon: "file-text", slot: 6, href: (e) => `contracts?contract=${e.id}` },
  };
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  function EventChip({ e }) {
    const t = EVENT_TYPES[e.type];
    return html`<a href=${`#/${t.href(e)}`} title=${`${t.label}: ${e.title}`} style=${{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, padding: "2px 6px", borderRadius: 5, fontSize: 12, lineHeight: "18px", textDecoration: e.done ? "line-through" : "none",
      color: e.done ? "var(--muted-fg)" : "var(--fg)", background: `color-mix(in oklab, var(--chart-${t.slot}) 13%, var(--card))`, borderLeft: `3px solid var(--chart-${t.slot})` }}>
      <span style=${{ display: "inline-flex", flexShrink: 0, color: "var(--muted-fg)" }}><${Icon} name=${t.icon} size=${11} /></span>
      <span style=${{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>${e.title}</span>
    </a>`;
  }
  function CalendarView() {
    const { user, userName } = useApp();
    const narrow = UI.useNarrow();
    const [month, setMonth] = useState(() => `${today().slice(0, 7)}-01`);
    const [mineOnly, setMineOnly] = useState(false);
    const [dayOpen, setDayOpen] = useState(null);
    const first = toDate(month);
    const offset = (first.getDay() + 6) % 7; // Monday-first weeks
    const days = Array.from({ length: 42 }, (_, i) => addDays(month, i - offset));
    const res = useResource(`/api/calendar?from=${days[0]}&to=${days[41]}`);
    const shift = (n) => {
      const d = toDate(month);
      d.setMonth(d.getMonth() + n);
      setMonth(`${UI.isoDate(d).slice(0, 7)}-01`);
    };
    const order = Object.keys(EVENT_TYPES);
    const events = (res.data || []).filter((e) => !mineOnly || e.person_id === user.id || e.type === "meeting").sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.done - b.done);
    const byDay = {};
    for (const e of events) (byDay[e.date] = byDay[e.date] || []).push(e);
    const thisMonth = month.slice(0, 7);
    const now = today();
    const title = first.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
    const legend = html`<div style=${{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 12, color: "var(--muted-fg)" }}>${order.map((k) => html`<span key=${k} style=${{ display: "inline-flex", alignItems: "center", gap: 6 }}><span aria-hidden="true" style=${{ width: 10, height: 10, borderRadius: 3, background: `var(--chart-${EVENT_TYPES[k].slot})` }} /><${Icon} name=${EVENT_TYPES[k].icon} size=${12} />${EVENT_TYPES[k].label}</span>`)}</div>`;
    return html`<${Fragment}>
      <${PageHeader} title="Calendar" description="Meetings, task deadlines, school follow-ups and content due dates in one place." actions=${html`
        <label style=${{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}><input type="checkbox" checked=${mineOnly} onChange=${(e) => setMineOnly(e.target.checked)} />Only mine</label>
        <${Button} icon="chevron-left" ariaLabel="Previous month" onClick=${() => shift(-1)} />
        <${Button} onClick=${() => setMonth(`${now.slice(0, 7)}-01`)}>Today<//>
        <${Button} icon="chevron-right" ariaLabel="Next month" onClick=${() => shift(1)} />`} />
      <${Card} style=${{ padding: 16, display: "grid", gap: 12 }}>
        <div style=${{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <h2 style=${{ margin: 0, fontSize: 18 }}>${title}</h2>${legend}
        </div>
        ${res.error && !res.data ? html`<${EmptyState} icon="triangle-alert" title="Couldn't load the calendar" description=${res.error.message} />`
          : narrow ? html`<div>
            ${days.filter((d) => d.slice(0, 7) === thisMonth && byDay[d]).length === 0 && html`<${EmptyState} icon="calendar-days" title="Nothing scheduled this month" />`}
            ${days.filter((d) => d.slice(0, 7) === thisMonth && byDay[d]).map((d) => html`<div key=${d} style=${{ padding: "10px 0", borderTop: "1px solid var(--border)", display: "grid", gap: 6 }}>
              <strong style=${{ fontSize: 13, color: d === now ? "var(--primary)" : undefined }}>${toDate(d).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "short" })}${d === now ? " · Today" : ""}</strong>
              ${byDay[d].map((e) => html`<${EventChip} key=${e.type + e.id} e=${e} />`)}
            </div>`)}
          </div>`
          : html`<div role="grid" aria-label=${title} style=${{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            ${WEEKDAYS.map((w) => html`<div key=${w} role="columnheader" style=${{ padding: "6px 8px", fontSize: 11.5, fontWeight: 600, color: "var(--muted-fg)", background: "var(--subtle)", borderBottom: "1px solid var(--border)" }}>${w}</div>`)}
            ${days.map((d, i) => {
              const list = byDay[d] || [];
              const inMonth = d.slice(0, 7) === thisMonth;
              return html`<div key=${d} role="gridcell" style=${{ minHeight: 108, padding: 6, display: "flex", flexDirection: "column", gap: 3, minWidth: 0, background: inMonth ? "var(--card)" : "var(--subtle)", borderTop: i >= 7 ? "1px solid var(--border)" : 0, borderLeft: i % 7 ? "1px solid var(--border)" : 0 }}>
                <span class="tabular" style=${{ alignSelf: "flex-start", fontSize: 12, fontWeight: d === now ? 700 : 500, color: d === now ? "var(--primary-fg)" : inMonth ? "var(--fg)" : "var(--muted-fg)", background: d === now ? "var(--primary)" : "transparent", borderRadius: 99, minWidth: 22, height: 22, display: "grid", placeItems: "center", padding: "0 5px" }}>${Number(d.slice(8))}</span>
                ${list.slice(0, 3).map((e) => html`<${EventChip} key=${e.type + e.id} e=${e} />`)}
                ${list.length > 3 && html`<button onClick=${() => setDayOpen(d)} style=${{ all: "unset", cursor: "pointer", fontSize: 11.5, color: "var(--primary)", padding: "0 6px" }}>+${list.length - 3} more</button>`}
              </div>`;
            })}
          </div>`}
      <//>
      <${Modal} open=${Boolean(dayOpen)} onClose=${() => setDayOpen(null)} title=${dayOpen ? toDate(dayOpen).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" }) : ""} width=${460}>
        ${(byDay[dayOpen] || []).map((e) => html`<div key=${e.type + e.id} style=${{ display: "grid", gap: 2 }}><${EventChip} e=${e} />${e.person_id && html`<${Muted}>${EVENT_TYPES[e.type].label} · ${userName(e.person_id)}<//>`}</div>`)}
      <//>
    <//>`;
  }

  // ─────────────────────────── Bank statement import ───────────────────────────
  /** Reads CSV text (comma, semicolon or tab separated; quoted fields) into rows of trimmed cells. */
  function parseCsv(text) {
    text = text.replace(/^﻿/, "");
    const sample = text.split(/\r?\n/).slice(0, 15).join("\n");
    const delim = [",", ";", "\t"].map((d) => [d, sample.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
          field += '"';
          i++;
        } else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === delim) {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.map((r) => r.map((cell) => cell.trim())).filter((r) => r.some(Boolean));
  }
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const DATE_FORMATS = {
    ymd: { label: "2026-10-31 / 2026/10/31", parse: (v) => { const m = v.match(/^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})/); return m && [m[1], m[2], m[3]]; } },
    dmy: { label: "31/10/2026 (day first)", parse: (v) => { const m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/); return m && [m[3].length === 2 ? `20${m[3]}` : m[3], m[2], m[1]]; } },
    mdy: { label: "10/31/2026 (month first)", parse: (v) => { const m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/); return m && [m[3].length === 2 ? `20${m[3]}` : m[3], m[1], m[2]]; } },
    dmon: { label: "31 Oct 2026", parse: (v) => { const m = v.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-](\d{4})/); const mo = m && MONTHS[m[2].toLowerCase().slice(0, m[2].toLowerCase().startsWith("sept") ? 4 : 3)]; return mo && [m[3], String(mo), m[1]]; } },
  };
  function parseDate(value, format) {
    const parts = DATE_FORMATS[format].parse(String(value || "").trim());
    if (!parts) return null;
    const [y, m, d] = parts.map(Number);
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const check = new Date(`${iso}T00:00:00Z`);
    return !Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === iso ? iso : null;
  }
  /** "R 1 234.56", "-1,234.56", "1234,56", "(99.00)", "250.00 Dr", "250.00-" → signed number, or null. */
  function parseAmount(value) {
    let v = String(value || "").replace(/[R\s ]/g, "");
    if (!v) return null;
    let sign = 1;
    if (/^\(.*\)$/.test(v)) {
      sign = -1;
      v = v.slice(1, -1);
    }
    if (/dr$/i.test(v)) {
      sign = -sign;
      v = v.slice(0, -2);
    } else if (/cr$/i.test(v)) v = v.slice(0, -2);
    if (v.endsWith("-")) {
      sign = -sign;
      v = v.slice(0, -1);
    }
    if (v.includes(",") && v.includes(".")) v = v.replace(/,/g, "");
    else if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, "").replace(",", ".");
    else v = v.replace(/,/g, "");
    const n = Number(v);
    return Number.isFinite(n) ? sign * n : null;
  }
  function sampleStatement() {
    const d = new Date();
    const at = (day) => `${String(Math.min(day, d.getDate())).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    return [
      "Account,Integral Academy (Pty) Ltd - Business Cheque",
      "",
      "Date,Description,Amount,Balance",
      `${at(1)},Co-working desks,-6500.00,186370.00`,
      `${at(2)},PayFast payout,"2 350,75",188720.75`,
      `${at(3)},Google Workspace,-1240.00,187480.75`,
      `${at(4)},Uber trip to Soweto,-186.40,187294.35`,
      `${at(5)},School licence - Thuto-Lesedi Secondary,4000.00,191294.35`,
      `${at(6)},Takealot - tripod,-899.00,190395.35`,
      `${at(7)},Meta Ads,-2500.00,187895.35`,
      `${at(8)},Vodacom data bundle,-599.00,187296.35`,
      `${at(9)},Closing balance,,187296.35`,
    ].join("\n");
  }
  function guessColumn(headers, patterns) {
    for (const p of patterns) {
      const i = headers.findIndex((h) => p.test(h));
      if (i >= 0) return String(i);
    }
    return "";
  }
  function ImportModal({ open, onClose, onImported }) {
    const [table, setTable] = useState(null); // { name, headers, rows }
    const [map, setMap] = useState({});
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    useEffect(() => {
      if (open) {
        setTable(null);
        setMap({});
        setError("");
        setResult(null);
      }
    }, [open]);
    const loadText = (text, name) => {
      const rows = parseCsv(text);
      if (!rows.length) return setError("That file is empty.");
      // The header is the first row with the most common column count (skips bank preamble lines).
      const counts = {};
      for (const r of rows) counts[r.length] = (counts[r.length] || 0) + 1;
      const width = Number(Object.entries(counts).filter(([w]) => Number(w) >= 3).sort((a, b) => b[1] - a[1])[0]?.[0]);
      if (!width) return setError("This doesn't look like a bank statement. It needs at least a date, a description and an amount column.");
      const start = rows.findIndex((r) => r.length === width);
      const first = rows[start];
      const hasHeader = !first.some((c) => Object.keys(DATE_FORMATS).some((f) => parseDate(c, f)) || parseAmount(c) !== null);
      const headers = hasHeader ? first.map((h, i) => h || `Column ${i + 1}`) : first.map((_, i) => `Column ${i + 1}`);
      const body = rows.slice(hasHeader ? start + 1 : start).filter((r) => r.length >= Math.min(3, width));
      if (body.length > 2000) return setError("That statement has more than 2 000 rows. Export a shorter date range.");
      const date = guessColumn(headers, [/date/i]) || "0";
      const ins = guessColumn(headers, [/credit|money in|deposit|^in$/i]);
      const outs = guessColumn(headers, [/debit|money out|withdraw|^out$/i]);
      const formatScores = Object.keys(DATE_FORMATS).map((f) => [f, body.slice(0, 30).filter((r) => parseDate(r[Number(date)], f)).length]);
      const format = formatScores.sort((a, b) => b[1] - a[1] || (a[0] === "dmy" ? -1 : 0))[0][0];
      setTable({ name, headers, rows: body });
      setMap({
        date, format,
        description: guessColumn(headers, [/desc|narr|detail|transaction|reference|particular/i]) || "1",
        mode: ins && outs ? "split" : "single",
        amount: guessColumn(headers, [/^amount|amount/i]) || "2", ins, outs, flip: false,
      });
      setError("");
    };
    const onFile = (file) => {
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) return setError("That file is too big. Export a shorter date range.");
      const reader = new FileReader();
      reader.onload = () => loadText(String(reader.result), file.name);
      reader.onerror = () => setError("Couldn't read that file.");
      reader.readAsText(file);
    };
    const parsed = useMemo(() => {
      if (!table) return null;
      const ok = [];
      const bad = [];
      table.rows.forEach((r, i) => {
        const date = parseDate(r[Number(map.date)], map.format);
        const description = (r[Number(map.description)] || "").slice(0, 200);
        let signed = null;
        if (map.mode === "single") {
          const a = parseAmount(r[Number(map.amount)]);
          signed = a === null ? null : map.flip ? -a : a;
        } else {
          const a = Math.abs(parseAmount(r[Number(map.ins)]) || 0);
          const b = Math.abs(parseAmount(r[Number(map.outs)]) || 0);
          signed = a ? a : b ? -b : null;
        }
        if (!date) bad.push({ line: i + 1, why: `Date “${r[Number(map.date)] || ""}” doesn't match the date format` });
        else if (!signed) bad.push({ line: i + 1, why: `No amount${description ? ` (${description})` : ""}` });
        else if (!description) bad.push({ line: i + 1, why: "No description" });
        else ok.push({ date, description, kind: signed > 0 ? "income" : "expense", amount: Math.round(Math.abs(signed) * 100) / 100 });
      });
      return { ok, bad };
    }, [table, map]);
    const doImport = async () => {
      setBusy(true);
      setError("");
      try {
        setResult(await api("POST", "/api/transactions/import", { rows: parsed.ok }));
        onImported();
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    };
    const columnOptions = table ? table.headers.map((h, i) => ({ value: String(i), label: h })) : [];
    const set = (k) => (v) => setMap((m) => ({ ...m, [k]: v }));
    const pick = (id, label, key) => html`<${Field} id=${id} label=${label}><${Select} id=${id} value=${map[key]} onChange=${set(key)} options=${columnOptions} style=${{ width: "100%" }} /><//>`;
    const footer = result
      ? html`<${Button} variant="primary" onClick=${onClose}>Done<//>`
      : html`${table && html`<${Button} variant="ghost" onClick=${() => setTable(null)}>Choose another file<//>`}<span style=${{ flex: 1 }} /><${Button} onClick=${onClose}>Cancel<//>
        ${table && html`<${Button} variant="primary" icon="upload" disabled=${busy || !parsed || !parsed.ok.length} onClick=${doImport}>${busy ? "Importing…" : `Import ${parsed ? parsed.ok.length : 0} transactions`}<//>`}`;
    return html`<${Modal} open=${open} onClose=${onClose} title="Import a bank statement" description="Turn your bank's CSV export into transactions. Rows already recorded are skipped." width=${880} footer=${footer}>
      ${result ? html`<div style=${{ display: "grid", gap: 10 }}>
          <${EmptyState} icon="check" title=${`Imported ${result.imported} transaction${result.imported === 1 ? "" : "s"}`} description=${[result.duplicates ? `${result.duplicates} already recorded, so skipped.` : "", result.invalid.length ? `${result.invalid.length} couldn't be saved.` : "", "Categories were copied from earlier transactions with the same description; the rest are marked Uncategorised so you can sort them in the table."].filter(Boolean).join(" ")} />
        </div>`
      : !table ? html`<div style=${{ display: "grid", gap: 14 }}>
          <${Field} id="statement-file" label="Statement file (.csv)" hint="In your online banking, download or export your transactions as CSV. FNB, Standard Bank, Absa, Nedbank, Capitec and most other banks offer this.">
            <input id="statement-file" type="file" accept=".csv,text/csv,text/plain" onChange=${(e) => onFile(e.target.files[0])} />
          <//>
          <div><${Button} size="sm" variant="soft" icon="file-spreadsheet" onClick=${() => loadText(sampleStatement(), "sample-statement.csv")}>Try a sample statement<//></div>
        </div>`
      : html`<div style=${{ display: "grid", gap: 14 }}>
          <div><${Muted}>${table.name} · ${table.rows.length} rows. Check that the columns are matched correctly.<//></div>
          <div class="form-grid">
            ${pick("map-date", "Date column", "date")}
            <${Field} id="map-format" label="Date format"><${Select} id="map-format" value=${map.format} onChange=${set("format")} options=${Object.entries(DATE_FORMATS).map(([value, f]) => ({ value, label: f.label }))} style=${{ width: "100%" }} /><//>
            ${pick("map-desc", "Description column", "description")}
            <${Field} id="map-mode" label="Amounts"><${Select} id="map-mode" value=${map.mode} onChange=${set("mode")} options=${[{ value: "single", label: "One column (minus = money out)" }, { value: "split", label: "Separate money in / out columns" }]} style=${{ width: "100%" }} /><//>
            ${map.mode === "single" ? pick("map-amount", "Amount column", "amount") : html`${pick("map-in", "Money in column", "ins")}${pick("map-out", "Money out column", "outs")}`}
            ${map.mode === "single" && html`<label style=${{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, alignSelf: "end", paddingBottom: 8 }}><input type="checkbox" checked=${map.flip} onChange=${(e) => set("flip")(e.target.checked)} />Money out shows as a positive number</label>`}
          </div>
          ${parsed && html`<div style=${{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <${Badge} tone="success" dot>${parsed.ok.filter((r) => r.kind === "income").length} money in<//>
            <${Badge} dot>${parsed.ok.filter((r) => r.kind === "expense").length} money out<//>
            ${parsed.bad.length > 0 && html`<${Badge} tone="warning" dot title=${parsed.bad.slice(0, 8).map((b) => `Row ${b.line}: ${b.why}`).join("\n")}>${parsed.bad.length} row${parsed.bad.length === 1 ? "" : "s"} will be left out<//>`}
          </div>`}
          ${parsed && parsed.bad.length > 0 && html`<${Muted}>Left out: ${parsed.bad.slice(0, 3).map((b) => `row ${b.line} (${b.why})`).join("; ")}${parsed.bad.length > 3 ? "…" : ""}. Balance lines are normal to leave out.<//>`}
          <div style=${{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
            <table style=${{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>${["Date", "Description", "Type", "Amount"].map((h) => html`<th key=${h} style=${{ textAlign: h === "Amount" ? "right" : "left", padding: "8px 12px", color: "var(--muted-fg)", fontWeight: 500, borderBottom: "1px solid var(--border)" }}>${h}</th>`)}</tr></thead>
              <tbody>${(parsed ? parsed.ok.slice(0, 12) : []).map((r, i) => html`<tr key=${i} style=${{ borderTop: i ? "1px solid var(--border)" : 0 }}>
                <td style=${{ padding: "7px 12px", whiteSpace: "nowrap" }}>${fmt.date(r.date)}</td>
                <td style=${{ padding: "7px 12px" }}>${r.description}</td>
                <td style=${{ padding: "7px 12px" }}><${StatusBadge} meta=${META.kind} value=${r.kind} /></td>
                <td class="tabular" style=${{ padding: "7px 12px", textAlign: "right", whiteSpace: "nowrap" }}>${r.kind === "expense" ? "−" : "+"}${fmt.zar(r.amount)}</td>
              </tr>`)}</tbody>
            </table>
          </div>
          ${parsed && parsed.ok.length > 12 && html`<${Muted}>…and ${parsed.ok.length - 12} more.<//>`}
        </div>`}
      ${error && html`<div role="alert" style=${{ padding: "8px 12px", borderRadius: 8, background: "var(--danger-soft)", color: "var(--danger)", fontSize: 13 }}>${error}</div>`}
    <//>`;
  }

  // ─────────────────────────── Finance ───────────────────────────
  function downloadCsv(name, rows) {
    const esc = (v) => {
      // Text that a spreadsheet would run as a formula gets a leading apostrophe; numbers stay numbers.
      let s = v === null || v === undefined ? "" : String(v);
      if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const text = rows.map((r) => r.map(esc).join(",")).join("\r\n");
    if (window.WS_PREVIEW) return window.dispatchEvent(new CustomEvent("ws:preview-file", { detail: { name, text } }));
    const blob = new Blob([text], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const monthOptions = (fromOffset, count, dir = -1) => Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + fromOffset + dir * i);
    return { value: UI.isoDate(d).slice(0, 7), label: d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" }) };
  });
  function useDebounced(value, ms = 400) {
    const [v, setV] = useState(value);
    useEffect(() => {
      const t = setTimeout(() => setV(value), ms);
      return () => clearTimeout(t);
    }, [value, ms]);
    return v;
  }
  /** One budget line: spend against budget, with a tick for how far through the month we are. */
  function BudgetLine({ r, elapsed, current }) {
    const pct = r.budget ? (r.actual / r.budget) * 100 : 100;
    const over = r.actual > r.budget;
    const nearly = !over && pct >= 90 && r.actual < r.budget;
    const tone = over ? "danger" : nearly ? "warning" : "primary";
    return html`<div style=${{ display: "grid", gap: 6, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <div style=${{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "2px 12px", fontSize: 13.5 }}>
        <span style=${{ fontWeight: 500 }}>${r.category}</span>
        <span class="tabular"><strong style=${{ fontWeight: 600 }}>${fmt.zar(r.actual)}</strong> <${Muted}>of ${fmt.zar(r.budget)}<//></span>
      </div>
      <${UI.Progress} value=${pct} tone=${tone} label=${`${r.category}: ${Math.round(pct)}% of budget`} marker=${current ? elapsed * 100 : null} markerLabel="How far through the month we are" />
      ${(over || nearly) && html`<span style=${{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: over ? "var(--danger)" : "var(--warning)" }}><${Icon} name="triangle-alert" size=${12} />${over ? `Over budget by ${fmt.zar(r.actual - r.budget)}` : `Almost used up: ${fmt.zar(r.budget - r.actual)} left`}</span>`}
    </div>`;
  }
  function BudgetEditor({ open, onClose, onSaved, transactions }) {
    const [lines, setLines] = useState([]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const averages = useMemo(() => {
      const keys = monthOptions(-1, 3).map((m) => m.value);
      const totals = {};
      for (const t of transactions || []) if (t.kind === "expense" && keys.includes(t.date.slice(0, 7))) totals[t.category] = (totals[t.category] || 0) + t.amount;
      return Object.fromEntries(Object.entries(totals).map(([c, v]) => [c, Math.round(v / 3 / 100) * 100]));
    }, [transactions]);
    useEffect(() => {
      if (!open) return;
      setError("");
      api("GET", "/api/budgets").then((rows) => setLines(rows.length ? rows.map((r) => ({ category: r.category, monthly_amount: String(r.monthly_amount) })) : [{ category: "", monthly_amount: "" }])).catch((e) => setError(e.message));
    }, [open]);
    const set = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
    const fill = () => setLines((ls) => {
      const have = new Set(ls.filter((l) => l.category).map((l) => l.category));
      return [...ls.filter((l) => l.category), ...Object.entries(averages).filter(([c]) => !have.has(c)).map(([category, v]) => ({ category, monthly_amount: String(v) }))];
    });
    const save = async () => {
      setBusy(true);
      setError("");
      try {
        await api("PUT", "/api/budgets", { items: lines.filter((l) => l.category.trim()).map((l) => ({ category: l.category.trim(), monthly_amount: l.monthly_amount || 0 })) });
        onSaved();
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    };
    const total = lines.reduce((sum, l) => sum + (Number(l.monthly_amount) || 0), 0);
    return html`<${Modal} open=${open} onClose=${onClose} title="Monthly budget" description="How much you plan to spend each month, per category. The forecast uses this total." width=${620}
      footer=${html`<${Button} variant="ghost" icon="sparkles" onClick=${fill}>Add 3-month averages<//><span style=${{ flex: 1 }} /><${Button} onClick=${onClose}>Cancel<//><${Button} variant="primary" disabled=${busy} onClick=${save}>${busy ? "Saving…" : "Save budget"}<//>`}>
      <div style=${{ display: "grid", gap: 8 }}>
        ${lines.map((l, i) => html`<div key=${i} style=${{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 140px 36px", gap: 8, alignItems: "center" }}>
          <${TextInput} aria-label="Category" value=${l.category} onChange=${(v) => set(i, "category", v)} placeholder="Category" list="tx-categories" />
          <${TextInput} aria-label=${`Monthly amount for ${l.category || "this line"}`} type="number" min="0" step="100" value=${l.monthly_amount} onChange=${(v) => set(i, "monthly_amount", v)} placeholder="R per month" />
          <${Button} variant="ghost" icon="x" ariaLabel=${`Remove ${l.category || "line"}`} onClick=${() => setLines((ls) => ls.filter((_, j) => j !== i))} />
        </div>`)}
        <div style=${{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <${Button} size="sm" icon="plus" onClick=${() => setLines((ls) => [...ls, { category: "", monthly_amount: "" }])}>Add line<//>
          <span class="tabular" style=${{ fontSize: 13.5 }}>Total <strong>${fmt.zar(total)}</strong> a month</span>
        </div>
      </div>
      ${error && html`<div role="alert" style=${{ padding: "8px 12px", borderRadius: 8, background: "var(--danger-soft)", color: "var(--danger)", fontSize: 13 }}>${error}</div>`}
    <//>`;
  }
  function BudgetPanel({ transactions, onChanged }) {
    const { toast } = useApp();
    const months = monthOptions(0, 12);
    const [month, setMonth] = useState(months[0].value);
    const [editing, setEditing] = useState(false);
    const res = useResource(`/api/finance/budget?month=${month}`);
    const current = month === months[0].value;
    return html`<${Fragment}>
      <div style=${{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <${Select} ariaLabel="Month" value=${month} onChange=${setMonth} options=${months} />
        <span style=${{ flex: 1 }} />
        <${Button} icon="pencil" onClick=${() => setEditing(true)}>Edit budget<//>
      </div>
      <${Loaded} res=${res}>${(b) => b.rows.length === 0 && b.unbudgeted.length === 0 ? html`<${Card}><${EmptyState} icon="wallet" title="No budget yet" description="Set a monthly amount per category to see spending against plan, and to make the forecast use your plan." action=${html`<${Button} variant="primary" onClick=${() => setEditing(true)}>Set a budget<//>`} /><//>` : html`<${Grid} min=${380}>
        <${Section} title=${current ? "This month so far" : months.find((m) => m.value === month).label} description=${b.totalBudget ? `${fmt.zar(b.totalActual)} spent of ${fmt.zar(b.totalBudget)} budgeted${current ? `, with ${Math.round(b.monthElapsed * 100)}% of the month gone` : ""}` : "No budget set"}>
          ${b.totalBudget > 0 && html`<div style=${{ marginBottom: 6 }}><${UI.Progress} value=${(b.totalActual / b.totalBudget) * 100} tone=${b.totalActual > b.totalBudget ? "danger" : "primary"} label="Total spending against budget" marker=${current ? b.monthElapsed * 100 : null} markerLabel="How far through the month we are" /></div>`}
          ${b.rows.map((r) => html`<${BudgetLine} key=${r.category} r=${r} elapsed=${b.monthElapsed} current=${current} />`)}
        <//>
        <${Section} title="Spending without a budget" description="Categories you spent on but haven't planned for.">
          ${b.unbudgeted.length === 0 ? html`<${EmptyState} icon="check" title="Everything is budgeted" />` : b.unbudgeted.map((r) => html`<div class="list-row" key=${r.category}><span style=${{ flex: 1 }}>${r.category}</span><strong class="tabular">${fmt.zar(r.actual)}</strong></div>`)}
        <//>
      <//>`}<//>
      <${BudgetEditor} open=${editing} transactions=${transactions} onClose=${() => setEditing(false)} onSaved=${() => { setEditing(false); toast("Budget saved"); res.reload(); onChanged(); }} />
    <//>`;
  }
  function ForecastPanel() {
    const [horizon, setHorizon] = useState("6");
    const future = monthOptions(1, 12, 1);
    const [spend, setSpend] = useState("");
    const [spendFrom, setSpendFrom] = useState(future[0].value);
    const [income, setIncome] = useState("");
    const [incomeFrom, setIncomeFrom] = useState(future[0].value);
    const q = useDebounced(`months=${horizon}&extra_spend=${Number(spend) || 0}&extra_spend_from=${spendFrom}&extra_income=${Number(income) || 0}&extra_income_from=${incomeFrom}`);
    const res = useResource(`/api/finance/forecast?${q}`);
    const label = (key) => fmt.month(key);
    return html`<div style=${{ display: "grid", gap: 16 }}>
      <${Card} style=${{ padding: 16 }}>
        <div class="form-grid">
          <${Field} id="fc-horizon" label="Look ahead"><${Select} id="fc-horizon" value=${horizon} onChange=${setHorizon} options=${[{ value: "6", label: "6 months" }, { value: "12", label: "12 months" }, { value: "18", label: "18 months" }]} style=${{ width: "100%" }} /><//>
          <${Field} id="fc-spend" label="What if we spend more each month?" hint="e.g. a new hire at R25 000"><${TextInput} id="fc-spend" type="number" min="0" step="1000" value=${spend} onChange=${setSpend} placeholder="R0" /><//>
          <${Field} id="fc-spend-from" label="Starting"><${Select} id="fc-spend-from" value=${spendFrom} onChange=${setSpendFrom} options=${future} style=${{ width: "100%" }} /><//>
          <${Field} id="fc-income" label="What if we earn more each month?" hint="e.g. new schools signing"><${TextInput} id="fc-income" type="number" min="0" step="1000" value=${income} onChange=${setIncome} placeholder="R0" /><//>
          <${Field} id="fc-income-from" label="Starting"><${Select} id="fc-income-from" value=${incomeFrom} onChange=${setIncomeFrom} options=${future} style=${{ width: "100%" }} /><//>
        </div>
      <//>
      <${Loaded} res=${res}>${(f) => {
        const last = f.projection[f.projection.length - 1];
        const low = f.projection.reduce((m, p) => (p.cash < m.cash ? p : m), f.projection[0]);
        const data = [
          ...f.past.map((p, i) => ({ label: label(p.month), actual: p.cash, forecast: i === f.past.length - 1 ? p.cash : null })),
          ...f.projection.map((p) => ({ label: label(p.month), actual: null, forecast: p.cash })),
        ];
        const a = f.assumptions;
        return html`
          <${Grid} min=${200}>
            <${Kpi} label="Cash today" icon="wallet" value=${fmt.zar(f.cashNow)} />
            <${Kpi} label=${`Cash in ${f.projection.length} months`} icon="trending-up" value=${fmt.zar(last.cash)} sub=${`${fmt.zar(last.cash - f.cashNow)} from today`} />
            <${Kpi} label="Lowest point" icon="trending-down" value=${fmt.zar(low.cash)} sub=${label(low.month)} />
            <${Card} style=${{ padding: 18, display: "grid", gap: 6, background: f.runOutMonth ? "var(--danger-soft)" : "var(--card)" }}>
              <span style=${{ color: "var(--muted-fg)", fontSize: 13 }}>Cash runs out</span>
              <span style=${{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 22, fontWeight: 600, color: f.runOutMonth ? "var(--danger)" : "var(--fg)" }}><${Icon} name=${f.runOutMonth ? "triangle-alert" : "shield-check"} size=${20} />${f.runOutMonth ? new Date(`${f.runOutMonth}-01T00:00:00`).toLocaleDateString("en-ZA", { month: "long", year: "numeric" }) : "Not in this period"}</span>
              <span style=${{ fontSize: 12, color: "var(--muted-fg)" }}>${f.runOutMonth ? "Plan income or cuts before then." : `Cash stays above zero for the next ${f.projection.length} months.`}</span>
            <//>
          <//>
          <${ChartCard} title="Cash, actual and forecast" description="Month-end balance. The dashed line is the forecast." format="zar" height=${260} data=${data}
            series=${[{ key: "actual", label: "Cash (actual)", slot: 5, type: "line" }, { key: "forecast", label: "Cash (forecast)", slot: 5, type: "line", dashed: true }]} />
          <${Card}>
            <div style=${{ overflowX: "auto" }}>
              <table style=${{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead><tr>${["Month", "School contracts", "Other income", "Spending", "Net", "Cash at month end"].map((h, i) => html`<th key=${h} style=${{ textAlign: i ? "right" : "left", padding: "10px 16px", fontSize: 12, fontWeight: 500, color: "var(--muted-fg)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>${h}</th>`)}</tr></thead>
                <tbody>${f.projection.map((p) => html`<tr key=${p.month} style=${{ borderBottom: "1px solid var(--border)" }}>
                  <td style=${{ padding: "9px 16px", whiteSpace: "nowrap" }}>${label(p.month)}</td>
                  <td class="tabular" style=${{ padding: "9px 16px", textAlign: "right" }}>${fmt.zar(Math.round(p.contractIncome))}</td>
                  <td class="tabular" style=${{ padding: "9px 16px", textAlign: "right" }}>${fmt.zar(Math.round(p.otherIncome + p.extraIncome))}</td>
                  <td class="tabular" style=${{ padding: "9px 16px", textAlign: "right" }}>${fmt.zar(Math.round(p.expense))}</td>
                  <td class="tabular" style=${{ padding: "9px 16px", textAlign: "right" }}>${fmt.zar(Math.round(p.net))}</td>
                  <td class="tabular" style=${{ padding: "9px 16px", textAlign: "right", fontWeight: 600, color: p.cash < 0 ? "var(--danger)" : undefined }}>${fmt.zar(Math.round(p.cash))}</td>
                </tr>`)}</tbody>
              </table>
            </div>
          <//>
          <${Card} style=${{ padding: "14px 18px", fontSize: 13, color: "var(--muted-fg)", display: "grid", gap: 4 }}>
            <strong style=${{ color: "var(--fg)", fontSize: 13.5 }}>How this is worked out</strong>
            <span>School income comes from your contracts: each pays a twelfth of its yearly value every month it runs. Contracts waiting on a renewal decision count at your renewal rate of ${fmt.percent(a.renewalRate * 100)}${a.renewalRateFromHistory ? "" : " (an assumed rate until you have renewal history)"}.</span>
            <span>Other income is your average of the last three full months: ${fmt.zar(Math.round(a.otherIncome))} a month (anything not categorised as “School contracts”).</span>
            <span>Spending is ${a.expenseSource === "budget" ? "your monthly budget" : "your average of the last three full months"}: ${fmt.zar(Math.round(a.baseExpense))} a month${a.expenseSource === "budget" ? "" : ". Set a budget to plan with your own numbers"}.</span>
          <//>`;
      }}<//>
    </div>`;
  }
  function FinanceView({ params }) {
    const { user, toast } = useApp();
    const [tab, setTab] = useState(params.tab || "overview");
    const [months, setMonths] = useState("12");
    const summary = useResource(`/api/finance/summary?months=${months}`);
    const tx = useResource("/api/transactions");
    const budget = useResource(`/api/finance/budget?month=${today().slice(0, 7)}`);
    const act = useAction();
    const [editing, setEditing] = useState(null);
    const [kind, setKind] = useState("");
    const [importing, setImporting] = useState(false);
    const [confirm, confirmDialog] = useConfirm();
    const reload = () => {
      summary.reload();
      tx.reload();
      budget.reload();
    };
    const item = editing && editing !== "new" ? editing : null;
    const categories = [...new Set((tx.data || []).map((t) => t.category))].sort();
    const overview = html`<${Loaded} res=${summary}>${(s) => html`<div style=${{ display: "grid", gap: 16 }}>
        ${s.openingBalance === 0 && atLeast(user, "admin") && html`<${Card} style=${{ padding: "12px 16px", background: "var(--gold-soft)", color: "var(--gold-fg)", fontSize: 13.5 }}>
          Tip: set your starting bank balance in <a href="#/team">Team & settings</a> so cash on hand is accurate.<//>`}
        <${Grid} min=${210}>
          <${Kpi} label="Cash on hand" icon="wallet" value=${fmt.zar(s.cash)} sub="Starting balance + income − spending" />
          <${Kpi} label="Average monthly burn" icon="trending-down" value=${s.avgMonthlyBurn > 0 ? fmt.zar(s.avgMonthlyBurn) : "R0"} sub=${s.avgMonthlyBurn > 0 ? "Spending minus income, last 3 full months" : "Income covered spending lately"} />
          <${Kpi} label="Runway" icon="clock" value=${s.runwayMonths === null ? "—" : `${fmt.number(s.runwayMonths, { decimals: 1 })} months`} sub=${s.runwayMonths === null ? "Not burning cash" : "At the current burn rate"} />
          <${Kpi} label="Net this month" icon="trending-up" value=${fmt.zar(s.thisMonth.net)} sub=${`Last month: ${fmt.zar(s.lastMonth.net)}`} />
        <//>
        <${ChartCard} title="Income and spending by month" format="zar" height=${240} actions=${html`<${Select} ariaLabel="Period" value=${months} onChange=${setMonths} options=${[{ value: "6", label: "6 months" }, { value: "12", label: "12 months" }, { value: "24", label: "24 months" }]} style=${{ height: 30, minWidth: 0, fontSize: 12.5 }} />`}
          data=${s.series.map((m) => ({ label: fmt.month(m.month), income: m.income, expense: m.expense }))}
          series=${[{ key: "income", label: "Income", slot: 1, type: "bar" }, { key: "expense", label: "Spending", slot: 2, type: "bar" }]} />
        <${Grid} min=${380}>
          <${Section} title="Where the money goes" description="Spending by category, last 3 months">
            ${s.expenseCategories.length === 0 ? html`<${EmptyState} icon="receipt" title="No spending recorded" />` : html`<${BarList} items=${s.expenseCategories.slice(0, 8).map((c) => ({ label: c.category, value: c.total }))} format="zar" slot=${2} />`}
          <//>
          <${Section} title="This month against budget" actions=${html`<button onClick=${() => setTab("budget")} style=${{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--primary)" }}>Budget</button>`}>
            ${budget.data && budget.data.rows.length ? html`
              <${Muted}>${fmt.zar(budget.data.totalActual)} of ${fmt.zar(budget.data.totalBudget)} with ${Math.round(budget.data.monthElapsed * 100)}% of the month gone<//>
              ${budget.data.rows.slice(0, 4).map((r) => html`<${BudgetLine} key=${r.category} r=${r} elapsed=${budget.data.monthElapsed} current=${true} />`)}`
              : html`<${EmptyState} icon="wallet" title="No budget yet" action=${html`<${Button} size="sm" onClick=${() => setTab("budget")}>Set a budget<//>`} />`}
          <//>
        <//>
      </div>`}<//>`;
    const transactions = html`<${Loaded} res=${tx}>${(rows) => {
        const shown = kind ? rows.filter((r) => r.kind === kind) : rows;
        return html`<${Card}><${Table} rows=${shown} search=${(t, q) => `${t.description} ${t.category} ${t.counterparty || ""}`.toLowerCase().includes(q)} searchPlaceholder="Search transactions…" pageSize=${20}
          onRowClick=${(t) => setEditing(t)}
          toolbar=${html`<${Select} ariaLabel="Type" value=${kind} onChange=${setKind} placeholder="Income and spending" options=${META.kind} />
            <span style=${{ flex: 1 }} /><${Button} size="sm" icon="download" onClick=${() => downloadCsv(`transactions-${today()}.csv`, [["Date", "Type", "Category", "Description", "Counterparty", "Amount"], ...shown.map((t) => [t.date, t.kind, t.category, t.description, t.counterparty, t.kind === "expense" ? -t.amount : t.amount])])}>Export CSV<//>`}
          empty=${html`<${EmptyState} icon="receipt" title="No transactions yet" description="Record income and spending, or import a bank statement, to see cash and runway." />`}
          columns=${[
            { key: "date", header: "Date", sort: (t) => t.date, render: (t) => html`<span style=${{ whiteSpace: "nowrap" }}>${fmt.date(t.date)}</span>` },
            { key: "description", header: "Description", sort: (t) => t.description.toLowerCase(), render: (t) => html`${t.description}${t.counterparty && html`<br /><${Muted}>${t.counterparty}<//>`}` },
            { key: "category", header: "Category", hideOnMobile: true, sort: (t) => t.category, render: (t) => html`<${Badge} tone="outline">${t.category}<//>` },
            { key: "kind", header: "Type", hideOnMobile: true, render: (t) => html`<${StatusBadge} meta=${META.kind} value=${t.kind} />` },
            { key: "amount", header: "Amount", align: "right", sort: (t) => (t.kind === "expense" ? -t.amount : t.amount), render: (t) => html`<strong class="tabular" style=${{ fontWeight: 600, whiteSpace: "nowrap" }}>${t.kind === "expense" ? "−" : "+"}${fmt.zar(t.amount)}</strong>` },
          ]} /><//>`;
      }}<//>`;
    return html`<${Fragment}>
      <${PageHeader} title="Finance" description="Money in, money out, the plan, and how long the cash lasts." actions=${html`
        <${Button} icon="upload" onClick=${() => setImporting(true)}>Import statement<//>
        <${Button} variant="primary" icon="plus" onClick=${() => setEditing("new")}>Add transaction<//>`} />
      <${Tabs} value=${tab} onChange=${setTab} items=${[{ id: "overview", label: "Overview" }, { id: "transactions", label: "Transactions", count: tx.data ? tx.data.length : undefined }, { id: "budget", label: "Budget" }, { id: "forecast", label: "Forecast" }]} />
      ${tab === "overview" ? overview : tab === "transactions" ? transactions : tab === "budget" ? html`<${BudgetPanel} transactions=${tx.data} onChanged=${reload} />` : html`<${ForecastPanel} />`}
      <${ImportModal} open=${importing} onClose=${() => setImporting(false)} onImported=${reload} />
      <datalist id="tx-categories">${[...new Set([...categories, "Salaries", "Software", "Marketing", "Equipment", "Rent", "Travel", "Subscriptions", "School contracts", "Grants"])].map((c) => html`<option key=${c} value=${c} />`)}</datalist>
      <${FormModal} open=${Boolean(editing)} onClose=${() => setEditing(null)} title=${item ? "Edit transaction" : "Add transaction"} fields=${TX_FIELDS} initial=${item || { date: today() }}
        submitLabel=${item ? "Save" : "Add"}
        extraFooter=${item && html`<${Button} variant="ghost" icon="trash-2" style=${{ color: "var(--danger)" }} onClick=${() => confirm(`Delete “${item.description}”?`, async () => { await act(() => api("DELETE", `/api/transactions/${item.id}`), "Transaction deleted"); setEditing(null); reload(); })}>Delete<//>`}
        onSubmit=${async (v) => {
          if (item) await api("PATCH", `/api/transactions/${item.id}`, v);
          else await api("POST", "/api/transactions", v);
          setEditing(null);
          toast(item ? "Saved" : "Transaction added");
          reload();
        }} />
      ${confirmDialog}
    <//>`;
  }

  // ─────────────────────────── Stats ───────────────────────────
  const LEVEL_ROWS = new Set(["cash", "arr", "schools", "learners"]);
  /** Sequential shading within a row: one hue, light (low) to deeper (high). Text keeps the normal ink. */
  const heat = (v, lo, hi) => (hi === lo ? "transparent" : `color-mix(in oklab, var(--chart-5) ${Math.round(6 + ((v - lo) / (hi - lo)) * 40)}%, var(--card))`);
  function ChangeBadge({ row }) {
    const vals = row.values;
    const level = LEVEL_ROWS.has(row.key);
    const now = level ? vals[vals.length - 1] : vals[vals.length - 2];
    const before = level ? vals[vals.length - 2] : vals[vals.length - 3];
    if (before === undefined || now === undefined) return null;
    const diff = now - before;
    if (diff === 0) return html`<${Badge}>No change<//>`;
    const good = row.good === "down" ? diff < 0 : diff > 0;
    const text = row.format === "zar" ? `${diff > 0 ? "+" : "−"}${fmt.zar(Math.abs(diff), { compact: true })}` : before ? fmt.delta((diff / Math.abs(before)) * 100) : `${diff > 0 ? "+" : ""}${diff}`;
    return html`<${Badge} tone=${good ? "success" : "danger"} title=${level ? "This month against last month" : "Last full month against the month before"}><${Icon} name=${diff > 0 ? "arrow-up-right" : "arrow-down-right"} size=${12} />${text}<//>`;
  }
  function StatsView() {
    const { user } = useApp();
    const [tab, setTab] = useState("business");
    const [months, setMonths] = useState("12");
    const teamMonths = monthOptions(0, 6);
    const [month, setMonth] = useState(teamMonths[0].value);
    const res = useResource(`/api/stats?months=${months}&month=${month}`);
    const cellPad = { padding: "8px 12px", whiteSpace: "nowrap" };
    const sticky = { position: "sticky", left: 0, background: "var(--card)", zIndex: 1 };
    const exportCsv = (m) => downloadCsv(`stats-${today()}.csv`, [["Metric", ...m.months], ...m.rows.map((r) => [r.label, ...r.values.map((v) => Math.round(v * 100) / 100)])]);
    return html`<${Fragment}>
      <${PageHeader} title="Stats" description=${atLeast(user, "manager") ? "The business month by month, and what each person is carrying." : "Schools and work month by month, and what each person is carrying."} actions=${tab === "business" ? html`
        <${Select} ariaLabel="Months" value=${months} onChange=${setMonths} options=${[{ value: "6", label: "Last 6 months" }, { value: "12", label: "Last 12 months" }]} />
        ${res.data && html`<${Button} icon="download" onClick=${() => exportCsv(res.data.matrix)}>Export CSV<//>`}` : html`<${Select} ariaLabel="Month" value=${month} onChange=${setMonth} options=${teamMonths} />`} />
      <${Tabs} value=${tab} onChange=${setTab} items=${[{ id: "business", label: "Business" }, { id: "team", label: "Team" }]} />
      <${Loaded} res=${res}>${(d) => {
        if (tab === "team") {
          const cols = [["openTasks", "Open tasks"], ["overdue", "Overdue"], ["completed", "Tasks done"], ["published", "Content published"], ["signed", "Schools signed"], ["notes", "School notes"]];
          const range = Object.fromEntries(cols.map(([k]) => [k, [Math.min(...d.team.map((r) => r[k])), Math.max(...d.team.map((r) => r[k]))]]));
          return html`<${Card}><div style=${{ overflowX: "auto" }}>
            <table style=${{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead><tr><th scope="col" style=${{ ...cellPad, ...sticky, textAlign: "left", fontSize: 12, fontWeight: 500, color: "var(--muted-fg)", borderBottom: "1px solid var(--border)" }}>Person</th>
                ${cols.map(([k, h]) => html`<th key=${k} scope="col" style=${{ ...cellPad, textAlign: "right", fontSize: 12, fontWeight: 500, color: "var(--muted-fg)", borderBottom: "1px solid var(--border)" }}>${h}${["completed", "published", "signed", "notes"].includes(k) && html`<div style=${{ fontWeight: 400, fontSize: 11 }}>${teamMonths.find((m) => m.value === month).label.split(" ")[0]}</div>`}</th>`)}</tr></thead>
              <tbody>${d.team.map((r) => html`<tr key=${r.id} style=${{ borderBottom: "1px solid var(--border)" }}>
                <th scope="row" style=${{ ...cellPad, ...sticky, textAlign: "left", fontWeight: 400 }}><${UserChip} name=${r.name} subtitle=${r.job_title} /></th>
                ${cols.map(([k]) => html`<td key=${k} class="tabular" style=${{ ...cellPad, textAlign: "right", background: k === "overdue" ? (r[k] ? "var(--danger-soft)" : "transparent") : heat(r[k], ...range[k]), color: k === "overdue" && r[k] ? "var(--danger)" : undefined, fontWeight: k === "overdue" && r[k] ? 600 : 400 }}>
                  ${k === "overdue" && r[k] ? html`<span style=${{ display: "inline-flex", alignItems: "center", gap: 4 }}><${Icon} name="triangle-alert" size=${12} />${r[k]}</span>` : r[k]}
                </td>`)}
              </tr>`)}</tbody>
            </table>
          </div><//>`;
        }
        const m = d.matrix;
        const thisMonth = today().slice(0, 7);
        const groups = [...new Set(m.rows.map((r) => r.group))];
        return html`<${Card}><div style=${{ overflowX: "auto" }}>
          <table style=${{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              <th scope="col" style=${{ ...cellPad, ...sticky, textAlign: "left", fontSize: 12, fontWeight: 500, color: "var(--muted-fg)", borderBottom: "1px solid var(--border)", minWidth: 190 }}>Metric</th>
              <th scope="col" style=${{ ...cellPad, fontSize: 12, fontWeight: 500, color: "var(--muted-fg)", borderBottom: "1px solid var(--border)" }}>Trend</th>
              <th scope="col" style=${{ ...cellPad, fontSize: 12, fontWeight: 500, color: "var(--muted-fg)", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>Change</th>
              ${m.months.map((k, i) => html`<th key=${k} scope="col" style=${{ ...cellPad, textAlign: "right", fontSize: 12, fontWeight: 500, color: "var(--muted-fg)", borderBottom: "1px solid var(--border)" }}>${new Date(`${k}-01T00:00:00`).toLocaleDateString("en-ZA", { month: "short" })}${(i === 0 || k.endsWith("-01")) && html`<div style=${{ fontWeight: 400, fontSize: 11 }}>${k.slice(0, 4)}</div>`}${k === thisMonth && html`<div style=${{ fontWeight: 400, fontSize: 11 }}>so far</div>`}</th>`)}
            </tr></thead>
            <tbody>${groups.map((g) => html`<${Fragment} key=${g}>
              <tr><th colSpan=${m.months.length + 3} scope="colgroup" style=${{ ...cellPad, textAlign: "left", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted-fg)", background: "var(--subtle)", borderBottom: "1px solid var(--border)" }}>${g}</th></tr>
              ${m.rows.filter((r) => r.group === g).map((r) => {
                const lo = Math.min(...r.values), hi = Math.max(...r.values);
                return html`<tr key=${r.key} style=${{ borderBottom: "1px solid var(--border)" }}>
                  <th scope="row" style=${{ ...cellPad, ...sticky, textAlign: "left", fontWeight: 500 }}>${r.label}</th>
                  <td style=${cellPad}><${UI.Sparkline} values=${r.values} label=${`${r.label} trend`} /></td>
                  <td style=${{ ...cellPad, borderRight: "1px solid var(--border)" }}><${ChangeBadge} row=${r} /></td>
                  ${r.values.map((v, i) => html`<td key=${i} class="tabular" title=${`${r.label}, ${new Date(`${m.months[i]}-01T00:00:00`).toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}: ${fmt.value(v, r.format === "zar" ? "zar" : "number")}`} style=${{ ...cellPad, textAlign: "right", background: heat(v, lo, hi) }}>${r.format === "zar" ? fmt.zar(v, { compact: true }) : fmt.number(v)}</td>`)}
                </tr>`;
              })}
            <//>`)}</tbody>
          </table>
        </div>
        <div style=${{ padding: "10px 16px", fontSize: 12, color: "var(--muted-fg)", borderTop: "1px solid var(--border)" }}>Deeper shading means a higher value within that row. Change compares the last full month with the one before, or this month with last month for running totals like cash and recurring revenue.</div>
        <//>`;
      }}<//>
    <//>`;
  }

  // ─────────────────────────── Monthly update ───────────────────────────
  const pctChange = (now, before) => (before ? ((now - before) / before) * 100 : null);
  function reportText(r, monthLabel) {
    const m = r.money;
    const lines = [
      `${r.company} — ${monthLabel} update`,
      "",
      "MONEY",
      `Income: ${fmt.zar(m.income)}${m.prevIncome ? ` (${fmt.delta(pctChange(m.income, m.prevIncome))} on last month)` : ""}`,
      `Spending: ${fmt.zar(m.expense)}${m.prevExpense ? ` (${fmt.delta(pctChange(m.expense, m.prevExpense))} on last month)` : ""}`,
      `Net: ${fmt.zar(m.net)}`,
      `Cash at month end: ${fmt.zar(m.cashEnd)}`,
      `Runway: ${m.runwayMonths === null ? "not burning cash (income covers spending)" : `about ${fmt.number(m.runwayMonths, { decimals: 1 })} months at ${fmt.zar(m.avgBurn)} average monthly burn`}`,
      "",
      "SCHOOLS",
      `Annual recurring revenue: ${fmt.zar(r.contracts.arr)}${r.contracts.arrStart ? ` (${fmt.delta(pctChange(r.contracts.arr, r.contracts.arrStart))} this month)` : ""} across ${r.contracts.schools} schools`,
      r.contracts.renewed || r.contracts.notRenewed ? `Renewals: ${r.contracts.renewed} renewed, ${r.contracts.notRenewed} not renewing` : null,
      r.schools.won.length ? `Signed this month: ${r.schools.won.map((w) => `${w.school} (${fmt.zar(w.value)}/year${w.learners ? `, ${w.learners} learners` : ""})`).join("; ")}` : "No new schools signed this month.",
      `New leads: ${r.schools.newLeads} · Open pipeline: ${fmt.zar(r.schools.openPipeline.value)} across ${r.schools.openPipeline.n} schools`,
      `Learners signed in total: ${fmt.number(r.schools.learnersSigned)}`,
      "",
      "CONTENT",
      r.content.length ? `Published: ${r.content.map((c) => c.title).join("; ")}` : "Nothing published this month.",
      "",
      "TEAM",
      `Tasks completed: ${r.tasksDone}`,
      `Spending approved: ${r.approvals.approved} request${r.approvals.approved === 1 ? "" : "s"} (${fmt.zar(r.approvals.approvedAmount)})${r.approvals.rejected ? ` · ${r.approvals.rejected} declined` : ""}`,
    ].filter((line) => line !== null);
    if (r.decisions.length) {
      lines.push("", "KEY DECISIONS");
      for (const d of r.decisions) for (const item of d.items) lines.push(`- ${item} (${d.meeting}, ${fmt.shortDate(d.date)})`);
    }
    return lines.join("\n");
  }
  function ReportView() {
    const { toast } = useApp();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = UI.isoDate(d).slice(0, 7);
      return { value: key, label: d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" }) };
    });
    const [month, setMonth] = useState(months[0].value);
    const [copyText, setCopyText] = useState(null);
    const res = useResource(`/api/report?month=${month}`);
    const monthLabel = months.find((m) => m.value === month).label;
    const copy = (r) => {
      const text = reportText(r, monthLabel);
      const fallback = () => setCopyText(text);
      try {
        navigator.clipboard.writeText(text).then(() => toast("Copied. Paste it into an email or chat."), fallback);
      } catch {
        fallback();
      }
    };
    const block = (title, children) => html`<section style=${{ display: "grid", gap: 8, paddingTop: 18, borderTop: "1px solid var(--border)" }}><h2 style=${{ margin: 0, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted-fg)" }}>${title}</h2>${children}</section>`;
    const row = (label, value, extra) => html`<div style=${{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "2px 12px", fontSize: 14 }}><span style=${{ color: "var(--muted-fg)" }}>${label}</span><span><strong class="tabular" style=${{ fontWeight: 600 }}>${value}</strong>${extra && html` <${Muted}>${extra}<//>`}</span></div>`;
    return html`<${Fragment}>
      <${PageHeader} title="Monthly update" description="The month at a glance, ready to send to investors, advisors or the team." actions=${html`
        <${Select} ariaLabel="Month" value=${month} onChange=${setMonth} options=${months} />
        ${res.data && html`<${Button} icon="file-text" onClick=${() => copy(res.data)}>Copy as text<//>`}
        ${!window.WS_PREVIEW && html`<${Button} className="no-print" icon="download" onClick=${() => window.print()}>Print or save PDF<//>`}`} />
      <${Loaded} res=${res}>${(r) => {
        const m = r.money;
        return html`<${Card} style=${{ padding: "24px clamp(16px, 4vw, 40px) 32px", maxWidth: 860, display: "grid", gap: 18 }}>
          <header style=${{ display: "flex", alignItems: "center", gap: 14 }}>
            <span class="crest" style=${{ width: 48, height: 48, borderRadius: 12 }}><img src="crest.png" alt="" /></span>
            <div><div style=${{ fontFamily: "var(--display)", fontWeight: 700, letterSpacing: ".06em" }}>${r.company.toUpperCase()}</div><div style=${{ fontSize: 20, fontWeight: 600 }}>${monthLabel} update</div></div>
          </header>
          <${Grid} min=${170} gap=${12}>
            ${[["Cash at month end", fmt.zar(m.cashEnd)], ["Net for the month", fmt.zar(m.net)], ["Runway", m.runwayMonths === null ? "Not burning" : `${fmt.number(m.runwayMonths, { decimals: 1 })} months`], ["Learners signed", fmt.number(r.schools.learnersSigned)]].map(([l, v]) => html`<div key=${l} style=${{ padding: "12px 14px", borderRadius: 10, background: "var(--subtle)", border: "1px solid var(--border)" }}><${Muted}>${l}<//><div class="tabular" style=${{ fontSize: 20, fontWeight: 600 }}>${v}</div></div>`)}
          <//>
          ${block("Money", html`
            ${row("Income", fmt.zar(m.income), m.prevIncome ? `${fmt.delta(pctChange(m.income, m.prevIncome))} on last month` : null)}
            ${row("Spending", fmt.zar(m.expense), m.prevExpense ? `${fmt.delta(pctChange(m.expense, m.prevExpense))} on last month` : null)}
            ${row("Average monthly burn (3 months)", m.avgBurn > 0 ? fmt.zar(m.avgBurn) : "None")}
            ${m.incomeBySource.length > 0 && html`<div style=${{ fontSize: 13 }}><${Muted}>Income by source: ${m.incomeBySource.map((c) => `${c.category} ${fmt.zar(c.total)}`).join(" · ")}<//></div>`}
            ${m.topSpending.length > 0 && html`<${BarList} items=${m.topSpending.map((c) => ({ label: c.category, value: c.total }))} format="zar" slot=${2} />`}`)}
          ${block("Schools", html`
            ${row("Annual recurring revenue", fmt.zar(r.contracts.arr), `${r.contracts.arrStart ? `${fmt.delta(pctChange(r.contracts.arr, r.contracts.arrStart))} this month · ` : ""}${r.contracts.schools} schools`)}
            ${(r.contracts.renewed > 0 || r.contracts.notRenewed > 0) && row("Renewals", `${r.contracts.renewed} renewed`, r.contracts.notRenewed ? `${r.contracts.notRenewed} not renewing` : null)}
            ${r.schools.won.length ? r.schools.won.map((w) => html`<div key=${w.school} style=${{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}><${Badge} tone="success" dot>Signed<//><strong style=${{ fontWeight: 500 }}>${w.school}</strong><${Muted}>${fmt.zar(w.value)}/year${w.learners ? ` · ${w.learners} learners` : ""}<//></div>`) : html`<${Muted}>No new schools signed this month.<//>`}
            ${row("New leads", fmt.number(r.schools.newLeads))}
            ${row("Open pipeline", fmt.zar(r.schools.openPipeline.value), `${r.schools.openPipeline.n} schools`)}`)}
          ${block("Content", r.content.length ? html`<ul style=${{ margin: 0, paddingLeft: 20, fontSize: 14 }}>${r.content.map((c) => html`<li key=${c.title}>${c.title} <${Muted}>${META.contentType[c.type].label}<//></li>`)}</ul>` : html`<${Muted}>Nothing published this month.<//>`)}
          ${block("Team", html`
            ${row("Tasks completed", fmt.number(r.tasksDone))}
            ${row("Spending approved", fmt.zar(r.approvals.approvedAmount), `${r.approvals.approved} request${r.approvals.approved === 1 ? "" : "s"}${r.approvals.rejected ? `, ${r.approvals.rejected} declined` : ""}`)}`)}
          ${r.decisions.length > 0 && block("Key decisions", html`<ul style=${{ margin: 0, paddingLeft: 20, fontSize: 14, display: "grid", gap: 4 }}>${r.decisions.flatMap((d) => d.items.map((item, i) => html`<li key=${d.meeting + i}>${item} <${Muted}>${d.meeting}, ${fmt.shortDate(d.date)}<//></li>`))}</ul>`)}
        <//>`;
      }}<//>
      <${Modal} open=${Boolean(copyText)} onClose=${() => setCopyText(null)} title="Copy the update" description="Your browser didn't allow automatic copying. Select the text and copy it.">
        <textarea readOnly value=${copyText || ""} rows=${16} onFocus=${(e) => e.target.select()} style=${{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--input)", background: "var(--card)", color: "var(--fg)", font: "13px/1.5 ui-monospace, Menlo, Consolas, monospace" }} />
      <//>
    <//>`;
  }

  // ─────────────────────────── Approvals ───────────────────────────
  function ApprovalsView() {
    const { user, userName, toast } = useApp();
    const res = useResource("/api/approvals");
    const act = useAction();
    const [tab, setTab] = useState("pending");
    const [editing, setEditing] = useState(null);
    const [deciding, setDeciding] = useState(null); // { item, decision }
    const [confirm, confirmDialog] = useConfirm();
    const manager = atLeast(user, "manager");
    const item = editing && editing !== "new" ? editing : null;
    return html`<${Fragment}>
      <${PageHeader} title="Approvals" description=${manager ? "Spending requests from the team. You can't approve your own." : "Ask a manager to approve spending before you commit to it."} actions=${html`<${Button} variant="primary" icon="plus" onClick=${() => setEditing("new")}>New request<//>`} />
      <${Loaded} res=${res}>${(rows) => {
        const pending = rows.filter((r) => r.status === "pending");
        const decided = rows.filter((r) => r.status !== "pending");
        const shown = tab === "pending" ? pending : decided;
        return html`<${Tabs} value=${tab} onChange=${setTab} items=${[{ id: "pending", label: "Pending", count: pending.length }, { id: "decided", label: "Decided", count: decided.length }]} />
          ${shown.length === 0 ? html`<${Card}><${EmptyState} icon="circle-check" title=${tab === "pending" ? "Nothing waiting" : "No decisions yet"} /><//>` : html`<div style=${{ display: "grid", gap: 12 }}>${shown.map((a) => html`<${Card} key=${a.id} style=${{ padding: 16, display: "grid", gap: 8 }}>
            <div style=${{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12 }}>
              <div style=${{ flex: "1 1 260px", minWidth: 0 }}>
                <strong style=${{ fontSize: 15, fontWeight: 600 }}>${a.title}</strong>
                <div><${Muted}>Requested by ${userName(a.requested_by)} · ${fmt.relative(a.created_at)}<//></div>
              </div>
              ${a.amount !== null && html`<strong class="tabular" style=${{ fontSize: 17 }}>${fmt.zar(a.amount)}</strong>`}
              <${StatusBadge} meta=${META.approval} value=${a.status} />
            </div>
            ${a.details && html`<p class="pre" style=${{ margin: 0, fontSize: 13.5 }}>${a.details}</p>`}
            ${a.status !== "pending" && html`<div style=${{ fontSize: 13, padding: "8px 12px", borderRadius: 8, background: "var(--subtle)", border: "1px solid var(--border)" }}>
              ${META.approval[a.status].label} by ${userName(a.decided_by)} · ${fmt.relative(a.decided_at)}${a.decision_note && html`<div class="pre" style=${{ marginTop: 4 }}>“${a.decision_note}”</div>`}
            </div>`}
            ${a.status === "pending" && html`<div style=${{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              ${manager && a.requested_by !== user.id && html`<${Button} size="sm" variant="primary" icon="check" onClick=${() => setDeciding({ item: a, decision: "approved" })}>Approve<//><${Button} size="sm" icon="x" onClick=${() => setDeciding({ item: a, decision: "rejected" })}>Reject<//>`}
              ${a.requested_by === user.id && html`<${Button} size="sm" variant="ghost" icon="pencil" onClick=${() => setEditing(a)}>Edit<//><${Button} size="sm" variant="ghost" icon="trash-2" onClick=${() => confirm(`Withdraw “${a.title}”?`, async () => { await act(() => api("DELETE", `/api/approvals/${a.id}`), "Request withdrawn"); res.reload(); })}>Withdraw<//>`}
            </div>`}
          <//>`)}</div>`}`;
      }}<//>
      <${FormModal} open=${Boolean(editing)} onClose=${() => setEditing(null)} title=${item ? "Edit request" : "Request approval"} fields=${APPROVAL_FIELDS} initial=${item} submitLabel=${item ? "Save" : "Send request"}
        onSubmit=${async (v) => {
          if (item) await api("PATCH", `/api/approvals/${item.id}`, v);
          else await api("POST", "/api/approvals", v);
          setEditing(null);
          toast(item ? "Request updated" : "Request sent to the managers");
          res.reload();
        }} />
      <${FormModal} open=${Boolean(deciding)} onClose=${() => setDeciding(null)} title=${deciding ? `${deciding.decision === "approved" ? "Approve" : "Reject"} “${deciding.item.title}”` : ""}
        fields=${[{ name: "note", label: "Note for the requester", type: "textarea", full: true, rows: 3, hint: deciding && deciding.decision === "rejected" ? "Say why, so they know what to change." : "Optional." }]}
        submitLabel=${deciding && deciding.decision === "approved" ? "Approve" : "Reject"}
        onSubmit=${async (v) => {
          await api("POST", `/api/approvals/${deciding.item.id}/decide`, { decision: deciding.decision, note: v.note });
          toast(deciding.decision === "approved" ? "Approved" : "Rejected");
          setDeciding(null);
          res.reload();
        }} />
      ${confirmDialog}
    <//>`;
  }

  // ─────────────────────────── Meetings ───────────────────────────
  function MeetingDetail({ meeting, tasks, onClose, onChanged }) {
    const { user, userName, toast } = useApp();
    const act = useAction();
    const [editing, setEditing] = useState(false);
    const [taskOpen, setTaskOpen] = useState(false);
    const [confirm, confirmDialog] = useConfirm();
    if (!meeting) return null;
    const actions = tasks.filter((t) => t.meeting_id === meeting.id);
    const decisions = (meeting.decisions || "").split("\n").map((s) => s.trim()).filter(Boolean);
    return html`<${Fragment}>
      <${Modal} open=${!editing && !taskOpen} onClose=${onClose} title=${meeting.title} description=${`${fmt.date(meeting.date)}${meeting.attendees ? ` · ${meeting.attendees}` : ""}`} width=${680}
        footer=${html`${(atLeast(user, "manager") || meeting.created_by === user.id) && html`<${Button} variant="ghost" icon="trash-2" style=${{ color: "var(--danger)" }} onClick=${() => confirm(`Delete “${meeting.title}”? Its action items stay on the task list.`, async () => { await act(() => api("DELETE", `/api/meetings/${meeting.id}`), "Meeting deleted"); onChanged(true); })}>Delete<//>`}
          <span style=${{ flex: 1 }} /><${Button} variant="primary" icon="pencil" onClick=${() => setEditing(true)}>Edit notes<//>`}>
        <div>
          <strong style=${{ fontSize: 14 }}>Notes</strong>
          ${meeting.notes ? html`<p class="pre" style=${{ margin: "6px 0 0", fontSize: 13.5 }}>${meeting.notes}</p>` : html`<div><${Muted}>No notes yet.<//></div>`}
        </div>
        <div>
          <strong style=${{ fontSize: 14 }}>Decisions</strong>
          ${decisions.length ? html`<ul style=${{ margin: "6px 0 0", paddingLeft: 20, fontSize: 13.5 }}>${decisions.map((d, i) => html`<li key=${i}>${d}</li>`)}</ul>` : html`<div><${Muted}>No decisions recorded.<//></div>`}
        </div>
        <div>
          <div style=${{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong style=${{ fontSize: 14 }}>Action items</strong>
            <${Button} size="sm" variant="soft" icon="plus" onClick=${() => setTaskOpen(true)}>Add action item<//>
          </div>
          ${actions.length === 0 ? html`<div style=${{ marginTop: 6 }}><${Muted}>Action items become tasks on the team's task list.<//></div>` : actions.map((t) => html`<div class="list-row" key=${t.id}>
            <input type="checkbox" aria-label=${`Mark “${t.title}” done`} checked=${t.status === "done"} disabled=${!canEditTask(user, t)} onChange=${async () => { await act(() => api("PATCH", `/api/tasks/${t.id}`, { status: t.status === "done" ? "todo" : "done" })); onChanged(false); }} />
            <span style=${{ flex: 1, minWidth: 0, textDecoration: t.status === "done" ? "line-through" : "none" }}>${t.title}</span>
            <${Muted}>${userName(t.assignee_id)}<//><${DueDate} date=${t.due_date} done=${t.status === "done"} />
          </div>`)}
        </div>
      <//>
      <${FormModal} open=${editing} onClose=${() => setEditing(false)} title="Edit meeting" fields=${MEETING_FIELDS} initial=${meeting} width=${680}
        onSubmit=${async (v) => {
          await api("PATCH", `/api/meetings/${meeting.id}`, v);
          setEditing(false);
          toast("Meeting saved");
          onChanged(false);
        }} />
      <${TaskModal} open=${taskOpen} task=${null} defaults=${{ meeting_id: meeting.id, due_date: addDays(meeting.date > today() ? meeting.date : today(), 7) }}
        onClose=${() => setTaskOpen(false)} onSaved=${(msg) => { setTaskOpen(false); toast(msg); onChanged(false); }} />
      ${confirmDialog}
    <//>`;
  }
  function MeetingsView({ params }) {
    const { toast } = useApp();
    const res = useResource("/api/meetings");
    const tasks = useResource("/api/tasks");
    const [adding, setAdding] = useState(false);
    const openId = params.meeting ? Number(params.meeting) : null;
    const open = (res.data || []).find((m) => m.id === openId) || null;
    return html`<${Fragment}>
      <${PageHeader} title="Meetings" description="Notes, decisions and the action items that come out of them." actions=${html`<${Button} variant="primary" icon="plus" onClick=${() => setAdding(true)}>New meeting<//>`} />
      <${Loaded} res=${res}>${(rows) => html`<${Card}><${Table} rows=${rows} search=${(m, q) => `${m.title} ${m.attendees || ""} ${m.notes || ""} ${m.decisions || ""}`.toLowerCase().includes(q)} searchPlaceholder="Search notes and decisions…"
        onRowClick=${(m) => go(`meetings?meeting=${m.id}`)}
        empty=${html`<${EmptyState} icon="notebook-pen" title="No meetings yet" description="Record your first team meeting." />`}
        columns=${[
          { key: "date", header: "Date", sort: (m) => m.date, render: (m) => html`<span style=${{ whiteSpace: "nowrap" }}>${fmt.date(m.date)}</span>` },
          { key: "title", header: "Meeting", sort: (m) => m.title.toLowerCase(), render: (m) => html`<strong style=${{ fontWeight: 500 }}>${m.title}</strong>${m.attendees && html`<br /><${Muted}>${m.attendees}<//>`}` },
          { key: "decisions", header: "Decisions", hideOnMobile: true, render: (m) => fmt.number((m.decisions || "").split("\n").filter((s) => s.trim()).length) },
          { key: "actions", header: "Open actions", hideOnMobile: true, render: (m) => {
            const list = (tasks.data || []).filter((t) => t.meeting_id === m.id);
            const openCount = list.filter((t) => t.status !== "done").length;
            return list.length ? html`<${Badge} tone=${openCount ? "warning" : "success"}>${openCount} of ${list.length} open<//>` : html`<${Muted}>—<//>`;
          } },
        ]} /><//>`}<//>
      <${FormModal} open=${adding} onClose=${() => setAdding(false)} title="New meeting" fields=${MEETING_FIELDS} initial=${{ date: today() }} width=${680} submitLabel="Save meeting"
        onSubmit=${async (v) => {
          const m = await api("POST", "/api/meetings", v);
          setAdding(false);
          toast("Meeting saved — add action items next");
          res.reload();
          go(`meetings?meeting=${m.id}`);
        }} />
      <${MeetingDetail} meeting=${open} tasks=${tasks.data || []} onClose=${() => go("meetings")} onChanged=${(removed) => { if (removed) go("meetings"); res.reload(); tasks.reload(); }} />
    <//>`;
  }

  // ─────────────────────────── Documents ───────────────────────────
  const ACCEPT = ".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx,.pptx";
  function UploadModal({ open, onClose, onDone, folders }) {
    const [file, setFile] = useState(null);
    const [title, setTitle] = useState("");
    const [folder, setFolder] = useState("General");
    const [priv, setPriv] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
      if (open) {
        setFile(null);
        setTitle("");
        setFolder("General");
        setPriv(false);
        setError("");
      }
    }, [open]);
    const upload = async () => {
      if (!file) return setError("Choose a file to upload.");
      if (file.size > 20 * 1024 * 1024) return setError("Files can be up to 20 MB.");
      setBusy(true);
      setError("");
      try {
        await api("POST", "/api/documents", file, { "X-File-Name": encodeURIComponent(file.name), "X-Title": encodeURIComponent(title || file.name.replace(/\.[^.]+$/, "")), "X-Folder": encodeURIComponent(folder || "General"), "X-Private": priv ? "1" : "0" });
        onDone();
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    };
    return html`<${Modal} open=${open} onClose=${onClose} title="Upload a document" description="PDF, images, Word, Excel, PowerPoint, CSV or text — up to 20 MB."
      footer=${html`<${Button} onClick=${onClose}>Cancel<//><${Button} variant="primary" icon="upload" disabled=${busy} onClick=${upload}>${busy ? "Uploading…" : "Upload"}<//>`}>
      <${Field} id="doc-file" label="File"><input id="doc-file" type="file" accept=${ACCEPT} onChange=${(e) => { const f = e.target.files[0] || null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "")); }} /><//>
      <${Field} id="doc-title" label="Title"><${TextInput} id="doc-title" value=${title} onChange=${setTitle} /><//>
      <${Field} id="doc-folder" label="Folder" hint="Type a new name to create a folder."><${TextInput} id="doc-folder" value=${folder} onChange=${setFolder} list="doc-folders" /><//>
      <datalist id="doc-folders">${folders.map((f) => html`<option key=${f} value=${f} />`)}</datalist>
      <label style=${{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}><input type="checkbox" checked=${priv} onChange=${(e) => setPriv(e.target.checked)} />Private — only me and managers can see it</label>
      ${error && html`<div role="alert" style=${{ padding: "8px 12px", borderRadius: 8, background: "var(--danger-soft)", color: "var(--danger)", fontSize: 13 }}>${error}</div>`}
    <//>`;
  }
  function DocumentsView() {
    const { user, toast } = useApp();
    const res = useResource("/api/documents");
    const act = useAction();
    const [uploading, setUploading] = useState(false);
    const [folder, setFolder] = useState("");
    const [confirm, confirmDialog] = useConfirm();
    const folders = [...new Set((res.data || []).map((d) => d.folder))].sort();
    return html`<${Fragment}>
      <${PageHeader} title="Documents" description="Contracts, proposals, policies and lesson files in one place." actions=${html`<${Button} variant="primary" icon="upload" onClick=${() => setUploading(true)}>Upload<//>`} />
      <${Loaded} res=${res}>${(docs) => html`<${Card}><${Table} rows=${folder ? docs.filter((d) => d.folder === folder) : docs} search=${(d, q) => `${d.title} ${d.file_name} ${d.folder}`.toLowerCase().includes(q)} searchPlaceholder="Search documents…"
        toolbar=${folders.length > 1 && html`<${Select} ariaLabel="Folder" value=${folder} onChange=${setFolder} placeholder="All folders" options=${folders.map((f) => ({ value: f, label: f }))} />`}
        empty=${html`<${EmptyState} icon="folder-open" title="No documents yet" description="Upload your first file." />`}
        columns=${[
          { key: "title", header: "Document", sort: (d) => d.title.toLowerCase(), render: (d) => html`<span style=${{ display: "inline-flex", gap: 10, alignItems: "center" }}><span style=${{ color: "var(--muted-fg)", display: "inline-flex" }}><${Icon} name=${/^image\//.test(d.mime_type) ? "image" : /sheet|csv/.test(d.mime_type) ? "file-spreadsheet" : "file-text"} size=${18} /></span><span><strong style=${{ fontWeight: 500 }}>${d.title}</strong> ${d.private ? html`<${Badge} tone="outline"><${Icon} name="lock" size=${11} />Private<//>` : null}<br /><${Muted}>${d.file_name} · ${fmt.bytes(d.size)}<//></span></span>` },
          { key: "folder", header: "Folder", hideOnMobile: true, sort: (d) => d.folder, render: (d) => html`<${Badge}><${Icon} name="folder" size=${12} />${d.folder}<//>` },
          { key: "by", header: "Uploaded", hideOnMobile: true, sort: (d) => d.created_at, render: (d) => html`${d.uploader_name || "—"}<br /><${Muted}>${fmt.date(d.created_at)}<//>` },
          { key: "actions", header: html`<span class="sr-only">Actions</span>`, align: "right", render: (d) => html`<span style=${{ display: "inline-flex", gap: 4 }}>
            ${/^(application\/pdf|image\/)/.test(d.mime_type) && html`<a href=${`/api/documents/${d.id}/file?inline=1`} target="_blank" rel="noopener" title="Open" aria-label=${`Open ${d.title}`} style=${{ display: "inline-grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, color: "var(--fg)" }}><${Icon} name="eye" /></a>`}
            <a href=${`/api/documents/${d.id}/file`} title="Download" aria-label=${`Download ${d.title}`} style=${{ display: "inline-grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, color: "var(--fg)" }}><${Icon} name="download" /></a>
            ${(d.uploaded_by === user.id || atLeast(user, "manager")) && html`<${Button} size="sm" variant="ghost" icon="trash-2" ariaLabel=${`Delete ${d.title}`} onClick=${() => confirm(`Delete “${d.title}”? The file is removed for everyone.`, async () => { await act(() => api("DELETE", `/api/documents/${d.id}`), "Document deleted"); res.reload(); })} />`}
          </span>` },
        ]} /><//>`}<//>
      <${UploadModal} open=${uploading} folders=${folders} onClose=${() => setUploading(false)} onDone=${() => { setUploading(false); toast("Uploaded"); res.reload(); }} />
      ${confirmDialog}
    <//>`;
  }

  // ─────────────────────────── Team & settings ───────────────────────────
  function TeamView() {
    const { user, users, reloadUsers, toast, setCompany } = useApp();
    const admin = atLeast(user, "admin");
    const settings = useResource(admin ? "/api/settings" : null);
    const [editing, setEditing] = useState(null);
    const item = editing && editing !== "new" ? editing : null;
    const fields = [
      { name: "name", label: "Full name", type: "text", required: true },
      { name: "email", label: "Email (used to sign in)", type: "email", required: true },
      { name: "job_title", label: "Job title", type: "text" },
      { name: "role", label: "Role", type: "select", options: META.role, default: "member", required: true, hint: "Members do the work · Managers also see finance and approve spending · Admins also manage people and settings." },
      { name: "password", label: item ? "New password" : "Temporary password", type: "password", required: !item, autoComplete: "new-password", hint: item ? "Leave empty to keep their current password. Setting one signs them out and they'll choose a new one at next sign-in." : "At least 10 characters with a number. Share it privately — they'll choose their own when they first sign in." },
      ...(item ? [{ name: "active", label: "Active", type: "checkbox", hint: "Inactive people can't sign in" }] : []),
    ];
    return html`<${Fragment}>
      <${PageHeader} title="Team" description="Who's on the team and what they can do." actions=${admin && html`<${Button} variant="primary" icon="user-plus" onClick=${() => setEditing("new")}>Add person<//>`} />
      <div style=${{ display: "grid", gap: 16 }}>
        <${Card}><${Table} rows=${users} onRowClick=${admin ? (u) => setEditing(u) : undefined}
          columns=${[
            { key: "name", header: "Name", sort: (u) => u.name, render: (u) => html`<${UserChip} name=${u.name} subtitle=${u.job_title} />` },
            { key: "email", header: "Email", hideOnMobile: true, render: (u) => html`<a href=${`mailto:${u.email}`} onClick=${(e) => e.stopPropagation()}>${u.email}</a>` },
            { key: "role", header: "Role", sort: (u) => RANK[u.role], render: (u) => html`<${StatusBadge} meta=${META.role} value=${u.role} />` },
            { key: "status", header: "Status", hideOnMobile: true, render: (u) => (u.active ? html`<${Badge} tone="success" dot>Active<//>` : html`<${Badge} dot>Inactive<//>`) },
          ]} /><//>
        ${admin && html`<${Loaded} res=${settings}>${(s) => html`<${SettingsCard} initial=${s} onSaved=${(v) => { setCompany(v.company_name); settings.reload(); toast("Settings saved"); }} />`}<//>`}
        ${admin && html`<${Section} title="Backups" description=${settings.data && settings.data.last_backup_at ? `Last downloaded ${fmt.relative(settings.data.last_backup_at)}.` : "No backup downloaded yet."}
          actions=${html`<a href="/api/backup" download onClick=${() => setTimeout(settings.reload, 1500)} style=${{ display: "inline-flex", alignItems: "center", gap: 8, height: 36, padding: "0 14px", borderRadius: 8, background: "var(--primary)", color: "var(--primary-fg)", textDecoration: "none", fontSize: 13.5, fontWeight: 500 }}><${Icon} name="download" />Download backup</a>`}>
          <p style=${{ margin: 0, fontSize: 13.5 }}>The backup is a .zip of everything: the database and all uploaded files. Keep copies somewhere safe (cloud storage or a USB drive), at least once a week.</p>
          <p style=${{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>To restore: stop the workspace, unzip the backup inside the workspace folder (replacing the <code>data</code> folder), and start it again.</p>
        <//>`}
      </div>
      <${FormModal} open=${Boolean(editing)} onClose=${() => setEditing(null)} title=${item ? `Edit ${item.name}` : "Add a person"} fields=${fields} initial=${item ? { ...item, active: Boolean(item.active) } : null} submitLabel=${item ? "Save" : "Add person"}
        onSubmit=${async (v) => {
          if (item) await api("PATCH", `/api/users/${item.id}`, v);
          else await api("POST", "/api/users", v);
          setEditing(null);
          toast(item ? "Saved" : `${v.name} can now sign in`);
          reloadUsers();
        }} />
    <//>`;
  }
  function SettingsCard({ initial, onSaved }) {
    const [v, setV] = useState({ company_name: initial.company_name || "", opening_balance: initial.opening_balance ?? "", opening_date: initial.opening_date || "" });
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const set = (k) => (x) => setV((s) => ({ ...s, [k]: x }));
    const save = async () => {
      setBusy(true);
      setErrors({});
      try {
        await api("PUT", "/api/settings", v);
        onSaved(v);
      } catch (err) {
        setErrors(err.fields || { company_name: err.message });
      } finally {
        setBusy(false);
      }
    };
    return html`<${Section} title="Workspace settings" actions=${html`<${Button} variant="primary" disabled=${busy} onClick=${save}>${busy ? "Saving…" : "Save settings"}<//>`}>
      <div class="form-grid">
        <${Field} id="s-company" label="Company name" error=${errors.company_name}><${TextInput} id="s-company" value=${v.company_name} onChange=${set("company_name")} /><//>
        <${Field} id="s-balance" label="Starting bank balance (R)" error=${errors.opening_balance} hint="Your balance before the first transaction you record."><${TextInput} id="s-balance" type="number" step="0.01" min="0" value=${v.opening_balance} onChange=${set("opening_balance")} /><//>
        <${Field} id="s-date" label="Balance as at" error=${errors.opening_date}><${TextInput} id="s-date" type="date" value=${v.opening_date} onChange=${set("opening_date")} /><//>
      </div>
    <//>`;
  }

  // ─────────────────────────── My account ───────────────────────────
  function ProfileView() {
    const { user, toast } = useApp();
    const [theme, setTheme] = useState(readTheme());
    const [formKey, setFormKey] = useState(0);
    return html`<${Fragment}>
      <${PageHeader} title="My account" />
      <${Grid} min=${340}>
        <${Section} title="Your details">
          <div style=${{ display: "flex", gap: 14, alignItems: "center" }}>
            <${Avatar} name=${user.name} size=${48} />
            <div><strong style=${{ fontSize: 16 }}>${user.name}</strong><br /><${Muted}>${user.email}<//><div style=${{ marginTop: 6 }}><${StatusBadge} meta=${META.role} value=${user.role} /></div></div>
          </div>
          <p style=${{ margin: "14px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>Ask an admin to change your name, email or role.</p>
        <//>
        <${Section} title="Appearance">
          <${Field} id="theme" label="Theme"><${Select} id="theme" value=${theme} onChange=${(t) => { setTheme(t); applyTheme(t); }} options=${[{ value: "system", label: "Match my device" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} style=${{ width: "100%" }} /><//>
        <//>
        <${PasswordCard} key=${formKey} onDone=${() => { toast("Password changed. Other devices were signed out."); setFormKey((k) => k + 1); }} />
      <//>
    <//>`;
  }
  function PasswordCard({ onDone }) {
    const [v, setV] = useState({ current: "", next: "", confirm: "" });
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const set = (k) => (x) => setV((s) => ({ ...s, [k]: x }));
    const save = async (e) => {
      e.preventDefault();
      if (v.next !== v.confirm) return setErrors({ confirm: "The passwords don't match." });
      setBusy(true);
      setErrors({});
      try {
        await api("POST", "/api/auth/password", { current: v.current, next: v.next });
        onDone();
      } catch (err) {
        setErrors(err.fields || { current: err.message });
      } finally {
        setBusy(false);
      }
    };
    return html`<${Section} title="Change password">
      <form onSubmit=${save} style=${{ display: "grid", gap: 12 }}>
        <${Field} id="pw-current" label="Current password" error=${errors.current}><${TextInput} id="pw-current" type="password" autoComplete="current-password" value=${v.current} onChange=${set("current")} /><//>
        <${Field} id="pw-next" label="New password" error=${errors.next} hint="At least 10 characters, with letters and a number."><${TextInput} id="pw-next" type="password" autoComplete="new-password" value=${v.next} onChange=${set("next")} /><//>
        <${Field} id="pw-confirm" label="Confirm new password" error=${errors.confirm}><${TextInput} id="pw-confirm" type="password" autoComplete="new-password" value=${v.confirm} onChange=${set("confirm")} /><//>
        <div><${Button} type="submit" variant="primary" disabled=${busy || !v.current || !v.next}>${busy ? "Saving…" : "Change password"}<//></div>
      </form>
    <//>`;
  }

  // ─────────────────────────── Sign-in & first-run setup ───────────────────────────
  function AuthFrame({ company, title, subtitle, children }) {
    return html`<main class="auth"><div class="auth-card">
      <div style=${{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 20, textAlign: "center" }}>
        <span class="crest" style=${{ width: 64, height: 64, borderRadius: 16 }}><img src="crest.png" alt="" /></span>
        <div style=${{ fontFamily: "var(--display)", fontWeight: 700, letterSpacing: ".08em", fontSize: 18 }}>${(company || "Integral Academy").toUpperCase()}</div>
      </div>
      <${Card} style=${{ padding: 24, display: "grid", gap: 16 }}>
        <div><h1 style=${{ margin: 0, fontSize: 20 }}>${title}</h1>${subtitle && html`<p style=${{ margin: "4px 0 0", color: "var(--muted-fg)", fontSize: 13.5 }}>${subtitle}</p>`}</div>
        ${children}
      <//>
    </div></main>`;
  }
  function useAuthForm(initial, submitFn) {
    const [v, setV] = useState(initial);
    const [errors, setErrors] = useState({});
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const set = (k) => (x) => setV((s) => ({ ...s, [k]: x }));
    const submit = async (e) => {
      e.preventDefault();
      setBusy(true);
      setErrors({});
      setError("");
      try {
        await submitFn(v, setErrors);
      } catch (err) {
        setErrors(err.fields || {});
        setError(err.message);
      } finally {
        setBusy(false);
      }
    };
    return { v, set, errors, error, busy, submit };
  }
  const Alert = ({ children }) => children && html`<div role="alert" style=${{ padding: "8px 12px", borderRadius: 8, background: "var(--danger-soft)", color: "var(--danger)", fontSize: 13 }}>${children}</div>`;
  function LoginScreen({ company, onSignedIn }) {
    const f = useAuthForm({ email: "", password: "" }, async (v) => {
      await api("POST", "/api/auth/login", v);
      await onSignedIn();
    });
    return html`<${AuthFrame} company=${company} title="Sign in" subtitle="Use the email and password your admin gave you.">
      <form onSubmit=${f.submit} style=${{ display: "grid", gap: 12 }}>
        <${Field} id="email" label="Email"><${TextInput} id="email" type="email" autoComplete="username" value=${f.v.email} onChange=${f.set("email")} autoFocus=${true} /><//>
        <${Field} id="password" label="Password"><${TextInput} id="password" type="password" autoComplete="current-password" value=${f.v.password} onChange=${f.set("password")} /><//>
        <${Alert}>${f.error}<//>
        <${Button} type="submit" variant="primary" size="lg" disabled=${f.busy}>${f.busy ? "Signing in…" : "Sign in"}<//>
      </form>
      <${Muted}>Forgot your password? Ask an admin to set a new one.<//>
    <//>`;
  }
  function SetupScreen({ onDone }) {
    const f = useAuthForm({ company: "Integral Academy", name: "", email: "", password: "", confirm: "" }, async (v, setErrors) => {
      if (v.password !== v.confirm) {
        setErrors({ confirm: "The passwords don't match." });
        return;
      }
      await api("POST", "/api/auth/setup", { company: v.company, name: v.name, email: v.email, password: v.password });
      await onDone();
    });
    return html`<${AuthFrame} company=${f.v.company} title="Set up your workspace" subtitle="Create the first admin account. You can add the rest of the team afterwards.">
      <form onSubmit=${f.submit} style=${{ display: "grid", gap: 12 }}>
        <${Field} id="company" label="Company name" error=${f.errors.company}><${TextInput} id="company" value=${f.v.company} onChange=${f.set("company")} /><//>
        <${Field} id="name" label="Your name" error=${f.errors.name}><${TextInput} id="name" autoComplete="name" value=${f.v.name} onChange=${f.set("name")} /><//>
        <${Field} id="email" label="Your email" error=${f.errors.email}><${TextInput} id="email" type="email" autoComplete="username" value=${f.v.email} onChange=${f.set("email")} /><//>
        <${Field} id="password" label="Password" error=${f.errors.password} hint="At least 10 characters, with letters and a number."><${TextInput} id="password" type="password" autoComplete="new-password" value=${f.v.password} onChange=${f.set("password")} /><//>
        <${Field} id="confirm" label="Confirm password" error=${f.errors.confirm}><${TextInput} id="confirm" type="password" autoComplete="new-password" value=${f.v.confirm} onChange=${f.set("confirm")} /><//>
        <${Alert}>${f.error && !Object.keys(f.errors).length ? f.error : ""}<//>
        <${Button} type="submit" variant="primary" size="lg" disabled=${f.busy}>${f.busy ? "Creating…" : "Create workspace"}<//>
      </form>
    <//>`;
  }

  function NewPasswordScreen({ company, user, onDone, onSignOut }) {
    const f = useAuthForm({ current: "", next: "", confirm: "" }, async (v, setErrors) => {
      if (v.next !== v.confirm) {
        setErrors({ confirm: "The passwords don't match." });
        return;
      }
      await api("POST", "/api/auth/password", { current: v.current, next: v.next });
      await onDone();
    });
    return html`<${AuthFrame} company=${company} title=${`Welcome, ${user.name.split(" ")[0]}`} subtitle="You signed in with a temporary password. Choose your own to continue — only you will know it.">
      <form onSubmit=${f.submit} style=${{ display: "grid", gap: 12 }}>
        <${Field} id="current" label="Temporary password" error=${f.errors.current}><${TextInput} id="current" type="password" autoComplete="current-password" value=${f.v.current} onChange=${f.set("current")} /><//>
        <${Field} id="next" label="New password" error=${f.errors.next} hint="At least 10 characters, with letters and a number."><${TextInput} id="next" type="password" autoComplete="new-password" value=${f.v.next} onChange=${f.set("next")} /><//>
        <${Field} id="confirm" label="Confirm new password" error=${f.errors.confirm}><${TextInput} id="confirm" type="password" autoComplete="new-password" value=${f.v.confirm} onChange=${f.set("confirm")} /><//>
        <${Alert}>${f.error && !Object.keys(f.errors).length ? f.error : ""}<//>
        <${Button} type="submit" variant="primary" size="lg" disabled=${f.busy}>${f.busy ? "Saving…" : "Save and continue"}<//>
      </form>
      <button onClick=${onSignOut} style=${{ background: "none", border: 0, color: "var(--muted-fg)", cursor: "pointer", fontSize: 13 }}>Sign out</button>
    <//>`;
  }

  // ─────────────────────────── Search ───────────────────────────
  const RESULT_TYPES = {
    task: { label: "Tasks", icon: "list-checks", href: (r) => `#/tasks?task=${r.id}`, meta: (r) => html`<${StatusBadge} meta=${META.taskStatus} value=${r.status} />` },
    lead: { label: "Schools", icon: "school", href: (r) => `#/pipeline?lead=${r.id}`, meta: (r) => html`<${StatusBadge} meta=${META.leadStage} value=${r.status} />` },
    content: { label: "Content", icon: "video", href: (r) => `#/content?item=${r.id}`, meta: (r) => html`<${StatusBadge} meta=${META.contentStage} value=${r.status} />` },
    meeting: { label: "Meetings", icon: "notebook-pen", href: (r) => `#/meetings?meeting=${r.id}`, meta: (r) => html`<${Muted}>${fmt.date(r.date)}<//>` },
    document: { label: "Documents", icon: "file-text", href: (r) => `/api/documents/${r.id}/file?inline=1`, external: true },
    approval: { label: "Approvals", icon: "circle-check", href: () => "#/approvals", meta: (r) => html`<${StatusBadge} meta=${META.approval} value=${r.status} />` },
    transaction: { label: "Transactions", icon: "receipt", href: () => "#/finance", meta: (r) => html`<span class="tabular" style=${{ fontSize: 13 }}>${fmt.zar(r.amount)}</span>` },
    person: { label: "People", icon: "users", href: () => "#/team" },
  };
  function SearchDialog({ open, onClose }) {
    const [q, setQ] = useState("");
    const [results, setResults] = useState(null);
    const [resultsFor, setResultsFor] = useState("");
    const [active, setActive] = useState(0);
    const inputRef = useRef(null);
    const pendingEnter = useRef(false);
    useEffect(() => {
      if (!open) return;
      setQ("");
      setResults(null);
      setResultsFor("");
      pendingEnter.current = false;
      setActive(0);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
    }, [open]);
    useEffect(() => {
      if (q.trim().length < 2) {
        setResults(null);
        return undefined;
      }
      let live = true;
      const t = setTimeout(() => {
        api("GET", `/api/search?q=${encodeURIComponent(q.trim())}`)
          .then((r) => {
            if (live) {
              setResults(r);
              setResultsFor(q.trim());
              setActive(0);
            }
          })
          .catch(() => {
            if (live) {
              setResults([]);
              setResultsFor(q.trim());
            }
          });
      }, 180);
      return () => {
        live = false;
        clearTimeout(t);
      };
    }, [q]);
    const choose = (r) => {
      const t = RESULT_TYPES[r.type];
      onClose();
      if (t.external) window.open(t.href(r), "_blank", "noopener");
      else window.location.hash = t.href(r);
    };
    // Enter pressed before the results for the latest typing arrived opens the first fresh result.
    useEffect(() => {
      if (pendingEnter.current && results && resultsFor === q.trim()) {
        pendingEnter.current = false;
        if (results.length) choose(results[0]);
      }
    }, [results, resultsFor]); // eslint-disable-line react-hooks/exhaustive-deps
    const onKey = (e) => {
      if (e.key === "Enter" && q.trim().length >= 2 && resultsFor !== q.trim()) {
        e.preventDefault();
        pendingEnter.current = true;
        return;
      }
      if (!results || !results.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(results.length - 1, a + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose(results[active]);
      }
    };
    const groups = [];
    (results || []).forEach((r, i) => {
      const last = groups[groups.length - 1];
      if (last && last.type === r.type) last.items.push([r, i]);
      else groups.push({ type: r.type, items: [[r, i]] });
    });
    return html`<${Modal} open=${open} onClose=${onClose} title="Search the workspace" width=${620}>
      <div style=${{ position: "relative" }}>
        <span style=${{ position: "absolute", left: 12, top: 11, color: "var(--muted-fg)" }}><${Icon} name="search" size=${16} /></span>
        <input ref=${inputRef} type="search" aria-label="Search" placeholder="Tasks, schools, content, meetings, documents, people…" value=${q} onInput=${(e) => setQ(e.target.value)} onKeyDown=${onKey}
          style=${{ width: "100%", height: 40, padding: "0 12px 0 36px", borderRadius: 10, border: "1px solid var(--input)", background: "var(--card)", color: "var(--fg)", fontSize: 14 }} />
      </div>
      ${q.trim().length < 2 ? html`<${Muted}>Type at least two letters. Use ↑ ↓ and Enter to open a result.<//>`
        : !results ? html`<${Muted}>Searching…<//>`
        : results.length === 0 ? html`<${EmptyState} icon="search" title="No matches" description=${`Nothing found for “${q.trim()}”.`} />`
        : html`<div role="listbox" aria-label="Results" style=${{ display: "grid", gap: 12, maxHeight: "55vh", overflowY: "auto" }}>${groups.map((g) => html`<div key=${g.type}>
            <div style=${{ fontSize: 11, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--muted-fg)", margin: "0 0 4px 4px" }}>${RESULT_TYPES[g.type].label}</div>
            ${g.items.map(([r, i]) => html`<button key=${r.type + r.id} role="option" aria-selected=${i === active} onMouseEnter=${() => setActive(i)} onClick=${() => choose(r)}
              style=${{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: 0, cursor: "pointer", background: i === active ? "var(--accent)" : "transparent", color: "var(--fg)" }}>
              <span style=${{ color: "var(--muted-fg)", display: "inline-flex" }}><${Icon} name=${RESULT_TYPES[r.type].icon} size=${16} /></span>
              <span style=${{ flex: 1, minWidth: 0 }}><span style=${{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>${r.title}</span>${r.sub && html`<${Muted}>${r.type === "content" ? META.contentType[r.sub]?.label || r.sub : r.sub}<//>`}</span>
              ${RESULT_TYPES[r.type].meta && RESULT_TYPES[r.type].meta(r)}
            </button>`)}
          </div>`)}</div>`}
    <//>`;
  }

  // ─────────────────────────── Notifications ───────────────────────────
  function NotificationsMenu({ unread }) {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState(null);
    const ref = useRef(null);
    const load = useCallback(() => api("GET", "/api/notifications").then(setData).catch(() => setData({ unread: 0, items: [] })), []);
    useEffect(() => {
      if (!open) return undefined;
      load();
      const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
      const onKey = (e) => e.key === "Escape" && setOpen(false);
      document.addEventListener("mousedown", onDown);
      window.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDown);
        window.removeEventListener("keydown", onKey);
      };
    }, [open, load]);
    const choose = async (n) => {
      setOpen(false);
      if (!n.read_at) await api("POST", "/api/notifications/read", { ids: [n.id] }).catch(() => {});
      if (n.link) window.location.hash = `#/${n.link}`;
    };
    const readAll = async () => {
      await api("POST", "/api/notifications/read", {}).catch(() => {});
      load();
    };
    return html`<div ref=${ref} style=${{ position: "relative" }}>
      <button class="icon-button" aria-label=${unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded=${open} onClick=${() => setOpen((o) => !o)}>
        <${Icon} name="bell" />
        ${unread > 0 && html`<span class="bell-badge tabular">${unread > 9 ? "9+" : unread}</span>`}
      </button>
      ${open && html`<div class="popover" role="dialog" aria-label="Notifications">
        <div style=${{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
          <strong style=${{ fontSize: 14 }}>Notifications</strong>
          ${data && data.unread > 0 && html`<button onClick=${readAll} style=${{ all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--primary)" }}>Mark all as read</button>`}
        </div>
        <div style=${{ maxHeight: 420, overflowY: "auto" }}>
          ${!data ? html`<div style=${{ padding: 20, color: "var(--muted-fg)", fontSize: 13 }}>Loading…</div>`
            : data.items.length === 0 ? html`<${EmptyState} icon="bell" title="No notifications yet" description="You'll hear here when someone assigns you work, asks for approval or decides your request." />`
            : data.items.map((n) => html`<button key=${n.id} onClick=${() => choose(n)} style=${{ display: "flex", gap: 10, width: "100%", textAlign: "left", padding: "10px 14px", border: 0, borderBottom: "1px solid var(--border)", background: n.read_at ? "transparent" : "var(--primary-soft)", color: "var(--fg)", cursor: "pointer" }}>
                <span aria-hidden="true" style=${{ width: 8, height: 8, marginTop: 6, borderRadius: 99, flexShrink: 0, background: n.read_at ? "transparent" : "var(--primary)" }} />
                <span style=${{ minWidth: 0 }}><span style=${{ display: "block", fontSize: 13, overflowWrap: "anywhere" }}>${n.message}</span><${Muted}>${n.read_at ? "" : "New · "}${fmt.relative(n.created_at)}<//></span>
              </button>`)}
        </div>
      </div>`}
    </div>`;
  }

  // ─────────────────────────── Shell ───────────────────────────
  const ROUTES = [
    { group: "Work", path: "dashboard", label: "Dashboard", icon: "layout-dashboard", view: DashboardView },
    { group: "Work", path: "tasks", label: "Tasks", icon: "list-checks", view: TasksView },
    { group: "Work", path: "calendar", label: "Calendar", icon: "calendar-days", view: CalendarView },
    { group: "Work", path: "goals", label: "Goals", icon: "target", view: GoalsView },
    { group: "Work", path: "content", label: "Content", icon: "video", view: ContentView },
    { group: "Schools", path: "pipeline", label: "Schools pipeline", icon: "school", view: PipelineView },
    { group: "Schools", path: "contracts", label: "Contracts & renewals", icon: "landmark", view: ContractsView },
    { group: "Money", path: "finance", label: "Finance", icon: "wallet", view: FinanceView, minRole: "manager" },
    { group: "Money", path: "approvals", label: "Approvals", icon: "circle-check", view: ApprovalsView },
    { group: "Insights", path: "stats", label: "Stats", icon: "grid-3x3", view: StatsView },
    { group: "Insights", path: "report", label: "Monthly update", icon: "book-open", view: ReportView, minRole: "manager" },
    { group: "Team", path: "meetings", label: "Meetings", icon: "notebook-pen", view: MeetingsView },
    { group: "Team", path: "documents", label: "Documents", icon: "folder-open", view: DocumentsView },
    { group: "Team", path: "team", label: "Team & settings", icon: "users", view: TeamView },
    { path: "profile", label: "My account", icon: "circle-user", view: ProfileView, hidden: true },
  ];
  function Shell({ onSignOut }) {
    const app = useApp();
    const { user, company } = app;
    const [route, setRoute] = useState(parseHash);
    const [menuOpen, setMenuOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [counts, setCounts] = useState({});
    const [, force] = useState(0);
    // Badge counts: refreshed on navigation, after any change, and every minute.
    useEffect(() => {
      let timer = null;
      const load = () => api("GET", "/api/counts").then(setCounts).catch(() => {});
      const soon = () => {
        clearTimeout(timer);
        timer = setTimeout(load, 300);
      };
      load();
      const every = setInterval(load, 60000);
      window.addEventListener("ws:changed", soon);
      return () => {
        clearInterval(every);
        clearTimeout(timer);
        window.removeEventListener("ws:changed", soon);
      };
    }, [route.path]);
    useEffect(() => {
      const onKey = (e) => {
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
        if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
          e.preventDefault();
          setSearchOpen(true);
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, []);
    const badges = { tasks: counts.myOpenTasks, approvals: counts.approvalsToDecide };
    useEffect(() => {
      const on = () => {
        setRoute(parseHash());
        setMenuOpen(false);
      };
      window.addEventListener("hashchange", on);
      return () => window.removeEventListener("hashchange", on);
    }, []);
    const allowed = ROUTES.filter((r) => !r.minRole || atLeast(user, r.minRole));
    const current = allowed.find((r) => r.path === route.path);
    useEffect(() => {
      document.title = `${current ? current.label : "Not found"} · ${company}`;
      window.scrollTo(0, 0);
    }, [route.path, current, company]);
    const groups = [...new Set(allowed.filter((r) => !r.hidden).map((r) => r.group))];
    const View = current && current.view;
    const toggleTheme = () => {
      applyTheme(isDark() ? "light" : "dark");
      force((n) => n + 1);
    };
    return html`<div class="app">
      <aside class=${`sidebar${menuOpen ? " open" : ""}`} aria-label="Main navigation">
        <div class="brand">
          <span class="crest"><img src="crest.png" alt="" /></span>
          <div style=${{ minWidth: 0 }}><div class="brand-name">${company.toUpperCase()}</div><div class="brand-sub">Team workspace</div></div>
          <button class="mobile-only" aria-label="Close menu" onClick=${() => setMenuOpen(false)} style=${{ marginLeft: "auto", background: "none", border: 0, color: "var(--sidebar-fg)", cursor: "pointer" }}><${Icon} name="x" /></button>
        </div>
        <nav class="nav">
          ${groups.map((g) => html`<div key=${g}>
            <div class="nav-group-label">${g}</div>
            ${allowed.filter((r) => r.group === g).map((r) => html`<a key=${r.path} class="nav-link" href=${`#/${r.path}`} aria-current=${route.path === r.path ? "page" : undefined}><${Icon} name=${r.icon} size=${17} />${r.label}${badges[r.path] ? html`<span class="nav-badge" title=${r.path === "tasks" ? `${badges.tasks} open tasks assigned to you${counts.myOverdueTasks ? `, ${counts.myOverdueTasks} overdue` : ""}` : `${badges.approvals} waiting for your decision`} style=${r.path === "tasks" && counts.myOverdueTasks ? { background: "var(--danger)", color: "#fff" } : undefined}>${badges[r.path]}</span>` : null}</a>`)}
          </div>`)}
        </nav>
        <div style=${{ borderTop: "1px solid var(--sidebar-border)", padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <a href="#/profile" style=${{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1, textDecoration: "none", color: "var(--sidebar-fg)" }}>
            <${Avatar} name=${user.name} size=${30} />
            <span style=${{ minWidth: 0 }}><span style=${{ display: "block", color: "var(--sidebar-heading)", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>${user.name}</span><span style=${{ fontSize: 11.5, color: "var(--sidebar-muted)" }}>${META.role[user.role].label}</span></span>
          </a>
          <button title="Sign out" aria-label="Sign out" onClick=${onSignOut} style=${{ background: "none", border: 0, color: "var(--sidebar-muted)", cursor: "pointer", display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 8 }}><${Icon} name="log-out" /></button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <${Button} className="mobile-only" variant="ghost" icon="menu" ariaLabel="Open menu" onClick=${() => setMenuOpen(true)} />
          <strong style=${{ fontSize: 14, fontWeight: 600 }}>${current ? current.label : ""}</strong>
          <span style=${{ flex: 1 }} />
          <button onClick=${() => setSearchOpen(true)} aria-label="Search (Ctrl+K)" class="search-trigger">
            <${Icon} name="search" size=${15} /><span class="hide-sm">Search…</span><kbd class="hide-sm">${/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K"}</kbd>
          </button>
          <${NotificationsMenu} unread=${counts.unreadNotifications || 0} />
          <${Button} variant="ghost" icon=${isDark() ? "sun" : "moon"} ariaLabel=${isDark() ? "Switch to light theme" : "Switch to dark theme"} title="Toggle theme" onClick=${toggleTheme} />
          <a href="#/profile" aria-label="My account" style=${{ display: "inline-flex" }}><${Avatar} name=${user.name} size=${30} /></a>
        </header>
        <main class="content">
          ${View ? html`<${View} key=${route.path} params=${route.params} />` : html`<${Card} style=${{ maxWidth: 560, margin: "40px auto" }}><${EmptyState} icon="lock" title="Page not found" description="It may have moved, or your role doesn't include it." action=${html`<a href="#/dashboard" style=${{ marginTop: 8, color: "var(--primary)", fontWeight: 500 }}>Back to the dashboard</a>`} /><//>`}
        </main>
      </div>
      <${SearchDialog} open=${searchOpen} onClose=${() => setSearchOpen(false)} />
    </div>`;
  }

  function App() {
    const [status, setStatus] = useState(null); // { setupRequired, user, company }
    const [users, setUsers] = useState([]);
    const [toasts, setToasts] = useState([]);
    const toast = useCallback((message, tone = "success") => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t, { id, message, tone }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
    }, []);
    const loadStatus = useCallback(async () => {
      try {
        setStatus(await api("GET", "/api/auth/status"));
      } catch (err) {
        setStatus({ error: err.message });
      }
    }, []);
    const reloadUsers = useCallback(() => api("GET", "/api/users").then(setUsers).catch(() => {}), []);
    useEffect(() => {
      loadStatus();
      const out = () => setStatus((s) => (s && s.user ? { ...s, user: null } : s));
      window.addEventListener("ws:signed-out", out);
      window.addEventListener("ws:refresh", loadStatus); // lets the online preview switch accounts
      return () => {
        window.removeEventListener("ws:signed-out", out);
        window.removeEventListener("ws:refresh", loadStatus);
      };
    }, [loadStatus]);
    const readyKey = status && status.user && !status.user.must_change_password ? status.user.id : null;
    useEffect(() => {
      if (readyKey) reloadUsers();
    }, [readyKey, reloadUsers]);
    const ctx = useMemo(() => {
      if (!status || !status.user) return null;
      const byId = new Map(users.map((u) => [u.id, u]));
      return {
        user: status.user,
        company: status.company,
        users,
        reloadUsers,
        userName: (id) => (id ? (byId.get(id) || {}).name || "—" : "—"),
        setCompany: (company) => setStatus((s) => ({ ...s, company: company || "Integral Academy" })),
        toast,
      };
    }, [status, users, reloadUsers, toast]);
    const signOut = async () => {
      await api("POST", "/api/auth/logout").catch(() => {});
      setStatus((s) => ({ ...s, user: null }));
      window.location.hash = "";
    };
    let body;
    if (!status) body = html`<div id="boot">Loading…</div>`;
    else if (status.error) body = html`<div id="boot"><div>Can't reach the workspace server.<br />${status.error}<br /><br /><${Button} onClick=${loadStatus}>Try again<//></div></div>`;
    else if (status.setupRequired) body = html`<${SetupScreen} onDone=${loadStatus} />`;
    else if (!status.user) body = html`<${LoginScreen} company=${status.company} onSignedIn=${loadStatus} />`;
    else if (status.user.must_change_password) body = html`<${NewPasswordScreen} company=${status.company} user=${status.user} onDone=${loadStatus} onSignOut=${signOut} />`;
    else body = html`<${AppContext.Provider} value=${ctx}><${Shell} key=${status.user.id} onSignOut=${signOut} /><//>`;
    return html`${body}
      <div class="toast-stack" aria-live="polite">${toasts.map((t) => html`<div key=${t.id} role="status" style=${{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "var(--card)", border: "1px solid var(--border)", borderLeft: `4px solid ${t.tone === "danger" ? "var(--danger)" : "var(--success)"}`, boxShadow: "0 8px 24px rgb(0 0 0 / .18)", fontSize: 13.5 }}><${Icon} name=${t.tone === "danger" ? "triangle-alert" : "check"} size=${16} />${t.message}</div>`)}</div>`;
  }

  ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
})();
