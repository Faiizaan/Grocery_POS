import { Router } from "express";
import { prisma } from "../../db";
import { notVoided } from "../../lib/saleFilters";
import { buildCostLookup, lineCost } from "../../lib/costBasis";

const router = Router();

/** Helpers */
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const toYmd = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
};
const todayYmd = () => toYmd(new Date());
// Keep day boundaries consistent with other report endpoints (local day).
const startOfDayLocal = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
};
const endOfDayLocal = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999);
};

/**
 * GET /api/sales-summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * - inclusive range (Pakistan-time day boundaries)
 * Response:
 * {
 *   from, to,
 *   invoices: number,
 *   totalSales: number,
 *   totalCost: number,
 *   profit: number,
 *   profitMargin: number // %
 * }
 */
router.get("/", async (req, res) => {
    try {
        let from = (req.query.from as string) || todayYmd();
        let to = (req.query.to as string) || todayYmd();

        if (!YMD.test(from)) return res.status(400).json({ error: "Invalid 'from' (use YYYY-MM-DD)" });
        if (!YMD.test(to)) return res.status(400).json({ error: "Invalid 'to' (use YYYY-MM-DD)" });

        let fromDt = startOfDayLocal(from);
        let toDt = endOfDayLocal(to);
        if (fromDt > toDt) {
            // swap if reversed
            [from, to] = [to, from];
            [fromDt, toDt] = [toDt, fromDt];
        }


        const sales = await prisma.sale.findMany({
            where: { ...notVoided, createdAt: { gte: fromDt, lte: toDt } },
            select: { id: true, total: true, subtotal: true, taxTotal: true },
            orderBy: { createdAt: "desc" },
        });

        const invoices = sales.length;
        const grossSales = sales.reduce((s, x) => s + Number(x.total || 0), 0);
        const netSalesExTax = sales.reduce((s, x) => s + Number(x.subtotal || 0), 0);
        const totalSales = +grossSales.toFixed(2);
        const netSales = +netSalesExTax.toFixed(2);

        const saleItems = await prisma.saleItem.findMany({
            where: {
                sale: { ...notVoided, createdAt: { gte: fromDt, lte: toDt } },
            },
            select: {
                productId: true,
                qty: true,
                unitCostAtSale: true,
                costTotal: true,
                sale: { select: { createdAt: true } },
                product: { select: { price: true } },
            },
        });

        // Cost = snapshot taken at sale time; older lines fall back to the purchase cost
        // in effect on the sale date (not today's price). See lib/costBasis.
        const lookup = await buildCostLookup([...new Set(saleItems.map((r) => r.productId))]);
        let totalCost = 0;
        for (const it of saleItems) {
            totalCost += lineCost(it, it.sale.createdAt, Number(it.product?.price) || 0, lookup);
        }
        totalCost = +totalCost.toFixed(2);

        const profit = +(netSales - totalCost).toFixed(2);
        const profitMargin = netSales > 0 ? +((profit / netSales) * 100).toFixed(2) : 0;

        return res.json({ from, to, invoices, totalSales, totalCost, profit, profitMargin });
    } catch (e: any) {
        console.error("GET /api/sales-summary error:", e);
        return res.status(500).json({ error: "Failed to compute summary" });
    }
});

/**
 * GET /api/sales-summary/charts?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Data for the Sales Summary graphs (Pakistan-time days, voided sales excluded).
 *  - series: sales (ex tax, after discount), cost, profit per day — or per month for
 *    ranges longer than 92 days. Missing days are filled with zeros.
 *  - topProducts: 10 best products by profit in the range.
 *  - hourly: sales per hour of day (0-23) across the range.
 * Profit uses the same cost rules as the summary (cost captured at sale time).
 */
router.get("/charts", async (req, res) => {
    try {
        let from = (req.query.from as string) || todayYmd();
        let to = (req.query.to as string) || todayYmd();
        if (!YMD.test(from) || !YMD.test(to)) {
            return res.status(400).json({ error: "Use YYYY-MM-DD for from and to" });
        }
        let fromDt = startOfDayLocal(from);
        let toDt = endOfDayLocal(to);
        if (fromDt > toDt) {
            [from, to] = [to, from];
            [fromDt, toDt] = [toDt, fromDt];
        }

        const days = Math.round((startOfDayLocal(to).getTime() - fromDt.getTime()) / 86_400_000) + 1;
        const granularity: "day" | "month" = days > 92 ? "month" : "day";
        const bucketOf = (d: Date) => (granularity === "day" ? toYmd(d) : toYmd(d).slice(0, 7));

        // Pre-fill every bucket so gaps show as zero instead of disappearing.
        type Bucket = { key: string; invoices: number; sales: number; cost: number; profit: number };
        const buckets = new Map<string, Bucket>();
        for (let d = new Date(fromDt); d <= toDt; d.setDate(d.getDate() + 1)) {
            const k = bucketOf(d);
            if (!buckets.has(k)) buckets.set(k, { key: k, invoices: 0, sales: 0, cost: 0, profit: 0 });
        }

        const sales = await prisma.sale.findMany({
            where: { ...notVoided, createdAt: { gte: fromDt, lte: toDt } },
            select: {
                createdAt: true,
                subtotal: true,
                items: {
                    select: {
                        productId: true,
                        productName: true,
                        qty: true,
                        unitPrice: true,
                        lineDiscount: true,
                        unitCostAtSale: true,
                        costTotal: true,
                        product: { select: { name: true, price: true } },
                    },
                },
            },
        });

        const lookup = await buildCostLookup([
            ...new Set(sales.flatMap((s) => s.items.map((i) => i.productId))),
        ]);

        const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, invoices: 0, sales: 0 }));
        const products = new Map<number, { productId: number; name: string; qty: number; sales: number; profit: number }>();

        for (const s of sales) {
            const b = buckets.get(bucketOf(s.createdAt));
            const net = Number(s.subtotal) || 0;
            let saleCost = 0;
            for (const it of s.items) {
                const cost = lineCost(it, s.createdAt, Number(it.product?.price) || 0, lookup);
                saleCost += cost;
                const revenue = Number(it.unitPrice) * Number(it.qty) - (Number(it.lineDiscount) || 0);
                const p = products.get(it.productId) ?? {
                    productId: it.productId,
                    name: it.product?.name ?? it.productName ?? `#${it.productId}`,
                    qty: 0,
                    sales: 0,
                    profit: 0,
                };
                p.qty += Number(it.qty) || 0;
                p.sales += revenue;
                p.profit += revenue - cost;
                products.set(it.productId, p);
            }
            if (b) {
                b.invoices += 1;
                b.sales += net;
                b.cost += saleCost;
                b.profit += net - saleCost;
            }
            const h = hourly[s.createdAt.getHours()];
            h.invoices += 1;
            h.sales += net;
        }

        const r2 = (n: number) => Math.round(n * 100) / 100;
        const series = [...buckets.values()].map((b) => ({
            key: b.key,
            invoices: b.invoices,
            sales: r2(b.sales),
            cost: r2(b.cost),
            profit: r2(b.profit),
        }));
        const topProducts = [...products.values()]
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 10)
            .map((p) => ({ ...p, qty: +p.qty.toFixed(3), sales: r2(p.sales), profit: r2(p.profit) }));

        return res.json({
            from,
            to,
            granularity,
            series,
            topProducts,
            hourly: hourly.map((h) => ({ ...h, sales: r2(h.sales) })),
        });
    } catch (e: any) {
        console.error("GET /api/sales-summary/charts error:", e);
        return res.status(500).json({ error: "Failed to load chart data" });
    }
});

export default router;
