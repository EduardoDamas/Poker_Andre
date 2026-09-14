-- CreateEnum
CREATE TYPE "PointsTxnKind" AS ENUM ('WHEEL', 'CONVERSION', 'MILESTONE', 'GAME_REWARD', 'ADJUST');

-- CreateTable
CREATE TABLE "PointsAccount" (
    "userId" TEXT NOT NULL,
    "freePoints" BIGINT NOT NULL DEFAULT 0,
    "paidPoints" BIGINT NOT NULL DEFAULT 0,
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "lastSpinDay" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointsAccount_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PointsTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PointsTxnKind" NOT NULL,
    "freeDelta" BIGINT NOT NULL DEFAULT 0,
    "paidDelta" BIGINT NOT NULL DEFAULT 0,
    "referenceId" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PointsTransaction_referenceId_key" ON "PointsTransaction"("referenceId");

-- CreateIndex
CREATE INDEX "PointsTransaction_userId_createdAt_idx" ON "PointsTransaction"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PointsAccount" ADD CONSTRAINT "PointsAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsTransaction" ADD CONSTRAINT "PointsTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
