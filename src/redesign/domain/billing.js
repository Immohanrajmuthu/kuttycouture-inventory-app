/* global BigInt */
const { integer } = require('./pricing');
const fields = (value, names) => {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(',') !== names.split(',').sort().join(',')) throw new Error('Invalid billing data.');
};
const text = (value, max = 200) => { if (typeof value !== 'string' || value.length > max || [...value].some(c => c.charCodeAt(0) < 32 && ![9,10,13].includes(c.charCodeAt(0)))) throw new Error('Invalid billing text.'); };
function validateDraft(draft, final = false) {
  fields(draft, 'lines,channel,handover,customer,paymentStatus,paymentMode,billDate,discountType,discountValue,deliveryChargePaise,deliveryExpensePaise');
  fields(draft.customer, 'name,phone,address');
  text(draft.customer.name); text(draft.customer.phone, 40); text(draft.customer.address, 1000);
  if (!['in-person','whatsapp'].includes(draft.channel) || !['pickup','delivery'].includes(draft.handover)
    || !['paid','unpaid'].includes(draft.paymentStatus) || !['cash','upi'].includes(draft.paymentMode)
    || !['amount','percent'].includes(draft.discountType)) throw new Error('Choose valid billing options.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.billDate) || !Number.isFinite(Date.parse(draft.billDate)) || new Date(draft.billDate).toISOString().slice(0,10) !== draft.billDate) throw new Error('Enter a valid billing date.');
  integer(draft.discountValue, 'Discount', draft.discountType === 'percent' ? 10000 : undefined);
  integer(draft.deliveryChargePaise, 'Delivery charge'); integer(draft.deliveryExpensePaise, 'Delivery expense');
  if (!Array.isArray(draft.lines) || draft.lines.length > 100 || (final && !draft.lines.length)) throw new Error('Add at least one item (maximum 100 lines).');
  const keys = new Set();
  for (const line of draft.lines) {
    fields(line, 'productId,variantId,colorId,quantity,expectedRevision');
    for (const key of ['productId','variantId','colorId']) text(line[key]);
    if (!line.productId || !line.variantId) throw new Error('Choose a product and size.');
    integer(line.quantity, 'Quantity', 1000000); if (!line.quantity) throw new Error('Quantity must be at least one.');
    integer(line.expectedRevision, 'Product revision');
    const key = JSON.stringify([line.productId,line.variantId,line.colorId]);
    if (keys.has(key)) throw new Error('Combine identical product, size and color lines.');
    keys.add(key);
  }
  if (final && draft.handover === 'delivery' && !draft.customer.address.trim()) throw new Error('Enter a delivery address.');
  if (final && draft.paymentStatus === 'unpaid' && !draft.customer.name.trim() && !draft.customer.phone.trim()) throw new Error('An unpaid bill needs a customer name or phone number.');
}
function totals(lines, draft) {
  const subtotalPaise = integer(lines.reduce((sum, l) => sum + l.unitPricePaise * l.quantity, 0), 'Subtotal');
  const discountPaise = draft.discountType === 'amount' ? draft.discountValue : Number((BigInt(subtotalPaise) * BigInt(draft.discountValue) + 5000n) / 10000n);
  if (discountPaise > subtotalPaise) throw new Error('Discount cannot exceed the product subtotal.');
  const costPaise = integer(lines.reduce((sum,l) => sum + (l.purchaseCostPaise + Object.values(l.unitExpensesPaise).reduce((a,b) => a+b,0)) * l.quantity, 0), 'Total cost');
  const totalPaise = integer(subtotalPaise - discountPaise + draft.deliveryChargePaise, 'Bill total');
  return { subtotalPaise, discountPaise, totalPaise, costPaise, profitPaise: totalPaise - costPaise - draft.deliveryExpensePaise };
}
function prepareBill(draft, products) {
  validateDraft(draft, true);
  const quantities = new Map();
  const lines = draft.lines.map(line => {
    const p = products.find(p => p.id === line.productId), v = p?.variants.find(v => v.id === line.variantId);
    if (!p || p.archived || !v?.active) throw new Error('A selected product or size is no longer active. Remove it or refresh the bill.');
    if (p.revision !== line.expectedRevision) throw new Error('Product prices or stock changed. Refresh prices and stock, then review again.');
    if (!v.sellingPricePaise) throw new Error('Set a selling price in Products & Pricing.');
    const colors = p.colors.filter(c => c.active), color = colors.find(c => c.id === line.colorId);
    if ((colors.length && !color) || (!colors.length && line.colorId)) throw new Error('Choose a current color for each item.');
    const key = JSON.stringify([p.id,v.id]), quantity = (quantities.get(key) || 0) + line.quantity;
    quantities.set(key, quantity);
    if (quantity > v.stock) throw new Error(`Not enough stock for ${p.name} / ${v.label}. All colors share ${v.stock} units.`);
    return { productId:p.id, variantId:v.id, colorId:line.colorId, productName:p.name, sku:p.sku, size:v.label, color:color?.label || '', quantity:line.quantity, unitPricePaise:v.sellingPricePaise, purchaseCostPaise:v.purchaseCostPaise, unitExpensesPaise:{...v.unitExpensesPaise} };
  });
  return { lines, totals:totals(lines,draft) };
}
module.exports = { fields, text, validateDraft, totals, prepareBill };
