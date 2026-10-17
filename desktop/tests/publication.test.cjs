const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { importCatalog } = require('../catalog.cjs');
const { publicCatalog, publicationPreview } = require('../public-catalog.cjs');
const { publicationCredentials } = require('../publication-credentials.cjs');
const { publicationConnection } = require('../publication-connection.cjs');
const source = require('../../src/data/websiteCatalog.json');
const catalog = () => importCatalog(source).products;

test('connection verification uses only fixed GitHub read endpoints and does not claim write access', async () => {
  const requests = [];
  const connection = publicationConnection({ read: () => 'private-test-token' }, async (url, options) => {
    requests.push(url);
    assert.equal(options.headers.Authorization, 'Bearer private-test-token');
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, undefined);
    return { ok: true, status: 200, json: async () => requests.length === 1 ? { full_name: 'Immohanrajmuthu/kuttycouture-website' } : { name: 'main', commit: { sha: 'a'.repeat(40) } } };
  });
  const result = await connection.verify();
  assert.equal(result.readVerified, true);
  assert.equal(result.writeVerified, false);
  assert.doesNotMatch(JSON.stringify(result), /private-test-token/);
  assert.deepEqual(requests, ['https://api.github.com/repos/Immohanrajmuthu/kuttycouture-website', 'https://api.github.com/repos/Immohanrajmuthu/kuttycouture-website/branches/main']);
});

test('connection failures are actionable and never expose credential-bearing remote errors', async () => {
  const credentials = { read: () => 'SECRET_TOKEN' };
  for (const status of [401, 403, 404, 429, 500]) {
    const connection = publicationConnection(credentials, async () => ({ status, ok: false, json: async () => { throw new Error('SECRET_TOKEN'); } }));
    await assert.rejects(connection.verify(), error => !error.message.includes('SECRET_TOKEN') && error.message.length > 20);
  }
  await assert.rejects(publicationConnection(credentials, async () => { throw new Error('SECRET_TOKEN'); }).verify(), /Check your internet connection/);
  await assert.rejects(publicationConnection(credentials, async () => ({ ok: true, status: 200, json: async () => ({ full_name: 'someone/else' }) })).verify(), /unexpected repository/);
});

test('public projection preserves website identity and clothing aliases without private fields', () => {
  const products = catalog();
  products[0].thumbnail = 'PRIVATE_IMAGE';
  products[0].unexpectedSecret = 'PRIVATE_SECRET';
  const payload = publicCatalog(products);
  assert.equal(payload.products.length, 93);
  assert.equal(new Set(payload.products.map(product => product.sku)).size, 93);
  const clothing = payload.products.find(product => product.sku === '100089');
  assert.equal(clothing.id, 'lollipop-ice-cream-printed-frock');
  assert.deepEqual(clothing.legacySkus, ['200000']);
  for (const product of payload.products) {
    assert.deepEqual(Object.keys(product).sort(), ['id', 'sku', 'legacySkus', 'name', 'category', 'productType', 'description', 'listed', 'colors', 'sizes', 'available'].sort());
    for (const size of product.sizes) assert.deepEqual(Object.keys(size).sort(), ['available', 'label']);
    assert.equal(product.available, false);
  }
  assert.doesNotMatch(JSON.stringify(payload), /PRIVATE|stock|price|cost|expense|thumbnail|customer|invoice/i);
});

test('availability follows active size boundaries, shared colors and archive status', () => {
  const product = catalog().find(product => product.sku === '100089');
  product.variants[0].stock = 3;
  product.variants[1].stock = 9; product.variants[1].active = false;
  product.colors = [{ id: 'pink', label: 'Pink', active: true }, { id: 'blue', label: 'Blue', active: false }];
  let projected = publicCatalog([product]).products[0];
  assert.equal(projected.available, true);
  assert.equal(projected.sizes.length, product.variants.length - 1);
  assert.deepEqual(projected.colors, ['Pink']);
  product.variants[0].stock = 0;
  assert.equal(publicCatalog([product]).products[0].available, false);
  product.archived = true; product.variants[0].stock = 3;
  projected = publicCatalog([product]).products[0];
  assert.equal(projected.listed, false);
  assert.ok(projected.sizes.every(size => !size.available));
});

test('snapshot version ignores private changes and order, but tracks public edits and availability', () => {
  const products = catalog();
  const initial = publicationPreview(products);
  assert.equal(initial.review.length, 63);
  products.reverse();
  products[0].variants[0].purchaseCostPaise = 123;
  products[0].variants[0].sellingPricePaise = 456;
  assert.equal(publicationPreview(products).version, initial.version);
  products[0].name += ' updated';
  const renamed = publicationPreview(products).version;
  assert.notEqual(renamed, initial.version);
  products[0].variants[0].stock = 1;
  const available = publicationPreview(products).version;
  assert.notEqual(available, renamed);
  products[0].variants[0].stock = 5;
  assert.equal(publicationPreview(products).version, available);
});

test('new listings use stable SKU identity and collisions fail before publication', () => {
  const products = catalog();
  products[0].websiteId = '';
  assert.equal(publicCatalog(products).products[0].id, 'kc-100000');
  products[1].websiteId = 'kc-100000';
  assert.throws(() => publicCatalog(products), /Duplicate website id/);
});

test('credential store writes ciphertext only and refuses unavailable or plaintext backends', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-credentials-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const token = 'github_pat_fixture_for_test_only';
  const secure = { isEncryptionAvailable: () => true, encryptString: value => {
    assert.equal(value, token); return Buffer.from('encrypted-test-value');
  }, decryptString: bytes => { assert.equal(bytes.toString(), 'encrypted-test-value'); return token; } };
  const credentials = publicationCredentials(directory, secure);
  assert.equal(credentials.status().saved, false);
  assert.deepEqual(credentials.save(token), { saved: true, encryptionAvailable: true });
  assert.equal(credentials.read(), token);
  assert.doesNotMatch(fs.readFileSync(path.join(directory, 'github-publishing.enc'), 'utf8'), /github_pat/);
  assert.throws(() => credentials.save('bad\nvalue'), /valid GitHub token/);
  assert.equal(credentials.read(), token);
  const unavailable = publicationCredentials(directory, { ...secure, isEncryptionAvailable: () => false });
  assert.throws(() => unavailable.save(token), /unavailable/);
  const insecure = publicationCredentials(directory, { ...secure, getSelectedStorageBackend: () => 'basic_text' });
  assert.throws(() => insecure.save(token), /unavailable/);
  credentials.remove();
  assert.equal(credentials.status().saved, false);
  assert.throws(() => credentials.read(), /Set up/);
});
