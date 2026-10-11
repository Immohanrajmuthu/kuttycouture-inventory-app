import React, { useEffect, useMemo, useRef, useState } from 'react';
import { calculatePrice, parseMoney, moneyInput } from './domain/pricing';
import './catalog.css';

const uid = () => window.crypto.randomUUID();
const EMPTY_PRODUCTS = [];
const money = paise => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
const zeroExpenses = () => ({ shipping: 0, packaging: 0, other: 0 });
const newVariant = label => ({ id: uid(), label, active: true, stock: 0, minStock: 0, purchaseCostPaise: 0, sellingPricePaise: 0, unitExpensesPaise: zeroExpenses(), calculator: null });
const priceRange = (product, field) => {
  const values = product.variants.filter(v => v.active).map(v => v[field]);
  if (!values.length) return '—';
  return Math.min(...values) === Math.max(...values) ? money(values[0]) : `${money(Math.min(...values))} – ${money(Math.max(...values))}`;
};
function newProduct(category = 'accessories') {
  return { id: null, sku: '', legacySkus: [], websiteId: '', name: '', category, productType: '', description: '', hasSizes: category === 'clothing',
    colors: [], variants: (category === 'clothing' ? ['S', 'M', 'L'] : ['One size']).map(newVariant), archived: false, review: [], sourceSizes: [], revision: 0, createdAt: '', updatedAt: '' };
}
function editable(product) {
  return { ...product, colors: (product.colors || []).map(c => ({ ...c })), variants: product.variants.map(v => ({ ...v, purchaseText: moneyInput(v.purchaseCostPaise), sellingText: moneyInput(v.sellingPricePaise), minText: String(v.minStock) })) };
}
function serialize(draft) {
  return { ...draft, name: draft.name.trim(), description: draft.description.trim(), productType: draft.productType.trim(),
    colors: draft.colors.map(c => ({ ...c, label: c.label.trim() })),
    variants: draft.variants.map(({ purchaseText, sellingText, minText, ...v }) => {
      if (!/^\d+$/.test(minText)) throw new Error('Minimum stock must be a whole number of zero or more.');
      return { ...v, label: v.label.trim(), purchaseCostPaise: parseMoney(purchaseText), sellingPricePaise: parseMoney(sellingText), minStock: Number(minText) };
    }) };
}

function Calculator({ variant, onApply }) {
  const saved = variant.calculator;
  const [mode, setMode] = useState(saved?.mode || 'markup');
  const [basis, setBasis] = useState(saved?.expenseBasis || 'unit');
  const [units, setUnits] = useState(String(saved?.units || 1));
  const [profit, setProfit] = useState(saved ? moneyInput(saved.profitBps) : '30');
  const [expenses, setExpenses] = useState(Object.fromEntries(['shipping', 'packaging', 'other'].map(key => [key, moneyInput(saved?.expensesPaise[key] ?? variant.unitExpensesPaise[key])])));
  const [applied, setApplied] = useState(false);
  let result, settings, error;
  try {
    if (!/^\d+$/.test(units)) throw new Error('Enter whole purchase units.');
    settings = { mode, expenseBasis: basis, units: basis === 'unit' ? 1 : Number(units), profitBps: parseMoney(profit), expensesPaise: Object.fromEntries(Object.entries(expenses).map(([key, value]) => [key, parseMoney(value)])) };
    result = calculatePrice(parseMoney(variant.purchaseText), settings);
  } catch (failure) { error = failure.message; }
  const change = action => event => { setApplied(false); action(event.target.value); };
  return <section className="kc-calculator" aria-label={`Selling price calculator for ${variant.label}`}>
    <div className="kc-section-title"><div><h3>Selling-price calculator · {variant.label}</h3><p>Purchase cost: {variant.purchaseText ? `₹${variant.purchaseText}` : 'Enter above'}. Applying keeps the purchase cost unchanged.</p></div><span className="kc-tag">Optional</span></div>
    <div className="kc-field-grid kc-calc-grid"><label>Expense basis<select value={basis} onChange={change(setBasis)}><option value="unit">Per item</option><option value="purchase">Whole purchase</option></select></label>{basis === 'purchase' && <label>Units sharing these expenses<input inputMode="numeric" value={units} onChange={change(setUnits)} /></label>}{['shipping', 'packaging', 'other'].map(key => <label key={key}>{key === 'other' ? 'Other expenses' : key[0].toUpperCase() + key.slice(1)} ₹<input inputMode="decimal" value={expenses[key]} onChange={change(value => setExpenses(current => ({ ...current, [key]: value })))} /></label>)}<label>Calculation<select value={mode} onChange={change(setMode)}><option value="markup">Markup on cost</option><option value="margin">Margin on selling price</option></select></label><label>Profit percentage<input inputMode="decimal" value={profit} onChange={change(setProfit)} /></label></div>
    <p className="kc-small">{mode === 'markup' ? 'Markup adds a percentage of your total unit cost.' : 'Margin is profit as a percentage of the selling price; it must be below 100%.'} Whole-purchase expenses are averaged per unit and rounded to the nearest paise.</p>
    {error ? <p className="kc-inline-error">{error}</p> : <div className="kc-calculation"><span>Total unit cost <strong>{money(result.unitCostPaise)}</strong></span><span>Suggested selling price <strong>{money(result.sellingPricePaise)}</strong></span></div>}
    <button type="button" disabled={!result} onClick={() => { onApply({ ...result, calculator: settings }); setApplied(true); }}>Apply to this size</button>{applied && <span className="kc-apply-note" role="status">Applied to the draft. Save the product to keep this price.</span>}
  </section>;
}

