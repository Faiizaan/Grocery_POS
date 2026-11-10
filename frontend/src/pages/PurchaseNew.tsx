import { useEffect, useMemo, useState } from "react";
import { StatusLine, type PageFeedback } from "../components/StatusLine";
import { apiFetch } from "../lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useSupplierOptionsQuery } from "../hooks/queries";
import { getJson } from "../lib/apiJson";

type Product = {
    id: number;
    name: string;
    sku: string;
    price: string;
    salePrice?: string;
    stock: string;
    barcode?: string;
    piecesPerBox?: number | null;
};

type Line = {
    productId: number;
    name: string;
    qty: number;
    unitCost: number;
    lineDiscount: number;
    newSalePrice?: number;
    /** Last cost paid to the selected supplier (hint only). */
    supplierLastCost?: number;
    /** Enter this line per piece or per box. Stock/prices are always saved per piece. */
    mode: "pieces" | "boxes";
    boxes: number;
    piecesPerBox: number | "";
    boxCost: number;
    newBoxSalePrice?: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Per-piece cost is stored rounded to 2 decimals (220/6 = 36.67), so 36.67 x 6 = 220.02.
 *  Undo that rounding when going back to a box price: if the box price is within the
 *  rounding error of a whole rupee, use the whole rupee. */
const boxPriceFromPiece = (piece: number, pieces: number) => {
    const raw = piece * pieces;
    const whole = Math.round(raw);
    return Math.abs(raw - whole) <= 0.005 * pieces + 1e-9 ? whole : round2(raw);
};
const lineGross = (l: Line) =>
    l.mode === "boxes" ? l.boxes * l.boxCost : l.qty * l.unitCost;
const linePieces = (l: Line) =>
    l.mode === "boxes" ? l.boxes * (Number(l.piecesPerBox) || 0) : l.qty;

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
        // Default to the product's current purchase cost. It is updated by every purchase AND
        // by manual edits on the Products page, so it is always the latest known cost.
        // (Previously the supplier's last cost won, which brought back old prices after an edit.)
        const supplierCost = supplierPrices.get(p.id);
        const unitCost = +p.price;
        setLines(prev => {
            const i = prev.findIndex(x => x.productId === p.id);
            if (i >= 0) {
                const copy = [...prev];
                copy[i] =
                    copy[i].mode === "boxes"
                        ? { ...copy[i], boxes: copy[i].boxes + 1 }
                        : { ...copy[i], qty: copy[i].qty + 1 };
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
                    supplierLastCost: supplierCost,
                    // products with a box size start in box mode
                    mode: p.piecesPerBox ? "boxes" : "pieces",
                    boxes: 1,
                    piecesPerBox: p.piecesPerBox ?? "",
                    boxCost: p.piecesPerBox ? boxPriceFromPiece(unitCost, p.piecesPerBox) : 0,
                },
            ];
        });
        setQ("");
        setResults([]);
    };

    const updLine = (i: number, patch: Partial<Line>) =>
        setLines(x => x.map((y, j) => (j === i ? { ...y, ...patch } : y)));

    const subtotalPre = lines.reduce((s, l) => s + lineGross(l), 0);
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
        const badBox = lines.find(
            l => l.mode === "boxes" && (!(Number(l.piecesPerBox) >= 2) || !(l.boxes > 0))
        );
        if (badBox) {
            setFeedback({
                variant: "error",
                message: `"${badBox.name}": enter number of boxes and pieces per box (2 or more).`,
            });
            return;
        }
        setFeedback(null);
        const payload = {
            supplierId,
            note,
            items: lines.map(l => {
                const common = {
                    productId: l.productId,
                    ...(l.lineDiscount > 0 ? { lineDiscount: l.lineDiscount } : {}),
                };
                if (l.mode === "boxes") {
                    const ppb = Number(l.piecesPerBox);
                    return {
                        ...common,
                        boxes: l.boxes,
                        piecesPerBox: ppb,
                        boxCost: l.boxCost,
                        // box sale price -> price of one piece
                        ...(l.newBoxSalePrice ? { newSalePrice: round2(l.newBoxSalePrice / ppb) } : {}),
                    };
                }
                return {
                    ...common,
                    qty: l.qty,
                    unitCost: l.unitCost,
                    ...(l.newSalePrice ? { newSalePrice: l.newSalePrice } : {}),
                };
            }),
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
                    Cost prefills with the product's current purchase price. Products with a box size start in
                    Boxes — stock and prices are always saved per single piece.
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
                        <th>Quantity</th>
                        <th>Cost</th>
                        <th>Line Discount</th>
                        <th>New Sale Price</th>
                        <th className="num">Line Total</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {lines.map((l, i) => {
                        const gross = lineGross(l);
                        const lineTotal = Math.max(0, gross - l.lineDiscount);
                        const ppb = Number(l.piecesPerBox) || 0;
                        const isBox = l.mode === "boxes";
                        return (
                        <tr key={i}>
                            <td>
                                {l.name}
                                <div style={{ marginTop: 4 }}>
                                    <select
                                        value={l.mode}
                                        aria-label="Enter as pieces or boxes"
                                        onChange={e => {
                                            const mode = e.target.value as Line["mode"];
                                            if (mode === "boxes") {
                                                const n = Number(l.piecesPerBox) || 0;
                                                updLine(i, {
                                                    mode,
                                                    boxes: 1,
                                                    boxCost: n ? boxPriceFromPiece(l.unitCost, n) : l.boxCost,
                                                });
                                            } else {
                                                updLine(i, {
                                                    mode,
                                                    qty: Math.max(1, linePieces(l)),
                                                    unitCost: ppb ? round2(l.boxCost / ppb) : l.unitCost,
                                                });
                                            }
                                        }}
                                    >
                                        <option value="pieces">Pieces</option>
                                        <option value="boxes">Boxes</option>
                                    </select>
                                </div>
                            </td>
                            <td>
                                {isBox ? (
                                    <div className="box-qty">
                                        <input
                                            type="number" min={0.001} step={1}
                                            value={l.boxes}
                                            aria-label="Number of boxes"
                                            onChange={e => updLine(i, { boxes: +e.target.value })}
                                            style={{ width: 70 }}
                                        />
                                        <span>box ×</span>
                                        <input
                                            type="number" min={2} step={1}
                                            value={l.piecesPerBox}
                                            placeholder="6"
                                            aria-label="Pieces per box"
                                            onChange={e =>
                                                updLine(i, {
                                                    piecesPerBox: e.target.value ? Math.floor(+e.target.value) : "",
                                                })
                                            }
                                            style={{ width: 60 }}
                                        />
                                        <span>pcs</span>
                                        <div className="hint-sm">= {linePieces(l)} pieces into stock</div>
                                    </div>
                                ) : (
                                    <input
                                        type="number" min={0.001} step={1}
                                        value={l.qty}
                                        onChange={e => updLine(i, { qty: +e.target.value })}
                                    />
                                )}
                            </td>
                            <td>
                                {isBox ? (
                                    <>
                                        <input
                                            type="number" min={0} step={1}
                                            value={l.boxCost}
                                            aria-label="Cost per box"
                                            onChange={e => updLine(i, { boxCost: +e.target.value })}
                                        />
                                        <div className="hint-sm">
                                            per box{ppb ? ` = Rs ${(l.boxCost / ppb).toFixed(2)} per piece` : ""}
                                        </div>
                                    </>
                                ) : (
                                    <input
                                        type="number" min={0} step={1}
                                        value={l.unitCost}
                                        onChange={e => updLine(i, { unitCost: +e.target.value })}
                                    />
                                )}
                                {l.supplierLastCost !== undefined &&
                                    l.supplierLastCost !== (isBox && ppb ? round2(l.boxCost / ppb) : l.unitCost) && (
                                    <div className="hint-sm">
                                        Last from this supplier: {l.supplierLastCost.toFixed(2)} per piece
                                    </div>
                                )}
                            </td>
                            <td>
                                <input
                                    type="number" min={0} step={1}
                                    value={l.lineDiscount || ""}
                                    placeholder="0"
                                    onChange={e => {
                                        const v = e.target.value ? +e.target.value : 0;
                                        updLine(i, { lineDiscount: Math.min(Math.max(0, v), gross) });
                                    }}
                                />
                            </td>
                            <td>
                                {isBox ? (
                                    <>
                                        <input
                                            type="number" min={0} step={1}
                                            value={l.newBoxSalePrice ?? ""}
                                            placeholder="(keep same)"
                                            aria-label="Sale price per box"
                                            onChange={e =>
                                                updLine(i, { newBoxSalePrice: e.target.value ? +e.target.value : undefined })
                                            }
                                        />
                                        <div className="hint-sm">
                                            per box
                                            {l.newBoxSalePrice && ppb
                                                ? ` = Rs ${(l.newBoxSalePrice / ppb).toFixed(2)} per piece`
                                                : ""}
                                        </div>
                                    </>
                                ) : (
                                    <input
                                        type="number" min={0} step={1}
                                        value={l.newSalePrice ?? ""}
                                        placeholder="(keep same)"
                                        onChange={e =>
                                            updLine(i, { newSalePrice: e.target.value ? +e.target.value : undefined })
                                        }
                                    />
                                )}
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
