import React, { useEffect, useRef, useState } from 'react';
import { parseMoney, moneyInput } from './domain/pricing';
import './stock.css';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value / 100);
const whole = value => {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 1000000) throw new Error('Enter a whole quantity from 0 to 1,000,000.');
  return Number(value);
};

function History({ inventory, catalog }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(0);
  const movements = inventory.movements.filter(m => {
    const currentName = catalog.products.find(p => p.id === m.productId)?.name || '';
    return (type === 'all' || m.type === type) && `${m.productName} ${m.sku} ${currentName}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  const currentPage = Math.min(page, Math.max(0, Math.ceil(movements.length / 30) - 1));
  return <>
    <div className="kc-catalog-tools"><label className="kc-product-search">Product name or SKU<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Search stock history" /></label><label>Change type<select value={type} onChange={e => { setType(e.target.value); setPage(0); }}><option value="all">All changes</option>{['Received', 'Sold', 'Cancelled bill', 'Adjustment'].map(label => <option key={label}>{label}</option>)}</select></label></div>
    <div className="kc-history-caption"><span>Latest saved first</span><span>{movements.length} entries</span></div>
    <section className="kc-catalog-table"><div className="kc-table-scroll"><table className="kc-history-table"><caption className="kc-visually-hidden">Stock movements in reverse save order</caption><thead><tr><th>Product / size</th><th>Change</th><th>Quantity</th><th>Stock after</th><th>Source / reason</th><th>Saved</th></tr></thead><tbody>{movements.slice(currentPage * 30, (currentPage + 1) * 30).map(m => <tr key={m.id}><td>{m.productName}<small>{m.sku} · {m.size}</small></td><td>{m.type}</td><td className="kc-numeric">{m.delta > 0 ? '+' : ''}{m.delta}</td><td className="kc-numeric">{m.after}</td><td>{m.reason}{m.purchaseCostPaise !== null && <small>{money(m.purchaseCostPaise)} / unit</small>}{m.note && <small>{m.note}</small>}<small>Entry {m.operationId.slice(0, 8)}</small></td><td><time dateTime={m.recordedAt}>{new Date(m.recordedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</time></td></tr>)}</tbody></table></div>{!movements.length && <div className="kc-no-results">{inventory.movements.length ? 'No changes match these filters.' : 'No stock changes yet. Receive stock to record your first entry.'}</div>}<div className="kc-pagination"><span>{movements.length ? `${currentPage * 30 + 1}–${Math.min((currentPage + 1) * 30, movements.length)} of ${movements.length}` : '0 entries'}</span><div><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</button><button disabled={(currentPage + 1) * 30 >= movements.length} onClick={() => setPage(currentPage + 1)}>Next</button></div></div></section>
  </>;
}

export default function StockPage({ screen, catalog, inventory, onResult, busy, run, dirty, onDirty }) {
  const [query, setQuery] = useState('');
  const [resultIndex, setResultIndex] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [rows, setRows] = useState([]);
  const [variantId, setVariantId] = useState('');
  const [actual, setActual] = useState('0');
  const [reason, setReason] = useState('Count correction');
  const [note, setNote] = useState('');
  const [review, setReview] = useState(null);
  const reviewHeading = useRef(null);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  if (!catalog) return <p role="status">Catalog is unavailable. Reopen the workspace.</p>;
  if (screen === 'history') return <History inventory={inventory} catalog={catalog} />;

  const receiving = screen === 'receive';
  const product = catalog.products.find(p => p.id === selectedId);
  const variant = product?.variants.find(v => v.id === variantId);
  const matches = query.trim() ? catalog.products.filter(p => (!receiving || !p.archived) && `${p.name} ${p.sku}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 10) : [];
  function loadProduct(p) {
    setSelectedId(p?.id || '');
    setRows((p?.variants || []).filter(v => v.active).map(v => ({ variantId: v.id, quantity: '0', cost: moneyInput(v.purchaseCostPaise) })));
    setVariantId(p?.variants[0]?.id || ''); setActual(String(p?.variants[0]?.stock || 0));
    setReason('Count correction'); setNote(''); setReview(null); setQuery(''); setResultIndex(0); onDirty(false);
  }
  function choose(p) { if (!dirty || window.confirm('Discard unsaved stock changes?')) loadProduct(p); }
  function editRow(id, patch) { setRows(current => current.map(row => row.variantId === id ? { ...row, ...patch } : row)); onDirty(true); }
  function reviewEntry() {
    run(() => {
      const common = { operationId: window.crypto.randomUUID(), productId: product.id, expectedRevision: product.revision };
      if (receiving) {
        const lines = rows.map(row => { const quantity = whole(row.quantity); return { variantId: row.variantId, quantity, purchaseCostPaise: quantity ? parseMoney(row.cost) : 0 }; });
        if (!lines.some(line => line.quantity)) throw new Error('Enter at least one received quantity.');
        const changes = lines.filter(line => line.quantity > 0).map(line => {
          const v = product.variants.find(item => item.id === line.variantId);
          if (v.stock + line.quantity > 1000000) throw new Error('Resulting stock cannot exceed 1,000,000 units.');
          return { ...line, label: v.label, before: v.stock, after: v.stock + line.quantity, oldCost: v.purchaseCostPaise };
        });
        const total = changes.reduce((sum, row) => sum + row.quantity * row.purchaseCostPaise, 0);
        if (!Number.isSafeInteger(total)) throw new Error('Purchase total is too large.');
        setReview({ command: { ...common, lines }, changes, total });
      } else {
        const quantity = whole(actual);
        if (quantity === variant.stock) throw new Error('The quantity is unchanged. No adjustment is needed.');
        setReview({ command: { ...common, variantId, actualQuantity: quantity, reason, note }, changes: [{ label: variant.label, before: variant.stock, after: quantity, quantity: quantity - variant.stock }] });
      }
    });
  }
  function confirm() {
    const pending = review;
    run(async () => {
      const result = receiving ? await window.foundationAPI.receiveStock(pending.command) : await window.foundationAPI.adjustStock(pending.command);
      onResult(result); loadProduct(result.catalog.products.find(p => p.id === selectedId));
      return receiving ? 'Stock received. Selling prices are unchanged.' : 'Stock corrected. Purchase costs and selling prices are unchanged.';
    });
  }

  if (review) return <section className="kc-panel kc-stock-review"><h2 ref={reviewHeading} tabIndex={-1}>{receiving ? 'Review incoming stock' : 'Review stock correction'}</h2><p>{product.name} · {product.sku}</p><div className="kc-table-scroll"><table className="kc-size-table"><thead><tr><th>Size</th><th>Current</th><th>Change</th><th>After saving</th>{receiving && <th>Purchase cost / unit</th>}</tr></thead><tbody>{review.changes.map((row, i) => <tr key={i}><td>{row.label}</td><td>{row.before}</td><td>{row.quantity > 0 ? '+' : ''}{row.quantity}</td><td>{row.after}</td>{receiving && <td>{money(row.oldCost)} → {money(row.purchaseCostPaise)}</td>}</tr>)}</tbody></table></div>{receiving ? <div className="kc-stock-totals"><span>{review.changes.reduce((sum, row) => sum + row.quantity, 0)} units to receive</span><strong>Purchase total {money(review.total)}</strong></div> : <p className="kc-stock-reason"><strong>{review.command.reason}</strong>{review.command.note && ` · ${review.command.note}`}</p>}<p className="kc-small">{receiving ? 'This adds to current stock. Sizes with zero received quantity stay unchanged.' : 'This updates the selected size to the actual quantity.'} The date and time are recorded when you save.</p><div className="kc-actions"><button disabled={busy} onClick={() => setReview(null)}>Back to editing</button><button disabled={busy} className="kc-primary" onClick={confirm}>{receiving ? 'Confirm stock entry' : 'Save adjustment'}</button></div><p className="kc-small">If stock changed elsewhere, reload and review the current quantities before trying again.</p><button disabled={busy} onClick={() => { if (window.confirm('Reload the product and discard this stock entry?')) run(async () => { const result = await window.foundationAPI.loadStock(); onResult(result); loadProduct(result.catalog.products.find(p => p.id === selectedId)); }); }}>Reload stock</button></section>;

  return <>
    <section className="kc-panel"><label className="kc-stock-search">Product name or SKU<input value={query} placeholder="Type a product name or SKU" disabled={busy} role="combobox" aria-autocomplete="list" aria-expanded={matches.length > 0} aria-controls="stock-product-results" aria-activedescendant={matches.length ? `stock-result-${Math.min(resultIndex, matches.length - 1)}` : undefined} onChange={e => { setQuery(e.target.value); setResultIndex(0); }} onKeyDown={e => { if (!matches.length) return; if (e.key === 'ArrowDown') { e.preventDefault(); setResultIndex(current => (current + 1) % matches.length); } else if (e.key === 'ArrowUp') { e.preventDefault(); setResultIndex(current => (current + matches.length - 1) % matches.length); } else if (e.key === 'Enter') { e.preventDefault(); choose(matches[Math.min(resultIndex, matches.length - 1)]); } else if (e.key === 'Escape') setQuery(''); }} /></label>
      <ul id="stock-product-results" role="listbox" aria-label="Matching products" className="kc-stock-results">{matches.map((p, index) => <li key={p.id} role="option" id={`stock-result-${index}`} aria-selected={index === resultIndex} onMouseDown={e => e.preventDefault()}><button disabled={busy} onClick={() => choose(p)}>{p.name}<small>{p.sku}{p.archived ? ' · Archived' : ''}</small></button></li>)}</ul>{query.trim() && !matches.length && <p role="status">No matching products.</p>}
      {!product ? <div className="kc-no-results">Choose one product to {receiving ? 'receive stock for all its sizes' : 'correct a stock quantity'}.</div> : <>
        <div className="kc-section-title kc-stock-product"><div><h2>{product.name}</h2><p>{product.sku} · {product.category}{product.archived ? ' · Archived' : ''}</p></div><span className="kc-tag">{receiving ? 'Purchase costs are private' : 'Costs and prices stay unchanged'}</span></div>
        {receiving ? <><div className="kc-table-scroll"><table className="kc-size-table"><thead><tr><th>Size</th><th>Current stock</th><th>Receiving</th><th>Purchase cost ₹ / unit</th><th>After saving</th></tr></thead><tbody>{rows.map(row => { const v = product.variants.find(item => item.id === row.variantId); return <tr key={v.id}><td>{v.label}</td><td>{v.stock}</td><td><input disabled={busy} aria-label={`Receiving ${v.label}`} inputMode="numeric" value={row.quantity} onChange={e => editRow(v.id, { quantity: e.target.value })} /></td><td><input disabled={busy} aria-label={`Purchase cost ${v.label}`} inputMode="decimal" value={row.cost} onChange={e => editRow(v.id, { cost: e.target.value })} /><small>Current {money(v.purchaseCostPaise)}</small></td><td>{/^\d+$/.test(row.quantity) && Number(row.quantity) <= 1000000 ? v.stock + Number(row.quantity) : '—'}</td></tr>; })}</tbody></table></div>{!rows.length && <p>No active sizes. Confirm size choices in Products before receiving stock.</p>}<p className="kc-small">Only sizes receiving stock get a new purchase cost. Selling prices stay unchanged.</p></> : <><div className="kc-field-grid"><label>Size<select disabled={busy} value={variantId} onChange={e => { if (dirty && !window.confirm('Discard unsaved correction details and choose another size?')) return; const v = product.variants.find(item => item.id === e.target.value); setVariantId(v.id); setActual(String(v.stock)); setReason('Count correction'); setNote(''); onDirty(false); }}>{product.variants.map(v => <option key={v.id} value={v.id}>{v.label}{v.active ? '' : ' · Inactive'}</option>)}</select></label><label>Actual quantity<input disabled={busy} inputMode="numeric" value={actual} onChange={e => { setActual(e.target.value); onDirty(true); }} /></label><label>Reason<select disabled={busy} value={reason} onChange={e => { setReason(e.target.value); onDirty(true); }}>{['Count correction', 'Damaged', 'Missing', 'Other'].map(label => <option key={label}>{label}</option>)}</select></label><label>Note (optional)<input disabled={busy} maxLength={500} value={note} onChange={e => { setNote(e.target.value); onDirty(true); }} /></label></div><div className="kc-stock-totals"><span>Current stock: {variant.stock} units</span><strong aria-live="polite">{/^\d+$/.test(actual) && Number(actual) <= 1000000 ? `Change: ${Number(actual) >= variant.stock ? '+' : ''}${Number(actual) - variant.stock} units` : 'Enter a whole quantity'}</strong></div></>}
        <div className="kc-actions"><button disabled={busy || (receiving && !rows.length)} className="kc-primary" onClick={reviewEntry}>{receiving ? 'Review stock entry' : 'Review adjustment'}</button></div>
      </>}
    </section>
    {inventory.pendingAvailabilityCount > 0 && <p className="kc-small">{inventory.pendingAvailabilityCount} product(s) have availability changes waiting for website publishing. The website connection is a later phase.</p>}
  </>;
}
