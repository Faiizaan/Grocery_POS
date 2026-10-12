import { useEffect, useState } from "react";
import { StatusLine } from "../components/StatusLine";
import { PaginationBar } from "../components/PaginationBar";
import { apiFetch } from "../lib/api";
import { LOW_STOCK_THRESHOLD, parseStock } from "../lib/stock";

type Product = {
    id: number;
    name: string;
    sku: string;
    barcode?: string;
    price: string;
    salePrice?: string;
    taxRate: string;
    stock: string; // string per your API
};

type Reason =
    | "OPENING"
    | "COUNT"
    | "PURCHASE"
    | "RETURN"
    | "WASTE"
    | "DAMAGE"
    | "MANUAL"
    | "CORRECTION";

export default function Inventory() {
    const [q, setQ] = useState("");
    const [searchQ, setSearchQ] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(30);
    const [totalCount, setTotalCount] = useState(0);
    const [rows, setRows] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);

    // modal state
    const [target, setTarget] = useState<Product | null>(null);
    const [mode, setMode] = useState<"delta" | "set">("delta");
    const [qty, setQty] = useState<string>(""); // user input
    const [reason, setReason] = useState<Reason>("MANUAL");
    const [note, setNote] = useState<string>("");
    const [reasons, setReasons] = useState<Reason[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = async (pageNum = page, qStr = searchQ) => {
        setLoading(true);
        const params = new URLSearchParams({
            page: String(pageNum),
            limit: String(pageSize),
        });
        if (qStr.trim()) params.set("q", qStr.trim());
        const res = await apiFetch(`/api/products?${params}`);
        const data = await res.json();
        setRows(Array.isArray(data) ? data : (data.rows ?? []));
        setTotalCount(Array.isArray(data) ? data.length : (data.totalCount ?? 0));
        setLoading(false);
    };

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    useEffect(() => {
        void load(page, searchQ);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, pageSize, searchQ]);

    const loadReasons = async () => {
        const r = await apiFetch("/api/inventory/reasons");
        const data = await r.json();
        setReasons(data);
    };

    useEffect(() => {
        loadReasons();
    }, []);

    const openAdjust = (p: Product) => {
        setTarget(p);
        setMode("delta");
        setQty("");
        setReason("MANUAL");
        setNote("");
        setError(null);
    };

    const closeAdjust = () => {
        setTarget(null);
        setQty("");
        setNote("");
        setSaving(false);
        setError(null);
    };

    const toNumber = (s: string) => {
        const n = Number(s);
        return Number.isFinite(n) ? n : NaN;
    };

    const submit = async () => {
        if (!target) return;
        const qtyNum = toNumber(qty);
        if (!Number.isFinite(qtyNum)) {
            setError("Quantity must be a number.");
            return;
        }
        if (mode === "set" && qtyNum < 0) {
            setError("Target stock cannot be negative.");
            return;
        }

        setSaving(true);
        setError(null);

        const body = {
            productId: target.id,
            mode,
            qty: mode === "delta" ? qtyNum : qtyNum, // same var; semantics differ server-side
            reason,
            note: note.trim() || undefined,
            // allowNegative: false (default)
        };

        // optimistic update
        const prev = rows;
        const current = Number(target.stock || 0);
        const newStock = mode === "set" ? qtyNum : current + qtyNum;
        if (Number.isFinite(newStock) && newStock >= 0) {
            const optimistic = prev.map((p) =>
                p.id === target.id ? { ...p, stock: String(newStock) } : p
            );
            setRows(optimistic);
        }

        const res = await apiFetch("/api/inventory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            setRows(prev); // rollback
            const msg =
                (await res.json().catch(() => ({})))?.error ||
                "Failed to adjust inventory.";
            setError(msg);
            setSaving(false);
            return;
        }

        // reload canonical
        await load();
        closeAdjust();
    };

    return (
        <div>
            <h2>Inventory</h2>
            <p style={{ color: "#666", marginTop: -6 }}>
                Search products and adjust stock (add/subtract or set exact).
            </p>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    setSearchQ(q);
                    setPage(1);
                }}
                style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}
            >
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search name/sku/barcode"
                    style={{ flex: 1, padding: 8 }}
                />
                <button type="submit" disabled={loading}>{loading ? "Loading…" : "Search"}</button>
            </form>

            <table border={1} cellPadding={6} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "#f5f5f5" }}>
                    <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>SKU</th>
                        <th>Barcode</th>
                        <th style={{ textAlign: "right" }}>Current Stock</th>
                        <th style={{ textAlign: "right" }}>Sale Price</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((p) => {
                        const stockNum = parseStock(p.stock);
                        const outOfStock = stockNum <= 0;
                        const lowStock =
                            stockNum > 0 && stockNum <= LOW_STOCK_THRESHOLD;
                        return (
                        <tr
                            key={p.id}
                            className={
                                outOfStock
                                    ? "stock-row-out"
                                    : lowStock
                                      ? "stock-row-low"
                                      : undefined
                            }
                        >
                            <td>{p.id}</td>
                            <td>{p.name}</td>
                            <td>{p.sku}</td>
                            <td>{p.barcode || "-"}</td>
                            <td style={{ textAlign: "right" }}>
                                {(+p.stock).toFixed(3)}
                                {outOfStock && (
                                    <span className="stock-badge stock-badge-out"> Out</span>
                                )}
                                {lowStock && !outOfStock && (
                                    <span className="stock-badge stock-badge-low"> Low</span>
                                )}
                            </td>
                            <td style={{ textAlign: "right" }}>
                                {p.salePrice !== undefined && p.salePrice !== null && p.salePrice !== ""
                                    ? (+p.salePrice).toFixed(2)
                                    : "-"}
                            </td>
                            <td>
                                <button onClick={() => openAdjust(p)}>Adjust</button>
                            </td>
                        </tr>
                    );
                    })}
                    {rows.length === 0 && !loading && (
                        <tr>
                            <td colSpan={7} style={{ textAlign: "center", color: "#777" }}>No products</td>
                        </tr>
                    )}
                </tbody>
            </table>

            <PaginationBar
                page={page}
                pageSize={pageSize}
                totalCount={totalCount}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                }}
                disabled={loading}
            />

            {/* Adjust modal */}
            {target && (
                <div
                    role="dialog"
                    aria-modal="true"
                    onClick={closeAdjust}
                    style={{
                        position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
                        display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1000
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{ background: "#fff", borderRadius: 8, padding: 16, width: 520, maxWidth: "100%" }}
                    >
                        <h3 style={{ marginTop: 0 }}>
                            Adjust “{target.name}” (Current: {(+target.stock).toFixed(3)})
                        </h3>

                        <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                            <label>
                                <input
                                    type="radio"
                                    name="mode"
                                    value="delta"
                                    checked={mode === "delta"}
                                    onChange={() => setMode("delta")}
                                />{" "}
                                Change by ±
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    name="mode"
                                    value="set"
                                    checked={mode === "set"}
                                    onChange={() => setMode("set")}
                                />{" "}
                                Set to exact
                            </label>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <label style={{ display: "block" }}>
                                <div style={{ fontSize: 12, color: "#555" }}>
                                    {mode === "delta" ? "Change amount (e.g., -2 or 5)" : "Target stock"}
                                </div>
                                <input
                                    value={qty}
                                    onChange={(e) => setQty(e.target.value)}
                                    inputMode="decimal"
                                    placeholder={mode === "delta" ? "e.g. -1.5 or 2" : "e.g. 10"}
                                    style={{ width: "100%", padding: 8 }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") submit();
                                        if (e.key === "Escape") closeAdjust();
                                    }}
                                />
                            </label>

                            <label style={{ display: "block" }}>
                                <div style={{ fontSize: 12, color: "#555" }}>Reason</div>
                                <select
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value as Reason)}
                                    style={{ width: "100%", padding: 8 }}
                                >
                                    {reasons.map((r) => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <label style={{ display: "block", marginTop: 10 }}>
                            <div style={{ fontSize: 12, color: "#555" }}>Note (optional)</div>
                            <input
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                style={{ width: "100%", padding: 8 }}
                                placeholder="e.g., 'Damaged pack during handling'"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") submit();
                                    if (e.key === "Escape") closeAdjust();
                                }}
                            />
                        </label>

                        {error && <StatusLine variant="error">{error}</StatusLine>}

                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                            <button onClick={closeAdjust} disabled={saving}>Cancel</button>
                            <button onClick={submit} disabled={saving}>
                                {saving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
