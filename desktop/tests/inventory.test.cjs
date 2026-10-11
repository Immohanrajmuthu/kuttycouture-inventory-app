const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { FoundationStore, parseBackup } = require('../foundation-store.cjs');
const source = require('../../src/data/websiteCatalog.json');
const copy = value => JSON.parse(JSON.stringify(value));
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kutty-stock-'));
  const store = new FoundationStore(directory); store.initializeCatalog(source);
  t.after(() => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return store;
}
const product = store => store.getCatalog().products.find(p => p.sku === '100089');
const receive = p => ({ operationId: randomUUID(), productId: p.id, expectedRevision: p.revision, lines: p.variants.map((v, i) => ({ variantId: v.id, quantity: i === 0 ? 5 : 0, purchaseCostPaise: 15500 })) });
const adjust = p => ({ operationId: randomUUID(), productId: p.id, expectedRevision: p.revision, variantId: p.variants[0].id, actualQuantity: 4, reason: 'Count correction', note: 'Physical count' });
function envelope(payload) { return JSON.stringify({ format: 'kutty-couture-foundation', payload, checksum: createHash('sha256').update(JSON.stringify(payload)).digest('hex') }); }

test('receiving adds stock, updates only positive-row costs and shares one saved timestamp', t => {
  const store = fixture(t);
  const p = product(store);
  p.variants.forEach(v => { v.purchaseCostPaise = 10000; v.sellingPricePaise = 25000; });
  store.saveProduct({ operationId: randomUUID(), product: p });
  const command = receive(product(store)); command.lines[1].quantity = 3; command.lines[2].purchaseCostPaise = 'ignored for zero quantity';
  store.receiveStock(command);
  assert.deepEqual(product(store).variants.map(v => v.stock), [5, 3, 0]);
  assert.deepEqual(product(store).variants.map(v => v.purchaseCostPaise), [15500, 15500, 10000]);
  assert.ok(product(store).variants.every(v => v.sellingPricePaise === 25000));
  const history = store.getStockView().movements;
  assert.equal(history.length, 2);
  assert.equal(new Set(history.map(m => m.recordedAt)).size, 1);
  assert.equal(new Set(history.map(m => m.operationId)).size, 1);
  assert.equal(history[0].before, 0);
  assert.equal(history[0].purchaseCostPaise, 15500);
  assert.ok(history[0].sequence > history[1].sequence);
  assert.equal(store.getStockView().pendingAvailabilityCount, 1);
  store.receiveStock(receive(product(store)));
  assert.equal(product(store).variants[0].stock, 10);
});

test('duplicate receipt or correction affects stock only once; mismatched reuse is rejected', t => {
  const store = fixture(t);
  const command = receive(product(store)); store.receiveStock(command); store.receiveStock(command);
  assert.equal(product(store).variants[0].stock, 5);
  assert.equal(store.getStockView().movements.length, 1);
  const correction = adjust(product(store)); store.adjustStock(correction); store.adjustStock(correction);
  assert.equal(product(store).variants[0].stock, 4);
  assert.equal(store.getStockView().movements.length, 2);
  correction.actualQuantity = 2;
  assert.throws(() => store.adjustStock(correction), /already used/);
});

test('adjustments preserve financial fields and newest save appears before earlier receipts', t => {
  const store = fixture(t);
  store.receiveStock(receive(product(store)));
  const before = product(store).variants[0];
  store.adjustStock(adjust(product(store)));
  const after = product(store).variants[0];
  assert.equal(after.purchaseCostPaise, before.purchaseCostPaise);
  assert.equal(after.sellingPricePaise, before.sellingPricePaise);
  assert.deepEqual(after.unitExpensesPaise, before.unitExpensesPaise);
  const [latest, earlier] = store.getStockView().movements;
  assert.equal(latest.type, 'Adjustment'); assert.equal(latest.delta, -1); assert.equal(latest.after, 4);
  assert.equal(latest.note, 'Physical count'); assert.equal(earlier.type, 'Received');
  assert.ok(latest.sequence > earlier.sequence);
  // Sequence remains the authoritative save order even if the system clock moves back.
  const value = { ...latest, recordedAt: '2000-01-01T00:00:00Z' }; delete value.sequence;
  store.db.prepare('UPDATE stock_movements SET value=? WHERE id=?').run(JSON.stringify(value), latest.id);
  assert.equal(store.getStockView().movements[0].id, latest.id);
});

