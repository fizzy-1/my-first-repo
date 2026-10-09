/* Integral Workspace Lite — shared calculations.
 * Pure functions over plain rows (the same columns as the database tables), used by server.js and by the
 * online preview so both always agree. Dates are "YYYY-MM-DD" strings; timestamps compare by their date prefix. */
(function () {
  "use strict";
  const pad = (n) => String(n).padStart(2, "0");
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (iso, n) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + n);
    return isoDay(d);
  };
  const addMonths = (key, n) => {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const monthStart = (key) => `${key}-01`;
  const monthEndExclusive = (key) => `${addMonths(key, 1)}-01`;
  const lastDay = (key) => {
    const [y, m] = key.split("-").map(Number);
    return isoDay(new Date(y, m, 0));
  };
  const monthsBack = (endKey, n) => Array.from({ length: n }, (_, i) => addMonths(endKey, i - (n - 1)));
  const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
  const sumBy = (rows, f) => rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);
  const avg = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  const inRange = (v, from, toExclusive) => Boolean(v) && String(v) >= from && String(v) < toExclusive;
  const money = (rows, kind, from, to, filter) => sumBy(rows.filter((t) => t.kind === kind && inRange(t.date, from, to) && (!filter || filter(t))), (t) => t.amount);
  const cashAt = (data, endExclusive) => (Number(data.openingBalance) || 0) + money(data.transactions, "income", "0000", endExclusive) - money(data.transactions, "expense", "0000", endExclusive);

  // ─────────────────────────── Contracts ───────────────────────────
  /** active · due (ends within 90 days, no decision yet) · lapsed (ended, no decision) · upcoming · not_renewing · renewed · ended */
  function contractState(c, today) {
    if (c.status === "renewed") return "renewed";
    if (c.status === "ended") return c.end_date < today ? "ended" : "not_renewing";
    if (c.start_date > today) return "upcoming";
    if (c.end_date < today) return "lapsed";
    return daysBetween(today, c.end_date) <= 90 ? "due" : "active";
  }
  const runsOn = (c, date) => c.start_date <= date && c.end_date >= date;
  const arrOn = (contracts, date) => sumBy(contracts.filter((c) => runsOn(c, date)), (c) => c.annual_value);
  const schoolsOn = (contracts, date) => new Set(contracts.filter((c) => runsOn(c, date)).map((c) => c.lead_id)).size;
  const learnersOn = (contracts, date) => sumBy(contracts.filter((c) => runsOn(c, date)), (c) => c.learners);
  /** Renewal decisions on contracts that ended in the last year (or are decided early). */
  function renewalSummary(contracts, today) {
    const yearAgo = addDays(today, -365);
    const decided = contracts.filter((c) => (c.status === "renewed" || c.status === "ended") && c.end_date >= yearAgo);
    const renewed = decided.filter((c) => c.status === "renewed").length;
    const due = contracts.filter((c) => ["due", "lapsed"].includes(contractState(c, today)));
    return {
      arr: arrOn(contracts, today),
      schools: schoolsOn(contracts, today),
      learners: learnersOn(contracts, today),
      dueCount: due.length,
      dueValue: sumBy(due, (c) => c.annual_value),
      renewed,
      notRenewed: decided.length - renewed,
      renewalRate: decided.length ? renewed / decided.length : null,
    };
  }

  // ─────────────────────────── Goals ───────────────────────────
  const GOAL_METRICS = {
    manual: { label: "Updated by hand", unit: "number", cumulative: false },
    schools_won: { label: "Schools signed", unit: "number", cumulative: true },
    learners_signed: { label: "Learners signed", unit: "number", cumulative: true },
    content_published: { label: "Content published", unit: "number", cumulative: true },
    new_leads: { label: "New school leads", unit: "number", cumulative: true },
    income: { label: "Income received", unit: "zar", cumulative: true, finance: true },
    arr: { label: "Annual recurring revenue", unit: "zar", cumulative: false },
  };
  function goalCurrent(goal, data, today) {
    const from = goal.start_date;
    const to = addDays(goal.due_date, 1);
    const won = () => data.leads.filter((l) => inRange(l.won_at, from, to));
    switch (goal.metric) {
      case "schools_won": return won().length;
      case "learners_signed": return sumBy(won(), (l) => l.learners);
      case "content_published": return data.content.filter((c) => inRange(c.published_at, from, to)).length;
      case "new_leads": return data.leads.filter((l) => inRange(l.created_at, from, to)).length;
      case "income": return money(data.transactions, "income", from, to);
      case "arr": return arrOn(data.contracts, today < goal.due_date ? today : goal.due_date);
      default: return Number(goal.current_value) || 0;
    }
  }
  /** Progress against a straight line from the start (or baseline) to the target on the due date. */
  function goalProgress(goal, data, today) {
    const meta = GOAL_METRICS[goal.metric] || GOAL_METRICS.manual;
    const current = goalCurrent(goal, data, today);
    const base = meta.cumulative ? 0 : Number(goal.baseline) || 0;
    const target = Number(goal.target) || 0;
    const span = Math.max(1, daysBetween(goal.start_date, goal.due_date));
    const elapsed = Math.min(1, Math.max(0, daysBetween(goal.start_date, today) / span));
    const expected = base + (target - base) * elapsed;
    const pct = target === base ? (current >= target ? 100 : 0) : Math.max(0, Math.min(100, ((current - base) / (target - base)) * 100));
    let status;
    if (current >= target) status = "achieved";
    else if (today > goal.due_date) status = "missed";
    else if (today < goal.start_date) status = "not_started";
    else if (elapsed < 0.15 || current - base >= (expected - base) * 0.95) status = "on_track";
    else if (current - base >= (expected - base) * 0.7) status = "at_risk";
    else status = "behind";
    return { current, target, baseline: base, pct, expected, elapsed, status, daysLeft: daysBetween(today, goal.due_date), unit: meta.unit };
  }

  // ─────────────────────────── Budget ───────────────────────────
  function budgetVsActual(budgets, transactions, month, today) {
    const from = monthStart(month);
    const to = monthEndExclusive(month);
    const spend = {};
    for (const t of transactions) if (t.kind === "expense" && inRange(t.date, from, to)) spend[t.category] = (spend[t.category] || 0) + t.amount;
    const active = budgets.filter((b) => b.monthly_amount > 0);
    const rows = active.map((b) => ({ category: b.category, budget: b.monthly_amount, actual: spend[b.category] || 0 })).sort((a, b) => b.actual / b.budget - a.actual / a.budget);
    const unbudgeted = Object.entries(spend).filter(([c]) => !active.some((b) => b.category === c)).map(([category, actual]) => ({ category, budget: 0, actual })).sort((a, b) => b.actual - a.actual);
    const daysIn = Number(lastDay(month).slice(8));
    const monthElapsed = today < from ? 0 : today >= to ? 1 : Number(today.slice(8)) / daysIn;
    return { month, rows, unbudgeted, totalBudget: sumBy(active, (b) => b.monthly_amount), totalActual: sumBy(Object.values(spend), (v) => v), monthElapsed };
  }

  // ─────────────────────────── Cash forecast ───────────────────────────
  /**
   * Projects cash month by month from today's balance.
   * Income = school contracts running that month (contracts awaiting a renewal decision count at the renewal rate)
   *        + the 3-month average of all other income. Spending = the monthly budget total, or the 3-month average.
   * opts: { months, extraSpend, extraSpendFrom (YYYY-MM), extraIncome, extraIncomeFrom }
   */
  function forecast(data, today, opts = {}) {
    const months = Math.min(18, Math.max(3, Number(opts.months) || 6));
    const thisMonth = today.slice(0, 7);
    const complete = monthsBack(addMonths(thisMonth, -1), 3);
    const otherIncome = avg(complete.map((k) => money(data.transactions, "income", monthStart(k), monthEndExclusive(k), (t) => t.category !== "School contracts")));
    const budgetTotal = sumBy(data.budgets || [], (b) => b.monthly_amount);
    const avgExpense = avg(complete.map((k) => money(data.transactions, "expense", monthStart(k), monthEndExclusive(k))));
    const baseExpense = budgetTotal > 0 ? budgetTotal : avgExpense;
    const history = renewalSummary(data.contracts, today).renewalRate;
    const rate = history === null ? 0.8 : history;
    const cashNow = cashAt(data, addDays(today, 1));
    const past = monthsBack(thisMonth, 6).map((k) => ({
      month: k,
      income: money(data.transactions, "income", monthStart(k), monthEndExclusive(k)),
      expense: money(data.transactions, "expense", monthStart(k), monthEndExclusive(k)),
      cash: k === thisMonth ? cashNow : cashAt(data, monthEndExclusive(k)),
    }));
    let cash = cashNow;
    const projection = [];
    for (let i = 1; i <= months; i++) {
      const k = addMonths(thisMonth, i);
      const start = monthStart(k);
      const end = lastDay(k);
      let contractIncome = 0;
      for (const c of data.contracts) {
        if (c.start_date > end) continue;
        if (c.end_date >= start) contractIncome += c.annual_value / 12;
        else if (c.status === "active") contractIncome += (c.annual_value / 12) * rate; // awaiting a renewal decision
      }
      const extraSpend = opts.extraSpendFrom && k >= opts.extraSpendFrom ? Number(opts.extraSpend) || 0 : 0;
      const extraIncome = opts.extraIncomeFrom && k >= opts.extraIncomeFrom ? Number(opts.extraIncome) || 0 : 0;
      const income = contractIncome + otherIncome + extraIncome;
      const expense = baseExpense + extraSpend;
      cash += income - expense;
      projection.push({ month: k, income, expense, net: income - expense, cash, contractIncome, otherIncome, extraIncome, extraSpend });
    }
    const runOut = projection.find((p) => p.cash < 0);
    return {
      cashNow, past, projection, runOutMonth: runOut ? runOut.month : null,
      assumptions: { otherIncome, baseExpense, expenseSource: budgetTotal > 0 ? "budget" : "average", renewalRate: rate, renewalRateFromHistory: history !== null },
    };
  }

  // ─────────────────────────── Stats matrix ───────────────────────────
  /** Rows of monthly figures for the last `months` months (the current month is month-to-date). */
  function statsMatrix(data, today, { months = 12, includeFinance = false } = {}) {
    const keys = monthsBack(today.slice(0, 7), Math.min(24, Math.max(3, months)));
    const endOf = (k) => (k === today.slice(0, 7) ? today : lastDay(k));
    const per = (fn) => keys.map((k) => fn(monthStart(k), monthEndExclusive(k), k));
    const count = (rows, col) => per((a, b) => rows.filter((r) => inRange(r[col], a, b)).length);
    const rows = [];
    if (includeFinance) {
      const income = per((a, b) => money(data.transactions, "income", a, b));
      const expense = per((a, b) => money(data.transactions, "expense", a, b));
      rows.push(
        { key: "income", group: "Money", label: "Income", format: "zar", good: "up", values: income },
        { key: "expense", group: "Money", label: "Spending", format: "zar", good: "down", values: expense },
        { key: "net", group: "Money", label: "Net", format: "zar", good: "up", values: income.map((v, i) => v - expense[i]) },
        { key: "cash", group: "Money", label: "Cash at month end", format: "zar", good: "up", values: keys.map((k) => cashAt(data, addDays(endOf(k), 1))) },
      );
    }
    rows.push(
      { key: "arr", group: "Schools", label: "Annual recurring revenue", format: "zar", good: "up", values: keys.map((k) => arrOn(data.contracts, endOf(k))) },
      { key: "schools", group: "Schools", label: "Schools under contract", format: "number", good: "up", values: keys.map((k) => schoolsOn(data.contracts, endOf(k))) },
      { key: "learners", group: "Schools", label: "Learners under contract", format: "number", good: "up", values: keys.map((k) => learnersOn(data.contracts, endOf(k))) },
      { key: "leads", group: "Schools", label: "New leads", format: "number", good: "up", values: count(data.leads, "created_at") },
      { key: "won", group: "Schools", label: "Schools signed", format: "number", good: "up", values: count(data.leads, "won_at") },
      { key: "content", group: "Work", label: "Content published", format: "number", good: "up", values: count(data.content, "published_at") },
      { key: "tasks", group: "Work", label: "Tasks completed", format: "number", good: "up", values: count(data.tasks, "completed_at") },
      { key: "meetings", group: "Work", label: "Meetings held", format: "number", good: "up", values: per((a, b) => data.meetings.filter((m) => inRange(m.date, a, b) && m.date <= today).length) },
    );
    return { months: keys, rows };
  }
  /** One row per active person: what's on their plate and what they finished this month. */
  function teamMatrix(data, today, month) {
    const from = monthStart(month);
    const to = monthEndExclusive(month);
    return data.users.filter((u) => u.active).map((u) => {
      const mine = data.tasks.filter((t) => t.assignee_id === u.id);
      return {
        id: u.id, name: u.name, job_title: u.job_title, role: u.role,
        openTasks: mine.filter((t) => t.status !== "done").length,
        overdue: mine.filter((t) => t.status !== "done" && t.due_date && t.due_date < today).length,
        completed: mine.filter((t) => inRange(t.completed_at, from, to)).length,
        published: data.content.filter((c) => c.owner_id === u.id && inRange(c.published_at, from, to)).length,
        signed: data.leads.filter((l) => l.owner_id === u.id && inRange(l.won_at, from, to)).length,
        notes: data.leadNotes.filter((n) => n.author_id === u.id && inRange(n.created_at, from, to)).length,
      };
    });
  }

  const api = {
    isoDay, addDays, addMonths, lastDay, monthsBack, daysBetween,
    contractState, arrOn, schoolsOn, learnersOn, renewalSummary,
    GOAL_METRICS, goalProgress, budgetVsActual, forecast, statsMatrix, teamMatrix,
  };
  if (typeof window !== "undefined") window.WSMetrics = api;
  globalThis.WSMetrics = api;
})();
