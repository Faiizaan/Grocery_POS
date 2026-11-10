import { useState } from "react";
import { StatusLine, type PageFeedback } from "../components/StatusLine";
import { apiFetch } from "../lib/api";
import {
  useCategoriesQuery,
  useCreateCategoryMutation,
} from "../hooks/queries";
import { ApiError } from "../lib/apiJson";

export default function POSRegister() {
  const { data: categories = [] } = useCategoriesQuery();
  const createCategory = useCreateCategoryMutation();
  const [newCat, setNewCat] = useState("");
  const [catLoading, setCatLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: "",
    categoryId: "" as number | "", // select
    price: "", // purchase price
    salePrice: "", // sale price
    taxRate: "0",
    isWeighted: false,
    stock: "0",
    piecesPerBox: "",
  });

  // Optional helper: enter box prices, per-piece prices are calculated from them.
  const [boxCost, setBoxCost] = useState("");
  const [boxSale, setBoxSale] = useState("");
  const ppb = Number(form.piecesPerBox) || 0;
  const applyBoxPrices = (cost: string, sale: string, pieces: number) => {
    if (pieces < 2) return;
    setForm((f) => ({
      ...f,
      ...(cost !== "" ? { price: (Number(cost) / pieces).toFixed(2) } : {}),
      ...(sale !== "" ? { salePrice: (Number(sale) / pieces).toFixed(2) } : {}),
    }));
  };

  const [feedback, setFeedback] = useState<PageFeedback>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: any) => setForm((prev) => ({ ...prev, [k]: v }));

  const addCategory = async () => {
    const raw = newCat.trim();
    if (!raw) return;

    setCatLoading(true); // 👈 START loading

    try {
      // 🔹 check if category already exists (case-insensitive)
      const existing = categories.find(
        (c) => c.name.toLowerCase() === raw.toLowerCase()
      );

      if (existing) {
        setForm((f) => ({ ...f, categoryId: existing.id }));
        setNewCat("");
        return;
      }

      const name = raw.toUpperCase();
      const created = await createCategory.mutateAsync(name);
      setForm((f) => ({ ...f, categoryId: created.id }));
      setNewCat("");
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : "Failed to add category.";
      setFeedback({ variant: "error", message });
    } finally {
      setCatLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setLoading(true);

    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        barcode: form.barcode.trim() || undefined,
        categoryId: Number(form.categoryId),
        price: Number(form.price || 0),
        salePrice: Number(form.salePrice || 0),
        taxRate: Number(form.taxRate || 0),
        isWeighted: Boolean(form.isWeighted),
        stock: Number(form.stock || 0),
        piecesPerBox: form.piecesPerBox ? Math.floor(Number(form.piecesPerBox)) : null,
      };
      if (payload.piecesPerBox !== null && payload.piecesPerBox < 2) {
        setFeedback({ variant: "error", message: "Pieces per box must be 2 or more (or leave it empty)." });
        setLoading(false);
        return;
      }
      if (form.categoryId === "") {
        setFeedback({ variant: "error", message: "Category is required." });
        setLoading(false);
        return;
      }
      if (payload.salePrice <= payload.price) {
        setFeedback({
          variant: "error",
          message: "Sale price must be greater than purchase price.",
        });
        setLoading(false);
        return;
      }
      const res = await apiFetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          variant: "error",
          message: data?.error || "Failed to create product.",
        });
      } else {
        setFeedback({
          variant: "success",
          message: `Product #${data.id} created: ${data.name}`,
        });
        setForm({
          name: "",
          sku: "",
          barcode: "",
          categoryId: "",
          price: "",
          salePrice: "",
          taxRate: "0",
          isWeighted: false,
          stock: "0",
          piecesPerBox: "",
        });
        setBoxCost("");
        setBoxSale("");
      }
    } catch {
      setFeedback({ variant: "error", message: "Failed to create product (network)." });
    } finally {
      setLoading(false);
    }
  };

  const genSku = () => {
    const ts = Date.now().toString().slice(-6);
    set("sku", `SKU-${ts}`);
  };

  return (
    <div className="register-page">
      <h2 className="page-title">Add Product</h2>
      <p className="page-subtitle">
        Create a new product (master data). Opening stock is audited.
      </p>

      <form onSubmit={submit} className="form-grid">
        {/* Row: Name / SKU */}
        <div className="grid-2">
          <div className="field">
            <label>Name *</label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label>SKU *</label>
            <div className="input-row">
              <input
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                required
              />
              <button
                type="button"
                onClick={genSku}
                className="btn btn-outline"
              >
                Generate
              </button>
            </div>
          </div>
        </div>

        {/* Row: Barcode / Category pick-or-type */}
        <div className="grid-2">
          <div className="field">
            <label>Barcode</label>
            <input
              value={form.barcode}
              onChange={(e) => set("barcode", e.target.value)}
            />
          </div>

          <div className="field">
            <label>Category *</label>
            <div className="">
              <select
                className="category-select"
                required
                value={form.categoryId === "" ? "" : String(form.categoryId)}
                onChange={(e) =>
                  set(
                    "categoryId",
                    e.target.value ? Number(e.target.value) : ""
                  )
                }
              >
                <option value="">-- Select Category --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="input-row" style={{ marginTop: 8 }}>
              <input
                placeholder="New category name"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
              />
              <button
                type="button"
                onClick={addCategory}
                disabled={catLoading}
                className="btn btn-secondary"
              >
                {catLoading ? "Adding…" : "Add Category"}
              </button>
            </div>
          </div>
        </div>

        {/* Row: Box helper */}
        <div className="grid-3">
          <div className="field">
            <label>Pieces per box (optional)</label>
            <input
              type="number"
              min={2}
              step={1}
              placeholder="e.g. 6"
              value={form.piecesPerBox}
              onChange={(e) => {
                set("piecesPerBox", e.target.value);
                applyBoxPrices(boxCost, boxSale, Number(e.target.value) || 0);
              }}
            />
          </div>
          {ppb >= 2 && (
            <>
              <div className="field">
                <label>Box purchase price</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={boxCost}
                  onChange={(e) => {
                    setBoxCost(e.target.value);
                    applyBoxPrices(e.target.value, "", ppb);
                  }}
                />
              </div>
              <div className="field">
                <label>Box sale price</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={boxSale}
                  onChange={(e) => {
                    setBoxSale(e.target.value);
                    applyBoxPrices("", e.target.value, ppb);
                  }}
                />
              </div>
            </>
          )}
        </div>
        {ppb >= 2 && (
          <p className="hint-sm" style={{ marginTop: -6 }}>
            Prices below are per single piece (box price ÷ {ppb}). Stock is counted in pieces.
          </p>
        )}

        {/* Row: Purchase / Sale / Tax */}
        <div className="grid-3">
          <div className="field">
            <label>Purchase Price (per piece)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Sale Price (per piece)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={form.salePrice}
              onChange={(e) => set("salePrice", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Tax %</label>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={form.taxRate}
              onChange={(e) => set("taxRate", e.target.value)}
            />
          </div>
        </div>

        {/* Row: Opening stock / Weighted */}
        <div className="grid-2">
          <div className="field">
            <label>Opening Stock (pieces)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={form.stock}
              onChange={(e) => set("stock", e.target.value)}
            />
          </div>

          <div className="inline">
            <label>
              <input
                type="checkbox"
                checked={form.isWeighted}
                onChange={(e) => set("isWeighted", e.target.checked)}
              />{" "}
              Weighted item (sold by weight)
            </label>
          </div>
        </div>

        {/* Actions */}
        <div>
          <button type="submit" disabled={loading} className="btn btn-success">
            {loading ? "Saving…" : "Save Product"}
          </button>
        </div>
      </form>

      {feedback && (
        <StatusLine variant={feedback.variant}>{feedback.message}</StatusLine>
      )}
    </div>
  );
}
