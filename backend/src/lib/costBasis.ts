import { prisma } from "../db";

/**
 * Cost of goods for sale lines.
 *
 * Each SaleItem stores the purchase cost at the moment it was sold (costTotal / unitCostAtSale).
 * That snapshot is the source of truth: editing a product's purchase price later must NOT
 * change the profit of sales that already happened.
 *
 * Older sales (made before snapshots existed) have 0 there. For those we use the purchase
 * cost that was in effect on the sale date (latest purchase on/before that date), then the
 * earliest known purchase, then the product's current price as a last resort.
 */

type CostPoint = { at: number; unitCost: number };

export type CostLookup = (productId: number, saleDate: Date, fallbackPrice: number) => number;

export async function buildCostLookup(productIds: number[]): Promise<CostLookup> {
  const history = new Map<number, CostPoint[]>();
  if (productIds.length) {
    const rows = await prisma.purchaseItem.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, unitCost: true, purchase: { select: { createdAt: true } } },
    });
    for (const r of rows) {
      const list = history.get(r.productId) ?? [];
      list.push({ at: r.purchase.createdAt.getTime(), unitCost: Number(r.unitCost) || 0 });
      history.set(r.productId, list);
    }
    for (const list of history.values()) list.sort((a, b) => a.at - b.at);
  }

  return (productId, saleDate, fallbackPrice) => {
    const list = history.get(productId);
    if (list && list.length) {
      const t = saleDate.getTime();
      // binary search: last purchase with at <= t
      let lo = 0;
      let hi = list.length - 1;
      let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid].at <= t) {
          found = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      const pick = found >= 0 ? list[found] : list[0];
      if (pick.unitCost > 0) return pick.unitCost;
    }
    return fallbackPrice;
  };
}

/** Cost of one sale line, preferring the snapshot taken at sale time. */
export function lineCost(
  line: { productId: number; qty: unknown; costTotal: unknown; unitCostAtSale: unknown },
  saleDate: Date,
  fallbackPrice: number,
  lookup: CostLookup
): number {
  const qty = Number(line.qty) || 0;
  if (qty <= 0) return 0;
  const snapTotal = Number(line.costTotal) || 0;
  if (snapTotal > 0) return snapTotal;
  const snapUnit = Number(line.unitCostAtSale) || 0;
  if (snapUnit > 0) return snapUnit * qty;
  return lookup(line.productId, saleDate, fallbackPrice) * qty;
}
