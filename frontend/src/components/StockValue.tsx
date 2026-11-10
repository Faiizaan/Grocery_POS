import { useState } from "react";
import { ApiError, postJson } from "../lib/apiJson";

type Row = {
  categoryId: number | null;
  category: string;
  products: number;
  pieces: number;
  costValue: number;
  saleValue: number;
  profit: number;
};
type StockValueData = { totals: Omit<Row, "categoryId" | "category">; byCategory: Row[] };

const rs = (n: number) =>
  `Rs ${n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/** Value of current stock: what it cost, what it sells for, and the profit in between.
 *  Hidden behind a static password; locks again when the page is left or "Hide" is pressed. */
export default function StockValue() {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<StockValueData | null>(null);

  const unlock = async () => {
    if (!password) {
      setErr("Enter the password.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const d = await postJson<StockValueData>("/api/products/stock-value", { password });
      setData(d);
      setAsking(false);
      setPassword("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load stock value.");
    } finally {
      setLoading(false);
    }
  };

  const lock = () => {
    setData(null);
    setOpen(false);
  };

  if (!data) {
    return (
      <div className="stock-value stock-value-locked">
        {!asking ? (
          <button type="button" className="btn btn-outline" onClick={() => setAsking(true)}>
            🔒 Show total stock value
          </button>
        ) : (
          <form
            className="stock-value-unlock"
            onSubmit={(e) => {
              e.preventDefault();
              void unlock();
            }}
          >
            <input
              type="password"
              autoFocus
              placeholder="Stock value password"
              aria-label="Stock value password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" className="btn" disabled={loading}>
              {loading ? "Checking…" : "Show"}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setAsking(false);
                setPassword("");
                setErr(null);
              }}
            >
              Cancel
            </button>
            {err && <span className="stock-value-err">{err}</span>}
          </form>
        )}
      </div>
    );
  }
  const t = data.totals;
  const margin = t.saleValue > 0 ? (t.profit / t.saleValue) * 100 : 0;

  return (
    <div className="stock-value">
      <div className="stock-value-cards">
        <div className="sv-card">
          <div className="sv-label">Stock cost (purchase price)</div>
          <div className="sv-value">{rs(t.costValue)}</div>
        </div>
        <div className="sv-card">
          <div className="sv-label">Stock sale value</div>
          <div className="sv-value">{rs(t.saleValue)}</div>
        </div>
        <div className="sv-card">
          <div className="sv-label">Expected profit</div>
          <div className="sv-value">{rs(t.profit)}</div>
          <div className="sv-sub">{margin.toFixed(1)}% of sale value</div>
        </div>
        <div className="sv-card">
          <div className="sv-label">Products in stock</div>
          <div className="sv-value">{t.products.toLocaleString("en-PK")}</div>
          <div className="sv-sub">{t.pieces.toLocaleString("en-PK", { maximumFractionDigits: 3 })} pieces</div>
        </div>
      </div>
      <button type="button" className="chart-link" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide by category" : "Show by category"}
      </button>
      <button type="button" className="chart-link" style={{ marginLeft: 16 }} onClick={lock}>
        🔒 Hide stock value
      </button>
      {open && (
        <table className="table chart-table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Products</th>
              <th className="num">Pieces</th>
              <th className="num">Stock cost</th>
              <th className="num">Sale value</th>
              <th className="num">Expected profit</th>
            </tr>
          </thead>
          <tbody>
            {data.byCategory.map((r) => (
              <tr key={r.categoryId ?? "none"}>
                <td>{r.category}</td>
                <td className="num">{r.products}</td>
                <td className="num">{r.pieces.toLocaleString("en-PK", { maximumFractionDigits: 3 })}</td>
                <td className="num">{r.costValue.toFixed(2)}</td>
                <td className="num">{r.saleValue.toFixed(2)}</td>
                <td className="num">{r.profit.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
