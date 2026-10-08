import "server-only";
import { Prisma } from "@prisma/client";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { formDataToObject } from "@/lib/validation";
import { requireUser, type SessionUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors";

/**
 * Result returned by every Server Action to the client. Never contains internal
 * error details — unexpected failures are logged server-side and reported as a
 * generic message.
 */
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Optional id of a created record (e.g. to navigate to it). */
  id?: string;
  /** Echo of submitted values so forms can re-populate after a validation error. */
  values?: Record<string, string>;
} | null;

type HandlerResult = void | string | { message?: string; id?: string };

interface ActionOptions {
  /** Allow while the user still has a temporary password (changing it, managing sessions). */
  allowDuringPasswordChange?: boolean;
}

const PASSWORD_CHANGE_REQUIRED: ActionState = { ok: false, message: "Set a new password on your profile before continuing." };

function toState(result: HandlerResult): ActionState {
  if (typeof result === "string") return { ok: true, message: result };
  return { ok: true, message: result?.message, id: result?.id };
}

function handleError(error: unknown): ActionState {
  unstable_rethrow(error);
  if (isAppError(error)) return { ok: false, message: error.message, fieldErrors: error.fieldErrors };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return { ok: false, message: "A record with these details already exists." };
    if (error.code === "P2025") return { ok: false, message: "The record no longer exists. Refresh and try again." };
    if (error.code === "P2003") return { ok: false, message: "A related record is missing or still in use." };
  }
  console.error("[action] unexpected error", error);
  return { ok: false, message: "Something went wrong. Please try again." };
}

function echoValues(raw: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && !/password/i.test(key)) values[key] = value;
  }
  return values;
}

/**
 * Wraps a FormData Server Action: authenticates, validates with Zod, maps
 * domain errors to messages and refreshes the client router on success.
 * Authorisation itself lives in the service the handler calls.
 */
export function formAction<S extends z.ZodType>(
  schema: S,
  handler: (user: SessionUser, input: z.output<S>, formData: FormData) => Promise<HandlerResult>,
  options: ActionOptions = {},
) {
  return async (_prev: ActionState, formData: FormData): Promise<ActionState> => {
    const user = await requireUser();
    if (user.mustChangePassword && !options.allowDuringPasswordChange) return PASSWORD_CHANGE_REQUIRED;
    const raw = formDataToObject(formData);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const { fieldErrors, formErrors } = z.flattenError(parsed.error);
      return {
        ok: false,
        message: formErrors[0] ?? "Please correct the highlighted fields.",
        fieldErrors: fieldErrors as Record<string, string[]>,
        values: echoValues(raw),
      };
    }
    try {
      const result = await handler(user, parsed.data, formData);
      refresh();
      return toState(result);
    } catch (error) {
      const state = handleError(error);
      return state ? { ...state, values: echoValues(raw) } : state;
    }
  };
}

/** Wraps a Server Action invoked with a plain argument (buttons, menus, drag & drop). */
export function argAction<S extends z.ZodType>(
  schema: S,
  handler: (user: SessionUser, input: z.output<S>) => Promise<HandlerResult>,
  options: ActionOptions = {},
) {
  return async (input: z.input<S>): Promise<ActionState> => {
    const user = await requireUser();
    if (user.mustChangePassword && !options.allowDuringPasswordChange) return PASSWORD_CHANGE_REQUIRED;
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const { fieldErrors, formErrors } = z.flattenError(parsed.error);
      return { ok: false, message: formErrors[0] ?? "Invalid request.", fieldErrors: fieldErrors as Record<string, string[]> };
    }
    try {
      const result = await handler(user, parsed.data);
      refresh();
      return toState(result);
    } catch (error) {
      return handleError(error);
    }
  };
}
