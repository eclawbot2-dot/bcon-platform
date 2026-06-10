import { ProjectMode, ThreadChannel, WorkflowStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentTenant } from "@/lib/tenant";
import { toNum } from "@/lib/money";

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
export type TenantContext = Awaited<ReturnType<typeof getTenantContext>>;

/**
 * Lightweight tenant header used by the sidebar (rendered on every page).
 * Skips the entire project graph that getDashboardData() walks — saves
 * dozens of joins per request when the page itself doesn't need projects.
 */
export async function getTenantContext() {
  // Resolve the active tenant through the canonical, membership-aware
  // resolver (the same one requireTenant/detail pages use). Resolving here
  // independently (slug ?? DEFAULT_TENANT_SLUG ?? oldest) diverged from that
  // resolver: a regular user with no `cx.tenant` cookie got DEFAULT_TENANT_SLUG
  // (or the oldest tenant) regardless of membership, so the sidebar/header
  // showed one tenant's branding while detail pages scoped to the user's
  // actual membership tenant — a cross-tenant inconsistency (and data leak).
  const active = await getCurrentTenant();
  if (!active) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { id: active.id },
    include: { businessUnits: true },
  });
  if (!tenant) return null;

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    primaryMode: tenant.primaryMode,
    enabledModes: parseJsonArray(tenant.enabledModes),
    featurePacks: parseJsonArray(tenant.featurePacks),
    terminology: parseJsonObject<Record<string, string>>(tenant.terminology, {}),
    businessUnits: tenant.businessUnits,
  };
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Per-project include shape shared by the tenant-wide dashboard fan-out
 * AND the single-project workspace loader. Includes are bounded so a
 * project with thousands of rows in any one collection doesn't tip the
 * response into multi-MB JSON. Detail pages should use focused
 * single-entity loaders, not this fan-out.
 */
const PROJECT_WORKSPACE_INCLUDE = {
  threads: {
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { author: true },
      },
    },
  },
  tasks: {
    include: { assignee: true },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 50,
  },
  documents: { orderBy: { createdAt: "desc" }, take: 20 },
  rfis: { orderBy: { createdAt: "desc" }, take: 30 },
  submittals: { orderBy: { createdAt: "desc" }, take: 30 },
  dailyLogs: { orderBy: { logDate: "desc" }, take: 3 },
  budgets: { include: { lines: true } },
  quantities: { take: 30 },
  productionEntries: { orderBy: { createdAt: "desc" }, take: 30 },
  tickets: { orderBy: { createdAt: "desc" }, take: 30 },
  meetings: { orderBy: { scheduledAt: "desc" }, take: 10 },
  safetyIncidents: { orderBy: { createdAt: "desc" }, take: 20 },
  punchItems: { orderBy: { createdAt: "desc" }, take: 30 },
  workflowRuns: { include: { watchers: { include: { user: true } } }, take: 10 },
  watchers: { include: { user: true }, take: 30 },
  approvalRoutes: { take: 10 },
  equipmentRecords: { take: 20 },
  materialRecords: { take: 20 },
  _count: {
    select: {
      tasks: { where: { status: { not: "COMPLETE" } } },
      rfis: { where: { status: { not: WorkflowStatus.CLOSED } } },
      submittals: { where: { status: { not: WorkflowStatus.CLOSED } } },
      meetings: true,
      quantities: true,
      productionEntries: true,
      tickets: true,
      documents: true,
      safetyIncidents: true,
      punchItems: true,
      watchers: true,
      approvalRoutes: true,
    },
  },
} satisfies Prisma.ProjectInclude;

type ProjectWithWorkspace = Prisma.ProjectGetPayload<{ include: typeof PROJECT_WORKSPACE_INCLUDE }>;

