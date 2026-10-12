import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePurchasesListQuery } from "../hooks/queries";

const PAGE_SIZE_OPTIONS = [20, 30] as const;

export default function PurchasesList() {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(30);
    const { data, isLoading, refetch, isFetching } = usePurchasesListQuery(page, pageSize);
    const loading = isLoading || isFetching;
    const rows = data?.rows ?? [];
    const totalCount = data?.totalCount ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
    const rangeEnd = Math.min(page * pageSize, totalCount);

    return (
        <div>
            <h2>Purchases</h2>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                <button type="button" onClick={() => void refetch()} disabled={loading}>
                    {loading ? "Loading…" : "Refresh"}
                </button>
                <label>
                    Per page{" "}
                    <select
                        value={pageSize}
                        onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setPage(1);
                        }}
                    >
                        {PAGE_SIZE_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </label>
                <span style={{ fontSize: 14, color: "#666" }}>
                    {totalCount === 0
                        ? ""
                        : `Showing ${rangeStart}–${rangeEnd} of ${totalCount}`}
                </span>
            </div>

            {rows.map((p) => (
                <Link
                    key={p.id}
                    to={`/purchases/${p.id}`}
                    style={{
                        display: "block",
                        border: "1px solid #ddd",
                        padding: 12,
                        marginTop: 12,
                        textDecoration: "none",
                        color: "inherit",
                    }}
                >
                    <div>
                        <b>Purchase #{p.id}</b> — {new Date(p.createdAt).toLocaleString()}
                    </div>
                    <div>Supplier: {p.supplier?.name || "-"}</div>
                    <div style={{ marginTop: 4 }}>
                        {p.subtotal !== undefined && (
                            <span style={{ marginRight: 12 }}>
                                Subtotal: Rs {(+p.subtotal).toFixed(2)}
                            </span>
                        )}
                        {p.discountValue !== undefined && (+p.discountValue > 0) && (
                            <span style={{ marginRight: 12 }}>
                                Line discounts: -Rs {(+p.discountValue).toFixed(2)}
                            </span>
                        )}
                        {p.taxTotal !== undefined && (+p.taxTotal > 0) && (
                            <span style={{ marginRight: 12 }}>
                                Tax: Rs {(+p.taxTotal).toFixed(2)}
                            </span>
                        )}
                        <b>Total: Rs {(+p.total).toFixed(2)}</b>
                    </div>
                </Link>
            ))}

            {rows.length === 0 && !loading && (
                <div style={{ marginTop: 12 }}>No purchases yet.</div>
            )}

            {totalPages > 1 && (
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button
                        type="button"
                        disabled={page <= 1 || loading}
                        onClick={() => setPage((p) => p - 1)}
                    >
                        Previous
                    </button>
                    <span style={{ alignSelf: "center" }}>
                        Page {page} of {totalPages}
                    </span>
                    <button
                        type="button"
                        disabled={page >= totalPages || loading}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
