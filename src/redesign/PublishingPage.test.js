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
