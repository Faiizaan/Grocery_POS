import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { StatusLine } from "../components/StatusLine";
import StockValue from "../components/StockValue";
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
  const [formPpb, setFormPpb] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-delete state
  const [selected, setSelected] = useState<Map<number, string>>(new Map()); // id -> name
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const allOnPageSelected =
    items.length > 0 && items.every((p) => selected.has(p.id));

  const toggleOne = (p: Product) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.set(p.id, p.name);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allOnPageSelected) items.forEach((p) => next.delete(p.id));
      else items.forEach((p) => next.set(p.id, p.name));
      return next;
    });
  };

  const openDelete = () => {
    setDeletePassword("");
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteOpen(false);
    setDeletePassword("");
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!deletePassword) {
      setDeleteError("Enter the delete password.");
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const res = await apiFetch("/api/products/delete", {
      method: "POST",
      body: JSON.stringify({ ids: [...selected.keys()], password: deletePassword }),
    });
    const data = await res.json().catch(() => ({}));
    setDeleting(false);
    if (!res.ok) {
      setDeleteError(data?.error || "Failed to delete products.");
      return;
    }
    const count = Array.isArray(data?.deleted) ? data.deleted.length : 0;
    setNotice(`Deleted ${count} product${count === 1 ? "" : "s"}.`);
    setSelected(new Map());
    setDeleteOpen(false);
    setDeletePassword("");
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    await refetch();
  };

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
    setFormPpb(p.piecesPerBox ? String(p.piecesPerBox) : "");
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
    setFormPpb("");
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

    const ppbTrim = formPpb.trim();
    const ppbNum = ppbTrim === "" ? null : Math.floor(Number(ppbTrim));
    if (ppbNum !== null && !(ppbNum >= 2)) {
      setError("Pieces per box must be 2 or more (or empty).");
      return;
    }
    if (ppbNum !== (editing.piecesPerBox ?? null)) body.piecesPerBox = ppbNum;

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

      <StockValue />

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

      {notice && <StatusLine variant="success">{notice}</StatusLine>}

      <div className="products-bulk-bar">
        <span>
          {selected.size > 0
            ? `${selected.size} selected`
            : "Tick products to delete them"}
        </span>
        {selected.size > 0 && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setSelected(new Map())}
          >
            Clear selection
          </button>
        )}
        <button
          type="button"
          className="btn btn-danger"
          disabled={selected.size === 0}
          onClick={openDelete}
        >
          Delete selected{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
      </div>

      {/* Table */}
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 32 }}>
              <input
                type="checkbox"
                aria-label="Select all on this page"
                checked={allOnPageSelected}
                onChange={toggleAllOnPage}
              />
            </th>
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
              <td>
                <input
                  type="checkbox"
                  aria-label={`Select ${p.name}`}
                  checked={selected.has(p.id)}
                  onChange={() => toggleOne(p)}
                />
              </td>
              <td className="mono">{p.id}</td>
              <td>
                <Link
                  to={`/products/${p.id}`}
                  style={{ textDecoration: "none" }}
                >
                  {p.name}
                </Link>
                {p.piecesPerBox ? (
                  <span className="box-badge" title="Purchased in boxes">
                    box of {p.piecesPerBox}
                  </span>
                ) : null}
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
              <td colSpan={12} style={{ textAlign: "center", color: "#777" }}>
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

      {/* Delete Modal */}
      {deleteOpen && (
        <div role="dialog" aria-modal="true" className="modal" onClick={closeDelete}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">
              Delete {selected.size} product{selected.size === 1 ? "" : "s"}?
            </h3>
            <div className="form">
              <ul className="delete-list">
                {[...selected.entries()].slice(0, 15).map(([id, name]) => (
                  <li key={id}>
                    #{id} — {name}
                  </li>
                ))}
                {selected.size > 15 && <li>…and {selected.size - 15} more</li>}
              </ul>
              <p style={{ fontSize: 13, color: "#555", margin: 0 }}>
                They will be removed from products, search, checkout and purchases.
                Past sales and purchases keep their history.
              </p>
              <label>
                <div className="lab">Delete password</div>
                <input
                  type="password"
                  autoFocus
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void confirmDelete();
                    if (e.key === "Escape") closeDelete();
                  }}
                />
              </label>
              {deleteError && <StatusLine variant="error">{deleteError}</StatusLine>}
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={closeDelete} disabled={deleting}>
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => void confirmDelete()}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
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
                <div className="lab">Pieces per box (optional)</div>
                <input
                  type="number"
                  min={2}
                  step={1}
                  placeholder="e.g. 6 — leave empty if not sold in boxes"
                  value={formPpb}
                  onChange={(e) => setFormPpb(e.target.value)}
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
