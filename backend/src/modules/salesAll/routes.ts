import { Router } from "express";
import { prisma } from "../../db";
const router = Router();

/**
 * GET /api/sales-all?page=1&limit=30
 * Newest sales first. limit: 1–100 (default 30).
 */
router.get("/", async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
        const skip = (page - 1) * limit;

        const [rows, totalCount] = await Promise.all([
            prisma.sale.findMany({
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
                select: {
                    id: true,
                    invoiceCode: true,
                    createdAt: true,
                    subtotal: true,
                    discountValue: true,
                    taxTotal: true,
                    total: true,
                    voidedAt: true,
                    voidedBy: { select: { email: true } },
                    _count: { select: { items: true } },
                },
            }),
            prisma.sale.count(),
        ]);

        const shaped = rows.map((r) => ({
            id: r.id,
            invoiceCode: r.invoiceCode,
            createdAt: r.createdAt as unknown as string,
            subtotal: r.subtotal as unknown as string,
            discountValue: r.discountValue as unknown as string,
            taxTotal: r.taxTotal as unknown as string,
            total: r.total as unknown as string,
            itemCount: r._count.items,
            voidedAt: r.voidedAt ? (r.voidedAt as unknown as string) : null,
            voidedByEmail: r.voidedBy?.email ?? null,
        }));

        res.json({ page, limit, totalCount, rows: shaped });
    } catch (e: unknown) {
        console.error("GET /api/sales-all error:", e);
        res.status(500).json({ error: "Failed to load sales" });
    }
});

export default router;
