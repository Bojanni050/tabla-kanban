-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Card_archived_idx" ON "Card"("archived");
