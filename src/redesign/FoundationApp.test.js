import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FoundationApp from './FoundationApp';

let root;
let container;
const defaults = { theme: 'system', lastScreen: 'products', shopName: 'Kutty Couture', place: 'Kelambakkam, Chennai', phone: '8610971628', website: 'kuttycouture.in', instagram: '@kuttycouture.in', footer: 'Thank you for shopping with Kutty Couture!' };
const button = label => Array.from(container.querySelectorAll('button')).find(item => item.textContent === label);
async function click(label) { await act(async () => { button(label).click(); }); }

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  let saved = { ...defaults };
  window.foundationAPI = {
    load: jest.fn(async () => ({ preferences: saved, storagePath: 'isolated-test-store' })),
    updatePreferences: jest.fn(async patch => { saved = { ...saved, ...patch }; return saved; }),
    createBackup: jest.fn(async () => null),
    previewRestore: jest.fn(async () => ({ token: 'reviewed', fileName: 'backup.json', createdAt: '2026-10-06T10:00:00Z', shopName: 'Kutty Couture' })),
    restoreBackup: jest.fn(async () => ({ preferences: { ...defaults, theme: 'dark', lastScreen: 'settings' }, safetyPath: 'safety.json' })),
  };
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete window.foundationAPI; });

test('loads the saved screen and saves navigation through the narrow bridge', async () => {
  window.foundationAPI.load.mockResolvedValueOnce({ preferences: { ...defaults, lastScreen: 'bills', theme: 'dark' }, storagePath: 'test' });
  await act(async () => root.render(<FoundationApp />));
  expect(container.querySelector('h1').textContent).toBe('Bills');
  expect(container.querySelector('.kc-foundation').dataset.theme).toBe('dark');
  await click('Products');
  expect(window.foundationAPI.updatePreferences).toHaveBeenCalledWith({ lastScreen: 'products' });
  expect(container.querySelector('h1').textContent).toBe('Products');
});

test('failed preference writes leave the current screen intact and show a recoverable error', async () => {
  await act(async () => root.render(<FoundationApp />));
  window.foundationAPI.updatePreferences.mockRejectedValueOnce(new Error('Disk unavailable'));
  await click('Bills');
  expect(container.querySelector('[role="alert"]').textContent).toBe('Disk unavailable');
  expect(container.querySelector('h1').textContent).toBe('Products');
  await click('Bills');
  expect(container.querySelector('h1').textContent).toBe('Bills');
});

test('restore requires review and confirmation, and cancellation does not restore', async () => {
  await act(async () => root.render(<FoundationApp />));
  await click('Settings');
  await click('Restore backup…');
  expect(container.textContent).toContain('Review before restoring');
  expect(window.foundationAPI.restoreBackup).not.toHaveBeenCalled();
  await click('Keep current settings');
  expect(window.foundationAPI.restoreBackup).not.toHaveBeenCalled();
  await click('Restore backup…');
  await click('Restore these settings');
  expect(window.foundationAPI.restoreBackup).toHaveBeenCalledWith('reviewed');
  expect(container.querySelector('.kc-foundation').dataset.theme).toBe('dark');
  expect(container.querySelector('[role="status"]').textContent).toContain('safety.json');
});

test('load failure can be retried without rendering operational screens', async () => {
  window.foundationAPI.load.mockRejectedValueOnce(new Error('Store unavailable'));
  await act(async () => root.render(<FoundationApp />));
  expect(container.querySelector('[role="alert"]').textContent).toBe('Store unavailable');
  expect(container.querySelector('nav')).toBeNull();
  await click('Try again');
  expect(container.querySelector('nav')).not.toBeNull();
});
