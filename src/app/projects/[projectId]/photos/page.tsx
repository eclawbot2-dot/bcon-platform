import { notFound } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { PhotosView, type PhotoListItem } from "@/components/photos-view";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";

export default async function ProjectPhotosPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tenant = await requireTenant();
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) notFound();

  const [photos, albums] = await Promise.all([
    prisma.projectPhoto.findMany({
      where: { projectId },
      orderBy: { capturedAt: "desc" },
      take: 200,
      include: { album: true },
    }),
    prisma.projectPhotoAlbum.findMany({ where: { projectId }, orderBy: { name: "asc" } }),
  ]);

  // Slim serializable payload for the client grid/list view.
  const photoItems: PhotoListItem[] = photos.map((p) => ({
    id: p.id,
    fileUrl: p.fileUrl,
    thumbnailUrl: p.thumbnailUrl,
    caption: p.caption,
    capturedAt: p.capturedAt ? p.capturedAt.toISOString() : null,
    geoLat: p.geoLat,
    geoLng: p.geoLng,
    albumName: p.album?.name ?? null,
  }));

  return (
    <AppLayout
      eyebrow={`${project.name} · Photos`}
      title="Photo library"
      description="Field photos with EXIF capture (geo + timestamp) and album organization."
    >
      <div className="grid gap-6">
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Upload photos</div>
              <p className="mt-1 text-xs text-slate-400">Multiple files at once. On phones you can shoot with the camera or pick from the photo library.</p>
            </div>
            <Link href={`/projects/${projectId}`} className="btn-outline text-xs">← Project</Link>
          </div>
          <form action={`/api/projects/${projectId}/photos/upload`} method="post" encType="multipart/form-data" className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
            {/* No `capture` attribute: iOS/Android treat capture as camera-only,
                which blocks library picks and ignores `multiple`. Plain
                accept=image/* gives field users the camera-or-library chooser. */}
            <input id="photo-file" type="file" name="file" multiple accept="image/*" className="form-input" aria-label="Choose photos to upload" />
            <select id="photo-album" name="albumId" defaultValue="" className="form-select" aria-label="Album">
              <option value="">— no album —</option>
              {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input id="photo-caption" name="caption" placeholder="Caption (optional)" className="form-input" aria-label="Caption (optional)" />
            <button type="submit" className="btn-primary">Upload</button>
          </form>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Albums</div>
            <form action={`/api/projects/${projectId}/photos/album`} method="post" className="flex gap-2">
              <input name="name" required placeholder="New album name" className="form-input text-xs" aria-label="New album name" />
              <button className="btn-outline text-xs">Create album</button>
            </form>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {albums.map((a) => (
              <span key={a.id} className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">{a.name}</span>
            ))}
            {albums.length === 0 ? <span className="text-xs text-slate-500">No albums yet.</span> : null}
          </div>
        </section>

        <PhotosView photos={photoItems} />
      </div>
    </AppLayout>
  );
}
