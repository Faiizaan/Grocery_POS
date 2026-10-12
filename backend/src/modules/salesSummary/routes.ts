import { Router } from "express";
import { prisma } from "../../db";
import { notVoided } from "../../lib/saleFilters";

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
 * - inclusive range (UTC day boundaries)
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

        // Production imports often have zeroed saleItem cost snapshots (unitCostAtSale/costTotal).
        // Compute totalCost using the best available basis:
        // 1) saleItem.costTotal if present (>0)
        // 2) saleItem.unitCostAtSale * qty if present (>0)
        // 3) latest purchaseItem.unitCost per product (any time)
        // 4) product.price * qty

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
                product: { select: { price: true } },
            },
        });

        const productIds = [...new Set(saleItems.map((r) => r.productId))];

        // Build latest purchase unit cost map for products in range.
        const purchaseCostByProduct = new Map<number, number>();
        if (productIds.length) {
            const purchases = await prisma.purchaseItem.findMany({
                where: { productId: { in: productIds } },
                orderBy: [{ purchase: { createdAt: "desc" } }, { id: "desc" }],
                select: { productId: true, unitCost: true },
            });
            for (const p of purchases) {
                if (!purchaseCostByProduct.has(p.productId)) {
                    purchaseCostByProduct.set(p.productId, Number(p.unitCost || 0));
                }
            }
        }

        let totalCost = 0;
        for (const it of saleItems) {
            const qty = Number(it.qty) || 0;
            if (qty <= 0) continue;

            const snapTotal = Number(it.costTotal) || 0;
            if (snapTotal > 0) {
                totalCost += snapTotal;
                continue;
            }

            const snapUnit = Number(it.unitCostAtSale) || 0;
            if (snapUnit > 0) {
                totalCost += snapUnit * qty;
                continue;
            }

            const purchaseUnit = purchaseCostByProduct.get(it.productId) || 0;
            if (purchaseUnit > 0) {
                totalCost += purchaseUnit * qty;
                continue;
            }

            totalCost += (Number(it.product?.price) || 0) * qty;
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

export default router;
