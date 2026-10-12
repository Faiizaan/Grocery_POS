import { useEffect, useMemo, useState } from "react";
import { StatusLine, type PageFeedback } from "../components/StatusLine";
import { apiFetch } from "../lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useSupplierOptionsQuery } from "../hooks/queries";
import { getJson } from "../lib/apiJson";

type Product = { id: number; name: string; sku: string; price: string; stock: string; barcode?: string };

type Line = {
    productId: number;
    name: string;
    qty: number;
    unitCost: number;
    lineDiscount: number;
    newSalePrice?: number;
};

export default function PurchaseNew() {
    const queryClient = useQueryClient();
    const { data: suppliers = [] } = useSupplierOptionsQuery();
    const [supplierId, setSupplierId] = useState<number | undefined>(undefined);
    const [supplierPrices, setSupplierPrices] = useState<Map<number, number>>(new Map());
    const [q, setQ] = useState("");
    const [results, setResults] = useState<Product[]>([]);
    const [lines, setLines] = useState<Line[]>([]);
    const [note, setNote] = useState("");
    const [feedback, setFeedback] = useState<PageFeedback>(null);

    const [showAddSupplier, setShowAddSupplier] = useState(false);
    const [newSupplier, setNewSupplier] = useState({ name: "", phone: "" });

    useEffect(() => {
        if (!supplierId) {
            setSupplierPrices(new Map());
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const data = await getJson<{
                    products: { productId: number; supplierUnitCost: string }[];
                }>(`/api/suppliers/${supplierId}`);
                if (cancelled) return;
                const m = new Map<number, number>();
                for (const p of data.products) {
                    m.set(p.productId, +p.supplierUnitCost);
                }
                setSupplierPrices(m);
            } catch {
                if (!cancelled) setSupplierPrices(new Map());
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [supplierId]);

    useEffect(() => {
        const id = setTimeout(async () => {
            if (!q.trim()) { setResults([]); return; }
            const res = await apiFetch(`/api/products?q=${encodeURIComponent(q)}&limit=20`);
            if (res.ok) {
                const data = await res.json();
                setResults(data.rows ?? data);
            }
        }, 250);
        return () => clearTimeout(id);
    }, [q]);

    const add = (p: Product) => {
        if (!supplierId) {
            setFeedback({ variant: "error", message: "Select a supplier first." });
            return;
        }
        const supplierCost = supplierPrices.get(p.id);
        const unitCost = supplierCost ?? +p.price;
        setLines(prev => {
            const i = prev.findIndex(x => x.productId === p.id);
            if (i >= 0) {
                const copy = [...prev];
                copy[i] = { ...copy[i], qty: copy[i].qty + 1 };
                return copy;
            }
            return [
                ...prev,
                {
                    productId: p.id,
                    name: p.name,
                    qty: 1,
                    unitCost,
                    lineDiscount: 0,
                },
            ];
        });
        setQ("");
        setResults([]);
    };

    const subtotalPre = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
    const totalLineDiscount = lines.reduce((s, l) => s + l.lineDiscount, 0);
    const total = subtotalPre - totalLineDiscount;

    const post = async () => {
        if (!supplierId) {
            setFeedback({ variant: "error", message: "Supplier is required." });
            return;
        }
        if (lines.length === 0) {
            setFeedback({ variant: "error", message: "Add items first." });
            return;
        }
        setFeedback(null);
        const payload = {
            supplierId,
            note,
            items: lines.map(l => ({
                productId: l.productId,
                qty: l.qty,
                unitCost: l.unitCost,
                ...(l.lineDiscount > 0 ? { lineDiscount: l.lineDiscount } : {}),
                ...(l.newSalePrice ? { newSalePrice: l.newSalePrice } : {}),
            })),
        };

        const res = await apiFetch("/api/purchases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (res.ok) {
            setLines([]);
            setNote("");
            setQ("");
            setFeedback({ variant: "success", message: "Purchase saved." });
        } else {
            const data = await res.json().catch(() => ({}));
            setFeedback({
                variant: "error",
                message: data?.error || "Failed to save purchase.",
            });
        }
    };

    const addSupplier = async () => {
        if (!newSupplier.name.trim()) {
            setFeedback({ variant: "error", message: "Supplier name is required." });
            return;
        }
        const res = await apiFetch("/api/suppliers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newSupplier),
        });
        if (res.ok) {
            const s = await res.json();
            setShowAddSupplier(false);
            setNewSupplier({ name: "", phone: "" });
            setSupplierId(s.id);
            void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
            setFeedback({ variant: "success", message: "Supplier added." });
        } else {
            const data = await res.json().catch(() => ({}));
            setFeedback({
                variant: "error",
                message: data?.error || "Failed to add supplier.",
            });
        }
    };

    const supplierLabel = useMemo(
        () => suppliers.find(s => s.id === supplierId)?.name,
        [suppliers, supplierId]
    );

    return (
        <div className="purchase-page">
            <h2>New Purchase</h2>

            {feedback && (
                <StatusLine variant={feedback.variant}>{feedback.message}</StatusLine>
            )}

            <div className="purchase-toolbar">
                <select
                    value={supplierId ?? ""}
                    onChange={e => setSupplierId(e.target.value ? +e.target.value : undefined)}
                    required
                >
                    <option value="">Select supplier *</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button className="btn btn-outline" type="button" onClick={() => setShowAddSupplier(true)}>+ Add Supplier</button>
                <input
                    type="text"
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Search product..."
                    disabled={!supplierId}
                />
            </div>
            {supplierId && supplierLabel && (
                <p style={{ fontSize: 13, color: "#666" }}>
                    Costs prefill from last purchase from <strong>{supplierLabel}</strong> when available.
                </p>
            )}

            {q && results.length > 0 && (
                <div className="p-suggest">
                    {results.map(p => (
                        <div key={p.id} className="p-suggest-item" onClick={() => add(p)}>
                            {p.name} — <span className="mono">SKU {p.sku}</span> — Stock {(+p.stock).toFixed(3)}
                            {supplierPrices.has(p.id) && (
                                <span> — Last from supplier: Rs {supplierPrices.get(p.id)!.toFixed(2)}</span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <table className="table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Unit Cost</th>
                        <th>Line Discount</th>
                        <th>New Sale Price</th>
                        <th className="num">Line Total</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {lines.map((l, i) => {
                        const gross = l.qty * l.unitCost;
                        const lineTotal = Math.max(0, gross - l.lineDiscount);
                        return (
                        <tr key={i}>
                            <td>{l.name}</td>
                            <td>
                                <input
                                    type="number" min={0.001} step={1}
                                    value={l.qty}
                                    onChange={e => {
                                        const v = +e.target.value;
                                        setLines(x => x.map((y, j) => (j === i ? { ...y, qty: v } : y)));
                                    }}
                                />
                            </td>
                            <td>
                                <input
                                    type="number" min={0} step={1}
                                    value={l.unitCost}
                                    onChange={e => {
                                        const v = +e.target.value;
                                        setLines(x => x.map((y, j) => (j === i ? { ...y, unitCost: v } : y)));
                                    }}
                                />
                            </td>
                            <td>
                                <input
                                    type="number" min={0} step={1}
                                    value={l.lineDiscount || ""}
                                    placeholder="0"
                                    onChange={e => {
                                        const v = e.target.value ? +e.target.value : 0;
                                        const capped = Math.min(Math.max(0, v), gross);
                                        setLines(x => x.map((y, j) => (j === i ? { ...y, lineDiscount: capped } : y)));
                                    }}
                                />
                            </td>
                            <td>
                                <input
                                    type="number" min={0} step={1}
                                    value={l.newSalePrice ?? ""}
                                    placeholder="(keep same)"
                                    onChange={e => {
                                        const v = e.target.value ? +e.target.value : undefined;
                                        setLines(x => x.map((y, j) => (j === i ? { ...y, newSalePrice: v } : y)));
                                    }}
                                />
                            </td>
                            <td className="num">{lineTotal.toFixed(2)}</td>
                            <td>
                                <button type="button" className="btn btn-outline" onClick={() => setLines(x => x.filter((_, j) => j !== i))}>
                                    Remove
                                </button>
                            </td>
                        </tr>
                    );
                    })}
                    {lines.length === 0 && (
                        <tr>
                            <td colSpan={7} style={{ textAlign: "center", color: "#6b7280" }}>No items</td>
                        </tr>
                    )}
                </tbody>
                <tfoot>
                    <tr>
                        <th colSpan={5} className="num">Subtotal (before discounts)</th>
                        <th className="num">{subtotalPre.toFixed(2)}</th>
                        <th />
                    </tr>
                    <tr>
                        <th colSpan={5} className="num">Line discounts</th>
                        <th className="num">- {totalLineDiscount.toFixed(2)}</th>
                        <th />
                    </tr>
                    <tr>
                        <th colSpan={5} className="num">Total</th>
                        <th className="num">{total.toFixed(2)}</th>
                        <th />
                    </tr>
                </tfoot>
            </table>

            <textarea
                className="notes"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Note..."
                rows={3}
            />

            <div className="actions">
                <button type="button" className="btn btn-success" onClick={post}>Save Purchase</button>
            </div>

            {showAddSupplier && (
                <div className="modal" onClick={() => setShowAddSupplier(false)}>
                    <div className="modal-card" onClick={e => e.stopPropagation()}>
                        <h3>Add Supplier</h3>
                        <input
                            placeholder="Name *"
                            value={newSupplier.name}
                            onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })}
                        />
                        <input
                            placeholder="Phone"
                            value={newSupplier.phone}
                            onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                        />
                        <div className="modal-actions">
                            <button type="button" className="btn btn-success" onClick={addSupplier}>Save</button>
                            <button type="button" className="btn btn-outline" onClick={() => setShowAddSupplier(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
