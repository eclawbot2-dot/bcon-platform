import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  BidPackageStatus,
  BudgetLineType,
  ChangeOrderKind,
  ChangeOrderStatus,
  ContractStatus,
  ContractType,
  DocumentClass,
  InspectionKind,
  InspectionResult,
  InsuranceType,
  LienWaiverStatus,
  LienWaiverType,
  OpportunityStage,
  PayApplicationStatus,
  PrequalificationStatus,
  PrismaClient,
  ProjectMode,
  ProjectStage,
  ScheduleDependencyType,
  SubBidStatus,
  SubInvoiceStatus,
  TaskStatus,
  ThreadChannel,
  TimeEntryStatus,
  UserRoleTemplate,
  WarrantyStatus,
  WorkflowStatus,
} from "@prisma/client";
import { toNum, multiplyMoney, addMoney, sumMoney } from "../src/lib/money";

const connectionString = process.env.DATABASE_URL;
if (!connectionString || !/^postgres(ql)?:\/\//.test(connectionString)) {
  throw new Error("DATABASE_URL must be a postgresql:// connection string to seed.");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.warrantyItem.deleteMany();
  await prisma.crewAssignment.deleteMany();
  await prisma.drawingSheet.deleteMany();
  await prisma.drawing.deleteMany();
  await prisma.specSection.deleteMany();
  await prisma.onboardingStep.deleteMany();
  await prisma.onboardingPath.deleteMany();
  await prisma.teamingPartner.deleteMany();
  await prisma.goNoGoDecision.deleteMany();
  await prisma.colorTeamReview.deleteMany();
  await prisma.captureMilestone.deleteMany();
  await prisma.captureRecord.deleteMany();
  await prisma.commissionAccrual.deleteMany();
  await prisma.commissionRule.deleteMany();
  await prisma.placement.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.jobRequisition.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.subInvoice.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.subBid.deleteMany();
  await prisma.bidPackage.deleteMany();
  await prisma.insuranceCert.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.lienWaiver.deleteMany();
  await prisma.payApplicationLine.deleteMany();
  await prisma.payApplication.deleteMany();
  await prisma.contractCommitment.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.scheduleDependency.deleteMany();
  await prisma.scheduleTask.deleteMany();
  await prisma.changeOrderLine.deleteMany();
  await prisma.changeOrder.deleteMany();
  await prisma.notificationRule.deleteMany();
  await prisma.historicalEstimate.deleteMany();
  await prisma.materialRecord.deleteMany();
  await prisma.equipmentRecord.deleteMany();
  await prisma.approvalRoute.deleteMany();
  await prisma.watcher.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.productionEntry.deleteMany();
  await prisma.quantityBudget.deleteMany();
  await prisma.budgetLine.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.dailyLog.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.submittal.deleteMany();
  await prisma.rFI.deleteMany();
  await prisma.document.deleteMany();
  await prisma.task.deleteMany();
  await prisma.threadMessage.deleteMany();
  await prisma.thread.deleteMany();
  await prisma.workflowRun.deleteMany();
  await prisma.punchItem.deleteMany();
  await prisma.safetyIncident.deleteMany();
  await prisma.project.deleteMany();
  await prisma.workflowTemplate.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.company.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.businessUnit.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  const password = await bcrypt.hash("demo1234", 10);
  const adminPassword = await bcrypt.hash("hadleymaris", 10);

  const [admin, exec, pm, superintendent] = await Promise.all([
    prisma.user.create({ data: { name: "Trey", email: "trey@jahdev.com", password: adminPassword, superAdmin: true } }),
    prisma.user.create({ data: { name: "Elena Executive", email: "exec@construction.local", password } }),
    prisma.user.create({ data: { name: "Paula PM", email: "pm@construction.local", password } }),
    prisma.user.create({ data: { name: "Sam Superintendent", email: "super@construction.local", password } }),
  ]);

  const tenant = await prisma.tenant.create({
    data: {
      name: "Jah Construction Group",
      slug: "jah-construction",
      primaryMode: ProjectMode.VERTICAL,
      enabledModes: JSON.stringify([ProjectMode.SIMPLE, ProjectMode.VERTICAL, ProjectMode.HEAVY_CIVIL]),
      featurePacks: JSON.stringify([
        "job-thread",
        "rfis",
        "heavy-civil-production",
        "historical-bid-intelligence",
        "approvals",
        "notifications",
      ]),
      terminology: JSON.stringify({ project: "Project", thread: "Job Thread", observation: "Punch Item" }),
      brandingTheme: "slate-gold",
    },
  });

  const [commercial, civil] = await Promise.all([
    prisma.businessUnit.create({ data: { tenantId: tenant.id, name: "Commercial Buildings", code: "COMM", defaultMode: ProjectMode.VERTICAL, region: "Southeast" } }),
    prisma.businessUnit.create({ data: { tenantId: tenant.id, name: "Heavy Civil", code: "CIVIL", defaultMode: ProjectMode.HEAVY_CIVIL, region: "Carolinas" } }),
  ]);

  await prisma.membership.createMany({
    data: [
      { tenantId: tenant.id, userId: admin.id, businessUnitId: commercial.id, roleTemplate: UserRoleTemplate.ADMIN },
      { tenantId: tenant.id, userId: exec.id, businessUnitId: commercial.id, roleTemplate: UserRoleTemplate.EXECUTIVE },
      { tenantId: tenant.id, userId: pm.id, businessUnitId: commercial.id, roleTemplate: UserRoleTemplate.MANAGER },
      { tenantId: tenant.id, userId: superintendent.id, businessUnitId: civil.id, roleTemplate: UserRoleTemplate.SUPERINTENDENT },
    ],
  });

  await prisma.notificationRule.createMany({
    data: [
      { tenantId: tenant.id, name: "RFI overdue escalation", roleTemplate: UserRoleTemplate.MANAGER, triggerType: "RFI_OVERDUE", delivery: "in-app+email", cadence: "hourly", slaHours: 24, configJson: JSON.stringify({ escalateTo: ["MANAGER", "EXECUTIVE"] }) },
      { tenantId: tenant.id, name: "Submittal digest", roleTemplate: UserRoleTemplate.PROJECT_ENGINEER, triggerType: "SUBMITTAL_DIGEST", delivery: "digest", cadence: "daily", slaHours: 12, configJson: JSON.stringify({ includeStatuses: ["UNDER_REVIEW", "REJECTED"] }) },
      { tenantId: tenant.id, name: "Heavy civil production alert", roleTemplate: UserRoleTemplate.SUPERINTENDENT, triggerType: "PRODUCTION_UNDERRUN", delivery: "in-app+sms", cadence: "instant", slaHours: 2, configJson: JSON.stringify({ thresholdPct: 15 }) },
    ],
  });

  await prisma.historicalEstimate.createMany({
    data: [
      { tenantId: tenant.id, mode: ProjectMode.VERTICAL, title: "Mid-rise multifamily shell benchmark", projectType: "Multifamily", geography: "Charleston", lineItemCode: "033000", unitCost: 182, confidencePct: 78, metadataJson: JSON.stringify({ assembly: "Concrete frame", source: "historical bid library" }) },
      { tenantId: tenant.id, mode: ProjectMode.HEAVY_CIVIL, title: "12in DIP utility install benchmark", projectType: "Water / Sewer", geography: "Lowcountry", lineItemCode: "P-014", unitCost: 275, productionRate: 54, confidencePct: 81, metadataJson: JSON.stringify({ activity: "Pipe install", source: "production history" }) },
    ],
  });

  const ownerCompany = await prisma.company.create({
    data: { tenantId: tenant.id, name: "Atlantic Development Partners", companyType: "Owner", market: "Multifamily", region: "Charleston" },
  });
  await prisma.contact.createMany({
    data: [
      { tenantId: tenant.id, companyId: ownerCompany.id, name: "Taylor Reed", email: "treed@atlantic.example", roleTitle: "Owner Rep" },
      { tenantId: tenant.id, name: "Jordan Cruz", email: "jcruz@gc.example", roleTitle: "Project Engineer" },
    ],
  });

  await prisma.workflowTemplate.createMany({
    data: [
      { tenantId: tenant.id, name: "Vertical Startup", mode: ProjectMode.VERTICAL, module: "project-core", configJson: JSON.stringify({ rfis: true, submittals: true, drawings: true, closeoutChecklist: true }) },
      { tenantId: tenant.id, name: "Heavy Civil Daily Production", mode: ProjectMode.HEAVY_CIVIL, module: "field-operations", configJson: JSON.stringify({ tickets: true, quantities: true, equipment: true, locationTags: true }) },
      { tenantId: tenant.id, name: "Simple Remodel Launch", mode: ProjectMode.SIMPLE, module: "job-thread", configJson: JSON.stringify({ homeownerPortal: true, punchList: true, approvalsInline: true }) },
    ],
  });

  const projects = await Promise.all([
    prisma.project.create({
      data: {
        tenantId: tenant.id,
        businessUnitId: commercial.id,
        name: "Harbor Point Residences",
        code: "HPR-001",
        mode: ProjectMode.VERTICAL,
        stage: ProjectStage.ACTIVE,
        address: "12 Cooper St, Charleston, SC",
        ownerName: ownerCompany.name,
        contractType: "GMP",
        contractValue: 28500000,
        marginTargetPct: 12.5,
        progressPct: 41,
        healthScore: 82,
        startDate: new Date("2026-02-01"),
        endDate: new Date("2027-06-15"),
        configurationJson: JSON.stringify({ dashboard: "vertical", aiBootstrapEnabled: true, requiredForms: ["RFI", "Submittal", "Meeting Minutes"], engagement: { ownerPortal: true, formalApprovals: true } }),
      },
    }),
    prisma.project.create({
      data: {
        tenantId: tenant.id,
        businessUnitId: civil.id,
        name: "Ravenel Utility Package A",
        code: "RUPA-101",
        mode: ProjectMode.HEAVY_CIVIL,
        stage: ProjectStage.ACTIVE,
        address: "Ravenel, SC",
        ownerName: "Charleston County",
        contractType: "Unit Price",
        contractValue: 9200000,
        marginTargetPct: 10.2,
        progressPct: 58,
        healthScore: 76,
        startDate: new Date("2026-01-15"),
        endDate: new Date("2026-11-20"),
        configurationJson: JSON.stringify({ dashboard: "heavy-civil", locationTracking: true, ticketReconciliation: true, aiBootstrapEnabled: true, engagement: { fieldFirst: true, supervisorEscalation: true } }),
      },
    }),
    prisma.project.create({
      data: {
        tenantId: tenant.id,
        businessUnitId: commercial.id,
        name: "Sullivan Kitchen Remodel",
        code: "SKR-014",
        mode: ProjectMode.SIMPLE,
        stage: ProjectStage.ACTIVE,
        address: "Sullivan's Island, SC",
        ownerName: "Private Client",
        contractType: "Lump Sum",
        contractValue: 185000,
        marginTargetPct: 18,
        progressPct: 64,
        healthScore: 91,
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-05-15"),
        configurationJson: JSON.stringify({ dashboard: "simple", clientPortal: true, subthreads: ["Selections", "Schedule", "Punch"], engagement: { fastApprovals: true, homeownerUpdates: true } }),
      },
    }),
  ]);

  for (const project of projects) {
    const generalThread = await prisma.thread.create({
      data: {
        projectId: project.id,
        title: `${project.name} Job Thread`,
        channel: ThreadChannel.GENERAL,
        isDefault: true,
      },
    });

    const workflowRun = await prisma.workflowRun.create({
      data: {
        projectId: project.id,
        templateName: project.mode === ProjectMode.VERTICAL ? "Vertical Startup" : project.mode === ProjectMode.HEAVY_CIVIL ? "Heavy Civil Daily Production" : "Simple Remodel Launch",
        module: project.mode === ProjectMode.SIMPLE ? "job-thread" : project.mode === ProjectMode.VERTICAL ? "technical-workflows" : "field-operations",
        status: WorkflowStatus.UNDER_REVIEW,
        payloadJson: JSON.stringify({ seeded: true, mode: project.mode }),
      },
    });

    await prisma.watcher.createMany({
      data: [
        { projectId: project.id, workflowRunId: workflowRun.id, userId: pm.id, channel: "email", objectType: "Project", objectId: project.id, required: true },
        { projectId: project.id, workflowRunId: workflowRun.id, userId: superintendent.id, channel: "in-app", objectType: "WorkflowRun", objectId: workflowRun.id, required: project.mode === ProjectMode.HEAVY_CIVIL },
      ],
    });

    await prisma.approvalRoute.create({
      data: {
        projectId: project.id,
        targetType: project.mode === ProjectMode.SIMPLE ? "ChangeOrder" : project.mode === ProjectMode.VERTICAL ? "SubmittalPackage" : "ProductionException",
        targetId: workflowRun.id,
        name: `${project.name} ${project.mode} approval route`,
        status: WorkflowStatus.UNDER_REVIEW,
        approverRole: project.mode === ProjectMode.HEAVY_CIVIL ? UserRoleTemplate.SUPERINTENDENT : UserRoleTemplate.MANAGER,
        stepsJson: JSON.stringify([
          { order: 1, role: "MANAGER", action: "review" },
          { order: 2, role: project.mode === ProjectMode.SIMPLE ? "EXECUTIVE" : "SUPERINTENDENT", action: "approve" },
        ]),
      },
    });

    await prisma.threadMessage.createMany({
      data: [
        { threadId: generalThread.id, authorId: admin.id, body: `Project shell bootstrapped for ${project.mode} mode with tenant-aware defaults.`, pinned: true },
        { threadId: generalThread.id, authorId: pm.id, body: `Kickoff complete. Tracking next actions, documents, approvals, and user engagement in the default job thread.`, decisionFlag: true },
      ],
    });

    await prisma.task.createMany({
      data: [
        {
          projectId: project.id,
          title: project.mode === ProjectMode.VERTICAL ? "Publish drawing register" : project.mode === ProjectMode.HEAVY_CIVIL ? "Validate pay item structure" : "Confirm client finish selections",
          description: "Seeded from mode-specific startup template",
          status: TaskStatus.IN_PROGRESS,
          priority: "High",
          dueDate: new Date("2026-04-10"),
          assigneeId: pm.id,
          sourceType: "workflow-template",
        },
        {
          projectId: project.id,
          title: project.mode === ProjectMode.VERTICAL ? "Issue first submittal package" : project.mode === ProjectMode.HEAVY_CIVIL ? "Reconcile hauling tickets" : "Update homeowner daily summary",
          status: TaskStatus.TODO,
          priority: "Medium",
          dueDate: new Date("2026-04-12"),
          assigneeId: superintendent.id,
          sourceType: "job-thread",
        },
      ],
    });

    await prisma.document.createMany({
      data: [
        { projectId: project.id, title: `${project.code} Contract Overview`, documentClass: DocumentClass.CONTRACT, folderPath: "/contracts", metadataJson: JSON.stringify({ source: "seed", version: 1 }) },
        { projectId: project.id, title: `${project.code} Startup Package`, documentClass: project.mode === ProjectMode.VERTICAL ? DocumentClass.DRAWING : DocumentClass.OTHER, folderPath: "/startup", metadataJson: JSON.stringify({ aiBootstrapCandidate: true }) },
      ],
    });

    await prisma.dailyLog.create({
      data: {
        projectId: project.id,
        logDate: new Date("2026-04-07"),
        weather: project.mode === ProjectMode.HEAVY_CIVIL ? "68F, clear, low wind" : "72F, partly cloudy",
        summary: project.mode === ProjectMode.VERTICAL ? "Curtainwall coordination ongoing, MEP overhead rough-in on Levels 3-4." : project.mode === ProjectMode.HEAVY_CIVIL ? "Installed 420 LF of 12in water main, trucking balanced with utility conflict watch." : "Cabinet install 80% complete; owner approved backsplash options.",
        manpower: project.mode === ProjectMode.SIMPLE ? 8 : project.mode === ProjectMode.VERTICAL ? 64 : 27,
        notes: "Seeded daily report for dashboard demo.",
      },
    });

    const budget = await prisma.budget.create({
      data: {
        projectId: project.id,
        name: "Current Control Budget",
        originalValue: toNum(project.contractValue),
        currentValue: multiplyMoney(project.contractValue, 1.04),
        forecastFinal: multiplyMoney(project.contractValue, 1.03),
      },
    });

    await prisma.budgetLine.createMany({
      data: project.mode === ProjectMode.HEAVY_CIVIL
        ? [
            { budgetId: budget.id, code: "2010", description: "Earthwork / Excavation", lineType: BudgetLineType.COST_CODE, budgetAmount: 2200000, committedCost: 1900000, actualCost: 1280000 },
            { budgetId: budget.id, code: "P-014", description: "12in Water Main", lineType: BudgetLineType.PAY_ITEM, budgetAmount: 1450000, committedCost: 1300000, actualCost: 840000 },
          ]
        : [
            { budgetId: budget.id, code: "033000", description: project.mode === ProjectMode.VERTICAL ? "Cast-in-place concrete" : "Cabinet and finish package", lineType: BudgetLineType.COST_CODE, budgetAmount: project.mode === ProjectMode.VERTICAL ? 5200000 : 74000, committedCost: project.mode === ProjectMode.VERTICAL ? 4800000 : 61000, actualCost: project.mode === ProjectMode.VERTICAL ? 2600000 : 42000 },
            { budgetId: budget.id, code: "CO-001", description: "Owner-directed changes", lineType: BudgetLineType.ALLOWANCE, budgetAmount: project.mode === ProjectMode.VERTICAL ? 350000 : 12000, committedCost: project.mode === ProjectMode.VERTICAL ? 120000 : 7000, actualCost: project.mode === ProjectMode.VERTICAL ? 82000 : 5000 },
          ],
    });

    if (project.mode !== ProjectMode.SIMPLE) {
      await prisma.rFI.create({
        data: {
          projectId: project.id,
          number: project.mode === ProjectMode.VERTICAL ? "RFI-012" : "RFI-CIV-004",
          subject: project.mode === ProjectMode.VERTICAL ? "Curtainwall embed elevation conflict" : "Utility crossing depth clarification",
          status: WorkflowStatus.UNDER_REVIEW,
          dueDate: new Date("2026-04-11"),
          ballInCourt: "Design Team",
        },
      });

      const now = new Date();
      const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
      const subPrefix = project.mode === ProjectMode.VERTICAL ? "SUB" : "SUB-CIV";
      // A spread of ball-in-court states so the register/aging dashboard
      // shows reviewer-held (overdue), contractor-held, and closed rows.
      await prisma.submittal.create({
        data: {
          projectId: project.id,
          number: `${subPrefix}-033`,
          title: project.mode === ProjectMode.VERTICAL ? "Storefront system" : "Ductile iron pipe and fittings",
          specSection: project.mode === ProjectMode.VERTICAL ? "084113" : "331111",
          status: WorkflowStatus.UNDER_REVIEW,
          longLead: project.mode === ProjectMode.VERTICAL,
          currentReviewerEmail: "architect@designteam.example.com",
          sentToReviewerAt: daysAgo(21),
          submittedAt: daysAgo(22),
          submittedBy: "Paula PM",
        },
      });
      await prisma.submittal.create({
        data: {
          projectId: project.id,
          number: `${subPrefix}-034`,
          title: project.mode === ProjectMode.VERTICAL ? "Elevator shop drawings" : "Precast manhole structures",
          specSection: project.mode === ProjectMode.VERTICAL ? "142100" : "334100",
          status: WorkflowStatus.UNDER_REVIEW,
          longLead: true,
          currentReviewerEmail: "engineer@designteam.example.com",
          sentToReviewerAt: daysAgo(6),
          submittedAt: daysAgo(7),
          submittedBy: "Paula PM",
        },
      });
      await prisma.submittal.create({
        data: {
          projectId: project.id,
          number: `${subPrefix}-035`,
          title: project.mode === ProjectMode.VERTICAL ? "Curtainwall samples" : "Pipe bedding gradation",
          specSection: project.mode === ProjectMode.VERTICAL ? "084413" : "312323",
          status: WorkflowStatus.REJECTED,
          resubmittalCount: 1,
          rejectedAt: daysAgo(18),
          rejectedBy: "architect@designteam.example.com",
          rejectionReason: "Revise and resubmit — finish does not match approved sample.",
          updatedAt: daysAgo(18),
        },
      });
      await prisma.submittal.create({
        data: {
          projectId: project.id,
          number: `${subPrefix}-031`,
          title: project.mode === ProjectMode.VERTICAL ? "Concrete mix design" : "Aggregate base mix design",
          specSection: project.mode === ProjectMode.VERTICAL ? "033000" : "320111",
          status: WorkflowStatus.APPROVED,
          submittedAt: daysAgo(40),
          submittedBy: "Paula PM",
          approvedAt: daysAgo(33),
          approvedBy: "engineer@designteam.example.com",
        },
      });
    }

    if (project.mode === ProjectMode.HEAVY_CIVIL) {
      await prisma.quantityBudget.createMany({
        data: [
          { projectId: project.id, code: "P-014", description: "12in Water Main", unit: "LF", budgetQty: 5200, installedQty: 3010, earnedQty: 2890, locationTag: "STA 10+00 to 41+20" },
          { projectId: project.id, code: "P-021", description: "Manhole Structure", unit: "EA", budgetQty: 18, installedQty: 10, earnedQty: 10, locationTag: "Segment B" },
        ],
      });

      await prisma.productionEntry.createMany({
        data: [
          { projectId: project.id, activity: "12in DIP install", crewName: "Pipe Crew 1", installedQty: 420, unit: "LF", productionRate: 52.5, equipmentHours: 18, locationTag: "STA 24+00 to 28+20" },
          { projectId: project.id, activity: "Backfill and compaction", crewName: "Earthwork Crew", installedQty: 380, unit: "CY", productionRate: 47.5, equipmentHours: 12, locationTag: "Segment B" },
        ],
      });

      await prisma.ticket.createMany({
        data: [
          { projectId: project.id, ticketNumber: "T-24017", materialType: "Fill Sand", quantity: 24, unit: "TON", source: "Ladson Quarry", destination: "Segment B" },
          { projectId: project.id, ticketNumber: "T-24018", materialType: "12in DIP", quantity: 420, unit: "LF", source: "Pipe Yard", destination: "STA 24+00" },
        ],
      });

      await prisma.equipmentRecord.createMany({
        data: [
          { projectId: project.id, equipmentCode: "EX-210", description: "Cat 320 Excavator", ownershipType: "Owned", assignedCrew: "Pipe Crew 1", utilizationHours: 8.5, status: "Active" },
          { projectId: project.id, equipmentCode: "RL-014", description: "Compaction Roller", ownershipType: "Rented", assignedCrew: "Earthwork Crew", utilizationHours: 6.25, status: "Active" },
        ],
      });

      await prisma.materialRecord.createMany({
        data: [
          { projectId: project.id, materialType: "Fill Sand", quantity: 24, unit: "TON", status: "Received", source: "Ladson Quarry", locationTag: "Segment B" },
          { projectId: project.id, materialType: "12in Ductile Iron Pipe", quantity: 420, unit: "LF", status: "Installed", source: "Pipe Yard", locationTag: "STA 24+00 to 28+20" },
        ],
      });
    }

    if (project.mode === ProjectMode.VERTICAL) {
      await prisma.meeting.create({
        data: {
          projectId: project.id,
          title: "OAC Coordination Meeting",
          meetingType: "OAC",
          scheduledAt: new Date("2026-04-09T14:00:00Z"),
          notes: "Submittal aging, procurement risks, and Level 4 rough-in coordination.",
        },
      });
    }

    await seedFinancialsAndSchedule(project, { pmId: pm.id, superintendentId: superintendent.id });
    await seedLifecycle(project, tenant.id);
    await seedPermitsForProject(project);
    await seedRfpSourcesForTenant(tenant.id, "SC");

    await prisma.auditEvent.create({
      data: {
        tenantId: tenant.id,
        actorId: admin.id,
        entityType: "Project",
        entityId: project.id,
        action: "SEEDED",
        afterJson: JSON.stringify({ mode: project.mode, stage: project.stage }),
        source: "prisma-seed",
      },
    });
  }

  await seedNewModuleSampleData({ tenantId: tenant.id, projects, adminUserId: admin.id, pmUserName: pm.name });

  // Additional tenants — one Simple-first (residential remodel focused), one Heavy Civil-first (infrastructure).
  await seedExtraTenant({
    name: "Velocity Demo Co.",
    slug: "velocity-demo",
    primaryMode: ProjectMode.SIMPLE,
    enabledModes: [ProjectMode.SIMPLE, ProjectMode.VERTICAL],
    brandingTheme: "charcoal-teal",
    businessUnits: [
      { name: "Residential", code: "RES", defaultMode: ProjectMode.SIMPLE, region: "Charleston" },
      { name: "Small Commercial", code: "SMC", defaultMode: ProjectMode.VERTICAL, region: "Charleston" },
    ],
    ownerCompany: { name: "Kiawah Private Clients", companyType: "Owner", market: "Residential" },
    projects: [
      { name: "Harborview Custom Residence", code: "HCR-001", mode: ProjectMode.SIMPLE, contractValue: 2850000, ownerName: "Private Client A", contractType: "Cost Plus" },
      { name: "Sullivan Beach House Renovation", code: "SBH-002", mode: ProjectMode.SIMPLE, contractValue: 485000, ownerName: "Private Client B", contractType: "Lump Sum" },
      { name: "Main Street Retail Buildout", code: "MSRB-003", mode: ProjectMode.VERTICAL, contractValue: 1250000, ownerName: "Charleston Retail LLC", contractType: "GMP" },
    ],
    admin: admin,
    userForPm: pm,
    userForSuper: superintendent,
  });

  await seedExtraTenant({
    name: "Palmetto Civil Infrastructure",
    slug: "palmetto-civil",
    primaryMode: ProjectMode.HEAVY_CIVIL,
    enabledModes: [ProjectMode.HEAVY_CIVIL, ProjectMode.VERTICAL],
    brandingTheme: "midnight-amber",
    businessUnits: [
      { name: "Utilities", code: "UTIL", defaultMode: ProjectMode.HEAVY_CIVIL, region: "Lowcountry" },
      { name: "DOT & Roadway", code: "DOT", defaultMode: ProjectMode.HEAVY_CIVIL, region: "Lowcountry" },
      { name: "Vertical Structures", code: "VRTS", defaultMode: ProjectMode.VERTICAL, region: "Lowcountry" },
    ],
    ownerCompany: { name: "SCDOT District 6", companyType: "Owner", market: "Infrastructure" },
    projects: [
      { name: "Highway 17 Overlay Phase A", code: "H17A-101", mode: ProjectMode.HEAVY_CIVIL, contractValue: 6400000, ownerName: "SCDOT", contractType: "Unit Price" },
      { name: "Mount Pleasant Water Main Ext", code: "MPWM-211", mode: ProjectMode.HEAVY_CIVIL, contractValue: 2900000, ownerName: "Mount Pleasant Water", contractType: "Unit Price" },
      { name: "North Charleston Operations Facility", code: "NCOF-301", mode: ProjectMode.VERTICAL, contractValue: 11500000, ownerName: "North Charleston", contractType: "Design-Build" },
    ],
    admin: admin,
    userForPm: pm,
    userForSuper: superintendent,
  });

  // Seed the global solicitation-portal catalog. Idempotent (upsert by
  // URL) so re-running won't disturb live RfpSource subscriptions that
  // reference catalog rows.
  const { upsertPortalCatalog } = await import("./portal-catalog");
  const { created, updated } = await upsertPortalCatalog(prisma);
  console.log(`portal catalog: ${created} created, ${updated} updated`);

  // Seed Charleston-area municipal inspection portal catalog. Idempotent
  // upsert by slug. Adapter routing in /lib/jurisdictions/registry.ts
  // keys off these slugs.
  const { CHARLESTON_PORTAL_CATALOG } = await import("../src/lib/jurisdictions/registry");
  let portalsCreated = 0;
  let portalsUpdated = 0;
  for (const p of CHARLESTON_PORTAL_CATALOG) {
    const existing = await prisma.jurisdictionPortal.findUnique({ where: { slug: p.slug } });
    if (existing) {
      await prisma.jurisdictionPortal.update({ where: { slug: p.slug }, data: p });
      portalsUpdated += 1;
    } else {
      await prisma.jurisdictionPortal.create({ data: p });
      portalsCreated += 1;
    }
  }
  console.log(`jurisdiction portal catalog: ${portalsCreated} created, ${portalsUpdated} updated`);

  // Demo: give Velocity Demo Co. account stubs for every Charleston-area
  // portal so the cron run + UI have something to show out of the box.
  // Credentials are intentionally left null (NO_CREDS branch) — they get
  // populated through /settings/jurisdictions in the live app.
  const velocityTenant = await prisma.tenant.findUnique({ where: { slug: "velocity-demo" } });
  if (velocityTenant) {
    const portals = await prisma.jurisdictionPortal.findMany();
    for (const portal of portals) {
      await prisma.tenantJurisdictionAccount.upsert({
        where: { tenantId_portalId: { tenantId: velocityTenant.id, portalId: portal.id } },
        update: {},
        create: {
          tenantId: velocityTenant.id,
          portalId: portal.id,
          active: true,
          accountLabel: "demo (no credentials configured)",
        },
      });
    }
  }
}