function ProductEditor({ product, nextSku, onSaved, onClose, onDirty, busy, run }) {
  const [draft, setDraft] = useState(() => editable(product));
  const [calculatorId, setCalculatorId] = useState(null);
  const operation = useRef(uid());
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const change = next => { setDraft(next); onDirty(true); operation.current = uid(); };
  const update = patch => change({ ...draft, ...patch });
  const updateVariant = (id, patch) => update({ variants: draft.variants.map(v => v.id === id ? { ...v, ...patch } : v) });
  const move = (index, direction) => { const variants = [...draft.variants]; [variants[index], variants[index + direction]] = [variants[index + direction], variants[index]]; update({ variants }); };
  const confirmReview = (key, checked) => update({ review: checked ? draft.review.filter(flag => flag !== key) : [...new Set([...draft.review, key])] });
  const calculatorVariant = draft.variants.find(v => v.id === calculatorId);
  return <form className="kc-product-editor" onSubmit={event => { event.preventDefault(); run(async () => { const payload = serialize(draft); const catalog = await window.foundationAPI.saveProduct({ operationId: operation.current, product: payload }); onSaved(catalog); return 'Product saved.'; }); }}>
    <div className="kc-editor-heading"><div><button type="button" className="kc-text-button" disabled={busy} onClick={onClose}>← Back to products</button><h2 ref={heading} tabIndex={-1}>{product.id ? 'Edit product' : 'Add product'}</h2><p>SKU {product.sku || `${nextSku} · assigned when saved`}</p></div><div className="kc-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="kc-primary" disabled={busy}>Save product</button></div></div>
    <fieldset disabled={busy} className="kc-editor-fieldset"><section className="kc-panel"><h3>Product details</h3><div className="kc-field-grid"><label>Product name<input required maxLength={200} value={draft.name} onChange={e => update({ name: e.target.value })} /></label><label>Category<select value={draft.category} onChange={e => { const category = e.target.value; if (!product.id) { const base = newProduct(category); update({ category, hasSizes: base.hasSizes, variants: editable(base).variants }); } else update({ category }); }}><option value="accessories">Accessories</option><option value="clothing">Clothing</option></select></label><label>Product type<input maxLength={100} value={draft.productType} onChange={e => update({ productType: e.target.value })} placeholder="For example, necklace or frock" /></label><label>Inventory structure<select disabled={Boolean(product.id)} value={draft.hasSizes ? 'sizes' : 'single'} onChange={e => { const hasSizes = e.target.value === 'sizes'; update({ hasSizes, variants: editable({ ...draft, variants: (hasSizes ? ['S', 'M', 'L'] : ['One size']).map(newVariant) }).variants }); setCalculatorId(null); }}><option value="single">No sizes — one entry</option><option value="sizes">Separate entries by size</option></select></label></div><label className="kc-description">Description<textarea rows={3} maxLength={3000} value={draft.description} onChange={e => update({ description: e.target.value })} /></label><label className="kc-check"><input type="checkbox" checked={draft.archived} onChange={e => update({ archived: e.target.checked })} />Archive product (keep its history)</label></section>
    <section className="kc-panel"><div className="kc-section-title"><div><h3>{draft.hasSizes ? 'Sizes & prices' : 'Pricing'}</h3><p>Enter selling prices yourself, or open a calculator for a size.</p></div>{draft.hasSizes && <button type="button" onClick={() => update({ variants: [...draft.variants, ...editable({ variants: [newVariant('')] }).variants] })}>Add size</button>}</div>
      {product.review.includes('sizes') && <div className="kc-notice">Source size: {product.sourceSizes.join(', ')}. Rename the inactive entry to a real size and enable it, or add the actual sizes. Keep unused entries inactive.</div>}
      <div className="kc-table-scroll"><table className="kc-size-table"><caption className="kc-visually-hidden">Size-specific costs, selling prices and stock thresholds</caption><thead><tr><th>Size / order</th><th>Active</th><th>Stock</th><th>Purchase cost ₹</th><th>Selling price ₹</th><th>Low-stock threshold</th><th>Calculator</th></tr></thead><tbody>{draft.variants.map((v, index) => <tr key={v.id}><td><input aria-label={`Size label ${index + 1}`} required maxLength={100} readOnly={!draft.hasSizes} value={v.label} onChange={e => updateVariant(v.id, { label: e.target.value })} />{draft.hasSizes && <div className="kc-order"><button type="button" disabled={index === 0} aria-label={`Move ${v.label} up`} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === draft.variants.length - 1} aria-label={`Move ${v.label} down`} onClick={() => move(index, 1)}>↓</button></div>}</td><td><input type="checkbox" aria-label={`Active ${v.label}`} checked={v.active} onChange={e => updateVariant(v.id, { active: e.target.checked })} /></td><td>{v.stock}</td><td><input aria-label={`Purchase cost ${v.label}`} inputMode="decimal" required value={v.purchaseText} onChange={e => updateVariant(v.id, { purchaseText: e.target.value })} /></td><td><input aria-label={`Selling price ${v.label}`} inputMode="decimal" required value={v.sellingText} onChange={e => updateVariant(v.id, { sellingText: e.target.value })} /></td><td><input aria-label={`Minimum stock ${v.label}`} inputMode="numeric" required value={v.minText} onChange={e => updateVariant(v.id, { minText: e.target.value })} /></td><td><button type="button" aria-expanded={calculatorId === v.id} onClick={() => setCalculatorId(calculatorId === v.id ? null : v.id)}>Calculate</button></td></tr>)}</tbody></table></div>
      <p className="kc-small">Change stock through Receive stock or Adjust stock. Zero-priced entries cannot be billed. Low stock means quantity at or below the threshold; zero is the default.</p>
      {product.review.includes('sizes') && <label className="kc-check"><input type="checkbox" checked={!draft.review.includes('sizes')} onChange={e => confirmReview('sizes', e.target.checked)} />I have confirmed the actual size choices.</label>}
      {calculatorVariant && <Calculator key={calculatorId} variant={calculatorVariant} onApply={result => updateVariant(calculatorId, { sellingText: moneyInput(result.sellingPricePaise), unitExpensesPaise: result.unitExpensesPaise, calculator: result.calculator })} />}
    </section>
    <section className="kc-panel"><h3>Shared color choices</h3><p>All sizes share these colors. Color does not have its own price or stock count.</p><div className="kc-color-list">{draft.colors.map((color, index) => <div className="kc-color-row" key={color.id}><input aria-label={`Color ${index + 1}`} required maxLength={100} value={color.label} onChange={e => update({ colors: draft.colors.map(c => c.id === color.id ? { ...c, label: e.target.value } : c) })} /><label className="kc-check"><input type="checkbox" checked={color.active} onChange={e => update({ colors: draft.colors.map(c => c.id === color.id ? { ...c, active: e.target.checked } : c) })} />Active</label></div>)}</div>{!draft.colors.length && <p className="kc-small">No color selection configured.</p>}<button type="button" onClick={() => update({ colors: [...draft.colors, { id: uid(), label: '', active: true }] })}>Add color</button>{product.review.includes('colors') && <label className="kc-check"><input type="checkbox" checked={!draft.review.includes('colors')} onChange={e => confirmReview('colors', e.target.checked)} />I have reviewed color choices, including whether none are needed.</label>}</section>
    <div className="kc-actions kc-bottom-save"><button type="button" onClick={onClose}>Cancel</button><button className="kc-primary">Save product</button></div></fieldset>
  </form>;
}

