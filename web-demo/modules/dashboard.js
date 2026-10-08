/* Placeholder used to smoke-test the core before modules are built. */
(function () {
  const { html, route, PageHeader, Grid, Kpi, ChartCard, useApp, fmt, Section, Kanban, Table } = IA;
  route("/dashboard", {
    title: "Executive Dashboard",
    render: function Dash() {
      const app = useApp();
      const d = app.dashboard("12m");
      const series = (d.revenueSeries || []).map((r) => ({ label: r.label, subscription: r.subscription, school: r.school, other: r.other }));
      return html`<div>
        <${PageHeader} title=${`Good day, ${app.user.name.split(" ")[0]}`} description="Core smoke test" />
        <${Grid} min=${240}>
          ${d.revenue && html`<${Kpi} label="Revenue · month to date" value=${fmt.zar(d.revenue.mtd ?? d.revenue.current ?? 0)} delta=${12.3} icon="wallet" />`}
          <${Kpi} label="Open tasks" value=${app.visible("tasks").filter((t) => t.status !== "COMPLETED").length} delta=${-4} goodWhen="down" icon="list-checks" />
        <//>
        <div style=${{ marginTop: 16 }}><${ChartCard} title="Revenue" description="Smoke test" data=${series} series=${[{ key: "subscription", label: "Subscriptions", slot: 1, type: "bar", stack: "a" }, { key: "school", label: "School contracts", slot: 2, type: "bar", stack: "a" }, { key: "other", label: "Other", slot: 3, type: "bar", stack: "a" }]} format="zar" /></div>
        <div style=${{ marginTop: 16 }}><${Section} title="Tasks" flush><${Table} columns=${[{ key: "number", header: "#", sort: (t) => t.number }, { key: "title", header: "Task" }, { key: "status", header: "Status", render: (t) => html`<${IA.StatusBadge} meta=${IA.labels.TASK_STATUS} value=${t.status} />` }]} rows=${app.visible("tasks")} search=${(t, q) => t.title.toLowerCase().includes(q)} /><//></div>
      </div>`;
    },
  });
})();
