import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FoundationApp from './FoundationApp';

let container, root, catalog;
const preferences = { theme: 'system', lastScreen: 'products', shopName: 'Kutty Couture', place: 'Chennai', phone: '8610971628', website: 'kuttycouture.in', instagram: '@kuttycouture.in', footer: 'Thank you!' };
const buttons = () => [...container.querySelectorAll('button')];
async function click(label) { await act(async () => { buttons().find(button => button.textContent === label).click(); }); }
async function input(element, value) {
  await act(async () => {
    const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
const labeled = label => [...container.querySelectorAll('label')].find(el => el.textContent.startsWith(label)).querySelector('input,select');
async function save() { await act(async () => container.querySelector('.kc-product-editor').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  let id = 0;
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => `test-identity-${++id}` } });
  window.confirm = jest.fn(() => false);
  catalog = { products: [{ id: 'p1', sku: '100089', name: 'Frock', category: 'clothing', productType: 'frock', description: 'Printed frock', hasSizes: true, colors: [], legacySkus: ['200000'], websiteId: 'frock', sourceSizes: ['S'], review: [], archived: false, revision: 1, createdAt: '2026-10-06T00:00:00Z', updatedAt: '2026-10-06T00:00:00Z', variants: [{ id: 'size-s', label: 'S', active: true, stock: 0, minStock: 0, purchaseCostPaise: 0, sellingPricePaise: 0, unitExpensesPaise: { shipping: 0, packaging: 0, other: 0 }, calculator: null }] }], state: { nextSku: 100093, report: null } };
  window.foundationAPI = {
    load: jest.fn(async () => ({ preferences, catalog, storagePath: 'test' })),
    updatePreferences: jest.fn(async patch => ({ ...preferences, ...patch })),
    saveProduct: jest.fn(async ({ product }) => ({ ...catalog, products: [{ ...product, id: product.id || 'created', sku: product.sku || '100093' }] })),
  };
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete window.foundationAPI; });

test('calculator applies selling price and expenses without changing purchase cost, then saves integer paise', async () => {
  await act(async () => root.render(<FoundationApp />));
  await click('Frock');
  await input(container.querySelector('[aria-label="Purchase cost S"]'), '100.00');
  await click('Calculate');
  await input(labeled('Shipping ₹'), '10');
  await input(labeled('Packaging ₹'), '5');
  await input(labeled('Other expenses ₹'), '5');
  await click('Apply to this size');
  expect(container.querySelector('[aria-label="Selling price S"]').value).toBe('156.00');
  expect(container.querySelector('[aria-label="Purchase cost S"]').value).toBe('100.00');
  await save();
  const variant = window.foundationAPI.saveProduct.mock.calls[0][0].product.variants[0];
  expect(variant.sellingPricePaise).toBe(15600);
  expect(variant.purchaseCostPaise).toBe(10000);
  expect(variant.unitExpensesPaise).toEqual({ shipping: 1000, packaging: 500, other: 500 });
  expect(container.querySelector('.kc-product-editor')).toBeNull();
});

test('new clothing uses S/M/L defaults and supports another size', async () => {
  await act(async () => root.render(<FoundationApp />));
  await click('Add product');
  await input(labeled('Category'), 'clothing');
  expect([...container.querySelectorAll('.kc-size-table tbody tr')]).toHaveLength(3);
  expect([...container.querySelectorAll('[aria-label^="Size label"]')].map(el => el.value)).toEqual(['S', 'M', 'L']);
  await click('Add size');
  expect([...container.querySelectorAll('.kc-size-table tbody tr')]).toHaveLength(4);
  await input(container.querySelector('[aria-label="Size label 4"]'), 'XL');
  await input(labeled('Product name'), 'New frock');
  await save();
  const draft = window.foundationAPI.saveProduct.mock.calls[0][0].product;
  expect(draft.id).toBeNull();
  expect(draft.variants.map(v => v.label)).toEqual(['S', 'M', 'L', 'XL']);
});

test('failed save retains decimal inputs and unsaved navigation can be cancelled', async () => {
  await act(async () => root.render(<FoundationApp />));
  await click('Frock');
  await input(container.querySelector('[aria-label="Selling price S"]'), '149.50');
  window.foundationAPI.saveProduct.mockRejectedValueOnce(new Error('Disk full'));
  await save();
  expect(container.querySelector('[role="alert"]').textContent).toBe('Disk full');
  expect(container.querySelector('[aria-label="Selling price S"]').value).toBe('149.50');
  await click('Bills');
  expect(window.confirm).toHaveBeenCalled();
  expect(container.querySelector('.kc-product-editor')).not.toBeNull();
  await save();
  expect(window.foundationAPI.saveProduct.mock.calls[0][0].operationId).toBe(window.foundationAPI.saveProduct.mock.calls[1][0].operationId);
});
