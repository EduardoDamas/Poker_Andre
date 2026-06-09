-- CreateEnum
CREATE TYPE "Subscription" AS ENUM ('NONE', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "subscription" "Subscription" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "subscriptionUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "pixReference" TEXT,
    "status" "DepositStatus" NOT NULL DEFAULT 'REQUESTED',
    "creditTxnId" TEXT,
    "adminNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deposit_status_idx" ON "Deposit"("status");

-- CreateIndex
CREATE INDEX "Deposit_userId_idx" ON "Deposit"("userId");

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
