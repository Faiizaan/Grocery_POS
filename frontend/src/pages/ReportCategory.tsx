import { storeTodayYmd, storeYmdDaysAgo } from "../lib/time";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useCategoryReportQuery } from "../hooks/queries";
import { downloadCsv } from "../lib/csvExport";
import { ApiError } from "../lib/apiJson";

const todayYmd = storeTodayYmd;

export default function ReportCategory() {
    const [from, setFrom] = useState(todayYmd());
    const [to, setTo] = useState(todayYmd());
    const [activeRange, setActiveRange] = useState<{ from: string; to: string } | null>(null);

    const { data, isLoading, error } = useCategoryReportQuery(
        activeRange?.from ?? "",
        activeRange?.to ?? "",
        activeRange != null
    );
    const rows = data?.rows ?? [];

    const run = () => {
        const f = from.trim() || todayYmd();
        const t = to.trim() || todayYmd();
        setActiveRange({ from: f, to: t });
    };
    const preset = (f: string, t: string) => {
        setFrom(f);
        setTo(t);
        setActiveRange({ from: f, to: t });
    };
    const total = rows.reduce(
        (a, r) => ({
            qty: a.qty + r.qty,
            revenue: a.revenue + r.revenue,
            tax: a.tax + r.tax,
            cost: a.cost + (r.cost ?? 0),
            profit: a.profit + (r.profit ?? 0),
        }),
        { qty: 0, revenue: 0, tax: 0, cost: 0, profit: 0 }
    );
    const totalNet = total.revenue - total.tax;

    const err =
        error instanceof ApiError
            ? error.message
            : error
              ? "Failed to load report"
              : null;

    return (
        <div>
            <h2>Category-wise Report</h2>
            <p style={{ color: "#666", marginTop: -6 }}>
                Sales grouped by product category (voided sales excluded).
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <label>
                    From{" "}
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
                </label>
                <label>
                    To{" "}
                    <input type="date" value={to} onChange={e => setTo(e.target.value)} />
                </label>
                <button type="button" onClick={run} disabled={isLoading}>
                    {isLoading ? "Loading…" : "Run"}
                </button>
                <button type="button" onClick={() => preset(todayYmd(), todayYmd())}>Today</button>
                <button type="button" onClick={() => preset(storeYmdDaysAgo(6), todayYmd())}>Last 7 days</button>
                <button type="button" onClick={() => preset(todayYmd().slice(0, 8) + "01", todayYmd())}>This month</button>
                <button type="button" onClick={() => preset(storeYmdDaysAgo(29), todayYmd())}>Last 30 days</button>
                {rows.length > 0 && activeRange && (
                    <button
                        type="button"
                        onClick={() =>
                            downloadCsv(
                                `category-report-${activeRange.from}-${activeRange.to}.csv`,
                                ["Category", "Qty", "Revenue", "Tax", "Cost", "Profit", "Margin %"],
                                rows.map((r) => [
                                    r.category,
                                    r.qty.toFixed(3),
                                    r.revenue.toFixed(2),
                                    r.tax.toFixed(2),
                                    (r.cost ?? 0).toFixed(2),
                                    (r.profit ?? 0).toFixed(2),
                                    (r.margin ?? 0).toFixed(2),
                                ])
                            )
                        }
                    >
                        Export CSV
                    </button>
                )}
            </div>
            {activeRange && data && (
                <p style={{ fontSize: 14, color: "#666" }}>
                    Period: {data.from} to {data.to}
                </p>
            )}
            {err && <p style={{ color: "#c00" }}>{err}</p>}
            <table border={1} cellPadding={6} style={{ width: '100%' }}>
                <thead><tr><th>Category</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Revenue</th><th style={{ textAlign: 'right' }}>Tax</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>Profit</th><th style={{ textAlign: 'right' }}>Margin</th></tr></thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i}>
                            <td>
                                {r.categoryId != null ? (
                                    <Link to={`/categories/${r.categoryId}`}>{r.category}</Link>
                                ) : (
                                    r.category
                                )}
                            </td>
                            <td style={{ textAlign: 'right' }}>{r.qty.toFixed(3)}</td>
                            <td style={{ textAlign: 'right' }}>{r.revenue.toFixed(2)}</td>
                            <td style={{ textAlign: 'right' }}>{r.tax.toFixed(2)}</td>
                            <td style={{ textAlign: 'right' }}>{(r.cost ?? 0).toFixed(2)}</td>
                            <td style={{ textAlign: 'right' }}>{(r.profit ?? 0).toFixed(2)}</td>
                            <td style={{ textAlign: 'right' }}>{(r.margin ?? 0).toFixed(1)}%</td>
                        </tr>
                    ))}
                    {rows.length === 0 && !isLoading && activeRange && !err && (
                        <tr><td colSpan={7} style={{ textAlign: 'center' }}>No sales in this period</td></tr>
                    )}
                    {!activeRange && (
                        <tr><td colSpan={7} style={{ textAlign: 'center', color: '#777' }}>Select dates and click Run</td></tr>
                    )}
                </tbody>
                {rows.length > 0 && (
                    <tfoot>
                        <tr>
                            <th style={{ textAlign: 'left' }}>Total</th>
                            <th style={{ textAlign: 'right' }}>{total.qty.toFixed(3)}</th>
                            <th style={{ textAlign: 'right' }}>{total.revenue.toFixed(2)}</th>
                            <th style={{ textAlign: 'right' }}>{total.tax.toFixed(2)}</th>
                            <th style={{ textAlign: 'right' }}>{total.cost.toFixed(2)}</th>
                            <th style={{ textAlign: 'right' }}>{total.profit.toFixed(2)}</th>
                            <th style={{ textAlign: 'right' }}>
                                {totalNet > 0 ? ((total.profit / totalNet) * 100).toFixed(1) : '0.0'}%
                            </th>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}
