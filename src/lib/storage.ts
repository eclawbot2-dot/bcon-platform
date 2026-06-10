/**
 * Object storage adapter — pluggable transport.
 *
 * Background (audit Pass 7 §3.1, §6 closing): the platform has no object
 * storage layer. File uploads (imports, photos, document attachments) all
 * end up either parsed-and-discarded or held in the row that triggered
 * them. There's no way to preserve the original artifact (a key compliance
 * requirement under req §6.3 and the public-sector workflows in §7.21).
 *
 * This module defines a thin Storage interface with a working LocalDisk
 * default. Production picks one of the cloud adapters below by setting
 * the STORAGE_TRANSPORT env var; the API surface is the same.
 *
 *   STORAGE_TRANSPORT=local       (default — writes to ./uploads/)
 *   STORAGE_TRANSPORT=memory      (test-only; never persists)
 *   STORAGE_TRANSPORT=s3          (AWS S3 via built-in SigV4 fetch — set
 *                                  STORAGE_S3_BUCKET/ACCESS_KEY/SECRET_KEY)
 *   STORAGE_TRANSPORT=r2          (Cloudflare R2 — same vars plus
 *                                  STORAGE_S3_ENDPOINT and REGION=auto)
 *
 * Misconfiguration is FAIL-CLOSED in production: choosing s3/r2 without
 * the required vars throws at boot with the exact missing names (see
 * resolveStorageFromEnv) instead of silently writing to local disk.
 *
 * Design choices:
 *   - All methods are async to keep the surface stable across cloud adapters.
 *   - `put` returns the storage key and a URL the browser can hit. For the
 *     local adapter, URL is a relative path under /uploads/<key> — Next.js
 *     serves it from `public/uploads/` once we publish it (this PR keeps
 *     them outside `public/` for safety; serving requires a follow-up).
 *   - Keys are tenant-prefixed by convention (callers prepend tenant id)
 *     so a single bucket can host many tenants without collisions.
 *   - `signedUrl` is a no-op for the local adapter (returns the same URL)
 *     and a real time-bound signed URL for cloud adapters.
 */

import { mkdir, writeFile, readFile, unlink, stat } from "fs/promises";
import path from "path";
import crypto, { randomBytes } from "crypto";

export type PutResult = { key: string; url: string; size: number; contentType?: string };

export interface Storage {
  name: string;
  /** Persist `body` under a deterministic key. Caller may pass a key or
   *  let the adapter generate one. Returns the canonical key + browser URL. */
  put(args: { key?: string; tenantId: string; body: Buffer | string; contentType?: string; filename?: string }): Promise<PutResult>;
  /** Read raw bytes for a key. Throws if missing. */
  get(key: string): Promise<Buffer>;
  /** Remove an object. Idempotent — does not throw on missing. */
  delete(key: string): Promise<void>;
  /** Browser-reachable URL for a key. May return a presigned URL with TTL. */
  signedUrl(key: string, ttlSeconds?: number): Promise<string>;
  /** Best-effort size lookup; returns null if unknown / missing. */
  size(key: string): Promise<number | null>;
}

class LocalDiskStorage implements Storage {
  name = "local";
  private root: string;
  private urlPrefix: string;

  constructor(opts?: { root?: string; urlPrefix?: string }) {
    this.root = opts?.root ?? path.join(process.cwd(), "uploads");
    this.urlPrefix = opts?.urlPrefix ?? "/uploads";
  }

  private resolveKey(tenantId: string, providedKey?: string, filename?: string): string {
    if (providedKey) return providedKey;
    const id = randomBytes(8).toString("hex");
    const safe = (filename ?? "blob").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
    return `${tenantId}/${id}-${safe}`;
  }

