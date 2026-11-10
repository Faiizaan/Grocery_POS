-- This is an empty migration.
-- Backfill invoiceCode for existing rows based on createdAt (daily sequence)
WITH numbered AS (
  SELECT
    id,
    to_char("createdAt", 'YYYYMMDD') AS ymd,
    ROW_NUMBER() OVER (
      PARTITION BY date_trunc('day', "createdAt")
      ORDER BY "createdAt", id
    ) AS seq
  FROM "Sale"
)
UPDATE "Sale" s
SET "invoiceCode" = 'SL-' || n.ymd || '-' || lpad(n.seq::text, 4, '0')
FROM numbered n
WHERE s.id = n.id
  AND s."invoiceCode" IS NULL;

-- Make the column NOT NULL now that everything is populated
ALTER TABLE "Sale" ALTER COLUMN "invoiceCode" SET NOT NULL;
