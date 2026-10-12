import { useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../store/auth";
import {
  STORE_ADDRESS,
  STORE_NAME,
  STORE_PHONE,
  STORE_STRN,
} from "../lib/storeConfig";
import {
  VoidSaleConfirm,
  VoidSaleFeedback,
  useVoidSaleFlow,
} from "../components/VoidSaleConfirm";
import { useSaleQuery } from "../hooks/queries";

const DEV_TALKS_URL = "https://thedevtalks.com";
const DEV_TALKS_PHONE = "0335 877 8566";

function money(value: string | number) {
  return Number(value).toFixed(1);
}

export default function SaleInvoice() {
  const { id } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { pendingVoidId, feedback, setFeedback, requestVoid, cancelVoid } =
    useVoidSaleFlow();
  const isManager = useAuth((s) => s.isManager());

  const { data: sale, isLoading, refetch } = useSaleQuery(id);

  useEffect(() => {
    const state = location.state as { autoPrint?: boolean } | null;
    const shouldPrint =
      searchParams.get("print") === "1" || state?.autoPrint === true;
    if (!isLoading && sale && shouldPrint) {
      const t = window.setTimeout(() => window.print(), 300);
      return () => window.clearTimeout(t);
    }
  }, [isLoading, sale, location.state, searchParams]);

  if (isLoading)
    return <div style={{ textAlign: "center", marginTop: 40 }}>Loading...</div>;
  if (!sale)
    return (
      <div style={{ textAlign: "center", marginTop: 40 }}>Sale not found</div>
    );

  const date = new Date(sale.createdAt as string).toLocaleString();
  const isVoided = !!sale.voidedAt;
  const items = sale.items as Array<{
    qty: string;
    unitPrice: string;
    lineTotal: string;
    product?: { name?: string };
  }>;
  const totalQty = items.reduce((sum, it) => sum + Number(it.qty || 0), 0);
  const paidCash = Number(sale.paidCash || 0);
  const paymentMode = paidCash > 0 ? "CASH" : "DEFAULT";

  return (
    <div className="invoice-container">
      <VoidSaleFeedback feedback={feedback} className="invoice-status-line" />
      {pendingVoidId != null && sale?.id === pendingVoidId && (
        <VoidSaleConfirm
          className="invoice-status-line"
          saleId={sale.id as number}
          label={sale.invoiceCode as string}
          onCancel={cancelVoid}
          onSuccess={() => {
            cancelVoid();
            void refetch();
          }}
          onFeedback={setFeedback}
        />
      )}
      <div className={`invoice-paper ${isVoided ? "invoice-voided" : ""}`}>
        <header className="invoice-header">
          <h2 className="store-name">{STORE_NAME}</h2>
          <p className="store-line">{STORE_ADDRESS}</p>
          <p className="store-line">Mobile # {STORE_PHONE}</p>
          <p className="store-line">STRN # {STORE_STRN}</p>
          {isVoided && (
            <p className="void-banner">
              VOIDED — {new Date(sale.voidedAt as string).toLocaleString()}
            </p>
          )}
        </header>

        <div className="section-rule" />

        <div className="meta">
          <div className="meta-row">
            <span className="meta-label">Invoice #</span>
            <span className="meta-value mono">{sale.invoiceCode as string}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Date / Time</span>
            <span className="meta-value">{date}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">Payment</span>
            <span className="meta-value">{paymentMode}</span>
          </div>
          {isVoided && sale.voidedBy && (
            <div className="meta-row">
              <span className="meta-label">Voided by</span>
              <span className="meta-value">
                {(sale.voidedBy as { email: string }).email}
              </span>
            </div>
          )}
        </div>

        <table className="items">
          <colgroup>
            <col className="col-num" />
            <col className="col-item" />
            <col className="col-qty" />
            <col className="col-price" />
            <col className="col-total" />
          </colgroup>
          <thead>
            <tr>
              <th className="col-num">#</th>
              <th className="col-item">Item</th>
              <th className="col-qty">Qty</th>
              <th className="col-price">Price</th>
              <th className="col-total">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="col-num">{i + 1}</td>
                <td className="col-item">{it.product?.name ?? "Unknown"}</td>
                <td className="col-qty">{+it.qty}</td>
                <td className="col-price">{money(it.unitPrice)}</td>
                <td className="col-total">{money(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="totals">
          <tbody>
            <tr>
              <td>Total Qty</td>
              <td className="mono">{totalQty}</td>
            </tr>
            <tr>
              <td>Subtotal</td>
              <td className="mono">{money(sale.subtotal as string)}</td>
            </tr>
            {+(sale.discountValue as string) > 0 && (
              <tr>
                <td>Discount</td>
                <td className="mono">-{money(sale.discountValue as string)}</td>
              </tr>
            )}
            {+(sale.taxTotal as string) > 0 && (
              <tr>
                <td>Sales Tax</td>
                <td className="mono">{money(sale.taxTotal as string)}</td>
              </tr>
            )}
            <tr className="grand">
              <td>Payable</td>
              <td className="mono">{money(sale.total as string)}</td>
            </tr>
            {paidCash > 0 && (
              <>
                <tr>
                  <td>Cash</td>
                  <td className="mono">{money(sale.paidCash as string)}</td>
                </tr>
                <tr>
                  <td>Change</td>
                  <td className="mono">{money(sale.changeDue as string)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>

        {!isVoided && (
          <footer className="invoice-footer">
            <p className="thankyou">Thanks for visiting us.</p>
            <p className="doctor-line">Dr. Sair Ahmad Tabraiz</p>
            <div className="qr-block">
              <QRCodeSVG
                value={DEV_TALKS_URL}
                size={88}
                level="M"
                marginSize={1}
                bgColor="#ffffff"
                fgColor="#000000"
                className="invoice-qr"
              />
              <p className="qr-caption">Scan for more info</p>
            </div>
            <p className="credit-line">
              Software by TheDevTalks · {DEV_TALKS_PHONE}
              <br />
              <span className="credit-url">
                {DEV_TALKS_URL.replace(/^https?:\/\//, "")}
              </span>
            </p>
          </footer>
        )}

        <div className="invoice-actions">
          <button type="button" onClick={() => window.print()}>
            🖨️ Print
          </button>
          {isManager && !isVoided && pendingVoidId !== sale.id && (
            <button
              type="button"
              className="void-btn"
              onClick={() => requestVoid(sale.id as number)}
            >
              Void sale
            </button>
          )}
        </div>
      </div>

      <style>{`
        .invoice-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 24px 16px;
          background: #e5e7eb;
          min-height: 100vh;
          box-sizing: border-box;
        }

        .invoice-paper {
          width: 80mm;
          max-width: 100%;
          box-sizing: border-box;
          background: #fff;
          padding: 10px 8px 12px;
          font-family: Arial, Helvetica, "Segoe UI", sans-serif;
          font-size: 12px;
          line-height: 1.35;
          color: #000;
          border: 1.5px solid #000;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.14);
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .invoice-voided {
          opacity: 0.92;
          border-style: dashed;
          border-color: #b91c1c;
        }

        .invoice-header {
          text-align: center;
        }

        .store-name {
          margin: 0 0 6px;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 0.02em;
          text-transform: none;
          line-height: 1.2;
          word-break: break-word;
        }

        .store-line {
          margin: 2px 0;
          font-size: 10px;
          font-weight: 600;
          line-height: 1.35;
        }

        .section-rule {
          border: none;
          border-top: 1.5px solid #000;
          margin: 8px 0;
        }

        .void-banner {
          margin: 8px 0 0;
          padding: 4px 6px;
          color: #b91c1c;
          font-weight: 800;
          font-size: 11px;
          border: 1.5px solid #b91c1c;
        }

        .meta {
          text-align: left;
          margin: 0 0 8px;
        }

        .meta-row {
          display: grid;
          grid-template-columns: 78px 1fr;
          gap: 4px;
          align-items: start;
          margin: 2px 0;
          font-size: 11px;
        }

        .meta-label {
          font-weight: 700;
        }

        .meta-value {
          font-weight: 600;
          word-break: break-all;
          line-height: 1.3;
          text-align: left;
        }

        .mono {
          font-family: "Consolas", "Courier New", Courier, monospace;
          font-variant-numeric: tabular-nums;
        }

        .invoice-paper table {
          width: 100%;
          border-collapse: collapse;
          margin: 0;
          background: transparent;
          table-layout: fixed;
        }

        .invoice-paper thead {
          background: transparent;
        }

        .invoice-paper tbody tr:hover {
          background: transparent;
        }

        .invoice-paper th,
        .invoice-paper td {
          background: transparent;
          color: #000;
          vertical-align: top;
        }

        .invoice-paper .items {
          margin-top: 0;
          border: 1.5px solid #000 !important;
        }

        .invoice-paper .items th,
        .invoice-paper .items td {
          border: 1.5px solid #000 !important;
          padding: 5px 3px;
        }

        .invoice-paper .items th {
          font-weight: 800;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .invoice-paper .items td {
          font-size: 11px;
          font-weight: 600;
        }

        .invoice-paper .col-num {
          width: 10%;
          text-align: center;
        }

        .invoice-paper .col-item {
          width: 40%;
          text-align: left;
          word-break: break-word;
          hyphens: auto;
        }

        .invoice-paper .col-qty {
          width: 12%;
          text-align: center;
        }

        .invoice-paper .col-price {
          width: 19%;
          text-align: right;
          white-space: nowrap;
          font-family: "Consolas", "Courier New", Courier, monospace;
        }

        .invoice-paper .col-total {
          width: 19%;
          text-align: right;
          white-space: nowrap;
          font-family: "Consolas", "Courier New", Courier, monospace;
          font-weight: 700;
        }

        .invoice-paper .totals {
          margin-top: 8px;
          border: 1.5px solid #000 !important;
        }

        .invoice-paper .totals td {
          padding: 4px 6px;
          font-size: 12px;
          border: none !important;
        }

        .invoice-paper .totals td:first-child {
          text-align: left;
          font-weight: 700;
        }

        .invoice-paper .totals td:last-child {
          text-align: right;
          white-space: nowrap;
          font-weight: 700;
        }

        .invoice-paper .totals .grand td {
          font-weight: 800;
          font-size: 13px;
          border-top: 1.5px solid #000 !important;
          padding-top: 6px;
          padding-bottom: 6px;
        }

        .invoice-footer {
          text-align: center;
          margin-top: 10px;
          border-top: 1.5px solid #000;
          padding-top: 8px;
        }

        .thankyou {
          margin: 0 0 3px;
          font-size: 12px;
          font-weight: 800;
        }

        .doctor-line {
          margin: 0 0 8px;
          font-size: 11px;
          font-weight: 700;
        }

        .qr-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          margin: 0 0 8px;
        }

        .invoice-qr {
          display: block;
          width: 88px;
          height: 88px;
        }

        .qr-caption {
          margin: 0;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .credit-line {
          margin: 0;
          font-size: 9px;
          line-height: 1.4;
          font-weight: 600;
        }

        .credit-url {
          font-weight: 800;
        }

        .invoice-actions {
          display: flex;
          gap: 8px;
          justify-content: center;
          flex-wrap: wrap;
          margin-top: 14px;
          padding-top: 10px;
          border-top: 1px dashed #9ca3af;
        }

        .invoice-actions button {
          cursor: pointer;
        }

        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }

          html,
          body,
          #root,
          .app-shell {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 80mm;
            max-width: 80mm;
          }

          .invoice-container {
            display: block;
            padding: 0;
            margin: 0;
            min-height: 0;
            background: #fff;
            width: 80mm;
          }

          .invoice-status-line,
          .invoice-actions,
          button {
            display: none !important;
          }

          .invoice-paper {
            width: 80mm;
            max-width: 80mm;
            margin: 0;
            padding: 6px 5px 8px;
            box-shadow: none;
            border: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .invoice-qr {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}
