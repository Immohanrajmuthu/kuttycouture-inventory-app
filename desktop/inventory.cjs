const { randomUUID } = require('node:crypto');
const { integer } = require('../src/redesign/domain/pricing');
const { validateProduct } = require('./catalog.cjs');

const REASONS = ['Count correction', 'Damaged', 'Missing', 'Other'];
const isObject = value => value && Object.getPrototypeOf(value) === Object.prototype;
function fields(value, expected) {
  if (!isObject(value) || Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) throw new Error('Invalid stock command structure.');
}
function validId(value) { return typeof value === 'string' && /^[a-zA-Z0-9-]{16,100}$/.test(value); }
function validateCommand(command, type) {
  if (!['Received', 'Adjustment'].includes(type)) throw new Error('Unsupported stock operation.');
  const common = ['operationId', 'productId', 'expectedRevision'];
  fields(command, type === 'Received' ? [...common, 'lines'] : [...common, 'variantId', 'actualQuantity', 'reason', 'note']);
  if (!validId(command.operationId) || typeof command.productId !== 'string' || !command.productId || command.productId.length > 200) throw new Error('Invalid stock operation identity.');
  integer(command.expectedRevision, 'Product revision');
  if (type === 'Received') {
    if (!Array.isArray(command.lines) || !command.lines.length || command.lines.length > 50) throw new Error('Enter at least one received quantity.');
    const ids = new Set();
    for (const line of command.lines) {
      fields(line, ['variantId', 'quantity', 'purchaseCostPaise']);
      if (typeof line.variantId !== 'string' || ids.has(line.variantId)) throw new Error('Each size may appear only once.');
      ids.add(line.variantId);
      integer(line.quantity, 'Received quantity', 1000000);
      if (line.quantity > 0) integer(line.purchaseCostPaise, 'Purchase cost');
    }
    if (!command.lines.some(line => line.quantity > 0)) throw new Error('Enter at least one received quantity.');
    if (!Number.isSafeInteger(command.lines.reduce((total, line) => total + (line.quantity > 0 ? line.quantity * line.purchaseCostPaise : 0), 0))) throw new Error('Purchase total is too large.');
  } else {
    if (typeof command.variantId !== 'string') throw new Error('Choose a size.');
    integer(command.actualQuantity, 'Actual quantity', 1000000);
    if (!REASONS.includes(command.reason) || typeof command.note !== 'string' || command.note.length > 500 || /[\u0000-\u0008\u000b-\u001f]/.test(command.note)) throw new Error('Choose a valid reason and a note of up to 500 characters.');
  }
}

function availability(product) {
  return JSON.stringify(product.variants.map(v => [v.id, !product.archived && v.active && v.stock > 0]));
}

function applyStock(product, command, type, recordedAt = new Date().toISOString()) {
  validateCommand(command, type);
  if (product.revision !== command.expectedRevision) throw new Error('Stock or product details have changed. Reload the product and review again.');
  if (type === 'Received' && product.archived) throw new Error('Restore the archived product before receiving stock.');
  const next = JSON.parse(JSON.stringify(product));
  const changes = type === 'Received' ? command.lines : [{ variantId: command.variantId }];
  const movements = [];
  for (const line of changes) {
    const variant = next.variants.find(v => v.id === line.variantId);
    if (!variant) throw new Error('The selected size no longer exists.');
    if (type === 'Received' && line.quantity === 0) continue;
    if (type === 'Received' && !variant.active) throw new Error('Activate this size before receiving stock.');
    const before = variant.stock;
    const after = type === 'Received' ? before + line.quantity : command.actualQuantity;
    integer(after, 'Resulting stock', 1000000);
    if (after === before) throw new Error('The quantity is unchanged. No adjustment is needed.');
    variant.stock = after;
    if (type === 'Received') variant.purchaseCostPaise = line.purchaseCostPaise;
    movements.push({ id: randomUUID(), operationId: command.operationId, productId: product.id, variantId: variant.id,
      productName: product.name, sku: product.sku, size: variant.label, type, before, delta: after - before, after,
      purchaseCostPaise: type === 'Received' ? line.purchaseCostPaise : null,
      reason: type === 'Received' ? 'Stock received' : command.reason, note: type === 'Received' ? '' : command.note.trim(), recordedAt });
  }
  next.revision++; next.updatedAt = recordedAt;
  validateProduct(next);
  return { product: next, movements, availabilityChanged: availability(product) !== availability(next) };
}

