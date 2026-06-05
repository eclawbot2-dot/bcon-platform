import { notFound } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDateTime } from "@/lib/utils";
import { ImageOff } from "lucide-react";

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
              <p className="mt-1 text-xs text-slate-400">Multiple files at once. Mobile camera prompt enabled (capture=environment).</p>
            </div>
            <Link href={`/projects/${projectId}`} className="btn-outline text-xs">← Project</Link>
          </div>
          <form action={`/api/projects/${projectId}/photos/upload`} method="post" encType="multipart/form-data" className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
            <input id="photo-file" type="file" name="file" multiple accept="image/*" capture="environment" className="form-input" aria-label="Choose photos to upload" />
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

        <section className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          {photos.map((p) => (
            <article key={p.id} className="card p-3">
              <div className="aspect-square overflow-hidden rounded-lg bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumbnailUrl ?? p.fileUrl} alt={p.caption || `Project photo${p.capturedAt ? ` from ${formatDateTime(p.capturedAt)}` : ""}`} loading="lazy" className="h-full w-full object-cover" />
              </div>
              <div className="mt-2 text-xs">
                <div className="text-white truncate">{p.caption ?? "(no caption)"}</div>
                <div className="text-slate-500">{p.capturedAt ? formatDateTime(p.capturedAt) : "—"}</div>
                {p.geoLat && p.geoLng ? <div className="text-slate-500 text-[10px]">{p.geoLat.toFixed(4)}, {p.geoLng.toFixed(4)}</div> : null}
                {p.album ? <div className="text-cyan-300 text-[10px]">{p.album.name}</div> : null}
              </div>
            </article>
          ))}
          {photos.length === 0 ? (
            <div className="col-span-full card p-6">
              <EmptyState icon={ImageOff} title="No photos yet" description="Upload field photos above — capture is enabled for mobile cameras and EXIF geo/timestamp is preserved." />
            </div>
          ) : null}
        </section>
      </div>
    </AppLayout>
  );
}
