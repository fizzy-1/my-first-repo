-- Database-level integrity constraints (not expressible in the Prisma schema).
-- Prisma's migration diff does not manage CHECK constraints, so these persist.

ALTER TABLE "Income"              ADD CONSTRAINT "Income_amount_positive"            CHECK ("amount" > 0);
ALTER TABLE "Expense"             ADD CONSTRAINT "Expense_amount_positive"           CHECK ("amount" > 0);
ALTER TABLE "Payment"             ADD CONSTRAINT "Payment_amount_nonnegative"        CHECK ("amount" >= 0);
ALTER TABLE "Subscription"        ADD CONSTRAINT "Subscription_mrr_nonnegative"      CHECK ("mrr" >= 0);
ALTER TABLE "Subscription"        ADD CONSTRAINT "Subscription_cancel_after_start"   CHECK ("cancelledAt" IS NULL OR "cancelledAt" >= "startedAt");
ALTER TABLE "SubscriptionPlan"    ADD CONSTRAINT "SubscriptionPlan_price_nonnegative" CHECK ("price" >= 0 AND "monthlyEquivalent" >= 0);
ALTER TABLE "Approval"            ADD CONSTRAINT "Approval_amount_nonnegative"       CHECK ("amount" IS NULL OR "amount" >= 0);
ALTER TABLE "BudgetLine"          ADD CONSTRAINT "BudgetLine_amount_nonnegative"     CHECK ("amount" >= 0);
ALTER TABLE "Budget"              ADD CONSTRAINT "Budget_fiscal_year_range"          CHECK ("fiscalYear" BETWEEN 2000 AND 2100);
ALTER TABLE "Campaign"            ADD CONSTRAINT "Campaign_budget_nonnegative"       CHECK ("budget" >= 0);
ALTER TABLE "Campaign"            ADD CONSTRAINT "Campaign_dates_ordered"            CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "CampaignMetric"      ADD CONSTRAINT "CampaignMetric_nonnegative"        CHECK ("spend" >= 0 AND "impressions" >= 0 AND "clicks" >= 0 AND "leads" >= 0 AND "conversions" >= 0 AND "revenue" >= 0);
ALTER TABLE "School"              ADD CONSTRAINT "School_probability_range"          CHECK ("probability" BETWEEN 0 AND 100);
ALTER TABLE "School"              ADD CONSTRAINT "School_counts_nonnegative"         CHECK ("learnerCount" >= 0 AND "potentialLearners" >= 0 AND "expectedAnnualValue" >= 0);
ALTER TABLE "Partnership"         ADD CONSTRAINT "Partnership_value_nonnegative"     CHECK ("annualValue" >= 0 AND "learnersCovered" >= 0);
ALTER TABLE "Partnership"         ADD CONSTRAINT "Partnership_dates_ordered"         CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "Learner"             ADD CONSTRAINT "Learner_grade_range"               CHECK ("grade" BETWEEN 1 AND 12);
ALTER TABLE "Course"              ADD CONSTRAINT "Course_grade_range"                CHECK ("grade" BETWEEN 1 AND 12);
ALTER TABLE "Topic"               ADD CONSTRAINT "Topic_caps_term_range"             CHECK ("capsTerm" IS NULL OR "capsTerm" BETWEEN 1 AND 4);
ALTER TABLE "TutorTimeEntry"      ADD CONSTRAINT "TutorTimeEntry_hours_range"        CHECK ("hours" > 0 AND "hours" <= 24);
ALTER TABLE "TutorProfile"        ADD CONSTRAINT "TutorProfile_capacity_range"       CHECK ("weeklyCapacityHours" BETWEEN 0 AND 80);
ALTER TABLE "Meeting"             ADD CONSTRAINT "Meeting_end_after_start"           CHECK ("endsAt" > "startsAt");
ALTER TABLE "Objective"           ADD CONSTRAINT "Objective_quarter_range"           CHECK ("quarter" IS NULL OR "quarter" BETWEEN 1 AND 4);
ALTER TABLE "DocumentVersion"     ADD CONSTRAINT "DocumentVersion_size_nonnegative"  CHECK ("sizeBytes" >= 0 AND "version" >= 1);
ALTER TABLE "FinancialProjection" ADD CONSTRAINT "FinancialProjection_horizon_range" CHECK ("horizonMonths" BETWEEN 1 AND 60);
ALTER TABLE "FinancialProjection" ADD CONSTRAINT "FinancialProjection_rates_range"   CHECK ("monthlyChurnRate" BETWEEN 0 AND 1);
ALTER TABLE "EngagementSnapshot"  ADD CONSTRAINT "EngagementSnapshot_nonnegative"    CHECK ("activeLearners" >= 0 AND "lessonsCompleted" >= 0 AND "videoMinutes" >= 0 AND "quizAttempts" >= 0);

-- Audit entries are immutable: block UPDATE at the database level.
-- (DELETE stays possible for retention policies and demo-data cleanup only.)
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_no_update"
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
