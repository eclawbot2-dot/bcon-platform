-- CreateEnum
CREATE TYPE "ProjectMode" AS ENUM ('SIMPLE', 'VERTICAL', 'HEAVY_CIVIL');

-- CreateEnum
CREATE TYPE "UserRoleTemplate" AS ENUM ('ADMIN', 'EXECUTIVE', 'MANAGER', 'RECRUITER', 'COORDINATOR', 'CAPTURE_MANAGER', 'PROGRAM_MANAGER', 'ACCOUNT_EXECUTIVE', 'VIEWER', 'PROJECT_ENGINEER', 'SUPERINTENDENT', 'FOREMAN', 'CONTROLLER', 'SAFETY_MANAGER', 'QUALITY_MANAGER');

-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('PRECONSTRUCTION', 'ACTIVE', 'CLOSEOUT', 'WARRANTY');

-- CreateEnum
CREATE TYPE "ThreadChannel" AS ENUM ('GENERAL', 'SCHEDULE', 'BUDGET', 'OWNER', 'FIELD', 'SAFETY', 'PROCUREMENT', 'CLOSEOUT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DocumentClass" AS ENUM ('CONTRACT', 'DRAWING', 'SPEC', 'PERMIT', 'RFI', 'SUBMITTAL', 'MEETING_MINUTES', 'DAILY_REPORT', 'PHOTO', 'SAFETY', 'QUALITY', 'INVOICE', 'CHANGE', 'CLOSEOUT', 'WARRANTY', 'TEST_REPORT', 'TICKET', 'OTHER');

-- CreateEnum
CREATE TYPE "BudgetLineType" AS ENUM ('COST_CODE', 'PAY_ITEM', 'ALLOWANCE', 'CONTINGENCY');

-- CreateEnum
CREATE TYPE "ChangeOrderKind" AS ENUM ('PCO', 'COR', 'OCO', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ChangeOrderStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'VOID');

-- CreateEnum
CREATE TYPE "ScheduleDependencyType" AS ENUM ('FS', 'SS', 'FF', 'SF');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('PRIME_OWNER', 'SUBCONTRACT', 'PURCHASE_ORDER', 'MSA', 'TASK_ORDER', 'GC_CONTRACT', 'FEE_AGREEMENT');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'NEGOTIATING', 'EXECUTED', 'ACTIVE', 'COMPLETED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "PayApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "LienWaiverType" AS ENUM ('CONDITIONAL_PARTIAL', 'UNCONDITIONAL_PARTIAL', 'CONDITIONAL_FINAL', 'UNCONDITIONAL_FINAL');

-- CreateEnum
CREATE TYPE "LienWaiverStatus" AS ENUM ('PENDING', 'RECEIVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InspectionKind" AS ENUM ('MUNICIPAL', 'THIRD_PARTY', 'INTERNAL_QC', 'PRE_POUR', 'PRE_COVER', 'FINAL', 'OSHA', 'ENVIRONMENTAL');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('PENDING', 'PASS', 'FAIL', 'CONDITIONAL', 'WAIVED');

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('LEAD', 'QUALIFIED', 'PROPOSAL', 'BID', 'AWARDED', 'LOST', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "BidPackageStatus" AS ENUM ('PLANNING', 'INVITED', 'COLLECTING', 'LEVELING', 'AWARDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubBidStatus" AS ENUM ('INVITED', 'DECLINED', 'BIDDING', 'SUBMITTED', 'SELECTED', 'NOT_SELECTED');

-- CreateEnum
CREATE TYPE "PrequalificationStatus" AS ENUM ('NOT_STARTED', 'IN_REVIEW', 'APPROVED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InsuranceType" AS ENUM ('GENERAL_LIABILITY', 'WORKERS_COMP', 'AUTO', 'UMBRELLA', 'PROFESSIONAL', 'POLLUTION');

-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "SubInvoiceStatus" AS ENUM ('RECEIVED', 'UNDER_REVIEW', 'APPROVED', 'PAID', 'DISPUTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "PermitStatus" AS ENUM ('PLANNED', 'APPLIED', 'UNDER_REVIEW', 'ISSUED', 'EXPIRED', 'FINALED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InspectionLookupStatus" AS ENUM ('NEVER', 'FETCHED', 'STALE', 'ERROR');

-- CreateEnum
CREATE TYPE "InspectionItemStatus" AS ENUM ('PENDING', 'PASS', 'FAIL', 'NA');

-- CreateEnum
CREATE TYPE "RfpSourceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "RfpListingStatus" AS ENUM ('NEW', 'TRIAGED', 'QUALIFIED', 'PURSUING', 'SUBMITTED', 'WON', 'LOST', 'DECLINED');

-- CreateEnum
CREATE TYPE "BidDraftStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'FINAL', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "ComplianceOutcome" AS ENUM ('PENDING', 'PASS', 'FAIL', 'WAIVED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "XeroConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "QboConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "JournalEntryType" AS ENUM ('REVENUE', 'COST_OF_GOODS', 'OPERATING_EXPENSE', 'INDIRECT_COST', 'OTHER_INCOME', 'OTHER_EXPENSE');

-- CreateEnum
CREATE TYPE "CostReconciliationStatus" AS ENUM ('UNREVIEWED', 'SUGGESTED', 'CONFIRMED', 'NEEDS_INPUT', 'REJECTED');

-- CreateEnum
CREATE TYPE "HistoricalImportKind" AS ENUM ('PROJECT_ACTUALS', 'BID_HISTORY', 'INCOME_STATEMENT', 'BUDGET_TEMPLATE', 'SCHEDULE_OF_VALUES', 'VENDOR_LIST');

-- CreateEnum
CREATE TYPE "HistoricalImportStatus" AS ENUM ('UPLOADED', 'PARSED', 'AI_REVIEWED', 'IMPORTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DailyLogType" AS ENUM ('GENERAL', 'AREA', 'CREW');

-- CreateEnum
CREATE TYPE "MeetingActionItemStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgencyKind" AS ENUM ('FEDERAL', 'STATE', 'COUNTY', 'MUNICIPAL', 'TRIBAL', 'AGGREGATOR', 'PRIVATE', 'AUTHORITY');

-- CreateEnum
CREATE TYPE "ScraperKind" AS ENUM ('API', 'RSS', 'HTML', 'MANUAL', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "AgencyTier" AS ENUM ('CIVILIAN', 'DOD', 'VA', 'USACE', 'GSA', 'HOMELAND', 'ENERGY', 'TRANSPORTATION', 'HEALTH', 'EDUCATION', 'INDEPENDENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DrawingDiscipline" AS ENUM ('ARCHITECTURAL', 'STRUCTURAL', 'MEP', 'CIVIL', 'LANDSCAPE', 'ELECTRICAL', 'PLUMBING', 'MECHANICAL', 'FIRE_PROTECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'SCREENING', 'INTERVIEWING', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "JobReqStatus" AS ENUM ('DRAFT', 'OPEN', 'ON_HOLD', 'FILLED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubmissionStage" AS ENUM ('SUBMITTED', 'RECRUITER_SCREEN', 'TECH_SCREEN', 'CLIENT_INTERVIEW', 'REFERENCE_CHECK', 'OFFER_EXTENDED', 'OFFER_ACCEPTED', 'OFFER_DECLINED', 'PLACED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('PENDING_START', 'ACTIVE', 'EXTENDED', 'ENDING_SOON', 'ENDED', 'TERMINATED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('ACCRUED', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'HELD', 'REVERSED');

-- CreateEnum
CREATE TYPE "CommissionSourceType" AS ENUM ('OPPORTUNITY', 'PROJECT', 'CONTRACT', 'PAY_APPLICATION', 'CHANGE_ORDER', 'MANUAL');

-- CreateEnum
CREATE TYPE "CaptureStage" AS ENUM ('IDENTIFIED', 'QUALIFYING', 'CAPTURE', 'PROPOSAL', 'EVALUATION', 'AWARDED', 'LOST', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SetAsideCode" AS ENUM ('NONE', 'SMALL_BUSINESS', 'WOSB', 'EDWOSB', 'HUBZONE', 'EIGHT_A', 'SDVOSB', 'TOTAL_SMALL_BUSINESS', 'PARTIAL_SMALL_BUSINESS');

-- CreateEnum
CREATE TYPE "ColorTeamPhase" AS ENUM ('PINK', 'RED', 'GOLD', 'WHITE', 'BLACK', 'GREEN');

-- CreateEnum
CREATE TYPE "GoNoGoDecisionType" AS ENUM ('GO', 'NO_GO', 'CONDITIONAL_GO', 'DEFERRED');

-- CreateEnum
CREATE TYPE "OnboardingPathStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OnboardingStepKind" AS ENUM ('DOCUMENT', 'TRAINING', 'SIGNOFF', 'ACCESS_PROVISION', 'EQUIPMENT', 'COMPLIANCE_CHECK', 'ORIENTATION', 'OTHER');

-- CreateEnum
CREATE TYPE "OnboardingStepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'WAIVED', 'COMPLETE', 'BLOCKED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "primaryMode" "ProjectMode" NOT NULL,
    "enabledModes" TEXT NOT NULL DEFAULT '[]',
    "featurePacks" TEXT NOT NULL DEFAULT '[]',
    "terminology" TEXT NOT NULL DEFAULT '{}',
    "brandingTheme" TEXT,
    "backupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "backupDirectory" TEXT,
    "lastBackupAt" TIMESTAMP(3),
    "lastBackupBytes" INTEGER,
    "lastBackupError" TEXT,
    "openaiKeyEnc" TEXT,
    "anthropicKeyEnc" TEXT,
    "preferredProvider" TEXT DEFAULT 'openai',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "allowExternalEmailLogins" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "trustGated" BOOLEAN NOT NULL DEFAULT false,
    "autoApply" BOOLEAN NOT NULL DEFAULT false,
    "intervalMinutesOverride" INTEGER,
    "lastRunAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastSummary" TEXT,
    "lastError" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "configId" TEXT,
    "workflowKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "summary" TEXT,
    "producedCount" INTEGER NOT NULL DEFAULT 0,
    "actionCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "usedLlm" BOOLEAN NOT NULL DEFAULT false,
    "llmModel" TEXT,
    "triggeredBy" TEXT NOT NULL DEFAULT 'cron',

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "defaultMode" "ProjectMode" NOT NULL,
    "region" TEXT,
    "legalEntityName" TEXT,
    "legalEntityEin" TEXT,
    "intercompanyAccount" TEXT,
    "fiscalYearEndMonth" INTEGER NOT NULL DEFAULT 12,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsolidatedReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "reportType" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "intercompanyEliminationsCents" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsolidatedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "superAdmin" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEnc" TEXT,
    "mfaEnrolledAt" TIMESTAMP(3),
    "mfaBackupCodesEnc" TEXT,
    "ssoProvider" TEXT,
    "ssoSubject" TEXT,
    "sessionsRevokedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "requestIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "roleTemplate" "UserRoleTemplate" NOT NULL,
    "permissionsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyType" TEXT NOT NULL,
    "market" TEXT,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "roleTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "mode" "ProjectMode" NOT NULL,
    "stage" "ProjectStage" NOT NULL DEFAULT 'PRECONSTRUCTION',
    "address" TEXT,
    "ownerName" TEXT,
    "contractType" TEXT,
    "contractValue" DECIMAL(65,30),
    "marginTargetPct" DOUBLE PRECISION,
    "progressPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "healthScore" INTEGER NOT NULL DEFAULT 75,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "configurationJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channel" "ThreadChannel" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreadMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "decisionFlag" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "assigneeId" TEXT,
    "sourceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "ProjectMode",
    "module" TEXT NOT NULL,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "entityType" TEXT,
    "entityId" TEXT,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watcher" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workflowRunId" TEXT,
    "userId" TEXT,
    "channel" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleTemplate" "UserRoleTemplate",
    "triggerType" TEXT NOT NULL,
    "delivery" TEXT NOT NULL,
    "cadence" TEXT,
    "slaHours" INTEGER,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRoute" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "name" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "approverRole" "UserRoleTemplate",
    "stepsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "equipmentCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownershipType" TEXT NOT NULL,
    "assignedCrew" TEXT,
    "utilizationHours" DOUBLE PRECISION DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "serialNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchasePrice" DECIMAL(65,30),
    "salvageValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER,
    "depreciationMethod" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "accumulatedDepreciation" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "internalRateHour" DECIMAL(65,30),
    "internalRateDay" DECIMAL(65,30),
    "internalRateWeek" DECIMAL(65,30),
    "internalRateMonth" DECIMAL(65,30),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetAssignment" (
    "id" TEXT NOT NULL,
    "fleetAssetId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "hoursLogged" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costAccrued" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FleetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetMaintenance" (
    "id" TEXT NOT NULL,
    "fleetAssetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vendorName" TEXT,
    "description" TEXT NOT NULL,
    "hoursDownTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FleetMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "employeeNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "hireDate" TIMESTAMP(3),
    "terminationDate" TIMESTAMP(3),
    "classification" TEXT,
    "unionLocal" TEXT,
    "craftCode" TEXT,
    "payType" TEXT NOT NULL DEFAULT 'HOURLY',
    "baseRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fringeRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "perDiemRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "burdenRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "w4Filing" TEXT,
    "state" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runLabel" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "payDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CALCULATED',
    "totalHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalGross" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalBurden" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isCertifiedPayroll" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRunLine" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "projectId" TEXT,
    "costCode" TEXT,
    "regularHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dtHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fringeRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "grossPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fringeAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "perDiem" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "burden" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRunLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertifiedPayrollRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "weekEnding" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT,
    "employeeName" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "craftCode" TEXT,
    "ssnLast4" TEXT,
    "hoursStRegular" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hoursStOt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rateBase" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "rateFringe" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "grossPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertifiedPayrollRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor1099Record" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "recipientTin" TEXT,
    "box1NonemployeeComp" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "box4FedTaxWithheld" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "box6PaymentsForServices" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "filedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor1099Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "materialType" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Received',
    "source" TEXT,
    "locationTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalEstimate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mode" "ProjectMode" NOT NULL,
    "title" TEXT NOT NULL,
    "projectType" TEXT,
    "geography" TEXT,
    "lineItemCode" TEXT,
    "unitCost" DECIMAL(65,30),
    "productionRate" DOUBLE PRECISION,
    "confidencePct" INTEGER,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentClass" "DocumentClass" NOT NULL,
    "folderPath" TEXT,
    "versionLabel" TEXT NOT NULL DEFAULT 'v1',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "effectiveAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTransmittal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "transmittalNo" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "recipientCompany" TEXT,
    "versionLabel" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "notes" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTransmittal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFI" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "question" TEXT,
    "response" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3),
    "ballInCourt" TEXT,
    "currentReviewerEmail" TEXT,
    "sentToReviewerAt" TIMESTAMP(3),
    "costImpactCents" INTEGER,
    "scheduleImpactDays" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "respondedAt" TIMESTAMP(3),
    "respondedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "approvalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RFI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submittal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "specSection" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "longLead" BOOLEAN NOT NULL DEFAULT false,
    "resubmittalCount" INTEGER NOT NULL DEFAULT 0,
    "currentReviewerEmail" TEXT,
    "sentToReviewerAt" TIMESTAMP(3),
    "scheduleFloatDaysUsed" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "approvalNote" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submittal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfiReviewer" (
    "id" TEXT NOT NULL,
    "rfiId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "reviewerEmail" TEXT NOT NULL,
    "reviewerName" TEXT,
    "reviewerRole" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "decidedAt" TIMESTAMP(3),
    "decision" TEXT,
    "holdReason" TEXT,
    "responseText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfiReviewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfiResponse" (
    "id" TEXT NOT NULL,
    "rfiId" TEXT NOT NULL,
    "respondedBy" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseText" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfiResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfiDrawingPin" (
    "id" TEXT NOT NULL,
    "rfiId" TEXT NOT NULL,
    "drawingSheetId" TEXT NOT NULL,
    "xRatio" DOUBLE PRECISION NOT NULL,
    "yRatio" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfiDrawingPin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmittalReviewer" (
    "id" TEXT NOT NULL,
    "submittalId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "reviewerEmail" TEXT NOT NULL,
    "reviewerName" TEXT,
    "reviewerRole" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "decidedAt" TIMESTAMP(3),
    "decision" TEXT,
    "holdReason" TEXT,
    "responseText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmittalReviewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmittalCycle" (
    "id" TEXT NOT NULL,
    "submittalId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decision" TEXT,
    "decidedBy" TEXT,
    "holdReason" TEXT,
    "responseText" TEXT,
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmittalCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "meetingType" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "location" TEXT,
    "attendees" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingActionItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignee" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "MeetingActionItemStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "logDate" TIMESTAMP(3) NOT NULL,
    "logType" "DailyLogType" NOT NULL DEFAULT 'GENERAL',
    "weather" TEXT,
    "summary" TEXT NOT NULL,
    "manpower" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "segment" TEXT,
    "station" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalValue" DECIMAL(65,30) NOT NULL,
    "currentValue" DECIMAL(65,30) NOT NULL,
    "forecastFinal" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "lineType" "BudgetLineType" NOT NULL,
    "budgetAmount" DECIMAL(65,30) NOT NULL,
    "committedCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuantityBudget" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "budgetQty" DOUBLE PRECISION NOT NULL,
    "installedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "earnedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "locationTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuantityBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "dailyLogId" TEXT,
    "activity" TEXT NOT NULL,
    "crewName" TEXT,
    "installedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "productionRate" DOUBLE PRECISION,
    "equipmentHours" DOUBLE PRECISION,
    "locationTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "materialType" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "source" TEXT,
    "destination" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyIncident" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "approvalNote" TEXT,
    "correctiveActions" TEXT,
    "segment" TEXT,
    "station" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "oshaClassification" TEXT,
    "bodyPart" TEXT,
    "injuryNature" TEXT,
    "rootCauseTreeJson" TEXT,
    "daysAwayCount" INTEGER NOT NULL DEFAULT 0,
    "daysRestrictedCount" INTEGER NOT NULL DEFAULT 0,
    "oshaCaseNumber" TEXT,
    "reportedToOshaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "SafetyIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyToolboxTalk" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "conductedAt" TIMESTAMP(3) NOT NULL,
    "conductedBy" TEXT,
    "attendeesJson" TEXT NOT NULL DEFAULT '[]',
    "contentText" TEXT,
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyToolboxTalk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobHazardAnalysis" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "taskDescription" TEXT,
    "preparedBy" TEXT,
    "reviewedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "stepsJson" TEXT NOT NULL DEFAULT '[]',
    "signOffsJson" TEXT NOT NULL DEFAULT '[]',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobHazardAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyObservation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "observerName" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT NOT NULL,
    "area" TEXT,
    "trade" TEXT,
    "description" TEXT NOT NULL,
    "correctiveAction" TEXT,
    "followUpNeeded" BOOLEAN NOT NULL DEFAULT false,
    "followUpClosedAt" TIMESTAMP(3),
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PunchItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "area" TEXT,
    "description" TEXT,
    "trade" TEXT,
    "assignedTo" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "approvalNote" TEXT,
    "segment" TEXT,
    "station" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "PunchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "coNumber" TEXT NOT NULL,
    "kind" "ChangeOrderKind" NOT NULL DEFAULT 'PCO',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reason" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "markupPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scheduleImpactDays" INTEGER NOT NULL DEFAULT 0,
    "scheduleImpactAppliedAt" TIMESTAMP(3),
    "status" "ChangeOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedById" TEXT,
    "approvedById" TEXT,
    "requestedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "approvalNote" TEXT,
    "executedAt" TIMESTAMP(3),
    "linkedRfiId" TEXT,
    "linkedSubmittalId" TEXT,
    "parentChangeOrderId" TEXT,
    "vendorId" TEXT,
    "laborAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "materialAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "equipmentAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "subAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "ohpAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrderLine" (
    "id" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "costCode" TEXT,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'LABOR',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unitCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "wbs" TEXT,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "durationDays" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "percentComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isMilestone" BOOLEAN NOT NULL DEFAULT false,
    "onCriticalPath" BOOLEAN NOT NULL DEFAULT false,
    "baselineStart" TIMESTAMP(3),
    "baselineEnd" TIMESTAMP(3),
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "responsible" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleBaseline" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedBy" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "payloadJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LookAheadCommitment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scheduleTaskId" TEXT,
    "weekStarting" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "responsibleParty" TEXT NOT NULL,
    "plannedComplete" BOOLEAN NOT NULL DEFAULT false,
    "actualComplete" BOOLEAN NOT NULL DEFAULT false,
    "reasonNotComplete" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LookAheadCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "csiDivision" TEXT,
    "csiSection" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorPrequalification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "formVersion" TEXT NOT NULL DEFAULT 'v1',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "yearsInBusiness" INTEGER,
    "annualRevenue" DECIMAL(65,30),
    "largestProjectValue" DECIMAL(65,30),
    "bondingCapacity" DECIMAL(65,30),
    "bondingAggregate" DECIMAL(65,30),
    "emrRate" DOUBLE PRECISION,
    "insuranceVerified" BOOLEAN NOT NULL DEFAULT false,
    "licenseVerified" BOOLEAN NOT NULL DEFAULT false,
    "workersCompCarrier" TEXT,
    "glLimitMillions" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "scoreBreakdownJson" TEXT NOT NULL DEFAULT '{}',
    "qualifiedFromValue" DECIMAL(65,30),
    "qualifiedToValue" DECIMAL(65,30),
    "qualifiedTrades" TEXT NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorPrequalification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopesJson" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "eventsJson" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastDeliveryAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "responseCode" INTEGER,
    "responseBody" TEXT,
    "durationMs" INTEGER,
    "succeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OWNER_REVIEWER',
    "scopeJson" TEXT NOT NULL DEFAULT '{}',
    "magicTokenHash" TEXT,
    "magicTokenExpiresAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDigest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "cadence" TEXT NOT NULL DEFAULT 'WEEKLY',
    "sectionsJson" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDigest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorReference" (
    "id" TEXT NOT NULL,
    "prequalId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "relationship" TEXT,
    "calledAt" TIMESTAMP(3),
    "outcomeRating" INTEGER,
    "outcomeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleDependency" (
    "id" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "type" "ScheduleDependencyType" NOT NULL DEFAULT 'FS',
    "lagDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "originalValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currentValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "retainagePct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "executedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "approvalNote" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractCommitment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "costCode" TEXT,
    "description" TEXT NOT NULL,
    "scope" TEXT,
    "committedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "invoicedToDate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paidToDate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayApplication" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT,
    "periodNumber" INTEGER NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "status" "PayApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "originalContractValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "changeOrderValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalContractValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "workCompletedToDate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "materialsStoredToDate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "retainagePct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "retainageHeld" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lessPreviousPayments" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currentPaymentDue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "approvalNote" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayApplicationLine" (
    "id" TEXT NOT NULL,
    "payApplicationId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "costCode" TEXT,
    "description" TEXT NOT NULL,
    "scheduledValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "workCompletedPrev" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "workCompletedThis" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "materialsStored" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCompleted" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "percentComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceToFinish" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "retainage" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayApplicationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LienWaiver" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT,
    "waiverType" "LienWaiverType" NOT NULL,
    "partyName" TEXT NOT NULL,
    "throughDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "LienWaiverStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3),
    "receivedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "approvalNote" TEXT,
    "documentUrl" TEXT,
    "notes" TEXT,
    "parentWaiverId" TEXT,
    "subInvoiceId" TEXT,
    "statutoryFormState" TEXT,
    "notarized" BOOLEAN NOT NULL DEFAULT false,
    "notarizedAt" TIMESTAMP(3),
    "notaryName" TEXT,
    "generationSource" TEXT NOT NULL DEFAULT 'UPLOADED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LienWaiver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "permitId" TEXT,
    "kind" "InspectionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "inspector" TEXT,
    "location" TEXT,
    "result" "InspectionResult" NOT NULL DEFAULT 'PENDING',
    "followUpNeeded" BOOLEAN NOT NULL DEFAULT false,
    "followUpNotes" TEXT,
    "checklistJson" TEXT NOT NULL DEFAULT '[]',
    "externalId" TEXT,
    "sourceSystem" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityChecklistTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trade" TEXT,
    "itemsJson" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NonConformanceReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "ncrNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MAJOR',
    "description" TEXT NOT NULL,
    "rootCause" TEXT,
    "disposition" TEXT,
    "correctiveAction" TEXT,
    "preventiveAction" TEXT,
    "attachmentUrl" TEXT,
    "raisedById" TEXT,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "costImpact" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "scheduleImpactDays" INTEGER NOT NULL DEFAULT 0,
    "linkedRfiId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NonConformanceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloseoutPackage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "checklistJson" TEXT NOT NULL DEFAULT '[]',
    "completionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ownerAcceptedAt" TIMESTAMP(3),
    "ownerAcceptedBy" TEXT,
    "punchListClosedAt" TIMESTAMP(3),
    "warrantyStartAt" TIMESTAMP(3),
    "warrantyEndAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloseoutPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "clientName" TEXT,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'LEAD',
    "estimatedValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 20,
    "dueDate" TIMESTAMP(3),
    "awardDate" TIMESTAMP(3),
    "notes" TEXT,
    "ownerName" TEXT,
    "source" TEXT,
    "mode" "ProjectMode" NOT NULL DEFAULT 'VERTICAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "trade" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "emrRate" DOUBLE PRECISION,
    "ein" TEXT,
    "prequalStatus" "PrequalificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "prequalScore" INTEGER,
    "prequalExpires" TIMESTAMP(3),
    "bondingCapacity" DECIMAL(65,30),
    "defaultCostCode" TEXT,
    "defaultAccountCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceCert" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "type" "InsuranceType" NOT NULL,
    "carrier" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "limitEach" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "limitAggregate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "certificateUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsuranceCert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidPackage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "scopeSummary" TEXT,
    "dueDate" TIMESTAMP(3),
    "estimatedValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "BidPackageStatus" NOT NULL DEFAULT 'PLANNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubBid" (
    "id" TEXT NOT NULL,
    "bidPackageId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "bidAmount" DECIMAL(65,30),
    "daysToComplete" INTEGER,
    "inclusions" TEXT,
    "exclusions" TEXT,
    "clarifications" TEXT,
    "voluntaryAlternates" TEXT,
    "status" "SubBidStatus" NOT NULL DEFAULT 'INVITED',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubBidLine" (
    "id" TEXT NOT NULL,
    "subBidId" TEXT NOT NULL,
    "scopeItemKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "uom" TEXT,
    "unitPrice" DECIMAL(65,30),
    "amount" DECIMAL(65,30) NOT NULL,
    "costCode" TEXT,
    "inclusion" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubBidLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidLevelingResult" (
    "id" TEXT NOT NULL,
    "bidPackageId" TEXT NOT NULL,
    "scopeItemKey" TEXT NOT NULL,
    "awardedToSubBidId" TEXT NOT NULL,
    "rationale" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" TEXT,

    CONSTRAINT "BidLevelingResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalProgram" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerName" TEXT,
    "ownerType" TEXT,
    "totalBudget" DECIMAL(65,30),
    "contingency" DECIMAL(65,30),
    "fundingSource" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapitalProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalProgramProject" (
    "id" TEXT NOT NULL,
    "capitalProgramId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "programBudget" DECIMAL(65,30),
    "drawSchedule" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapitalProgramProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "trade" TEXT,
    "weekEnding" TIMESTAMP(3) NOT NULL,
    "regularHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "doubleTimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "costCode" TEXT,
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "approvalNote" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntryComment" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COMMENT',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntryComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubInvoice" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "retainageHeld" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netDue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "SubInvoiceStatus" NOT NULL DEFAULT 'RECEIVED',
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "approvalNote" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "waiverReceived" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "purchaseOrderId" TEXT,
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchVarianceCents" INTEGER NOT NULL DEFAULT 0,
    "isJointCheck" BOOLEAN NOT NULL DEFAULT false,
    "jointPartyName" TEXT,
    "jointPartyTaxId" TEXT,
    "subDefaultPremium" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "SubInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubInvoiceLine" (
    "id" TEXT NOT NULL,
    "subInvoiceId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "costCode" TEXT,
    "quantity" DOUBLE PRECISION,
    "unitPrice" DECIMAL(65,30),
    "amount" DECIMAL(65,30) NOT NULL,
    "poLineId" TEXT,
    "retainage" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "invoicedToDate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectionReason" TEXT,
    "approvalNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "expectedDelivery" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "costCode" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "uom" TEXT,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "receivedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoicedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderReceipt" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "receivedBy" TEXT,
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "damageNoted" BOOLEAN NOT NULL DEFAULT false,
    "damageNotes" TEXT,
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "poLineId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reportedBy" TEXT,
    "assignedTo" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "WarrantyStatus" NOT NULL DEFAULT 'OPEN',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "warrantyExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "permitType" TEXT NOT NULL,
    "permitNumber" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "jurisdictionUrl" TEXT,
    "portalId" TEXT,
    "status" "PermitStatus" NOT NULL DEFAULT 'PLANNED',
    "appliedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "finaledAt" TIMESTAMP(3),
    "holder" TEXT,
    "contractor" TEXT,
    "scopeDescription" TEXT,
    "fee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "autoLookupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLookupAt" TIMESTAMP(3),
    "lastLookupStatus" "InspectionLookupStatus" NOT NULL DEFAULT 'NEVER',
    "lastLookupNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermitPrerequisite" (
    "id" TEXT NOT NULL,
    "dependentPermitId" TEXT NOT NULL,
    "requiredPermitId" TEXT NOT NULL,
    "requiredStatus" "PermitStatus" NOT NULL DEFAULT 'ISSUED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermitPrerequisite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorLicense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractorName" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "licenseType" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastVerifiedAt" TIMESTAMP(3),
    "verifySourceUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorLicense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionChecklistItem" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "codeReference" TEXT,
    "status" "InspectionItemStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "photoUrl" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionAttachment" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfpSource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "agencyHint" TEXT,
    "catalogId" TEXT,
    "cadence" TEXT NOT NULL DEFAULT 'DAILY',
    "naicsFilter" TEXT,
    "keywordsJson" TEXT NOT NULL DEFAULT '[]',
    "setAsideFilter" TEXT,
    "status" "RfpSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "geoScope" TEXT,
    "geoCity" TEXT,
    "geoState" TEXT,
    "geoCountry" TEXT DEFAULT 'US',
    "authType" TEXT NOT NULL DEFAULT 'NONE',
    "authUsername" TEXT,
    "authPasswordEnc" TEXT,
    "authApiKeyEnc" TEXT,
    "authCookieJar" TEXT,
    "authNotes" TEXT,
    "autoLogin" BOOLEAN NOT NULL DEFAULT false,
    "autoDraftEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoDraftMinScore" INTEGER NOT NULL DEFAULT 70,
    "lastAuthAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckNote" TEXT,
    "lastResultCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RfpSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitationPortalCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "agencyKind" "AgencyKind" NOT NULL DEFAULT 'FEDERAL',
    "agencyTier" "AgencyTier" NOT NULL DEFAULT 'CIVILIAN',
    "agencyName" TEXT,
    "geoScope" TEXT NOT NULL,
    "geoCity" TEXT,
    "geoState" TEXT,
    "geoCountry" TEXT NOT NULL DEFAULT 'US',
    "authType" TEXT NOT NULL DEFAULT 'NONE',
    "signupUrl" TEXT,
    "description" TEXT,
    "naicsFocus" TEXT,
    "setAsideFocus" TEXT,
    "scraperKind" "ScraperKind" NOT NULL DEFAULT 'MANUAL',
    "scraperModule" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastVerifiedOk" BOOLEAN,
    "lastVerifiedCount" INTEGER,
    "lastVerifiedNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolicitationPortalCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfpListing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "agencyKind" "AgencyKind",
    "agencyTier" "AgencyTier",
    "solicitationNo" TEXT,
    "url" TEXT,
    "summary" TEXT,
    "estimatedValue" DECIMAL(65,30),
    "dueAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "setAside" TEXT,
    "naicsCode" TEXT,
    "placeOfPerformance" TEXT,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "status" "RfpListingStatus" NOT NULL DEFAULT 'NEW',
    "score" INTEGER,
    "scoreExplanation" TEXT,
    "autoDrafted" BOOLEAN NOT NULL DEFAULT false,
    "autoDraftedAt" TIMESTAMP(3),
    "autoDraftError" TEXT,
    "opportunityId" TEXT,
    "ownerName" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RfpListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantBidProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "targetNaicsJson" TEXT NOT NULL DEFAULT '[]',
    "qualifiedSetAsidesJson" TEXT NOT NULL DEFAULT '[]',
    "targetStatesJson" TEXT NOT NULL DEFAULT '[]',
    "targetCitiesJson" TEXT NOT NULL DEFAULT '[]',
    "minValue" DECIMAL(65,30),
    "maxValue" DECIMAL(65,30),
    "boostKeywordsJson" TEXT NOT NULL DEFAULT '[]',
    "blockKeywordsJson" TEXT NOT NULL DEFAULT '[]',
    "preferredTiersJson" TEXT NOT NULL DEFAULT '[]',
    "hotThreshold" INTEGER NOT NULL DEFAULT 70,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantBidProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidDraft" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rfpListingId" TEXT,
    "opportunityId" TEXT,
    "title" TEXT NOT NULL,
    "status" "BidDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "totalValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "overheadPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "profitPct" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "winThemes" TEXT,
    "keyDifferentiators" TEXT,
    "modelUsed" TEXT NOT NULL DEFAULT 'stub-v1',
    "authorName" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidDraftLineItem" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "costCode" TEXT,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'LABOR',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unitCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "laborCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "materialCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "equipmentCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "subCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "markupPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidDraftLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueProjection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "forecastRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "forecastCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "forecastMargin" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "source" TEXT NOT NULL DEFAULT 'schedule-derived',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueProjection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "link" TEXT,
    "projectId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidDraftSection" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "heading" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BidDraftSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCheck" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overall" "ComplianceOutcome" NOT NULL DEFAULT 'PENDING',
    "summary" TEXT,

    CONSTRAINT "ComplianceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "outcome" "ComplianceOutcome" NOT NULL DEFAULT 'PENDING',
    "evidence" TEXT,
    "source" TEXT,

    CONSTRAINT "ComplianceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "reopenReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdjustingEntry" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedBy" TEXT,
    "reversingDate" TIMESTAMP(3),
    "notes" TEXT,
    "linesJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdjustingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceSheetSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "cash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "accountsReceivable" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "retainageReceivable" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "costsInExcess" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "inventory" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fixedAssetsNet" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "otherAssets" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAssets" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "accountsPayable" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "retainagePayable" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "billingsInExcess" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "accruedExpenses" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "longTermDebt" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "otherLiabilities" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalLiabilities" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paidInCapital" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "retainedEarnings" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currentEarnings" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalEquity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceSheetSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFlowForecast" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "weekStarting" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "projectId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "scenario" TEXT NOT NULL DEFAULT 'base',
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'calc',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashFlowForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFlowStatement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "operatingActivities" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "investingActivities" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "financingActivities" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netChange" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "beginningCash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "endingCash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'calc',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashFlowStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XeroConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "xeroTenantId" TEXT,
    "organizationName" TEXT,
    "status" "XeroConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT NOT NULL DEFAULT '',
    "connectedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncNote" TEXT,

    CONSTRAINT "XeroConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QboConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "realmId" TEXT,
    "organizationName" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "status" "QboConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT NOT NULL DEFAULT '',
    "connectedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncNote" TEXT,

    CONSTRAINT "QboConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "journalEntryType" "JournalEntryType" NOT NULL DEFAULT 'OPERATING_EXPENSE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialStatement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "statementType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "revenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cogs" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "grossProfit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "opex" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "ebitda" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netIncome" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceRef" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntryRow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "xeroId" TEXT,
    "qboId" TEXT,
    "externalSource" TEXT,
    "reference" TEXT,
    "memo" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "entryType" "JournalEntryType" NOT NULL DEFAULT 'OPERATING_EXPENSE',
    "amount" DECIMAL(65,30) NOT NULL,
    "vendorName" TEXT,
    "projectId" TEXT,
    "costCode" TEXT,
    "allocationConfidence" INTEGER,
    "reconciliationStatus" "CostReconciliationStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "reconciledBy" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'xero-sync',
    "emailMessageId" TEXT,
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntryRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPnlSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "approvedCOValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalContractValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "billedToDate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "costsToDate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "committedCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "forecastFinalCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "forecastGrossMargin" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "percentComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wipOverUnder" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cashOnHand" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lastReconciledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectPnlSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceInboxConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google-workspace',
    "mailbox" TEXT NOT NULL,
    "labelFilter" TEXT NOT NULL DEFAULT 'Invoices',
    "senderAllowlist" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),
    "lastPollStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceInboxConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceInboxMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalMessageId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "vendorGuess" TEXT,
    "amountGuess" DECIMAL(65,30),
    "projectGuessId" TEXT,
    "costCodeGuess" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "attachmentUrl" TEXT,
    "journalRowId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceInboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalImport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" "HistoricalImportKind" NOT NULL,
    "label" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "fileUrl" TEXT,
    "fileKey" TEXT,
    "uploadedBy" TEXT,
    "status" "HistoricalImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "aiModel" TEXT NOT NULL DEFAULT 'bcon-reviewer-v1',
    "aiSummary" TEXT,
    "aiFlagsJson" TEXT NOT NULL DEFAULT '[]',
    "rowsDetected" INTEGER NOT NULL DEFAULT 0,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "totalDollarValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "columnsJson" TEXT NOT NULL DEFAULT '[]',
    "headerRowJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalImportRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "dataJson" TEXT NOT NULL,
    "extractedJson" TEXT NOT NULL DEFAULT '{}',
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "issuesJson" TEXT NOT NULL DEFAULT '[]',
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRunLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "outputJson" TEXT NOT NULL,
    "confidence" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'heuristic',
    "userFeedback" TEXT,
    "feedbackNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COMMENT',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drawing" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "setName" TEXT NOT NULL,
    "discipline" "DrawingDiscipline" NOT NULL DEFAULT 'OTHER',
    "revisionNumber" INTEGER NOT NULL DEFAULT 0,
    "issuedDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drawing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingRevision" (
    "id" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "revisionLabel" TEXT NOT NULL,
    "issuedDate" TIMESTAMP(3) NOT NULL,
    "issuedBy" TEXT,
    "reason" TEXT,
    "superseded" BOOLEAN NOT NULL DEFAULT false,
    "supersededAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingSheet" (
    "id" TEXT NOT NULL,
    "drawingId" TEXT NOT NULL,
    "sheetNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT,
    "pageNumber" INTEGER,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "scale" TEXT,
    "drawnBy" TEXT,
    "checkedBy" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingMarkup" (
    "id" TEXT NOT NULL,
    "drawingSheetId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "shape" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#ef4444',
    "strokeWidth" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "geometryJson" TEXT NOT NULL,
    "noteText" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingMarkup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPhoto" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "albumId" TEXT,
    "fileUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "caption" TEXT,
    "capturedAt" TIMESTAMP(3),
    "geoLat" DOUBLE PRECISION,
    "geoLng" DOUBLE PRECISION,
    "geoAccuracyM" DOUBLE PRECISION,
    "weatherJson" TEXT,
    "aiTagsJson" TEXT NOT NULL DEFAULT '[]',
    "uploadedById" TEXT,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPhotoAlbum" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverPhotoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectPhotoAlbum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPhotoPin" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "drawingSheetId" TEXT NOT NULL,
    "xRatio" DOUBLE PRECISION NOT NULL,
    "yRatio" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPhotoPin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecSection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "csiDivision" TEXT NOT NULL,
    "sectionCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT,
    "revisionNumber" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'US',
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "laborCategory" TEXT,
    "primarySkill" TEXT,
    "skillsJson" TEXT NOT NULL DEFAULT '[]',
    "resumeUrl" TEXT,
    "linkedInUrl" TEXT,
    "rateExpectation" DECIMAL(65,30),
    "source" TEXT,
    "ownerUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRequisition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "reqNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hiringManager" TEXT,
    "laborCategory" TEXT,
    "location" TEXT,
    "remoteAllowed" BOOLEAN NOT NULL DEFAULT false,
    "rateMin" DECIMAL(65,30),
    "rateMax" DECIMAL(65,30),
    "status" "JobReqStatus" NOT NULL DEFAULT 'DRAFT',
    "openings" INTEGER NOT NULL DEFAULT 1,
    "filledCount" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "postedDate" TIMESTAMP(3),
    "targetStartDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "reqId" TEXT NOT NULL,
    "stage" "SubmissionStage" NOT NULL DEFAULT 'SUBMITTED',
    "recruiterName" TEXT,
    "rateOffered" DECIMAL(65,30),
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "submissionId" TEXT,
    "projectId" TEXT,
    "contractRef" TEXT,
    "laborCategory" TEXT,
    "department" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "billRate" DECIMAL(65,30),
    "payRate" DECIMAL(65,30),
    "status" "PlacementStatus" NOT NULL DEFAULT 'PENDING_START',
    "performanceNote" TEXT,
    "redeployable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appliesTo" "CommissionSourceType" NOT NULL,
    "recipientRole" "UserRoleTemplate",
    "ratePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "flatAmount" DECIMAL(65,30),
    "cap" DECIMAL(65,30),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "notesJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionAccrual" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientRole" "UserRoleTemplate",
    "recipientUserId" TEXT,
    "sourceType" "CommissionSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "basis" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "ratePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "CommissionStatus" NOT NULL DEFAULT 'ACCRUED',
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionAccrual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptureRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "title" TEXT NOT NULL,
    "agency" TEXT,
    "subAgency" TEXT,
    "contractVehicle" TEXT,
    "solicitationNumber" TEXT,
    "naicsCode" TEXT,
    "setAside" "SetAsideCode" NOT NULL DEFAULT 'NONE',
    "estimatedValue" DECIMAL(65,30),
    "rfpReleaseDate" TIMESTAMP(3),
    "proposalDueDate" TIMESTAMP(3),
    "awardDate" TIMESTAMP(3),
    "stage" "CaptureStage" NOT NULL DEFAULT 'IDENTIFIED',
    "captureLead" TEXT,
    "proposalLead" TEXT,
    "pricingLead" TEXT,
    "winStrategy" TEXT,
    "capturePlanUrl" TEXT,
    "discriminators" TEXT,
    "pwinPercent" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaptureRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptureMilestone" (
    "id" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "ownerName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptureMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColorTeamReview" (
    "id" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "phase" "ColorTeamPhase" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "facilitator" TEXT,
    "attendees" TEXT,
    "scoreOverall" INTEGER,
    "summaryUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ColorTeamReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoNoGoDecision" (
    "id" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "decisionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" "GoNoGoDecisionType" NOT NULL,
    "decidedBy" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "conditions" TEXT,
    "pwinAtDecision" DOUBLE PRECISION,
    "bidNoBidScore" DOUBLE PRECISION,

    CONSTRAINT "GoNoGoDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamingPartner" (
    "id" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "partnerName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "workSharePct" DOUBLE PRECISION,
    "taSignedAt" TIMESTAMP(3),
    "ndaSignedAt" TIMESTAMP(3),
    "capabilitiesJson" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamingPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingPath" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT,
    "placementId" TEXT,
    "personName" TEXT NOT NULL,
    "role" TEXT,
    "startDateTarget" TIMESTAMP(3),
    "status" "OnboardingPathStatus" NOT NULL DEFAULT 'PLANNED',
    "ownerName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingStep" (
    "id" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "kind" "OnboardingStepKind" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "status" "OnboardingStepStatus" NOT NULL DEFAULT 'PENDING',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "documentUrl" TEXT,
    "blocker" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "dailyLogId" TEXT,
    "assignedDate" TIMESTAMP(3) NOT NULL,
    "crewName" TEXT NOT NULL,
    "foreman" TEXT,
    "costCode" TEXT NOT NULL DEFAULT '',
    "activity" TEXT,
    "plannedHeadcount" INTEGER NOT NULL DEFAULT 0,
    "actualHeadcount" INTEGER NOT NULL DEFAULT 0,
    "plannedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shift" TEXT,
    "notes" TEXT,
    "segment" TEXT,
    "station" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrewAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "dbaName" TEXT,
    "ein" TEXT,
    "duns" TEXT,
    "cageCode" TEXT,
    "uei" TEXT,
    "entityType" TEXT,
    "yearFounded" INTEGER,
    "primaryAddress" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "naicsCodesJson" TEXT NOT NULL DEFAULT '[]',
    "samStatus" TEXT,
    "samExpiresAt" TIMESTAMP(3),
    "primaryContactName" TEXT,
    "primaryContactEmail" TEXT,
    "primaryContactPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyLicense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "licenseType" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "jurisdictionLevel" TEXT NOT NULL DEFAULT 'STATE',
    "state" TEXT,
    "jurisdiction" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "scopeOfWork" TEXT,
    "classification" TEXT,
    "bondingRequired" BOOLEAN NOT NULL DEFAULT false,
    "documentUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyLicense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyInsurance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyType" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "perOccurrenceLimit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "aggregateLimit" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deductible" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "statesCoveredJson" TEXT NOT NULL DEFAULT '[]',
    "additionalInsuredsJson" TEXT NOT NULL DEFAULT '[]',
    "waiverOfSubrogation" BOOLEAN NOT NULL DEFAULT false,
    "primaryAndNoncontributory" BOOLEAN NOT NULL DEFAULT false,
    "documentUrl" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyInsurance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyBond" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bondType" TEXT NOT NULL,
    "surety" TEXT NOT NULL,
    "bondNumber" TEXT,
    "capacityAggregate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "capacitySingle" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "bondAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "effectiveDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "premium" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "rate" DOUBLE PRECISION,
    "documentUrl" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBond_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyCertification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "certificationType" TEXT NOT NULL,
    "certifyingAgency" TEXT NOT NULL,
    "certificateNumber" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "state" TEXT,
    "jurisdiction" TEXT,
    "scope" TEXT,
    "documentUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySafetyMetric" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportingYear" INTEGER NOT NULL,
    "emrRate" DOUBLE PRECISION,
    "trirRate" DOUBLE PRECISION,
    "dartRate" DOUBLE PRECISION,
    "laborHours" DOUBLE PRECISION,
    "recordableCount" INTEGER NOT NULL DEFAULT 0,
    "fatalityCount" INTEGER NOT NULL DEFAULT 0,
    "oshaCitations" INTEGER NOT NULL DEFAULT 0,
    "oshaForm300aUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySafetyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectComplianceLink" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requirementType" TEXT NOT NULL,
    "companyLicenseId" TEXT,
    "companyInsuranceId" TEXT,
    "companyBondId" TEXT,
    "companyCertificationId" TEXT,
    "requirementText" TEXT,
    "satisfied" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectComplianceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JurisdictionPortal" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "county" TEXT,
    "state" TEXT NOT NULL DEFAULT 'SC',
    "baseUrl" TEXT,
    "adapter" TEXT NOT NULL,
    "platformNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JurisdictionPortal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantJurisdictionAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "accountLabel" TEXT,
    "usernameEnc" TEXT,
    "passwordEnc" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncOk" BOOLEAN,
    "lastSyncNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantJurisdictionAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionSyncRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "inspectionsFetched" INTEGER NOT NULL DEFAULT 0,
    "inspectionsCreated" INTEGER NOT NULL DEFAULT 0,
    "inspectionsUpdated" INTEGER NOT NULL DEFAULT 0,
    "alertsCreated" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "durationMs" INTEGER,

    CONSTRAINT "InspectionSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "googleServiceAccountJsonEnc" TEXT,
    "googleAdminSubject" TEXT,
    "googlePubsubTopic" TEXT,
    "m365TenantId" TEXT,
    "m365ClientId" TEXT,
    "m365ClientSecretEnc" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "lastError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastUsersSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mailbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "providerUserId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "toAddressesJson" TEXT NOT NULL DEFAULT '[]',
    "subject" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "snippet" TEXT,
    "bodyText" TEXT,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "labelsJson" TEXT NOT NULL DEFAULT '[]',
    "classification" TEXT,
    "confidence" DOUBLE PRECISION,
    "classModel" TEXT,
    "classReasoning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "AutomationConfig_enabled_nextDueAt_idx" ON "AutomationConfig"("enabled", "nextDueAt");

-- CreateIndex
CREATE INDEX "AutomationConfig_tenantId_idx" ON "AutomationConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationConfig_tenantId_workflowKey_key" ON "AutomationConfig"("tenantId", "workflowKey");

-- CreateIndex
CREATE INDEX "AutomationRun_tenantId_workflowKey_startedAt_idx" ON "AutomationRun"("tenantId", "workflowKey", "startedAt");

-- CreateIndex
CREATE INDEX "AutomationRun_tenantId_startedAt_idx" ON "AutomationRun"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "AutomationRun_configId_startedAt_idx" ON "AutomationRun"("configId", "startedAt");

-- CreateIndex
CREATE INDEX "BusinessUnit_tenantId_idx" ON "BusinessUnit"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUnit_tenantId_code_key" ON "BusinessUnit"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ConsolidatedReport_tenantId_idx" ON "ConsolidatedReport"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsolidatedReport_tenantId_periodLabel_reportType_key" ON "ConsolidatedReport"("tenantId", "periodLabel", "reportType");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "Company_tenantId_idx" ON "Company"("tenantId");

-- CreateIndex
CREATE INDEX "Contact_tenantId_idx" ON "Contact"("tenantId");

-- CreateIndex
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_tenantId_code_key" ON "Project"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Thread_projectId_idx" ON "Thread"("projectId");

-- CreateIndex
CREATE INDEX "ThreadMessage_threadId_idx" ON "ThreadMessage"("threadId");

-- CreateIndex
CREATE INDEX "ThreadMessage_authorId_idx" ON "ThreadMessage"("authorId");

-- CreateIndex
CREATE INDEX "ThreadMessage_createdAt_idx" ON "ThreadMessage"("createdAt");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
CREATE INDEX "WorkflowTemplate_tenantId_idx" ON "WorkflowTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "WorkflowRun_projectId_idx" ON "WorkflowRun"("projectId");

-- CreateIndex
CREATE INDEX "WorkflowRun_projectId_entityType_entityId_status_idx" ON "WorkflowRun"("projectId", "entityType", "entityId", "status");

-- CreateIndex
CREATE INDEX "Watcher_projectId_idx" ON "Watcher"("projectId");

-- CreateIndex
CREATE INDEX "Watcher_userId_idx" ON "Watcher"("userId");

-- CreateIndex
CREATE INDEX "Watcher_workflowRunId_idx" ON "Watcher"("workflowRunId");

-- CreateIndex
CREATE INDEX "NotificationRule_tenantId_idx" ON "NotificationRule"("tenantId");

-- CreateIndex
CREATE INDEX "ApprovalRoute_projectId_idx" ON "ApprovalRoute"("projectId");

-- CreateIndex
CREATE INDEX "EquipmentRecord_projectId_idx" ON "EquipmentRecord"("projectId");

-- CreateIndex
CREATE INDEX "FleetAsset_tenantId_idx" ON "FleetAsset"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FleetAsset_tenantId_assetTag_key" ON "FleetAsset"("tenantId", "assetTag");

-- CreateIndex
CREATE INDEX "FleetAssignment_fleetAssetId_idx" ON "FleetAssignment"("fleetAssetId");

-- CreateIndex
CREATE INDEX "FleetAssignment_projectId_idx" ON "FleetAssignment"("projectId");

-- CreateIndex
CREATE INDEX "FleetMaintenance_fleetAssetId_idx" ON "FleetMaintenance"("fleetAssetId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_idx" ON "Employee"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_tenantId_employeeNumber_key" ON "Employee"("tenantId", "employeeNumber");

-- CreateIndex
CREATE INDEX "PayrollRun_tenantId_idx" ON "PayrollRun"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_tenantId_runLabel_key" ON "PayrollRun"("tenantId", "runLabel");

-- CreateIndex
CREATE INDEX "PayrollRunLine_payrollRunId_idx" ON "PayrollRunLine"("payrollRunId");

-- CreateIndex
CREATE INDEX "PayrollRunLine_employeeId_idx" ON "PayrollRunLine"("employeeId");

-- CreateIndex
CREATE INDEX "CertifiedPayrollRecord_tenantId_weekEnding_idx" ON "CertifiedPayrollRecord"("tenantId", "weekEnding");

-- CreateIndex
CREATE INDEX "Vendor1099Record_tenantId_taxYear_idx" ON "Vendor1099Record"("tenantId", "taxYear");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor1099Record_tenantId_vendorId_taxYear_key" ON "Vendor1099Record"("tenantId", "vendorId", "taxYear");

-- CreateIndex
CREATE INDEX "MaterialRecord_projectId_idx" ON "MaterialRecord"("projectId");

-- CreateIndex
CREATE INDEX "HistoricalEstimate_tenantId_idx" ON "HistoricalEstimate"("tenantId");

-- CreateIndex
CREATE INDEX "Document_projectId_idx" ON "Document"("projectId");

-- CreateIndex
CREATE INDEX "Document_expiresAt_idx" ON "Document"("expiresAt");

-- CreateIndex
CREATE INDEX "DocumentTransmittal_documentId_idx" ON "DocumentTransmittal"("documentId");

-- CreateIndex
CREATE INDEX "DocumentTransmittal_tenantId_sentAt_idx" ON "DocumentTransmittal"("tenantId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTransmittal_tenantId_transmittalNo_key" ON "DocumentTransmittal"("tenantId", "transmittalNo");

-- CreateIndex
CREATE INDEX "RFI_projectId_idx" ON "RFI"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "RFI_projectId_number_key" ON "RFI"("projectId", "number");

-- CreateIndex
CREATE INDEX "Submittal_projectId_idx" ON "Submittal"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Submittal_projectId_number_key" ON "Submittal"("projectId", "number");

-- CreateIndex
CREATE INDEX "RfiReviewer_rfiId_idx" ON "RfiReviewer"("rfiId");

-- CreateIndex
CREATE UNIQUE INDEX "RfiReviewer_rfiId_position_key" ON "RfiReviewer"("rfiId", "position");

-- CreateIndex
CREATE INDEX "RfiResponse_rfiId_idx" ON "RfiResponse"("rfiId");

-- CreateIndex
CREATE INDEX "RfiDrawingPin_rfiId_idx" ON "RfiDrawingPin"("rfiId");

-- CreateIndex
CREATE INDEX "RfiDrawingPin_drawingSheetId_idx" ON "RfiDrawingPin"("drawingSheetId");

-- CreateIndex
CREATE INDEX "SubmittalReviewer_submittalId_idx" ON "SubmittalReviewer"("submittalId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmittalReviewer_submittalId_position_key" ON "SubmittalReviewer"("submittalId", "position");

-- CreateIndex
CREATE INDEX "SubmittalCycle_submittalId_idx" ON "SubmittalCycle"("submittalId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmittalCycle_submittalId_cycleNumber_key" ON "SubmittalCycle"("submittalId", "cycleNumber");

-- CreateIndex
CREATE INDEX "Meeting_projectId_idx" ON "Meeting"("projectId");

-- CreateIndex
CREATE INDEX "MeetingActionItem_meetingId_idx" ON "MeetingActionItem"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingActionItem_status_idx" ON "MeetingActionItem"("status");

-- CreateIndex
CREATE INDEX "DailyLog_projectId_createdAt_idx" ON "DailyLog"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Budget_projectId_idx" ON "Budget"("projectId");

-- CreateIndex
CREATE INDEX "BudgetLine_budgetId_idx" ON "BudgetLine"("budgetId");

-- CreateIndex
CREATE INDEX "QuantityBudget_projectId_idx" ON "QuantityBudget"("projectId");

-- CreateIndex
CREATE INDEX "ProductionEntry_projectId_createdAt_idx" ON "ProductionEntry"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductionEntry_dailyLogId_idx" ON "ProductionEntry"("dailyLogId");

-- CreateIndex
CREATE INDEX "Ticket_projectId_idx" ON "Ticket"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_projectId_ticketNumber_key" ON "Ticket"("projectId", "ticketNumber");

-- CreateIndex
CREATE INDEX "SafetyIncident_projectId_idx" ON "SafetyIncident"("projectId");

-- CreateIndex
CREATE INDEX "SafetyToolboxTalk_projectId_conductedAt_idx" ON "SafetyToolboxTalk"("projectId", "conductedAt");

-- CreateIndex
CREATE INDEX "JobHazardAnalysis_projectId_idx" ON "JobHazardAnalysis"("projectId");

-- CreateIndex
CREATE INDEX "SafetyObservation_projectId_observedAt_idx" ON "SafetyObservation"("projectId", "observedAt");

-- CreateIndex
CREATE INDEX "PunchItem_projectId_idx" ON "PunchItem"("projectId");

-- CreateIndex
CREATE INDEX "Approval_approverId_idx" ON "Approval"("approverId");

-- CreateIndex
CREATE INDEX "Approval_tenantId_targetType_targetId_idx" ON "Approval"("tenantId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- CreateIndex
CREATE INDEX "ChangeOrder_projectId_status_idx" ON "ChangeOrder"("projectId", "status");

-- CreateIndex
CREATE INDEX "ChangeOrder_parentChangeOrderId_idx" ON "ChangeOrder"("parentChangeOrderId");

-- CreateIndex
CREATE INDEX "ChangeOrder_vendorId_idx" ON "ChangeOrder"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrder_projectId_coNumber_key" ON "ChangeOrder"("projectId", "coNumber");

-- CreateIndex
CREATE INDEX "ChangeOrderLine_changeOrderId_idx" ON "ChangeOrderLine"("changeOrderId");

-- CreateIndex
CREATE INDEX "ScheduleTask_projectId_idx" ON "ScheduleTask"("projectId");

-- CreateIndex
CREATE INDEX "ScheduleTask_parentId_idx" ON "ScheduleTask"("parentId");

-- CreateIndex
CREATE INDEX "ScheduleBaseline_projectId_idx" ON "ScheduleBaseline"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleBaseline_projectId_label_key" ON "ScheduleBaseline"("projectId", "label");

-- CreateIndex
CREATE INDEX "LookAheadCommitment_projectId_weekStarting_idx" ON "LookAheadCommitment"("projectId", "weekStarting");

-- CreateIndex
CREATE INDEX "CostCode_tenantId_parentId_idx" ON "CostCode"("tenantId", "parentId");

-- CreateIndex
CREATE INDEX "CostCode_tenantId_csiDivision_idx" ON "CostCode"("tenantId", "csiDivision");

-- CreateIndex
CREATE UNIQUE INDEX "CostCode_tenantId_code_key" ON "CostCode"("tenantId", "code");

-- CreateIndex
CREATE INDEX "VendorPrequalification_tenantId_idx" ON "VendorPrequalification"("tenantId");

-- CreateIndex
CREATE INDEX "VendorPrequalification_vendorId_idx" ON "VendorPrequalification"("vendorId");

-- CreateIndex
CREATE INDEX "VendorPrequalification_expiresAt_idx" ON "VendorPrequalification"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VendorPrequalification_tenantId_vendorId_formVersion_key" ON "VendorPrequalification"("tenantId", "vendorId", "formVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_prefix_key" ON "ApiToken"("prefix");

-- CreateIndex
CREATE INDEX "ApiToken_tenantId_idx" ON "ApiToken"("tenantId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_tenantId_idx" ON "WebhookEndpoint"("tenantId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_endpointId_createdAt_idx" ON "WebhookDelivery"("endpointId", "createdAt");

-- CreateIndex
CREATE INDEX "GuestAccount_tenantId_idx" ON "GuestAccount"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestAccount_tenantId_email_key" ON "GuestAccount"("tenantId", "email");

-- CreateIndex
CREATE INDEX "EmailDigest_tenantId_idx" ON "EmailDigest"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDigest_tenantId_recipient_cadence_key" ON "EmailDigest"("tenantId", "recipient", "cadence");

-- CreateIndex
CREATE INDEX "VendorReference_prequalId_idx" ON "VendorReference"("prequalId");

-- CreateIndex
CREATE INDEX "ScheduleDependency_predecessorId_idx" ON "ScheduleDependency"("predecessorId");

-- CreateIndex
CREATE INDEX "ScheduleDependency_successorId_idx" ON "ScheduleDependency"("successorId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleDependency_predecessorId_successorId_key" ON "ScheduleDependency"("predecessorId", "successorId");

-- CreateIndex
CREATE INDEX "Contract_projectId_status_idx" ON "Contract"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_projectId_contractNumber_key" ON "Contract"("projectId", "contractNumber");

-- CreateIndex
CREATE INDEX "ContractCommitment_contractId_idx" ON "ContractCommitment"("contractId");

-- CreateIndex
CREATE INDEX "PayApplication_projectId_status_idx" ON "PayApplication"("projectId", "status");

-- CreateIndex
CREATE INDEX "PayApplication_contractId_idx" ON "PayApplication"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "PayApplication_projectId_periodNumber_key" ON "PayApplication"("projectId", "periodNumber");

-- CreateIndex
CREATE INDEX "PayApplicationLine_payApplicationId_idx" ON "PayApplicationLine"("payApplicationId");

-- CreateIndex
CREATE UNIQUE INDEX "PayApplicationLine_payApplicationId_lineNumber_key" ON "PayApplicationLine"("payApplicationId", "lineNumber");

-- CreateIndex
CREATE INDEX "LienWaiver_projectId_idx" ON "LienWaiver"("projectId");

-- CreateIndex
CREATE INDEX "LienWaiver_contractId_idx" ON "LienWaiver"("contractId");

-- CreateIndex
CREATE INDEX "LienWaiver_subInvoiceId_idx" ON "LienWaiver"("subInvoiceId");

-- CreateIndex
CREATE INDEX "LienWaiver_parentWaiverId_idx" ON "LienWaiver"("parentWaiverId");

-- CreateIndex
CREATE INDEX "Inspection_projectId_idx" ON "Inspection"("projectId");

-- CreateIndex
CREATE INDEX "Inspection_permitId_idx" ON "Inspection"("permitId");

-- CreateIndex
CREATE INDEX "QualityChecklistTemplate_tenantId_idx" ON "QualityChecklistTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "QualityChecklistTemplate_tenantId_name_key" ON "QualityChecklistTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "NonConformanceReport_projectId_idx" ON "NonConformanceReport"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "NonConformanceReport_projectId_ncrNumber_key" ON "NonConformanceReport"("projectId", "ncrNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CloseoutPackage_projectId_key" ON "CloseoutPackage"("projectId");

-- CreateIndex
CREATE INDEX "CloseoutPackage_projectId_idx" ON "CloseoutPackage"("projectId");

-- CreateIndex
CREATE INDEX "Opportunity_tenantId_idx" ON "Opportunity"("tenantId");

-- CreateIndex
CREATE INDEX "Opportunity_projectId_idx" ON "Opportunity"("projectId");

-- CreateIndex
CREATE INDEX "BidPackage_projectId_status_idx" ON "BidPackage"("projectId", "status");

-- CreateIndex
CREATE INDEX "SubBid_bidPackageId_idx" ON "SubBid"("bidPackageId");

-- CreateIndex
CREATE INDEX "SubBid_vendorId_idx" ON "SubBid"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "SubBid_bidPackageId_vendorId_key" ON "SubBid"("bidPackageId", "vendorId");

-- CreateIndex
CREATE INDEX "SubBidLine_subBidId_idx" ON "SubBidLine"("subBidId");

-- CreateIndex
CREATE INDEX "SubBidLine_scopeItemKey_idx" ON "SubBidLine"("scopeItemKey");

-- CreateIndex
CREATE INDEX "BidLevelingResult_bidPackageId_idx" ON "BidLevelingResult"("bidPackageId");

-- CreateIndex
CREATE UNIQUE INDEX "BidLevelingResult_bidPackageId_scopeItemKey_key" ON "BidLevelingResult"("bidPackageId", "scopeItemKey");

-- CreateIndex
CREATE INDEX "CapitalProgram_tenantId_idx" ON "CapitalProgram"("tenantId");

-- CreateIndex
CREATE INDEX "CapitalProgramProject_capitalProgramId_idx" ON "CapitalProgramProject"("capitalProgramId");

-- CreateIndex
CREATE INDEX "CapitalProgramProject_projectId_idx" ON "CapitalProgramProject"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CapitalProgramProject_capitalProgramId_projectId_key" ON "CapitalProgramProject"("capitalProgramId", "projectId");

-- CreateIndex
CREATE INDEX "TimeEntry_projectId_idx" ON "TimeEntry"("projectId");

-- CreateIndex
CREATE INDEX "TimeEntryComment_entryId_createdAt_idx" ON "TimeEntryComment"("entryId", "createdAt");

-- CreateIndex
CREATE INDEX "TimeEntryComment_authorId_idx" ON "TimeEntryComment"("authorId");

-- CreateIndex
CREATE INDEX "SubInvoice_projectId_idx" ON "SubInvoice"("projectId");

-- CreateIndex
CREATE INDEX "SubInvoice_vendorId_idx" ON "SubInvoice"("vendorId");

-- CreateIndex
CREATE INDEX "SubInvoice_purchaseOrderId_idx" ON "SubInvoice"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "SubInvoice_projectId_invoiceNumber_key" ON "SubInvoice"("projectId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "SubInvoiceLine_subInvoiceId_idx" ON "SubInvoiceLine"("subInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SubInvoiceLine_subInvoiceId_lineNumber_key" ON "SubInvoiceLine"("subInvoiceId", "lineNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_projectId_idx" ON "PurchaseOrder"("projectId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_vendorId_idx" ON "PurchaseOrder"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_projectId_poNumber_key" ON "PurchaseOrder"("projectId", "poNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_purchaseOrderId_idx" ON "PurchaseOrderLine"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderLine_purchaseOrderId_lineNumber_key" ON "PurchaseOrderLine"("purchaseOrderId", "lineNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrderReceipt_purchaseOrderId_idx" ON "PurchaseOrderReceipt"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderReceipt_purchaseOrderId_receiptNumber_key" ON "PurchaseOrderReceipt"("purchaseOrderId", "receiptNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrderReceiptLine_receiptId_idx" ON "PurchaseOrderReceiptLine"("receiptId");

-- CreateIndex
CREATE INDEX "PurchaseOrderReceiptLine_poLineId_idx" ON "PurchaseOrderReceiptLine"("poLineId");

-- CreateIndex
CREATE INDEX "Permit_projectId_idx" ON "Permit"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Permit_projectId_permitNumber_key" ON "Permit"("projectId", "permitNumber");

-- CreateIndex
CREATE INDEX "PermitPrerequisite_dependentPermitId_idx" ON "PermitPrerequisite"("dependentPermitId");

-- CreateIndex
CREATE INDEX "PermitPrerequisite_requiredPermitId_idx" ON "PermitPrerequisite"("requiredPermitId");

-- CreateIndex
CREATE UNIQUE INDEX "PermitPrerequisite_dependentPermitId_requiredPermitId_key" ON "PermitPrerequisite"("dependentPermitId", "requiredPermitId");

-- CreateIndex
CREATE INDEX "ContractorLicense_tenantId_idx" ON "ContractorLicense"("tenantId");

-- CreateIndex
CREATE INDEX "ContractorLicense_expiresAt_idx" ON "ContractorLicense"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorLicense_tenantId_licenseNumber_jurisdiction_key" ON "ContractorLicense"("tenantId", "licenseNumber", "jurisdiction");

-- CreateIndex
CREATE INDEX "InspectionChecklistItem_inspectionId_idx" ON "InspectionChecklistItem"("inspectionId");

-- CreateIndex
CREATE INDEX "InspectionAttachment_inspectionId_idx" ON "InspectionAttachment"("inspectionId");

-- CreateIndex
CREATE INDEX "RfpSource_tenantId_idx" ON "RfpSource"("tenantId");

-- CreateIndex
CREATE INDEX "RfpSource_catalogId_idx" ON "RfpSource"("catalogId");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitationPortalCatalog_url_key" ON "SolicitationPortalCatalog"("url");

-- CreateIndex
CREATE INDEX "SolicitationPortalCatalog_active_idx" ON "SolicitationPortalCatalog"("active");

-- CreateIndex
CREATE INDEX "SolicitationPortalCatalog_agencyKind_agencyTier_idx" ON "SolicitationPortalCatalog"("agencyKind", "agencyTier");

-- CreateIndex
CREATE INDEX "SolicitationPortalCatalog_scraperKind_idx" ON "SolicitationPortalCatalog"("scraperKind");

-- CreateIndex
CREATE INDEX "SolicitationPortalCatalog_lastVerifiedOk_scraperKind_idx" ON "SolicitationPortalCatalog"("lastVerifiedOk", "scraperKind");

-- CreateIndex
CREATE INDEX "RfpListing_tenantId_idx" ON "RfpListing"("tenantId");

-- CreateIndex
CREATE INDEX "RfpListing_sourceId_idx" ON "RfpListing"("sourceId");

-- CreateIndex
CREATE INDEX "RfpListing_tenantId_score_idx" ON "RfpListing"("tenantId", "score");

-- CreateIndex
CREATE INDEX "RfpListing_tenantId_dueAt_idx" ON "RfpListing"("tenantId", "dueAt");

-- CreateIndex
CREATE INDEX "RfpListing_tenantId_status_idx" ON "RfpListing"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RfpListing_tenantId_agency_solicitationNo_key" ON "RfpListing"("tenantId", "agency", "solicitationNo");

-- CreateIndex
CREATE UNIQUE INDEX "TenantBidProfile_tenantId_key" ON "TenantBidProfile"("tenantId");

-- CreateIndex
CREATE INDEX "TenantBidProfile_tenantId_idx" ON "TenantBidProfile"("tenantId");

-- CreateIndex
CREATE INDEX "BidDraft_tenantId_status_idx" ON "BidDraft"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BidDraftLineItem_draftId_idx" ON "BidDraftLineItem"("draftId");

-- CreateIndex
CREATE INDEX "RevenueProjection_projectId_idx" ON "RevenueProjection"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueProjection_projectId_periodStart_key" ON "RevenueProjection"("projectId", "periodStart");

-- CreateIndex
CREATE INDEX "AlertRule_tenantId_idx" ON "AlertRule"("tenantId");

-- CreateIndex
CREATE INDEX "AlertEvent_tenantId_severity_idx" ON "AlertEvent"("tenantId", "severity");

-- CreateIndex
CREATE INDEX "AlertEvent_projectId_idx" ON "AlertEvent"("projectId");

-- CreateIndex
CREATE INDEX "BidDraftSection_draftId_idx" ON "BidDraftSection"("draftId");

-- CreateIndex
CREATE INDEX "ComplianceCheck_draftId_idx" ON "ComplianceCheck"("draftId");

-- CreateIndex
CREATE INDEX "ComplianceItem_runId_idx" ON "ComplianceItem"("runId");

-- CreateIndex
CREATE INDEX "AccountingPeriod_tenantId_status_idx" ON "AccountingPeriod"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_tenantId_periodLabel_key" ON "AccountingPeriod"("tenantId", "periodLabel");

-- CreateIndex
CREATE INDEX "AdjustingEntry_periodId_idx" ON "AdjustingEntry"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "AdjustingEntry_periodId_entryNumber_key" ON "AdjustingEntry"("periodId", "entryNumber");

-- CreateIndex
CREATE INDEX "BalanceSheetSnapshot_tenantId_idx" ON "BalanceSheetSnapshot"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceSheetSnapshot_tenantId_asOf_key" ON "BalanceSheetSnapshot"("tenantId", "asOf");

-- CreateIndex
CREATE INDEX "CashFlowForecast_tenantId_weekStarting_idx" ON "CashFlowForecast"("tenantId", "weekStarting");

-- CreateIndex
CREATE INDEX "CashFlowForecast_projectId_idx" ON "CashFlowForecast"("projectId");

-- CreateIndex
CREATE INDEX "CashFlowStatement_tenantId_idx" ON "CashFlowStatement"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CashFlowStatement_tenantId_periodLabel_key" ON "CashFlowStatement"("tenantId", "periodLabel");

-- CreateIndex
CREATE UNIQUE INDEX "XeroConnection_tenantId_key" ON "XeroConnection"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "QboConnection_tenantId_key" ON "QboConnection"("tenantId");

-- CreateIndex
CREATE INDEX "ChartOfAccount_tenantId_idx" ON "ChartOfAccount"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_tenantId_code_key" ON "ChartOfAccount"("tenantId", "code");

-- CreateIndex
CREATE INDEX "FinancialStatement_tenantId_idx" ON "FinancialStatement"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialStatement_tenantId_statementType_periodStart_perio_key" ON "FinancialStatement"("tenantId", "statementType", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntryRow_xeroId_key" ON "JournalEntryRow"("xeroId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntryRow_qboId_key" ON "JournalEntryRow"("qboId");

-- CreateIndex
CREATE INDEX "JournalEntryRow_tenantId_idx" ON "JournalEntryRow"("tenantId");

-- CreateIndex
CREATE INDEX "JournalEntryRow_projectId_idx" ON "JournalEntryRow"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPnlSnapshot_projectId_key" ON "ProjectPnlSnapshot"("projectId");

-- CreateIndex
CREATE INDEX "ProjectPnlSnapshot_projectId_idx" ON "ProjectPnlSnapshot"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceInboxConnection_tenantId_key" ON "InvoiceInboxConnection"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceInboxMessage_externalMessageId_key" ON "InvoiceInboxMessage"("externalMessageId");

-- CreateIndex
CREATE INDEX "InvoiceInboxMessage_tenantId_idx" ON "InvoiceInboxMessage"("tenantId");

-- CreateIndex
CREATE INDEX "InvoiceInboxMessage_projectGuessId_idx" ON "InvoiceInboxMessage"("projectGuessId");

-- CreateIndex
CREATE INDEX "HistoricalImport_tenantId_idx" ON "HistoricalImport"("tenantId");

-- CreateIndex
CREATE INDEX "HistoricalImport_projectId_idx" ON "HistoricalImport"("projectId");

-- CreateIndex
CREATE INDEX "HistoricalImportRow_importId_idx" ON "HistoricalImportRow"("importId");

-- CreateIndex
CREATE INDEX "AiRunLog_tenantId_kind_inputHash_idx" ON "AiRunLog"("tenantId", "kind", "inputHash");

-- CreateIndex
CREATE INDEX "AiRunLog_tenantId_entityType_entityId_idx" ON "AiRunLog"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AiRunLog_tenantId_createdAt_idx" ON "AiRunLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "RecordComment_tenantId_entityType_entityId_createdAt_idx" ON "RecordComment"("tenantId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "RecordComment_tenantId_createdAt_idx" ON "RecordComment"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Drawing_projectId_idx" ON "Drawing"("projectId");

-- CreateIndex
CREATE INDEX "Drawing_projectId_discipline_idx" ON "Drawing"("projectId", "discipline");

-- CreateIndex
CREATE INDEX "DrawingRevision_drawingId_idx" ON "DrawingRevision"("drawingId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawingRevision_drawingId_revisionLabel_key" ON "DrawingRevision"("drawingId", "revisionLabel");

-- CreateIndex
CREATE INDEX "DrawingSheet_drawingId_idx" ON "DrawingSheet"("drawingId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawingSheet_drawingId_sheetNumber_key" ON "DrawingSheet"("drawingId", "sheetNumber");

-- CreateIndex
CREATE INDEX "DrawingMarkup_drawingSheetId_idx" ON "DrawingMarkup"("drawingSheetId");

-- CreateIndex
CREATE INDEX "ProjectPhoto_projectId_idx" ON "ProjectPhoto"("projectId");

-- CreateIndex
CREATE INDEX "ProjectPhoto_projectId_capturedAt_idx" ON "ProjectPhoto"("projectId", "capturedAt");

-- CreateIndex
CREATE INDEX "ProjectPhoto_albumId_idx" ON "ProjectPhoto"("albumId");

-- CreateIndex
CREATE INDEX "ProjectPhotoAlbum_projectId_idx" ON "ProjectPhotoAlbum"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPhotoAlbum_projectId_name_key" ON "ProjectPhotoAlbum"("projectId", "name");

-- CreateIndex
CREATE INDEX "ProjectPhotoPin_photoId_idx" ON "ProjectPhotoPin"("photoId");

-- CreateIndex
CREATE INDEX "ProjectPhotoPin_drawingSheetId_idx" ON "ProjectPhotoPin"("drawingSheetId");

-- CreateIndex
CREATE INDEX "SpecSection_projectId_idx" ON "SpecSection"("projectId");

-- CreateIndex
CREATE INDEX "SpecSection_projectId_csiDivision_idx" ON "SpecSection"("projectId", "csiDivision");

-- CreateIndex
CREATE UNIQUE INDEX "SpecSection_projectId_sectionCode_key" ON "SpecSection"("projectId", "sectionCode");

-- CreateIndex
CREATE INDEX "Candidate_tenantId_idx" ON "Candidate"("tenantId");

-- CreateIndex
CREATE INDEX "Candidate_tenantId_status_idx" ON "Candidate"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Candidate_tenantId_laborCategory_idx" ON "Candidate"("tenantId", "laborCategory");

-- CreateIndex
CREATE INDEX "JobRequisition_tenantId_status_idx" ON "JobRequisition"("tenantId", "status");

-- CreateIndex
CREATE INDEX "JobRequisition_projectId_idx" ON "JobRequisition"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "JobRequisition_tenantId_reqNumber_key" ON "JobRequisition"("tenantId", "reqNumber");

-- CreateIndex
CREATE INDEX "Submission_tenantId_idx" ON "Submission"("tenantId");

-- CreateIndex
CREATE INDEX "Submission_reqId_stage_idx" ON "Submission"("reqId", "stage");

-- CreateIndex
CREATE INDEX "Submission_candidateId_idx" ON "Submission"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_candidateId_reqId_key" ON "Submission"("candidateId", "reqId");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_submissionId_key" ON "Placement"("submissionId");

-- CreateIndex
CREATE INDEX "Placement_tenantId_idx" ON "Placement"("tenantId");

-- CreateIndex
CREATE INDEX "Placement_tenantId_status_idx" ON "Placement"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Placement_projectId_idx" ON "Placement"("projectId");

-- CreateIndex
CREATE INDEX "Placement_candidateId_idx" ON "Placement"("candidateId");

-- CreateIndex
CREATE INDEX "CommissionRule_tenantId_appliesTo_idx" ON "CommissionRule"("tenantId", "appliesTo");

-- CreateIndex
CREATE INDEX "CommissionRule_tenantId_active_idx" ON "CommissionRule"("tenantId", "active");

-- CreateIndex
CREATE INDEX "CommissionAccrual_tenantId_status_idx" ON "CommissionAccrual"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CommissionAccrual_tenantId_sourceType_sourceId_idx" ON "CommissionAccrual"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "CommissionAccrual_tenantId_recipientUserId_idx" ON "CommissionAccrual"("tenantId", "recipientUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CaptureRecord_opportunityId_key" ON "CaptureRecord"("opportunityId");

-- CreateIndex
CREATE INDEX "CaptureRecord_tenantId_idx" ON "CaptureRecord"("tenantId");

-- CreateIndex
CREATE INDEX "CaptureRecord_tenantId_stage_idx" ON "CaptureRecord"("tenantId", "stage");

-- CreateIndex
CREATE INDEX "CaptureRecord_tenantId_agency_idx" ON "CaptureRecord"("tenantId", "agency");

-- CreateIndex
CREATE INDEX "CaptureMilestone_captureId_idx" ON "CaptureMilestone"("captureId");

-- CreateIndex
CREATE INDEX "ColorTeamReview_captureId_idx" ON "ColorTeamReview"("captureId");

-- CreateIndex
CREATE INDEX "ColorTeamReview_captureId_phase_idx" ON "ColorTeamReview"("captureId", "phase");

-- CreateIndex
CREATE INDEX "GoNoGoDecision_captureId_decisionAt_idx" ON "GoNoGoDecision"("captureId", "decisionAt");

-- CreateIndex
CREATE INDEX "TeamingPartner_captureId_idx" ON "TeamingPartner"("captureId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingPath_placementId_key" ON "OnboardingPath"("placementId");

-- CreateIndex
CREATE INDEX "OnboardingPath_tenantId_status_idx" ON "OnboardingPath"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OnboardingPath_candidateId_idx" ON "OnboardingPath"("candidateId");

-- CreateIndex
CREATE INDEX "OnboardingStep_pathId_ordering_idx" ON "OnboardingStep"("pathId", "ordering");

-- CreateIndex
CREATE INDEX "OnboardingStep_pathId_status_idx" ON "OnboardingStep"("pathId", "status");

-- CreateIndex
CREATE INDEX "CrewAssignment_projectId_assignedDate_idx" ON "CrewAssignment"("projectId", "assignedDate");

-- CreateIndex
CREATE INDEX "CrewAssignment_dailyLogId_idx" ON "CrewAssignment"("dailyLogId");

-- CreateIndex
CREATE UNIQUE INDEX "CrewAssignment_projectId_assignedDate_crewName_costCode_key" ON "CrewAssignment"("projectId", "assignedDate", "crewName", "costCode");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_tenantId_key" ON "CompanyProfile"("tenantId");

-- CreateIndex
CREATE INDEX "CompanyLicense_tenantId_idx" ON "CompanyLicense"("tenantId");

-- CreateIndex
CREATE INDEX "CompanyLicense_expiresAt_idx" ON "CompanyLicense"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyLicense_tenantId_licenseNumber_state_key" ON "CompanyLicense"("tenantId", "licenseNumber", "state");

-- CreateIndex
CREATE INDEX "CompanyInsurance_tenantId_policyType_idx" ON "CompanyInsurance"("tenantId", "policyType");

-- CreateIndex
CREATE INDEX "CompanyInsurance_expiresAt_idx" ON "CompanyInsurance"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyInsurance_tenantId_policyNumber_key" ON "CompanyInsurance"("tenantId", "policyNumber");

-- CreateIndex
CREATE INDEX "CompanyBond_tenantId_bondType_idx" ON "CompanyBond"("tenantId", "bondType");

-- CreateIndex
CREATE INDEX "CompanyBond_projectId_idx" ON "CompanyBond"("projectId");

-- CreateIndex
CREATE INDEX "CompanyBond_expiresAt_idx" ON "CompanyBond"("expiresAt");

-- CreateIndex
CREATE INDEX "CompanyCertification_tenantId_idx" ON "CompanyCertification"("tenantId");

-- CreateIndex
CREATE INDEX "CompanyCertification_expiresAt_idx" ON "CompanyCertification"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyCertification_tenantId_certificationType_certifyingA_key" ON "CompanyCertification"("tenantId", "certificationType", "certifyingAgency");

-- CreateIndex
CREATE INDEX "CompanySafetyMetric_tenantId_idx" ON "CompanySafetyMetric"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySafetyMetric_tenantId_reportingYear_key" ON "CompanySafetyMetric"("tenantId", "reportingYear");

-- CreateIndex
CREATE INDEX "ProjectComplianceLink_projectId_requirementType_idx" ON "ProjectComplianceLink"("projectId", "requirementType");

-- CreateIndex
CREATE INDEX "ProjectComplianceLink_companyLicenseId_idx" ON "ProjectComplianceLink"("companyLicenseId");

-- CreateIndex
CREATE INDEX "ProjectComplianceLink_companyInsuranceId_idx" ON "ProjectComplianceLink"("companyInsuranceId");

-- CreateIndex
CREATE INDEX "ProjectComplianceLink_companyBondId_idx" ON "ProjectComplianceLink"("companyBondId");

-- CreateIndex
CREATE INDEX "ProjectComplianceLink_companyCertificationId_idx" ON "ProjectComplianceLink"("companyCertificationId");

-- CreateIndex
CREATE UNIQUE INDEX "JurisdictionPortal_slug_key" ON "JurisdictionPortal"("slug");

-- CreateIndex
CREATE INDEX "TenantJurisdictionAccount_tenantId_idx" ON "TenantJurisdictionAccount"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantJurisdictionAccount_tenantId_portalId_key" ON "TenantJurisdictionAccount"("tenantId", "portalId");

-- CreateIndex
CREATE INDEX "InspectionSyncRun_tenantId_startedAt_idx" ON "InspectionSyncRun"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "InspectionSyncRun_portalId_startedAt_idx" ON "InspectionSyncRun"("portalId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailConnection_tenantId_key" ON "MailConnection"("tenantId");

-- CreateIndex
CREATE INDEX "MailConnection_enabled_idx" ON "MailConnection"("enabled");

-- CreateIndex
CREATE INDEX "Mailbox_tenantId_idx" ON "Mailbox"("tenantId");

-- CreateIndex
CREATE INDEX "Mailbox_connectionId_idx" ON "Mailbox"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Mailbox_tenantId_email_key" ON "Mailbox"("tenantId", "email");

-- CreateIndex
CREATE INDEX "MailMessage_tenantId_receivedAt_idx" ON "MailMessage"("tenantId", "receivedAt");

-- CreateIndex
CREATE INDEX "MailMessage_mailboxId_receivedAt_idx" ON "MailMessage"("mailboxId", "receivedAt");

-- CreateIndex
CREATE INDEX "MailMessage_tenantId_classification_idx" ON "MailMessage"("tenantId", "classification");

-- CreateIndex
CREATE UNIQUE INDEX "MailMessage_mailboxId_externalId_key" ON "MailMessage"("mailboxId", "externalId");

-- AddForeignKey
ALTER TABLE "AutomationConfig" ADD CONSTRAINT "AutomationConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_configId_fkey" FOREIGN KEY ("configId") REFERENCES "AutomationConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUnit" ADD CONSTRAINT "BusinessUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidatedReport" ADD CONSTRAINT "ConsolidatedReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadMessage" ADD CONSTRAINT "ThreadMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadMessage" ADD CONSTRAINT "ThreadMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTemplate" ADD CONSTRAINT "WorkflowTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watcher" ADD CONSTRAINT "Watcher_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watcher" ADD CONSTRAINT "Watcher_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watcher" ADD CONSTRAINT "Watcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRoute" ADD CONSTRAINT "ApprovalRoute_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRecord" ADD CONSTRAINT "EquipmentRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetAsset" ADD CONSTRAINT "FleetAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetAssignment" ADD CONSTRAINT "FleetAssignment_fleetAssetId_fkey" FOREIGN KEY ("fleetAssetId") REFERENCES "FleetAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetAssignment" ADD CONSTRAINT "FleetAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetMaintenance" ADD CONSTRAINT "FleetMaintenance_fleetAssetId_fkey" FOREIGN KEY ("fleetAssetId") REFERENCES "FleetAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRunLine" ADD CONSTRAINT "PayrollRunLine_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRunLine" ADD CONSTRAINT "PayrollRunLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertifiedPayrollRecord" ADD CONSTRAINT "CertifiedPayrollRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor1099Record" ADD CONSTRAINT "Vendor1099Record_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor1099Record" ADD CONSTRAINT "Vendor1099Record_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRecord" ADD CONSTRAINT "MaterialRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalEstimate" ADD CONSTRAINT "HistoricalEstimate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTransmittal" ADD CONSTRAINT "DocumentTransmittal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTransmittal" ADD CONSTRAINT "DocumentTransmittal_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFI" ADD CONSTRAINT "RFI_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submittal" ADD CONSTRAINT "Submittal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfiReviewer" ADD CONSTRAINT "RfiReviewer_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "RFI"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfiResponse" ADD CONSTRAINT "RfiResponse_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "RFI"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfiDrawingPin" ADD CONSTRAINT "RfiDrawingPin_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "RFI"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfiDrawingPin" ADD CONSTRAINT "RfiDrawingPin_drawingSheetId_fkey" FOREIGN KEY ("drawingSheetId") REFERENCES "DrawingSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittalReviewer" ADD CONSTRAINT "SubmittalReviewer_submittalId_fkey" FOREIGN KEY ("submittalId") REFERENCES "Submittal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittalCycle" ADD CONSTRAINT "SubmittalCycle_submittalId_fkey" FOREIGN KEY ("submittalId") REFERENCES "Submittal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingActionItem" ADD CONSTRAINT "MeetingActionItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantityBudget" ADD CONSTRAINT "QuantityBudget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyToolboxTalk" ADD CONSTRAINT "SafetyToolboxTalk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobHazardAnalysis" ADD CONSTRAINT "JobHazardAnalysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyObservation" ADD CONSTRAINT "SafetyObservation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_linkedRfiId_fkey" FOREIGN KEY ("linkedRfiId") REFERENCES "RFI"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_linkedSubmittalId_fkey" FOREIGN KEY ("linkedSubmittalId") REFERENCES "Submittal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_parentChangeOrderId_fkey" FOREIGN KEY ("parentChangeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderLine" ADD CONSTRAINT "ChangeOrderLine_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTask" ADD CONSTRAINT "ScheduleTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleTask" ADD CONSTRAINT "ScheduleTask_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ScheduleTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBaseline" ADD CONSTRAINT "ScheduleBaseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LookAheadCommitment" ADD CONSTRAINT "LookAheadCommitment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LookAheadCommitment" ADD CONSTRAINT "LookAheadCommitment_scheduleTaskId_fkey" FOREIGN KEY ("scheduleTaskId") REFERENCES "ScheduleTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCode" ADD CONSTRAINT "CostCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCode" ADD CONSTRAINT "CostCode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPrequalification" ADD CONSTRAINT "VendorPrequalification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPrequalification" ADD CONSTRAINT "VendorPrequalification_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestAccount" ADD CONSTRAINT "GuestAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDigest" ADD CONSTRAINT "EmailDigest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReference" ADD CONSTRAINT "VendorReference_prequalId_fkey" FOREIGN KEY ("prequalId") REFERENCES "VendorPrequalification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleDependency" ADD CONSTRAINT "ScheduleDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "ScheduleTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleDependency" ADD CONSTRAINT "ScheduleDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "ScheduleTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractCommitment" ADD CONSTRAINT "ContractCommitment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayApplication" ADD CONSTRAINT "PayApplication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayApplication" ADD CONSTRAINT "PayApplication_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayApplicationLine" ADD CONSTRAINT "PayApplicationLine_payApplicationId_fkey" FOREIGN KEY ("payApplicationId") REFERENCES "PayApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LienWaiver" ADD CONSTRAINT "LienWaiver_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LienWaiver" ADD CONSTRAINT "LienWaiver_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LienWaiver" ADD CONSTRAINT "LienWaiver_parentWaiverId_fkey" FOREIGN KEY ("parentWaiverId") REFERENCES "LienWaiver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LienWaiver" ADD CONSTRAINT "LienWaiver_subInvoiceId_fkey" FOREIGN KEY ("subInvoiceId") REFERENCES "SubInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityChecklistTemplate" ADD CONSTRAINT "QualityChecklistTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformanceReport" ADD CONSTRAINT "NonConformanceReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformanceReport" ADD CONSTRAINT "NonConformanceReport_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformanceReport" ADD CONSTRAINT "NonConformanceReport_linkedRfiId_fkey" FOREIGN KEY ("linkedRfiId") REFERENCES "RFI"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseoutPackage" ADD CONSTRAINT "CloseoutPackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceCert" ADD CONSTRAINT "InsuranceCert_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackage" ADD CONSTRAINT "BidPackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubBid" ADD CONSTRAINT "SubBid_bidPackageId_fkey" FOREIGN KEY ("bidPackageId") REFERENCES "BidPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubBid" ADD CONSTRAINT "SubBid_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubBidLine" ADD CONSTRAINT "SubBidLine_subBidId_fkey" FOREIGN KEY ("subBidId") REFERENCES "SubBid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidLevelingResult" ADD CONSTRAINT "BidLevelingResult_bidPackageId_fkey" FOREIGN KEY ("bidPackageId") REFERENCES "BidPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidLevelingResult" ADD CONSTRAINT "BidLevelingResult_awardedToSubBidId_fkey" FOREIGN KEY ("awardedToSubBidId") REFERENCES "SubBid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalProgram" ADD CONSTRAINT "CapitalProgram_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalProgramProject" ADD CONSTRAINT "CapitalProgramProject_capitalProgramId_fkey" FOREIGN KEY ("capitalProgramId") REFERENCES "CapitalProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalProgramProject" ADD CONSTRAINT "CapitalProgramProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntryComment" ADD CONSTRAINT "TimeEntryComment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubInvoice" ADD CONSTRAINT "SubInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubInvoice" ADD CONSTRAINT "SubInvoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubInvoiceLine" ADD CONSTRAINT "SubInvoiceLine_subInvoiceId_fkey" FOREIGN KEY ("subInvoiceId") REFERENCES "SubInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderReceipt" ADD CONSTRAINT "PurchaseOrderReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderReceiptLine" ADD CONSTRAINT "PurchaseOrderReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PurchaseOrderReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderReceiptLine" ADD CONSTRAINT "PurchaseOrderReceiptLine_poLineId_fkey" FOREIGN KEY ("poLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyItem" ADD CONSTRAINT "WarrantyItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permit" ADD CONSTRAINT "Permit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermitPrerequisite" ADD CONSTRAINT "PermitPrerequisite_dependentPermitId_fkey" FOREIGN KEY ("dependentPermitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermitPrerequisite" ADD CONSTRAINT "PermitPrerequisite_requiredPermitId_fkey" FOREIGN KEY ("requiredPermitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorLicense" ADD CONSTRAINT "ContractorLicense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionChecklistItem" ADD CONSTRAINT "InspectionChecklistItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionAttachment" ADD CONSTRAINT "InspectionAttachment_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpSource" ADD CONSTRAINT "RfpSource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpSource" ADD CONSTRAINT "RfpSource_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "SolicitationPortalCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpListing" ADD CONSTRAINT "RfpListing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpListing" ADD CONSTRAINT "RfpListing_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RfpSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpListing" ADD CONSTRAINT "RfpListing_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantBidProfile" ADD CONSTRAINT "TenantBidProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidDraft" ADD CONSTRAINT "BidDraft_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidDraft" ADD CONSTRAINT "BidDraft_rfpListingId_fkey" FOREIGN KEY ("rfpListingId") REFERENCES "RfpListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidDraft" ADD CONSTRAINT "BidDraft_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidDraftLineItem" ADD CONSTRAINT "BidDraftLineItem_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "BidDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueProjection" ADD CONSTRAINT "RevenueProjection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidDraftSection" ADD CONSTRAINT "BidDraftSection_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "BidDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "BidDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ComplianceCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjustingEntry" ADD CONSTRAINT "AdjustingEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceSheetSnapshot" ADD CONSTRAINT "BalanceSheetSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlowForecast" ADD CONSTRAINT "CashFlowForecast_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlowForecast" ADD CONSTRAINT "CashFlowForecast_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlowStatement" ADD CONSTRAINT "CashFlowStatement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XeroConnection" ADD CONSTRAINT "XeroConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QboConnection" ADD CONSTRAINT "QboConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialStatement" ADD CONSTRAINT "FinancialStatement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryRow" ADD CONSTRAINT "JournalEntryRow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryRow" ADD CONSTRAINT "JournalEntryRow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPnlSnapshot" ADD CONSTRAINT "ProjectPnlSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceInboxConnection" ADD CONSTRAINT "InvoiceInboxConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceInboxMessage" ADD CONSTRAINT "InvoiceInboxMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceInboxMessage" ADD CONSTRAINT "InvoiceInboxMessage_projectGuessId_fkey" FOREIGN KEY ("projectGuessId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalImport" ADD CONSTRAINT "HistoricalImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalImport" ADD CONSTRAINT "HistoricalImport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalImportRow" ADD CONSTRAINT "HistoricalImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "HistoricalImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunLog" ADD CONSTRAINT "AiRunLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordComment" ADD CONSTRAINT "RecordComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Drawing" ADD CONSTRAINT "Drawing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingRevision" ADD CONSTRAINT "DrawingRevision_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingSheet" ADD CONSTRAINT "DrawingSheet_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_drawingSheetId_fkey" FOREIGN KEY ("drawingSheetId") REFERENCES "DrawingSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPhoto" ADD CONSTRAINT "ProjectPhoto_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPhoto" ADD CONSTRAINT "ProjectPhoto_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "ProjectPhotoAlbum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPhotoAlbum" ADD CONSTRAINT "ProjectPhotoAlbum_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPhotoPin" ADD CONSTRAINT "ProjectPhotoPin_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "ProjectPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPhotoPin" ADD CONSTRAINT "ProjectPhotoPin_drawingSheetId_fkey" FOREIGN KEY ("drawingSheetId") REFERENCES "DrawingSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecSection" ADD CONSTRAINT "SpecSection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRequisition" ADD CONSTRAINT "JobRequisition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRequisition" ADD CONSTRAINT "JobRequisition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_reqId_fkey" FOREIGN KEY ("reqId") REFERENCES "JobRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionAccrual" ADD CONSTRAINT "CommissionAccrual_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionAccrual" ADD CONSTRAINT "CommissionAccrual_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CommissionRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureRecord" ADD CONSTRAINT "CaptureRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureRecord" ADD CONSTRAINT "CaptureRecord_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptureMilestone" ADD CONSTRAINT "CaptureMilestone_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "CaptureRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColorTeamReview" ADD CONSTRAINT "ColorTeamReview_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "CaptureRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoNoGoDecision" ADD CONSTRAINT "GoNoGoDecision_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "CaptureRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamingPartner" ADD CONSTRAINT "TeamingPartner_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "CaptureRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingPath" ADD CONSTRAINT "OnboardingPath_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingPath" ADD CONSTRAINT "OnboardingPath_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingPath" ADD CONSTRAINT "OnboardingPath_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingStep" ADD CONSTRAINT "OnboardingStep_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "OnboardingPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewAssignment" ADD CONSTRAINT "CrewAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewAssignment" ADD CONSTRAINT "CrewAssignment_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLicense" ADD CONSTRAINT "CompanyLicense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyInsurance" ADD CONSTRAINT "CompanyInsurance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBond" ADD CONSTRAINT "CompanyBond_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBond" ADD CONSTRAINT "CompanyBond_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyCertification" ADD CONSTRAINT "CompanyCertification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySafetyMetric" ADD CONSTRAINT "CompanySafetyMetric_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectComplianceLink" ADD CONSTRAINT "ProjectComplianceLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectComplianceLink" ADD CONSTRAINT "ProjectComplianceLink_companyLicenseId_fkey" FOREIGN KEY ("companyLicenseId") REFERENCES "CompanyLicense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectComplianceLink" ADD CONSTRAINT "ProjectComplianceLink_companyInsuranceId_fkey" FOREIGN KEY ("companyInsuranceId") REFERENCES "CompanyInsurance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectComplianceLink" ADD CONSTRAINT "ProjectComplianceLink_companyBondId_fkey" FOREIGN KEY ("companyBondId") REFERENCES "CompanyBond"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectComplianceLink" ADD CONSTRAINT "ProjectComplianceLink_companyCertificationId_fkey" FOREIGN KEY ("companyCertificationId") REFERENCES "CompanyCertification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantJurisdictionAccount" ADD CONSTRAINT "TenantJurisdictionAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantJurisdictionAccount" ADD CONSTRAINT "TenantJurisdictionAccount_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "JurisdictionPortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSyncRun" ADD CONSTRAINT "InspectionSyncRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSyncRun" ADD CONSTRAINT "InspectionSyncRun_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "JurisdictionPortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailConnection" ADD CONSTRAINT "MailConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mailbox" ADD CONSTRAINT "Mailbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mailbox" ADD CONSTRAINT "Mailbox_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MailConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
