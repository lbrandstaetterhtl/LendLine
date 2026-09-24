ALTER TABLE "AuditEvent" ADD COLUMN "details" JSONB;
ALTER TABLE "AuditEvent" ADD COLUMN "ip" TEXT;
ALTER TABLE "AuditEvent" ADD COLUMN "userAgent" TEXT;

CREATE INDEX "AuditEvent_entityType_idx" ON "AuditEvent"("entityType");
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");