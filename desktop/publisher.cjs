const { createHash, randomUUID } = require('node:crypto');
const { publicationPreview } = require('./public-catalog.cjs');
const FILE = 'kuttycouture-website/public/catalog-publication.json';
const API = `https://api.github.com/repos/Immohanrajmuthu/kuttycouture-website/contents/${FILE}`;
const LIVE = 'https://kuttycouture.in/catalog-publication.json';
const hash = payload => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
function envelope(value) {
  if (value?.format !== 'kutty-couture-publication-v1') throw new Error('Website publishing setup is missing or incompatible.');
  if (value.version === null && value.payload === null) return value;
  if (!value.payload || value.payload.schemaVersion !== 1 || !Array.isArray(value.payload.products) || value.version !== hash(value.payload)) throw new Error('The website catalog version is invalid.');
  const ids = new Set();
  for (const p of value.payload.products) {
    if (!p || typeof p.id !== 'string' || typeof p.sku !== 'string' || typeof p.name !== 'string' || ids.has(p.id)) throw new Error('The website catalog identities are invalid.');
    ids.add(p.id);
  }
  return value;
}
function differences(previous, next) {
  const old = new Map((previous?.products || []).map(p => [p.id, p]));
  const changes = [];
  for (const product of next.products) {
    const before = old.get(product.id);
    if (JSON.stringify(before) !== JSON.stringify(product)) changes.push({ sku: product.sku, name: product.name, action: !before ? 'Add' : !product.listed && before.listed ? 'Hide' : 'Update', fields: Object.keys(product).filter(key => JSON.stringify(before?.[key]) !== JSON.stringify(product[key])) });
    old.delete(product.id);
  }
  for (const product of old.values()) changes.push({ sku: product.sku, name: product.name, action: 'Remove', fields: [] });
  return changes;
}
function publisher({ credentials, products, fetchRequest = fetch, history = { read: () => null, write: () => {} } }) {
  let review;
  let writing = false;
  async function request(url, options = {}) {
    let response;
    try { response = await fetchRequest(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000), cache: 'no-store' }); }
    catch { throw new Error('Connection interrupted. Your saved products are safe. Retry to check whether GitHub received this version.'); }
    if (!response.ok) {
      if (response.status === 404) throw new Error('Website publishing setup is not installed on main yet.');
      if ([401, 403].includes(response.status)) throw new Error('GitHub access was denied. Check token expiry and Contents read/write permission.');
      if ([409, 422].includes(response.status)) throw new Error('The website changed since your review. Review changes again before publishing.');
      throw new Error('The website service is unavailable. Try again later.');
    }
    let text;
    try {
      const reader = response.body.getReader(); const chunks = []; let length = 0;
      while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 3000000) { await reader.cancel(); throw new Error(); } chunks.push(Buffer.from(part.value)); }
      text = Buffer.concat(chunks).toString('utf8');
      return JSON.parse(text);
    } catch { throw new Error('The website service returned an invalid or oversized response.'); }
  }
  const headers = () => ({ Authorization: `Bearer ${credentials.read()}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
  async function remote() {
    const result = await request(`${API}?ref=main`, { headers: headers() });
    if (result.type !== 'file' || result.encoding !== 'base64' || typeof result.content !== 'string' || !/^[a-f0-9]{40}$/.test(result.sha || '')) throw new Error('GitHub returned an invalid catalog file.');
    let data;
    try { data = JSON.parse(Buffer.from(result.content, 'base64').toString('utf8')); } catch { throw new Error('The remote catalog file is invalid.'); }
    return { sha: result.sha, document: envelope(data) };
  }
  async function prepare() {
    review = null;
    const current = publicationPreview(products());
    if (Buffer.byteLength(JSON.stringify({ format: 'kutty-couture-publication-v1', version: current.version, payload: current.payload }, null, 2)) > 900000) throw new Error('The public catalog exceeds the supported publishing size. Contact support before publishing.');
    const base = await remote();
    review = { ...current, base, token: randomUUID(), expires: Date.now() + 15 * 60000 };
    return { ...current, reviewToken: review.token, changes: differences(base.document.payload, current.payload), firstPublication: base.document.version === null, submittedVersion: base.document.version };
  }
  async function publish(token, confirmAvailabilityReplacement = false) {
    if (writing) throw new Error('A publication is already in progress.');
    if (!review || token !== review.token || Date.now() > review.expires) throw new Error('Review website changes again before publishing.');
    const sent = review;
    if (publicationPreview(products()).version !== sent.version) throw new Error('Products changed after your review. Review website changes again.');
    if (sent.base.document.version === null && confirmAvailabilityReplacement !== true) throw new Error('Confirm that the first publication replaces website availability with app stock availability before publishing.');
    writing = true;
    try {
      const latest = await remote();
      if (latest.document.version !== sent.version) {
        if (latest.sha !== sent.base.sha) throw new Error('The website changed since your review. Review changes again.');
        const document = { format: 'kutty-couture-publication-v1', version: sent.version, payload: sent.payload };
        await request(API, { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ branch: 'main', sha: latest.sha, message: `Publish catalog ${sent.version.slice(0, 12)}`, content: Buffer.from(JSON.stringify(document, null, 2) + '\n').toString('base64') }) });
      }
      return { version: sent.version, state: 'submitted', pendingNewChanges: publicationPreview(products()).version !== sent.version };
    } finally { writing = false; }
  }
  async function status() {
    const lastConfirmed = history.read();
    let latest;
    try { latest = await remote(); }
    catch (error) { return { state: 'unconfirmed', lastConfirmed, message: error.message }; }
    let live;
    try { live = envelope(await request(`${LIVE}?check=${Date.now()}`)); }
    catch { return { state: 'unconfirmed', lastConfirmed, submittedVersion: latest.document.version, message: 'Live deployment could not be verified. Retry after Netlify finishes.' }; }
    const current = publicationPreview(products());
    const checkedAt = new Date().toISOString();
    const confirmed = live.version ? { version: live.version, checkedAt } : lastConfirmed;
    let historyWarning;
    if (live.version) { try { history.write(confirmed); } catch { historyWarning = 'Live status verified, but could not save its timestamp on this laptop.'; } }
    return { state: latest.document.version && live.version === latest.document.version ? 'live' : !latest.document.version && !live.version ? 'ready' : 'waiting', lastConfirmed: confirmed, historyWarning, submittedVersion: latest.document.version, liveVersion: live.version, pendingChanges: differences(live.payload, current.payload).length, checkedAt };
  }
  return { prepare, publish, status };
}
module.exports = { publisher, differences, envelope };
