-- CreateTable
CREATE TABLE "Swimlane" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "boardId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Swimlane_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Swimlane_boardId_position_idx" ON "Swimlane"("boardId", "position");

-- AddForeignKey
ALTER TABLE "Swimlane" ADD CONSTRAINT "Swimlane_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: cards get an optional swimlane reference
ALTER TABLE "Card" ADD COLUMN "swimlaneId" TEXT;

-- CreateIndex
CREATE INDEX "Card_swimlaneId_idx" ON "Card"("swimlaneId");

-- AddForeignKey: deleting a swimlane keeps its cards (their swimlaneId becomes NULL)
ALTER TABLE "Card" ADD CONSTRAINT "Card_swimlaneId_fkey" FOREIGN KEY ("swimlaneId") REFERENCES "Swimlane"("id") ON DELETE SET NULL ON UPDATE CASCADE;
