import React, { useEffect, useRef, useState } from 'react';
import './foundation.css';
import CatalogPage from './CatalogPage';
import StockPage from './StockPage';
import BillingPage from './BillingPage';

const GROUPS = [
  { label: 'Products & Pricing', items: [['products', 'Products'], ['receive', 'Receive stock'], ['adjust', 'Adjust stock'], ['history', 'Stock history'], ['publish', 'Website publishing']] },
  { label: 'Billing', items: [['new-bill', 'New bill'], ['bills', 'Bills']] },
];
const SCREENS = {
  products: ['Products', 'A clear home for your catalog and size-based pricing.', 'Your catalog starts here', 'The next phase brings your product catalog into this workspace with separate size rows, shared colors, and zero opening stock.'],
  receive: ['Receive stock', 'One product and all its sizes in one entry.', 'Ready for the stock workflow', 'Receiving and purchase-cost updates will follow the product catalog. Each saved entry will record its date and time automatically.'],
  adjust: ['Adjust stock', 'Keep your records aligned with what you have.', 'Stock corrections come next', 'You will enter the actual quantity, select a reason, and review the difference before saving.'],
  history: ['Stock history', 'Every change, with the latest entry first.', 'No stock movements yet', 'Received stock, sales, cancellations, and corrections will appear here with their source and resulting quantity.'],
  publish: ['Website publishing', 'Review public catalog changes before publishing.', 'Your website connection comes later', 'Publish names, sizes, colors, and availability. Photos stay on the website; quantities, prices, and costs stay private.'],
  'new-bill': ['New bill', 'Find a product by SKU or name and build a bill.', 'Billing follows the catalog and stock', 'The billing phase will add size and color selection, paid or unpaid bills, and a review before saving.'],
  bills: ['Bills', 'Find invoices, record payments, and manage unpaid bills.', 'No bills in this workspace', 'Saved invoices will appear here. A4 printing and PDF sharing are planned for this version.'],
  settings: ['Settings', 'Your business details, appearance, and recovery tools.'],
};
const BUSINESS_FIELDS = [['shopName', 'Business name'], ['place', 'Place'], ['phone', 'Phone number'], ['website', 'Website'], ['instagram', 'Instagram'], ['footer', 'Invoice footer']];

