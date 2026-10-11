const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { FoundationStore, DEFAULT_PREFERENCES, parseBackup } = require('../foundation-store.cjs');
const { importCatalog } = require('../catalog.cjs');
const source = require('../../src/data/websiteCatalog.json');
const { calculatePrice, parseMoney } = require('../../src/redesign/domain/pricing');
const copy = value => JSON.parse(JSON.stringify(value));
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kutty-catalog-'));
  const store = new FoundationStore(directory);
  store.initializeCatalog(source);
  t.after(() => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return store;
}
const save = (store, product, operationId = randomUUID()) => store.saveProduct({ product, operationId });
function newProduct(store) {
  const p = copy(store.getCatalog().products[0]);
  return { ...p, id: null, sku: '', websiteId: '', legacySkus: [], sourceSizes: [], name: 'New product', revision: 0, variants: p.variants.map(v => ({ ...v, id: randomUUID() })) };
}
function envelope(payload) { return JSON.stringify({ format: 'kutty-couture-foundation', payload, checksum: createHash('sha256').update(JSON.stringify(payload)).digest('hex') }); }

test('catalog-only import preserves metadata and maps clothing without inventing stock, prices, or color splits', t => {
  const store = fixture(t);
  const { products, state } = store.getCatalog();
  assert.equal(products.length, 93);
  assert.equal(products.reduce((n, p) => n + p.variants.length, 0), 101);
  assert.equal(state.nextSku, 100093);
  assert.equal(state.report.missingColors, 53);
  assert.equal(state.report.ambiguousSizes, 10);
  assert.equal(products.find(p => p.sku === '100089').legacySkus[0], '200000');
  assert.equal(products.find(p => p.sku === '100089').websiteId, 'lollipop-ice-cream-printed-frock');
  assert.deepEqual(products.find(p => p.sku === '100089').variants.map(v => v.label), source.find(p => p.sku === 200000).sizes);
  assert.ok(products.every(p => p.variants.every(v => v.stock === 0 && v.purchaseCostPaise === 0 && v.sellingPricePaise === 0)));
  const ambiguous = products.find(p => p.sku === '100058');
  assert.equal(ambiguous.variants[0].active, false);
  assert.ok(ambiguous.review.includes('sizes'));
  assert.ok(products.some(p => p.colors.length === 1 && p.colors[0].label === 'Black and Rose Gold'));
  const duplicate = copy(source); duplicate[0].sku = 100089;
  assert.throws(() => importCatalog(duplicate), /collision/);
});

test('reopening/reimporting preserves changed prices and archives; repeated create allocates only one SKU', t => {
  const store = fixture(t);
  const existing = store.getCatalog().products[0];
  existing.variants[0].sellingPricePaise = 14950; existing.archived = true;
  save(store, existing);
  const second = new FoundationStore(store.directory);
  const reimported = second.initializeCatalog(source);
  assert.equal(reimported.products[0].variants[0].sellingPricePaise, 14950);
  assert.equal(reimported.products[0].archived, true);
  second.close();
  const draft = newProduct(store), operationId = randomUUID();
  save(store, draft, operationId); save(store, draft, operationId);
  assert.equal(store.getCatalog().products.length, 94);
  assert.equal(store.getCatalog().state.nextSku, 100094);
  draft.name = 'Another payload';
  assert.throws(() => save(store, draft, operationId), /already used/);
  save(store, newProduct(store));
  assert.equal(store.getCatalog().state.nextSku, 100095);
});

test('stale updates, identity changes, stock edits and removal of size history are rejected', t => {
  const store = fixture(t);
  const original = store.getCatalog().products.find(p => p.sku === '100089');
  save(store, original);
  assert.throws(() => save(store, original), /changed/);
  const fresh = store.getCatalog().products.find(p => p.id === original.id);
  for (const mutate of [p => { p.sku = '100001'; }, p => { p.variants[0].stock = 5; }, p => { p.variants.pop(); }, p => { p.variants[0].sellingPricePaise = -1; }, p => { p.variants[1].label = p.variants[0].label; }]) {
    const bad = copy(fresh); mutate(bad); assert.throws(() => save(store, bad));
  }
  const before = store.getCatalog().state.nextSku;
  const invalid = newProduct(store); invalid.name = '';
  assert.throws(() => save(store, invalid));
  assert.equal(store.getCatalog().state.nextSku, before);
  const reorder = copy(fresh); reorder.variants.reverse(); reorder.variants[0].active = false;
  const updated = save(store, reorder).products.find(p => p.id === original.id);
  assert.equal(updated.variants[0].id, fresh.variants[2].id);
});

