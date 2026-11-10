-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountValue" DECIMAL(10,2) NOT NULL DEFAULT 0;
