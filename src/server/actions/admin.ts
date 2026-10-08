"use server";

import { AnnouncementLevel, EmploymentType } from "@prisma/client";
import { z } from "zod";
import { ROLE_KEYS } from "@/lib/rbac";
import { zCheckbox, zEmail, zEnum, zId, zOptionalDateTime, zOptionalId, zOptionalText, zText } from "@/lib/validation";
import { argAction, formAction, type ActionState } from "@/server/action";
import {
  createAnnouncement,
  createUser,
  deleteAnnouncement,
  expireAnnouncement,
  resetUserPassword,
  revokeUserSessions,
  setUserStatus,
  unlockUser,
  updateAnnouncement,
  updateUser,
} from "@/server/services/admin";

/**
 * Result of an action that issues a temporary password. The password travels
 * back to the administrator in this one response only: it is never stored in
 * plain text, logged or written to the audit trail.
 */
export type IssuedPasswordState =
  | (NonNullable<ActionState> & { issued?: { name: string; email: string; password: string } })
  | null;

// ─────────────────────────── Users ───────────────────────────

const userSchema = z.object({
  name: zText(120, "Name"),
  email: zEmail,
  roleKey: z.enum(ROLE_KEYS, { error: "Select a role." }),
  departmentId: zOptionalId,
  jobTitle: zOptionalText(120),
  managerId: zOptionalId,
  employmentType: zEnum(EmploymentType, "an employment type"),
});

export async function createUserAction(prev: IssuedPasswordState, formData: FormData): Promise<IssuedPasswordState> {
  let issued: { name: string; email: string; password: string } | undefined;
  const run = formAction(userSchema, async (user, input) => {
    const result = await createUser(user, input);
    issued = { name: result.user.name, email: result.user.email, password: result.temporaryPassword };
    return { message: `Account created for ${result.user.name}`, id: result.user.id };
  });
  const state = await run(prev, formData);
  return state?.ok && issued ? { ...state, issued } : state;
}

export const updateUserAction = formAction(userSchema.extend({ id: zId }), async (user, { id, ...input }) => {
  const target = await updateUser(user, id, input);
  return `${target.name}'s account updated`;
});

export const setUserStatusAction = argAction(
  z.object({ id: zId, status: z.enum(["ACTIVE", "SUSPENDED", "OFFBOARDED"]) }),
  async (user, { id, status }) => {
    const { target, sessionsRevoked } = await setUserStatus(user, id, status);
    if (status === "ACTIVE") return `${target.name} can sign in again`;
    const signedOut = sessionsRevoked ? ` and signed out of ${sessionsRevoked} session${sessionsRevoked === 1 ? "" : "s"}` : "";
    return `${target.name} ${status === "SUSPENDED" ? "suspended" : "offboarded"}${signedOut}`;
  },
);

export async function resetUserPasswordAction(input: { id: string }): Promise<IssuedPasswordState> {
  let issued: { name: string; email: string; password: string } | undefined;
  const run = argAction(z.object({ id: zId }), async (user, { id }) => {
    const result = await resetUserPassword(user, id);
    issued = { name: result.user.name, email: result.user.email, password: result.temporaryPassword };
    return `Temporary password issued to ${result.user.name}`;
  });
  const state = await run(input);
  return state?.ok && issued ? { ...state, issued } : state;
}

export const unlockUserAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  const target = await unlockUser(user, id);
  return `${target.name} can sign in again`;
});

export const revokeUserSessionsAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  const { target, count } = await revokeUserSessions(user, id);
  return `${target.name} signed out of ${count} session${count === 1 ? "" : "s"}`;
});

// ─────────────────────────── Announcements ───────────────────────────

const announcementSchema = z.object({
  title: zText(160, "Title"),
  body: zText(4000, "Message"),
  level: zEnum(AnnouncementLevel, "a level"),
  publishedAt: zOptionalDateTime,
  expiresAt: zOptionalDateTime,
});

export const createAnnouncementAction = formAction(announcementSchema.extend({ notifyEveryone: zCheckbox }), async (user, input) => {
  const { announcement, notified } = await createAnnouncement(user, input);
  const scheduled = announcement.publishedAt > new Date();
  return {
    message: scheduled ? "Announcement scheduled" : notified ? `Announcement published and ${notified} people notified` : "Announcement published",
    id: announcement.id,
  };
});

export const updateAnnouncementAction = formAction(announcementSchema.extend({ id: zId }), async (user, { id, ...input }) => {
  await updateAnnouncement(user, id, input);
  return "Announcement updated";
});

export const expireAnnouncementAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await expireAnnouncement(user, id);
  return "Announcement taken down";
});

export const deleteAnnouncementAction = argAction(z.object({ id: zId }), async (user, { id }) => {
  await deleteAnnouncement(user, id);
  return "Announcement deleted";
});
