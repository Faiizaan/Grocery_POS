-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidedById" INTEGER;

-- CreateIndex
CREATE INDEX "Sale_voidedAt_idx" ON "Sale"("voidedAt");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
