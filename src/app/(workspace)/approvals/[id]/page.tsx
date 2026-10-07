import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckIcon, CornerUpLeftIcon, RotateCcwIcon, SendIcon, Undo2Icon, XIcon } from "lucide-react";
import type { ApprovalDecisionType } from "@prisma/client";
import { withdrawApprovalAction } from "@/server/actions/approvals";
import { requireUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors";
import { getApproval } from "@/server/services/approvals";
import { DueDate } from "@/components/common/due-date";
import { PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { StatusBadge } from "@/components/common/status-badge";
import { UserChip } from "@/components/common/user-chip";
import { ConfirmActionButton } from "@/components/forms/action-button";
import { Avatar } from "@/components/ui/avatar";
import { APPROVAL_DECISION, APPROVAL_STATUS, APPROVAL_TYPE, EXPENSE_STATUS, PRIORITY } from "@/lib/labels";
import { formatDateTime, formatZAR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DecisionPanel, ResubmitPanel } from "./decision-panel";

export const metadata: Metadata = { title: "Approval" };

const DECISION_ICON: Record<ApprovalDecisionType, React.ComponentType<{ className?: string }>> = {
  SUBMITTED: SendIcon,
  APPROVED: CheckIcon,
  REJECTED: XIcon,
  CHANGES_REQUESTED: RotateCcwIcon,
  RESUBMITTED: CornerUpLeftIcon,
  WITHDRAWN: Undo2Icon,
};

const DECISION_RING: Record<ApprovalDecisionType, string> = {
  SUBMITTED: "bg-muted text-muted-foreground",
  APPROVED: "bg-success-soft text-success",
  REJECTED: "bg-danger-soft text-danger",
  CHANGES_REQUESTED: "bg-info-soft text-info",
  RESUBMITTED: "bg-muted text-muted-foreground",
  WITHDRAWN: "bg-muted text-muted-foreground",
};

export default async function ApprovalDetailPage(props: PageProps<"/approvals/[id]">) {
  const { id } = await props.params;
  const user = await requireUser();
  let approval: Awaited<ReturnType<typeof getApproval>>;
  try {
    approval = await getApproval(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const linked = [
    approval.expense && {
      label: "Expense",
      href: `/finance/expenses?q=${approval.expense.number}`,
      text: `#${approval.expense.number} · ${approval.expense.supplier} · ${formatZAR(approval.expense.amount)}`,
      badge: <StatusBadge meta={EXPENSE_STATUS} value={approval.expense.status} />,
    },
    approval.campaign && { label: "Campaign", href: `/marketing/${approval.campaign.id}`, text: approval.campaign.name, badge: null },
    approval.feature && { label: "Product release", href: "/technology", text: approval.feature.title, badge: null },
    approval.document && { label: "Document", href: `/documents/${approval.document.id}`, text: approval.document.title, badge: null },
  ].filter(Boolean) as { label: string; href: string; text: string; badge: React.ReactNode }[];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Approvals", href: "/approvals" }, { label: `#${approval.number}` }]}
        title={approval.title}
        meta={
          <>
            <StatusBadge meta={APPROVAL_STATUS} value={approval.status} />
            <StatusBadge meta={APPROVAL_TYPE} value={approval.type} dot={false} />
            <StatusBadge meta={PRIORITY} value={approval.priority} dot={false} />
          </>
        }
        actions={
          approval.isRequester &&
          ["PENDING", "CHANGES_REQUESTED"].includes(approval.status) && (
            <ConfirmActionButton
              variant="outline"
              action={withdrawApprovalAction}
              input={{ id: approval.id }}
              title="Withdraw this request?"
              description="Approvers will no longer be able to act on it. The withdrawal is recorded."
              confirmLabel="Withdraw"
            >
              <Undo2Icon /> Withdraw
            </ConfirmActionButton>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <SectionCard title="Business case">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{approval.description}</p>
            {linked.length > 0 && (
              <div className="mt-5 space-y-2 border-t border-border pt-4">
                {linked.map((l) => (
                  <div key={l.label} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-28 text-muted-foreground">{l.label}</span>
                    <Link href={l.href} className="font-medium hover:underline">
                      {l.text}
                    </Link>
                    {l.badge}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Decision history" description="Every step is recorded with the decision maker, time and comment.">
            <ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border">
              {approval.decisions.map((d) => {
                const Icon = DECISION_ICON[d.decision];
                return (
                  <li key={d.id} className="relative flex gap-3">
                    <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card", DECISION_RING[d.decision])}>
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1 pt-1">
                      <p className="text-sm">
                        <span className="font-medium">{d.decider.name}</span>{" "}
                        <span className="text-muted-foreground">{APPROVAL_DECISION[d.decision].label.toLowerCase()}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(d.createdAt)}
                        {d.decider.jobTitle && ` · ${d.decider.jobTitle}`}
                      </p>
                      {d.comment && <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{d.comment}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </SectionCard>
        </div>

        <div className="space-y-6">
          {approval.canDecide && (
            <SectionCard title="Your decision" className="border-primary/40">
              <DecisionPanel approvalId={approval.id} />
            </SectionCard>
          )}
          {approval.isRequester && approval.status === "CHANGES_REQUESTED" && (
            <SectionCard title="Changes requested" description="Update the request and resubmit it.">
              <ResubmitPanel approvalId={approval.id} description={approval.description} amount={approval.amount} />
            </SectionCard>
          )}
          {approval.isRequester && approval.status === "PENDING" && (
            <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              You submitted this request, so you can&apos;t decide on it. Approvers have been notified.
            </div>
          )}
          <SectionCard title="Summary">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="tabular text-base font-semibold">{approval.amount !== null ? formatZAR(approval.amount, { cents: true }) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Requested by</dt>
                <dd>
                  <UserChip name={approval.requester.name} subtitle={approval.requester.jobTitle} />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Named approver</dt>
                <dd>{approval.approver ? <UserChip name={approval.approver.name} /> : <span className="text-muted-foreground">Any authorised approver</span>}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Needed by</dt>
                <dd>
                  <DueDate date={approval.dueDate} done={approval.status !== "PENDING"} />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Submitted</dt>
                <dd className="text-right">{formatDateTime(approval.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Decided</dt>
                <dd className="text-right">{approval.decidedAt ? formatDateTime(approval.decidedAt) : "—"}</dd>
              </div>
            </dl>
          </SectionCard>
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Avatar name={user.name} size="xs" /> Viewing as {user.name} ({user.roleName})
          </div>
        </div>
      </div>
    </>
  );
}
