import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";

export const purchases = Router();

const PurchaseSchema = z.object({
  supplierId: z.number().int().positive(),
  items: z.array(
    z.object({
      productId: z.number(),
      qty: z.number().positive(),
      unitCost: z.number().nonnegative(),
      lineDiscount: z.number().nonnegative().optional(),
      newSalePrice: z.number().nonnegative().optional(),
    })
  ),
  note: z.string().optional(),
});

async function upsertSupplierProduct(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  supplierId: number,
  productId: number,
  unitCost: number,
  purchasedAt: Date
) {
  await tx.supplierProduct.upsert({
    where: { supplierId_productId: { supplierId, productId } },
    create: {
      supplierId,
      productId,
      unitCost,
      lastPurchasedAt: purchasedAt,
    },
    update: {
      unitCost,
      lastPurchasedAt: purchasedAt,
    },
  });
}

// POST /api/purchases
purchases.post("/", async (req, res) => {
  const parsed = PurchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.format());
  const { supplierId, items, note } = parsed.data;

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) return res.status(400).json({ error: "Supplier not found" });

  let subtotalPre = 0;
  let totalLineDiscount = 0;
  const lineData = items.map((it) => {
    const gross = it.qty * it.unitCost;
    const lineDisc = Math.min(Math.max(it.lineDiscount ?? 0, 0), gross);
    subtotalPre += gross;
    totalLineDiscount += lineDisc;
    return { ...it, lineDisc, lineTotal: +(gross - lineDisc).toFixed(2) };
  });

  const subtotal = +(subtotalPre - totalLineDiscount).toFixed(2);
  const taxTotal = 0;
  const total = +(subtotal + taxTotal).toFixed(2);

  try {
    const purchase = await prisma.$transaction(async (tx) => {
      const purchasedAt = new Date();
      const p = await tx.purchase.create({
        data: {
          supplierId,
          discountPercent: 0,
          discountValue: totalLineDiscount,
          subtotal,
          taxTotal,
          total,
          note,
        },
      });

      for (const it of lineData) {
        await tx.purchaseItem.create({
          data: {
            purchaseId: p.id,
            productId: it.productId,
            qty: it.qty,
            unitCost: it.unitCost,
            lineDiscount: it.lineDisc,
            lineTotal: it.lineTotal,
          },
        });

        await tx.product.update({
          where: { id: it.productId },
          data: {
            stock: { increment: it.qty },
            price: it.unitCost,
            ...(it.newSalePrice !== undefined ? { salePrice: it.newSalePrice } : {}),
          },
        });

        await upsertSupplierProduct(
          tx,
          supplierId,
          it.productId,
          it.unitCost,
          purchasedAt
        );

        await tx.inventoryTxn.create({
          data: {
            productId: it.productId,
            qtyChange: it.qty,
            reason: `PURCHASE #${p.id}`,
          },
        });
      }

      return p;
    });

    res.status(201).json({
      ok: true,
      id: purchase.id,
      subtotal,
      total,
      discountValue: totalLineDiscount,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Purchase failed" });
  }
});

// GET /api/purchases?page=1&limit=30
purchases.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const skip = (page - 1) * limit;

  const [rows, totalCount] = await Promise.all([
    prisma.purchase.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        supplier: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true } } } },
      },
    }),
    prisma.purchase.count(),
  ]);

  res.json({ page, limit, totalCount, rows });
});

// GET /api/purchases/:id
purchases.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  const p = await prisma.purchase.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true } },
      items: {
        include: {
          product: { select: { name: true, sku: true, barcode: true } },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

export default purchases;
