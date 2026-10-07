import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing with scrypt (memory-hard, built into Node — no native deps).
 * Stored format: scrypt$N$r$p$<salt b64>$<hash b64>, so parameters can be
 * raised later and old hashes upgraded on next login (see needsRehash).
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_MEM = 128 * 1024 * 1024;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize("NFKC"), salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM });
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEM,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function needsRehash(stored: string): boolean {
  const [scheme, n, r, p] = stored.split("$");
  return scheme !== "scrypt" || Number(n) < PARAMS.N || Number(r) !== PARAMS.r || Number(p) !== PARAMS.p;
}

/** A pre-computed hash used to keep login timing constant for unknown emails. */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

/** Returns human-readable problems with a proposed password (empty = acceptable). */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 12) problems.push("Use at least 12 characters.");
  if (password.length > 200) problems.push("Use at most 200 characters.");
  if (!/[a-z]/.test(password)) problems.push("Include a lowercase letter.");
  if (!/[A-Z]/.test(password)) problems.push("Include an uppercase letter.");
  if (!/[0-9]/.test(password)) problems.push("Include a number.");
  if (!/[^A-Za-z0-9]/.test(password)) problems.push("Include a symbol.");
  return problems;
}
