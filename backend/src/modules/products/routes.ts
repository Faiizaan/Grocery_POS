import { Router } from "express";
import { prisma } from "../../db";
import { z } from "zod";
import { requireRole } from "../auth/auth";
import { timingSafeEqual } from "crypto";

export const products = Router();

// Static passwords come only from env vars (see .env.example). If one is not set,
// that feature is switched off rather than falling back to a guessable default.
const passwordFromEnv = (name: string) => (process.env[name] || "").trim();

/** ---------------------------
 *  GET /api/products/search?q=...
 *  (POS sales screen — name, SKU, or barcode)
 * --------------------------- */
products.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json([]);

  const items = await prisma.product.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { equals: q } },
        { barcode: q ? { equals: q } : undefined },
      ],
    },
    take: 20,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      salePrice: true,
      taxRate: true,
      stock: true,
      categoryId: true,
      categoryRef: { select: { id: true, name: true } },
    },
  });

  res.json(items);
});

/** ---------------------------
 *  GET /api/products
 *  - optional ?q= to match name (contains, case-insensitive), or exact sku/barcode
 * --------------------------- */
products.get("/", async (req, res) => {
  const q = (req.query.q as string) || "";
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const skip = (page - 1) * limit;

  const where = {
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { barcode: q },
            { sku: q },
          ],
        }
      : {}),
  };

  const [rows, totalCount] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { categoryRef: { select: { id: true, name: true } } },
    }),
    prisma.product.count({ where }),
  ]);

  res.json({ page, limit, totalCount, rows });
});

/** ---------------------------
 *  POST /api/products/stock-value  (manager/admin)
 *  body: { password }  — static password from the STOCK_VALUE_PASSWORD env var
 *  Value of the stock on hand right now (deleted products and zero/negative stock excluded):
 *   costValue = sum(stock x purchase price), saleValue = sum(stock x sale price),
 *   plus the same per category.
 * --------------------------- */
products.post("/stock-value", requireRole("MANAGER", "ADMIN"), async (req, res) => {
  const given = typeof req.body?.password === "string" ? req.body.password : "";
  if (!given) return res.status(400).json({ error: "Enter the stock value password." });
  const expectedStock = passwordFromEnv("STOCK_VALUE_PASSWORD");
  if (!expectedStock) {
    return res.status(503).json({ error: "Stock value is disabled: set STOCK_VALUE_PASSWORD on the server." });
  }
  if (!staticPasswordOk(given, expectedStock)) {
    return res.status(403).json({ error: "Incorrect password" });
  }
  try {
    const rows = await prisma.$queryRaw<
      {
        categoryId: number | null;
        category: string | null;
        products: bigint;
        pieces: string;
        costValue: string;
        saleValue: string;
      }[]
    >`
      SELECT p."categoryId", c."name" AS category,
             COUNT(*) AS products,
             SUM(p."stock")::text AS pieces,
             ROUND(SUM(p."stock" * p."price"), 2)::text AS "costValue",
             ROUND(SUM(p."stock" * p."salePrice"), 2)::text AS "saleValue"
      FROM "Product" p
      LEFT JOIN "Category" c ON c."id" = p."categoryId"
      WHERE p."deletedAt" IS NULL AND p."stock" > 0
      GROUP BY p."categoryId", c."name"
      ORDER BY SUM(p."stock" * p."price") DESC`;

    const byCategory = rows.map((r) => {
      const costValue = Number(r.costValue);
      const saleValue = Number(r.saleValue);
      return {
        categoryId: r.categoryId,
        category: r.category ?? "Uncategorized",
        products: Number(r.products),
        pieces: Number(r.pieces),
        costValue,
        saleValue,
        profit: +(saleValue - costValue).toFixed(2),
      };
    });
    const sum = (k: "products" | "pieces" | "costValue" | "saleValue") =>
      byCategory.reduce((t, r) => t + r[k], 0);
    const costValue = +sum("costValue").toFixed(2);
    const saleValue = +sum("saleValue").toFixed(2);

    res.json({
      totals: {
        products: sum("products"),
        pieces: +sum("pieces").toFixed(3),
        costValue,
        saleValue,
        profit: +(saleValue - costValue).toFixed(2),
      },
      byCategory,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to compute stock value" });
  }
});

/** ---------------------------
 *  GET /api/products/barcode/:code
 * --------------------------- */
products.get("/barcode/:code", async (req, res) => {
  const item = await prisma.product.findFirst({
    where: { barcode: req.params.code, deletedAt: null },
  });
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

/** ---------------------------
 *  POST /api/products
 * --------------------------- */
const toUndef = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const ProductCreateSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  barcode: toUndef, // optional unique text
  categoryId: z.number().int().positive(), // REQUIRED ✅

  price: z.number().nonnegative(), // purchase price
  salePrice: z.number().nonnegative(), // sale price
  taxRate: z.number().min(0).max(100).default(0),
  isWeighted: z.boolean().default(false),
  stock: z.number().nonnegative().default(0),
  piecesPerBox: z.number().int().min(2).max(1000).nullable().optional(),
});

products.post("/", requireRole("MANAGER", "ADMIN"), async (req, res) => {
  const parsed = ProductCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.format());
  const data = parsed.data;
  // 👇 NEW: enforce sale price > purchase price
  if (data.salePrice <= data.price) {
    return res
      .status(400)
      .json({ error: "Sale price must be greater than purchase price." });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          name: data.name.trim(),
          sku: data.sku.trim(),
          barcode: data.barcode,
          categoryId: data.categoryId,
          price: data.price,
          salePrice: data.salePrice,
          taxRate: data.taxRate,
          isWeighted: data.isWeighted,
          stock: data.stock,
          piecesPerBox: data.piecesPerBox ?? null,
        },
      });

      if (data.stock && data.stock > 0) {
        await tx.inventoryTxn.create({
          data: {
            productId: p.id,
            qtyChange: data.stock,
            reason: "OPENING",
          },
        });
      }

      return p;
    });

    res.status(201).json(created);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return res.status(409).json({ error: "SKU or barcode already exists" });
    }
    console.error(e);
    res.status(500).json({ error: "Failed to create product" });
  }
});

