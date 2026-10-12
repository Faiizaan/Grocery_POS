/** Parse API stock (string or number) to a finite quantity. */
export function parseStock(stock: string | number | null | undefined): number {
  if (stock == null) return 0;
  const n = typeof stock === "number" ? stock : parseFloat(stock);
  return Number.isFinite(n) ? n : 0;
}

export type StockLineStatus = "ok" | "low" | "over" | "out";

/** Default threshold for low-stock highlighting on Products/Inventory. */
export const LOW_STOCK_THRESHOLD = 5;

export function lineStockStatus(
  stock: number,
  qty: number,
  lowThreshold = LOW_STOCK_THRESHOLD
): StockLineStatus {
  if (stock <= 0) return "out";
  if (qty > stock) return "over";
  if (stock <= lowThreshold) return "low";
  return "ok";
}

export function stockBlocksCheckout(status: StockLineStatus): boolean {
  return status === "out" || status === "over";
}
