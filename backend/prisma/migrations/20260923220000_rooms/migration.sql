CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "building" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Room_name_key" ON "Room"("name");

INSERT INTO "Room" ("id", "name", "building", "description") VALUES
  ('room-unassigned', 'Nicht zugeordnet', '', 'Bestehende Anfragen ohne Raum'),
  ('room-a101', 'A101', 'Haus A', 'Seminarraum'),
  ('room-b204', 'B204', 'Haus B', 'PC-Pool'),
  ('room-c12', 'C12', 'Haus C', 'Besprechungsraum');

ALTER TABLE "BorrowRequest" ADD COLUMN "roomId" TEXT;
UPDATE "BorrowRequest" SET "roomId" = 'room-unassigned' WHERE "roomId" IS NULL;
ALTER TABLE "BorrowRequest" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
