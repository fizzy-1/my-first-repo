"use server";

import { z } from "zod";
import { argAction } from "@/server/action";
import { zId } from "@/lib/validation";
import { markNotificationsRead } from "@/server/services/notifications";

export const markNotificationReadAction = argAction(z.object({ ids: z.array(zId).max(100) }), async (user, { ids }) => {
  await markNotificationsRead(user, ids);
});

export const markAllNotificationsReadAction = argAction(z.object({}), async (user) => {
  const count = await markNotificationsRead(user, "all");
  return count ? `Marked ${count} notification${count === 1 ? "" : "s"} as read` : "You're all caught up";
});
