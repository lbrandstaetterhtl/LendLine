CREATE TABLE "DeviceUnit" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'AVAILABLE',
    CONSTRAINT "DeviceUnit_pkey" PRIMARY KEY ("id")
);

INSERT INTO "DeviceUnit" ("id", "deviceId", "serialNumber", "status")
SELECT md5(d."id" || '-1'), d."id", d."serialNumber",
  CASE
    WHEN d."status" = 'DEFECTIVE' THEN 'DEFECTIVE'::"DeviceStatus"
    WHEN d."quantityBorrowed" > 0 THEN 'BORROWED'::"DeviceStatus"
    ELSE 'AVAILABLE'::"DeviceStatus"
  END
FROM "Device" d;

INSERT INTO "DeviceUnit" ("id", "deviceId", "serialNumber", "status")
SELECT md5(d."id" || '-' || g.n::text), d."id", d."serialNumber" || '-' || g.n::text,
  CASE
    WHEN d."status" = 'DEFECTIVE' THEN 'DEFECTIVE'::"DeviceStatus"
    WHEN g.n <= d."quantityBorrowed" THEN 'BORROWED'::"DeviceStatus"
    ELSE 'AVAILABLE'::"DeviceStatus"
  END
FROM "Device" d
JOIN generate_series(2, d."quantityTotal") AS g(n) ON true;

CREATE UNIQUE INDEX "DeviceUnit_serialNumber_key" ON "DeviceUnit"("serialNumber");
CREATE INDEX "DeviceUnit_deviceId_idx" ON "DeviceUnit"("deviceId");
CREATE INDEX "DeviceUnit_status_idx" ON "DeviceUnit"("status");

ALTER TABLE "DeviceUnit" ADD CONSTRAINT "DeviceUnit_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BorrowRequest" ADD COLUMN "unitId" TEXT;

WITH ranked_req AS (
  SELECT "id", "deviceId", row_number() OVER (PARTITION BY "deviceId" ORDER BY "approvedAt") AS rn
  FROM "BorrowRequest"
  WHERE "status" = 'APPROVED'
),
ranked_unit AS (
  SELECT "id", "deviceId", row_number() OVER (PARTITION BY "deviceId" ORDER BY "serialNumber") AS rn
  FROM "DeviceUnit"
  WHERE "status" = 'BORROWED'
)
UPDATE "BorrowRequest" br
SET "unitId" = u."id"
FROM ranked_req r
JOIN ranked_unit u ON u."deviceId" = r."deviceId" AND u.rn = r.rn
WHERE br."id" = r."id";

ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DeviceUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Device" DROP COLUMN "serialNumber";
ALTER TABLE "Device" DROP COLUMN "quantityTotal";
ALTER TABLE "Device" DROP COLUMN "quantityBorrowed";
ALTER TABLE "Device" DROP COLUMN "status";
