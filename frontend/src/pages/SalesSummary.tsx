import { useState } from "react";
import { StatusLine } from "../components/StatusLine";
import { useSalesSummaryQuery } from "../hooks/queries";
import { downloadCsv } from "../lib/csvExport";
import { ApiError } from "../lib/apiJson";
import { storeTodayYmd, storeYmdDaysAgo } from "../lib/time";
import SalesCharts from "../components/SalesCharts";

const todayISO = storeTodayYmd;

export default function SalesSummary() {
    const [from, setFrom] = useState(todayISO());
    const [to, setTo] = useState(todayISO());
    const [activeRange, setActiveRange] = useState({ from: todayISO(), to: todayISO() });

    const { data, isLoading, error, refetch, isFetching } = useSalesSummaryQuery(
        activeRange.from,
        activeRange.to
    );

    const err =
        error instanceof ApiError
            ? error.message
            : error
              ? "Failed to load summary."
              : null;
    const loading = isLoading || isFetching;

    const Card = ({ label, value }: { label: string; value: string }) => (
        <div
            style={{
                border: "1px solid #e0e0e0",
                borderRadius: 10,
                padding: 16,
                minWidth: 220,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
        >
            <div style={{ fontSize: 12, color: "#666", textTransform: "uppercase", marginBottom: 6 }}>
                {label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
        </div>
    );

    return (
        <div>
            <h2>Sales Summary</h2>
            <p style={{ color: "#666", marginTop: -6 }}>
                Select a date range to view total sales, profit, margin, and invoice count.
            </p>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    setActiveRange({ from, to });
                    void refetch();
                }}
                style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginBottom: 14 }}
            >
                <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "#555" }}>From</span>
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "#555" }}>To</span>
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </label>

                <button type="submit" disabled={loading}>
                    {loading ? "Loading…" : "Get Summary"}
                </button>

                <div className="range-presets">
                    {[
                        { label: "Today", from: storeTodayYmd(), to: storeTodayYmd() },
                        { label: "Last 7 days", from: storeYmdDaysAgo(6), to: storeTodayYmd() },
                        { label: "Last 30 days", from: storeYmdDaysAgo(29), to: storeTodayYmd() },
                        { label: "This month", from: storeTodayYmd().slice(0, 8) + "01", to: storeTodayYmd() },
                        { label: "Last 12 months", from: storeYmdDaysAgo(364), to: storeTodayYmd() },
                    ].map((p) => (
                        <button
                            key={p.label}
                            type="button"
                            className={activeRange.from === p.from && activeRange.to === p.to ? "preset-active" : undefined}
                            onClick={() => {
                                setFrom(p.from);
                                setTo(p.to);
                                setActiveRange({ from: p.from, to: p.to });
                            }}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                <button type="button" onClick={() => window.print()} disabled={!data} title="Print this summary">
                    Print
                </button>

                <button
                    type="button"
                    disabled={!data}
                    onClick={() => {
                        if (!data) return;
                        downloadCsv(
                            `sales-summary-${data.from}-${data.to}.csv`,
                            ["Metric", "Value"],
                            [
                                ["From", data.from],
                                ["To", data.to],
                                ["Invoices", String(data.invoices)],
                                ["Total Sales", data.totalSales.toFixed(2)],
                                ["Total Cost", data.totalCost.toFixed(2)],
                                ["Profit", data.profit.toFixed(2)],
                                ["Profit Margin %", data.profitMargin.toFixed(2)],
                            ]
                        );
                    }}
                >
                    Export CSV
                </button>
            </form>

            {err && <StatusLine variant="error">{err}</StatusLine>}

            {data && (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <Card label="Invoices" value={String(data.invoices)} />
                    <Card label="Total Sales" value={data.totalSales.toFixed(2)} />
                    <Card label="Total Cost" value={data.totalCost.toFixed(2)} />
                    <Card label="Profit" value={data.profit.toFixed(2)} />
                    <Card label="Profit Margin" value={`${data.profitMargin.toFixed(2)}%`} />
                </div>
            )}

            {data && <SalesCharts from={activeRange.from} to={activeRange.to} />}

            {!loading && !data && !err && (
                <div style={{ color: "#777", marginTop: 8 }}>
                    Choose a date range and press <b>Get Summary</b>.
                </div>
            )}
        </div>
    );
}
