-- AlterTable
ALTER TABLE "SubscriptionRequest" ADD COLUMN     "orderNsu" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionRequest_orderNsu_key" ON "SubscriptionRequest"("orderNsu");

