import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,

  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSalesChartsQuery, type SalesChartsData } from "../hooks/queries";

// Chart roles (validated categorical pair: sales = slot 1, profit = slot 2).
const C = {
  sales: "#2a78d6",
  profit: "#eb6834",
  text: "#0b0b0b",
  textMuted: "#52514e",
  grid: "#e7e6e2",
  surface: "#fcfcfb",
};

const money = (n: number) =>
  `Rs ${n.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
const compact = (n: number) =>
  Math.abs(n) >= 1000 ? `${Math.round(n / 1000).toLocaleString("en-PK")}k` : String(Math.round(n));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function bucketLabel(key: string, granularity: SalesChartsData["granularity"]) {
  const [y, m, d] = key.split("-").map(Number);
  return granularity === "month" ? `${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`;
}
const hourLabel = (h: number) => {
  const suffix = h < 12 ? "am" : "pm";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${suffix}`;
};

type TipProps = {
  active?: boolean;
  label?: string | number;
  payload?: { name: string; value: number; color: string; payload: Record<string, number> }[];
};

function TrendTooltip({ active, label, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as unknown as { invoices: number; cost: number; sales: number; profit: number };
  const margin = row.sales > 0 ? (row.profit / row.sales) * 100 : 0;
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{label}</div>
      <div className="chart-tip-row">
        <span>Sales</span>
        <b>{money(row.sales)}</b>
      </div>
      {[...payload].reverse().map((p) => (
        <div key={p.name} className="chart-tip-row">
          <span className="chart-tip-key" style={{ background: p.color }} />
          <span>{p.name}</span>
          <b>{money(p.value)}</b>
        </div>
      ))}
      <div className="chart-tip-muted">
        Margin {margin.toFixed(1)}% · {row.invoices} invoices
      </div>
    </div>
  );
}

function SimpleTooltip({ active, label, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Record<string, number | string>;
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{label}</div>
      <div className="chart-tip-row">
        <span>{payload[0].name}</span>
        <b>{money(payload[0].value)}</b>
      </div>
      {"invoices" in row && <div className="chart-tip-muted">{row.invoices} invoices</div>}
      {"qty" in row && (
        <div className="chart-tip-muted">
          {row.qty} sold · Sales {money(Number(row.sales))}
        </div>
      )}
    </div>
  );
}

const axisTick = { fill: C.textMuted, fontSize: 12 };

export default function SalesCharts({ from, to }: { from: string; to: string }) {
  const { data, isLoading, error } = useSalesChartsQuery(from, to);
  const [showTable, setShowTable] = useState(false);

  if (isLoading) return <div className="charts-note">Loading graphs…</div>;
  if (error || !data) return <div className="charts-note">Could not load graphs.</div>;

  const trend = data.series.map((r) => ({ ...r, label: bucketLabel(r.key, data.granularity) }));
  const hourly = data.hourly
    .filter((h, i, arr) => {
      // trim empty hours at the start/end of the day (shop closed)
      const first = arr.findIndex((x) => x.invoices > 0);
      const last = arr.length - 1 - [...arr].reverse().findIndex((x) => x.invoices > 0);
      return first >= 0 && i >= first && i <= last;
    })
    .map((h) => ({ ...h, label: hourLabel(h.hour) }));
  const top = data.topProducts.map((p) => ({
    ...p,
    short: p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name,
  }));
  const hasSales = data.series.some((r) => r.invoices > 0);
  const per = data.granularity === "month" ? "month" : "day";

  if (!hasSales) return <div className="charts-note">No sales in this period.</div>;

  return (
    <div className="sales-charts">
      <section className="chart-card">
        <div className="chart-head">
          <h3>Sales per {per} (cost + profit)</h3>
          <button type="button" className="chart-link" onClick={() => setShowTable((v) => !v)}>
            {showTable ? "Hide table" : "Show table"}
          </button>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: C.grid }} minTickGap={12} />
            <YAxis tick={axisTick} tickFormatter={compact} tickLine={false} axisLine={false} width={44} />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
            <Legend iconType="square" wrapperStyle={{ fontSize: 13, color: C.text }} />
            {/* Stacked: cost + profit = sales (bar height). 2px surface gap between segments. */}
            <Bar dataKey="cost" name="Cost" stackId="s" fill={C.sales} stroke={C.surface} strokeWidth={1} maxBarSize={36} />
            <Bar dataKey="profit" name="Profit" stackId="s" fill={C.profit} stroke={C.surface} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </ComposedChart>
        </ResponsiveContainer>

        {showTable && (
          <table className="table chart-table">
            <thead>
              <tr>
                <th>{data.granularity === "month" ? "Month" : "Date"}</th>
                <th className="num">Invoices</th>
                <th className="num">Sales</th>
                <th className="num">Cost</th>
                <th className="num">Profit</th>
                <th className="num">Margin</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="num">{r.invoices}</td>
                  <td className="num">{r.sales.toFixed(2)}</td>
                  <td className="num">{r.cost.toFixed(2)}</td>
                  <td className="num">{r.profit.toFixed(2)}</td>
                  <td className="num">{r.sales > 0 ? ((r.profit / r.sales) * 100).toFixed(1) : "0.0"}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="chart-grid-2">
        <section className="chart-card">
          <h3>Top 10 products by profit</h3>
          <ResponsiveContainer width="100%" height={Math.max(160, top.length * 30 + 20)}>
            <BarChart data={top} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={C.grid} horizontal={false} />
              <XAxis type="number" tick={axisTick} tickFormatter={compact} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="short" tick={axisTick} tickLine={false} axisLine={false} width={150} />
              <Tooltip content={<SimpleTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="profit" name="Profit" fill={C.sales} radius={[0, 4, 4, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="chart-card">
          <h3>Sales by hour of day</h3>
          <ResponsiveContainer width="100%" height={Math.max(160, top.length * 30 + 20)}>
            <BarChart data={hourly} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: C.grid }} interval="preserveStartEnd" />
              <YAxis tick={axisTick} tickFormatter={compact} tickLine={false} axisLine={false} width={44} />
              <Tooltip content={<SimpleTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="sales" name="Sales" fill={C.sales} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
    </div>
  );
}
