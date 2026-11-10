-- Snapshot product name on each sale line (renaming a product must not rewrite old invoices)
ALTER TABLE "SaleItem" ADD COLUMN "productName" TEXT;

-- Backfill existing lines with the best data available (the product's current name/category).
UPDATE "SaleItem" si SET "productName" = p."name"
FROM "Product" p WHERE p."id" = si."productId" AND si."productName" IS NULL;

UPDATE "SaleItem" si SET "categoryId" = p."categoryId"
FROM "Product" p WHERE p."id" = si."productId" AND si."categoryId" IS NULL;

CREATE INDEX "SaleItem_categoryId_idx" ON "SaleItem"("categoryId");