type ExtraTenantSpec = {
  name: string;
  slug: string;
  primaryMode: ProjectMode;
  enabledModes: ProjectMode[];
  brandingTheme: string;
  businessUnits: Array<{ name: string; code: string; defaultMode: ProjectMode; region: string }>;
  ownerCompany: { name: string; companyType: string; market: string };
  projects: Array<{ name: string; code: string; mode: ProjectMode; contractValue: number; ownerName: string; contractType: string }>;
  admin: { id: string };
  userForPm: { id: string };
  userForSuper: { id: string };
};

async function seedExtraTenant(spec: ExtraTenantSpec) {
  const tenant = await prisma.tenant.create({
    data: {
      name: spec.name,
      slug: spec.slug,
      primaryMode: spec.primaryMode,
      enabledModes: JSON.stringify(spec.enabledModes),
      featurePacks: JSON.stringify(["job-thread", "approvals", "notifications"]),
      terminology: JSON.stringify({ project: "Project", thread: "Job Thread" }),
      brandingTheme: spec.brandingTheme,
    },
  });

  const units = await Promise.all(spec.businessUnits.map((bu) =>
    prisma.businessUnit.create({ data: { tenantId: tenant.id, ...bu } })
  ));
  const primaryUnit = units[0];

  await prisma.membership.createMany({
    data: [
      { tenantId: tenant.id, userId: spec.admin.id, businessUnitId: primaryUnit.id, roleTemplate: UserRoleTemplate.ADMIN },
      { tenantId: tenant.id, userId: spec.userForPm.id, businessUnitId: primaryUnit.id, roleTemplate: UserRoleTemplate.MANAGER },
      { tenantId: tenant.id, userId: spec.userForSuper.id, businessUnitId: units[1]?.id ?? primaryUnit.id, roleTemplate: UserRoleTemplate.SUPERINTENDENT },
    ],
  });

  const ownerCompany = await prisma.company.create({
    data: { tenantId: tenant.id, name: spec.ownerCompany.name, companyType: spec.ownerCompany.companyType, market: spec.ownerCompany.market, region: spec.businessUnits[0].region },
  });

  const today = new Date();
  for (let i = 0; i < spec.projects.length; i++) {
    const p = spec.projects[i];
    const unit = units.find((u) => u.defaultMode === p.mode) ?? primaryUnit;
    const start = new Date(today.getTime() - (60 + i * 30) * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 365 * 24 * 60 * 60 * 1000);
    const project = await prisma.project.create({
      data: {
        tenantId: tenant.id,
        businessUnitId: unit.id,
        name: p.name,
        code: p.code,
        mode: p.mode,
        stage: ProjectStage.ACTIVE,
        address: `${spec.businessUnits[0].region}, SC`,
        ownerName: p.ownerName,
        contractType: p.contractType,
        contractValue: p.contractValue,
        marginTargetPct: 11,
        progressPct: 20 + i * 15,
        healthScore: 80,
        startDate: start,
        endDate: end,
        configurationJson: JSON.stringify({ dashboard: p.mode.toLowerCase().replace("_", "-") }),
      },
    });

    const thread = await prisma.thread.create({ data: { projectId: project.id, title: `${project.name} Job Thread`, channel: ThreadChannel.GENERAL, isDefault: true } });
    await prisma.threadMessage.create({
      data: { threadId: thread.id, authorId: spec.admin.id, body: `Tenant ${tenant.name} seeded project ${project.name} in ${p.mode} mode.`, pinned: true },
    });

    await prisma.task.create({
      data: {
        projectId: project.id,
        title: p.mode === ProjectMode.SIMPLE ? "Confirm client selections" : p.mode === ProjectMode.VERTICAL ? "Publish drawing register" : "Validate pay item structure",
        status: TaskStatus.IN_PROGRESS,
        priority: "High",
        dueDate: new Date(start.getTime() + 60 * 24 * 60 * 60 * 1000),
        assigneeId: spec.userForPm.id,
        sourceType: "extra-tenant-seed",
      },
    });

    const budget = await prisma.budget.create({
      data: {
        projectId: project.id,
        name: "Current Control Budget",
        originalValue: p.contractValue,
        currentValue: p.contractValue * 1.03,
        forecastFinal: p.contractValue * 1.02,
      },
    });
    await prisma.budgetLine.createMany({
      data: [
        { budgetId: budget.id, code: p.mode === ProjectMode.HEAVY_CIVIL ? "P-014" : "033000", description: p.mode === ProjectMode.HEAVY_CIVIL ? "12in water main" : "Shell construction", lineType: BudgetLineType.COST_CODE, budgetAmount: p.contractValue * 0.35, committedCost: p.contractValue * 0.28, actualCost: p.contractValue * 0.12 },
        { budgetId: budget.id, code: "GC", description: "General conditions", lineType: BudgetLineType.COST_CODE, budgetAmount: p.contractValue * 0.12, committedCost: p.contractValue * 0.09, actualCost: p.contractValue * 0.05 },
      ],
    });

    await prisma.dailyLog.create({
      data: {
        projectId: project.id,
        logDate: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000),
        weather: "70F clear",
        summary: `Daily production report — ${p.mode.toLowerCase()} scope ongoing.`,
        manpower: p.mode === ProjectMode.SIMPLE ? 6 : p.mode === ProjectMode.VERTICAL ? 32 : 18,
      },
    });

    await prisma.document.create({
      data: { projectId: project.id, title: `${p.code} Contract Cover Sheet`, documentClass: DocumentClass.CONTRACT, folderPath: "/contracts", metadataJson: JSON.stringify({ source: "extra-tenant-seed" }) },
    });

    await seedFinancialsAndSchedule({ ...project, contractValue: p.contractValue }, { pmId: spec.userForPm.id, superintendentId: spec.userForSuper.id });
    await seedLifecycle({ ...project, contractValue: p.contractValue }, tenant.id);
    await seedPermitsForProject(project);
    await seedRfpSourcesForTenant(tenant.id, "SC");

    await prisma.auditEvent.create({
      data: {
        tenantId: tenant.id,
        actorId: spec.admin.id,
        entityType: "Project",
        entityId: project.id,
        action: "SEEDED",
        afterJson: JSON.stringify({ mode: project.mode, stage: project.stage }),
        source: "extra-tenant-seed",
      },
    });
  }

  void ownerCompany;
}

