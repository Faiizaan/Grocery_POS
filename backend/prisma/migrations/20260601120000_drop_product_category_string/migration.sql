-- Migrate legacy Product.category string to Category.categoryId, then drop the column.

-- Ensure categories exist for distinct legacy labels
INSERT INTO "Category" ("name")
SELECT DISTINCT UPPER(TRIM(p."category"))
FROM "Product" p
WHERE p."category" IS NOT NULL
  AND TRIM(p."category") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "Category" c WHERE c."name" = UPPER(TRIM(p."category"))
  );

-- Link products to categories by normalized name
UPDATE "Product" p
SET "categoryId" = c."id"
FROM "Category" c
WHERE p."categoryId" IS NULL
  AND p."category" IS NOT NULL
  AND TRIM(p."category") <> ''
  AND c."name" = UPPER(TRIM(p."category"));

ALTER TABLE "Product" DROP COLUMN "category";
