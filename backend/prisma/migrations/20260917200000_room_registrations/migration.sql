-- CreateEnum
CREATE TYPE "RoomRegistrationStatus" AS ENUM ('REGISTERED', 'STARTED', 'REFUNDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "RoomRegistration" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "subscription" "Subscription" NOT NULL DEFAULT 'NONE',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "status" "RoomRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "RoomRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomRegistration_roomId_status_idx" ON "RoomRegistration"("roomId", "status");

-- CreateIndex
CREATE INDEX "RoomRegistration_windowStart_status_idx" ON "RoomRegistration"("windowStart", "status");

-- CreateIndex
CREATE INDEX "RoomRegistration_userId_status_idx" ON "RoomRegistration"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RoomRegistration_roomId_userId_key" ON "RoomRegistration"("roomId", "userId");

