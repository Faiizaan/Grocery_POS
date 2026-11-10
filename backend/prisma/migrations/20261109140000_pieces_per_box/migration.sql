-- Pieces per box: purchases can be entered per box; stock/prices stay per piece
ALTER TABLE "Product" ADD COLUMN "piecesPerBox" INTEGER;
ALTER TABLE "PurchaseItem" ADD COLUMN "boxes" DECIMAL(12,3);
ALTER TABLE "PurchaseItem" ADD COLUMN "piecesPerBox" INTEGER;
ALTER TABLE "PurchaseItem" ADD COLUMN "boxCost" DECIMAL(10,2);