function Settings({ preferences, update, storagePath, busy, run, onRestored }) {
  const [form, setForm] = useState(preferences);
  const [preview, setPreview] = useState(null);
  const reviewHeading = useRef(null);
  const savedBusiness = JSON.stringify(Object.fromEntries(BUSINESS_FIELDS.map(([key]) => [key, preferences[key]])));
  useEffect(() => { setForm(JSON.parse(savedBusiness)); }, [savedBusiness]);
  useEffect(() => { if (preview) reviewHeading.current?.focus(); }, [preview]);
  return <>
    <section className="kc-panel" aria-labelledby="business-heading">
      <div className="kc-section-title"><div><h2 id="business-heading">Business details</h2><p>For your future A4 invoices and PDFs.</p></div><span className="kc-tag">Saved on this laptop</span></div>
      <form onSubmit={event => { event.preventDefault(); const values = Object.fromEntries(BUSINESS_FIELDS.map(([key]) => [key, form[key].trim()])); run(() => update(values), 'Business details saved.'); }}>
        <div className="kc-field-grid">{BUSINESS_FIELDS.map(([key, label]) => <label key={key}>{label}<input required={key === 'shopName'} maxLength={200} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /></label>)}</div>
        <div className="kc-actions"><button className="kc-primary" disabled={busy}>Save business details</button></div>
      </form>
    </section>
    <section className="kc-panel" aria-labelledby="backup-heading">
      <h2 id="backup-heading">Backup & recovery</h2><p>Back up your catalog, prices, stock quantities and history, SKU sequence, business details, and preferences. Includes product thumbnails, invoices, payment and cancellation history, invoice sequence, and your saved billing draft.</p>
      <div className="kc-actions"><button disabled={busy} onClick={() => run(async () => { const result = await window.foundationAPI.createBackup(); return result ? `Backup saved: ${result.path}` : 'Backup cancelled.'; })}>Back up now</button><button disabled={busy} onClick={() => run(async () => { const result = await window.foundationAPI.previewRestore(); setPreview(result); return result ? 'Backup is ready for review.' : 'Restore cancelled.'; })}>Restore backup…</button></div>
      {preview && <section className="kc-restore" aria-labelledby="restore-heading"><h3 ref={reviewHeading} tabIndex={-1} id="restore-heading">Review before restoring</h3><dl><dt>File</dt><dd>{preview.fileName}</dd><dt>Created</dt><dd>{new Date(preview.createdAt).toLocaleString()}</dd><dt>Business</dt><dd>{preview.shopName}</dd><dt>Catalog</dt><dd>{preview.productCount == null ? 'Settings-only backup; catalog and stock stay unchanged' : `${preview.productCount} products`}</dd>{preview.productCount != null && <><dt>Invoices</dt><dd>{preview.billCount || 0} bills</dd></>}{preview.movementCount != null && <><dt>History</dt><dd>{preview.movementCount} stock entries</dd></>}</dl><p>{preview.productCount == null ? 'This replaces settings only.' : 'This replaces catalog, stock history, billing and settings in this redesign workspace. Older catalog backups clear bills and drafts.'} A safety backup is created first.</p><div className="kc-actions"><button disabled={busy} onClick={() => setPreview(null)}>Keep current settings</button><button className="kc-primary" disabled={busy} onClick={() => run(async () => { const result = await window.foundationAPI.restoreBackup(preview.token); setPreview(null); onRestored(result); return `Backup restored. Safety backup: ${result.safetyPath}`; })}>{preview.productCount == null ? 'Restore these settings' : 'Restore this backup'}</button></div></section>}
      <p className="kc-small">Automatic daily backups and 30-day retention are scheduled for a later phase.</p>
    </section>
    <section className="kc-panel"><h2>Workspace</h2><p>This development workspace uses the bundled website catalog and stays separate from your existing inventory app. No live stock or bills have been imported.</p><dl><dt>Storage</dt><dd className="kc-path">{storagePath}</dd><dt>Database</dt><dd>SQLite · Schema version 4</dd></dl></section>
  </>;
}