function validateInventory(inventory, catalog) {
  fields(inventory, ['movements', 'operations', 'pendingAvailability']);
  for (const list of Object.values(inventory)) if (!Array.isArray(list) || list.length > 100000) throw new Error('Invalid stock backup.');
  const products = new Map(catalog.products.map(p => [p.id, p]));
  const operations = new Map();
  for (const op of inventory.operations) {
    fields(op, ['id', 'requestHash', 'productId', 'type', 'recordedAt']);
    if (!validId(op.id) || operations.has(op.id) || !/^[a-f0-9]{64}$/.test(op.requestHash)
      || !products.has(op.productId) || !['Received', 'Adjustment', 'Sold', 'Cancelled bill'].includes(op.type)
      || typeof op.recordedAt !== 'string' || !Number.isFinite(Date.parse(op.recordedAt))) throw new Error('Invalid stock operation backup.');
    operations.set(op.id, op);
  }
  const balances = new Map(), ids = new Set(), sequences = new Set(), used = new Set();
  for (const m of [...inventory.movements].sort((a, b) => a.sequence - b.sequence)) {
    fields(m, ['sequence','id','operationId','productId','variantId','productName','sku','size','type','before','delta','after','purchaseCostPaise','reason','note','recordedAt']);
    const op = operations.get(m.operationId), product = products.get(m.productId);
    if (!validId(m.id) || ids.has(m.id) || !Number.isSafeInteger(m.sequence) || m.sequence < 1 || sequences.has(m.sequence)
      || !op || op.productId !== m.productId || op.type !== m.type || op.recordedAt !== m.recordedAt
      || !product?.variants.some(v => v.id === m.variantId)) throw new Error('Invalid stock movement identity.');
    for (const key of ['productName', 'sku', 'size', 'reason', 'note']) if (typeof m[key] !== 'string' || m[key].length > 500) throw new Error('Invalid stock movement details.');
    integer(m.before, 'Previous stock', 1000000); integer(m.after, 'Resulting stock', 1000000);
    if (!Number.isSafeInteger(m.delta) || m.delta === 0 || m.after !== m.before + m.delta) throw new Error('Stock movement does not reconcile.');
    if (m.type === 'Received') {
      integer(m.purchaseCostPaise, 'Received cost');
      if (m.delta < 0 || m.reason !== 'Stock received') throw new Error('Invalid received stock.');
    } else if (['Sold', 'Cancelled bill'].includes(m.type)) {
      if (m.purchaseCostPaise !== null || !/^KC-\d{6,9}$/.test(m.reason) || (m.type === 'Sold' ? m.delta >= 0 : m.delta <= 0)) throw new Error('Invalid bill stock movement.');
    } else if (m.purchaseCostPaise !== null || !REASONS.includes(m.reason)) throw new Error('Invalid adjustment.');
    const key = JSON.stringify([m.productId, m.variantId]);
    if ((balances.get(key) || 0) !== m.before) throw new Error('Stock history has a missing or inconsistent entry.');
    balances.set(key, m.after); ids.add(m.id); sequences.add(m.sequence); used.add(m.operationId);
  }
  if (used.size !== operations.size) throw new Error('Stock operation is missing its movements.');
  for (const p of products.values()) for (const v of p.variants) {
    if (v.stock !== (balances.get(JSON.stringify([p.id, v.id])) || 0)) throw new Error('Stock balance does not match history.');
  }
  const pendingIds = new Set();
  for (const item of inventory.pendingAvailability) {
    fields(item, ['productId','updatedAt']);
    if (!products.has(item.productId) || pendingIds.has(item.productId) || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))) throw new Error('Invalid pending availability.');
    pendingIds.add(item.productId);
  }
}

module.exports = { applyStock, validateCommand, validateInventory, REASONS };
