-- CreateTable
CREATE TABLE "CardType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "boardId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardType_boardId_position_idx" ON "CardType"("boardId", "position");

-- AddForeignKey
ALTER TABLE "CardType" ADD CONSTRAINT "CardType_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: cards get an optional card type reference
ALTER TABLE "Card" ADD COLUMN "cardTypeId" TEXT;

-- CreateIndex
CREATE INDEX "Card_cardTypeId_idx" ON "Card"("cardTypeId");

-- AddForeignKey: deleting a card type keeps its cards (their cardTypeId becomes NULL)
ALTER TABLE "Card" ADD CONSTRAINT "Card_cardTypeId_fkey" FOREIGN KEY ("cardTypeId") REFERENCES "CardType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
