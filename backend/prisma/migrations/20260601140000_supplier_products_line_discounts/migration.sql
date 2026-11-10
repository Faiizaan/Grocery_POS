-- SupplierProduct: per-supplier product pricing
CREATE TABLE "SupplierProduct" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,
    "lastPurchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierProduct_supplierId_productId_key" ON "SupplierProduct"("supplierId", "productId");
CREATE INDEX "SupplierProduct_supplierId_idx" ON "SupplierProduct"("supplierId");

ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Line-level discounts
ALTER TABLE "SaleItem" ADD COLUMN "lineDiscount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseItem" ADD COLUMN "lineDiscount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill SupplierProduct from purchase history
INSERT INTO "SupplierProduct" ("supplierId", "productId", "unitCost", "lastPurchasedAt", "updatedAt")
SELECT DISTINCT ON (pu."supplierId", pi."productId")
    pu."supplierId",
    pi."productId",
    pi."unitCost",
    pu."createdAt",
    pu."createdAt"
FROM "PurchaseItem" pi
JOIN "Purchase" pu ON pu."id" = pi."purchaseId"
WHERE pu."supplierId" IS NOT NULL
ORDER BY pu."supplierId", pi."productId", pu."createdAt" DESC;

-- Ensure orphan purchases have a supplier before NOT NULL
INSERT INTO "Supplier" ("name", "createdAt")
SELECT 'Unknown Supplier', NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Supplier" WHERE "name" = 'Unknown Supplier');

UPDATE "Purchase"
SET "supplierId" = (SELECT "id" FROM "Supplier" WHERE "name" = 'Unknown Supplier' LIMIT 1)
WHERE "supplierId" IS NULL;

ALTER TABLE "Purchase" ALTER COLUMN "supplierId" SET NOT NULL;
