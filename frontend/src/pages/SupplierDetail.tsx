import { Link, useParams } from "react-router-dom";
import { useSupplierDetailQuery } from "../hooks/queries";

export default function SupplierDetail() {
  const { id } = useParams();
  const { data, isLoading, error } = useSupplierDetailQuery(id);

  if (isLoading) return <div>Loading…</div>;
  if (error || !data) {
    return (
      <div>
        <p style={{ color: "#c00" }}>Failed to load supplier.</p>
        <Link to="/suppliers">← Back to suppliers</Link>
      </div>
    );
  }

  const { supplier, products } = data;

  return (
    <div>
      <p>
        <Link to="/suppliers">← Suppliers</Link>
      </p>
      <h2>{supplier.name}</h2>
      {supplier.phone && (
        <p style={{ color: "#666" }}>Phone: {supplier.phone}</p>
      )}

      <h3 style={{ marginTop: 24 }}>Products from this supplier</h3>
      <p style={{ color: "#666", marginTop: -8 }}>
        Each row shows the last price you paid this supplier for that product.
        The latest cost column is used on sales and summary (most recent purchase
        overall).
      </p>

      <table className="table">
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th className="num">Price from supplier</th>
            <th className="num">Latest cost (all suppliers)</th>
            <th className="num">Sale price</th>
            <th className="num">Stock</th>
            <th>Last purchased</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.productId}>
              <td>
                <Link to={`/products/${p.productId}`}>{p.name}</Link>
              </td>
              <td className="mono">{p.sku}</td>
              <td className="num">Rs {(+p.supplierUnitCost).toFixed(2)}</td>
              <td className="num">Rs {(+p.latestProductCost).toFixed(2)}</td>
              <td className="num">Rs {(+p.salePrice).toFixed(2)}</td>
              <td className="num">{(+p.stock).toFixed(3)}</td>
              <td>{new Date(p.lastPurchasedAt).toLocaleString()}</td>
            </tr>
          ))}
          {products.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", color: "#777" }}>
                No purchases from this supplier yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
