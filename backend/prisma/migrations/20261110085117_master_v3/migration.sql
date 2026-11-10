-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "oldAmountCents" INTEGER NOT NULL,
    "newAmountCents" INTEGER NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceChange_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "categoryId" TEXT,
    "scope" TEXT NOT NULL,
    "monthlyLimitCents" INTEGER NOT NULL,
    "alertAtPercent" INTEGER NOT NULL DEFAULT 80,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Budget_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReminderSnooze" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "cycleDueDate" TEXT NOT NULL,
    "snoozedUntil" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReminderSnooze_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReminderSnooze_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "workspaceId" TEXT,
    "message" TEXT NOT NULL,
    "appVersion" TEXT,
    "platform" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "cards" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMemory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AiMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiInsight_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NotificationPreference" (
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "digestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "weeklySummary" BOOLEAN NOT NULL DEFAULT true,
    "monthlySummary" BOOLEAN NOT NULL DEFAULT true,
    "budgetAlerts" BOOLEAN NOT NULL DEFAULT true,
    "teamActivity" BOOLEAN NOT NULL DEFAULT true,
    "mutedSubscriptionIds" JSONB NOT NULL,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "workspaceId"),
    CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NotificationPreference" ("digestEnabled", "emailEnabled", "mutedSubscriptionIds", "pushEnabled", "updatedAt", "userId", "workspaceId") SELECT "digestEnabled", "emailEnabled", "mutedSubscriptionIds", "pushEnabled", "updatedAt", "userId", "workspaceId" FROM "NotificationPreference";
DROP TABLE "NotificationPreference";
ALTER TABLE "new_NotificationPreference" RENAME TO "NotificationPreference";
CREATE TABLE "new_Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "description" TEXT,
    "subscriptionKeyEncrypted" TEXT,
    "subscriptionKeyLast4" TEXT,
    "subscriptionKeyHash" TEXT,
    "amountCents" INTEGER NOT NULL,
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
    CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Subscription" ("amountCents", "anchorDay", "categoryId", "companyId", "createdAt", "description", "frequencyInterval", "frequencyUnit", "id", "name", "nextDueDate", "provider", "reminderOffsets", "startDate", "status", "subscriptionKeyEncrypted", "subscriptionKeyHash", "subscriptionKeyLast4", "updatedAt", "workspaceId") SELECT "amountCents", "anchorDay", "categoryId", "companyId", "createdAt", "description", "frequencyInterval", "frequencyUnit", "id", "name", "nextDueDate", "provider", "reminderOffsets", "startDate", "status", "subscriptionKeyEncrypted", "subscriptionKeyHash", "subscriptionKeyLast4", "updatedAt", "workspaceId" FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
CREATE INDEX "Subscription_workspaceId_nextDueDate_idx" ON "Subscription"("workspaceId", "nextDueDate");
CREATE INDEX "Subscription_workspaceId_status_idx" ON "Subscription"("workspaceId", "status");
CREATE INDEX "Subscription_workspaceId_companyId_idx" ON "Subscription"("workspaceId", "companyId");
CREATE INDEX "Subscription_workspaceId_categoryId_idx" ON "Subscription"("workspaceId", "categoryId");
CREATE INDEX "Subscription_workspaceId_subscriptionKeyHash_idx" ON "Subscription"("workspaceId", "subscriptionKeyHash");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerifiedAt" DATETIME,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "emailVerifiedAt", "id", "name", "passwordHash", "updatedAt") SELECT "createdAt", "email", "emailVerifiedAt", "id", "name", "passwordHash", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "new_Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'COMPANY',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "reminderHour" INTEGER NOT NULL DEFAULT 9,
    "quietHoursStart" INTEGER,
    "quietHoursEnd" INTEGER,
    "defaultReminderOffsets" JSONB NOT NULL,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Workspace" ("createdAt", "defaultReminderOffsets", "id", "name", "quietHoursEnd", "quietHoursStart", "reminderHour", "timezone", "type", "updatedAt") SELECT "createdAt", "defaultReminderOffsets", "id", "name", "quietHoursEnd", "quietHoursStart", "reminderHour", "timezone", "type", "updatedAt" FROM "Workspace";
DROP TABLE "Workspace";
ALTER TABLE "new_Workspace" RENAME TO "Workspace";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PriceChange_subscriptionId_changedAt_idx" ON "PriceChange"("subscriptionId", "changedAt");

-- CreateIndex
CREATE INDEX "PriceChange_workspaceId_changedAt_idx" ON "PriceChange"("workspaceId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_workspaceId_scope_key" ON "Budget"("workspaceId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderSnooze_userId_subscriptionId_cycleDueDate_key" ON "ReminderSnooze"("userId", "subscriptionId", "cycleDueDate");

-- CreateIndex
CREATE INDEX "AiConversation_workspaceId_userId_updatedAt_idx" ON "AiConversation"("workspaceId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiMemory_workspaceId_idx" ON "AiMemory"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AiFeedback_messageId_userId_key" ON "AiFeedback"("messageId", "userId");

-- CreateIndex
CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_workspaceId_createdAt_idx" ON "AiUsage"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiInsight_workspaceId_localDate_key" ON "AiInsight"("workspaceId", "localDate");