export default function FoundationApp() {
  const [preferences, setPreferences] = useState(null);
  const [storagePath, setStoragePath] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [inventory, setInventory] = useState({ movements: [], pendingAvailabilityCount: 0 });
  const [billing, setBilling] = useState({ bills: [], draft: null, draftRevision: 0 });
  const [dirty, setDirty] = useState(false);
  const [screen, setScreen] = useState('products');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const heading = useRef(null);
  const isLoaded = preferences !== null;

  const load = async () => {
    setError(''); setLoading(true);
    try {
      if (!window.foundationAPI) throw new Error('Open this workspace with npm run redesign. The desktop connection is unavailable.');
      const data = await window.foundationAPI.load();
      setPreferences(data.preferences); setScreen(data.preferences.lastScreen); setStoragePath(data.storagePath);
      setCatalog(data.catalog || null);
      setBilling(data.billing || { bills: [], draft: null, draftRevision: 0 });
      setInventory(data.inventory || { movements: [], pendingAvailabilityCount: 0 });
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (isLoaded) heading.current?.focus(); }, [screen, isLoaded]);
  useEffect(() => {
    const guard = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  async function run(action, success) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setMessage('');
    try { const result = await action(); setMessage(success || (typeof result === 'string' ? result : '')); }
    catch (failure) { setError(failure.message || 'Unable to save. Please try again.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function update(patch) {
    const saved = await window.foundationAPI.updatePreferences(patch);
    setPreferences(saved);
    return saved;
  }
  function navigate(next) {
    if (next === screen) return;
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    run(async () => { await update({ lastScreen: next }); setDirty(false); setScreen(next); });
  }

  if (!preferences) return <div className="kc-foundation" data-theme="system"><main className="kc-start"><h1>Kutty Couture</h1>{loading ? <p role="status">Opening your workspace…</p> : <><p role="alert">{error}</p><button onClick={load}>Try again</button></>}</main></div>;

  return <div className="kc-foundation" data-theme={preferences.theme}>
    <a className="kc-skip" href="#workspace-main">Skip to content</a>
    <header className="kc-topbar"><div className="kc-brand"><span className="kc-brand-mark" aria-hidden="true">KC</span><div><strong>{preferences.shopName}</strong><span>Made for your everyday work</span></div></div><label className="kc-theme">Appearance<select value={preferences.theme} disabled={busy} onChange={event => run(() => update({ theme: event.target.value }))}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></header>
    <div className="kc-layout"><aside className="kc-sidebar"><nav aria-label="Main navigation">{GROUPS.map(group => <div className="kc-nav-group" key={group.label}><h2>{group.label}</h2>{group.items.map(([id, label]) => <button key={id} disabled={busy} aria-current={screen === id ? 'page' : undefined} onClick={() => navigate(id)}>{label}</button>)}</div>)}<div className="kc-nav-group kc-settings-nav"><button disabled={busy} aria-current={screen === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}>Settings</button></div></nav><div className="kc-workspace-note"><span className="kc-status-dot" aria-hidden="true" />Local development workspace<small>Your live data stays separate.</small></div></aside>
      <main id="workspace-main" className="kc-main" tabIndex={-1}><div className="kc-page-heading"><div><p className="kc-eyebrow">{screen === 'settings' ? 'Your workspace' : ['new-bill', 'bills'].includes(screen) ? 'Billing' : 'Products & Pricing'}</p><h1 ref={heading} tabIndex={-1}>{SCREENS[screen][0]}</h1><p>{SCREENS[screen][1]}</p></div><span className="kc-tag">Development workspace</span></div>
        {error && <div className="kc-notice kc-error" role="alert">{error}</div>}{message && <div className="kc-notice" role="status">{message}</div>}
        {screen === 'products' ? <CatalogPage inventory={inventory} catalog={catalog} setCatalog={setCatalog} busy={busy} run={run} dirty={dirty} onDirty={setDirty} /> : ['receive', 'adjust', 'history'].includes(screen) ? <StockPage key={screen} screen={screen} catalog={catalog} inventory={inventory} onResult={result => { setCatalog(result.catalog); setInventory(result.inventory); }} busy={busy} run={run} dirty={dirty} onDirty={setDirty} /> : ['new-bill', 'bills'].includes(screen) ? <div className="kc-billing"><BillingPage key={screen} screen={screen} catalog={catalog} billing={billing} busy={busy} run={run} onDirty={setDirty} onResult={result => { setCatalog(result.catalog); setInventory(result.inventory); setBilling(result.billing); }} /></div> : screen === 'settings' ? <Settings preferences={preferences} update={update} storagePath={storagePath} busy={busy} run={run} onRestored={result => { setPreferences(result.preferences); setScreen(result.preferences.lastScreen); if (result.catalog) setCatalog(result.catalog); if (result.inventory) setInventory(result.inventory); if (result.billing) setBilling(result.billing); }} /> : <>
          <section className="kc-empty"><span className="kc-empty-label">{screen === 'products' ? 'CATALOG' : screen === 'new-bill' || screen === 'bills' ? 'BILLING' : 'WORKFLOW'}</span><h2>{SCREENS[screen][2]}</h2><p>{SCREENS[screen][3]}</p><button disabled={busy} onClick={() => navigate('settings')}>Set up business details</button></section>
          <div className="kc-roadmap"><span>Built now</span><p>Products, pricing, stock receiving and corrections, history, and backup recovery.</p><span>Next</span><p>Billing, unpaid bills, and invoice history.</p></div>
        </>}
        <footer className="kc-footer">Kutty Couture · Products & Pricing <span>Offline workspace</span></footer>
      </main></div>
  </div>;
}
