import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { StatusLine } from "../components/StatusLine";
import { apiFetch } from "../lib/api";

type Summary = {
  product: {
    id: number;
    name: string;
    sku: string;
    barcode?: string | null;
    price: string;
    salePrice: string;
    stock: string;
    taxRate?: string;
    isWeighted?: boolean;
    createdAt?: string;
  };
  totals: {
    qtySold: string;

    // ✅ updated fields from backend
    revenueExTax: string;
    revenueInclTax: string;

    cost: string;
    profit: string;
    profitMargin: string; // %
  };
  filter?: { from: string | null; to: string | null };
};

type SaleLine = {
  id: number;
  qty: string;
  unitPrice: string;
  taxRate: string;
  lineTotal: string; // (still returned, but profit ignores tax)
  revenueExTax: string; // ✅
  costTotal: string; // ✅
  profit: string; // ✅
  sale: {
    id: number;
    createdAt: string;
    invoiceCode?: string | null;
    total: string;
  };
};

export default function ProductDetails() {
  const { id } = useParams();
  const productId = Number(id);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [sales, setSales] = useState<SaleLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filters
  const [preset, setPreset] = useState<"all" | "7" | "30" | "custom">("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // triggers refetch when user clicks Apply/Clear
  const [applyKey, setApplyKey] = useState(0);

  const buildQuery = useMemo(() => {
    const params = new URLSearchParams();

    if (preset === "7") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      params.set("from", d.toISOString().slice(0, 10));
    } else if (preset === "30") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      params.set("from", d.toISOString().slice(0, 10));
    } else if (preset === "custom") {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }

    const q = params.toString();
    return q ? `?${q}` : "";
  }, [preset, from, to]);

  useEffect(() => {
    if (!Number.isFinite(productId)) {
      setErr("Invalid product id");
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const summaryUrl = `/api/product-analytics/${productId}/summary${buildQuery}`;
        const salesUrlBase = `/api/product-analytics/${productId}/sales?limit=200`;
        const salesUrl = buildQuery
          ? `${salesUrlBase}&${buildQuery.slice(1)}`
          : salesUrlBase;

        const [sRes, lRes] = await Promise.all([
          apiFetch(summaryUrl),
          apiFetch(salesUrl),
        ]);

        const sJson = await sRes.json().catch(() => ({}));
        const lJson = await lRes.json().catch(() => []);

        if (!sRes.ok) throw new Error(sJson?.error || "Failed to load summary");
        if (!lRes.ok)
          throw new Error((lJson as any)?.error || "Failed to load sales");

        setSummary(sJson as Summary);
        // setSales(Array.isArray(lJson) ? (lJson as SaleLine[]) : []);
        const rows = Array.isArray((lJson as any)?.rows)
          ? (lJson as any).rows
          : [];
        setSales(rows as SaleLine[]);
      } catch (e: any) {
        setErr(e?.message || "Failed to load product details");
      } finally {
        setLoading(false);
      }
    })();
  }, [productId, buildQuery, applyKey]);

  const apply = () => setApplyKey((k) => k + 1);

  const clear = () => {
    setPreset("all");
    setFrom("");
    setTo("");
    setApplyKey((k) => k + 1);
  };

  if (loading) return <div className="page">Loading…</div>;
  if (err)
    return (
      <div className="page">
        <StatusLine variant="error">{err}</StatusLine>
      </div>
    );
  if (!summary) return <div className="page">No data</div>;

  return (
    <div className="page">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>{summary.product.name}</h2>
          <div style={{ opacity: 0.8, fontSize: 13 }}>
            SKU: {summary.product.sku}
            {summary.product.barcode
              ? ` • Barcode: ${summary.product.barcode}`
              : ""}
          </div>
        </div>
        <Link to="/products" className="btn btn-outline">
          ← Back
        </Link>
      </div>

      {/* Summary Card */}
      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <div className="grid-3">
          <div>
            <div style={{ opacity: 0.7 }}>Purchase price</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {summary.product.price}
            </div>
          </div>
          <div>
            <div style={{ opacity: 0.7 }}>Sale price</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {summary.product.salePrice}
            </div>
          </div>
          <div>
            <div style={{ opacity: 0.7 }}>Stock</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {summary.product.stock}
            </div>
          </div>
        </div>

        <hr style={{ margin: "16px 0", opacity: 0.2 }} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <div style={{ opacity: 0.7 }}>Qty sold</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {summary.totals.qtySold}
            </div>
          </div>

          <div>
            <div style={{ opacity: 0.7 }}>Revenue (ex tax)</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {summary.totals.revenueExTax}
            </div>
          </div>

          <div>
            <div style={{ opacity: 0.7 }}>Revenue (incl tax)</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {summary.totals.revenueInclTax}
            </div>
          </div>

          <div>
            <div style={{ opacity: 0.7 }}>Profit</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {summary.totals.profit}
            </div>
            <div style={{ opacity: 0.65, fontSize: 12 }}>
              Margin: {summary.totals.profitMargin}%
            </div>
          </div>

          <div>
            <div style={{ opacity: 0.7 }}>Cost</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {summary.totals.cost}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 12, marginTop: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setPreset("all")}
          >
            All
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setPreset("7")}
          >
            Last 7
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setPreset("30")}
          >
            Last 30
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setPreset("custom")}
          >
            Custom
          </button>

          {preset === "custom" && (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label style={{ opacity: 0.7, fontSize: 13 }}>From</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label style={{ opacity: 0.7, fontSize: 13 }}>To</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </>
          )}

          <button type="button" className="btn btn-success" onClick={apply}>
            Apply
          </button>
          <button type="button" className="btn btn-secondary" onClick={clear}>
            Clear
          </button>

          <div style={{ marginLeft: "auto", opacity: 0.7, fontSize: 12 }}>
            {summary.filter?.from || summary.filter?.to
              ? `Filter: ${summary.filter?.from ?? "…"} → ${
                  summary.filter?.to ?? "…"
                }`
              : "Full history"}
          </div>
        </div>
      </div>

      <h3 style={{ marginTop: 20 }}>Sales history</h3>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ padding: 12, textAlign: "left" }}>Sale #</th>
              <th style={{ padding: 12, textAlign: "left" }}>Invoice</th>
              <th style={{ padding: 12, textAlign: "left" }}>Date</th>
              <th style={{ padding: 12, textAlign: "right" }}>Qty</th>
              <th style={{ padding: 12, textAlign: "right" }}>Unit</th>
              <th style={{ padding: 12, textAlign: "right" }}>
                Revenue (ex tax)
              </th>
              <th style={{ padding: 12, textAlign: "right" }}>Cost</th>
              <th style={{ padding: 12, textAlign: "right" }}>Profit</th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 12, opacity: 0.7 }}>
                  No sales found for this product.
                </td>
              </tr>
            ) : (
              sales.map((r) => {
                // ✅ Prefer backend-calculated profit (ex tax)
                const rowProfit = r.profit ?? "-";

                // ✅ revenue ex tax (backend provides it)
                const rowRevenue = r.revenueExTax ?? "-";

                // ✅ costTotal from backend already normalized
                const rowCost = r.costTotal ?? "-";

                return (
                  <tr key={r.id}>
                    <td style={{ padding: 12 }}>{r.sale.id}</td>
                    <td style={{ padding: 12 }}>{r.sale.invoiceCode ?? "-"}</td>
                    <td style={{ padding: 12 }}>
                      {new Date(r.sale.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: 12, textAlign: "right" }}>{r.qty}</td>
                    <td style={{ padding: 12, textAlign: "right" }}>
                      {r.unitPrice}
                    </td>
                    <td style={{ padding: 12, textAlign: "right" }}>
                      {rowRevenue}
                    </td>
                    <td style={{ padding: 12, textAlign: "right" }}>
                      {rowCost}
                    </td>
                    <td style={{ padding: 12, textAlign: "right" }}>
                      {rowProfit}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