export default function CatalogPage({ catalog, setCatalog, busy, run, dirty, onDirty }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [filter, setFilter] = useState('active');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(new Set());
  const [editing, setEditing] = useState(null);
  const products = catalog?.products || EMPTY_PRODUCTS;
  const results = useMemo(() => products.filter(p => {
    const active = p.variants.filter(v => v.active);
    return `${p.name} ${p.sku}`.toLowerCase().includes(query.trim().toLowerCase())
      && (category === 'all' || p.category === category)
      && (filter === 'archived' ? p.archived : !p.archived)
      && (filter !== 'price' || active.some(v => v.sellingPricePaise === 0))
      && (filter !== 'review' || p.review.length > 0)
      && (filter !== 'low' || active.some(v => v.stock <= v.minStock));
  }), [products, query, category, filter]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(results.length / 15) - 1));
  const close = () => { if (!dirty || window.confirm('Discard unsaved product changes?')) { setEditing(null); onDirty(false); } };
  if (editing) return <ProductEditor key={editing.id || 'new'} product={editing} nextSku={catalog.state.nextSku} onSaved={next => { setCatalog(next); onDirty(false); setEditing(null); }} onClose={close} onDirty={onDirty} busy={busy} run={run} />;
  if (!catalog) return <div className="kc-notice" role="status">Catalog is unavailable. Reopen the workspace to load it.</div>;
  return <>
    <div className="kc-catalog-tools"><label className="kc-product-search">Find a product<input type="search" placeholder="Search by SKU or name" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label><label>Category<select value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}><option value="all">All categories</option><option value="accessories">Accessories</option><option value="clothing">Clothing</option></select></label><button className="kc-primary" disabled={busy} onClick={() => setEditing(newProduct())}>Add product</button></div>
    <div className="kc-filter-row" aria-label="Product filters">{[['active', 'Active'], ['price', 'Needs price'], ['review', 'Needs review'], ['low', 'Low stock'], ['archived', 'Archived']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); }}>{label}</button>)}<span>{results.length} products</span></div>
    <section className="kc-catalog-table"><div className="kc-table-scroll"><table><caption className="kc-visually-hidden">Products grouped by SKU, with size-specific prices</caption><thead><tr><th>Product / SKU</th><th>Category</th><th>Stock</th><th>Purchase cost</th><th>Selling price</th><th>Status</th></tr></thead><tbody>{results.slice(currentPage * 15, (currentPage + 1) * 15).map(p => <React.Fragment key={p.id}><tr><td><button className="kc-product-link" disabled={busy} onClick={() => setEditing(p)}>{p.name}</button><small>{p.sku}{p.hasSizes ? ` · ${p.variants.filter(v => v.active).length} active sizes` : ''}</small>{p.hasSizes && <button className="kc-text-button" aria-expanded={expanded.has(p.id)} onClick={() => setExpanded(current => { const next = new Set(current); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next; })}>{expanded.has(p.id) ? 'Hide sizes' : 'Show sizes'}</button>}</td><td className="kc-category-label">{p.category}</td><td className="kc-numeric">{p.variants.reduce((sum, v) => sum + v.stock, 0)}</td><td className="kc-numeric">{priceRange(p, 'purchaseCostPaise')}</td><td className="kc-numeric">{priceRange(p, 'sellingPricePaise')}</td><td>{p.archived ? 'Archived' : p.review.length ? <span className="kc-tag">Review choices</span> : p.variants.some(v => v.active && v.sellingPricePaise === 0) ? 'Needs price' : 'Priced'}</td></tr>{expanded.has(p.id) && p.variants.map(v => <tr key={v.id} className="kc-variant-row"><td>↳ {v.label}</td><td>{v.active ? 'Active' : 'Inactive'}</td><td className="kc-numeric">{v.stock}</td><td className="kc-numeric">{money(v.purchaseCostPaise)}</td><td className="kc-numeric">{money(v.sellingPricePaise)}</td><td>{v.sellingPricePaise === 0 ? 'Needs price' : ''}</td></tr>)}</React.Fragment>)}</tbody></table></div>{!results.length && <div className="kc-no-results">No products match these filters.</div>}<div className="kc-pagination"><span>{results.length ? `${currentPage * 15 + 1}–${Math.min((currentPage + 1) * 15, results.length)} of ${results.length}` : '0 products'}</span><div><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button disabled={(currentPage + 1) * 15 >= results.length} onClick={() => setPage(currentPage + 1)}>Next</button></div></div></section>
    {catalog.state.report && <details className="kc-import-report"><summary>Catalog import report · {catalog.state.report.count} products</summary><p>{catalog.state.report.accessories} accessories and {catalog.state.report.clothing} clothing products imported with zero opening stock, purchase cost, and selling price. Subsequent edits are retained.</p><p>{catalog.state.report.missingColors} products had no color information; {catalog.state.report.ambiguousSizes} had enquiry-only sizes. Review these choices in the editor.</p><p>Clothing SKUs: 200000 → 100089; 200001 → 100090; 200002 → 100091; 200003 → 100092. Website identities are preserved.</p></details>}
  </>;
}
