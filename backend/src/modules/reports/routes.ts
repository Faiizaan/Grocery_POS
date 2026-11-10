import { Router } from "express";
import { prisma } from "../../db";
import { z } from "zod";
import { notVoided } from "../../lib/saleFilters";
import { buildCostLookup, lineCost } from "../../lib/costBasis";

export const reports = Router();

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const startOfDayLocal = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};
const endOfDayLocal = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
};
const todayYmd = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// GET /api/reports/category?from=YYYY-MM-DD&to=YYYY-MM-DD
reports.get("/category", async (req, res) => {
  const schema = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json(parsed.error.format());

  let from = parsed.data.from || todayYmd();
  let to = parsed.data.to || todayYmd();

  if (!YMD.test(from) || !YMD.test(to)) {
    return res.status(400).json({ error: "Use YYYY-MM-DD for from and to" });
  }

  let fromDt = startOfDayLocal(from);
  let toDt = endOfDayLocal(to);
  if (fromDt > toDt) {
    [from, to] = [to, from];
    [fromDt, toDt] = [toDt, fromDt];
  }

  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        ...notVoided,
        createdAt: { gte: fromDt, lte: toDt },
      },
    },
    include: {
      // Category saved on the sale line (category at the time of sale); product's current
      // category is only a fallback for lines that never had one.
      Category: { select: { id: true, name: true } },
      product: { include: { categoryRef: { select: { id: true, name: true } } } },
      sale: { select: { createdAt: true } },
    },
  });

  // same cost rules as Sales Summary (cost captured at sale time)
  const lookup = await buildCostLookup([...new Set(items.map((i) => i.productId))]);

    const map = new Map<
        string,
        { categoryId: number | null; category: string; qty: number; revenue: number; tax: number; net: number; cost: number }
    >();
    for (const it of items) {
        const catRef = it.Category ?? it.product.categoryRef;
        const categoryId = catRef?.id ?? null;
        const cat = catRef?.name ?? "Uncategorized";
        const key = categoryId != null ? `id:${categoryId}` : `name:${cat}`;
        const entry = map.get(key) ?? {
            categoryId,
            category: cat,
            qty: 0,
            revenue: 0,
            tax: 0,
            net: 0,
            cost: 0,
        };
        const qty = Number(it.qty);
        const net = Number(it.unitPrice) * qty - Number(it.lineDiscount ?? 0);
        const lineTax = net * (Number(it.taxRate) / 100);
        entry.qty += qty;
        entry.revenue += Number(it.lineTotal);
        entry.tax += lineTax;
        entry.net += net;
        entry.cost += lineCost(it, it.sale.createdAt, Number(it.product.price) || 0, lookup);
        map.set(key, entry);
    }

    const rows = [...map.values()]
        .map((v) => ({
            categoryId: v.categoryId,
            category: v.category,
            qty: +v.qty.toFixed(3),
            revenue: +v.revenue.toFixed(2),
            tax: +v.tax.toFixed(2),
            cost: +v.cost.toFixed(2),
            profit: +(v.net - v.cost).toFixed(2),
            margin: v.net > 0 ? +(((v.net - v.cost) / v.net) * 100).toFixed(2) : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);

  res.json({ from, to, rows });
});

export default reports;
