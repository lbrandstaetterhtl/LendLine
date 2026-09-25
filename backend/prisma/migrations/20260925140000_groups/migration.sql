-- Groups replace the fixed roles USER/ADMIN. Existing users keep exactly what they could do:
-- admins land in "Verwaltung" (every permission), everyone else in "Nutzer".
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "borrowCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "manageCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxDays" INTEGER,
    "maxOpenPerUser" INTEGER,
    "autoApprove" BOOLEAN,
    "ldapGroupDns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

INSERT INTO "Group" ("id", "name", "description", "permissions", "isDefault", "sortOrder", "updatedAt") VALUES
  ('group-admin', 'Verwaltung', 'Alle Rechte.', ARRAY[
    'catalog.view', 'requests.create',
    'dashboard.view', 'requests.view', 'requests.decide', 'loans.manage', 'calendar.names',
    'devices.manage', 'devices.images', 'devices.defective', 'categories.manage', 'rooms.manage',
    'users.view', 'users.manage', 'users.emergency', 'groups.manage',
    'audit.view', 'settings.appearance', 'settings.rules', 'settings.mail',
    'maintenance.manage', 'maintenance.bypass'
  ], false, 0, CURRENT_TIMESTAMP),
  ('group-user', 'Nutzer', 'Katalog ansehen und Geräte anfragen.', ARRAY['catalog.view', 'requests.create'], true, 1, CURRENT_TIMESTAMP);

ALTER TABLE "User" ADD COLUMN "groupId" TEXT;
UPDATE "User" SET "groupId" = CASE WHEN "role" = 'ADMIN' THEN 'group-admin' ELSE 'group-user' END;
ALTER TABLE "User" ALTER COLUMN "groupId" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "User_groupId_idx" ON "User"("groupId");

ALTER TABLE "User" DROP COLUMN "role";
DROP TYPE "Role";
