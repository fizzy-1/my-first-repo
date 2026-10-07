/**
 * Driver-based financial projection model (pure — shared by the server and the
 * interactive scenario planner in the browser).
 *
 *   learnersₜ = learnersₜ₋₁ × (1 − churn) + newₜ        newₜ = new₀ × (1 + g)ᵗ
 *   subscription revenueₜ = learnersₜ × average price
 *   school revenueₜ = school₀ × (1 + gₛ)ᵗ                salariesₜ = salaries₀ × (1 + gₛₐₗ)ᵗ
 *   net profitₜ = revenueₜ − (salaries + marketing + technology + other)
 *   cashₜ = cashₜ₋₁ + net profitₜ
 */
export interface ProjectionInputs {
  horizonMonths: number;
  startingLearners: number;
  monthlyNewLearners: number;
  /** Monthly growth of new-learner intake, as a fraction (0.02 = 2%). */
  newLearnerGrowthRate: number;
  /** Monthly churn of paying learners, as a fraction. */
  monthlyChurnRate: number;
  avgSubscriptionPrice: number;
  schoolRevenueMonthly: number;
  schoolRevenueGrowthRate: number;
  salariesMonthly: number;
  salaryGrowthRate: number;
  marketingMonthly: number;
  technologyMonthly: number;
  otherExpensesMonthly: number;
  startingCash: number;
}

export interface ProjectionMonth {
  index: number;
  learners: number;
  newLearners: number;
  churnedLearners: number;
  subscriptionRevenue: number;
  schoolRevenue: number;
  revenue: number;
  salaries: number;
  marketing: number;
  technology: number;
  other: number;
  expenses: number;
  netProfit: number;
  cash: number;
}

export interface ProjectionSummary {
  totalRevenue: number;
  totalExpenses: number;
  totalNetProfit: number;
  endingLearners: number;
  endingMonthlyRevenue: number;
  endingCash: number;
  lowestCash: number;
  /** First month (1-based) with a non-negative monthly net profit, or null. */
  breakEvenMonth: number | null;
  /** First month (1-based) where cash goes below zero, or null. */
  cashOutMonth: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function runProjection(input: ProjectionInputs): { months: ProjectionMonth[]; summary: ProjectionSummary } {
  const months: ProjectionMonth[] = [];
  const horizon = Math.max(1, Math.min(60, Math.floor(input.horizonMonths)));
  const churn = Math.min(1, Math.max(0, input.monthlyChurnRate));
  let learners = Math.max(0, input.startingLearners);
  let cash = input.startingCash;
  let breakEvenMonth: number | null = null;
  let cashOutMonth: number | null = null;
  let lowestCash = cash;

  for (let t = 0; t < horizon; t++) {
    const newLearners = Math.max(0, input.monthlyNewLearners * Math.pow(1 + input.newLearnerGrowthRate, t));
    const churnedLearners = learners * churn;
    learners = learners - churnedLearners + newLearners;

    const subscriptionRevenue = learners * input.avgSubscriptionPrice;
    const schoolRevenue = input.schoolRevenueMonthly * Math.pow(1 + input.schoolRevenueGrowthRate, t);
    const revenue = subscriptionRevenue + schoolRevenue;
    const salaries = input.salariesMonthly * Math.pow(1 + input.salaryGrowthRate, t);
    const expenses = salaries + input.marketingMonthly + input.technologyMonthly + input.otherExpensesMonthly;
    const netProfit = revenue - expenses;
    cash += netProfit;
    lowestCash = Math.min(lowestCash, cash);
    if (breakEvenMonth === null && netProfit >= 0) breakEvenMonth = t + 1;
    if (cashOutMonth === null && cash < 0) cashOutMonth = t + 1;

    months.push({
      index: t,
      learners: Math.round(learners),
      newLearners: Math.round(newLearners),
      churnedLearners: Math.round(churnedLearners),
      subscriptionRevenue: round2(subscriptionRevenue),
      schoolRevenue: round2(schoolRevenue),
      revenue: round2(revenue),
      salaries: round2(salaries),
      marketing: round2(input.marketingMonthly),
      technology: round2(input.technologyMonthly),
      other: round2(input.otherExpensesMonthly),
      expenses: round2(expenses),
      netProfit: round2(netProfit),
      cash: round2(cash),
    });
  }

  const sum = (key: keyof ProjectionMonth) => round2(months.reduce((s, m) => s + m[key], 0));
  const last = months[months.length - 1];
  return {
    months,
    summary: {
      totalRevenue: sum("revenue"),
      totalExpenses: sum("expenses"),
      totalNetProfit: sum("netProfit"),
      endingLearners: last.learners,
      endingMonthlyRevenue: last.revenue,
      endingCash: last.cash,
      lowestCash: round2(lowestCash),
      breakEvenMonth,
      cashOutMonth,
    },
  };
}
