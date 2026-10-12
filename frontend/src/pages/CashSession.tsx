import { useState } from "react";
import { Link } from "react-router-dom";
import { StatusLine } from "../components/StatusLine";
import { ApiError, getJson } from "../lib/apiJson";
import { useAuth } from "../store/auth";
import {
  useCashSessionCurrentQuery,
  useCashSessionHistoryQuery,
  useCloseCashSessionMutation,
  useOpenCashSessionMutation,
} from "../hooks/queries";

type ZReport = {
  session: {
    id: number;
    userId: number;
    userEmail: string;
    openedAt: string;
    closedAt: string | null;
    openingFloat: string;
    closingCash: string | null;
    isOpen: boolean;
  };
  saleCount: number;
  voidCount: number;
  grossSales: string;
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  cashTendered: string;
  changeGiven: string;
  expectedCash: string;
  variance: string | null;
};

function fmtMoney(v: string | number) {
  return Number(v).toFixed(2);
}

function fmtRs(v: string | number, opts?: { showPlus?: boolean }) {
  const n = Number(v);
  const plus = opts?.showPlus && n > 0 ? "+" : "";
  return `${plus}Rs. ${fmtMoney(v)}`;
}

function fmtDt(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function CashSessionPage() {
  const isManager = useAuth((s) => s.isManager());
  const [err, setErr] = useState<string | null>(null);
  const [openingFloat, setOpeningFloat] = useState("0.00");
  const [closingCash, setClosingCash] = useState("");
  const [closedReport, setClosedReport] = useState<ZReport | null>(null);

  const {
    data: currentData,
    isLoading: currentLoading,
    refetch: refetchCurrent,
  } = useCashSessionCurrentQuery();
  const { data: history = [], refetch: refetchHistory } =
    useCashSessionHistoryQuery(15);

  const openMutation = useOpenCashSessionMutation();
  const closeMutation = useCloseCashSessionMutation();

  const zReport = (currentData?.zReport as ZReport | null) ?? null;
  const loading = currentLoading;
  const busy = openMutation.isPending || closeMutation.isPending;

  const openSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setClosedReport(null);
    try {
      await openMutation.mutateAsync(openingFloat);
      setClosingCash("");
      await refetchHistory();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to open session");
    }
  };

  const closeSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zReport?.session.id) return;
    setErr(null);
    try {
      const result = await closeMutation.mutateAsync({
        sessionId: zReport.session.id,
        closingCash,
      });
      setClosedReport(result.zReport as ZReport);
      setClosingCash("");
      await refetchHistory();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to close session");
    }
  };

  const viewZReport = async (sessionId: number) => {
    setErr(null);
    try {
      const data = await getJson<ZReport>(
        `/api/cash-sessions/${sessionId}/z-report`
      );
      setClosedReport(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to load Z-report");
    }
  };

  const report = closedReport ?? zReport;
  const isOpen = zReport?.session.isOpen === true;

  const varianceNum =
    report?.variance != null ? Number(report.variance) : null;
  const varianceClass =
    varianceNum == null
      ? ""
      : varianceNum === 0
        ? "z-variance-ok"
        : Math.abs(varianceNum) < 1
          ? "z-variance-warn"
          : "z-variance-bad";

  return (
    <div className="cash-session-page">
      <h2>Cash Session &amp; Z-Report</h2>
      <p className="cash-session-lead">
        Open a shift with your opening float, ring sales (they attach to your open
        session), then close with a counted cash total to see expected vs actual.
      </p>

      {err && <StatusLine variant="error">{err}</StatusLine>}

      {loading && <p>Loading…</p>}

      {!loading && !isOpen && (
        <section className="cash-session-card">
          <h3>Open shift</h3>
          <form onSubmit={openSession} className="cash-session-form">
            <label>
              <span>Opening float (Rs.)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? "Opening…" : "Open cash session"}
            </button>
          </form>
          <p className="cash-session-hint">
            No open session. Sales will not be tied to a shift until you open one.
            <Link to="/"> Go to Checkout</Link>
          </p>
        </section>
      )}

      {!loading && isOpen && zReport && (
        <section className="cash-session-card">
          <h3>Shift open</h3>
          <div className="cash-session-meta">
            <span>Session #{zReport.session.id}</span>
            <span>Opened {fmtDt(zReport.session.openedAt)}</span>
            <span>Float {fmtRs(zReport.session.openingFloat)}</span>
          </div>

          <div className="z-report-grid">
            <ZCard label="Sales" value={String(zReport.saleCount)} />
            <ZCard label="Gross sales" value={fmtRs(zReport.grossSales)} />
            <ZCard
              label="Expected in drawer"
              value={fmtRs(zReport.expectedCash)}
              highlight
            />
          </div>

          <form onSubmit={closeSession} className="cash-session-form cash-session-close">
            <label>
              <span>Counted cash at close (Rs.)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                placeholder={zReport.expectedCash}
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? "Closing…" : "Close shift & run Z-report"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void refetchCurrent()}
              disabled={busy}
            >
              Refresh totals
            </button>
          </form>
        </section>
      )}

      {report && (closedReport || isOpen) && (
        <section
          className={`cash-session-card z-report-print ${closedReport ? "z-report-final" : ""}`}
        >
          <div className="z-report-header">
            <h3>{closedReport ? "Z-Report (closed)" : "Live session totals"}</h3>
            {closedReport && (
              <button type="button" onClick={() => window.print()}>
                Print Z-report
              </button>
            )}
          </div>

          <table className="z-report-table">
            <tbody>
              <tr>
                <td>Cashier</td>
                <td>{report.session.userEmail}</td>
              </tr>
              <tr>
                <td>Opened</td>
                <td>{fmtDt(report.session.openedAt)}</td>
              </tr>
              {report.session.closedAt && (
                <tr>
                  <td>Closed</td>
                  <td>{fmtDt(report.session.closedAt)}</td>
                </tr>
              )}
              <tr>
                <td>Opening float</td>
                <td>{fmtRs(report.session.openingFloat)}</td>
              </tr>
              <tr>
                <td>Sale count</td>
                <td>{report.saleCount}</td>
              </tr>
              {report.voidCount > 0 && (
                <tr>
                  <td>Voided sales</td>
                  <td>{report.voidCount}</td>
                </tr>
              )}
              <tr>
                <td>Subtotal (after discount)</td>
                <td>{fmtRs(report.subtotal)}</td>
              </tr>
              <tr>
                <td>Discounts</td>
                <td>{fmtRs(report.discountTotal)}</td>
              </tr>
              <tr>
                <td>Tax</td>
                <td>{fmtRs(report.taxTotal)}</td>
              </tr>
              <tr>
                <td>Gross sales (cash in)</td>
                <td>{fmtRs(report.grossSales)}</td>
              </tr>
              <tr>
                <td>Cash tendered</td>
                <td>{fmtRs(report.cashTendered)}</td>
              </tr>
              <tr>
                <td>Change given</td>
                <td>{fmtRs(report.changeGiven)}</td>
              </tr>
              <tr className="z-row-emphasis">
                <td>Expected cash in drawer</td>
                <td>{fmtRs(report.expectedCash)}</td>
              </tr>
              {report.session.closingCash != null && (
                <tr>
                  <td>Counted cash</td>
                  <td>{fmtRs(report.session.closingCash)}</td>
                </tr>
              )}
              {report.variance != null && (
                <tr className={`z-row-emphasis ${varianceClass}`}>
                  <td>Variance (counted − expected)</td>
                  <td>{fmtRs(report.variance, { showPlus: true })}</td>
                </tr>
              )}
            </tbody>
          </table>

          {closedReport && (
            <p className="cash-session-hint">
              <Link to="/">Return to Checkout</Link> to start a new shift.
            </p>
          )}
        </section>
      )}

      {!loading && history.length > 0 && (
        <section className="cash-session-card">
          <h3>Recent sessions{isManager ? " (all users)" : ""}</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                {isManager && <th>Cashier</th>}
                <th>Opened</th>
                <th>Closed</th>
                <th>Float</th>
                <th>Counted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  {isManager && <td>{row.user.email}</td>}
                  <td>{fmtDt(row.openedAt)}</td>
                  <td>{row.closedAt ? fmtDt(row.closedAt) : "—"}</td>
                  <td>{fmtRs(row.openingFloat)}</td>
                  <td>
                    {row.closingCash != null ? fmtRs(row.closingCash) : "—"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => void viewZReport(row.id)}
                      disabled={busy}
                    >
                      Z-report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function ZCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`z-card ${highlight ? "z-card-highlight" : ""}`}>
      <div className="z-card-label">{label}</div>
      <div className="z-card-value">{value}</div>
    </div>
  );
}