async function seedFinancialsAndSchedule(project: { id: string; name: string; code: string; contractValue: number | { toNumber: () => number } | null; mode: ProjectMode; startDate: Date | null; endDate: Date | null }, users: { pmId: string; superintendentId: string }) {
  // Contract + commitments
  const primeContract = await prisma.contract.create({
    data: {
      projectId: project.id,
      counterparty: project.mode === ProjectMode.SIMPLE ? "Private Client" : "Atlantic Development Partners",
      contractNumber: `${project.code}-PRIME`,
      title: `${project.name} — Prime Owner Contract`,
      type: ContractType.PRIME_OWNER,
      status: ContractStatus.ACTIVE,
      originalValue: toNum(project.contractValue),
      currentValue: multiplyMoney(project.contractValue, 1.04),
      retainagePct: 10,
      startDate: project.startDate,
      endDate: project.endDate,
      executedAt: project.startDate,
      notes: "Seeded prime contract linking budgets, CO log, and pay applications.",
    },
  });

  const subCounterparty = project.mode === ProjectMode.HEAVY_CIVIL ? "Atlantic Underground LLC" : project.mode === ProjectMode.VERTICAL ? "Coastal Concrete Co" : "Lowcountry Finish Carpentry";
  const subContract = await prisma.contract.create({
    data: {
      projectId: project.id,
      counterparty: subCounterparty,
      contractNumber: `${project.code}-SUB-001`,
      title: `${subCounterparty} — Scope Subcontract`,
      type: ContractType.SUBCONTRACT,
      status: ContractStatus.ACTIVE,
      originalValue: multiplyMoney(project.contractValue, 0.32),
      currentValue: multiplyMoney(project.contractValue, 0.33),
      retainagePct: 10,
      startDate: project.startDate,
      endDate: project.endDate,
      executedAt: project.startDate,
    },
  });

  const primeCurrentValue = toNum(primeContract.currentValue);
  const primeOriginalValue = toNum(primeContract.originalValue);
  const subCurrentValue = toNum(subContract.currentValue);
  await prisma.contractCommitment.createMany({
    data: [
      { contractId: primeContract.id, costCode: "ZZ-PRIME", description: "Overall contract commitment", committedAmount: primeCurrentValue, invoicedToDate: multiplyMoney(primeCurrentValue, 0.42), paidToDate: multiplyMoney(primeCurrentValue, 0.38) },
      { contractId: subContract.id, costCode: project.mode === ProjectMode.HEAVY_CIVIL ? "P-014" : "033000", description: project.mode === ProjectMode.HEAVY_CIVIL ? "12in Water main install" : "Structural concrete scope", committedAmount: subCurrentValue, invoicedToDate: multiplyMoney(subCurrentValue, 0.45), paidToDate: multiplyMoney(subCurrentValue, 0.40) },
    ],
  });

  // Change orders
  const co1 = await prisma.changeOrder.create({
    data: {
      projectId: project.id,
      coNumber: "CO-001",
      kind: ChangeOrderKind.OCO,
      title: project.mode === ProjectMode.VERTICAL ? "Owner-directed storefront upgrade" : project.mode === ProjectMode.HEAVY_CIVIL ? "Additional utility crossing (field-directed)" : "Homeowner requested upgraded cabinetry",
      description: "Seeded change order for MVP demo.",
      reason: "OWNER_REQUEST",
      amount: project.mode === ProjectMode.VERTICAL ? 185000 : project.mode === ProjectMode.HEAVY_CIVIL ? 42000 : 8500,
      markupPct: 12,
      scheduleImpactDays: project.mode === ProjectMode.HEAVY_CIVIL ? 6 : 0,
      status: ChangeOrderStatus.APPROVED,
      requestedById: users.pmId,
      approvedById: users.pmId,
      requestedAt: new Date("2026-03-15"),
      approvedAt: new Date("2026-03-22"),
      executedAt: new Date("2026-03-28"),
    },
  });

  await prisma.changeOrderLine.createMany({
    data: [
      { changeOrderId: co1.id, costCode: "LAB", description: "Labor impact", category: "LABOR", quantity: project.mode === ProjectMode.VERTICAL ? 420 : project.mode === ProjectMode.HEAVY_CIVIL ? 96 : 24, unit: "HR", unitCost: project.mode === ProjectMode.VERTICAL ? 165 : 110, amount: (project.mode === ProjectMode.VERTICAL ? 420 : project.mode === ProjectMode.HEAVY_CIVIL ? 96 : 24) * (project.mode === ProjectMode.VERTICAL ? 165 : 110) },
      { changeOrderId: co1.id, costCode: "MAT", description: "Materials", category: "MATERIAL", quantity: 1, unit: "LS", unitCost: project.mode === ProjectMode.VERTICAL ? 105000 : project.mode === ProjectMode.HEAVY_CIVIL ? 25000 : 4200, amount: project.mode === ProjectMode.VERTICAL ? 105000 : project.mode === ProjectMode.HEAVY_CIVIL ? 25000 : 4200 },
    ],
  });

  const co2 = await prisma.changeOrder.create({
    data: {
      projectId: project.id,
      coNumber: "CO-002",
      kind: ChangeOrderKind.PCO,
      title: project.mode === ProjectMode.VERTICAL ? "Mechanical rerouting (PCO)" : project.mode === ProjectMode.HEAVY_CIVIL ? "Unforeseen rock excavation" : "Structural header revision",
      description: "Potential change order under review.",
      reason: "FIELD_CONDITION",
      amount: project.mode === ProjectMode.HEAVY_CIVIL ? 96500 : 38000,
      markupPct: 10,
      scheduleImpactDays: project.mode === ProjectMode.HEAVY_CIVIL ? 4 : 1,
      status: ChangeOrderStatus.PENDING,
      requestedById: users.pmId,
      requestedAt: new Date("2026-04-01"),
    },
  });
  void co2;

  // Schedule tasks (simple WBS)
  const scheduleSeed = project.mode === ProjectMode.VERTICAL
    ? [
        { wbs: "1", name: "Preconstruction", startOffset: 0, durationDays: 30, parentIndex: null, milestone: false },
        { wbs: "2", name: "Substructure", startOffset: 30, durationDays: 60, parentIndex: null, milestone: false },
        { wbs: "2.1", name: "Foundations", startOffset: 30, durationDays: 35, parentIndex: 1, milestone: false },
        { wbs: "2.2", name: "Waterproofing", startOffset: 65, durationDays: 25, parentIndex: 1, milestone: false },
        { wbs: "3", name: "Superstructure", startOffset: 90, durationDays: 180, parentIndex: null, milestone: false },
        { wbs: "4", name: "Topping Out", startOffset: 270, durationDays: 0, parentIndex: null, milestone: true },
        { wbs: "5", name: "MEP Rough", startOffset: 150, durationDays: 120, parentIndex: null, milestone: false },
        { wbs: "6", name: "Finishes & Closeout", startOffset: 270, durationDays: 140, parentIndex: null, milestone: false },
      ]
    : project.mode === ProjectMode.HEAVY_CIVIL
    ? [
        { wbs: "1", name: "Mobilization", startOffset: 0, durationDays: 10, parentIndex: null, milestone: false },
        { wbs: "2", name: "Erosion control & clearing", startOffset: 10, durationDays: 14, parentIndex: null, milestone: false },
        { wbs: "3", name: "Utility install — water main", startOffset: 24, durationDays: 90, parentIndex: null, milestone: false },
        { wbs: "4", name: "Backfill & compaction", startOffset: 60, durationDays: 70, parentIndex: null, milestone: false },
        { wbs: "5", name: "Pavement restoration", startOffset: 130, durationDays: 35, parentIndex: null, milestone: false },
        { wbs: "6", name: "Substantial completion", startOffset: 170, durationDays: 0, parentIndex: null, milestone: true },
      ]
    : [
        { wbs: "1", name: "Demolition", startOffset: 0, durationDays: 5, parentIndex: null, milestone: false },
        { wbs: "2", name: "Rough-in (electrical + plumbing)", startOffset: 5, durationDays: 10, parentIndex: null, milestone: false },
        { wbs: "3", name: "Cabinet install", startOffset: 15, durationDays: 7, parentIndex: null, milestone: false },
        { wbs: "4", name: "Countertops & backsplash", startOffset: 22, durationDays: 6, parentIndex: null, milestone: false },
        { wbs: "5", name: "Punch & walkthrough", startOffset: 28, durationDays: 3, parentIndex: null, milestone: false },
        { wbs: "6", name: "Project complete", startOffset: 35, durationDays: 0, parentIndex: null, milestone: true },
      ];

  const baseStart = project.startDate ?? new Date();
  const createdTasks: Array<{ id: string; idx: number }> = [];
  for (let i = 0; i < scheduleSeed.length; i++) {
    const row = scheduleSeed[i];
    const parentTaskId = row.parentIndex !== null ? createdTasks[row.parentIndex]?.id : null;
    const start = new Date(baseStart.getTime() + row.startOffset * 24 * 3600 * 1000);
    const end = new Date(start.getTime() + Math.max(row.durationDays, 1) * 24 * 3600 * 1000);
    const task = await prisma.scheduleTask.create({
      data: {
        projectId: project.id,
        parentId: parentTaskId ?? null,
        wbs: row.wbs,
        name: row.name,
        startDate: start,
        endDate: end,
        durationDays: row.durationDays,
        isMilestone: row.milestone,
        onCriticalPath: !row.milestone && i < scheduleSeed.length - 1,
        baselineStart: start,
        baselineEnd: end,
        percentComplete: i <= 2 ? 100 : i <= 4 ? 55 : i <= 5 ? 15 : 0,
        responsible: row.milestone ? "Project Manager" : i % 2 === 0 ? "Superintendent" : "Foreman",
      },
    });
    createdTasks.push({ id: task.id, idx: i });
  }
  for (let i = 0; i < createdTasks.length - 1; i++) {
    const next = createdTasks[i + 1];
    if (!next) continue;
    await prisma.scheduleDependency.create({
      data: {
        predecessorId: createdTasks[i].id,
        successorId: next.id,
        type: ScheduleDependencyType.FS,
        lagDays: 0,
      },
    });
  }

  // Pay Application
  const periodFrom = new Date("2026-04-01");
  const periodTo = new Date("2026-04-30");
  const scheduledValue = primeCurrentValue;
  const workCompletedPrev = multiplyMoney(scheduledValue, 0.32);
  const workCompletedThis = multiplyMoney(scheduledValue, 0.08);
  const totalCompleted = addMoney(workCompletedPrev, workCompletedThis);
  const retainageHeld = multiplyMoney(totalCompleted, 0.10);
  const currentPaymentDue = sumMoney([multiplyMoney(totalCompleted, 0.90), -workCompletedPrev]);
  const payApp = await prisma.payApplication.create({
    data: {
      projectId: project.id,
      contractId: primeContract.id,
      periodNumber: 1,
      periodFrom,
      periodTo,
      status: PayApplicationStatus.SUBMITTED,
      originalContractValue: primeOriginalValue,
      changeOrderValue: sumMoney([primeCurrentValue, -primeOriginalValue]),
      totalContractValue: primeCurrentValue,
      workCompletedToDate: totalCompleted,
      materialsStoredToDate: 0,
      retainagePct: 10,
      retainageHeld,
      lessPreviousPayments: multiplyMoney(workCompletedPrev, 0.90),
      currentPaymentDue,
      submittedAt: new Date("2026-05-02"),
      notes: "AIA G702/G703 style draw seeded for demo.",
    },
  });

  const sv45 = multiplyMoney(scheduledValue, 0.45);
  const sv12 = multiplyMoney(scheduledValue, 0.12);
  await prisma.payApplicationLine.createMany({
    data: [
      {
        payApplicationId: payApp.id,
        lineNumber: 1,
        costCode: project.mode === ProjectMode.HEAVY_CIVIL ? "2010" : "033000",
        description: project.mode === ProjectMode.HEAVY_CIVIL ? "Earthwork / Excavation" : "Structural concrete",
        scheduledValue: sv45,
        workCompletedPrev: multiplyMoney(sv45, 0.40),
        workCompletedThis: multiplyMoney(sv45, 0.15),
        totalCompleted: multiplyMoney(sv45, 0.55),
        percentComplete: 55,
        balanceToFinish: multiplyMoney(sv45, 0.45),
        retainage: multiplyMoney(multiplyMoney(sv45, 0.55), 0.10),
      },
      {
        payApplicationId: payApp.id,
        lineNumber: 2,
        costCode: "GC",
        description: "General Conditions",
        scheduledValue: sv12,
        workCompletedPrev: multiplyMoney(sv12, 0.30),
        workCompletedThis: multiplyMoney(sv12, 0.08),
        totalCompleted: multiplyMoney(sv12, 0.38),
        percentComplete: 38,
        balanceToFinish: multiplyMoney(sv12, 0.62),
        retainage: multiplyMoney(multiplyMoney(sv12, 0.38), 0.10),
      },
    ],
  });

  // Lien waivers
  await prisma.lienWaiver.createMany({
    data: [
      { projectId: project.id, contractId: subContract.id, waiverType: LienWaiverType.CONDITIONAL_PARTIAL, partyName: subCounterparty, throughDate: periodTo, amount: workCompletedThis, status: LienWaiverStatus.RECEIVED, receivedAt: new Date("2026-05-05") },
      { projectId: project.id, contractId: primeContract.id, waiverType: LienWaiverType.UNCONDITIONAL_PARTIAL, partyName: primeContract.counterparty, throughDate: periodFrom, amount: multiplyMoney(workCompletedPrev, 0.10), status: LienWaiverStatus.PENDING },
    ],
  });

  // Inspections
  await prisma.inspection.createMany({
    data: [
      { projectId: project.id, kind: InspectionKind.PRE_POUR, title: project.mode === ProjectMode.VERTICAL ? "Level 2 slab pre-pour" : project.mode === ProjectMode.HEAVY_CIVIL ? "Bedding pre-pour" : "Slab repair pre-pour", scheduledAt: new Date("2026-04-12"), inspector: "Third-party QC", location: project.mode === ProjectMode.VERTICAL ? "Level 2" : "Segment B", result: InspectionResult.PENDING, checklistJson: JSON.stringify(["rebar clearance", "embed placement", "vapor barrier"]) },
      { projectId: project.id, kind: InspectionKind.OSHA, title: "Weekly OSHA site walk", scheduledAt: new Date("2026-04-15"), completedAt: new Date("2026-04-15"), inspector: "Safety Manager", location: "Site-wide", result: InspectionResult.PASS, followUpNeeded: false, checklistJson: JSON.stringify(["fall protection", "housekeeping", "PPE compliance"]) },
    ],
  });
}

