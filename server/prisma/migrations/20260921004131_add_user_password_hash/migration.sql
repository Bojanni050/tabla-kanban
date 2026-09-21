-- AlterTable: Add passwordHash with a temporary default for existing rows
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '';

-- Remove the default so new rows must provide a value
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP DEFAULT;
