import { formatPoQty, poLineCost, rs } from "../lib/poFormat";
import { formatDateTime } from "../lib/time";
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
        Saved {formatDateTime(po.createdAt)} · Status {po.status} ·
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
            <th className="num">Order</th>
            <th className="num">Cost / piece</th>
            <th className="num">Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {po.items.map((it) => (
            <tr key={it.id}>
              <td>{it.product.name}</td>
              <td className="mono">{it.product.sku}</td>
              <td className="num">{+(+it.currentStock).toFixed(3)}</td>
              <td className="num">{+(+it.recentSales).toFixed(3)}</td>
              <td className="num">{formatPoQty(it)}</td>
              <td className="num">{(+(it.product.price ?? 0)).toFixed(2)}</td>
              <td className="num">{rs(poLineCost(it))}</td>
            </tr>
          ))}
          {po.items.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", color: "#777" }}>
                No line items
              </td>
            </tr>
          )}
        </tbody>
        {po.items.length > 0 && (
          <tfoot>
            <tr>
              <th colSpan={6} className="num">Estimated total (current purchase prices)</th>
              <th className="num">{rs(po.items.reduce((t, it) => t + poLineCost(it), 0))}</th>
            </tr>
          </tfoot>
        )}
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
