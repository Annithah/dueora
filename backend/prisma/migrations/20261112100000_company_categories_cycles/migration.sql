-- Finalize brief, Parts 3 and 4: categories belong to a company (with sub-categories and bill
-- defaults), company custom fields, variable amounts and stored bill cycles. Hand-written so every
-- bill keeps a category: each (category, company) pair in use becomes that company's own copy,
-- bills and category budgets are re-pointed, and the shared built-in categories are dropped.

-- 1. Old category -> new per-company category.
CREATE TEMP TABLE "_cat_map" ("oldId" TEXT NOT NULL, "companyId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "newId" TEXT NOT NULL, PRIMARY KEY ("oldId", "companyId"));
-- Every pair used by a bill.
INSERT INTO "_cat_map" SELECT "oldId", "companyId", "workspaceId", 'c' || lower(hex(randomblob(12)))
  FROM (SELECT DISTINCT "categoryId" AS "oldId", "companyId", "workspaceId" FROM "Bill");
-- A workspace's unused custom categories, and categories used only by a budget, go to its oldest company.
INSERT INTO "_cat_map" SELECT "oldId", "companyId", "workspaceId", 'c' || lower(hex(randomblob(12))) FROM (
  SELECT DISTINCT x."oldId", x."workspaceId",
    (SELECT co."id" FROM "Company" co WHERE co."workspaceId" = x."workspaceId" ORDER BY co."createdAt", co."id" LIMIT 1) AS "companyId"
  FROM (
    SELECT c."id" AS "oldId", c."workspaceId" FROM "Category" c WHERE c."workspaceId" IS NOT NULL
    UNION
    SELECT bu."categoryId", bu."workspaceId" FROM "Budget" bu WHERE bu."categoryId" IS NOT NULL
  ) x
  WHERE NOT EXISTS (SELECT 1 FROM "_cat_map" m WHERE m."oldId" = x."oldId" AND m."workspaceId" = x."workspaceId")
) WHERE "companyId" IS NOT NULL;

-- CreateTable
CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" JSONB,
    "categoryIds" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomField_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomField_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BillCycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "isActual" BOOLEAN NOT NULL DEFAULT false,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BillCycle_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BillCycle_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "defaultFrequencyUnit" TEXT,
    "defaultFrequencyInterval" INTEGER,
    "defaultAmountType" TEXT,
    "defaultReminderOffsets" JSONB,
    "defaultPaymentMethod" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("id", "workspaceId", "companyId", "name", "icon", "color", "createdAt")
  SELECT m."newId", m."workspaceId", m."companyId", c."name", c."icon", c."color", c."createdAt"
  FROM "_cat_map" m JOIN "Category" c ON c."id" = m."oldId";
-- Category budgets point at the copy in the company with the most bills in that category.
UPDATE "Budget" SET "categoryId" = (
  SELECT m."newId" FROM "_cat_map" m
  WHERE m."oldId" = "Budget"."categoryId" AND m."workspaceId" = "Budget"."workspaceId"
  ORDER BY (SELECT count(*) FROM "Bill" b WHERE b."categoryId" = m."oldId" AND b."companyId" = m."companyId") DESC, m."companyId"
  LIMIT 1
) WHERE "categoryId" IS NOT NULL;
DELETE FROM "Budget" WHERE "categoryId" IS NULL AND "scope" <> 'all';
UPDATE "Budget" SET "scope" = "categoryId" WHERE "categoryId" IS NOT NULL;
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE INDEX "Category_workspaceId_companyId_idx" ON "Category"("workspaceId", "companyId");
CREATE UNIQUE INDEX "Category_companyId_name_key" ON "Category"("companyId", "name");
CREATE TABLE "new_Bill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "description" TEXT,
    "accountRefEncrypted" TEXT,
    "accountRefLast4" TEXT,
    "accountRefHash" TEXT,
    "amountCents" INTEGER NOT NULL,
    "amountType" TEXT NOT NULL DEFAULT 'FIXED',
    "customValues" JSONB,
    "frequencyUnit" TEXT NOT NULL,
    "frequencyInterval" INTEGER NOT NULL DEFAULT 1,
    "anchorDay" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL,
    "nextDueDate" TEXT NOT NULL,
    "reminderOffsets" JSONB NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "isTrial" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsOn" TEXT,
    "defaultPaymentMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bill_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bill_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Bill_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Bill" ("accountRefEncrypted", "accountRefHash", "accountRefLast4", "amountCents", "anchorDay", "autoRenew", "categoryId", "companyId", "createdAt", "defaultPaymentMethod", "description", "frequencyInterval", "frequencyUnit", "id", "isTrial", "name", "nextDueDate", "provider", "reminderOffsets", "startDate", "status", "trialEndsOn", "updatedAt", "workspaceId") SELECT "accountRefEncrypted", "accountRefHash", "accountRefLast4", "amountCents", "anchorDay", "autoRenew", (SELECT m."newId" FROM "_cat_map" m WHERE m."oldId" = "Bill"."categoryId" AND m."companyId" = "Bill"."companyId"), "companyId", "createdAt", "defaultPaymentMethod", "description", "frequencyInterval", "frequencyUnit", "id", "isTrial", "name", "nextDueDate", "provider", "reminderOffsets", "startDate", "status", "trialEndsOn", "updatedAt", "workspaceId" FROM "Bill";
DROP TABLE "Bill";
ALTER TABLE "new_Bill" RENAME TO "Bill";
CREATE INDEX "Bill_workspaceId_nextDueDate_idx" ON "Bill"("workspaceId", "nextDueDate");
CREATE INDEX "Bill_workspaceId_status_idx" ON "Bill"("workspaceId", "status");
CREATE INDEX "Bill_workspaceId_companyId_idx" ON "Bill"("workspaceId", "companyId");
CREATE INDEX "Bill_workspaceId_categoryId_idx" ON "Bill"("workspaceId", "categoryId");
CREATE INDEX "Bill_workspaceId_accountRefHash_idx" ON "Bill"("workspaceId", "accountRefHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CustomField_companyId_name_key" ON "CustomField"("companyId", "name");

-- CreateIndex
CREATE INDEX "BillCycle_workspaceId_dueDate_idx" ON "BillCycle"("workspaceId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "BillCycle_billId_dueDate_key" ON "BillCycle"("billId", "dueDate");

DROP TABLE "_cat_map";

-- Part 7: per-company notification preferences and reminder runs per company hour.
-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN "companyPrefs" JSONB;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WorkspaceReminderRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "localDate" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceReminderRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorkspaceReminderRun" ("createdAt", "id", "localDate", "workspaceId") SELECT "createdAt", "id", "localDate", "workspaceId" FROM "WorkspaceReminderRun";
DROP TABLE "WorkspaceReminderRun";
ALTER TABLE "new_WorkspaceReminderRun" RENAME TO "WorkspaceReminderRun";
CREATE UNIQUE INDEX "WorkspaceReminderRun_workspaceId_scope_localDate_key" ON "WorkspaceReminderRun"("workspaceId", "scope", "localDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

