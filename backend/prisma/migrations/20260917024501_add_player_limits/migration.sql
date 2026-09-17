-- CreateTable
CREATE TABLE "PlayerLimit" (
    "userId" TEXT NOT NULL,
    "dailyCents" BIGINT,
    "weeklyCents" BIGINT,
    "monthlyCents" BIGINT,
    "pendingDailyCents" BIGINT,
    "pendingWeeklyCents" BIGINT,
    "pendingMonthlyCents" BIGINT,
    "pendingEffectiveAt" TIMESTAMP(3),
    "selfExcludedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerLimit_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "PlayerLimit" ADD CONSTRAINT "PlayerLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
