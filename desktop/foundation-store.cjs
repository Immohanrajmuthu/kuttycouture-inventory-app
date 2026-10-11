const { DatabaseSync } = require('node:sqlite');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { validateProduct, importCatalog, prepareProduct, IMPORT_ID } = require('./catalog.cjs');
const { applyStock, validateCommand, validateInventory } = require('./inventory.cjs');

const SCHEMA_VERSION = 3;
const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const SCREENS = ['products', 'receive', 'adjust', 'history', 'publish', 'new-bill', 'bills', 'settings'];
const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'system', lastScreen: 'products', shopName: 'Kutty Couture',
  place: 'Kelambakkam, Chennai', phone: '8610971628', website: 'kuttycouture.in',
  instagram: '@kuttycouture.in', footer: 'Thank you for shopping with Kutty Couture!',
});

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function validatePreferences(value, partial = false) {
  if (!plainObject(value)) throw new Error('Preferences must be an object.');
  const keys = Object.keys(DEFAULT_PREFERENCES);
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error('Unknown preference.');
  if (!partial && keys.some(key => !Object.hasOwn(value, key))) throw new Error('Incomplete preferences.');
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string' || entry.length > 200 || /[\u0000-\u001f]/.test(entry)) {
      throw new Error('Invalid preference value.');
    }
    if (key === 'theme' && !['system', 'light', 'dark'].includes(entry)) throw new Error('Invalid theme.');
    if (key === 'lastScreen' && !SCREENS.includes(entry)) throw new Error('Invalid screen.');
    if (key === 'shopName' && !entry.trim()) throw new Error('Business name is required.');
  }
  return value;
}

function checksum(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
function parseBackup(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BACKUP_BYTES) throw new Error('Backup is too large.');
  let envelope;
  try { envelope = JSON.parse(text); } catch { throw new Error('This is not a valid JSON backup.'); }
  if (!plainObject(envelope) || envelope.format !== 'kutty-couture-foundation'
    || !plainObject(envelope.payload) || ![1, 2, SCHEMA_VERSION].includes(envelope.payload.schemaVersion)) {
    throw new Error('This backup is not compatible with the foundation workspace.');
  }
  if (envelope.checksum !== checksum(envelope.payload)) throw new Error('Backup integrity check failed.');
  const payload = envelope.payload;
  const expectedKeys = payload.schemaVersion === 1 ? 'createdAt,preferences,schemaVersion' : payload.schemaVersion === 2 ? 'catalog,createdAt,operations,preferences,schemaVersion' : 'catalog,createdAt,inventory,operations,preferences,schemaVersion';
  if (Object.keys(payload).sort().join(',') !== expectedKeys
    || typeof payload.createdAt !== 'string' || !Number.isFinite(Date.parse(payload.createdAt))) {
    throw new Error('Invalid backup structure.');
  }
  validatePreferences(payload.preferences);
  if (payload.schemaVersion >= 2) {
    validateCatalog(payload.catalog);
    if (!Array.isArray(payload.operations) || payload.operations.length > 20000) throw new Error('Invalid operation history.');
    const ids = new Set();
    for (const operation of payload.operations) {
      if (!plainObject(operation) || Object.keys(operation).sort().join(',') !== 'id,productId,requestHash'
        || typeof operation.id !== 'string' || operation.id.length > 100 || ids.has(operation.id)
        || !/^[a-f0-9]{64}$/.test(operation.requestHash) || !payload.catalog.products.some(p => p.id === operation.productId)) throw new Error('Invalid operation history.');
      ids.add(operation.id);
    }
    validateInventory(payload.schemaVersion === 3 ? payload.inventory : { movements: [], operations: [], pendingAvailability: [] }, payload.catalog);
  }
  return payload;
}

