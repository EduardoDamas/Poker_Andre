-- CreateTable
CREATE TABLE "PromoPlacement" (
    "eventId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "place" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoPlacement_pkey" PRIMARY KEY ("eventId","playerId")
);

-- CreateIndex
CREATE INDEX "PromoPlacement_eventId_place_idx" ON "PromoPlacement"("eventId", "place");

