"use server";

import { z } from "zod";
import { argAction } from "@/server/action";
import { saveDashboardPreferences } from "@/server/services/dashboard";

export const saveDashboardPreferencesAction = argAction(
  z.object({ order: z.array(z.string().max(32)).max(20), hidden: z.array(z.string().max(32)).max(20) }),
  async (user, input) => {
    await saveDashboardPreferences(user, input);
  },
);
