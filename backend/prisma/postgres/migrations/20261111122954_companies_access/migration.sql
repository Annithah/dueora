-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "allCompanies" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "allCompanies" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "companyAccess" JSONB;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "description" TEXT,
ADD COLUMN     "monthlyBudgetCents" INTEGER,
ADD COLUMN     "reminderHour" INTEGER,
ADD COLUMN     "reminderOffsets" JSONB,
ADD COLUMN     "shortName" TEXT;

-- CreateTable
CREATE TABLE "CompanyAccess" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyAccess_workspaceId_userId_idx" ON "CompanyAccess"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAccess_userId_companyId_key" ON "CompanyAccess"("userId", "companyId");

-- AddForeignKey
ALTER TABLE "CompanyAccess" ADD CONSTRAINT "CompanyAccess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAccess" ADD CONSTRAINT "CompanyAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAccess" ADD CONSTRAINT "CompanyAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