function validateCatalog(catalog) {
  if (!plainObject(catalog) || !Array.isArray(catalog.products) || catalog.products.length > 10000
    || Object.keys(catalog).sort().join(',') !== 'products,state'
    || !plainObject(catalog.state) || !Number.isSafeInteger(catalog.state.nextSku) || catalog.state.nextSku < 100000 || catalog.state.nextSku > 999999999
    || Object.keys(catalog.state).sort().join(',') !== 'importId,nextSku,report'
    || ![null, IMPORT_ID].includes(catalog.state.importId)) throw new Error('Invalid catalog backup.');
  const report = catalog.state.report;
  if (catalog.state.importId === IMPORT_ID) {
    if (!plainObject(report) || Object.keys(report).sort().join(',') !== 'accessories,ambiguousSizes,clothing,count,importedAt,missingColors,skuMap'
      || typeof report.importedAt !== 'string' || !Number.isFinite(Date.parse(report.importedAt))
      || !plainObject(report.skuMap) || JSON.stringify(report.skuMap) !== JSON.stringify(require('./catalog.cjs').SKU_MAP)) throw new Error('Invalid import report.');
    for (const key of ['count','accessories','clothing','missingColors','ambiguousSizes']) if (!Number.isSafeInteger(report[key]) || report[key] < 0 || report[key] > 10000) throw new Error('Invalid import counts.');
  } else if (report !== null) throw new Error('Invalid import report.');
  const ids = new Set(), skus = new Set();
  for (const p of catalog.products) {
    validateProduct(p);
    if (ids.has(p.id) || skus.has(p.sku) || Number(p.sku) >= catalog.state.nextSku) throw new Error('Invalid catalog identities or SKU sequence.');
    ids.add(p.id); skus.add(p.sku);
  }
}

// Isolated by construction: no legacy path, environment override, or .storage-config lookup.
function developmentDirectory(projectRoot) {
  return path.join(path.resolve(projectRoot), '.local', 'redesign');
}

