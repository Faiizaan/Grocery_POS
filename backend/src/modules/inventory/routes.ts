import { Router } from "express";
import { prisma } from "../../db";
import { z } from "zod";

export const inventory = Router();

/**
 * Reasons (string union keeps compatibility with your existing "OPENING")
 * Feel free to tailor these. They’re just labels saved in DB.
 */
const REASONS = [
    "OPENING",
    "COUNT",       // periodic count adjustment
    "PURCHASE",    // inbound not via PO flow
    "RETURN",      // stock returned to shelf
    "WASTE",       // expired/unsellable
    "DAMAGE",      // damaged
    "MANUAL",      // generic manual
    "CORRECTION",  // fixing a mistake
] as const;

type Reason = typeof REASONS[number];

/**
 * POST /api/inventory
 * Adjust inventory for a product.
 *
 * Body:
 *  {
 *    productId: number,
 *    mode: 'delta' | 'set',
 *    qty: number,           // >= 0 (for 'set' it's the target stock; for 'delta' it's the change and may be negative if allowNegativeDelta)
 *    reason: Reason,
 *    note?: string,
 *    allowNegative?: boolean // default false - prevents ending stock < 0
 *  }
 */
const AdjustSchema = z.object({
    productId: z.number().int().positive(),
    mode: z.enum(["delta", "set"]),
    qty: z.number(),
    reason: z.enum(REASONS as unknown as [Reason, ...Reason[]]),
    note: z
        .string()
        .optional()
        .or(z.literal(""))
        .transform((v) => (v && v.trim() ? v.trim() : undefined)),
    allowNegative: z.boolean().optional().default(false),
});

inventory.post("/", async (req, res) => {
    const parsed = AdjustSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.format());
    const { productId, mode, qty, reason, note, allowNegative } = parsed.data;

    try {
        const result = await prisma.$transaction(async (tx) => {
            const product = await tx.product.findUnique({ where: { id: productId } });
            if (!product) return res.status(404).json({ error: "Product not found" });

            const current = Number(product.stock ?? 0);

            // Compute delta to apply
            let delta: number;
            if (mode === "set") {
                if (qty < 0) return res.status(400).json({ error: "Target stock cannot be negative" });
                delta = qty - current;
            } else {
                // mode === 'delta'
                delta = qty; // may be negative for reductions
            }

            const newStock = current + delta;
            if (!allowNegative && newStock < 0) {
                return res
                    .status(400)
                    .json({ error: `Insufficient stock. Current: ${current}, change: ${delta} → would go negative.` });
            }

            // Update stock and create txn
            const updatedProduct = await tx.product.update({
                where: { id: productId },
                data: { stock: newStock },
            });

            const txn = await tx.inventoryTxn.create({
                data: {
                    productId,
                    qtyChange: delta,
                    reason,
                },
            });

            return { updatedProduct, txn };
        });

        // If a response was already sent inside the transaction (for errors), stop.
        // Otherwise return success payload.
        if ((result as any)?.status) return; // defensive; ts-ignore

        return res.json(result);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to adjust inventory" });
    }
});

/**
 * GET /api/inventory
 * List inventory transactions.
 * Query:
 *  - q: search by product name/sku/barcode
 *  - reason: filter by reason
 *  - productId: numeric filter
 *  - page, limit: offset pagination (default page 1, limit 30)
 *
 * Returns { page, limit, totalCount, rows }
 */
inventory.get("/", async (req, res) => {
    const q = (req.query.q as string) || "";
    const reason = (req.query.reason as Reason) || undefined;
    const productId = req.query.productId ? Number(req.query.productId) : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const skip = (page - 1) * limit;

    const where: any = {
        ...(reason ? { reason } : {}),
        ...(productId ? { productId } : {}),
        ...(q
            ? {
                product: {
                    OR: [
                        { name: { contains: q, mode: "insensitive" } },
                        { sku: q },
                        { barcode: q },
                    ],
                },
            }
            : {}),
    };

    const [rows, totalCount] = await Promise.all([
        prisma.inventoryTxn.findMany({
            where,
            include: {
                product: { select: { id: true, name: true, sku: true, barcode: true } },
            },
            orderBy: { id: "desc" },
            skip,
            take: limit,
        }),
        prisma.inventoryTxn.count({ where }),
    ]);

    res.json({ page, limit, totalCount, rows });
});

/**
 * GET /api/inventory/reasons
 * Returns the list of standard reasons (UI convenience)
 */
inventory.get("/reasons", (_req, res) => {
    res.json(REASONS);
});

export default inventory;