test('calculator handles exact decimal money, markup, margin and rounded batch expenses', () => {
  assert.equal(parseMoney('149.50'), 14950);
  for (const value of ['-1', '', 'NaN', 'Infinity', '1.005']) assert.throws(() => parseMoney(value));
  const settings = { mode: 'markup', profitBps: 3000, expenseBasis: 'unit', units: 1, expensesPaise: { shipping: 1000, packaging: 500, other: 500 } };
  assert.equal(calculatePrice(10000, settings).sellingPricePaise, 15600);
  assert.equal(calculatePrice(10000, { ...settings, mode: 'margin', profitBps: 2500 }).sellingPricePaise, 16000);
  assert.throws(() => calculatePrice(10000, { ...settings, mode: 'margin', profitBps: 10000 }), /less than/);
  assert.throws(() => calculatePrice(10000, { ...settings, units: 0 }), /at least/);
  const batch = calculatePrice(10000, { ...settings, expenseBasis: 'purchase', units: 3, expensesPaise: { shipping: 100, packaging: 100, other: 100 } });
  assert.equal(batch.unitCostPaise, 10100);
  assert.deepEqual(batch.unitExpensesPaise, { shipping: 34, packaging: 33, other: 33 });
  assert.equal(batch.sellingPricePaise, 13130);
});

test('full backups restore product prices, variants, operation IDs and preserve the SKU high-water mark', t => {
  const store = fixture(t);
  const old = store.exportBackup();
  const created = newProduct(store); const op = randomUUID(); save(store, created, op);
  store.restoreBackup(old);
  assert.equal(store.getCatalog().products.length, 93);
  assert.equal(store.getCatalog().state.nextSku, 100094);
  save(store, newProduct(store));
  assert.ok(store.getCatalog().products.some(p => p.sku === '100094'));
  const snapshot = store.exportBackup();
  const p = store.getCatalog().products[0]; p.variants[0].sellingPricePaise = 12345; save(store, p);
  const result = store.restoreBackup(snapshot);
  assert.equal(result.catalog.products[0].variants[0].sellingPricePaise, 0);
  assert.equal(parseBackup(fs.readFileSync(result.safetyPath, 'utf8')).catalog.products[0].variants[0].sellingPricePaise, 12345);
  const broken = JSON.parse(snapshot).payload; broken.catalog.products[1].sku = broken.catalog.products[0].sku;
  assert.throws(() => store.restoreBackup(envelope(broken)), /identities/);
});

test('schema-one stores upgrade with a safety backup; old settings-only restore preserves catalog', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kutty-v1-'));
  let db = new DatabaseSync(path.join(directory, 'foundation.sqlite'));
  db.exec('CREATE TABLE preferences (id INTEGER PRIMARY KEY, value TEXT); PRAGMA user_version=1;');
  db.prepare('INSERT INTO preferences VALUES (1, ?)').run(JSON.stringify({ ...DEFAULT_PREFERENCES, theme: 'dark' }));
  db.close();
  const store = new FoundationStore(directory);
  t.after(() => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  assert.equal(store.getPreferences().theme, 'dark');
  const backups = fs.readdirSync(path.join(directory, 'safety-backups'));
  assert.equal(backups.length, 1);
  const text = fs.readFileSync(path.join(directory, 'safety-backups', backups[0]), 'utf8');
  assert.equal(parseBackup(text).schemaVersion, 1);
  store.initializeCatalog(source);
  store.updatePreferences({ theme: 'light' });
  store.restoreBackup(text);
  assert.equal(store.getPreferences().theme, 'dark');
  assert.equal(store.getCatalog().products.length, 93);
});
