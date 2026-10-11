const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('foundationAPI', {
  load: () => ipcRenderer.invoke('foundation:load'),
  chooseThumbnail: () => ipcRenderer.invoke('catalog:choose-thumbnail'),
  loadCatalog: () => ipcRenderer.invoke('catalog:load'),
  saveProduct: command => ipcRenderer.invoke('catalog:save', command),
  receiveStock: command => ipcRenderer.invoke('stock:receive', command),
  adjustStock: command => ipcRenderer.invoke('stock:adjust', command),
  loadBilling: () => ipcRenderer.invoke('billing:load'),
  saveBillingDraft: command => ipcRenderer.invoke('billing:draft', command),
  saveInvoice: command => ipcRenderer.invoke('billing:save', command),
  payInvoice: command => ipcRenderer.invoke('billing:pay', command),
  cancelInvoice: command => ipcRenderer.invoke('billing:cancel', command),
  loadStock: () => ipcRenderer.invoke('stock:load'),
  updatePreferences: patch => ipcRenderer.invoke('foundation:preferences', patch),
  createBackup: () => ipcRenderer.invoke('foundation:backup'),
  previewRestore: () => ipcRenderer.invoke('foundation:preview-restore'),
  restoreBackup: token => ipcRenderer.invoke('foundation:restore', token),
});