async function seedLifecycle(project: { id: string; name: string; code: string; mode: ProjectMode; contractValue: number | { toNumber: () => number } | null; startDate: Date | null }, tenantId: string) {
  // Tenant-scoped one-time seeding of opportunities and vendors — guard via upsert-by-marker.
  const existingOpp = await prisma.opportunity.findFirst({ where: { tenantId, name: "Lowline Civic Center — Pursue" } });
  if (!existingOpp) {
    await prisma.opportunity.createMany({
      data: [
        { tenantId, name: "Lowline Civic Center — Pursue", clientName: "City of Charleston", stage: OpportunityStage.QUALIFIED, estimatedValue: 18500000, probability: 45, dueDate: new Date("2026-06-15"), ownerName: "Paula PM", source: "RFQ", mode: ProjectMode.VERTICAL },
        { tenantId, name: "James Island Sewer Upgrade", clientName: "Charleston Water", stage: OpportunityStage.BID, estimatedValue: 4200000, probability: 60, dueDate: new Date("2026-05-01"), ownerName: "Sam Superintendent", source: "DOT bid board", mode: ProjectMode.HEAVY_CIVIL },
        { tenantId, name: "Folly Beach Cottage Remodels", clientName: "Private developer", stage: OpportunityStage.PROPOSAL, estimatedValue: 320000, probability: 70, dueDate: new Date("2026-04-22"), ownerName: "Elena Executive", source: "Referral", mode: ProjectMode.SIMPLE },
        { tenantId, name: "Harbor Point — Package B", clientName: "Atlantic Development Partners", stage: OpportunityStage.AWARDED, estimatedValue: 4800000, probability: 100, awardDate: new Date("2026-03-01"), ownerName: "Paula PM", source: "Repeat client", mode: ProjectMode.VERTICAL },
      ],
    });
  }

  const vendorNamesByMode: Record<ProjectMode, Array<{ name: string; trade: string; legal?: string }>> = {
    [ProjectMode.VERTICAL]: [
      { name: "Coastal Concrete Co", trade: "Concrete / formwork", legal: "Coastal Concrete Company LLC" },
      { name: "Palmetto Steel Erectors", trade: "Structural steel" },
      { name: "Lowcountry Mechanical", trade: "HVAC" },
    ],
    [ProjectMode.HEAVY_CIVIL]: [
      { name: "Atlantic Underground LLC", trade: "Utility install" },
      { name: "Ladson Quarry Materials", trade: "Aggregates" },
      { name: "Southeast Paving", trade: "Asphalt & paving" },
    ],
    [ProjectMode.SIMPLE]: [
      { name: "Lowcountry Finish Carpentry", trade: "Finish carpentry" },
      { name: "Tidewater Tile & Stone", trade: "Tile setter" },
    ],
  };

  for (const v of vendorNamesByMode[project.mode]) {
    const existing = await prisma.vendor.findFirst({ where: { tenantId, name: v.name } });
    if (existing) continue;
    const vendor = await prisma.vendor.create({
      data: {
        tenantId,
        name: v.name,
        legalName: v.legal ?? v.name,
        trade: v.trade,
        email: v.name.toLowerCase().replace(/[^a-z]+/g, "") + "@example.com",
        phone: "843-555-0100",
        emrRate: 0.82 + Math.random() * 0.3,
        prequalStatus: PrequalificationStatus.APPROVED,
        prequalScore: Math.floor(75 + Math.random() * 20),
        prequalExpires: new Date("2027-03-01"),
        bondingCapacity: 5000000,
      },
    });
    await prisma.insuranceCert.createMany({
      data: [
        { vendorId: vendor.id, type: InsuranceType.GENERAL_LIABILITY, carrier: "Travelers", policyNumber: "GL-" + vendor.id.slice(-6), limitEach: 1000000, limitAggregate: 2000000, effectiveDate: new Date("2026-01-01"), expirationDate: new Date("2027-01-01") },
        { vendorId: vendor.id, type: InsuranceType.WORKERS_COMP, carrier: "Liberty Mutual", policyNumber: "WC-" + vendor.id.slice(-6), limitEach: 1000000, limitAggregate: 1000000, effectiveDate: new Date("2026-01-01"), expirationDate: new Date("2027-01-01") },
      ],
    });
  }

  const vendors = await prisma.vendor.findMany({ where: { tenantId, trade: { in: vendorNamesByMode[project.mode].map((v) => v.trade) } } });

  // Bid package + sub bids for this project
  const bidPkg = await prisma.bidPackage.create({
    data: {
      projectId: project.id,
      name: project.mode === ProjectMode.VERTICAL ? "Structural Concrete — L1-L3" : project.mode === ProjectMode.HEAVY_CIVIL ? "Utility install package" : "Finish carpentry package",
      trade: project.mode === ProjectMode.VERTICAL ? "Concrete" : project.mode === ProjectMode.HEAVY_CIVIL ? "Utilities" : "Finish carpentry",
      scopeSummary: "Seeded package for bid leveling demo.",
      dueDate: new Date("2026-04-25"),
      estimatedValue: multiplyMoney(toNum(project.contractValue) || 1000000, 0.18),
      status: BidPackageStatus.LEVELING,
    },
  });
  // Shared scope-item sheet for this package — every bidder prices the
  // same keys so the leveling matrix lines up apples-to-apples.
  const scopeSheet =
    project.mode === ProjectMode.HEAVY_CIVIL
      ? [
          { key: "100-MOBILIZATION", description: "Mobilization & traffic control", weight: 0.1 },
          { key: "200-EXCAVATION", description: "Trench excavation & shoring", weight: 0.35 },
          { key: "300-PIPE", description: "Pipe & fittings install", weight: 0.4 },
          { key: "400-RESTORATION", description: "Backfill, compaction & restoration", weight: 0.15 },
        ]
      : project.mode === ProjectMode.VERTICAL
        ? [
            { key: "100-FORMWORK", description: "Formwork & shoring", weight: 0.25 },
            { key: "200-REBAR", description: "Reinforcing steel", weight: 0.3 },
            { key: "300-PLACEMENT", description: "Concrete placement & finishing", weight: 0.35 },
            { key: "400-CURE", description: "Curing, testing & cleanup", weight: 0.1 },
          ]
        : [
            { key: "100-TRIM", description: "Interior trim & casework", weight: 0.55 },
            { key: "200-DOORS", description: "Door & hardware install", weight: 0.3 },
            { key: "300-PUNCH", description: "Punch & touch-up", weight: 0.15 },
          ];

  for (let i = 0; i < vendors.length; i++) {
    const v = vendors[i];
    const total = multiplyMoney(bidPkg.estimatedValue, 0.94 + i * 0.04);
    const subBid = await prisma.subBid.create({
      data: {
        bidPackageId: bidPkg.id,
        vendorId: v.id,
        bidAmount: total,
        daysToComplete: 45 + i * 5,
        inclusions: "Labor, material, equipment, supervision.",
        exclusions: "Permits, testing, owner-furnished items.",
        status: i === 0 ? SubBidStatus.SELECTED : i === vendors.length - 1 ? SubBidStatus.DECLINED : SubBidStatus.SUBMITTED,
        submittedAt: new Date("2026-04-20"),
      },
    });
    // Line-item detail so the leveling matrix has data. The last bidder
    // excludes the final scope (so the GC sees an exclusion), and the
    // middle bidder is a high outlier on the largest scope item.
    await prisma.subBidLine.createMany({
      data: scopeSheet.map((s, j) => {
        const base = multiplyMoney(total, s.weight);
        const isExcluded = i === vendors.length - 1 && j === scopeSheet.length - 1;
        const isOutlier = i === 1 && j === scopeSheet.findIndex((x) => x.weight === Math.max(...scopeSheet.map((y) => y.weight)));
        const amount = isExcluded ? 0 : isOutlier ? multiplyMoney(base, 1.6) : base;
        return {
          subBidId: subBid.id,
          scopeItemKey: s.key,
          description: s.description,
          amount,
          inclusion: !isExcluded,
          notes: isExcluded ? "By others" : isOutlier ? "Premium scope assumption" : null,
        };
      }),
    });
  }

  // Time entries (this week + last week)
  const today = new Date();
  const lastFriday = new Date(today);
  lastFriday.setDate(today.getDate() - ((today.getDay() + 2) % 7 || 7));
  for (const emp of ["Derrick Adams", "Maria Lopez", "Trevor Johnson"]) {
    await prisma.timeEntry.create({
      data: {
        projectId: project.id,
        employeeName: emp,
        trade: project.mode === ProjectMode.VERTICAL ? "Carpenter" : project.mode === ProjectMode.HEAVY_CIVIL ? "Pipe layer" : "Finish carpenter",
        weekEnding: lastFriday,
        regularHours: 40,
        overtimeHours: emp === "Derrick Adams" ? 6 : 2,
        rate: project.mode === ProjectMode.VERTICAL ? 52 : project.mode === ProjectMode.HEAVY_CIVIL ? 45 : 48,
        costCode: project.mode === ProjectMode.HEAVY_CIVIL ? "P-014" : "033000",
        status: emp === "Derrick Adams" ? TimeEntryStatus.APPROVED : TimeEntryStatus.SUBMITTED,
        submittedAt: lastFriday,
        approvedAt: emp === "Derrick Adams" ? lastFriday : null,
      },
    });
  }

  // Sub invoices
  const primaryVendor = vendors[0];
  if (primaryVendor) {
    await prisma.subInvoice.create({
      data: {
        projectId: project.id,
        vendorId: primaryVendor.id,
        invoiceNumber: `${project.code}-INV-001`,
        description: `${primaryVendor.name} — Period 1 invoice`,
        amount: multiplyMoney(toNum(project.contractValue) || 1000000, 0.08),
        retainageHeld: multiplyMoney(multiplyMoney(toNum(project.contractValue) || 1000000, 0.08), 0.10),
        netDue: multiplyMoney(multiplyMoney(toNum(project.contractValue) || 1000000, 0.08), 0.90),
        status: SubInvoiceStatus.APPROVED,
        invoiceDate: new Date("2026-05-01"),
        dueDate: new Date("2026-05-31"),
        approvedAt: new Date("2026-05-08"),
        waiverReceived: true,
      },
    });
    await prisma.purchaseOrder.create({
      data: {
        projectId: project.id,
        vendorId: primaryVendor.id,
        poNumber: `${project.code}-PO-001`,
        description: project.mode === ProjectMode.VERTICAL ? "Rebar fabrication" : project.mode === ProjectMode.HEAVY_CIVIL ? "DIP pipe order" : "Cabinet delivery",
        amount: 68000,
        invoicedToDate: 42000,
        status: "PARTIAL",
        expectedDelivery: new Date("2026-04-30"),
      },
    });
  }

  // Warranty items (only on closeout-adjacent projects)
  await prisma.warrantyItem.createMany({
    data: [
      { projectId: project.id, title: "Window sealant chatter on Level 2", description: "Owner reported stain.", reportedBy: "Owner rep", assignedTo: "Coastal Concrete Co", severity: "NORMAL", status: WarrantyStatus.OPEN, warrantyExpires: new Date("2027-06-30") },
      { projectId: project.id, title: "HVAC balancing follow-up", description: "South zone under-conditioned.", reportedBy: "Facilities", severity: "LOW", status: WarrantyStatus.IN_PROGRESS, warrantyExpires: new Date("2027-09-30") },
    ],
  });
}

