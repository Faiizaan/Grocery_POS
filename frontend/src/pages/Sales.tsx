import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BarcodeInput from '../components/BarcodeInput';
import { StatusLine, type PageFeedback } from '../components/StatusLine';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
    useCashSessionCurrentQuery,
    useCreateSaleMutation,
    useProductSearchQuery,
    type ProductSearchHit,
} from '../hooks/queries';
import { ApiError, getJson } from '../lib/apiJson';
import {
    lineStockStatus,
    parseStock,
    stockBlocksCheckout,
    type StockLineStatus,
} from '../lib/stock';

type Product = ProductSearchHit;

type CartItem = { product: Product; quantity: number; lineDiscount: number };

export default function SalesPage() {
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebouncedValue(query, 250);
    const { data: results = [] } = useProductSearchQuery(debouncedQuery);
    const { data: sessionData } = useCashSessionCurrentQuery();
    const createSale = useCreateSaleMutation();
    const cashSessionOpen =
        sessionData === undefined ? null : sessionData.session != null;
    const cashSessionId = sessionData?.session?.id ?? null;
    const [cart, setCart] = useState<CartItem[]>([]);
    const [feedback, setFeedback] = useState<PageFeedback>(null);
    const [cashTendered, setCashTendered] = useState('');
    const [printReceipt, setPrintReceipt] = useState(true);
    const saving = createSale.isPending;
    const searchRef = useRef<HTMLInputElement>(null);
    const cashRef = useRef<HTMLInputElement>(null);
    const scanLockRef = useRef(false);

    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    const focusSearch = () => {
        setQuery('');
        searchRef.current?.focus();
    };

    const resolveProductByCode = async (code: string): Promise<Product | null> => {
        const trimmed = code.trim();
        if (!trimmed) return null;

        try {
            return await getJson<Product>(
                `/api/products/barcode/${encodeURIComponent(trimmed)}`
            );
        } catch {
            // fall through to search
        }

        try {
            const list = await getJson<Product[]>(
                `/api/products/search?q=${encodeURIComponent(trimmed)}`
            );
            const exact = list.find(p => p.barcode === trimmed || p.sku === trimmed);
            if (exact) return exact;
            if (list.length === 1) return list[0];
        } catch {
            return null;
        }
        return null;
    };

    const addToCart = useCallback((p: Product) => {
        const stock = parseStock(p.stock);
        if (stock <= 0) {
            setFeedback({
                variant: 'error',
                message: `"${p.name}" is out of stock and cannot be added.`,
            });
            focusSearch();
            return;
        }
        setCart(prev => {
            const i = prev.findIndex(ci => ci.product.id === p.id);
            const nextQty = i >= 0 ? prev[i].quantity + 1 : 1;
            if (nextQty > stock) {
                setFeedback({
                    variant: 'error',
                    message: `Only ${stock} in stock for "${p.name}".`,
                });
                return prev;
            }
            if (i >= 0) {
                const next = [...prev];
                next[i] = { ...next[i], quantity: nextQty };
                return next;
            }
            return [...prev, { product: p, quantity: 1, lineDiscount: 0 }];
        });
        setFeedback(null);
        focusSearch();
    }, []);

    const handleScan = useCallback(async (code: string) => {
        const trimmed = code.trim();
        if (!trimmed || scanLockRef.current) return;
        scanLockRef.current = true;
        setFeedback(null);
        try {
            const product = await resolveProductByCode(trimmed);
            if (product) {
                addToCart(product);
                return;
            }
            setFeedback({ variant: 'error', message: `No product found for "${trimmed}"` });
            focusSearch();
        } finally {
            scanLockRef.current = false;
        }
    }, [addToCart]);

    const updateQty = (id: number, q: number) => {
        const v = Math.max(0, Math.floor(q || 0));
        setCart(prev =>
            prev
                .map(ci => {
                    if (ci.product.id !== id) return ci;
                    const stock = parseStock(ci.product.stock);
                    if (v > 0 && v > stock) {
                        setFeedback({
                            variant: 'error',
                            message: `Only ${stock} in stock for "${ci.product.name}".`,
                        });
                        return { ...ci, quantity: stock > 0 ? stock : ci.quantity };
                    }
                    const gross = parseFloat(ci.product.salePrice) * v;
                    const lineDiscount = Math.min(ci.lineDiscount, gross);
                    return { ...ci, quantity: v, lineDiscount };
                })
                .filter(ci => ci.quantity > 0)
        );
    };

    const cartStockByProductId = useMemo(() => {
        const m = new Map<number, StockLineStatus>();
        for (const ci of cart) {
            m.set(
                ci.product.id,
                lineStockStatus(parseStock(ci.product.stock), ci.quantity)
            );
        }
        return m;
    }, [cart]);

    const checkoutBlocked = useMemo(
        () =>
            cart.some(ci =>
                stockBlocksCheckout(
                    cartStockByProductId.get(ci.product.id) ?? 'ok'
                )
            ),
        [cart, cartStockByProductId]
    );

    const removeItem = (id: number) => setCart(prev => prev.filter(ci => ci.product.id !== id));

    const updateLineDiscount = (id: number, value: number) => {
        setCart(prev =>
            prev.map(ci => {
                if (ci.product.id !== id) return ci;
                const gross = parseFloat(ci.product.salePrice) * ci.quantity;
                const capped = Math.min(Math.max(0, value), gross);
                return { ...ci, lineDiscount: capped };
            })
        );
    };

    const totals = useMemo(() => {
        let subtotalPre = 0;
        let totalDiscount = 0;
        let subtotal = 0;
        let tax = 0;
        for (const ci of cart) {
            const unit = parseFloat(ci.product.salePrice);
            const gross = unit * ci.quantity;
            const disc = Math.min(ci.lineDiscount, gross);
            const net = gross - disc;
            const lineTax = net * (parseFloat(ci.product.taxRate) / 100);
            subtotalPre += gross;
            totalDiscount += disc;
            subtotal += net;
            tax += lineTax;
        }
        return {
            subtotalPre,
            totalDiscount,
            subtotal,
            tax,
            total: subtotal + tax,
        };
    }, [cart]);

    const cashAmount = useMemo(() => {
        const v = parseFloat(cashTendered || '0');
        return Number.isFinite(v) && v >= 0 ? v : 0;
    }, [cashTendered]);

    const changeDue = useMemo(() => {
        if (totals.total <= 0) return 0;
        return Math.max(0, cashAmount - totals.total);
    }, [cashAmount, totals.total]);

    const cashInsufficient = totals.total > 0 && cashAmount < totals.total;

    // Ctrl+S
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveSale(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cart, cashTendered]);

    const setExactCash = () => setCashTendered(totals.total.toFixed(2));

    const stockStatusLabel = (status: StockLineStatus) => {
        switch (status) {
            case 'out':
                return 'Out of stock';
            case 'over':
                return 'Quantity exceeds stock';
            case 'low':
                return 'Low stock';
            default:
                return null;
        }
    };

    const saveSale = async () => {
        if (!cart.length || saving) return;
        if (checkoutBlocked) {
            setFeedback({
                variant: 'error',
                message:
                    'Fix stock issues in the cart before completing the sale.',
            });
            return;
        }
        if (cashInsufficient) {
            const message = !cashTendered.trim()
                ? 'Enter the cash tendered amount.'
                : 'Cash tendered must be at least the total due.';
            setFeedback({ variant: 'error', message });
            cashRef.current?.focus();
            return;
        }
        setFeedback(null);
        const payload: Record<string, unknown> = {
            items: cart.map(ci => ({
                productId: ci.product.id,
                quantity: ci.quantity,
                ...(ci.lineDiscount > 0 ? { discountValue: ci.lineDiscount } : {}),
            })),
            paidCash: cashAmount.toFixed(2),
        };
        if (cashSessionId != null) payload.sessionId = cashSessionId;
        try {
            const data = await createSale.mutateAsync(payload);
            const saleId = data.sale.id;
            setCart([]);
            setCashTendered('');
            focusSearch();
            if (printReceipt) {
                const url = `${window.location.origin}/sales/${saleId}?print=1`;
                window.open(url, '_blank', 'noopener,noreferrer');
            } else {
                setFeedback({ variant: 'success', message: `Sale #${saleId} saved.` });
            }
        } catch (e) {
            setFeedback({
                variant: 'error',
                message:
                    e instanceof ApiError
                        ? e.message
                        : 'Failed to save sale (network error).',
            });
        }
    };

    return (
        <div className="sales-page">
            <h2>Checkout</h2>

            {cashSessionOpen === false && (
                <div className="sales-session-banner sales-session-banner-warn">
                    No cash session open — sales will not appear on a Z-report until you{' '}
                    <Link to="/cash-session">open a shift</Link>.
                </div>
            )}
            {cashSessionOpen === true && cashSessionId != null && (
                <div className="sales-session-banner sales-session-banner-ok">
                    Cash session #{cashSessionId} is open.{' '}
                    <Link to="/cash-session">View / close shift</Link>
                </div>
            )}

            {feedback && (
                <StatusLine variant={feedback.variant}>{feedback.message}</StatusLine>
            )}

            {/* Search toolbar */}
            <div className="sales-toolbar">
                <div className="field">
                    <label>Search product (name / SKU / barcode)</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={e => { setQuery(e.target.value); setFeedback(null); }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleScan(query);
                                }
                            }}
                            placeholder="Scan barcode or type to search"
                            style={{ flex: '1 1 200px', minWidth: 200 }}
                        />
                        <BarcodeInput onScan={handleScan} />
                    </div>
                    {!!results.length && (
                        <div className="suggest-list">
                            {results.map(p => {
                                const stock = parseStock(p.stock);
                                const out = stock <= 0;
                                return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => addToCart(p)}
                                    className={`suggest-item${out ? ' suggest-item-out' : ''}`}
                                    disabled={out}
                                >
                                    <div className="title">{p.name}</div>
                                    <div className="meta">
                                        {p.sku}{p.barcode ? ` • ${p.barcode}` : ''} • Rs {p.salePrice} • Stock {stock}
                                        {out ? ' • Out of stock' : ''}
                                    </div>
                                </button>
                            );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Cart grid header */}
            <div className="cart grid-header">
                <div className="grid grid-7 header-row">
                    <div className="col span-2">Item</div>
                    <div>Unit</div>
                    <div>Tax %</div>
                    <div>Qty</div>
                    <div>Discount</div>
                    <div className="text-right">Line (pre-tax)</div>
                </div>

                {/* Cart rows */}
                {cart.map(ci => {
                    const unit = parseFloat(ci.product.salePrice);
                    const gross = unit * ci.quantity;
                    const net = gross - ci.lineDiscount;
                    const stockStatus =
                        cartStockByProductId.get(ci.product.id) ?? 'ok';
                    const stockMsg = stockStatusLabel(stockStatus);
                    const stockNum = parseStock(ci.product.stock);
                    return (
                        <div
                            key={ci.product.id}
                            className={`grid grid-7 item-row stock-line-${stockStatus}`}
                        >
                            <div className="col span-2">
                                <div className="title">{ci.product.name}</div>
                                <div className="muted">{ci.product.sku}{ci.product.barcode ? ` • ${ci.product.barcode}` : ''}</div>
                                {stockMsg && (
                                    <div className="stock-line-warning">{stockMsg} (available: {stockNum})</div>
                                )}
                            </div>
                            <div>Rs {unit.toFixed(2)}</div>
                            <div>{parseFloat(ci.product.taxRate).toFixed(2)}%</div>
                            <div className="qty-cell">
                                <input
                                    type="number" min={1} step={1} value={ci.quantity}
                                    onChange={e => updateQty(ci.product.id, Number(e.target.value))}
                                />
                                <button type="button" onClick={() => removeItem(ci.product.id)} className="btn btn-danger btn-sm">Remove</button>
                            </div>
                            <div>
                                <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={ci.lineDiscount || ''}
                                    placeholder="0"
                                    onChange={e =>
                                        updateLineDiscount(
                                            ci.product.id,
                                            Number(e.target.value) || 0
                                        )
                                    }
                                    style={{ width: 72 }}
                                />
                            </div>
                            <div className="text-right strong">Rs {net.toFixed(2)}</div>
                        </div>
                    );
                })}
            </div>

            {/* Summary + Payment */}
            <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="panel">
                    <div className="panel-title">Summary</div>
                    <div className="row"><span>Subtotal (pre-disc)</span><span>Rs {totals.subtotalPre.toFixed(2)}</span></div>
                    <div className="row"><span>Line discounts</span><span>- Rs {totals.totalDiscount.toFixed(2)}</span></div>
                    <div className="row"><span>Subtotal (after disc)</span><span>Rs {totals.subtotal.toFixed(2)}</span></div>
                    <div className="row"><span>Tax</span><span>Rs {totals.tax.toFixed(2)}</span></div>
                    <div className="row total"><span>Total</span><span>Rs {totals.total.toFixed(2)}</span></div>
                    <p className="hint" style={{ marginTop: 8 }}>
                        Enter a discount on each line item (not split across the cart).
                    </p>
                </div>

                <div className="panel payment-panel">
                    <div className="panel-title">Payment (cash)</div>
                    <div className="row total"><span>Total due</span><span>Rs {totals.total.toFixed(2)}</span></div>
                    <div className="field" style={{ marginTop: 10 }}>
                        <label htmlFor="cash-tendered">Cash tendered</label>
                        <div className="cash-input-row">
                            <input
                                id="cash-tendered"
                                ref={cashRef}
                                type="number"
                                min={0}
                                step={1}
                                value={cashTendered}
                                onChange={e => { setCashTendered(e.target.value); setFeedback(null); }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void saveSale();
                                    }
                                }}
                                placeholder="0.00"
                                disabled={!cart.length}
                            />
                            <button
                                type="button"
                                className="btn btn-sm"
                                onClick={setExactCash}
                                disabled={!cart.length || totals.total <= 0}
                            >
                                Exact
                            </button>
                        </div>
                    </div>
                    <div className={`row change-row ${cashInsufficient ? 'change-insufficient' : ''}`}>
                        <span>Change due</span>
                        <span>Rs {changeDue.toFixed(2)}</span>
                    </div>
                    {cashInsufficient && cart.length > 0 && (
                        <div className="hint" style={{ color: '#b91c1c' }}>
                            Need Rs {(totals.total - cashAmount).toFixed(2)} more
                        </div>
                    )}
                    <label className="print-receipt-check">
                        <input
                            type="checkbox"
                            checked={printReceipt}
                            onChange={e => setPrintReceipt(e.target.checked)}
                        />
                        Print receipt after save
                    </label>
                </div>
            </div>

            {/* Footer actions */}
            <div className="flex-between">
                <div className="kbd-hint">
                    Press <kbd>Ctrl</kbd> + <kbd>S</kbd> to complete sale
                    {checkoutBlocked && (
                        <span className="stock-checkout-blocked">
                            {' '}— resolve stock issues to checkout
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={saveSale}
                    className="btn btn-success"
                    disabled={!cart.length || saving || checkoutBlocked}
                >
                    {saving ? 'Saving…' : 'Complete Sale'}
                </button>
            </div>
        </div>
    );
}
