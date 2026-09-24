ALTER TABLE "Device" ADD COLUMN "quantityTotal" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Device" ADD COLUMN "quantityBorrowed" INTEGER NOT NULL DEFAULT 0;
UPDATE "Device" SET "quantityBorrowed" = 1 WHERE "status" = 'BORROWED';