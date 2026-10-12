import { Router } from "express";
import { prisma } from "../../db";
import { z } from "zod";
import { notVoided } from "../../lib/saleFilters";

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
      product: { include: { categoryRef: { select: { id: true, name: true } } } },
    },
  });

    const map = new Map<
        string,
        { categoryId: number | null; category: string; qty: number; revenue: number; tax: number }
    >();
    for (const it of items) {
        const categoryId = it.product.categoryRef?.id ?? null;
        const cat = it.product.categoryRef?.name ?? "Uncategorized";
        const key = categoryId != null ? `id:${categoryId}` : `name:${cat}`;
        const entry = map.get(key) ?? {
            categoryId,
            category: cat,
            qty: 0,
            revenue: 0,
            tax: 0,
        };
        const qty = Number(it.qty);
        const net = Number(it.unitPrice) * qty - Number(it.lineDiscount ?? 0);
        const lineTax = net * (Number(it.taxRate) / 100);
        entry.qty += qty;
        entry.revenue += Number(it.lineTotal);
        entry.tax += lineTax;
        map.set(key, entry);
    }

    const rows = [...map.values()]
        .map((v) => ({
            categoryId: v.categoryId,
            category: v.category,
            qty: +v.qty.toFixed(3),
            revenue: +v.revenue.toFixed(2),
            tax: +v.tax.toFixed(2),
        }))
        .sort((a, b) => b.revenue - a.revenue);

  res.json({ from, to, rows });
});

export default reports;
