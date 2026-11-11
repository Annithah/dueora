-- "Subscription" becomes "Bill" (Finalize brief, Part 1). Hand-written so every row is kept:
-- tables and columns are renamed in place (SQLite >= 3.26 also rewrites foreign keys that point
-- at a renamed table), then indexes get their new names and stored links/labels are updated.

ALTER TABLE "Subscription" RENAME TO "Bill";
ALTER TABLE "Bill" RENAME COLUMN "subscriptionKeyEncrypted" TO "accountRefEncrypted";
ALTER TABLE "Bill" RENAME COLUMN "subscriptionKeyLast4" TO "accountRefLast4";
ALTER TABLE "Bill" RENAME COLUMN "subscriptionKeyHash" TO "accountRefHash";
ALTER TABLE "PaymentRecord" RENAME COLUMN "subscriptionId" TO "billId";
ALTER TABLE "Notification" RENAME COLUMN "subscriptionId" TO "billId";
ALTER TABLE "PriceChange" RENAME COLUMN "subscriptionId" TO "billId";
ALTER TABLE "ReminderSnooze" RENAME COLUMN "subscriptionId" TO "billId";
ALTER TABLE "NotificationPreference" RENAME COLUMN "mutedSubscriptionIds" TO "mutedBillIds";

DROP INDEX "Subscription_workspaceId_nextDueDate_idx";
DROP INDEX "Subscription_workspaceId_status_idx";
DROP INDEX "Subscription_workspaceId_companyId_idx";
DROP INDEX "Subscription_workspaceId_categoryId_idx";
DROP INDEX "Subscription_workspaceId_subscriptionKeyHash_idx";
DROP INDEX "PaymentRecord_subscriptionId_cycleDueDate_idx";
DROP INDEX "Notification_subscriptionId_cycleDueDate_idx";
DROP INDEX "PriceChange_subscriptionId_changedAt_idx";
DROP INDEX "ReminderSnooze_userId_subscriptionId_cycleDueDate_key";

CREATE INDEX "Bill_workspaceId_nextDueDate_idx" ON "Bill"("workspaceId", "nextDueDate");
CREATE INDEX "Bill_workspaceId_status_idx" ON "Bill"("workspaceId", "status");
CREATE INDEX "Bill_workspaceId_companyId_idx" ON "Bill"("workspaceId", "companyId");
CREATE INDEX "Bill_workspaceId_categoryId_idx" ON "Bill"("workspaceId", "categoryId");
CREATE INDEX "Bill_workspaceId_accountRefHash_idx" ON "Bill"("workspaceId", "accountRefHash");
CREATE INDEX "PaymentRecord_billId_cycleDueDate_idx" ON "PaymentRecord"("billId", "cycleDueDate");
CREATE INDEX "Notification_billId_cycleDueDate_idx" ON "Notification"("billId", "cycleDueDate");
CREATE INDEX "PriceChange_billId_changedAt_idx" ON "PriceChange"("billId", "changedAt");
CREATE UNIQUE INDEX "ReminderSnooze_userId_billId_cycleDueDate_key" ON "ReminderSnooze"("userId", "billId", "cycleDueDate");

-- Deep links and ids stored inside notifications and AI cards.
UPDATE "Notification" SET "data" = replace(replace("data", '"subscriptionId":', '"billId":'), 'subscriptions/', 'bills/');
UPDATE "AiMessage" SET "cards" = replace(replace(replace("cards", '"type":"subscriptions"', '"type":"bills"'), '_subscription"', '_bill"'), '"subscriptionId":', '"billId":');
-- Internal audit trail labels.
UPDATE "AuditLog" SET "entity" = 'Bill' WHERE "entity" = 'Subscription';
UPDATE "AuditLog" SET "action" = 'bill.reference.reveal' WHERE "action" = 'subscription.key.reveal';
UPDATE "AuditLog" SET "action" = 'bill.' || substr("action", 14) WHERE "action" LIKE 'subscription.%';
