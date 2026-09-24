-- CreateEnum
CREATE TYPE "AuthSource" AS ENUM ('LOCAL', 'LDAP');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "authSource" "AuthSource" NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "User" ADD COLUMN "ldapDn" TEXT;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_ldapDn_key" ON "User"("ldapDn");
