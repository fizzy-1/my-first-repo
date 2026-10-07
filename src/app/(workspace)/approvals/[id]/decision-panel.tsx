"use client";

import * as React from "react";
import { CheckIcon, Loader2Icon, RotateCcwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { decideApprovalAction, resubmitApprovalAction } from "@/server/actions/approvals";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export function DecisionPanel({ approvalId }: { approvalId: string }) {
  const [state, formAction, pending] = React.useActionState(decideApprovalAction, null);
  const [choice, setChoice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(state.message ?? "Decision recorded");
    else toast.error(state.message ?? "Could not record the decision");
  }, [state]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={approvalId} />
      <div className="space-y-1.5">
        <Label htmlFor="decision-comment">Comment</Label>
        <Textarea
          id="decision-comment"
          name="comment"
          rows={3}
          placeholder="Required when rejecting or requesting changes."
          aria-invalid={Boolean(state?.fieldErrors?.comment) || undefined}
        />
        {state?.fieldErrors?.comment && <p className="text-xs text-danger">{state.fieldErrors.comment[0]}</p>}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Button type="submit" name="decision" value="APPROVED" disabled={pending} onClick={() => setChoice("APPROVED")} className="bg-success text-white hover:bg-success/90 dark:text-[#0d2416]">
          {pending && choice === "APPROVED" ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Approve
        </Button>
        <Button type="submit" name="decision" value="CHANGES_REQUESTED" variant="outline" disabled={pending} onClick={() => setChoice("CHANGES_REQUESTED")}>
          {pending && choice === "CHANGES_REQUESTED" ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />} Request changes
        </Button>
        <Button type="submit" name="decision" value="REJECTED" variant="destructive" disabled={pending} onClick={() => setChoice("REJECTED")}>
          {pending && choice === "REJECTED" ? <Loader2Icon className="animate-spin" /> : <XIcon />} Reject
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Your name, the time, the decision and your comment are recorded permanently.</p>
    </form>
  );
}

export function ResubmitPanel({ approvalId, description, amount }: { approvalId: string; description: string; amount: number | null }) {
  const [state, formAction, pending] = React.useActionState(resubmitApprovalAction, null);
  React.useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(state.message ?? "Resubmitted");
    else toast.error(state.message ?? "Could not resubmit");
  }, [state]);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={approvalId} />
      <div className="space-y-1.5">
        <Label htmlFor="resubmit-description">Updated business case</Label>
        <Textarea id="resubmit-description" name="description" rows={5} defaultValue={description} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="resubmit-amount">Amount (ZAR)</Label>
        <Input id="resubmit-amount" name="amount" inputMode="decimal" defaultValue={amount ?? ""} className="tabular" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="resubmit-comment">What changed?</Label>
        <Textarea id="resubmit-comment" name="comment" rows={2} placeholder="Summarise how you addressed the feedback." />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2Icon className="animate-spin" />} Resubmit for approval
      </Button>
    </form>
  );
}
