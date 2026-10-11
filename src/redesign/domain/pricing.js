/* global BigInt */
// Shared by the renderer and the main process. All persisted money is integer paise.
const MAX_MONEY = 10000000000;
function integer(value, label, max = MAX_MONEY) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new Error(`${label} must be a valid non-negative whole number.`);
  return value;
}
function parseMoney(text) {
  const value = String(text).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Enter a non-negative amount with up to two decimal places.');
  const [whole, decimal = ''] = value.split('.');
  return integer(Number(whole) * 100 + Number(decimal.padEnd(2, '0')), 'Amount');
}
function moneyInput(paise) { return (paise / 100).toFixed(2); }
function roundRatio(numerator, denominator) {
  if (denominator <= 0n) throw new Error('Divisor must be positive.');
  const result = Number((numerator + denominator / 2n) / denominator);
  return integer(result, 'Calculated price');
}
function calculatePrice(purchaseCostPaise, settings) {
  integer(purchaseCostPaise, 'Purchase cost');
  if (!settings || !['markup', 'margin'].includes(settings.mode)
    || !['unit', 'purchase'].includes(settings.expenseBasis)) throw new Error('Invalid calculator settings.');
  integer(settings.profitBps, 'Profit percentage', 1000000);
  if (settings.mode === 'margin' && settings.profitBps >= 10000) throw new Error('Margin must be less than 100%.');
  integer(settings.units, 'Purchase units', 1000000);
  if (settings.units < 1) throw new Error('Purchase units must be at least one.');
  const divisor = settings.expenseBasis === 'purchase' ? settings.units : 1;
  const expenses = {};
  let expenseTotal = 0;
  for (const key of ['shipping', 'packaging', 'other']) {
    const amount = integer(settings.expensesPaise?.[key], `${key} expense`);
    expenseTotal += amount;
    expenses[key] = Math.floor(amount / divisor);
  }
  // Round the combined unit expense once, then distribute remaining paise in fixed order.
  const roundedExpense = roundRatio(BigInt(expenseTotal), BigInt(divisor));
  let remainder = roundedExpense - Object.values(expenses).reduce((sum, value) => sum + value, 0);
  const order = ['shipping', 'packaging', 'other'].sort((a, b) => (settings.expensesPaise[b] % divisor) - (settings.expensesPaise[a] % divisor));
  for (const key of order) if (remainder > 0) { expenses[key]++; remainder--; }
  const unitCostPaise = integer(purchaseCostPaise + roundedExpense, 'Total unit cost');
  const sellingPricePaise = settings.mode === 'markup'
    ? roundRatio(BigInt(unitCostPaise) * BigInt(10000 + settings.profitBps), 10000n)
    : roundRatio(BigInt(unitCostPaise) * 10000n, BigInt(10000 - settings.profitBps));
  return { sellingPricePaise, unitCostPaise, unitExpensesPaise: expenses };
}
module.exports = { MAX_MONEY, integer, parseMoney, moneyInput, calculatePrice };
