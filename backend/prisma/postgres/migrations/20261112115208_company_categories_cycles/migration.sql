-- Finalize brief, Parts 3 and 4 (see the SQLite migration of the same name). Hand-edited data steps.

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'DROPDOWN');

-- CreateEnum
CREATE TYPE "AmountType" AS ENUM ('FIXED', 'VARIABLE');

-- DropIndex
DROP INDEX "Category_workspaceId_name_key";

-- AlterTable (companyId stays nullable until every bill has its company's own category)
ALTER TABLE "Category" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "defaultAmountType" "AmountType",
ADD COLUMN     "defaultFrequencyInterval" INTEGER,
ADD COLUMN     "defaultFrequencyUnit" "FrequencyUnit",
ADD COLUMN     "defaultPaymentMethod" "PaymentMethod",
ADD COLUMN     "defaultReminderOffsets" JSONB,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Data: each (category, company) pair in use becomes that company's own category (Finalize brief,
-- Part 3). Unused custom categories and budget-only categories go to the workspace's oldest company.
CREATE TEMP TABLE "_cat_map" ("oldId" TEXT NOT NULL, "companyId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "newId" TEXT NOT NULL, PRIMARY KEY ("oldId", "companyId"));
INSERT INTO "_cat_map" SELECT x."oldId", x."companyId", x."workspaceId", 'c' || replace(gen_random_uuid()::text, '-', '')
  FROM (SELECT DISTINCT "categoryId" AS "oldId", "companyId", "workspaceId" FROM "Bill") x;
INSERT INTO "_cat_map" SELECT y."oldId", y."companyId", y."workspaceId", 'c' || replace(gen_random_uuid()::text, '-', '') FROM (
  SELECT DISTINCT x."oldId", x."workspaceId",
    (SELECT co."id" FROM "Company" co WHERE co."workspaceId" = x."workspaceId" ORDER BY co."createdAt", co."id" LIMIT 1) AS "companyId"
  FROM (
    SELECT c."id" AS "oldId", c."workspaceId" FROM "Category" c WHERE c."workspaceId" IS NOT NULL
    UNION
    SELECT bu."categoryId", bu."workspaceId" FROM "Budget" bu WHERE bu."categoryId" IS NOT NULL
  ) x
  WHERE NOT EXISTS (SELECT 1 FROM "_cat_map" m WHERE m."oldId" = x."oldId" AND m."workspaceId" = x."workspaceId")
) y WHERE y."companyId" IS NOT NULL;

INSERT INTO "Category" ("id", "workspaceId", "companyId", "name", "icon", "color", "isDefault", "createdAt")
  SELECT m."newId", m."workspaceId", m."companyId", c."name", c."icon", c."color", false, c."createdAt"
  FROM "_cat_map" m JOIN "Category" c ON c."id" = m."oldId";
UPDATE "Bill" b SET "categoryId" = m."newId" FROM "_cat_map" m WHERE m."oldId" = b."categoryId" AND m."companyId" = b."companyId";
UPDATE "Budget" bu SET "categoryId" = (
  SELECT m."newId" FROM "_cat_map" m
  WHERE m."oldId" = bu."categoryId" AND m."workspaceId" = bu."workspaceId"
  ORDER BY (SELECT count(*) FROM "Bill" b WHERE b."categoryId" = m."newId") DESC, m."companyId"
  LIMIT 1
) WHERE bu."categoryId" IS NOT NULL;
DELETE FROM "Budget" WHERE "categoryId" IS NULL AND "scope" <> 'all';
UPDATE "Budget" SET "scope" = "categoryId" WHERE "categoryId" IS NOT NULL;
DELETE FROM "Category" WHERE "companyId" IS NULL;
DROP TABLE "_cat_map";

ALTER TABLE "Category" DROP COLUMN "isDefault",
ALTER COLUMN "companyId" SET NOT NULL,
ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "amountType" "AmountType" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "customValues" JSONB;

-- CreateTable
CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" JSONB,
    "categoryIds" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillCycle" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "isActual" BOOLEAN NOT NULL DEFAULT false,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillCycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomField_companyId_name_key" ON "CustomField"("companyId", "name");

-- CreateIndex
CREATE INDEX "BillCycle_workspaceId_dueDate_idx" ON "BillCycle"("workspaceId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "BillCycle_billId_dueDate_key" ON "BillCycle"("billId", "dueDate");

-- CreateIndex
CREATE INDEX "Category_workspaceId_companyId_idx" ON "Category"("workspaceId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_companyId_name_key" ON "Category"("companyId", "name");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillCycle" ADD CONSTRAINT "BillCycle_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillCycle" ADD CONSTRAINT "BillCycle_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Part 7: new notification types, per-company notification preferences, reminder runs per company hour.
-- AlterEnum


ALTER TYPE "NotificationType" ADD VALUE 'NEXT_MONTH_PREVIEW';
ALTER TYPE "NotificationType" ADD VALUE 'AMOUNT_NEEDED';

-- DropIndex
DROP INDEX "WorkspaceReminderRun_workspaceId_localDate_key";

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "companyPrefs" JSONB;

-- AlterTable
ALTER TABLE "WorkspaceReminderRun" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceReminderRun_workspaceId_scope_localDate_key" ON "WorkspaceReminderRun"("workspaceId", "scope", "localDate");

