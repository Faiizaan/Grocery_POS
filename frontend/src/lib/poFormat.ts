/** Display helpers for purchase order lines. */
type PoLine = {
  suggestedQty: string | number;
  product: { price?: string | number; piecesPerBox?: number | null; isWeighted?: boolean };
};

/** "12 pcs" or "2 boxes (12 pcs)" or "1.250" for weighted items. */
export function formatPoQty(it: PoLine): string {
  const qty = Number(it.suggestedQty) || 0;
  if (it.product.isWeighted) return qty.toFixed(3);
  const ppb = it.product.piecesPerBox ?? 0;
  const pcs = Number.isInteger(qty) ? String(qty) : qty.toFixed(3);
  if (ppb >= 2 && qty % ppb === 0) {
    const boxes = qty / ppb;
    return `${boxes} box${boxes === 1 ? "" : "es"} (${pcs} pcs)`;
  }
  return `${pcs} pcs`;
}

/** Estimated cost at the product's current purchase price. */
export function poLineCost(it: PoLine): number {
  return (Number(it.suggestedQty) || 0) * (Number(it.product.price) || 0);
}

export const rs = (n: number) =>
  `Rs ${n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
