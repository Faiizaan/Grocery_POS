import { useEffect, useState } from "react";
import { PaginationBar } from "../components/PaginationBar";
import { apiFetch } from "../lib/api";

type Txn = {
    id: number;
    productId: number;
    qtyChange: number | string;
    reason: string;
    createdAt: string;
    product: {
        id: number;
        name: string;
        sku: string;
        barcode?: string | null;
    };
};

export default function InventoryLog() {
    const [q, setQ] = useState("");
    const [searchQ, setSearchQ] = useState("");
    const [reason, setReason] = useState<string>("");
    const [items, setItems] = useState<Txn[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(30);
    const [totalCount, setTotalCount] = useState(0);

    const load = async () => {
        setLoading(true);
        const params = new URLSearchParams({
            page: String(page),
            limit: String(pageSize),
        });
        if (searchQ.trim()) params.set("q", searchQ.trim());
        if (reason) params.set("reason", reason);

        const res = await apiFetch(`/api/inventory?${params.toString()}`);
        const data = await res.json();
        setItems(data.rows ?? data.items ?? []);
        setTotalCount(data.totalCount ?? 0);
        setLoading(false);
    };

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, pageSize, searchQ, reason]);

    return (
        <div>
            <h2>Inventory Log</h2>
            <p style={{ color: "#666", marginTop: -6 }}>
                All stock changes with reasons and timestamps.
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
                    placeholder="Search product name/sku/barcode"
                    style={{ flex: "1 1 300px", padding: 8 }}
                />
                <select
                    value={reason}
                    onChange={(e) => {
                        setReason(e.target.value);
                        setPage(1);
                    }}
                    style={{ padding: 8 }}
                >
                    <option value="">All reasons</option>
                    <option value="OPENING">OPENING</option>
                    <option value="COUNT">COUNT</option>
                    <option value="PURCHASE">PURCHASE</option>
                    <option value="RETURN">RETURN</option>
                    <option value="WASTE">WASTE</option>
                    <option value="DAMAGE">DAMAGE</option>
                    <option value="MANUAL">MANUAL</option>
                    <option value="CORRECTION">CORRECTION</option>
                </select>
                <button type="submit" disabled={loading}>
                    {loading ? "Loading…" : "Search"}
                </button>
            </form>

            <table border={1} cellPadding={6} style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "#f5f5f5" }}>
                    <tr>
                        <th>ID</th>
                        <th>Date/Time</th>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Barcode</th>
                        <th style={{ textAlign: "right" }}>Qty Change</th>
                        <th>Reason</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((t) => {
                        const qty = Number(t.qtyChange);
                        return (
                        <tr key={t.id}>
                            <td>{t.id}</td>
                            <td>{new Date(t.createdAt).toLocaleString()}</td>
                            <td>{t.product?.name ?? "-"}</td>
                            <td>{t.product?.sku ?? "-"}</td>
                            <td>{t.product?.barcode || "-"}</td>
                            <td style={{ textAlign: "right", color: qty < 0 ? "crimson" : "inherit" }}>
                                {qty > 0 ? `+${qty}` : qty}
                            </td>
                            <td>{t.reason}</td>
                        </tr>
                    );
                    })}
                    {items.length === 0 && !loading && (
                        <tr>
                            <td colSpan={7} style={{ textAlign: "center", color: "#777" }}>
                                No transactions
                            </td>
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
        </div>
    );
}
