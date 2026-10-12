import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PaginationBar } from "../components/PaginationBar";
import { useCategoryDetailQuery } from "../hooks/queries";

export default function CategoryDetail() {
  const { id } = useParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [q, setQ] = useState("");
  const [searchQ, setSearchQ] = useState("");

  const { data, isLoading, error } = useCategoryDetailQuery(
    id,
    searchQ,
    page,
    pageSize
  );

  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (isLoading && !data) return <div>Loading…</div>;
  if (error || !data) {
    return (
      <div>
        <p style={{ color: "#c00" }}>Category not found.</p>
        <Link to="/categories">← Categories</Link>
      </div>
    );
  }

  return (
    <div>
      <p>
        <Link to="/categories">← Categories</Link>
        {" · "}
        <Link to="/reports/category">Category report</Link>
      </p>
      <h2>{data.category.name}</h2>
      <p style={{ color: "#666" }}>Products in this category</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearchQ(q);
          setPage(1);
        }}
        style={{ display: "flex", gap: 8, marginBottom: 12 }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name / SKU / barcode"
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" className="btn" disabled={isLoading}>
          Search
        </button>
      </form>

      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>SKU</th>
            <th>Barcode</th>
            <th className="num">Cost</th>
            <th className="num">Sale price</th>
            <th className="num">Stock</th>
          </tr>
        </thead>
        <tbody>
          {data.products.map((p) => (
            <tr key={p.id}>
              <td>
                <Link to={`/products/${p.id}`}>{p.name}</Link>
              </td>
              <td className="mono">{p.sku}</td>
              <td className="mono">{p.barcode || "—"}</td>
              <td className="num">{(+p.price).toFixed(2)}</td>
              <td className="num">{(+p.salePrice).toFixed(2)}</td>
              <td className="num">{(+p.stock).toFixed(3)}</td>
            </tr>
          ))}
          {data.products.length === 0 && !isLoading && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "#777" }}>
                No products in this category
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
        disabled={isLoading}
      />
    </div>
  );
}
