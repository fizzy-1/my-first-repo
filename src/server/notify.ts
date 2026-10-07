import type { NotificationType } from "@prisma/client";
import { db, type DbClient } from "@/server/db";

export interface NotifyInput {
  userIds: (string | null | undefined)[];
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Idempotency key: the same (user, key) pair is only ever notified once. */
  dedupeKey?: string;
  /** Typically the acting user — people are not notified about their own actions. */
  excludeUserId?: string;
}

export async function notify(input: NotifyInput, client: DbClient = db): Promise<number> {
  const recipients = [...new Set(input.userIds.filter((id): id is string => Boolean(id) && id !== input.excludeUserId))];
  if (recipients.length === 0) return 0;
  const result = await client.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: input.type,
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 1000) ?? null,
      link: input.link ?? null,
      dedupeKey: input.dedupeKey ?? null,
    })),
    skipDuplicates: true,
  });
  return result.count;
}
