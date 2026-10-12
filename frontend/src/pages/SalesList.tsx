import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { StatusLine } from '../components/StatusLine';
import {
    VoidSaleConfirm,
    VoidSaleFeedback,
    useVoidSaleFlow,
} from '../components/VoidSaleConfirm';
import { useSalesListQuery, type SalesListRow } from '../hooks/queries';
import { ApiError } from '../lib/apiJson';

const PAGE_SIZE_OPTIONS = [20, 30] as const;

export default function SalesList() {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(30);
    const { pendingVoidId, feedback, setFeedback, requestVoid, cancelVoid } =
        useVoidSaleFlow();
    const [pendingVoidLabel, setPendingVoidLabel] = useState<string | undefined>();
    const isManager = useAuth((s) => s.isManager());

    const { data, isLoading, isFetching, isPlaceholderData, error, refetch } =
        useSalesListQuery(page, pageSize);
    const rows: SalesListRow[] = data?.rows ?? [];
    const totalCount = data?.totalCount ?? 0;
    const loadError =
        error instanceof ApiError ? error.message : error ? 'Failed to load sales' : null;

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
    const listBusy = isLoading || (isFetching && isPlaceholderData);

    // Only clamp after a real response — while a new page is loading, totalCount used to
    // fall back to 0 (totalPages=1) and this effect snapped the user back to page 1.
    useEffect(() => {
        if (!data || isPlaceholderData) return;
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [data, isPlaceholderData, page, totalPages]);

    const startVoid = (saleId: number, label: string) => {
        setPendingVoidLabel(label);
        requestVoid(saleId);
    };

    const cancelPendingVoid = () => {
        setPendingVoidLabel(undefined);
        cancelVoid();
    };

    const gridClass = isManager ? 'list-grid-manager' : '';
    const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
    const rangeEnd = Math.min(page * pageSize, totalCount);

    return (
        <div className={`sales-list ${gridClass}`}>
            <div className="header-row">
                <h2>Sales List</h2>
                <div className="sales-list-toolbar">
                    <label className="sales-list-page-size">
                        Per page
                        <select
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setPage(1);
                                cancelPendingVoid();
                            }}
                            disabled={listBusy}
                        >
                            {PAGE_SIZE_OPTIONS.map((n) => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <VoidSaleFeedback feedback={feedback} />
            {loadError && <StatusLine variant="error">{loadError}</StatusLine>}

            {pendingVoidId != null && (
                <VoidSaleConfirm
                    saleId={pendingVoidId}
                    label={pendingVoidLabel}
                    onCancel={cancelPendingVoid}
                    onSuccess={() => {
                        cancelPendingVoid();
                        void refetch();
                    }}
                    onFeedback={setFeedback}
                />
            )}

            <div className="list">
                <div className="list-head">
                    <div>Invoice</div>
                    <div>Time</div>
                    <div className="text-right">Items</div>
                    <div className="text-right">Subtotal</div>
                    <div className="text-right">Discount</div>
                    <div className="text-right">Total</div>
                    {isManager && <div className="text-right">Actions</div>}
                </div>

                {listBusy && (
                    <div className="list-loading">Loading sales…</div>
                )}

                {!listBusy && rows.map(r => (
                    <div
                        key={r.id}
                        className={`list-row ${r.voidedAt ? 'sale-voided' : ''}`}
                    >
                        <div className="mono">
                            <Link to={`/sales/${r.id}`} className="link" target="_blank">
                                {r.invoiceCode}
                            </Link>
                            {r.voidedAt && <span className="void-badge">VOID</span>}
                        </div>
                        <div>{new Date(r.createdAt).toLocaleString()}</div>
                        <div className="text-right">{r.itemCount}</div>
                        <div className="text-right">Rs {Number(r.subtotal).toFixed(2)}</div>
                        <div className="text-right muted">- Rs {Number(r.discountValue).toFixed(2)}</div>
                        <div className="text-right strong">Rs {Number(r.total).toFixed(2)}</div>
                        {isManager && (
                            <div className="text-right">
                                {!r.voidedAt ? (
                                    pendingVoidId === r.id ? (
                                        <span className="muted">Confirm above</span>
                                    ) : (
                                        <button
                                            type="button"
                                            className="void-btn"
                                            onClick={() => startVoid(r.id, r.invoiceCode)}
                                            disabled={pendingVoidId != null}
                                        >
                                            Void
                                        </button>
                                    )
                                ) : (
                                    <span className="muted">—</span>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {!listBusy && !rows.length && !loadError && (
                    <div className="empty">No sales found.</div>
                )}
            </div>

            <div className="sales-list-pagination">
                <span className="sales-list-range muted">
                    {totalCount === 0
                        ? 'No sales'
                        : `Showing ${rangeStart}–${rangeEnd} of ${totalCount}`}
                </span>
                <div className="sales-list-pager">
                    <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={listBusy || page <= 1}
                        onClick={() => {
                            cancelPendingVoid();
                            setPage((p) => Math.max(1, p - 1));
                        }}
                    >
                        Previous
                    </button>
                    <span className="sales-list-page-num">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={listBusy || page >= totalPages}
                        onClick={() => {
                            cancelPendingVoid();
                            setPage((p) => Math.min(p + 1, totalPages));
                        }}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}
