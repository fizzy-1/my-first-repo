"use server";

import { ApprovalType, Priority } from "@prisma/client";
import { z } from "zod";
import { argAction, formAction } from "@/server/action";
import { zEnum, zId, zOptionalDate, zOptionalId, zOptionalMoney, zOptionalText, zText } from "@/lib/validation";
import { createApproval, decideApproval, resubmitApproval, withdrawApproval } from "@/server/services/approvals";

export const createApprovalAction = formAction(
  z.object({
    type: zEnum(ApprovalType, "a request type"),
    title: zText(160, "Title"),
    description: zText(5000, "Description"),
    amount: zOptionalMoney,
    priority: zEnum(Priority, "a priority"),
    dueDate: zOptionalDate,
    approverId: zOptionalId,
    expenseId: zOptionalId,
    campaignId: zOptionalId,
    featureId: zOptionalId,
  }),
  async (user, input) => {
    const approval = await createApproval(user, input);
    return { message: `Submitted for approval (#${approval.number})`, id: approval.id };
  },
);

export const decideApprovalAction = formAction(
  z.object({
    id: zId,
    decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"], { error: "Choose a decision." }),
    comment: zOptionalText(2000),
  }),
  async (user, input) => {
    await decideApproval(user, input);
    return { APPROVED: "Request approved", REJECTED: "Request rejected", CHANGES_REQUESTED: "Changes requested" }[input.decision];
  },
);

export const resubmitApprovalAction = formAction(
  z.object({ id: zId, comment: zOptionalText(2000), description: zOptionalText(5000), amount: zOptionalMoney }),
  async (user, input) => {
    await resubmitApproval(user, input);
    return "Request resubmitted";
  },
);

export const withdrawApprovalAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await withdrawApproval(user, id);
  return "Request withdrawn";
});
