-- CreateEnum
CREATE TYPE "SubscriptionRequestStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "SubscriptionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "Subscription" NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "status" "SubscriptionRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "checkoutUrl" TEXT,
    "adminNote" TEXT,
    "grantedUntil" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "SubscriptionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionRequest_status_idx" ON "SubscriptionRequest"("status");

-- CreateIndex
CREATE INDEX "SubscriptionRequest_userId_idx" ON "SubscriptionRequest"("userId");

-- AddForeignKey
ALTER TABLE "SubscriptionRequest" ADD CONSTRAINT "SubscriptionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
