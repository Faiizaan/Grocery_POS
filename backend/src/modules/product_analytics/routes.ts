import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db";

const router = Router();

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const startOfDayUTC = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const endOfDayUTC = (ymd: string) => new Date(`${ymd}T23:59:59.999Z`);

type BasisMode = "latest" | "avg";

async function getCostBasis(productId: number, basis: BasisMode) {
  // If you have no purchases yet, fall back to Product.price.
  if (basis === "latest") {
    const last = await prisma.purchaseItem.findFirst({
      where: { productId },
      orderBy: [{ purchase: { createdAt: "desc" } }, { id: "desc" }],
      select: { unitCost: true, purchase: { select: { createdAt: true } } },
    });

    return {
      basis: last?.unitCost ?? null,
      basisDate: last?.purchase?.createdAt ?? null,
      mode: "latest" as const,
    };
  }

  // Weighted average = sum(qty*unitCost) / sum(qty)
  const rows = await prisma.purchaseItem.findMany({
    where: { productId },
    select: { qty: true, unitCost: true },
  });

  let qtySum = new Prisma.Decimal(0);
  let costSum = new Prisma.Decimal(0);

  for (const r of rows) {
    qtySum = qtySum.add(r.qty);
    costSum = costSum.add(r.unitCost.mul(r.qty));
  }

  const avg = qtySum.greaterThan(0) ? costSum.div(qtySum) : null;

  return {
    basis: avg,
    basisDate: null,
    mode: "avg" as const,
  };
}

/**
 * GET /api/product-analytics/:productId/summary
 * Query:
 *  - from=YYYY-MM-DD&to=YYYY-MM-DD (optional)
 *  - basis=latest|avg (optional, default latest)
 *
 * Profit ignores tax:
 *  revenue = sum(qty * unitPrice)
 *  cost = qtySold * costBasis
 *  profit = revenue - cost
 *  profitMargin% = profit / revenue * 100
 */
router.get("/:productId/summary", async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isFinite(productId))
    return res.status(400).json({ error: "Invalid productId" });

  const basis: BasisMode = req.query.basis === "avg" ? "avg" : "latest";

  const fromStr =
    typeof req.query.from === "string" && YMD.test(req.query.from)
      ? req.query.from
      : null;
  const toStr =
    typeof req.query.to === "string" && YMD.test(req.query.to)
      ? req.query.to
      : null;

  const from = fromStr ? startOfDayUTC(fromStr) : null;
  const to = toStr ? endOfDayUTC(toStr) : null;

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        price: true, // fallback cost if no purchase history
        salePrice: true,
        stock: true,
        taxRate: true,
        isWeighted: true,
        createdAt: true,
      },
    });

    if (!product) return res.status(404).json({ error: "Product not found" });

    const dateFilter = {
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

    // Pull sale lines (minimal) to compute revenue + qtySold ignoring tax
    const saleLines = await prisma.saleItem.findMany({
      where: { productId, ...dateFilter },
      select: {
        qty: true,
        unitPrice: true, // ex tax
        sale: { select: { createdAt: true } },
      },
    });

    let qtySold = new Prisma.Decimal(0);
    let revenue = new Prisma.Decimal(0);

    for (const r of saleLines) {
      qtySold = qtySold.add(r.qty);
      revenue = revenue.add(r.unitPrice.mul(r.qty));
    }

    // Cost basis from purchases (latest or weighted avg)
    const cb = await getCostBasis(productId, basis);

    const costBasis = cb.basis ?? product.price; // fallback to Product.price
    const cost = qtySold.mul(costBasis);
    const profit = revenue.sub(cost);
    const profitMargin = revenue.greaterThan(0)
      ? profit.div(revenue).mul(100)
      : new Prisma.Decimal(0);

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
        revenue: revenue.toFixed(2), // ✅ ex tax
        costBasis: costBasis.toFixed(2), // ✅ per unit basis (latest/avg)
        cost: cost.toFixed(2),
        profit: profit.toFixed(2),
        profitMargin: profitMargin.toFixed(2), // %
      },
      costBasisMeta: {
        mode: cb.mode,
        basisDate: cb.basisDate ? cb.basisDate.toISOString() : null,
        note:
          cb.mode === "latest"
            ? "Using latest purchase unit cost (fallback to Product.price if no purchases)."
            : "Using weighted average purchase unit cost (fallback to Product.price if no purchases).",
      },
      filter: { from: fromStr, to: toStr },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to load product summary" });
  }
});

/**
 * GET /api/product-analytics/:productId/sales
 * Same filters + basis.
 * Returns per-sale-line profit using the same cost basis (ignoring tax).
 */
router.get("/:productId/sales", async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isFinite(productId))
    return res.status(400).json({ error: "Invalid productId" });

  const basis: BasisMode = req.query.basis === "avg" ? "avg" : "latest";

  const limitRaw = Number(req.query.limit ?? 200);
  const offsetRaw = Number(req.query.offset ?? 0);
  const take = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 500)
    : 200;
  const skip = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

  const fromStr =
    typeof req.query.from === "string" && YMD.test(req.query.from)
      ? req.query.from
      : null;
  const toStr =
    typeof req.query.to === "string" && YMD.test(req.query.to)
      ? req.query.to
      : null;

  const from = fromStr ? startOfDayUTC(fromStr) : null;
  const to = toStr ? endOfDayUTC(toStr) : null;

  const dateFilter = {
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

  try {
    // Cost basis once for all rows
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { price: true },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });

    const cb = await getCostBasis(productId, basis);
    const costBasis = cb.basis ?? product.price;

    const rows = await prisma.saleItem.findMany({
      where: { productId, ...dateFilter },
      orderBy: { id: "desc" },
      take,
      skip,
      select: {
        id: true,
        qty: true,
        unitPrice: true,
        taxRate: true,
        lineTotal: true, // still returned if you want to show it, but profit ignores it
        sale: {
          select: { id: true, createdAt: true, invoiceCode: true, total: true },
        },
      },
    });

    const out = rows.map((r) => {
      const revenueExTax = r.unitPrice.mul(r.qty);
      const costTotal = costBasis.mul(r.qty);
      const profit = revenueExTax.sub(costTotal);

      return {
        id: r.id,
        qty: r.qty.toFixed(3),
        unitPrice: r.unitPrice.toFixed(2),
        taxRate: r.taxRate.toFixed(2),
        lineTotal: r.lineTotal.toFixed(2),

        revenueExTax: revenueExTax.toFixed(2),
        costTotal: costTotal.toFixed(2),
        profit: profit.toFixed(2),

        sale: {
          ...r.sale,
          total: r.sale.total.toFixed(2),
        },
      };
    });

    return res.json({
      costBasis: costBasis.toFixed(2),
      costBasisMeta: {
        mode: cb.mode,
        basisDate: cb.basisDate ? cb.basisDate.toISOString() : null,
      },
      rows: out,
    });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ error: "Failed to load product sales history" });
  }
});

export default router;
