import React, { useState } from 'react';

export default function PublishingPage({ busy, run }) {
  const [preview, setPreview] = useState(null);
  const [query, setQuery] = useState('');
  const [connection, setConnection] = useState(null);
  const [token, setToken] = useState('');
  const [verification, setVerification] = useState(null);
  const products = preview?.payload.products || [];
  const listed = products.filter(product => product.listed);
  const filtered = products.filter(product => `${product.sku} ${product.name}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <section className="kc-panel"><h2>GitHub connection</h2>
      <p>Use a fine-grained token limited to Immohanrajmuthu/kuttycouture-website with repository Contents read/write permission.</p>
      <p className="kc-small">The token is encrypted on this laptop and excluded from backups. Saving it does not verify GitHub access or publish anything.</p>
      <button disabled={busy} onClick={() => run(async () => { setConnection(await window.foundationAPI.publicationConnection()); })}>Check saved connection</button>
      <button disabled={busy} onClick={() => run(async () => {
        setVerification(null);
        setVerification(await window.foundationAPI.verifyPublicationConnection());
        return 'GitHub repository and main branch are readable. No website changes were made.';
      })}>Verify GitHub connection</button>
      {verification && <p role="status">Connected to {verification.repository} · {verification.branch}. Read access verified; publishing permission has not yet been tested.</p>}
      {connection && <p role="status">{connection.saved ? 'Token saved on this laptop.' : 'No token saved.'} {!connection.encryptionAvailable && 'Secure storage is unavailable.'}</p>}
      <form onSubmit={event => { event.preventDefault(); const entered = token; setToken(''); setVerification(null); run(async () => { setConnection(await window.foundationAPI.savePublicationToken(entered)); return 'GitHub token saved securely. Choose Verify GitHub connection to check access.'; }); }}>
        <label>GitHub token<input type="password" autoComplete="off" spellCheck={false} value={token} maxLength={255} onChange={event => setToken(event.target.value)} /></label>
        <div className="kc-actions"><button disabled={busy || !token.trim() || connection?.encryptionAvailable === false}>Save token securely</button>{connection?.saved && <button type="button" disabled={busy} onClick={() => run(async () => { setConnection(await window.foundationAPI.removePublicationToken()); setVerification(null); return 'Saved token removed from this laptop.'; })}>Remove saved token</button>}</div>
      </form>
    </section>
    <section className="kc-panel">
      <h2>Review your website catalog</h2>
      <p>Publish product details, shared colors, sizes, and Available/Unavailable status. Website photos stay on the website.</p>
      <p>Deployment: GitHub main → Netlify → kuttycouture.in.</p>
      <p className="kc-small">Connection setup is in progress. This preview does not update the website or compare against its live catalog.</p>
      <button className="kc-primary" disabled={busy} onClick={() => run(async () => {
        const result = await window.foundationAPI.previewPublication();
        setPreview(result);
        return 'Website catalog preview refreshed from saved products.';
      })}>{preview ? 'Refresh preview' : 'Preview website catalog'}</button>
    </section>
    {preview && <section className="kc-panel" aria-labelledby="publication-preview-heading">
      <h2 id="publication-preview-heading">Public catalog preview</h2>
      <p>{listed.length} listed · {listed.filter(product => product.available).length} available · {listed.filter(product => !product.available).length} unavailable · {products.length - listed.length} archived</p>
      {listed.length > 0 && listed.every(product => !product.available) && <p className="kc-notice">All listed products are currently unavailable in this preview. Receive physical stock in the app before publishing if you want them shown as available.</p>}
      {preview.review.length > 0 && <p className="kc-notice">{preview.review.length} products still need size or color review in Products. Inactive sizes and colors are excluded.</p>}
      <p>Prices, purchase costs, expenses, exact quantities, local thumbnails, and customer or invoice details are excluded.</p>
      <label>Find by SKU or name<input value={query} onChange={event => setQuery(event.target.value)} /></label>
      <p className="kc-small">Snapshot of saved data. Refresh after making changes.</p>
      <div style={{ overflowX: 'auto' }}><table className="kc-size-table"><thead><tr><th>SKU / product</th><th>Website status</th><th>Sizes</th><th>Shared colors</th></tr></thead><tbody>
        {filtered.map(product => <tr key={product.id}>
          <td><strong>{product.sku} · {product.name}</strong>{product.legacySkus.length > 0 && <p className="kc-small">Previous SKU: {product.legacySkus.join(', ')}</p>}<p>{product.description}</p></td>
          <td>{!product.listed ? 'Archived · hidden' : product.available ? 'Available' : 'Unavailable'}</td>
          <td>{product.sizes.length ? product.sizes.map(size => `${size.label}: ${size.available ? 'Available' : 'Unavailable'}`).join(' · ') : 'No active sizes'}</td>
          <td>{product.colors.join(', ') || 'No active colors'}</td>
        </tr>)}
      </tbody></table></div>
      {filtered.length === 0 && <p>No matching products.</p>}
    </section>}
  </>;
}