class FoundationStore {
  constructor(directory) {
    this.directory = directory;
    fs.mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(path.join(directory, 'foundation.sqlite'));
    try {
      this.db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      if (version > SCHEMA_VERSION) throw new Error('This workspace was created by a newer app.');
      this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
      if (version === 0) this.transaction(() => {
        this.db.exec('CREATE TABLE preferences (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL CHECK (json_valid(value)));');
        this.db.prepare('INSERT INTO preferences VALUES (1, ?)').run(JSON.stringify(DEFAULT_PREFERENCES));
        this.db.exec('PRAGMA user_version = 1');
      });
      if (version < 2) {
        if (version === 1) {
          const backups = path.join(directory, 'safety-backups');
          fs.mkdirSync(backups, { recursive: true });
          this.writeBackup(path.join(backups, `before-schema-2-${randomUUID()}.json`));
        }
        this.transaction(() => {
          this.db.exec(`CREATE TABLE products (id TEXT PRIMARY KEY, sku TEXT NOT NULL UNIQUE, value TEXT NOT NULL CHECK(json_valid(value)));
            CREATE TABLE catalog_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL CHECK(json_valid(value)));
            CREATE TABLE catalog_operations (id TEXT PRIMARY KEY, requestHash TEXT NOT NULL, productId TEXT NOT NULL REFERENCES products(id));`);
          this.db.prepare('INSERT INTO catalog_state VALUES (1, ?)').run(JSON.stringify({ nextSku: 100000, importId: null, report: null }));
          this.db.exec('PRAGMA user_version = 2');
        });
      }
      if (version < 3) {
        validateInventory({ movements: [], operations: [], pendingAvailability: [] }, this.getCatalog());
        if (version === 2) {
          const backups = path.join(directory, 'safety-backups');
          fs.mkdirSync(backups, { recursive: true });
          this.writeBackup(path.join(backups, `before-schema-3-${randomUUID()}.json`));
        }
        this.transaction(() => {
          this.db.exec(`CREATE TABLE stock_operations (id TEXT PRIMARY KEY, requestHash TEXT NOT NULL, productId TEXT NOT NULL REFERENCES products(id), type TEXT NOT NULL, recordedAt TEXT NOT NULL);
            CREATE TABLE stock_movements (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, operationId TEXT NOT NULL REFERENCES stock_operations(id), value TEXT NOT NULL CHECK(json_valid(value)));
            CREATE TABLE pending_availability (productId TEXT PRIMARY KEY REFERENCES products(id), updatedAt TEXT NOT NULL);
            PRAGMA user_version = 3;`);
        });
      }
      validatePreferences(this.getPreferences());
      validateCatalog(this.getCatalog());
      validateInventory(this.getInventory(), this.getCatalog());
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  // Synchronous callbacks ensure no event-loop work can interleave inside a transaction.
  transaction(work) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      if (result && typeof result.then === 'function') throw new Error('Transactions must be synchronous.');
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getPreferences() {
    return JSON.parse(this.db.prepare('SELECT value FROM preferences WHERE id = 1').get().value);
  }

  updatePreferences(patch) {
    validatePreferences(patch, true);
    return this.transaction(() => {
      const next = { ...this.getPreferences(), ...patch };
      validatePreferences(next);
      this.db.prepare('UPDATE preferences SET value = ? WHERE id = 1').run(JSON.stringify(next));
      return next;
    });
  }

  exportBackup() {
    const payload = this.transaction(() => {
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      return { schemaVersion: version, createdAt: new Date().toISOString(), preferences: this.getPreferences(),
        ...(version >= 2 ? { catalog: this.getCatalog(), operations: this.db.prepare('SELECT * FROM catalog_operations').all().map(row => ({ ...row })) } : {}),
        ...(version >= 3 ? { inventory: this.getInventory() } : {}) };
    });
    const text = JSON.stringify({ format: 'kutty-couture-foundation', payload, checksum: checksum(payload) }, null, 2);
    if (Buffer.byteLength(text) > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the supported size.');
    return text;
  }

  writeBackup(destination) {
    const text = this.exportBackup();
    const temporary = `${destination}.${randomUUID()}.tmp`;
    let descriptor;
    try {
      descriptor = fs.openSync(temporary, 'wx');
      fs.writeFileSync(descriptor, text, 'utf8');
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporary, destination);
      return destination;
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }

  restoreBackup(text) {
    const payload = parseBackup(text);
    const backupDirectory = path.join(this.directory, 'safety-backups');
    fs.mkdirSync(backupDirectory, { recursive: true });
    const safetyPath = path.join(backupDirectory, `before-restore-${randomUUID()}.json`);
    // If this fails, do not begin replacing the current data.
    this.writeBackup(safetyPath);
    this.transaction(() => {
      this.db.prepare('UPDATE preferences SET value = ? WHERE id = 1').run(JSON.stringify(payload.preferences));
      if (payload.schemaVersion >= 2) {
        const highWater = this.getCatalog().state.nextSku;
        this.db.exec('DELETE FROM stock_movements; DELETE FROM stock_operations; DELETE FROM pending_availability; DELETE FROM catalog_operations; DELETE FROM products;');
        const insert = this.db.prepare('INSERT INTO products VALUES (?, ?, ?)');
        for (const p of payload.catalog.products) insert.run(p.id, p.sku, JSON.stringify(p));
        this.db.prepare('UPDATE catalog_state SET value = ? WHERE id = 1').run(JSON.stringify({ ...payload.catalog.state, nextSku: Math.max(highWater, payload.catalog.state.nextSku) }));
        const op = this.db.prepare('INSERT INTO catalog_operations VALUES (?, ?, ?)');
        for (const item of payload.operations) op.run(item.id, item.requestHash, item.productId);
        if (payload.schemaVersion === 3) {
          const stockOp = this.db.prepare('INSERT INTO stock_operations VALUES (?, ?, ?, ?, ?)');
          for (const item of payload.inventory.operations) stockOp.run(item.id, item.requestHash, item.productId, item.type, item.recordedAt);
          const movement = this.db.prepare('INSERT INTO stock_movements VALUES (?, ?, ?, ?)');
          for (const { sequence, ...item } of payload.inventory.movements) movement.run(sequence, item.id, item.operationId, JSON.stringify(item));
          const pending = this.db.prepare('INSERT INTO pending_availability VALUES (?, ?)');
          for (const item of payload.inventory.pendingAvailability) pending.run(item.productId, item.updatedAt);
        }
      }
    });
    return { preferences: this.getPreferences(), safetyPath, catalog: this.getCatalog(), inventory: this.getStockView() };
  }

  getCatalog() {
    return { products: this.db.prepare('SELECT value FROM products ORDER BY sku').all().map(row => JSON.parse(row.value)),
      state: JSON.parse(this.db.prepare('SELECT value FROM catalog_state WHERE id=1').get().value) };
  }

  initializeCatalog(source) {
    return this.transaction(() => {
      const current = this.getCatalog();
      if (current.state.importId === IMPORT_ID) return current;
      if (current.products.length) throw new Error('Catalog import requires an empty workspace. Existing products were preserved.');
      const imported = importCatalog(source);
      const insert = this.db.prepare('INSERT INTO products VALUES (?, ?, ?)');
      for (const p of imported.products) insert.run(p.id, p.sku, JSON.stringify(p));
      this.db.prepare('UPDATE catalog_state SET value=? WHERE id=1').run(JSON.stringify({ nextSku: Math.max(current.state.nextSku, imported.nextSku), importId: imported.importId, report: imported.report }));
      return this.getCatalog();
    });
  }

  saveProduct(command) {
    if (!plainObject(command) || Object.keys(command).sort().join(',') !== 'operationId,product'
      || typeof command.operationId !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(command.operationId)
      || !plainObject(command.product)) throw new Error('Invalid product command.');
    return this.transaction(() => {
      const requestHash = checksum(command.product);
      const applied = this.db.prepare('SELECT * FROM catalog_operations WHERE id=?').get(command.operationId);
      if (applied) {
        if (applied.requestHash !== requestHash) throw new Error('This save identifier was already used for another change.');
        return this.getCatalog();
      }
      const draft = command.product;
      const existing = draft.id ? this.db.prepare('SELECT value FROM products WHERE id=?').get(draft.id) : null;
      const previous = existing ? JSON.parse(existing.value) : null;
      if (draft.id && !previous) throw new Error('Product no longer exists. Reload the catalog.');
      if (previous && previous.revision !== draft.revision) throw new Error('This product has changed. Reopen it before saving.');
      const catalog = this.getCatalog();
      if (!previous && catalog.state.nextSku >= 999999999) throw new Error('SKU range exhausted.');
      const hasHistory = previous && this.db.prepare('SELECT 1 FROM stock_operations WHERE productId=? LIMIT 1').get(previous.id);
      const product = prepareProduct(draft, previous, String(catalog.state.nextSku), !hasHistory);
      this.db.prepare('INSERT INTO products VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(product.id, product.sku, JSON.stringify(product));
      if (!previous) this.db.prepare('UPDATE catalog_state SET value=? WHERE id=1').run(JSON.stringify({ ...catalog.state, nextSku: catalog.state.nextSku + 1 }));
      this.db.prepare('INSERT INTO catalog_operations VALUES (?, ?, ?)').run(command.operationId, requestHash, product.id);
      return this.getCatalog();
    });
  }

  getInventory() {
    return { movements: this.db.prepare('SELECT sequence, value FROM stock_movements ORDER BY sequence DESC').all().map(row => ({ ...JSON.parse(row.value), sequence: row.sequence })),
      operations: this.db.prepare('SELECT * FROM stock_operations').all().map(row => ({ ...row })),
      pendingAvailability: this.db.prepare('SELECT * FROM pending_availability').all().map(row => ({ ...row })) };
  }

  getStockView() {
    const { movements, pendingAvailability } = this.getInventory();
    return { movements, pendingAvailabilityCount: pendingAvailability.length };
  }

  receiveStock(command) { return this.saveStock(command, 'Received'); }
  adjustStock(command) { return this.saveStock(command, 'Adjustment'); }

  saveStock(command, type) {
    validateCommand(command, type);
    return this.transaction(() => {
      const requestHash = checksum({ type, command });
      const applied = this.db.prepare('SELECT requestHash FROM stock_operations WHERE id=?').get(command.operationId);
      if (applied) {
        if (applied.requestHash !== requestHash) throw new Error('This operation was already used for a different stock change.');
        return { catalog: this.getCatalog(), inventory: this.getStockView() };
      }
      const row = this.db.prepare('SELECT value FROM products WHERE id=?').get(command.productId);
      if (!row) throw new Error('Product no longer exists. Reload the catalog.');
      const result = applyStock(JSON.parse(row.value), command, type);
      const now = result.product.updatedAt;
      this.db.prepare('INSERT INTO stock_operations VALUES (?, ?, ?, ?, ?)').run(command.operationId, requestHash, command.productId, type, now);
      const movement = this.db.prepare('INSERT INTO stock_movements (id, operationId, value) VALUES (?, ?, ?)');
      for (const item of result.movements) movement.run(item.id, item.operationId, JSON.stringify(item));
      this.db.prepare('UPDATE products SET value=? WHERE id=?').run(JSON.stringify(result.product), result.product.id);
      if (result.availabilityChanged) this.db.prepare('INSERT INTO pending_availability VALUES (?, ?) ON CONFLICT(productId) DO UPDATE SET updatedAt=excluded.updatedAt').run(command.productId, now);
      return { catalog: this.getCatalog(), inventory: this.getStockView() };
    });
  }

  close() { this.db.close(); }
}

module.exports = { FoundationStore, DEFAULT_PREFERENCES, SCREENS, parseBackup, validatePreferences, developmentDirectory, MAX_BACKUP_BYTES };
