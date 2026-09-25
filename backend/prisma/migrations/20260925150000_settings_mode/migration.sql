-- New permission "settings.mode": the built-in "Verwaltung" keeps having every permission.
UPDATE "Group"
SET "permissions" = array_append("permissions", 'settings.mode')
WHERE "id" = 'group-admin' AND NOT ('settings.mode' = ANY("permissions"));
