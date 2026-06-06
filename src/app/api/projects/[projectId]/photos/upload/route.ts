import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireEditor } from "@/lib/permissions";
import { getStorage } from "@/lib/storage";
import { recordAudit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { publish } from "@/lib/sse";
import { sniffMime } from "@/lib/mime-sniff";

const MAX_PHOTO_BYTES = 25 * 1024 * 1024; // 25 MB / file
const MAX_PHOTOS_PER_REQUEST = 25;

/**
 * Upload one or more photos to a project. Multipart form-data; each
 * file becomes a ProjectPhoto row with EXIF capture data extracted
 * client-side and posted as adjacent fields (capturedAt, geoLat,
 * geoLng). Field crew mobile flow: client takes photo → uploads →
 * server stores binary + creates row.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  const tenant = await requireTenant();
  // Writing photos is an edit. Viewers (read-only roles) must be rejected;
  // requireTenant alone only proves the caller has *some* access to the
  // tenant, not edit rights. Surface as 403 rather than a 500.
  try {
    await requireEditor(tenant.id);
  } catch {
    return NextResponse.json({ error: "Editor-level role required to upload photos." }, { status: 403 });
  }
  const { projectId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const form = await req.formData();
  const files = form.getAll("file") as File[];
  if (files.length === 0) return NextResponse.json({ error: "no files" }, { status: 422 });
  if (files.length > MAX_PHOTOS_PER_REQUEST) {
    return NextResponse.json({ error: `too many files (max ${MAX_PHOTOS_PER_REQUEST} per request)` }, { status: 413 });
  }

  let albumId = (form.get("albumId") as string | null) || null;
  // Verify the album (if any) belongs to THIS project. Trusting the raw
  // form value would let a caller attach photos to another project's — or
  // another tenant's — album. An invalid id is dropped (photo lands
  // album-less) rather than 500'ing on a foreign-key violation.
  if (albumId) {
    const album = await prisma.projectPhotoAlbum.findFirst({
      where: { id: albumId, projectId },
      select: { id: true },
    });
    if (!album) albumId = null;
  }
  const caption = (form.get("caption") as string | null) || null;
  const capturedAtRaw = form.get("capturedAt") as string | null;
  const capturedAt = capturedAtRaw ? new Date(capturedAtRaw) : null;
  const geoLat = Number(form.get("geoLat"));
  const geoLng = Number(form.get("geoLng"));
  const geoAccuracyM = Number(form.get("geoAccuracyM"));

  const session = await auth();
  const storage = getStorage();
  const created: { id: string; url: string }[] = [];

  const rejected: { filename: string; reason: string }[] = [];
  for (const f of files) {
    if (f.size > MAX_PHOTO_BYTES) {
      rejected.push({ filename: f.name, reason: "exceeds 25 MB" });
      continue;
    }
    const buf = Buffer.from(await f.arrayBuffer());
    // Magic-byte sniff — never trust client-supplied f.type. Reject
    // if the actual bytes aren't a known image format. Defends
    // against renamed-extension uploads (executable as image/jpeg).
    const detected = sniffMime(buf);
    if (!detected || !detected.startsWith("image/")) {
      rejected.push({ filename: f.name, reason: `not a recognized image (sniffed: ${detected ?? "unknown"})` });
      continue;
    }
    const put = await storage.put({
      tenantId: tenant.id,
      filename: f.name,
      body: buf,
      contentType: detected,  // server-side classification, not client-supplied
    });
    // Serve through the authenticated, tenant-scoped streaming route rather
    // than the raw /uploads/ path (which nothing serves and which would
    // break tenant isolation if exposed via public/). The key is
    // tenant-prefixed by the storage adapter.
    const servedUrl = `/api/files/${put.key.split("/").map(encodeURIComponent).join("/")}`;
    const photo = await prisma.projectPhoto.create({
      data: {
        projectId,
        albumId,
        fileUrl: servedUrl,
        caption,
        capturedAt: capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : null,
        geoLat: Number.isFinite(geoLat) ? geoLat : null,
        geoLng: Number.isFinite(geoLng) ? geoLng : null,
        geoAccuracyM: Number.isFinite(geoAccuracyM) ? geoAccuracyM : null,
        uploadedById: session?.userId ?? null,
        uploadedByName: session?.user?.name ?? null,
      },
    });
    created.push({ id: photo.id, url: servedUrl });
  }

  await recordAudit({
    tenantId: tenant.id,
    actorId: session?.userId ?? null,
    actorName: session?.user?.name ?? null,
    entityType: "ProjectPhoto",
    entityId: projectId,
    action: "PHOTOS_UPLOADED",
    after: { count: created.length },
    source: "api/projects/[id]/photos/upload",
  });

  publish(tenant.id, "photos", { event: "photos.uploaded", projectId, count: created.length });

  return NextResponse.json({ created, rejected });
}