export async function getDashboardData() {
  // Resolve the active tenant via the canonical, membership-aware resolver so
  // the project list/overview load the SAME tenant the per-project detail
  // pages scope to (they use requireTenant()). Previously this used a separate
  // slug ?? DEFAULT_TENANT_SLUG ?? oldest-tenant lookup that ignored
  // membership: a regular user with no `cx.tenant` cookie saw another tenant's
  // projects in the list and could open a project overview, but every
  // sub-tab (RFIs, contracts, …) called requireTenant() and 404'd on the
  // tenantId mismatch. Aligning the resolver fixes both the leak and the 404s.
  const active = await getCurrentTenant();
  if (!active) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { id: active.id },
    include: {
      businessUnits: true,
      workflowTemplates: true,
      companies: true,
      contacts: true,
      notificationRules: true,
      historicalEstimates: true,
      projects: {
        include: PROJECT_WORKSPACE_INCLUDE,
        orderBy: { createdAt: "asc" },
      },
      memberships: {
        include: { user: true, businessUnit: true },
      },
      auditEvents: {
        include: { actor: true },
        orderBy: { createdAt: "desc" },
        take: 12,
      },
    },
  });

  if (!tenant) return null;

  const projectsByMode = Object.values(ProjectMode).map((mode) => {
    const projects = tenant.projects.filter((project) => project.mode === mode);
    return {
      mode,
      count: projects.length,
      avgHealth: projects.length ? Math.round(projects.reduce((sum, p) => sum + p.healthScore, 0) / projects.length) : 0,
      progressAvg: projects.length ? Math.round(projects.reduce((sum, p) => sum + p.progressPct, 0) / projects.length) : 0,
    };
  });

  // Roll up KPIs from the per-project _count aggregations rather than
  // counting array lengths post-hoc. This keeps the numbers correct even
  // when the per-project includes are capped by `take: N` above.
  const kpis = tenant.projects.reduce(
    (acc, project) => {
      acc.openTasks += project._count.tasks;
      acc.activeRfis += project._count.rfis;
      acc.activeSubmittals += project._count.submittals;
      acc.tickets += project._count.tickets;
      acc.documents += project._count.documents;
      acc.incidents += project._count.safetyIncidents;
      acc.punchItems += project._count.punchItems;
      acc.watchers += project._count.watchers;
      acc.approvalRoutes += project._count.approvalRoutes;
      return acc;
    },
    {
      projects: tenant.projects.length,
      openTasks: 0,
      activeRfis: 0,
      activeSubmittals: 0,
      tickets: 0,
      documents: 0,
      incidents: 0,
      punchItems: 0,
      watchers: 0,
      approvalRoutes: 0,
    },
  );

  const dashboardCards = tenant.projects.map((project) => buildProjectCard(project, parseJsonArray(tenant.featurePacks)));

  const modeDefaults = {
    [ProjectMode.SIMPLE]: {
      dashboard: ["Active jobs", "Overdue tasks", "Recent job thread activity", "Pending approvals", "Budget health", "Punch items"],
      requiredForms: ["Daily Summary", "Change Order Log", "Punch List"],
      terms: { project: "Job", thread: "Job Thread" },
      engagement: ["Client updates", "Selection tracking", "Photo-first progress", "Fast approvals"],
    },
    [ProjectMode.VERTICAL]: {
      dashboard: ["Overdue RFIs", "Submittal aging", "Change events", "Manpower", "Inspections", "Commitments and billings", "Procurement risks"],
      requiredForms: ["RFI", "Submittal", "Meeting Minutes", "Drawing Register"],
      terms: { observation: "Observation", issue: "Punch" },
      engagement: ["Document control", "Design team routing", "Formal meeting cadence", "Procurement oversight"],
    },
    [ProjectMode.HEAVY_CIVIL]: {
      dashboard: ["Installed vs budgeted quantities", "Production rates", "Crew/equipment utilization", "Hauling/ticket counts", "Cost-to-complete by activity", "Weather/delay impacts"],
      requiredForms: ["Daily Production Report", "Ticket Reconciliation", "Pay Item Tracking"],
      terms: { issue: "Field Issue", quantity: "Installed Quantity" },
      engagement: ["Field reporting", "Ticket reconciliation", "Quantity backup", "Crew production control"],
    },
  };

  const projectWorkspaces = dashboardCards.map((project) => ({
    ...project,
    tabs: tabsForMode(project.mode),
  }));

  const sharedServices = {
    crm: {
      companyCount: tenant.companies.length,
      contactCount: tenant.contacts.length,
      markets: [...new Set(tenant.companies.map((company) => company.market).filter(Boolean))],
    },
    workforce: {
      memberships: tenant.memberships.length,
      byRole: tenant.memberships.reduce<Record<string, number>>((acc, membership) => {
        acc[membership.roleTemplate] = (acc[membership.roleTemplate] ?? 0) + 1;
        return acc;
      }, {}),
    },
    workflowEngine: {
      templateCount: tenant.workflowTemplates.length,
      recentRuns: tenant.projects.flatMap((project) => project.workflowRuns).slice(0, 8),
    },
    notifications: tenant.notificationRules,
    historicalEstimates: tenant.historicalEstimates,
  };

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      primaryMode: tenant.primaryMode,
      enabledModes: parseJsonArray(tenant.enabledModes),
      featurePacks: parseJsonArray(tenant.featurePacks),
      terminology: parseJsonObject<Record<string, string>>(tenant.terminology, {}),
      businessUnits: tenant.businessUnits,
      members: tenant.memberships.map((membership) => ({
        role: membership.roleTemplate,
        businessUnit: membership.businessUnit?.name ?? "Shared",
        user: membership.user.name,
        email: membership.user.email,
      })),
    },
    kpis,
    projectsByMode,
    dashboardCards,
    projectWorkspaces,
    workflowTemplates: tenant.workflowTemplates,
    auditTrail: tenant.auditEvents.map((event) => ({
      ...event,
      actorName: event.actor?.name ?? "System",
    })),
    modeDefaults,
    threadChannels: Object.values(ThreadChannel),
    sharedServices,
  };
}

