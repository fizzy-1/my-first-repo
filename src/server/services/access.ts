import "server-only";
import type { Prisma } from "@prisma/client";
import { can, type SessionUser } from "@/server/auth/current-user";

/**
 * Row-level visibility rules shared across services. Kept free of service
 * imports so any module can use them without creating import cycles.
 */

/** Meetings: everything with meetings.read.all, otherwise those organised or attended. */
export function meetingsVisibleWhere(user: SessionUser): Prisma.MeetingWhereInput {
  if (can(user, "meetings.read.all")) return {};
  return { OR: [{ organizerId: user.id }, { attendees: { some: { userId: user.id } } }] };
}

/** Bugs: all with technology.read, otherwise those reported by or assigned to the user. */
export function bugsVisibleWhere(user: SessionUser): Prisma.BugWhereInput {
  if (can(user, "technology.read")) return {};
  return { OR: [{ assigneeId: user.id }, { reporterId: user.id }] };
}
