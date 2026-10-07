import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

/**
 * File storage abstraction for the document repository.
 *
 * Files are addressed by opaque, server-generated keys — never by user-supplied
 * names or paths — and are only ever served through the authenticated
 * /api/documents/[versionId] route after a permission check. To move to S3 /
 * Azure Blob / GCS, implement `StorageAdapter` and return it from `storage()`.
 */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  /** Returns a web stream of the file, or null if it does not exist. */
  get(key: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null>;
  delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9/_-]{8,200}$/;

export function newStorageKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}`;
}

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

class LocalDiskStorage implements StorageAdapter {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!KEY_PATTERN.test(key) || key.includes("..")) throw new Error("Invalid storage key");
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await writeFile(full, data, { mode: 0o600, flag: "wx" });
  }

  async get(key: string) {
    const full = this.resolve(key);
    try {
      const info = await stat(full);
      const stream = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
      return { stream, size: info.size };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

let instance: StorageAdapter | null = null;

export function storage(): StorageAdapter {
  instance ??= new LocalDiskStorage(path.resolve(process.cwd(), process.env.STORAGE_DIR || "./storage/uploads"));
  return instance;
}

/** Upload limits and the allow-list of file types the repository accepts. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_TYPES: Record<string, { ext: string[]; preview: boolean }> = {
  "application/pdf": { ext: ["pdf"], preview: true },
  "image/png": { ext: ["png"], preview: true },
  "image/jpeg": { ext: ["jpg", "jpeg"], preview: true },
  "image/webp": { ext: ["webp"], preview: true },
  "text/plain": { ext: ["txt", "md"], preview: true },
  "text/csv": { ext: ["csv"], preview: true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: ["docx"], preview: false },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: ["xlsx"], preview: false },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: ["pptx"], preview: false },
  "application/msword": { ext: ["doc"], preview: false },
  "application/vnd.ms-excel": { ext: ["xls"], preview: false },
};

/** Verifies magic bytes for types where spoofing matters (PDF and images). */
export function contentMatchesType(data: Buffer, mime: string): boolean {
  const head = data.subarray(0, 12);
  switch (mime) {
    case "application/pdf":
      return head.subarray(0, 5).toString("latin1") === "%PDF-";
    case "image/png":
      return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "image/webp":
      return head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return head[0] === 0x50 && head[1] === 0x4b; // ZIP container
    case "text/plain":
    case "text/csv":
      return !data.subarray(0, 4096).includes(0); // no NUL bytes
    default:
      return true;
  }
}
