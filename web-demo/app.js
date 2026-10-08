/* Shell: loads the snapshot, renders navigation, persona switcher and the active route. */
(function () {
  "use strict";
  const { React, html, useState, useEffect, useMemo, useApp, Icon, Button, Badge, Select, Card, EmptyState, AccessDenied, matchRoute, NAV, fmt, AppContext, useAppState, PERSONAS } = IA;

  function Sidebar({ open, onNavigate }) {
    const app = useApp();
    const counts = useMemo(() => {
      const myOpenTasks = app.visible("tasks").filter((t) => t.assigneeId === app.user.id && t.status !== "COMPLETED").length;
      const awaiting = app.visible("approvals").filter((a) => ["PENDING", "CHANGES_REQUESTED"].includes(a.status) && a.requesterId !== app.user.id).length;
      return { tasks: myOpenTasks, approvals: app.can("approvals.decide") || app.can("approvals.decide.finance") ? awaiting : 0 };
    }, [app]);
    const isActive = (path) => app.route.path === path || app.route.path.startsWith(`${path}/`);
    return html`<aside class=${`sidebar${open ? " open" : ""}`} aria-label="Main navigation">
      <a class="brand" href="#/dashboard" style=${{ textDecoration: "none" }} onClick=${onNavigate}>
        <span class="crest"><img src=${IA_ASSETS.crest} alt="" /></span>
        <span><span class="brand-name" style=${{ display: "block" }}>INTEGRAL ACADEMY</span><span class="brand-sub">Executive Workspace</span></span>
      </a>
      <nav class="nav">
        ${NAV.map((g) => {
          const items = g.items.filter((it) => app.canAny(it.anyOf));
          if (!items.length) return null;
          return html`<div key=${g.label}><div class="nav-group-label">${g.label}</div>
            ${items.map((it) => html`<a key=${it.path} class="nav-link" href=${`#${it.path}`} aria-current=${isActive(it.path) ? "page" : undefined} onClick=${onNavigate}>
              <${Icon} name=${it.icon} size=${18} />${it.label}${it.badge && counts[it.badge] > 0 && html`<span class="nav-badge">${counts[it.badge]}</span>`}
            </a>`)}
          </div>`;
        })}
      </nav>
      <div style=${{ padding: "12px", borderTop: "1px solid var(--sidebar-border)", display: "grid", gap: 2 }}>
        <a class="nav-link" href="#/profile" aria-current=${isActive("/profile") ? "page" : undefined} onClick=${onNavigate}><${Icon} name="circle-user" size=${18} />Profile</a>
        <a class="nav-link" href="#/notifications" aria-current=${isActive("/notifications") ? "page" : undefined} onClick=${onNavigate}><${Icon} name="bell" size=${18} />Notifications${app.unread > 0 && html`<span class="nav-badge">${app.unread}</span>`}</a>
      </div>
    </aside>`;
  }

  function PersonaSwitcher() {
    const app = useApp();
    const options = PERSONAS.map((k) => {
      const p = app.data.personas[k];
      const u = app.usersById.get(p.userId);
      return { value: k, label: `${u.name} — ${app.data.rbac.roles[p.roleKey].name}` };
    });
    return html`<label style=${{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--muted-fg)" }}>
      <span class="hide-sm">Viewing as</span>
      <${Select} ariaLabel="Switch persona" value=${app.personaKey} onChange=${(k) => { app.setPersona(k); app.toast(`Now viewing as ${options.find((o) => o.value === k).label}`, "info"); }} options=${options} style=${{ minWidth: 0, maxWidth: 260, height: 34 }} />
    </label>`;
  }

  function NotificationBell() {
    const app = useApp();
    const [open, setOpen] = useState(false);
    const recent = app.notifications.slice(0, 8);
    return html`<div style=${{ position: "relative" }}>
      <${Button} variant="ghost" icon="bell" ariaLabel=${`Notifications (${app.unread} unread)`} onClick=${() => setOpen((o) => !o)} />
      ${app.unread > 0 && html`<span aria-hidden="true" style=${{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 99, background: "var(--danger)", color: "#fff", fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center" }}>${app.unread}</span>`}
      ${open && html`<div style=${{ position: "absolute", right: 0, top: 42, width: "min(360px, calc(100vw - 32px))", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 16px 40px rgb(0 0 0 / .25)", zIndex: 40 }}>
        <div style=${{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
          <strong>Notifications</strong>
          <${Button} size="sm" variant="ghost" onClick=${() => app.markRead(app.notifications.map((n) => n.id))}>Mark all read<//>
        </div>
        ${recent.length === 0 ? html`<${EmptyState} icon="bell" title="You're all caught up" />` : html`<ul style=${{ listStyle: "none", margin: 0, padding: 0, maxHeight: 380, overflow: "auto" }}>
          ${recent.map((n) => html`<li key=${n.id} style=${{ padding: "10px 14px", borderBottom: "1px solid var(--border)", background: n.readAt ? "transparent" : "var(--primary-soft)" }}>
            <a href=${n.link ? `#${n.link}` : "#/notifications"} onClick=${() => { app.markRead([n.id]); setOpen(false); }} style=${{ textDecoration: "none", display: "grid", gap: 2 }}>
              <span style=${{ fontWeight: 500, fontSize: 13 }}>${n.title}</span>
              ${n.body && html`<span style=${{ fontSize: 12, color: "var(--muted-fg)" }}>${n.body}</span>`}
              <span style=${{ fontSize: 11, color: "var(--muted-fg)" }}>${fmt.relative(n.createdAt)}</span>
            </a>
          </li>`)}
        </ul>`}
        <a href="#/notifications" onClick=${() => setOpen(false)} style=${{ display: "block", padding: "10px 14px", textAlign: "center", fontSize: 13, color: "var(--primary)", fontWeight: 500 }}>See all notifications</a>
      </div>`}
    </div>`;
  }

  function Topbar({ onMenu }) {
    const app = useApp();
    const [q, setQ] = useState("");
    return html`<header class="topbar">
      <${Button} variant="ghost" icon="menu" ariaLabel="Open navigation" onClick=${onMenu} style=${{ flexShrink: 0 }} className="mobile-only" />
      <form role="search" onSubmit=${(e) => { e.preventDefault(); if (q.trim().length >= 2) app.navigate(`/search?q=${encodeURIComponent(q.trim())}`); }} style=${{ flex: "1 1 auto", maxWidth: 420, minWidth: 0, position: "relative" }}>
        <span style=${{ position: "absolute", left: 10, top: 10, color: "var(--muted-fg)" }}><${Icon} name="search" size=${15} /></span>
        <input type="search" aria-label="Search the workspace" placeholder="Search the workspace…" value=${q} onInput=${(e) => setQ(e.target.value)} style=${{ width: "100%", height: 36, padding: "0 10px 0 32px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }} />
      </form>
      <div style=${{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <${PersonaSwitcher} />
        <${NotificationBell} />
      </div>
    </header>`;
  }

  function DemoBar() {
    const app = useApp();
    const changes = Object.values(app.overlay.patches).reduce((s, m) => s + Object.keys(m).length, 0) + Object.values(app.overlay.created).reduce((s, l) => s + l.length, 0) + Object.values(app.overlay.deleted).reduce((s, m) => s + Object.keys(m).length, 0);
    return html`<div class="demo-bar" role="note">
      <span style=${{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}><${Icon} name="sparkles" size=${14} />Interactive demo</span>
      <span>Fictional data from ${fmt.date(app.data.meta.generatedAt)}. Switch persona to see each role's access. Your changes are kept only in this browser${changes ? ` (${changes} so far)` : ""}.</span>
      ${changes > 0 && html`<button onClick=${app.reset} style=${{ marginLeft: "auto", background: "none", border: "1px solid currentColor", borderRadius: 6, padding: "2px 10px", cursor: "pointer", color: "inherit", fontSize: 12 }}>Reset demo</button>`}
    </div>`;
  }

  function Toasts({ toasts }) {
    return html`<div aria-live="polite" style=${{ position: "fixed", right: 16, bottom: 16, display: "grid", gap: 8, zIndex: 90 }}>
      ${toasts.map((t) => html`<div key=${t.id} style=${{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 10px 30px rgb(0 0 0 / .25)", fontSize: 13, maxWidth: 360 }}>
        <span style=${{ color: t.tone === "error" ? "var(--danger)" : t.tone === "info" ? "var(--info)" : "var(--success)" }}><${Icon} name=${t.tone === "error" ? "circle-x" : t.tone === "info" ? "info" : "circle-check"} size=${16} /></span>${t.message}
      </div>`)}
    </div>`;
  }

  function RouteView() {
    const app = useApp();
    const match = matchRoute(app.route);
    useEffect(() => {
      window.scrollTo(0, 0);
    }, [app.route.path]);
    useEffect(() => {
      document.title = `${match?.route.title || "Not found"} · Integral Executive Workspace`;
    }, [match]);
    if (!match) {
      const known = NAV.some((g) => g.items.some((it) => app.route.path === it.path || app.route.path.startsWith(`${it.path}/`))) || ["/profile", "/notifications", "/search"].some((p) => app.route.path.startsWith(p));
      return html`<${Card} style=${{ maxWidth: 560, margin: "40px auto" }}><${EmptyState} icon=${known ? "sparkles" : "search"} title=${known ? "This section is still being built" : "Page not found"} description=${known ? "This part of the web demo is being added right now. Refresh this page in a little while." : "This page doesn't exist in the demo."} action=${html`<a href="#/dashboard" style=${{ color: "var(--primary)", fontWeight: 500 }}>Back to the dashboard</a>`} /><//>`;
    }
    if (match.route.anyOf && !app.canAny(match.route.anyOf)) return html`<${AccessDenied} />`;
    const View = match.route.render;
    return html`<${View} params=${match.params} key=${`${app.personaKey}:${app.route.path}`} />`;
  }

  class Boundary extends React.Component {
    constructor(p) { super(p); this.state = { error: null }; }
    static getDerivedStateFromError(error) { return { error }; }
    componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
    render() {
      if (this.state.error) return html`<${Card} style=${{ maxWidth: 560, margin: "40px auto" }}><${EmptyState} icon="triangle-alert" title="This view hit a problem" description=${String(this.state.error.message || this.state.error)} /><//>`;
      return this.props.children;
    }
  }

  function Shell({ data }) {
    const { app, toasts } = useAppState(data);
    const [menuOpen, setMenuOpen] = useState(false);
    return html`<${AppContext.Provider} value=${app}>
      <div class="app">
        <${Sidebar} open=${menuOpen} onNavigate=${() => setMenuOpen(false)} />
        ${menuOpen && html`<div onClick=${() => setMenuOpen(false)} style=${{ position: "fixed", inset: 0, zIndex: 55 }} aria-hidden="true" />`}
        <div class="main">
          <${Topbar} onMenu=${() => setMenuOpen(true)} />
          <${DemoBar} />
          <main class="content" id="main"><${Boundary} resetKey=${`${app.personaKey}:${app.route.path}`}><${RouteView} /><//></main>
        </div>
      </div>
      <${Toasts} toasts=${toasts} />
    <//>`;
  }

  fetch("data.json")
    .then((r) => {
      if (!r.ok) throw new Error(`Couldn't load the demo data (HTTP ${r.status}).`);
      return r.json();
    })
    .then((data) => ReactDOM.createRoot(document.getElementById("root")).render(html`<${Shell} data=${data} />`))
    .catch((e) => {
      document.getElementById("boot").innerHTML = `<div><strong>The demo couldn't start.</strong><br>${String(e.message).replace(/[<>&]/g, "")}</div>`;
    });
})();
