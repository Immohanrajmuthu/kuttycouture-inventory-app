import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FoundationApp from './FoundationApp';

let root, container, catalog, inventory;
const preferences = { theme: 'system', lastScreen: 'receive', shopName: 'Kutty Couture', place: 'Chennai', phone: '', website: '', instagram: '', footer: '' };
const buttons = () => [...container.querySelectorAll('button')];
async function click(label) { await act(async () => buttons().find(b => b.textContent === label).click()); }
async function input(element, value) {
  await act(async () => { Object.getOwnPropertyDescriptor(element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}
const field = label => [...container.querySelectorAll('label')].find(el => el.textContent.startsWith(label)).querySelector('input,select');
async function choose() {
  await input(container.querySelector('[role="combobox"]'), '100089');
  await act(async () => container.querySelector('.kc-stock-results button').click());
}
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  let id = 0; Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => `operation-${++id}` } });
  window.confirm = jest.fn(() => false);
  catalog = { products: [{ id: 'p', sku: '100089', name: 'Frock', category: 'clothing', archived: false, revision: 1, variants: ['S', 'M'].map(label => ({ id: label, label, active: true, stock: 5, purchaseCostPaise: 10000, sellingPricePaise: 25000 })) }], state: { nextSku: 100093 } };
  inventory = { movements: [], pendingAvailabilityCount: 0 };
  window.foundationAPI = {
    load: jest.fn(async () => ({ preferences, catalog, inventory, storagePath: 'test' })),
    updatePreferences: jest.fn(async patch => ({ ...preferences, ...patch })),
    receiveStock: jest.fn(async () => ({ catalog, inventory })),
    adjustStock: jest.fn(async () => ({ catalog, inventory })),
    loadStock: jest.fn(async () => ({ catalog, inventory })),
  };
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete window.foundationAPI; });

test('receipt is reviewed before committing; zero rows do not carry changed costs', async () => {
  await act(async () => root.render(<FoundationApp />)); await choose();
  await input(container.querySelector('[aria-label="Receiving S"]'), '3');
  await input(container.querySelector('[aria-label="Purchase cost S"]'), '155.50');
  await input(container.querySelector('[aria-label="Purchase cost M"]'), 'bad ignored value');
  await click('Review stock entry');
  expect(window.foundationAPI.receiveStock).not.toHaveBeenCalled();
  expect(container.textContent).toContain('₹466.50');
  expect(container.querySelector('.kc-stock-review tbody').children).toHaveLength(1);
  await click('Confirm stock entry');
  expect(window.foundationAPI.receiveStock.mock.calls[0][0].lines).toEqual([{ variantId: 'S', quantity: 3, purchaseCostPaise: 15550 }, { variantId: 'M', quantity: 0, purchaseCostPaise: 0 }]);
  expect(container.querySelector('[aria-label="Receiving S"]').value).toBe('0');
});

test('unchanged adjustment is rejected; failure retains review and retry operation ID', async () => {
  await act(async () => root.render(<FoundationApp />)); await click('Adjust stock'); await choose();
  await click('Review adjustment');
  expect(container.querySelector('[role="alert"]').textContent).toContain('unchanged');
  await input(field('Actual quantity'), '4');
  await input(field('Reason'), 'Damaged');
  await input(field('Note (optional)'), 'One damaged item');
  await click('Review adjustment');
  expect(window.foundationAPI.adjustStock).not.toHaveBeenCalled();
  expect(container.textContent).toContain('One damaged item');
  window.foundationAPI.adjustStock.mockRejectedValueOnce(new Error('Disk unavailable'));
  await click('Save adjustment');
  expect(container.querySelector('[role="alert"]').textContent).toBe('Disk unavailable');
  expect(container.querySelector('.kc-stock-review')).not.toBeNull();
  await click('Save adjustment');
  expect(window.foundationAPI.adjustStock.mock.calls[0][0]).toEqual(window.foundationAPI.adjustStock.mock.calls[1][0]);
  expect(window.foundationAPI.adjustStock.mock.calls[1][0]).toMatchObject({ actualQuantity: 4, reason: 'Damaged', note: 'One damaged item' });
});

test('stock history displays newest first and filters by type and SKU', async () => {
  inventory.movements = [
    { id: 'new', operationId: 'new-operation', sequence: 2, productId: 'p', productName: 'Frock', sku: '100089', size: 'S', type: 'Adjustment', delta: -1, after: 4, reason: 'Count correction', note: '', purchaseCostPaise: null, recordedAt: '2026-10-06T10:00:00Z' },
    { id: 'old', operationId: 'old-operation', sequence: 1, productId: 'p', productName: 'Frock', sku: '100089', size: 'S', type: 'Received', delta: 5, after: 5, reason: 'Stock received', note: '', purchaseCostPaise: 10000, recordedAt: '2026-10-06T10:00:00Z' },
  ];
  await act(async () => root.render(<FoundationApp />)); await click('Stock history');
  expect(container.querySelector('tbody tr').textContent).toContain('Adjustment');
  await input(field('Change type'), 'Received');
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(container.querySelector('tbody tr').textContent).toContain('Received');
  await input(field('Product name or SKU'), 'missing');
  expect(container.textContent).toContain('No changes match');
});
