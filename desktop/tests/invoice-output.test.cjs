const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('invoice IPC trusts saved snapshots, handles cancelled dialogs and protects output paths',async t=>{
  const windows=[],external=[],clipboard=[];let saveResult={canceled:true},printSuccess=false,printReason='cancelled';
  const handlers={};
  const fakeElectron={app:{getPath:name=>{assert.equal(name,'documents');return path.join(root,'Documents');}},session:{fromPartition:()=>({setPermissionRequestHandler(){},webRequest:{onBeforeRequest(){}}})},
    BrowserWindow:class {constructor(options){this.options=options;this.destroyed=false;windows.push(this);this.webContents={setWindowOpenHandler(){},on(){},executeJavaScript:async()=>true,printToPDF:async options=>{assert.equal(options.pageSize,'A4');return Buffer.from('%PDF-test');},print:(options,callback)=>{assert.equal(options.silent,false);assert.equal(options.pageSize,'A4');callback(printSuccess,printReason);}};}async loadURL(url){this.url=url;}destroy(){this.destroyed=true;}},
    dialog:{showSaveDialog:async(_window,options)=>{assert.equal(options.defaultPath,path.join(root,'Documents','Kutty Couture','Invoices','KC-000001.pdf'));return saveResult;}},shell:{openExternal:async url=>external.push(url)},clipboard:{writeText:text=>clipboard.push(text)}};
  const original=Module._load;Module._load=function(name,...args){return name==='electron'?fakeElectron:original.call(this,name,...args);};
  const filename=require.resolve('../invoice-output.cjs');delete require.cache[filename];let output;
  try {output=require(filename);}finally{Module._load=original;}
  t.after(()=>delete require.cache[filename]);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kc-output-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const bill={id:'bill',invoiceNumber:'KC-000001',status:'unpaid',business:{shopName:'KC',footer:'Thanks'},draft:{billDate:'2026-10-11',handover:'pickup',customer:{name:'Test',phone:'9876543210'},discountType:'amount',deliveryChargePaise:0},lines:[],totals:{subtotalPaise:0,discountPaise:0,totalPaise:10000}};
  output.registerInvoiceOutput((name,handler)=>handlers[name]=handler,{directory:path.join(root,'data'),getBilling:()=>({bills:[bill]})},()=>null);
  assert.throws(()=>handlers['invoice:preview']('missing'),/no longer exists/);
  assert.ok(handlers['invoice:preview']('bill').html.includes('KC-000001'));
  assert.equal(await handlers['invoice:pdf']('bill'),null);assert.equal(windows.length,0);
  saveResult={filePath:path.join(root,'data','bad.pdf')};await assert.rejects(()=>handlers['invoice:pdf']('bill'),/outside/);
  saveResult={filePath:path.join(root,'invoice')};const result=await handlers['invoice:pdf']('bill');assert.ok(result.path.endsWith('.pdf'));assert.equal(fs.readFileSync(result.path,'utf8'),'%PDF-test');assert.equal(windows[0].destroyed,true);
  assert.deepEqual(await handlers['invoice:print']('bill'),{submitted:false});printReason='No printer';await assert.rejects(()=>handlers['invoice:print']('bill'),/No printer/);printSuccess=true;assert.deepEqual(await handlers['invoice:print']('bill'),{submitted:true});assert.ok(windows.every(w=>w.destroyed));
  const share=handlers['invoice:share-preview']({billId:'bill',phone:'9876543210'});assert.equal(external.length,0);
  await handlers['invoice:open-whatsapp']({billId:'bill',phone:share.phone,expectedText:share.text});assert.ok(external[0].startsWith('https://wa.me/919876543210?text='));assert.equal(new URL(external[0]).searchParams.get('text'),share.text);
  bill.status='cancelled';await assert.rejects(()=>handlers['invoice:open-whatsapp']({billId:'bill',phone:share.phone,expectedText:share.text}),/changed/);
  handlers['invoice:copy-summary']('bill');assert.equal(clipboard.length,1);assert.ok(clipboard[0].includes('Cancelled'));
});
