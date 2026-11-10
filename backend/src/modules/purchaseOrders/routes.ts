import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { notVoided } from "../../lib/saleFilters";

export const po = Router();

const poInclude = {
  supplier: { select: { id: true, name: true } },
  items: {
    include: {
      product: {
        select: { id: true, name: true, sku: true, price: true, piecesPerBox: true, isWeighted: true },
      },
    },
  },
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
  if (!parsed.success) {
    return res.status(400).json({
      error: "Choose a supplier, days to analyze (1-90) and target days of stock (1-60).",
    });
  }
  const { supplierId, days, minDaysCover, note } = parsed.data;

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) return res.status(400).json({ error: "Supplier not found" });

  const since = new Date();
  since.setDate(since.getDate() - days);

  // Products of this supplier = its price list + everything ever purchased from it.
  // (Previously purchases were only used when the price list was empty, so products bought
  // before the price list existed were silently left out of the order.)
  const [supplierProductIds, fromPurchases] = await Promise.all([
    prisma.supplierProduct.findMany({ where: { supplierId }, select: { productId: true } }),
    prisma.purchaseItem.findMany({
      where: { purchase: { supplierId } },
      select: { productId: true },
      distinct: ["productId"],
    }),
  ]);
  const productIdSet = new Set<number>([
    ...supplierProductIds.map((r) => r.productId),
    ...fromPurchases.map((r) => r.productId),
  ]);

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
    where: { id: { in: productIds }, deletedAt: null },
    select: { id: true, stock: true, isWeighted: true, piecesPerBox: true },
  });

  const items = [];
  for (const p of products) {
    const recent = salesMap.get(p.id) || 0;
    if (recent <= 0) continue;
    const daily = recent / days;
    const targetStock = daily * minDaysCover;
    const current = Number(p.stock);
    const raw = Math.max(0, targetStock - current);
    if (raw <= 0.0005) continue;
    // You can't order 0.233 of a soap: round up to whole pieces, or whole boxes when the
    // product has a box size. Items sold by weight keep decimals.
    let need: number;
    if (p.isWeighted) need = +raw.toFixed(3);
    else if (p.piecesPerBox && p.piecesPerBox >= 2) need = Math.ceil(raw / p.piecesPerBox) * p.piecesPerBox;
    else need = Math.ceil(raw);
    if (need > 0) {
      items.push({
        productId: p.id,
        suggestedQty: need,
        currentStock: current,
        recentSales: recent,
      });
    }
  }

  if (items.length === 0) {
    return res.status(400).json({
      error: `Nothing to reorder from ${supplier.name}: stock covers ${minDaysCover} days of sales for all its products (based on the last ${days} days).`,
    });
  }

  // biggest need first
  items.sort((a, b) => b.recentSales - a.recentSales);

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
