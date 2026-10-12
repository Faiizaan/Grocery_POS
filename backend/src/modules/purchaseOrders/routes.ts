import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { notVoided } from "../../lib/saleFilters";

export const po = Router();

const poInclude = {
  supplier: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true } } } },
};

// POST /api/purchase-orders/generate — creates and saves a DRAFT order
po.post("/generate", async (req, res) => {
  const schema = z.object({
    supplierId: z.number(),
    days: z.number().min(1).max(90),
    minDaysCover: z.number().min(1).max(60).default(7),
    note: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.format());
  const { supplierId, days, minDaysCover, note } = parsed.data;

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) return res.status(400).json({ error: "Supplier not found" });

  const since = new Date();
  since.setDate(since.getDate() - days);

  const supplierProductIds = await prisma.supplierProduct.findMany({
    where: { supplierId },
    select: { productId: true },
  });
  const productIdSet = new Set(supplierProductIds.map((r) => r.productId));

  if (productIdSet.size === 0) {
    const fromPurchases = await prisma.purchaseItem.findMany({
      where: { purchase: { supplierId } },
      select: { productId: true },
      distinct: ["productId"],
    });
    for (const r of fromPurchases) productIdSet.add(r.productId as number);
  }

  if (productIdSet.size === 0) {
    return res.status(400).json({
      error:
        "No products linked to this supplier yet. Record a purchase from this supplier first.",
    });
  }

  const productIds: number[] = [...productIdSet];

  const saleItems = await prisma.saleItem.findMany({
    where: {
      productId: { in: productIds },
      sale: { ...notVoided, createdAt: { gte: since } },
    },
    select: { productId: true, qty: true },
  });

  const salesMap = new Map<number, number>();
  for (const it of saleItems) {
    salesMap.set(it.productId, (salesMap.get(it.productId) || 0) + Number(it.qty));
  }

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, stock: true },
  });

  const items = [];
  for (const p of products) {
    const recent = salesMap.get(p.id) || 0;
    if (recent <= 0) continue;
    const daily = recent / days;
    const targetStock = daily * minDaysCover;
    const current = Number(p.stock);
    const need = Math.max(0, +(targetStock - current).toFixed(3));
    if (need > 0) {
      items.push({
        productId: p.id,
        suggestedQty: need,
        currentStock: current,
        recentSales: recent,
      });
    }
  }

  const draft = await prisma.purchaseOrder.create({
    data: {
      supplierId,
      daysLookback: days,
      status: "DRAFT",
      note: note?.trim() || undefined,
      items: {
        create: items.map((it) => ({
          productId: it.productId,
          suggestedQty: it.suggestedQty,
          currentStock: it.currentStock,
          recentSales: it.recentSales,
        })),
      },
    },
    include: poInclude,
  });

  res.status(201).json(draft);
});

// GET /api/purchase-orders?page=1&limit=30
po.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const skip = (page - 1) * limit;

  const [rows, totalCount] = await Promise.all([
    prisma.purchaseOrder.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: poInclude,
    }),
    prisma.purchaseOrder.count(),
  ]);

  res.json({ page, limit, totalCount, rows });
});

// GET /api/purchase-orders/:id — view a saved order
po.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: poInclude,
  });
  if (!order) return res.status(404).json({ error: "Not found" });
  res.json(order);
});

export default po;
