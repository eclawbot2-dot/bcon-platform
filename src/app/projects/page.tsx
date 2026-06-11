import { AppLayout } from "@/components/layout/app-layout";
import { ProjectsView, type ProjectListItem } from "@/components/projects-view";
import { getDashboardData } from "@/lib/dashboard";
import { toNum } from "@/lib/money";

export default async function ProjectsPage() {
  const data = await getDashboardData();

  // Slim, serializable payload for the client view — Decimal → number, and
  // only the fields the cards/list actually render.
  const projects: ProjectListItem[] = (data?.projectWorkspaces ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    mode: p.mode,
    contractType: p.contractType,
    address: p.address,
    ownerName: p.ownerName,
    contractValue: toNum(p.contractValue),
    progressPct: p.progressPct,
    tabs: p.tabs,
    upcomingTasks: p.upcomingTasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority, status: t.status })),
    channels: p.channels.map((c) => ({ channel: c.channel })),
    latestSummary: p.latestSummary,
  }));

  return (
    <AppLayout
      eyebrow="Project workspace"
      title="Projects"
      description="Mode-aware project registry with one workspace model that shifts behavior for simple builders, vertical teams, and heavy civil operations."
    >
      <ProjectsView projects={projects} />
    </AppLayout>
  );
}