/** ---------------------------
 *  PATCH /api/products/:id
 *  - edit: name, price (purchase), salePrice, barcode, categoryId
 *  - supports clearing barcode/categoryId by sending null/empty string
 * --------------------------- */
const emptyToNull = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null) return null;
    if (typeof v === "string") {
      const t = v.trim();
      return t === "" ? null : t;
    }
    return undefined as any;
  });

const ProductUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    price: z.number().nonnegative().optional(),
    salePrice: z.number().nonnegative().optional(),
    barcode: emptyToNull, // string | null | undefined
    categoryId: z.number().int().positive().nullable().optional(),
    piecesPerBox: z.number().int().min(2).max(1000).nullable().optional(),
  })
  .refine(
    (body) =>
      body.piecesPerBox !== undefined ||
      body.name !== undefined ||
      body.price !== undefined ||
      body.salePrice !== undefined ||
      body.barcode !== undefined ||
      body.categoryId !== undefined,
    {
      message:
        "Provide at least one field to update (name, price, salePrice, barcode, or categoryId).",
      path: ["name"],
    }
  );

products.patch("/:id", requireRole("MANAGER", "ADMIN"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id))
    return res.status(400).json({ error: "Invalid id" });

  const parsed = ProductUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.format());
  const data = parsed.data;

  const existing = await prisma.product.findUnique({
    where: { id },
    select: { deletedAt: true },
  });
  if (!existing || existing.deletedAt) {
    return res.status(404).json({ error: "Product not found" });
  }

  try {
    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.salePrice !== undefined ? { salePrice: data.salePrice } : {}),
        ...(data.barcode !== undefined ? { barcode: data.barcode } : {}),
        ...(data.categoryId !== undefined
          ? { categoryId: data.categoryId }
          : {}),
        ...(data.piecesPerBox !== undefined
          ? { piecesPerBox: data.piecesPerBox }
          : {}),
      },
      include: { categoryRef: { select: { id: true, name: true } } },
    });

    return res.json(updated);
  } catch (e: any) {
    if (e?.code === "P2025") {
      return res.status(404).json({ error: "Product not found" });
    }
    if (e?.code === "P2002") {
      return res.status(409).json({ error: "Unique constraint violation" });
    }
    console.error(e);
    return res.status(500).json({ error: "Failed to update product" });
  }
});

/** ---------------------------
 *  POST /api/products/delete
 *  body: { ids: number[], password: string }
 *  Soft-deletes one or more products after checking the static delete password
 *  (PRODUCT_DELETE_PASSWORD env var). Sales/purchase history is kept; the product
 *  disappears from lists, search, checkout and purchases. Its barcode is cleared and
 *  its SKU suffixed so both can be reused by a new product.
 * --------------------------- */
const DeleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  password: z.string().min(1),
});

function deletePasswordOk(given: string) {
  const expected = passwordFromEnv("PRODUCT_DELETE_PASSWORD");
  return expected !== "" && staticPasswordOk(given, expected);
}

function staticPasswordOk(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

products.post("/delete", requireRole("MANAGER", "ADMIN"), async (req, res) => {
  const parsed = DeleteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Select at least one product and enter the password." });
  }
  const { password } = parsed.data;
  const ids = [...new Set(parsed.data.ids)];

  if (!deletePasswordOk(password)) {
    return res.status(403).json({ error: "Incorrect delete password" });
  }

  try {
    const found = await prisma.product.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, sku: true, name: true },
    });
    if (!found.length) {
      return res.status(404).json({ error: "No matching products found" });
    }

    const now = new Date();
    await prisma.$transaction(
      found.map((p) =>
        prisma.product.update({
          where: { id: p.id },
          data: {
            deletedAt: now,
            barcode: null,
            sku: `${p.sku}~del${p.id}`,
          },
        })
      )
    );

    return res.json({
      ok: true,
      deleted: found.map((p) => ({ id: p.id, name: p.name })),
      notFound: ids.filter((id) => !found.some((p) => p.id === id)),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete products" });
  }
});

export default products;
