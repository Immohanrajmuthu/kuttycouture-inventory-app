const { app, BrowserWindow, ipcMain, dialog, session, nativeImage, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { FoundationStore, developmentDirectory, parseBackup, MAX_BACKUP_BYTES } = require('./foundation-store.cjs');

const projectRoot = path.resolve(__dirname, '..');
const smokeTest = process.argv.includes('--smoke-test');
if (smokeTest) app.disableHardwareAcceleration();
const directory = smokeTest ? path.join(projectRoot, '.local', `smoke-${randomUUID()}`) : developmentDirectory(projectRoot);
const rendererUrl = pathToFileURL(path.join(projectRoot, 'build', 'index.html'));
rendererUrl.searchParams.set('workspace', 'redesign');
app.setPath('userData', directory);
app.setName('Kutty Couture Redesign');
let store;
let window;
let restorePreview;

function register(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || event.senderFrame.url.split('#')[0] !== rendererUrl.href) {
      throw new Error('Untrusted window.');
    }
    return handler(...args);
  });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1220, height: 820, minWidth: 720, minHeight: 540, show: false,
    title: 'Kutty Couture · Redesign workspace',
    webPreferences: { preload: path.join(__dirname, 'redesign-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: smokeTest, backgroundThrottling: !smokeTest },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window, { type: 'question', buttons: ['Keep editing', 'Discard changes'], defaultId: 0, cancelId: 0, message: 'Discard unsaved changes?' });
    if (choice === 1) event.preventDefault();
  });
  if (!smokeTest) window.once('ready-to-show', () => window.show());
  window.on('closed', () => { window = null; restorePreview = null; });
  return window.loadURL(rendererUrl.href);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {
    store = new FoundationStore(directory);
    store.initializeCatalog(require('../src/data/websiteCatalog.json'));
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'self' about:"] },
    }));
    register('foundation:load', () => ({ preferences: store.getPreferences(), storagePath: directory, schemaVersion: 4, billing: store.getBilling(), catalog: store.getCatalog(), inventory: store.getStockView() }));
    register('catalog:choose-thumbnail', async () => {
      const result = await dialog.showOpenDialog(window, { title: 'Choose product thumbnail', properties: ['openFile'], filters: [{ name: 'Product images', extensions: ['jpg', 'jpeg', 'png'] }] });
      if (result.canceled || !result.filePaths[0]) return null;
      const file = result.filePaths[0];
      if (fs.statSync(file).size > 15 * 1024 * 1024) throw new Error('Choose an image smaller than 15 MB.');
      const original = nativeImage.createFromBuffer(fs.readFileSync(file));
      if (original.isEmpty()) throw new Error('This image could not be opened. Choose a JPEG or PNG image.');
      const { width, height } = original.getSize();
      const image = Math.max(width, height) > 320 ? original.resize(width >= height ? { width: 320 } : { height: 320 }) : original;
      const bytes = image.toJPEG(80);
      if (bytes.length > 80000) throw new Error('This image is too detailed for a thumbnail. Choose a smaller image.');
      return `data:image/jpeg;base64,${bytes.toString('base64')}`;
    });
    register('catalog:save', command => store.saveProduct(command));
    register('catalog:load', () => store.getCatalog());
    register('publication:preview', () => require('./public-catalog.cjs').publicationPreview(store.getCatalog().products));
    const credentials = require('./publication-credentials.cjs').publicationCredentials(directory, safeStorage);
    register('publication:connection', () => credentials.status());
    const publicationConnection = require('./publication-connection.cjs').publicationConnection(credentials);
    register('publication:verify', () => publicationConnection.verify());
    const publisher = require('./publisher.cjs').publisher({ credentials, products: () => store.getCatalog().products, history: require('./publication-history.cjs').publicationHistory(directory) });
    register('publication:prepare', () => publisher.prepare());
    register('publication:publish', token => publisher.publish(token));
    register('publication:status', () => publisher.status());
    register('publication:save-token', token => credentials.save(token));
    register('publication:remove-token', () => credentials.remove());
    require('./invoice-output.cjs').registerInvoiceOutput(register, store, () => window);
    register('billing:load', () => store.billingResult());
    register('billing:draft', command => store.saveBillingDraft(command));
    register('billing:save', command => store.saveInvoice(command));
    register('billing:pay', command => store.payInvoice(command));
    register('billing:cancel', command => store.cancelInvoice(command));
    register('stock:receive', command => store.receiveStock(command));
    register('stock:adjust', command => store.adjustStock(command));
    register('stock:load', () => ({ catalog: store.getCatalog(), inventory: store.getStockView() }));
    register('foundation:preferences', patch => store.updatePreferences(patch));
    register('foundation:backup', async () => {
      const result = await dialog.showSaveDialog(window, {
        title: 'Back up catalog and settings', defaultPath: `kutty-couture-catalog-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON backup', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return null;
      if (path.resolve(result.filePath).toLowerCase() === path.join(directory, 'foundation.sqlite').toLowerCase()) throw new Error('Choose a backup file, not the active database.');
      return { path: store.writeBackup(result.filePath) };
    });
    register('foundation:preview-restore', async () => {
      restorePreview = null;
      const result = await dialog.showOpenDialog(window, { title: 'Review a foundation backup', properties: ['openFile'], filters: [{ name: 'JSON backup', extensions: ['json'] }] });
      if (result.canceled || !result.filePaths[0]) return null;
      if (fs.statSync(result.filePaths[0]).size > MAX_BACKUP_BYTES) throw new Error('Backup is too large.');
      const text = fs.readFileSync(result.filePaths[0], 'utf8');
      const payload = parseBackup(text);
      restorePreview = { text, token: randomUUID() };
      return { token: restorePreview.token, createdAt: payload.createdAt, shopName: payload.preferences.shopName, fileName: path.basename(result.filePaths[0]), schemaVersion: payload.schemaVersion, billCount: payload.billing?.bills.length ?? 0, productCount: payload.catalog?.products.length ?? null, movementCount: payload.schemaVersion === 1 ? null : payload.inventory?.movements.length || 0 };
    });
    register('foundation:restore', token => {
      if (!restorePreview || typeof token !== 'string' || restorePreview.token !== token) throw new Error('Review the backup again before restoring.');
      const preview = restorePreview;
      restorePreview = null;
      return store.restoreBackup(preview.text);
    });
    await createWindow();
    if (smokeTest) {
      await require('./smoke-check.cjs')(window, directory);
      app.quit();
    }
  }).catch(error => {
    if (smokeTest) { console.error(error); app.exit(1); }
    else { dialog.showErrorBox('Unable to open redesign workspace', error.message); app.quit(); }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => store?.close());
}
