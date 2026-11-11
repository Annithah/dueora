-- "Subscription" becomes "Bill" (Finalize brief, Part 1). Hand-written instead of the generated
-- drop-and-recreate diff so every row is kept: renames in place, then stored links/labels.

ALTER TYPE "SubscriptionStatus" RENAME TO "BillStatus";

ALTER TABLE "Subscription" RENAME TO "Bill";
ALTER TABLE "Bill" RENAME CONSTRAINT "Subscription_pkey" TO "Bill_pkey";
ALTER TABLE "Bill" RENAME CONSTRAINT "Subscription_workspaceId_fkey" TO "Bill_workspaceId_fkey";
ALTER TABLE "Bill" RENAME CONSTRAINT "Subscription_companyId_fkey" TO "Bill_companyId_fkey";
ALTER TABLE "Bill" RENAME CONSTRAINT "Subscription_categoryId_fkey" TO "Bill_categoryId_fkey";
ALTER TABLE "Bill" RENAME COLUMN "subscriptionKeyEncrypted" TO "accountRefEncrypted";
ALTER TABLE "Bill" RENAME COLUMN "subscriptionKeyLast4" TO "accountRefLast4";
ALTER TABLE "Bill" RENAME COLUMN "subscriptionKeyHash" TO "accountRefHash";

ALTER TABLE "PaymentRecord" RENAME COLUMN "subscriptionId" TO "billId";
ALTER TABLE "PaymentRecord" RENAME CONSTRAINT "PaymentRecord_subscriptionId_fkey" TO "PaymentRecord_billId_fkey";
ALTER TABLE "Notification" RENAME COLUMN "subscriptionId" TO "billId";
ALTER TABLE "Notification" RENAME CONSTRAINT "Notification_subscriptionId_fkey" TO "Notification_billId_fkey";
ALTER TABLE "PriceChange" RENAME COLUMN "subscriptionId" TO "billId";
ALTER TABLE "PriceChange" RENAME CONSTRAINT "PriceChange_subscriptionId_fkey" TO "PriceChange_billId_fkey";
ALTER TABLE "ReminderSnooze" RENAME COLUMN "subscriptionId" TO "billId";
ALTER TABLE "ReminderSnooze" RENAME CONSTRAINT "ReminderSnooze_subscriptionId_fkey" TO "ReminderSnooze_billId_fkey";
ALTER TABLE "NotificationPreference" RENAME COLUMN "mutedSubscriptionIds" TO "mutedBillIds";

ALTER INDEX "Subscription_workspaceId_nextDueDate_idx" RENAME TO "Bill_workspaceId_nextDueDate_idx";
ALTER INDEX "Subscription_workspaceId_status_idx" RENAME TO "Bill_workspaceId_status_idx";
ALTER INDEX "Subscription_workspaceId_companyId_idx" RENAME TO "Bill_workspaceId_companyId_idx";
ALTER INDEX "Subscription_workspaceId_categoryId_idx" RENAME TO "Bill_workspaceId_categoryId_idx";
ALTER INDEX "Subscription_workspaceId_subscriptionKeyHash_idx" RENAME TO "Bill_workspaceId_accountRefHash_idx";
ALTER INDEX "PaymentRecord_subscriptionId_cycleDueDate_idx" RENAME TO "PaymentRecord_billId_cycleDueDate_idx";
ALTER INDEX "Notification_subscriptionId_cycleDueDate_idx" RENAME TO "Notification_billId_cycleDueDate_idx";
ALTER INDEX "PriceChange_subscriptionId_changedAt_idx" RENAME TO "PriceChange_billId_changedAt_idx";
ALTER INDEX "ReminderSnooze_userId_subscriptionId_cycleDueDate_key" RENAME TO "ReminderSnooze_userId_billId_cycleDueDate_key";

-- Deep links and ids stored inside notifications and AI cards (jsonb text form is `"key": value`).
UPDATE "Notification" SET "data" = replace(replace("data"::text, '"subscriptionId":', '"billId":'), 'subscriptions/', 'bills/')::jsonb;
UPDATE "AiMessage" SET "cards" = replace(replace(replace("cards"::text, '"type": "subscriptions"', '"type": "bills"'), '_subscription"', '_bill"'), '"subscriptionId":', '"billId":')::jsonb;
-- Internal audit trail labels.
UPDATE "AuditLog" SET "entity" = 'Bill' WHERE "entity" = 'Subscription';
UPDATE "AuditLog" SET "action" = 'bill.reference.reveal' WHERE "action" = 'subscription.key.reveal';
UPDATE "AuditLog" SET "action" = 'bill.' || substr("action", 14) WHERE "action" LIKE 'subscription.%';
