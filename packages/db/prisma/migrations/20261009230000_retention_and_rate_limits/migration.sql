-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "playerDataDeletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RateLimitWindow" (
    "key" TEXT NOT NULL,
    "windowStartAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RateLimitWindow_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "RateLimitWindow_windowStartAt_idx" ON "RateLimitWindow"("windowStartAt");

-- CreateIndex
CREATE INDEX "GameSession_status_createdAt_idx" ON "GameSession"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GameSession_endedAt_idx" ON "GameSession"("endedAt");
