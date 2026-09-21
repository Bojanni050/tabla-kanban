-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "assigneeId" TEXT;

-- CreateTable
CREATE TABLE "CardActivity" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Card_assignee_id_idx" ON "Card"("assigneeId");
CREATE INDEX "CardActivity_cardId_createdAt_idx" ON "CardActivity"("cardId", "createdAt");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CardActivity" ADD CONSTRAINT "CardActivity_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardActivity" ADD CONSTRAINT "CardActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
