import { z } from "zod";
import { endOfSastDay, parseDateInput, parseDateTimeInput } from "./dates";

/**
 * Zod building blocks for FormData-driven Server Actions. HTML forms submit
 * every value as a string ("" for empty), so these helpers normalise blanks to
 * undefined and coerce numbers, money and dates with friendly error messages.
 */

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : typeof value === "string" ? value.trim() : value;

export const zText = (max = 200, label = "This field") =>
  z.preprocess(
    blankToUndefined,
    z.string({ error: `${label} is required.` }).max(max, `${label} must be at most ${max} characters.`),
  );

export const zOptionalText = (max = 5000) =>
  z.preprocess(blankToUndefined, z.string().max(max, `Must be at most ${max} characters.`).optional());

export const zEmail = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.email({ error: "Enter a valid email address." }).max(254),
);

export const zOptionalEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim().toLowerCase() : v),
  z.email({ error: "Enter a valid email address." }).max(254).optional(),
);

/** Opaque record id (cuid or demo id). */
export const zId = z
  .string({ error: "Select an option." })
  .min(1, "Select an option.")
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid identifier.");

export const zOptionalId = z.preprocess(blankToUndefined, zId.optional());

export const zIdList = z.preprocess(
  (v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v.filter((x) => x !== "") : [v]),
  z.array(zId).max(200),
);

const parseMoney = (v: unknown) => {
  if (typeof v !== "string") return v;
  const cleaned = v.replace(/[R\s,]/gi, "");
  return cleaned === "" ? undefined : Number(cleaned);
};

export const zMoney = z.preprocess(
  parseMoney,
  z
    .number({ error: "Enter an amount." })
    .finite("Enter a valid amount.")
    .min(0, "Amount cannot be negative.")
    .max(100_000_000_000, "Amount is too large.")
    .transform((n) => Math.round(n * 100) / 100),
);

export const zPositiveMoney = zMoney.refine((n) => n > 0, "Amount must be greater than zero.");

export const zOptionalMoney = z.preprocess(parseMoney, z.number().finite().min(0).max(100_000_000_000).optional());

export const zInt = (min = 0, max = 1_000_000_000) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v)) : v),
    z
      .number({ error: "Enter a number." })
      .int("Enter a whole number.")
      .min(min, `Must be at least ${min}.`)
      .max(max, `Must be at most ${max}.`),
  );

export const zOptionalInt = (min = 0, max = 1_000_000_000) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v)) : v),
    z.number().int().min(min).max(max).optional(),
  );

export const zDecimal = (min = 0, max = 1_000_000) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v)) : v),
    z.number({ error: "Enter a number." }).finite().min(min, `Must be at least ${min}.`).max(max, `Must be at most ${max}.`),
  );

/** Percentage typed as e.g. "5" or "5.5", stored as a fraction (0.055). */
export const zPercentAsFraction = (max = 100) =>
  zDecimal(0, max).transform((n) => Math.round((n / 100) * 10_000) / 10_000);

export const zDate = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : (parseDateInput(v.trim()) ?? "invalid")) : v),
  z.date({ error: "Enter a valid date." }),
);

export const zOptionalDate = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : (parseDateInput(v.trim()) ?? "invalid")) : v),
  z.date({ error: "Enter a valid date." }).optional(),
);

/** A "due by" date typed as YYYY-MM-DD, stored as the end of that SAST day (for timestamp columns). */
export const zOptionalDueDate = z.preprocess(
  (v) => {
    if (typeof v !== "string" || v.trim() === "") return undefined;
    const date = parseDateInput(v.trim());
    return date ? endOfSastDay(date) : "invalid";
  },
  z.date({ error: "Enter a valid date." }).optional(),
);

export const zDateTime = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : (parseDateTimeInput(v.trim()) ?? "invalid")) : v),
  z.date({ error: "Enter a valid date and time." }),
);

export const zOptionalDateTime = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : (parseDateTimeInput(v.trim()) ?? "invalid")) : v),
  z.date({ error: "Enter a valid date and time." }).optional(),
);

export const zCheckbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const zUrl = z.preprocess(
  blankToUndefined,
  z
    .url({ protocol: /^https?$/, error: "Enter a valid http(s) URL." })
    .max(500)
    .optional(),
);

/** Builds a `z.enum` from a Prisma enum object with a friendly message. */
export function zEnum<T extends Record<string, string>>(values: T, label = "an option") {
  return z.enum(values as unknown as { [K in keyof T]: T[K] }, { error: `Select ${label}.` });
}

export function zOptionalEnum<T extends Record<string, string>>(values: T) {
  return z.preprocess(blankToUndefined, z.enum(values as unknown as { [K in keyof T]: T[K] }).optional());
}

/** Converts FormData into a plain object; repeated keys become arrays. Files are kept as-is. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const values = formData.getAll(key);
    out[key] = values.length > 1 ? values : values[0];
  }
  return out;
}
