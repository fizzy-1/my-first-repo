"use server";

import { EmploymentType } from "@prisma/client";
import { z } from "zod";
import { formAction } from "@/server/action";
import { zEnum, zId, zOptionalDate, zOptionalId, zOptionalMoney, zOptionalText } from "@/lib/validation";
import { updateTeamMember } from "@/server/services/team";

export const updateTeamMemberAction = formAction(
  z.object({
    id: zId,
    jobTitle: zOptionalText(120),
    departmentId: zOptionalId,
    managerId: zOptionalId,
    employmentType: zEnum(EmploymentType, "an employment type"),
    startDate: zOptionalDate,
    phone: zOptionalText(40),
    monthlyCost: zOptionalMoney,
  }),
  async (user, { id, ...input }) => {
    await updateTeamMember(user, id, input);
    return "Team member updated";
  },
);
