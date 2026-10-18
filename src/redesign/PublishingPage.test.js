import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PublishingPage from './PublishingPage';

test('preview remains explicit, refreshes saved data, and clearly labels unavailable and archived listings', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const product = { id: 'one', sku: '100089', legacySkus: ['200000'], name: 'Frock', description: 'Cotton', listed: true, available: false, sizes: [{ label: 'S', available: false }], colors: ['Pink'] };
  window.foundationAPI = { previewPublication: jest.fn(async () => ({ payload: { products: [product, { ...product, id: 'two', sku: '100090', listed: false }] }, review: [{ sku: '100089', fields: ['sizes'] }] })) };
  try {
    await act(async () => root.render(<PublishingPage busy={false} run={async action => action()} />));
    expect(window.foundationAPI.previewPublication).not.toHaveBeenCalled();
    const click = async label => act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent === label).click());
    await click('Preview website catalog');
    expect(container.textContent).toContain('1 listed · 0 available · 1 unavailable · 1 archived');
    expect(container.textContent).toContain('Previous SKU: 200000');
    expect(container.textContent).toContain('S: Unavailable');
    expect(container.textContent).toContain('All listed products are currently unavailable');
    product.available = true; product.sizes[0].available = true;
    await click('Refresh preview');
    expect(container.textContent).toContain('1 listed · 1 available');
    expect(container.textContent).not.toContain('All listed products are currently unavailable');
  } finally { await act(async () => root.unmount()); container.remove(); delete window.foundationAPI; }
});

test('publishing requires a separate reviewed action and never claims a submitted version is live', async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container); const messages = [];
  window.foundationAPI = {
    preparePublication: jest.fn(async () => ({ payload: { products: [] }, review: [], reviewToken: 'reviewed', firstPublication: true, changes: [{ sku: '100000', name: 'Necklace', action: 'Remove', fields: [] }] })),
    publishCatalog: jest.fn(async () => ({ state: 'submitted', pendingNewChanges: true })),
    publicationStatus: jest.fn(async () => ({ state: 'live', pendingChanges: 1 })),
  };
  try {
    await act(async () => root.render(<PublishingPage busy={false} run={async action => { messages.push(await action()); }} />));
    const click = async label => act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent === label).click());
    await click('Review website changes');
    expect(window.foundationAPI.publishCatalog).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Remove: 100000');
    expect(container.textContent).toContain('First publication replaces website availability');
    const publishButton = () => Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Publish reviewed catalog to website');
    expect(publishButton().disabled).toBe(true);
    await click('Publish reviewed catalog to website');
    expect(window.foundationAPI.publishCatalog).not.toHaveBeenCalled();
    await act(async () => container.querySelector('input[type="checkbox"]').click());
    expect(publishButton().disabled).toBe(false);
    await click('Review website changes');
    expect(publishButton().disabled).toBe(true);
    expect(container.querySelector('input[type="checkbox"]').checked).toBe(false);
    await act(async () => container.querySelector('input[type="checkbox"]').click());
    await click('Publish reviewed catalog to website');
    expect(window.foundationAPI.publishCatalog).toHaveBeenCalledWith('reviewed', true);
    expect(messages.join(' ')).toContain('New app changes remain unpublished');
    expect(container.textContent).not.toContain("GitHub's catalog version is live");
    await click('Check deployment');
    expect(container.textContent).toContain('1 product changes remain unpublished');
  } finally { await act(async () => root.unmount()); container.remove(); delete window.foundationAPI; }
});
