CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

INSERT INTO "Category" ("id", "name")
SELECT 'cat_' || md5("category"), "category"
FROM "Device"
GROUP BY "category";

ALTER TABLE "Device" ADD COLUMN "categoryId" TEXT;

UPDATE "Device" AS device
SET "categoryId" = category."id"
FROM "Category" AS category
WHERE category."name" = device."category";

ALTER TABLE "Device" ALTER COLUMN "categoryId" SET NOT NULL;

ALTER TABLE "Device" ADD CONSTRAINT "Device_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Device_categoryId_idx" ON "Device"("categoryId");

ALTER TABLE "Device" DROP COLUMN "category";