async function seedRfpSourcesForTenant(tenantId: string, geoState: string) {
  const existing = await prisma.rfpSource.count({ where: { tenantId } });
  if (existing > 0) return;
  const defaults = [
    { label: "SAM.gov — Construction 236220", url: "https://sam.gov/search/?index=opp", agencyHint: "SAM.gov", cadence: "DAILY", naicsFilter: "236220", keywordsJson: JSON.stringify(["construction", "renovation"]), setAsideFilter: null, geoScope: "federal", geoState: null, geoCity: null, authType: "FREE_ACCOUNT" },
    { label: `${geoState} DOT Bid Lettings`, url: geoState === "SC" ? "https://www.scdot.org/business/business-letting.aspx" : "https://www.dot.state.xx.us/business", agencyHint: `${geoState}DOT`, cadence: "WEEKLY", naicsFilter: "237310", keywordsJson: JSON.stringify(["roadway", "bridge", "utility"]), setAsideFilter: null, geoScope: "state", geoState, geoCity: null, authType: "NONE" },
    { label: "PlanHub Construction Opportunities", url: "https://planhub.com", agencyHint: "PlanHub", cadence: "DAILY", naicsFilter: null, keywordsJson: JSON.stringify(["subcontractor", "invitation-to-bid"]), setAsideFilter: null, geoScope: "federal", geoState: null, geoCity: null, authType: "FREE_ACCOUNT" },
  ];
  for (const d of defaults) {
    await prisma.rfpSource.create({ data: { tenantId, ...d } });
  }
}

