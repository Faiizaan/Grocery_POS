import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { StatusLine } from "../components/StatusLine";
import { apiFetch } from "../lib/api";
import {
  useCategoriesQuery,
  useProductsListQuery,
  type ProductListRow,
} from "../hooks/queries";
import { queryKeys } from "../lib/queryKeys";
import { LOW_STOCK_THRESHOLD, parseStock } from "../lib/stock";

type Product = ProductListRow;

type Category = { id: number; name: string };

const PAGE_SIZE_OPTIONS = [20, 30] as const;

export default function Products() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(30);

  const { data, isLoading: loading, refetch } = useProductsListQuery(
    searchQ,
    page,
    pageSize
  );
  const items = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const { data: cats = [], isLoading: catsLoading } = useCategoriesQuery();

  // Edit modal state
  const [editing, setEditing] = useState<Product | null>(null);
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formSalePrice, setFormSalePrice] = useState("");
  const [formBarcode, setFormBarcode] = useState("");
  const [formCategoryId, setFormCategoryId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of cats) m.set(c.id, c.name);
    return m;
  }, [cats]);

  const toNumber = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setFormName(p.name ?? "");
    setFormPrice(p.price ?? "");
    setFormSalePrice(p.salePrice ?? "");
    setFormBarcode(p.barcode ?? "");
    setFormCategoryId(
      p.categoryId != null
        ? String(p.categoryId)
        : p.categoryRef?.id != null
          ? String(p.categoryRef.id)
          : ""
    );
    setError(null);
  };

  const closeEdit = () => {
    setEditing(null);
    setFormName("");
    setFormPrice("");
    setFormSalePrice("");
    setFormBarcode("");
    setFormCategoryId("");
    setSaving(false);
    setError(null);
  };

  const saveEdit = async () => {
    if (!editing) return;

    const body: Record<string, any> = {};
    const name = formName.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }
    if (name !== editing.name) body.name = name;

    const priceNum = toNumber(formPrice);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError("Purchase cost must be a non-negative number.");
      return;
    }
    if (priceNum !== Number(editing.price)) body.price = priceNum;

    const spTrim = formSalePrice.trim();
    if (spTrim !== "") {
      const saleNum = toNumber(spTrim);
      if (!Number.isFinite(saleNum) || saleNum < 0) {
        setError("Sale price must be a non-negative number.");
        return;
      }
      if (
        editing.salePrice === undefined ||
        Number(editing.salePrice) !== saleNum
      )
        body.salePrice = saleNum;
    } else {
      if (editing.salePrice !== undefined && editing.salePrice !== "")
        body.salePrice = 0;
    }
    const effectiveSale = spTrim === "" ? 0 : toNumber(spTrim);
    if (!Number.isFinite(effectiveSale)) {
      setError("Sale price must be a valid number.");
      return;
    }

    if (effectiveSale <= priceNum) {
      setError("Sale price must be greater than purchase cost.");
      return;
    }

    const bcTrim = formBarcode.trim();
    const originalBc = editing.barcode ?? "";
    if (bcTrim !== originalBc) body.barcode = bcTrim === "" ? null : bcTrim;

    const origCid =
      editing.categoryId != null
        ? String(editing.categoryId)
        : editing.categoryRef?.id != null
          ? String(editing.categoryRef.id)
          : "";
    if (formCategoryId !== origCid)
      body.categoryId = formCategoryId === "" ? null : Number(formCategoryId);

    if (Object.keys(body).length === 0) {
      closeEdit();
      return;
    }

    setSaving(true);
    setError(null);

    const res = await apiFetch(`/api/products/${editing.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const msg =
        (await res.json().catch(() => ({})))?.error ||
        "Failed to save changes.";
      setError(msg);
      setSaving(false);
      return;
    }

    void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    await refetch();
    closeEdit();
  };

  return (
    <div className="products-page">
      <h2>Products</h2>

      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearchQ(q);
          setPage(1);
        }}
        className="products-search"
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name/sku/barcode"
        />
        <button type="submit" className="btn" disabled={loading}>
          {loading ? "Loading…" : "Search"}
        </button>
        <label style={{ marginLeft: 8 }}>
          Per page{" "}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {totalCount > 0 && (
          <span style={{ fontSize: 14, color: "#666", marginLeft: 8 }}>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of{" "}
            {totalCount}
          </span>
        )}
      </form>

      {/* Table */}
      <table className="table">
        <thead>
          <tr>
            <th className="mono">ID</th>
            <th>Name</th>
            <th>SKU</th>
            <th>Barcode</th>
            <th>Category</th>
            <th className="num">Purchase Cost</th>
            <th className="num">Sale Price</th>
            <th className="num">Tax %</th>
            <th className="num">Stock</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const stockNum = parseStock(p.stock);
            const lowStock =
              stockNum > 0 && stockNum <= LOW_STOCK_THRESHOLD;
            const outOfStock = stockNum <= 0;
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
              <td className="mono">{p.id}</td>
              <td>
                <Link
                  to={`/products/${p.id}`}
                  style={{ textDecoration: "none" }}
                >
                  {p.name}
                </Link>
              </td>
              <td className="mono">{p.sku}</td>
              <td className="mono">{p.barcode || "-"}</td>
              <td>
                {p.categoryRef?.name ??
                  (p.categoryId != null
                    ? catNameById.get(p.categoryId) ?? "-"
                    : "-")}
              </td>
              <td className="num">{(+p.price).toFixed(2)}</td>
              <td className="num">
                {p.salePrice !== undefined &&
                p.salePrice !== null &&
                p.salePrice !== ""
                  ? (+p.salePrice).toFixed(2)
                  : "-"}
              </td>
              <td className="num">{(+p.taxRate || 0).toFixed(2)}</td>
              <td className="num">
                {(+p.stock).toFixed(3)}
                {outOfStock && (
                  <span className="stock-badge stock-badge-out"> Out</span>
                )}
                {lowStock && !outOfStock && (
                  <span className="stock-badge stock-badge-low"> Low</span>
                )}
              </td>
              <td className="actions">
                <button className="btn" onClick={() => openEdit(p)}>
                  Edit
                </button>
              </td>
              <td>
                <Link to={`/products/${p.id}`} className="btn btn-outline-pd">
                  View analytics
                </Link>
              </td>
            </tr>
          );
          })}
          {items.length === 0 && !loading && (
            <tr>
              <td colSpan={10} style={{ textAlign: "center", color: "#777" }}>
                No products
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
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

      {/* Edit Modal */}
      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          className="modal"
          onClick={closeEdit}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Edit Product #{editing.id}</h3>

            <div className="form">
              <label>
                <div className="lab">Name</div>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") closeEdit();
                  }}
                />
              </label>

              <div className="grid-2">
                <label>
                  <div className="lab">Purchase Cost</div>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") closeEdit();
                    }}
                  />
                </label>

                <label>
                  <div className="lab">Sale Price</div>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    placeholder="leave empty to clear → 0"
                    value={formSalePrice}
                    onChange={(e) => setFormSalePrice(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") closeEdit();
                    }}
                  />
                </label>
              </div>

              <label>
                <div className="lab">Barcode</div>
                <input
                  value={formBarcode}
                  onChange={(e) => setFormBarcode(e.target.value)}
                  placeholder="leave empty to clear"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") closeEdit();
                  }}
                />
              </label>

              <label>
                <div className="lab">Category</div>
                <select
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  disabled={catsLoading}
                >
                  <option value="">— None —</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {catsLoading && (
                  <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                    Loading categories…
                  </div>
                )}
              </label>

              {error && <StatusLine variant="error">{error}</StatusLine>}

              <div className="modal-footer">
                <button
                  className="btn btn-outline"
                  onClick={closeEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-success"
                  onClick={saveEdit}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
