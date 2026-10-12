import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";

export const suppliers = Router();

const CreateSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
});

// GET /api/suppliers?page=1&limit=30
suppliers.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const skip = (page - 1) * limit;

  const [rows, totalCount] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      skip,
      take: limit,
    }),
    prisma.supplier.count(),
  ]);

  res.json({ page, limit, totalCount, rows });
});

// GET /api/suppliers/options — all suppliers for dropdowns (id + name)
suppliers.get("/options", async (_req, res) => {
  const list = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  res.json(list);
});

// GET /api/suppliers/:id — detail + products with supplier-specific prices
suppliers.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  const supplier = await prisma.supplier.findUnique({
    where: { id },
    select: { id: true, name: true, phone: true, createdAt: true },
  });
  if (!supplier) return res.status(404).json({ error: "Not found" });

  const supplierProducts = await prisma.supplierProduct.findMany({
    where: { supplierId: id },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          barcode: true,
          price: true,
          salePrice: true,
          stock: true,
        },
      },
    },
    orderBy: { product: { name: "asc" } },
  });

  res.json({
    supplier,
    products: supplierProducts.map((sp: (typeof supplierProducts)[number]) => ({
      productId: sp.productId,
      name: sp.product.name,
      sku: sp.product.sku,
      barcode: sp.product.barcode,
      supplierUnitCost: sp.unitCost,
      latestProductCost: sp.product.price,
      salePrice: sp.product.salePrice,
      stock: sp.product.stock,
      lastPurchasedAt: sp.lastPurchasedAt,
    })),
  });
});

suppliers.post("/", async (req, res) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.format());
  try {
    const supplier = await prisma.supplier.create({ data: parsed.data });
    res.status(201).json(supplier);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      return res.status(409).json({ error: "Supplier name already exists" });
    }
    console.error(e);
    res.status(500).json({ error: "Failed to create supplier" });
  }
});

export default suppliers;