  async put(args: { key?: string; tenantId: string; body: Buffer | string; contentType?: string; filename?: string }): Promise<PutResult> {
    const key = this.resolveKey(args.tenantId, args.key, args.filename);
    const fullPath = path.join(this.root, key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    const buf = typeof args.body === "string" ? Buffer.from(args.body) : args.body;
    await writeFile(fullPath, buf);
    return {
      key,
      url: `${this.urlPrefix}/${key}`,
      size: buf.byteLength,
      contentType: args.contentType,
    };
  }

  async get(key: string): Promise<Buffer> {
    const fullPath = path.join(this.root, key);
    return readFile(fullPath);
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(this.root, key);
    await unlink(fullPath).catch(() => {
      /* missing-on-delete is not an error */
    });
  }

  async signedUrl(key: string): Promise<string> {
    return `${this.urlPrefix}/${key}`;
  }

  async size(key: string): Promise<number | null> {
    try {
      const s = await stat(path.join(this.root, key));
      return s.size;
    } catch {
      return null;
    }
  }
}

class MemoryStorage implements Storage {
  name = "memory";
  private blobs = new Map<string, Buffer>();

  async put(args: { key?: string; tenantId: string; body: Buffer | string; contentType?: string; filename?: string }): Promise<PutResult> {
    const key = args.key ?? `${args.tenantId}/${randomBytes(6).toString("hex")}-${args.filename ?? "blob"}`;
    const buf = typeof args.body === "string" ? Buffer.from(args.body) : args.body;
    this.blobs.set(key, buf);
    return { key, url: `mem://${key}`, size: buf.byteLength, contentType: args.contentType };
  }

  async get(key: string): Promise<Buffer> {
    const b = this.blobs.get(key);
    if (!b) throw new Error(`memory storage: no object at ${key}`);
    return b;
  }

  async delete(key: string): Promise<void> {
    this.blobs.delete(key);
  }

  async signedUrl(key: string): Promise<string> {
    return `mem://${key}`;
  }

