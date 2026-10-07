import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runProjection, type ProjectionInputs } from "./projections";

const base: ProjectionInputs = {
  horizonMonths: 12,
  startingLearners: 1000,
  monthlyNewLearners: 100,
  newLearnerGrowthRate: 0,
  monthlyChurnRate: 0.05,
  avgSubscriptionPrice: 150,
  schoolRevenueMonthly: 50_000,
  schoolRevenueGrowthRate: 0,
  salariesMonthly: 300_000,
  salaryGrowthRate: 0,
  marketingMonthly: 20_000,
  technologyMonthly: 20_000,
  otherExpensesMonthly: 10_000,
  startingCash: 1_000_000,
};

describe("runProjection", () => {
  it("applies churn before adding new learners each month", () => {
    const { months } = runProjection(base);
    // 1000 × 0.95 + 100 = 1050
    assert.equal(months[0].learners, 1050);
    assert.equal(months[0].churnedLearners, 50);
    assert.equal(months[0].subscriptionRevenue, 1050 * 150);
  });

  it("converges towards the steady state new / churn", () => {
    const { months } = runProjection({ ...base, horizonMonths: 60 });
    // Steady state = 100 / 0.05 = 2000 learners.
    assert.ok(Math.abs(months[59].learners - 2000) < 60);
  });

  it("accumulates cash from monthly net profit", () => {
    const { months, summary } = runProjection(base);
    const expected = base.startingCash + months.reduce((s, m) => s + m.netProfit, 0);
    assert.ok(Math.abs(summary.endingCash - expected) < 0.05);
    assert.equal(summary.totalExpenses, 12 * 350_000);
  });

  it("detects break-even and cash-out months", () => {
    const profitable = runProjection({ ...base, avgSubscriptionPrice: 400 });
    assert.equal(profitable.summary.breakEvenMonth, 1);
    assert.equal(profitable.summary.cashOutMonth, null);

    const burning = runProjection({ ...base, startingCash: 100_000, avgSubscriptionPrice: 50 });
    assert.equal(burning.summary.breakEvenMonth, null);
    assert.equal(burning.summary.cashOutMonth, 1);
  });

  it("grows intake, school revenue and salaries geometrically", () => {
    const { months } = runProjection({ ...base, newLearnerGrowthRate: 0.1, schoolRevenueGrowthRate: 0.1, salaryGrowthRate: 0.1 });
    assert.equal(months[2].newLearners, 121);
    assert.equal(months[2].schoolRevenue, 60_500);
    assert.equal(months[2].salaries, 363_000);
  });

  it("clamps the horizon to 1–60 months", () => {
    assert.equal(runProjection({ ...base, horizonMonths: 0 }).months.length, 1);
    assert.equal(runProjection({ ...base, horizonMonths: 500 }).months.length, 60);
  });
});
