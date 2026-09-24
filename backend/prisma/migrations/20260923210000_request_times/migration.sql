ALTER TABLE "BorrowRequest" ADD COLUMN "startsAt" TIMESTAMP(3);
UPDATE "BorrowRequest" SET "startsAt" = "requestedAt";
ALTER TABLE "BorrowRequest" ALTER COLUMN "startsAt" SET NOT NULL;
