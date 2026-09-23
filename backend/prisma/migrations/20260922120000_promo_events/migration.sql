-- CreateEnum
CREATE TYPE "PromoEventStatus" AS ENUM ('SCHEDULED', 'PAID', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AccountType" ADD VALUE 'PROMOTIONS';

-- AlterEnum
ALTER TYPE "TxnKind" ADD VALUE 'PROMO_PRIZE';

-- CreateTable
CREATE TABLE "PromoEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "prizeCents" BIGINT NOT NULL,
    "prizeSubscriberCents" BIGINT NOT NULL,
    "status" "PromoEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "winnerId" TEXT,
    "winnerSubscribed" BOOLEAN,
    "prizePaidCents" BIGINT,
    "prizeTxnId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromoEvent_status_startsAt_idx" ON "PromoEvent"("status", "startsAt");

