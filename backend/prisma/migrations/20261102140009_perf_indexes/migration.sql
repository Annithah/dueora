-- CreateIndex
CREATE INDEX "Notification_userId_organizationId_channel_readAt_idx" ON "Notification"("userId", "organizationId", "channel", "readAt");

-- CreateIndex
CREATE INDEX "PaymentRecord_organizationId_cycleDueDate_idx" ON "PaymentRecord"("organizationId", "cycleDueDate");
