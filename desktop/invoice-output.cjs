const { app, BrowserWindow, dialog, shell, clipboard, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { publicInvoice, invoiceHTML, whatsappText, normalizePhone } = require('./invoice-document.cjs');

const PDF_OPTIONS = { pageSize:'A4', landscape:false, printBackground:true, preferCSSPageSize:true, generateTaggedPDF:true };
const PRINT_OPTIONS = { silent:false, pageSize:'A4', landscape:false, printBackground:true, color:true };
function findInvoice(store, id) {
  if (typeof id !== 'string' || id.length > 100) throw new Error('Choose a saved invoice.');
  const bill = store.getBilling().bills.find(b => b.id === id);
  if (!bill) throw new Error('Invoice no longer exists. Reload bills.');
  return publicInvoice(bill);
}
async function documentWindow(invoice, parent) {
  const isolated = session.fromPartition(`invoice-${randomUUID()}`);
  isolated.setPermissionRequestHandler((_contents,_permission,reply) => reply(false));
  isolated.webRequest.onBeforeRequest((details,reply) => reply({cancel:!details.url.startsWith('data:')}));
  const output = new BrowserWindow({ show:false, width:850, height:1100, parent, webPreferences:{ session:isolated, sandbox:true, contextIsolation:true, nodeIntegration:false, backgroundThrottling:false } });
  output.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  output.webContents.on('will-navigate', event => event.preventDefault());
  try {
    await output.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(invoiceHTML(invoice))}`);
    await output.webContents.executeJavaScript('Promise.all([document.fonts.ready, ...Array.from(document.images).map(i => i.decode())]).then(() => true)');
    return output;
  } catch(error) { output.destroy(); throw error; }
}
async function pdfBytes(invoice, parent) {
  const output=await documentWindow(invoice,parent);
  try { return await output.webContents.printToPDF(PDF_OPTIONS); }
  finally { output.destroy(); }
}
function writePDF(destination, bytes) {
  const temp=`${destination}.${randomUUID()}.tmp`; let fd;
  try { fd=fs.openSync(temp,'wx'); fs.writeFileSync(fd,bytes); fs.fsyncSync(fd); fs.closeSync(fd);fd=undefined;fs.renameSync(temp,destination); }
  finally { if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp); }
}
function registerInvoiceOutput(register,store,getWindow) {
  register('invoice:preview',id => { const invoice=findInvoice(store,id);return {html:invoiceHTML(invoice),invoiceNumber:invoice.invoiceNumber}; });
  register('invoice:pdf',async id => {
    const invoice=findInvoice(store,id);
    const invoicesFolder=path.join(app.getPath('documents'),'Kutty Couture','Invoices');
    fs.mkdirSync(invoicesFolder,{recursive:true});
    const result=await dialog.showSaveDialog(getWindow(),{title:'Save A4 invoice PDF',defaultPath:path.join(invoicesFolder,`${invoice.invoiceNumber}.pdf`),filters:[{name:'PDF invoice',extensions:['pdf']}]});
    if(result.canceled || !result.filePath)return null;
    const destination=/\.pdf$/i.test(result.filePath)?result.filePath:`${result.filePath}.pdf`;
    const relative=path.relative(store.directory,path.resolve(destination));
    if(!relative.startsWith('..'+path.sep) && relative!=='..' && !path.isAbsolute(relative))throw new Error('Save the PDF outside the app data folder.');
    const bytes=await pdfBytes(invoice,getWindow());writePDF(destination,bytes);return {path:destination};
  });
  register('invoice:print',async id => {
    const output=await documentWindow(findInvoice(store,id),getWindow());
    try {
      return await new Promise((resolve,reject)=>output.webContents.print(PRINT_OPTIONS,(success,reason)=>{
        if(success)resolve({submitted:true});
        else if(/cancel/i.test(reason))resolve({submitted:false});
        else reject(new Error(reason || 'Unable to print. Check your printer or save a PDF instead.'));
      }));
    } finally { output.destroy(); }
  });
  register('invoice:share-preview',({billId,phone}) => {
    const invoice=findInvoice(store,billId);return {phone:normalizePhone(phone),text:whatsappText(invoice)};
  });
  register('invoice:copy-summary',id => { clipboard.writeText(whatsappText(findInvoice(store,id)));return true; });
  register('invoice:open-whatsapp',async ({billId,phone,expectedText}) => {
    const invoice=findInvoice(store,billId), recipient=normalizePhone(phone);
    if(expectedText!==whatsappText(invoice)) throw new Error('Invoice changed. Review the WhatsApp message again.');
    await shell.openExternal(`https://wa.me/${recipient}?text=${encodeURIComponent(whatsappText(invoice))}`);
    return true;
  });
}
module.exports={registerInvoiceOutput,documentWindow,pdfBytes,writePDF,findInvoice,PDF_OPTIONS,PRINT_OPTIONS};
