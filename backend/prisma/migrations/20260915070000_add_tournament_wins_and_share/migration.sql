-- AlterEnum
ALTER TYPE "PointsTxnKind" ADD VALUE 'SHARE';

-- CreateTable
CREATE TABLE "TournamentWin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "prizeCents" BIGINT NOT NULL,
    "multiplier" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentWin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentWin_createdAt_idx" ON "TournamentWin"("createdAt");

-- CreateIndex
CREATE INDEX "TournamentWin_userId_createdAt_idx" ON "TournamentWin"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "TournamentWin" ADD CONSTRAINT "TournamentWin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
