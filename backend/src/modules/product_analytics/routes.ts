import { Router } from "express";
import { prisma } from "../../db";
import { buildCostLookup, lineCost } from "../../lib/costBasis";

const router = Router();

const YMD = /^\d{4}-\d{2}-\d{2}$/;
// Local day boundaries, consistent with the other report endpoints.
const startOfDayLocal = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};
const endOfDayLocal = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
};

function parseRange(query: Record<string, unknown>) {
  const fromStr =
    typeof query.from === "string" && YMD.test(query.from) ? query.from : null;
  const toStr =
    typeof query.to === "string" && YMD.test(query.to) ? query.to : null;
  const from = fromStr ? startOfDayLocal(fromStr) : null;
  const to = toStr ? endOfDayLocal(toStr) : null;
  const where = {
    sale: {
      voidedAt: null,
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
  };
  return { fromStr, toStr, where };
}

const lineSelect = {
  id: true,
  productId: true,
  qty: true,
  unitPrice: true,
  taxRate: true,
  lineDiscount: true,
  lineTotal: true,
  unitCostAtSale: true,
  costTotal: true,
  sale: { select: { id: true, createdAt: true, invoiceCode: true, total: true } },
} as const;

/** Revenue ex tax for one line = unitPrice * qty - lineDiscount (price as charged at sale time). */
const lineRevenue = (l: { qty: unknown; unitPrice: unknown; lineDiscount: unknown }) =>
  Number(l.unitPrice) * Number(l.qty) - (Number(l.lineDiscount) || 0);

/**
 * GET /api/product-analytics/:productId/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Profit uses the prices that applied on each sale:
 *  revenue = what the customer was charged (ex tax, after line discount)
 *  cost    = purchase cost captured at sale time (see lib/costBasis)
 * Editing the product's purchase/sale price later does not rewrite past profit.
 */
router.get("/:productId/summary", async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isFinite(productId))
    return res.status(400).json({ error: "Invalid productId" });

  const { fromStr, toStr, where } = parseRange(req.query);

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        price: true,
        salePrice: true,
        stock: true,
        taxRate: true,
        isWeighted: true,
        createdAt: true,
        deletedAt: true,
      },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });

    const lines = await prisma.saleItem.findMany({
      where: { productId, ...where },
      select: lineSelect,
    });

    const lookup = await buildCostLookup([productId]);
    const fallback = Number(product.price) || 0;

    let qtySold = 0;
    let revenueExTax = 0;
    let revenueInclTax = 0;
    let cost = 0;
    let snapshotLines = 0;
    for (const l of lines) {
      qtySold += Number(l.qty);
      revenueExTax += lineRevenue(l);
      revenueInclTax += Number(l.lineTotal);
      cost += lineCost(l, l.sale.createdAt, fallback, lookup);
      if (Number(l.costTotal) > 0 || Number(l.unitCostAtSale) > 0) snapshotLines++;
    }
    const profit = revenueExTax - cost;
    const profitMargin = revenueExTax > 0 ? (profit / revenueExTax) * 100 : 0;

    return res.json({
      product: {
        ...product,
        price: product.price.toFixed(2),
        salePrice: product.salePrice.toFixed(2),
        stock: product.stock.toFixed(3),
        taxRate: product.taxRate.toFixed(2),
      },
      totals: {
        qtySold: qtySold.toFixed(3),
        revenueExTax: revenueExTax.toFixed(2),
        revenueInclTax: revenueInclTax.toFixed(2),
        revenue: revenueExTax.toFixed(2), // kept for backwards compatibility
        cost: cost.toFixed(2),
        avgUnitCost: qtySold > 0 ? (cost / qtySold).toFixed(2) : "0.00",
        profit: profit.toFixed(2),
        profitMargin: profitMargin.toFixed(2),
      },
      costBasisMeta: {
        lines: lines.length,
        snapshotLines,
        note: "Cost per sale = purchase cost recorded at the time of sale. Older sales without a snapshot use the purchase cost in effect on that date.",
      },
      filter: { from: fromStr, to: toStr },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to load product summary" });
  }
});

/**
 * GET /api/product-analytics/:productId/sales?from&to&limit&offset
 * Per-sale-line revenue / cost / profit using the prices of that sale.
 */
router.get("/:productId/sales", async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isFinite(productId))
    return res.status(400).json({ error: "Invalid productId" });

  const limitRaw = Number(req.query.limit ?? 200);
  const offsetRaw = Number(req.query.offset ?? 0);
  const take = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;
  const skip = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

  const { where } = parseRange(req.query);

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { price: true },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });

    const rows = await prisma.saleItem.findMany({
      where: { productId, ...where },
      orderBy: { id: "desc" },
      take,
      skip,
      select: lineSelect,
    });

    const lookup = await buildCostLookup([productId]);
    const fallback = Number(product.price) || 0;

    const out = rows.map((r) => {
      const revenueExTax = lineRevenue(r);
      const costTotal = lineCost(r, r.sale.createdAt, fallback, lookup);
      const qty = Number(r.qty);
      return {
        id: r.id,
        qty: r.qty.toFixed(3),
        unitPrice: r.unitPrice.toFixed(2),
        taxRate: r.taxRate.toFixed(2),
        lineDiscount: r.lineDiscount.toFixed(2),
        lineTotal: r.lineTotal.toFixed(2),
        unitCost: (qty > 0 ? costTotal / qty : 0).toFixed(2),
        revenueExTax: revenueExTax.toFixed(2),
        costTotal: costTotal.toFixed(2),
        profit: (revenueExTax - costTotal).toFixed(2),
        sale: { ...r.sale, total: r.sale.total.toFixed(2) },
      };
    });

    return res.json({ rows: out });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to load product sales history" });
  }
});

export default router;
