import { Link, useParams } from "react-router-dom";
import { usePurchaseOrderQuery } from "../hooks/queries";

export default function PurchaseOrderShow() {
  const { id } = useParams();
  const { data: po, isLoading, error } = usePurchaseOrderQuery(id);

  if (isLoading) return <div>Loading…</div>;
  if (error || !po) {
    return (
      <div>
        <p style={{ color: "#c00" }}>Purchase order not found.</p>
        <Link to="/purchase-order">← Back</Link>
      </div>
    );
  }

  return (
    <div>
      <p>
        <Link to="/purchase-order">← Purchase orders</Link>
      </p>
      <h2>Purchase Order #{po.id}</h2>
      <p style={{ color: "#666" }}>
        Saved {new Date(po.createdAt).toLocaleString()} · Status {po.status} ·
        Lookback {po.daysLookback} days
      </p>
      <p>
        Supplier:{" "}
        <Link to={`/suppliers/${po.supplier.id}`}>{po.supplier.name}</Link>
      </p>
      {po.note && <p>Note: {po.note}</p>}

      <table className="table" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th className="num">Stock</th>
            <th className="num">Recent sales</th>
            <th className="num">Suggested qty</th>
          </tr>
        </thead>
        <tbody>
          {po.items.map((it) => (
            <tr key={it.id}>
              <td>{it.product.name}</td>
              <td className="mono">{it.product.sku}</td>
              <td className="num">{(+it.currentStock).toFixed(3)}</td>
              <td className="num">{(+it.recentSales).toFixed(3)}</td>
              <td className="num">{(+it.suggestedQty).toFixed(3)}</td>
            </tr>
          ))}
          {po.items.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "#777" }}>
                No line items
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {po.items.length > 0 && (
        <p style={{ marginTop: 16 }}>
          <Link to="/purchase" className="btn btn-success">
            Record purchase from this order →
          </Link>
        </p>
      )}
    </div>
  );
}