/**
 * Single-project workspace loader. Tenant-scoped via the canonical
 * membership-aware resolver (same isolation guarantee as requireTenant —
 * a forged projectId from another tenant matches nothing and returns null).
 *
 * Perf: previously this called getDashboardData() — loading EVERY project
 * in the tenant with the full ~20-relation fan-out — only to pick one
 * project out of the array. On a tenant with N projects that was N× the
 * necessary query cost on every /projects/[projectId] render. Now it
 * fetches exactly one project with the same include shape.
 */
export async function getProjectWorkspace(projectId: string) {
  const active = await getCurrentTenant();
  if (!active) return null;
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: active.id },
    include: PROJECT_WORKSPACE_INCLUDE,
  });
  if (!project) return null;
  return {
    ...buildProjectCard(project, parseJsonArray(active.featurePacks)),
    tabs: tabsForMode(project.mode),
  };
}

/** Mode-specific workspace tab list (shared by dashboard + single-project loaders). */
function tabsForMode(mode: ProjectMode): string[] {
  return mode === ProjectMode.SIMPLE
    ? ["Overview", "Job Thread", "Tasks", "Budget", "Daily Summary", "Punch", "Client Portal"]
    : mode === ProjectMode.VERTICAL
      ? ["Overview", "Drawings", "RFIs", "Submittals", "Meetings", "Budget", "Quality/Safety", "Closeout"]
      : ["Overview", "Production", "Quantities", "Tickets", "Equipment", "Materials", "Compliance", "Claims Support"];
}

/**
 * Shape one project (fetched with PROJECT_WORKSPACE_INCLUDE) into the
 * dashboard-card / workspace view model. Extracted so the tenant-wide
 * dashboard and the single-project workspace stay rendering-identical.
 */
function buildProjectCard(project: ProjectWithWorkspace, enabledPacks: string[]) {
  const budget = project.budgets[0];
  const latestThread = project.threads.find((thread) => thread.isDefault) ?? project.threads[0];
  const config = parseJsonObject<Record<string, unknown>>(project.configurationJson, {});

  return {
    id: project.id,
    name: project.name,
    code: project.code,
    mode: project.mode,
    stage: project.stage,
    ownerName: project.ownerName,
    address: project.address,
    contractType: project.contractType,
    contractValue: project.contractValue,
    progressPct: project.progressPct,
    healthScore: project.healthScore,
    dashboardVariant:
      project.mode === ProjectMode.SIMPLE ? "simple" : project.mode === ProjectMode.VERTICAL ? "vertical" : "heavy-civil",
    enabledPacks,
    config,
    metrics:
      project.mode === ProjectMode.SIMPLE
        ? [
            { label: "Open tasks", value: project._count.tasks },
            { label: "Photos/docs", value: project._count.documents },
            { label: "Budget", value: `$${Math.round(toNum(budget?.currentValue) / 1000)}k` },
            { label: "Punch", value: project._count.punchItems },
          ]
        : project.mode === ProjectMode.VERTICAL
          ? [
              { label: "RFIs", value: project._count.rfis },
              { label: "Submittals", value: project._count.submittals },
              { label: "Meetings", value: project._count.meetings },
              { label: "Budget", value: `$${Math.round(toNum(budget?.currentValue) / 1000000)}M` },
            ]
          : [
              { label: "Quantities", value: project._count.quantities },
              { label: "Production entries", value: project._count.productionEntries },
              { label: "Tickets", value: project._count.tickets },
              { label: "Budget", value: `$${Math.round(toNum(budget?.currentValue) / 1000000)}M` },
            ],
    latestSummary: project.dailyLogs[0]?.summary ?? "No daily summary yet",
    recentMessages:
      latestThread?.messages.map((message) => ({
        id: message.id,
        body: message.body,
        author: message.author.name,
        createdAt: message.createdAt.toISOString(),
      })) ?? [],
    budgetLines: budget?.lines ?? [],
    quantityHighlights: project.quantities,
    productionHighlights: project.productionEntries,
    dailyLogs: project.dailyLogs,
    rfis: project.rfis,
    submittals: project.submittals,
    meetings: project.meetings,
    documents: project.documents,
    safetyIncidents: project.safetyIncidents,
    punchItems: project.punchItems,
    workflowRuns: project.workflowRuns,
    watchers: project.watchers,
    approvalRoutes: project.approvalRoutes,
    equipmentRecords: project.equipmentRecords,
    materialRecords: project.materialRecords,
    upcomingTasks: project.tasks
      .filter((task) => task.status !== "COMPLETE")
      .sort((a, b) => (a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 6),
    channels: project.threads.map((thread) => ({ title: thread.title, channel: thread.channel })),
  };
}
