/*
  Warnings:

  - A unique constraint covering the columns `[invoiceCode]` on the table `Sale` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "invoiceCode" TEXT;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "categoryId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Sale_invoiceCode_key" ON "Sale"("invoiceCode");

-- CreateIndex
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
