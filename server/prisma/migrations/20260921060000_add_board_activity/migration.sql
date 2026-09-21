-- CreateTable
CREATE TABLE "BoardActivity" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardActivity_boardId_createdAt_idx" ON "BoardActivity"("boardId", "createdAt");

-- AddForeignKey
ALTER TABLE "BoardActivity" ADD CONSTRAINT "BoardActivity_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardActivity" ADD CONSTRAINT "BoardActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
