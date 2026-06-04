import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { getStorage } from "@/lib/storage";
import { sniffMime } from "@/lib/mime-sniff";
import { safeKeySegments } from "@/lib/file-key";

/**
 * Authenticated, tenant-scoped file streaming.
 *
 * Files uploaded via the storage adapter land under `./uploads/<key>`
 * (LocalDisk) or a bucket (S3/R2). Nothing served them, so field photos
 * and document attachments 404'd. We deliberately do NOT symlink the
 * upload root into `public/` — that would expose every tenant's files to
 * any unauthenticated visitor and break tenant isolation.
 *
 * Instead this route:
 *   1. Requires a logged-in session. NOTE: the middleware matcher excludes
 *      paths ending in a file extension (e.g. `.jpg`), so this handler
 *      cannot rely on middleware auth — it authenticates itself.
 *   2. Enforces that the key's tenant prefix matches the caller's ACTIVE
 *      tenant. Storage keys are tenant-prefixed by convention
 *      (`<tenantId>/<id>-<name>`); a caller may only read keys under their
 *      own tenant. Super-admins read whichever tenant they've switched to
 *      (the same isolation boundary the rest of the app uses).
 *   3. Streams the bytes through the storage adapter with a correct,
 *      server-sniffed content-type and an inline/attachment disposition.
 *
 * Path-traversal is blocked by rejecting any key segment of `.` or `..`
 * and any backslash; the LocalDisk adapter also joins under its root.
 */

// Content types we are willing to render inline in the browser. Everything
// else is forced to download (attachment) so we never serve, say, an
// uploaded .html as an inline page in the app's own origin.
const INLINE_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key: rawParts } = await ctx.params;
  const key = safeKeySegments(rawParts ?? []);
  if (!key) {
    return NextResponse.json({ error: "bad key" }, { status: 400 });
  }

  // Tenant isolation: the first path segment is the owning tenant id.
  const tenant = await requireTenant();
  const ownerTenantId = key.split("/")[0];
  if (ownerTenantId !== tenant.id) {
    // Don't reveal whether the file exists for another tenant.
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const storage = getStorage();
  let buf: Buffer;
  try {
    buf = await storage.get(key);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Trust the actual bytes for content-type, never a client hint. Fall
  // back to octet-stream (forced download) when we can't classify.
  const sniffed = sniffMime(buf) ?? "application/octet-stream";
  const inline = INLINE_TYPES.has(sniffed);
  const filename = key.split("/").pop() ?? "file";

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": sniffed,
      "content-length": String(buf.byteLength),
      // nosniff so the browser honours our content-type and can't be
      // tricked into executing a mislabeled upload.
      "x-content-type-options": "nosniff",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/["\\]/g, "_")}"`,
      // Private: per-user/tenant; never cache in shared proxies.
      "cache-control": "private, max-age=300",
    },
  });
}