async function seedPermitsForProject(project: { id: string; code: string; mode: ProjectMode }) {
  const existing = await prisma.permit.count({ where: { projectId: project.id } });
  if (existing > 0) return;

  const specs: Array<{ type: string; jurisdiction: string; url: string; scope: string }> =
    project.mode === ProjectMode.HEAVY_CIVIL ? [
      { type: "Encroachment", jurisdiction: "SCDOT", url: "https://www.scdot.org/business/encroachment-permits.aspx", scope: "Right-of-way utility crossings" },
      { type: "Water Main Tap", jurisdiction: "Charleston Water System", url: "https://www.charlestonwater.com/171/Tap-Permits", scope: "12in water main tie-ins" },
      { type: "Erosion Control", jurisdiction: "SCDHEC", url: "https://scdhec.gov/environment/stormwater", scope: "NPDES stormwater compliance" },
    ] : project.mode === ProjectMode.VERTICAL ? [
      { type: "Building Permit", jurisdiction: "City of Charleston", url: "https://www.charleston-sc.gov/171/Building-Permits", scope: "New construction — Levels 1-4" },
      { type: "Plumbing Permit", jurisdiction: "City of Charleston", url: "https://www.charleston-sc.gov/171/Building-Permits", scope: "Rough + finish plumbing" },
      { type: "Electrical Permit", jurisdiction: "City of Charleston", url: "https://www.charleston-sc.gov/171/Building-Permits", scope: "Service entrance + rough" },
      { type: "Mechanical Permit", jurisdiction: "City of Charleston", url: "https://www.charleston-sc.gov/171/Building-Permits", scope: "HVAC rough + test" },
    ] : [
      { type: "Residential Alteration", jurisdiction: "Charleston County", url: "https://www.charlestoncounty.org/departments/building-services/", scope: "Kitchen remodel" },
      { type: "Plumbing Permit", jurisdiction: "Charleston County", url: "https://www.charlestoncounty.org/departments/building-services/", scope: "Plumbing reroute" },
    ];

  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    await prisma.permit.create({
      data: {
        projectId: project.id,
        permitType: s.type,
        permitNumber: `${project.code}-${s.type.replace(/\s+/g, "").slice(0, 6).toUpperCase()}-${(2600 + i).toString()}`,
        jurisdiction: s.jurisdiction,
        jurisdictionUrl: s.url,
        scopeDescription: s.scope,
        appliedAt: new Date(Date.now() - (60 + i * 10) * 24 * 60 * 60 * 1000),
        issuedAt: new Date(Date.now() - (45 + i * 10) * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: "ISSUED",
        holder: "General Contractor",
        contractor: "General Contractor",
        fee: 400 + i * 150,
        autoLookupEnabled: true,
      },
    });
  }
}

