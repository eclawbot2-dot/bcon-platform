-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "qboCustomerId" TEXT;

-- AlterTable
ALTER TABLE "PayApplication" ADD COLUMN     "qboBalance" DECIMAL(65,30),
ADD COLUMN     "qboDocNumber" TEXT,
ADD COLUMN     "qboInvoiceId" TEXT,
ADD COLUMN     "qboInvoiceLink" TEXT,
ADD COLUMN     "qboPaymentStatus" TEXT,
ADD COLUMN     "qboSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "QboConnection" ADD COLUMN     "arAgingAt" TIMESTAMP(3),
ADD COLUMN     "arAgingJson" TEXT;

-- CreateTable
CREATE TABLE "IntegrationSyncJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "recordsRead" INTEGER NOT NULL DEFAULT 0,
    "recordsWritten" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "cursor" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "M365CalendarEventLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "calendarUpn" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "M365CalendarEventLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationSyncJob_tenantId_startedAt_idx" ON "IntegrationSyncJob"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "IntegrationSyncJob_tenantId_provider_kind_status_startedAt_idx" ON "IntegrationSyncJob"("tenantId", "provider", "kind", "status", "startedAt");

-- CreateIndex
CREATE INDEX "M365CalendarEventLink_tenantId_idx" ON "M365CalendarEventLink"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "M365CalendarEventLink_tenantId_kind_recordId_key" ON "M365CalendarEventLink"("tenantId", "kind", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_tenantId_qboCustomerId_key" ON "Company"("tenantId", "qboCustomerId");

-- CreateIndex
CREATE INDEX "PayApplication_qboInvoiceId_idx" ON "PayApplication"("qboInvoiceId");

-- AddForeignKey
ALTER TABLE "IntegrationSyncJob" ADD CONSTRAINT "IntegrationSyncJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "M365CalendarEventLink" ADD CONSTRAINT "M365CalendarEventLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
