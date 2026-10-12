import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StatusLine, type PageFeedback } from "../components/StatusLine";
import { PaginationBar } from "../components/PaginationBar";
import { apiFetch } from "../lib/api";
import {
  usePurchaseOrdersListQuery,
  useSupplierOptionsQuery,
} from "../hooks/queries";

type PO = {
  id: number;
  createdAt: string;
  daysLookback: number;
  status: string;
  note?: string | null;
  supplier: { name: string; id: number };
  items: {
    id: number;
    suggestedQty: string;
    currentStock: string;
    recentSales: string;
    product: { name: string; sku: string };
  }[];
};

export default function PurchaseOrder() {
  const { data: suppliers = [] } = useSupplierOptionsQuery();
  const [supplierId, setSupplierId] = useState<number | undefined>(undefined);
  const [days, setDays] = useState(7);
  const [minDaysCover, setMinDaysCover] = useState(7);
  const [poNote, setPoNote] = useState("");
  const [latest, setLatest] = useState<PO | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [feedback, setFeedback] = useState<PageFeedback>(null);
  const [loading, setLoading] = useState(false);

  const { data, isLoading, refetch } = usePurchaseOrdersListQuery(page, pageSize);
  const poList = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const generate = async () => {
    if (!supplierId) {
      setFeedback({ variant: "error", message: "Select a supplier." });
      return;
    }
    setFeedback(null);
    setLoading(true);
    const res = await apiFetch("/api/purchase-orders/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId,
        days,
        minDaysCover,
        note: poNote.trim() || undefined,
      }),
    });
    setLoading(false);
    if (res.ok) {
      const saved = await res.json();
      setLatest(saved);
      setPage(1);
      await refetch();
      setFeedback({
        variant: "success",
        message: `Order saved as PO #${saved.id} (${saved.items.length} items). Open it anytime below.`,
      });
    } else {
      const errData = await res.json().catch(() => ({}));
      const msg =
        typeof errData?.error === "string"
          ? errData.error
          : "Failed to generate purchase order.";
      setFeedback({ variant: "error", message: msg });
    }
  };

  return (
    <div>
      <h2>Purchase Order (auto)</h2>
      <p style={{ color: "#666", marginTop: -6 }}>
        Generate a draft order from recent sales. It is saved automatically so
        you can review it later.
      </p>
      {feedback && (
        <StatusLine variant={feedback.variant}>{feedback.message}</StatusLine>
      )}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <select
          value={supplierId ?? ""}
          onChange={(e) =>
            setSupplierId(e.target.value ? +e.target.value : undefined)
          }
        >
          <option value="">Select supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label>Days to analyze</label>
        <input
          type="number"
          min={1}
          max={90}
          step={1}
          value={days}
          onChange={(e) => setDays(+e.target.value)}
        />
        <label>Target days of stock</label>
        <input
          type="number"
          min={1}
          max={60}
          step={1}
          value={minDaysCover}
          onChange={(e) => setMinDaysCover(+e.target.value)}
        />
        <input
          type="text"
          value={poNote}
          onChange={(e) => setPoNote(e.target.value)}
          placeholder="Note (optional)"
          style={{ minWidth: 160 }}
        />
        <button type="button" onClick={generate} disabled={loading}>
          {loading ? "Saving…" : "Generate & save"}
        </button>
      </div>

      {latest && (
        <div style={{ border: "1px solid #ddd", padding: 12, marginBottom: 16 }}>
          <b>Saved PO #{latest.id}</b> —{" "}
          <Link to={`/purchase-order/${latest.id}`}>View full order</Link>
          {" · "}
          <Link to={`/suppliers/${latest.supplier.id}`}>
            {latest.supplier.name}
          </Link>
          {latest.note && <span> · Note: {latest.note}</span>}
          <table
            border={1}
            cellPadding={6}
            style={{ width: "100%", marginTop: 8 }}
          >
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th style={{ textAlign: "right" }}>Suggested Qty</th>
              </tr>
            </thead>
            <tbody>
              {latest.items.slice(0, 5).map((it) => (
                <tr key={it.id}>
                  <td>{it.product.name}</td>
                  <td>{it.product.sku}</td>
                  <td style={{ textAlign: "right" }}>
                    {(+it.suggestedQty).toFixed(3)}
                  </td>
                </tr>
              ))}
              {latest.items.length > 5 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", color: "#666" }}>
                    +{latest.items.length - 5} more —{" "}
                    <Link to={`/purchase-order/${latest.id}`}>see all</Link>
                  </td>
                </tr>
              )}
              {latest.items.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center" }}>
                    No reorder suggestions for this run.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <h3>Saved purchase orders</h3>
      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        disabled={isLoading}
      />

      {poList.map((po) => (
        <div
          key={po.id}
          style={{ border: "1px solid #eee", padding: 10, marginTop: 8 }}
        >
          <div>
            <Link to={`/purchase-order/${po.id}`}>
              <b>PO #{po.id}</b>
            </Link>
            {" · "}
            <Link to={`/suppliers/${po.supplier.id}`}>{po.supplier.name}</Link>
            {" · "}
            {new Date(po.createdAt).toLocaleString()}
            {" · "}
            <span style={{ color: "#666" }}>{po.status}</span>
          </div>
          <div>
            {po.items.length} item(s)
            {po.note ? ` · Note: ${po.note}` : ""}
          </div>
        </div>
      ))}
      {poList.length === 0 && !isLoading && (
        <div style={{ marginTop: 8, color: "#777" }}>No purchase orders yet.</div>
      )}
    </div>
  );
}
