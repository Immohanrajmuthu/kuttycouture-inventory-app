const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { FoundationStore, parseBackup } = require('./foundation-store.cjs');

// One-time operator command; uses the ordinary adjustment rules and ledger.
function initializeZeroStock(store, expectedDate) {
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  if (today() !== expectedDate) throw new Error('Date changed. Review the requested stock-entry date again.');
  const transaction = store.transaction;
  return transaction.call(store, () => {
    // Everything below is synchronous and already inside BEGIN IMMEDIATE.
    // Reuse public stock/backup commands without starting nested transactions.
    store.transaction = action => action();
    try {
      const before = store.getCatalog();
      const targets = before.products.flatMap(p => p.variants.filter(v => v.stock === 0).map(v => ({ productId: p.id, variantId: v.id })));
      if (!targets.length) return { updatedEntries: 0, updatedProducts: 0 };
      const backupDirectory = path.join(store.directory, 'safety-backups');
      fs.mkdirSync(backupDirectory, { recursive: true });
      const backupPath = path.join(backupDirectory, `before-zero-stock-setup-${expectedDate}-${randomUUID()}.json`);
      store.writeBackup(backupPath);
      parseBackup(fs.readFileSync(backupPath, 'utf8'));
      const oldMovementCount = store.getInventory().movements.length;
      for (const target of targets) {
        const product = store.getCatalog().products.find(p => p.id === target.productId);
        store.adjustStock({ operationId: randomUUID(), productId: product.id, expectedRevision: product.revision,
          variantId: target.variantId, actualQuantity: 1, reason: 'Other',
          note: 'Initial stock setup requested by owner: zero quantity set to 1.' });
      }
      if (today() !== expectedDate) throw new Error('Date changed during setup. No stock updates were committed.');
      // Full backup validation reconciles stock movements and invoice history.
      parseBackup(store.exportBackup());
      const after = store.getCatalog();
      for (const original of before.products) {
        const current = after.products.find(p => p.id === original.id);
        for (const variant of original.variants) {
          const updated = current.variants.find(v => v.id === variant.id);
          if (JSON.stringify({ ...updated, stock: variant.stock }) !== JSON.stringify(variant)
            || updated.stock !== (variant.stock === 0 ? 1 : variant.stock)) throw new Error('Unexpected stock or pricing change.');
        }
      }
      if (store.getInventory().movements.length !== oldMovementCount + targets.length) throw new Error('Missing stock history entries.');
      return { updatedEntries: targets.length, updatedProducts: new Set(targets.map(t => t.productId)).size, date: expectedDate, backupPath };
    } finally { store.transaction = transaction; }
  });
}
if (require.main === module) {
  const directory = path.resolve(process.argv[2]);
  if (!fs.existsSync(path.join(directory, 'foundation.sqlite'))) throw new Error('Existing database required.');
  const store = new FoundationStore(directory);
  try { console.log(JSON.stringify(initializeZeroStock(store, process.argv[3]))); }
  finally { store.close(); }
}
module.exports = { initializeZeroStock };
