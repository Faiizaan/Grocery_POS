import { Router } from "express";
import { prisma } from "../../db";
import { z } from "zod";
import { requireRole } from "../auth/auth";

export const products = Router();

/** ---------------------------
 *  GET /api/products/search?q=...
 *  (POS sales screen — name, SKU, or barcode)
 * --------------------------- */
products.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json([]);

  const items = await prisma.product.findMany({
    where: {
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

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { barcode: q },
          { sku: q },
        ],
      }
    : undefined;

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
 *  GET /api/products/barcode/:code
 * --------------------------- */
products.get("/barcode/:code", async (req, res) => {
  const item = await prisma.product.findFirst({
    where: { barcode: req.params.code },
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
  })
  .refine(
    (body) =>
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

export default products;