  async size(key: string): Promise<number | null> {
    return this.blobs.get(key)?.byteLength ?? null;
  }
}

/**
 * S3 / R2 adapter — uses the AWS SDK if @aws-sdk/client-s3 is
 * installed, otherwise a pure-fetch SigV4 implementation for the
 * minimal set of operations we need (put / get / signed URL / delete /
 * size). This avoids a hard dependency on the AWS SDK; pulling it
 * in later is a no-op upgrade.
 *
 * Required env vars:
 *   STORAGE_TRANSPORT=s3              (or r2)
 *   STORAGE_S3_BUCKET=my-bucket
 *   STORAGE_S3_REGION=us-east-1       (R2 uses "auto")
 *   STORAGE_S3_ENDPOINT=https://...   (R2: account-specific endpoint)
 *   STORAGE_S3_ACCESS_KEY=...
 *   STORAGE_S3_SECRET_KEY=...
 *   STORAGE_S3_PUBLIC_URL=https://cdn.example.com  (optional CDN host)
 */
class S3Storage implements Storage {
  name = "s3";
  private bucket: string;
  private region: string;
  private endpoint: string;
  private accessKey: string;
  private secretKey: string;
  private publicUrl: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.bucket = env.STORAGE_S3_BUCKET!;
    this.region = env.STORAGE_S3_REGION ?? "us-east-1";
    this.endpoint = env.STORAGE_S3_ENDPOINT ?? `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
    this.accessKey = env.STORAGE_S3_ACCESS_KEY!;
    this.secretKey = env.STORAGE_S3_SECRET_KEY!;
    this.publicUrl = env.STORAGE_S3_PUBLIC_URL ?? this.endpoint;
  }

  async put(args: { key?: string; tenantId: string; body: Buffer | string; contentType?: string; filename?: string }): Promise<PutResult> {
    const key = args.key ?? `${args.tenantId}/${crypto.randomBytes(8).toString("hex")}-${(args.filename ?? "blob").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80)}`;
    const buf = typeof args.body === "string" ? Buffer.from(args.body) : args.body;
    const url = `${this.endpoint}/${encodeURIComponent(key)}`;
    const res = await this.signedFetch("PUT", url, buf, args.contentType);
    if (!res.ok) throw new Error(`s3 put ${res.status} ${await res.text()}`);
    return { key, url: `${this.publicUrl}/${key}`, size: buf.byteLength, contentType: args.contentType };
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.signedFetch("GET", `${this.endpoint}/${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error(`s3 get ${res.status} ${key}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await this.signedFetch("DELETE", `${this.endpoint}/${encodeURIComponent(key)}`);
  }

  async signedUrl(key: string, ttlSeconds: number = 600): Promise<string> {
    return this.presignedGetUrl(key, ttlSeconds);
  }

  async size(key: string): Promise<number | null> {
    const res = await this.signedFetch("HEAD", `${this.endpoint}/${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const len = res.headers.get("content-length");
    return len ? Number(len) : null;
  }

  private async signedFetch(method: string, url: string, body?: Buffer, contentType?: string): Promise<Response> {
    const { hostname, pathname, search } = new URL(url);
    const headers = await sigV4(method, hostname, pathname, search, body ?? Buffer.alloc(0), this.accessKey, this.secretKey, this.region, "s3", contentType);
    // Convert Node Buffer to a typed array view fetch can accept.
    const init: RequestInit = { method, headers };
    if (body) init.body = new Uint8Array(body);
    return fetch(url, init);
  }

  private async presignedGetUrl(key: string, ttlSeconds: number): Promise<string> {
    return sigV4PresignGet(this.endpoint, key, this.accessKey, this.secretKey, this.region, "s3", ttlSeconds);
  }
}

/** Env vars the s3/r2 transports require before they can be activated. */
const S3_REQUIRED_VARS = ["STORAGE_S3_BUCKET", "STORAGE_S3_ACCESS_KEY", "STORAGE_S3_SECRET_KEY"] as const;

/**
 * Pure transport resolver — exported for tests. Decides which adapter the
 * STORAGE_TRANSPORT env selects and how misconfiguration is handled:
 *
 *   - s3/r2 with complete STORAGE_S3_* config → S3 adapter.
 *   - s3/r2 with INCOMPLETE config in production → throws an actionable
 *     error naming exactly which vars are missing. Silently falling back
 *     to local disk (the old behaviour) is a data-integrity hazard: the
 *     operator believes artifacts are durably stored in a bucket while
 *     they actually land on the app host's disk and vanish on rebuild.
 *   - s3/r2 with incomplete config outside production → warn + local disk,
 *     so dev/CI stay ergonomic.
 */
export function resolveStorageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): Storage {
  const choice = (env.STORAGE_TRANSPORT ?? "local").toLowerCase();
  if (choice === "memory") return new MemoryStorage();
  if (choice === "s3" || choice === "r2") {
    const missing = S3_REQUIRED_VARS.filter((name) => !(env[name] ?? "").trim());
    if (missing.length === 0) return new S3Storage(env);
    const hint =
      `[storage] STORAGE_TRANSPORT=${choice} requested but required env vars are missing: ${missing.join(", ")}. ` +
      `Set them (see .env.example — R2 also needs STORAGE_S3_ENDPOINT and STORAGE_S3_REGION=auto) ` +
      `or set STORAGE_TRANSPORT=local.`;
    if (nodeEnv === "production") {
      // Fail fast: a misconfigured cloud transport must never silently
      // degrade to local disk in production.
      throw new Error(hint);
    }
    console.warn(`${hint} Falling back to local disk (non-production only).`);
  }
  return new LocalDiskStorage();
}

let active: Storage = resolveStorageFromEnv();

export function getStorage(): Storage {
  return active;
}

export function setStorage(s: Storage): void {
  active = s;
}

// SigV4 helpers extracted to src/lib/sigv4.ts so they're testable in
// isolation against AWS-documented test vectors.
import { sigV4, sigV4PresignGet } from "./sigv4";
