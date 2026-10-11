const { randomUUID } = require('node:crypto');
const { integer, calculatePrice } = require('../src/redesign/domain/pricing');
const SKU_MAP = Object.freeze({ '200000': '100089', '200001': '100090', '200002': '100091', '200003': '100092' });
const IMPORT_ID = 'website-catalog-redesign-v1';
const zeroExpenses = () => ({ shipping: 0, packaging: 0, other: 0 });
function text(value, label, max = 200, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b-\u001f]/.test(value) || (!allowEmpty && !value.trim())) throw new Error(`Invalid ${label}.`);
}
function keys(value, allowed, label) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(key => !allowed.includes(key)) || allowed.some(key => !Object.hasOwn(value, key))) throw new Error(`Invalid ${label} structure.`);
}
function validateProduct(p) {
  const { thumbnail, ...record } = p;
  if (thumbnail !== undefined && thumbnail !== null && (typeof thumbnail !== 'string' || thumbnail.length > 110000 || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(thumbnail))) throw new Error('Invalid product thumbnail. Choose a JPEG or PNG image again.');
  keys(record, ['id','sku','legacySkus','websiteId','name','category','productType','description','hasSizes','colors','variants','archived','review','sourceSizes','revision','createdAt','updatedAt'], 'product');
  for (const key of ['id', 'sku', 'name', 'category']) text(p[key], key);
  if (!/^\d{6,9}$/.test(p.sku)) throw new Error('Invalid SKU.');
  if (!['accessories', 'clothing'].includes(p.category)) throw new Error('Choose accessories or clothing.');
  text(p.productType, 'product type', 100, true); text(p.description, 'description', 3000, true); text(p.websiteId, 'website identity', 200, true);
  for (const key of ['hasSizes', 'archived']) if (typeof p[key] !== 'boolean') throw new Error(`Invalid ${key}.`);
  for (const key of ['legacySkus', 'sourceSizes', 'review']) {
    if (!Array.isArray(p[key]) || p[key].length > 50) throw new Error(`Invalid ${key}.`);
    p[key].forEach(value => text(value, key));
  }
  if (p.review.some(value => !['colors', 'sizes'].includes(value))) throw new Error('Invalid review flag.');
  integer(p.revision, 'Revision');
  for (const key of ['createdAt', 'updatedAt']) if (typeof p[key] !== 'string' || !Number.isFinite(Date.parse(p[key]))) throw new Error('Invalid timestamp.');
  if (!Array.isArray(p.colors) || p.colors.length > 50 || !Array.isArray(p.variants) || !p.variants.length || p.variants.length > 50) throw new Error('Invalid color or size list.');
  const ids = new Set();
  for (const list of [p.colors, p.variants]) {
    const labels = new Set();
    for (const entry of list) {
      text(entry.id, 'entry ID'); text(entry.label, 'entry label', 100);
      if (ids.has(entry.id) || labels.has(entry.label.trim().toLowerCase())) throw new Error('Size and color entries must have unique identities and labels.');
      ids.add(entry.id); labels.add(entry.label.trim().toLowerCase());
      if (typeof entry.active !== 'boolean') throw new Error('Invalid active state.');
    }
  }
  for (const color of p.colors) keys(color, ['id','label','active'], 'color');
  if (!p.hasSizes && p.variants.length !== 1) throw new Error('A product without sizes has one inventory entry.');
  for (const v of p.variants) {
    keys(v, ['id','label','active','stock','minStock','purchaseCostPaise','sellingPricePaise','unitExpensesPaise','calculator'], 'size');
    integer(v.stock, 'Stock', 1000000); integer(v.minStock, 'Minimum stock', 1000000);
    integer(v.purchaseCostPaise, 'Purchase cost'); integer(v.sellingPricePaise, 'Selling price');
    keys(v.unitExpensesPaise, ['shipping','packaging','other'], 'unit expenses');
    Object.values(v.unitExpensesPaise).forEach(value => integer(value, 'Expense'));
    if (v.calculator !== null) {
      keys(v.calculator, ['mode','expenseBasis','units','profitBps','expensesPaise'], 'calculator');
      keys(v.calculator.expensesPaise, ['shipping','packaging','other'], 'calculator expenses');
      const result = calculatePrice(v.purchaseCostPaise, v.calculator);
      for (const key of ['shipping','packaging','other']) if (result.unitExpensesPaise[key] !== v.unitExpensesPaise[key]) throw new Error('Expense allocation does not match calculator inputs.');
    }
  }
  return p;
}

