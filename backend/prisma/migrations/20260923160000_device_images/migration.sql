CREATE TABLE "DeviceImage" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeviceImage_deviceId_idx" ON "DeviceImage"("deviceId");

ALTER TABLE "DeviceImage" ADD CONSTRAINT "DeviceImage_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