/**
 * Sample data for the new modules added in audit pass 7 follow-on PRs:
 * ATS, Commissions, Federal Capture, Onboarding, Drawing register, and
 * heavy-civil CrewAssignment + geotagging. Keeps the demo populated so
 * the new pages aren't empty on first run.
 */
async function seedNewModuleSampleData(args: {
  tenantId: string;
  projects: Array<{ id: string; code: string; name: string; mode: ProjectMode }>;
  adminUserId: string;
  pmUserName: string;
}) {
  const { tenantId, projects, adminUserId, pmUserName } = args;
  const verticalProject = projects.find((p) => p.mode === ProjectMode.VERTICAL) ?? projects[0];
  const heavyProject = projects.find((p) => p.mode === ProjectMode.HEAVY_CIVIL) ?? projects[0];

  // ---------- ATS ----------
  const candidates = await Promise.all([
    prisma.candidate.create({ data: { tenantId, firstName: "Jordan", lastName: "Reyes", email: "jordan.reyes@example.com", phone: "843-555-0101", city: "Charleston", state: "SC", status: "INTERVIEWING", laborCategory: "Project Engineer", primarySkill: "Concrete formwork", rateExpectation: 78, source: "Referral", ownerUserId: adminUserId } }),
    prisma.candidate.create({ data: { tenantId, firstName: "Priya", lastName: "Anand", email: "priya@example.com", city: "Mt Pleasant", state: "SC", status: "OFFER", laborCategory: "Estimator", primarySkill: "Heavy civil takeoff", rateExpectation: 95, source: "LinkedIn" } }),
    prisma.candidate.create({ data: { tenantId, firstName: "Mike", lastName: "Holland", email: "mike@example.com", city: "Summerville", state: "SC", status: "HIRED", laborCategory: "Foreman", primarySkill: "Underground utilities", rateExpectation: 52 } }),
    prisma.candidate.create({ data: { tenantId, firstName: "Sara", lastName: "Tanner", email: "sara@example.com", status: "SCREENING", laborCategory: "Safety Manager", primarySkill: "OSHA 30 + first aid", rateExpectation: 68 } }),
    prisma.candidate.create({ data: { tenantId, firstName: "Alex", lastName: "Quint", email: "alex@example.com", status: "REJECTED", laborCategory: "Superintendent", primarySkill: "Commercial GC", rateExpectation: 110 } }),
  ]);

  const reqs = await Promise.all([
    prisma.jobRequisition.create({ data: { tenantId, projectId: verticalProject.id, reqNumber: "REQ-2026-001", title: "Project Engineer — Vertical", hiringManager: "Paula PM", laborCategory: "Project Engineer", location: "Charleston, SC", rateMin: 65, rateMax: 85, openings: 2, status: "OPEN", description: "Support PMs across two commercial projects.", postedDate: new Date(Date.now() - 14 * 86_400_000), targetStartDate: new Date(Date.now() + 30 * 86_400_000) } }),
    prisma.jobRequisition.create({ data: { tenantId, projectId: heavyProject.id, reqNumber: "REQ-2026-002", title: "Foreman — Underground Utilities", hiringManager: "Sam Superintendent", laborCategory: "Foreman", location: "Lowcountry", rateMin: 48, rateMax: 62, openings: 1, status: "OPEN", postedDate: new Date(Date.now() - 7 * 86_400_000), targetStartDate: new Date(Date.now() + 14 * 86_400_000) } }),
    prisma.jobRequisition.create({ data: { tenantId, reqNumber: "REQ-2026-003", title: "Senior Estimator", hiringManager: pmUserName, laborCategory: "Estimator", remoteAllowed: true, rateMin: 85, rateMax: 110, openings: 1, status: "OPEN", postedDate: new Date(Date.now() - 21 * 86_400_000) } }),
  ]);

  await Promise.all([
    prisma.submission.create({ data: { tenantId, candidateId: candidates[0].id, reqId: reqs[0].id, stage: "TECH_SCREEN", recruiterName: pmUserName, rateOffered: 78 } }),
    prisma.submission.create({ data: { tenantId, candidateId: candidates[1].id, reqId: reqs[2].id, stage: "OFFER_EXTENDED", recruiterName: pmUserName, rateOffered: 95 } }),
    prisma.submission.create({ data: { tenantId, candidateId: candidates[3].id, reqId: reqs[0].id, stage: "RECRUITER_SCREEN", recruiterName: pmUserName } }),
  ]);

  const placement = await prisma.placement.create({
    data: {
      tenantId,
      candidateId: candidates[2].id,
      projectId: heavyProject.id,
      contractRef: `${heavyProject.code}-LBR-001`,
      laborCategory: "Foreman",
      department: "Underground Utilities",
      startDate: new Date(Date.now() - 30 * 86_400_000),
      endDate: new Date(Date.now() + 365 * 86_400_000),
      billRate: 92,
      payRate: 52,
      status: "ACTIVE",
    },
  });

  // ---------- Commissions ----------
  const ruleAward = await prisma.commissionRule.create({ data: { tenantId, name: "Award commission — vertical", appliesTo: "OPPORTUNITY", recipientRole: "ACCOUNT_EXECUTIVE", ratePct: 0.5, cap: 25000 } });
  await prisma.commissionRule.create({ data: { tenantId, name: "Federal capture bonus", appliesTo: "PROJECT", recipientRole: "CAPTURE_MANAGER", ratePct: 0.25, cap: 50000 } });

  await prisma.commissionAccrual.create({ data: { tenantId, ruleId: ruleAward.id, recipientName: "Jamie Closer", recipientRole: "ACCOUNT_EXECUTIVE", sourceType: "OPPORTUNITY", sourceId: "demo-opp-1", sourceLabel: "Charleston Mixed-Use Award", basis: 1_500_000, ratePct: 0.5, amount: 7500, status: "APPROVED", approvedAt: new Date(Date.now() - 3 * 86_400_000), approvedBy: "Morgan Admin" } });
  await prisma.commissionAccrual.create({ data: { tenantId, recipientName: "Riley Capture", recipientRole: "CAPTURE_MANAGER", sourceType: "MANUAL", sourceId: "manual", sourceLabel: "Q1 strategic capture bonus", basis: 0, ratePct: 0, amount: 5000, status: "ACCRUED" } });
  await prisma.commissionAccrual.create({ data: { tenantId, recipientName: "Jamie Closer", sourceType: "PROJECT", sourceId: verticalProject.id, sourceLabel: verticalProject.name, basis: 800_000, ratePct: 0.4, amount: 3200, status: "PAID", approvedAt: new Date(Date.now() - 14 * 86_400_000), approvedBy: "Morgan Admin", paidAt: new Date(Date.now() - 7 * 86_400_000), paidBy: "Morgan Admin" } });

  // ---------- Federal capture ----------
  const capture1 = await prisma.captureRecord.create({ data: { tenantId, title: "Naval Weapons Station Charleston — Pier Modernization", agency: "U.S. Navy NAVFAC", contractVehicle: "MATOC", solicitationNumber: "N69450-26-R-0017", naicsCode: "237990", setAside: "TOTAL_SMALL_BUSINESS", estimatedValue: 18_500_000, rfpReleaseDate: new Date(Date.now() - 21 * 86_400_000), proposalDueDate: new Date(Date.now() + 35 * 86_400_000), stage: "PROPOSAL", captureLead: "Riley Capture", proposalLead: pmUserName, pwinPercent: 38, winStrategy: "Local self-perform diving + recent NAVFAC past performance" } });
  await prisma.captureRecord.create({ data: { tenantId, title: "FAA Tower Site Civil Pkg", agency: "FAA", contractVehicle: "IDIQ", solicitationNumber: "FAA-26-0411", naicsCode: "237310", setAside: "EIGHT_A", estimatedValue: 4_200_000, proposalDueDate: new Date(Date.now() + 60 * 86_400_000), stage: "QUALIFYING", captureLead: "Riley Capture", pwinPercent: 22 } });

  await prisma.captureMilestone.create({ data: { captureId: capture1.id, label: "Pink team review", dueAt: new Date(Date.now() + 14 * 86_400_000), ownerName: pmUserName } });
  await prisma.captureMilestone.create({ data: { captureId: capture1.id, label: "Red team review", dueAt: new Date(Date.now() + 25 * 86_400_000), ownerName: pmUserName } });
  await prisma.captureMilestone.create({ data: { captureId: capture1.id, label: "Final submit", dueAt: new Date(Date.now() + 35 * 86_400_000), ownerName: "Riley Capture" } });

  await prisma.goNoGoDecision.create({ data: { captureId: capture1.id, decision: "GO", decidedBy: "Morgan Admin", rationale: "Strong NAVFAC past performance + 8(a) primes available for teaming. pWin justifies investment.", pwinAtDecision: 35 } });

  await prisma.teamingPartner.create({ data: { captureId: capture1.id, partnerName: "Atlantic Dive Services LLC", role: "Subcontractor — diving", workSharePct: 22, taSignedAt: new Date(Date.now() - 7 * 86_400_000) } });

  // ---------- Onboarding ----------
  const path = await prisma.onboardingPath.create({ data: { tenantId, candidateId: candidates[2].id, placementId: placement.id, personName: "Mike Holland", role: "Foreman", startDateTarget: new Date(Date.now() + 7 * 86_400_000), status: "IN_PROGRESS", ownerName: pmUserName } });
  const onboardingSteps = [
    { kind: "DOCUMENT" as const, label: "I-9 + W-4", status: "COMPLETE" as const },
    { kind: "DOCUMENT" as const, label: "Direct deposit form", status: "COMPLETE" as const },
    { kind: "TRAINING" as const, label: "Safety orientation", status: "COMPLETE" as const },
    { kind: "ACCESS_PROVISION" as const, label: "Email + system access", status: "IN_PROGRESS" as const },
    { kind: "EQUIPMENT" as const, label: "Truck + PPE issued", status: "PENDING" as const },
    { kind: "COMPLIANCE_CHECK" as const, label: "Background check clear", status: "PENDING" as const },
    { kind: "SIGNOFF" as const, label: "Manager final signoff", status: "PENDING" as const },
  ];
  for (let i = 0; i < onboardingSteps.length; i++) {
    const s = onboardingSteps[i];
    await prisma.onboardingStep.create({
      data: {
        pathId: path.id,
        ordering: i + 1,
        kind: s.kind,
        label: s.label,
        status: s.status,
        completedAt: s.status === "COMPLETE" ? new Date(Date.now() - (10 - i) * 86_400_000) : null,
        completedBy: s.status === "COMPLETE" ? pmUserName : null,
      },
    });
  }

  // ---------- Drawings & spec sections ----------
  if (verticalProject) {
    const drawing = await prisma.drawing.create({ data: { projectId: verticalProject.id, setName: "100% Construction Documents", discipline: "ARCHITECTURAL", revisionNumber: 0, issuedDate: new Date(Date.now() - 60 * 86_400_000) } });
    const sheets = [
      { sheetNumber: "A0.0", title: "Cover Sheet" },
      { sheetNumber: "A0.1", title: "Code Analysis" },
      { sheetNumber: "A1.1", title: "Site Plan" },
      { sheetNumber: "A2.1", title: "First Floor Plan" },
      { sheetNumber: "A2.2", title: "Second Floor Plan" },
      { sheetNumber: "A3.1", title: "Building Elevations" },
    ];
    for (const s of sheets) {
      await prisma.drawingSheet.create({ data: { drawingId: drawing.id, sheetNumber: s.sheetNumber, title: s.title } });
    }
    await prisma.drawing.create({ data: { projectId: verticalProject.id, setName: "Addendum 1", discipline: "STRUCTURAL", revisionNumber: 1, issuedDate: new Date(Date.now() - 14 * 86_400_000), notes: "Foundation revisions per geotech update." } });

    const specs = [
      { csiDivision: "03", sectionCode: "03 30 00", title: "Cast-in-Place Concrete" },
      { csiDivision: "05", sectionCode: "05 12 00", title: "Structural Steel Framing" },
      { csiDivision: "07", sectionCode: "07 21 00", title: "Thermal Insulation" },
      { csiDivision: "08", sectionCode: "08 11 13", title: "Hollow Metal Doors and Frames" },
      { csiDivision: "09", sectionCode: "09 51 23", title: "Acoustical Tile Ceilings" },
    ];
    for (const s of specs) {
      await prisma.specSection.create({ data: { projectId: verticalProject.id, csiDivision: s.csiDivision, sectionCode: s.sectionCode, title: s.title } });
    }
  }

  // ---------- Crew assignments (heavy civil) ----------
  if (heavyProject) {
    const today = new Date(); today.setHours(7, 0, 0, 0);
    const crews = [
      { crewName: "Spread A", foreman: "Mike Holland", costCode: "31-23-16", activity: "Excavation", plannedHeadcount: 6, plannedHours: 60, station: "STA 12+50" },
      { crewName: "Spread B", foreman: "Carlos Vega", costCode: "33-12-16", activity: "Water main installation", plannedHeadcount: 5, plannedHours: 50, station: "STA 8+00" },
      { crewName: "Paving crew", foreman: "Devon Lee", costCode: "32-12-16", activity: "Asphalt overlay", plannedHeadcount: 8, plannedHours: 80, station: "STA 0+00 - 4+00" },
    ];
    for (let dayOffset = -2; dayOffset <= 2; dayOffset++) {
      const day = new Date(today.getTime() + dayOffset * 86_400_000);
      for (const c of crews) {
        await prisma.crewAssignment.create({
          data: {
            projectId: heavyProject.id,
            assignedDate: day,
            crewName: c.crewName,
            foreman: c.foreman,
            costCode: c.costCode,
            activity: c.activity,
            plannedHeadcount: c.plannedHeadcount,
            actualHeadcount: dayOffset <= 0 ? c.plannedHeadcount - (Math.abs(dayOffset) % 2) : 0,
            plannedHours: c.plannedHours,
            actualHours: dayOffset <= 0 ? c.plannedHours - (Math.abs(dayOffset) * 4) : 0,
            station: c.station,
            shift: "Day",
          },
        });
      }
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
