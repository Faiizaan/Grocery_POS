import { formatDateTime } from "../lib/time";
import { Link, useParams } from "react-router-dom";
import { usePurchaseQuery } from "../hooks/queries";

type Item = {
    id: number;
    qty: string;
    unitCost: string;
    lineDiscount?: string;
    lineTotal: string;
    boxes?: string | null;
    piecesPerBox?: number | null;
    boxCost?: string | null;
    product: { name: string; sku: string; barcode?: string | null };
};

type Purchase = {
    id: number;
    createdAt: string;
    subtotal: string;
    discountValue: string;
    taxTotal: string;
    total: string;
    note?: string | null;
    supplier?: { name: string } | null;
    items: Item[];
};

export default function PurchaseShow() {
    const { id } = useParams();
    const { data, isLoading } = usePurchaseQuery(id);

    if (isLoading) return <div style={{ marginTop: 24 }}>Loading…</div>;
    if (!data) return <div style={{ marginTop: 24 }}>Purchase not found</div>;

    const purchase = data as unknown as Purchase;

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <Link to="/purchases">← Back to Purchases</Link>
            </div>

            <h2>Purchase #{purchase.id}</h2>
            <div>{formatDateTime(purchase.createdAt)}</div>
            <div>Supplier: {purchase.supplier?.name || "-"}</div>
            {purchase.note && <div>Note: {purchase.note}</div>}

            <table border={1} cellPadding={6} style={{ width: "100%", marginTop: 16 }}>
                <thead>
                    <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th style={{ textAlign: "right" }}>Qty</th>
                        <th style={{ textAlign: "right" }}>Unit cost</th>
                        <th style={{ textAlign: "right" }}>Discount</th>
                        <th style={{ textAlign: "right" }}>Line total</th>
                    </tr>
                </thead>
                <tbody>
                    {purchase.items.map((it) => (
                        <tr key={it.id}>
                            <td>{it.product.name}</td>
                            <td>{it.product.sku}</td>
                            <td style={{ textAlign: "right" }}>
                                {+it.qty}
                                {it.boxes && it.piecesPerBox ? (
                                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                                        {+it.boxes} box × {it.piecesPerBox} @ Rs {(+(it.boxCost ?? 0)).toFixed(2)}
                                    </div>
                                ) : null}
                            </td>
                            <td style={{ textAlign: "right" }}>{(+it.unitCost).toFixed(2)}</td>
                            <td style={{ textAlign: "right" }}>
                                {(+(it.lineDiscount ?? 0) > 0)
                                    ? `-Rs ${(+it.lineDiscount!).toFixed(2)}`
                                    : "—"}
                            </td>
                            <td style={{ textAlign: "right" }}>{(+it.lineTotal).toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div style={{ marginTop: 16, textAlign: "right" }}>
                <div>Subtotal: Rs {(+purchase.subtotal).toFixed(2)}</div>
                {(+purchase.discountValue > 0) && (
                    <div>Line discounts: -Rs {(+purchase.discountValue).toFixed(2)}</div>
                )}
                {(+purchase.taxTotal > 0) && (
                    <div>Tax: Rs {(+purchase.taxTotal).toFixed(2)}</div>
                )}
                <div><b>Total: Rs {(+purchase.total).toFixed(2)}</b></div>
            </div>
        </div>
    );
}