function importCatalog(source) {
  if (!Array.isArray(source) || source.length !== 93) throw new Error('Expected the reviewed 93-product catalog snapshot.');
  const now = new Date().toISOString();
  const products = source.map(item => {
    const oldSku = String(item.sku), sku = SKU_MAP[oldSku] || oldSku;
    const sourceSizes = item.sizes || [];
    const ambiguousSizes = sourceSizes.some(label => /enquiry/i.test(label));
    const hasSizes = sourceSizes.length > 0;
    const labels = hasSizes ? sourceSizes : ['One size'];
    const id = `catalog:${item.id}`;
    return validateProduct({
      id, sku, legacySkus: sku === oldSku ? [] : [oldSku], websiteId: item.id,
      name: item.name, category: item.category, productType: item.productType || '', description: item.shortDescription || '',
      hasSizes, colors: item.color ? [{ id: `${id}:color`, label: item.color, active: true }] : [],
      variants: labels.map((label, i) => ({ id: `${id}:size:${i}`, label, active: !ambiguousSizes, stock: 0, minStock: 0, purchaseCostPaise: 0, sellingPricePaise: 0, unitExpensesPaise: zeroExpenses(), calculator: null })),
      archived: false, review: [...(!item.color ? ['colors'] : []), ...(ambiguousSizes ? ['sizes'] : [])],
      sourceSizes, revision: 1, createdAt: now, updatedAt: now,
    });
  });
  if (new Set(products.map(p => p.sku)).size !== products.length || new Set(products.map(p => p.id)).size !== products.length || new Set(products.map(p => p.websiteId)).size !== products.length) throw new Error('Catalog contains duplicate identities or SKU collisions.');
  for (const [oldSku, sku] of Object.entries(SKU_MAP)) if (!products.some(p => p.sku === sku && p.legacySkus.includes(oldSku))) throw new Error('Clothing SKU mapping is incomplete.');
  return { products, nextSku: Math.max(...products.map(p => Number(p.sku))) + 1, importId: IMPORT_ID,
    report: { importedAt: now, count: products.length, accessories: products.filter(p => p.category === 'accessories').length, clothing: products.filter(p => p.category === 'clothing').length, missingColors: products.filter(p => p.review.includes('colors')).length, ambiguousSizes: products.filter(p => p.review.includes('sizes')).length, skuMap: SKU_MAP } };
}

function prepareProduct(draft, previous, sku, allowStructureChange = false) {
  const now = new Date().toISOString();
  const p = { ...draft, id: previous?.id || randomUUID(), sku: previous?.sku || sku,
    legacySkus: previous?.legacySkus || [], websiteId: previous?.websiteId || '', sourceSizes: previous?.sourceSizes || [],
    revision: (previous?.revision || 0) + 1, createdAt: previous?.createdAt || now, updatedAt: now };
  validateProduct(p);
  if (previous) {
    if (draft.sku !== previous.sku || draft.websiteId !== previous.websiteId || JSON.stringify(draft.legacySkus) !== JSON.stringify(previous.legacySkus)) throw new Error('Product identity cannot be changed.');
    const changedStructure = previous.hasSizes !== p.hasSizes;
    if (changedStructure && (!allowStructureChange || previous.variants.some(v => v.stock !== 0))) throw new Error('Inventory structure is locked because this product has stock or history.');
    for (const v of changedStructure ? [] : previous.variants) {
      const next = p.variants.find(item => item.id === v.id);
      if (!next) throw new Error('Keep existing sizes; deactivate them instead of removing them.');
      if (next.stock !== v.stock) throw new Error('Use a stock operation to change quantities.');
    }
    if (previous.colors.some(color => !p.colors.some(next => next.id === color.id))) throw new Error('Keep existing colors; deactivate them instead of removing them.');
  }
  for (const v of p.variants) if ((previous?.hasSizes !== p.hasSizes || !previous?.variants.some(item => item.id === v.id)) && v.stock !== 0) throw new Error('New sizes must start with zero stock.');
  if (p.variants.some(v => v.active && /enquiry/i.test(v.label))) throw new Error('Replace enquiry labels with actual sizes before activating them.');
  return p;
}

module.exports = { validateProduct, importCatalog, prepareProduct, IMPORT_ID, SKU_MAP };