test('invalid, unchanged, inactive and stale commands leave balances and history unchanged', t => {
  const store = fixture(t);
  const p = product(store);
  for (const change of [c => { c.lines[0].quantity = -1; }, c => { c.lines[0].quantity = 1.5; }, c => { c.lines[0].purchaseCostPaise = -1; }, c => { c.lines.push(copy(c.lines[0])); }, c => { c.lines[0].variantId = 'missing'; }, c => { c.lines[0].quantity = 0; }]) {
    const command = receive(p); change(command); assert.throws(() => store.receiveStock(command));
  }
  const correction = adjust(p); correction.actualQuantity = 0;
  assert.throws(() => store.adjustStock(correction), /unchanged/);
  correction.actualQuantity = -1; assert.throws(() => store.adjustStock(correction));
  correction.actualQuantity = 2; correction.reason = ''; assert.throws(() => store.adjustStock(correction));
  assert.equal(store.getStockView().movements.length, 0);
  const stale = receive(p); p.variants[0].active = false; store.saveProduct({ operationId: randomUUID(), product: p });
  assert.throws(() => store.receiveStock(stale), /changed/);
  assert.throws(() => store.receiveStock(receive(product(store))), /Activate/);
  assert.equal(store.getStockView().movements.length, 0);
});

test('database failure rolls back movements, operation ID, cost, quantity and pending publication together', t => {
  const store = fixture(t);
  const before = store.getCatalog(); const command = receive(product(store));
  store.db.exec("CREATE TRIGGER reject_stock BEFORE UPDATE ON products BEGIN SELECT RAISE(ABORT, 'Simulated write failure'); END;");
  assert.throws(() => store.receiveStock(command), /write failure/);
  assert.deepEqual(store.getCatalog(), before);
  assert.deepEqual(store.getInventory(), { movements: [], operations: [], pendingAvailability: [] });
  store.db.exec('DROP TRIGGER reject_stock');
  store.receiveStock(command);
  assert.equal(product(store).variants[0].stock, 5);
});

test('stock backup restores matching history and balances and rejects tampered chains', t => {
  const store = fixture(t); store.receiveStock(receive(product(store)));
  const backup = store.exportBackup();
  store.adjustStock(adjust(product(store)));
  const restored = store.restoreBackup(backup);
  assert.equal(product(store).variants[0].stock, 5);
  assert.equal(restored.inventory.movements.length, 1);
  assert.equal(parseBackup(fs.readFileSync(restored.safetyPath, 'utf8')).inventory.movements.length, 2);
  const modified = JSON.parse(backup).payload;
  modified.catalog.products.find(p => p.sku === '100089').variants[0].stock = 20;
  assert.throws(() => store.restoreBackup(envelope(modified)), /balance/);
  const missing = JSON.parse(backup).payload; missing.inventory.movements = [];
  assert.throws(() => store.restoreBackup(envelope(missing)), /missing/);
  const second = new FoundationStore(store.directory);
  assert.equal(second.getStockView().movements.length, 1); assert.equal(product(second).variants[0].stock, 5); second.close();
});

test('schema-two restore clears subsequent stock history to that backup point', t => {
  const store = fixture(t);
  const payload = JSON.parse(store.exportBackup()).payload; payload.schemaVersion = 2; delete payload.inventory;
  store.receiveStock(receive(product(store)));
  store.restoreBackup(envelope(payload));
  assert.equal(product(store).variants[0].stock, 0);
  assert.equal(store.getStockView().movements.length, 0);
  assert.equal(store.getStockView().pendingAvailabilityCount, 0);
});

test('schema-two upgrade creates a catalog safety backup before adding stock tables', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kutty-stock-upgrade-'));
  let store = new FoundationStore(directory); store.initializeCatalog(source);
  store.db.exec('DROP TABLE stock_movements; DROP TABLE stock_operations; DROP TABLE pending_availability; PRAGMA user_version=2;');
  store.close();
  store = new FoundationStore(directory);
  t.after(() => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const files = fs.readdirSync(path.join(directory, 'safety-backups'));
  assert.equal(files.length, 1);
  const backup = parseBackup(fs.readFileSync(path.join(directory, 'safety-backups', files[0]), 'utf8'));
  assert.equal(backup.schemaVersion, 2); assert.equal(backup.catalog.products.length, 93);
  assert.equal(store.getStockView().movements.length, 0);
});
