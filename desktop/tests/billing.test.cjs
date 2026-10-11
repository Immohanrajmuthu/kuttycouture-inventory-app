const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { FoundationStore, parseBackup } = require('../foundation-store.cjs');
const source = require('../../src/data/websiteCatalog.json');
const copy = o => JSON.parse(JSON.stringify(o));
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kutty-billing-'));
  const store=new FoundationStore(dir);store.initializeCatalog(source);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  let p=store.getCatalog().products.find(p=>p.sku==='100089');
  p.colors=[{id:'red',label:'Red',active:true},{id:'blue',label:'Blue',active:true}];
  p.variants.forEach(v=>{v.purchaseCostPaise=10000;v.sellingPricePaise=20000;v.unitExpensesPaise={shipping:500,packaging:200,other:0};});
  store.saveProduct({operationId:randomUUID(),product:p});p=store.getCatalog().products.find(p=>p.id===p.id && p.sku==='100089');
  store.receiveStock({operationId:randomUUID(),productId:p.id,expectedRevision:p.revision,lines:p.variants.map(v=>({variantId:v.id,quantity:5,purchaseCostPaise:10000}))});
  return store;
}
const product=s=>s.getCatalog().products.find(p=>p.sku==='100089');
function draft(s,quantity=2) {const p=product(s);return {lines:[{productId:p.id,variantId:p.variants[0].id,colorId:'red',quantity,expectedRevision:p.revision}],channel:'in-person',handover:'pickup',customer:{name:'Customer',phone:'',address:''},paymentStatus:'unpaid',paymentMode:'upi',billDate:'2026-10-11',discountType:'percent',discountValue:1000,deliveryChargePaise:5000,deliveryExpensePaise:3000};}
const save=(s,d=draft(s))=>s.saveInvoice({operationId:randomUUID(),draft:d,expectedDraftRevision:s.getBilling().draftRevision});
const envelope=p=>JSON.stringify({format:'kutty-couture-foundation',payload:p,checksum:createHash('sha256').update(JSON.stringify(p)).digest('hex')});

test('unpaid save is atomic, snapshots costs, allocates one invoice and deducts combined colors once on retry',t=>{
  const s=fixture(t),d=draft(s);d.lines.push({...d.lines[0],colorId:'blue',quantity:3});
  s.saveBillingDraft({draft:d,expectedRevision:0});
  const command={operationId:randomUUID(),draft:d,expectedDraftRevision:1};
  const result=s.saveInvoice(command);s.saveInvoice(command);
  const b=result.billing.bills[0];assert.equal(b.invoiceNumber,'KC-000001');assert.equal(product(s).variants[0].stock,0);
  assert.equal(s.getBilling().bills.length,1);assert.equal(s.getBilling().draft,null);assert.equal(s.getBilling().nextNumber,2);
  assert.deepEqual(b.totals,{subtotalPaise:100000,discountPaise:10000,totalPaise:95000,costPaise:53500,profitPaise:38500});
  assert.equal(s.getStockView().movements.filter(m=>m.type==='Sold').length,1);
  let p=product(s);p.variants[0].purchaseCostPaise=90000;p.variants[0].sellingPricePaise=99900;s.saveProduct({operationId:randomUUID(),product:p});
  assert.equal(s.getBilling().bills[0].lines[0].purchaseCostPaise,10000);
  assert.equal(s.getBilling().bills[0].lines[0].unitPricePaise,20000);
  assert.throws(()=>s.saveInvoice({...command,draft:{...d,deliveryChargePaise:1}}),/already used/);
  assert.doesNotThrow(()=>parseBackup(s.exportBackup()));
});
test('aggregate overselling, missing choices, stale data, zero prices and invalid customer or discounts cannot save',t=>{
  const s=fixture(t);
  for(const mutate of [d=>d.lines.push({...d.lines[0],colorId:'blue',quantity:4}),d=>d.lines[0].colorId='',d=>d.lines[0].expectedRevision--,d=>d.customer.name='',d=>{d.handover='delivery';},d=>d.discountValue=10001,d=>{d.discountType='amount';d.discountValue=999999;},d=>d.billDate='2026-02-30']) {
    const d=draft(s);mutate(d);assert.throws(()=>save(s,d));assert.equal(s.getBilling().nextNumber,1);assert.equal(product(s).variants[0].stock,5);
  }
  let p=product(s);p.variants[0].sellingPricePaise=0;s.saveProduct({operationId:randomUUID(),product:p});assert.throws(()=>save(s),/selling price/);
});
test('paid walk-in and unpaid-to-paid retain invoice number and never deduct again',t=>{
  const s=fixture(t);let result=save(s);const billId=result.billId;
  const command={operationId:randomUUID(),billId,paymentMode:'cash'};s.payInvoice(command);s.payInvoice(command);
  assert.equal(s.getBilling().bills[0].status,'paid');assert.equal(s.getBilling().bills[0].invoiceNumber,'KC-000001');assert.equal(product(s).variants[0].stock,3);
  assert.throws(()=>s.cancelInvoice({operationId:randomUUID(),billId,reason:'Return'}),/unpaid/);
  const d=draft(s,1);d.paymentStatus='paid';d.customer.name='';save(s,d);assert.equal(product(s).variants[0].stock,2);
  assert.doesNotThrow(()=>parseBackup(s.exportBackup()));
});
test('unpaid cancellation restores shared stock once, preserves costs and records reason',t=>{
  const s=fixture(t), result=save(s), billId=result.billId;
  assert.throws(()=>s.cancelInvoice({operationId:randomUUID(),billId,reason:' '}),/reason/);
  const command={operationId:randomUUID(),billId,reason:'Customer changed order'};s.cancelInvoice(command);s.cancelInvoice(command);
  assert.equal(product(s).variants[0].stock,5);assert.equal(product(s).variants[0].purchaseCostPaise,10000);
  assert.equal(s.getStockView().movements[0].type,'Cancelled bill');assert.equal(s.getBilling().bills[0].status,'cancelled');
  assert.throws(()=>s.payInvoice({operationId:randomUUID(),billId,paymentMode:'upi'}),/unpaid/);
  assert.doesNotThrow(()=>parseBackup(s.exportBackup()));
});
test('draft survives reopening without stock effects and stale writes are rejected',t=>{
  const s=fixture(t),d=draft(s);s.saveBillingDraft({draft:d,expectedRevision:0});
  const reopened=new FoundationStore(s.directory);assert.deepEqual(reopened.getBilling().draft,d);reopened.close();
  assert.equal(product(s).variants[0].stock,5);assert.equal(s.getBilling().nextNumber,1);
  assert.throws(()=>s.saveBillingDraft({draft:null,expectedRevision:0}),/Draft changed/);
});
test('failed invoice write rolls back stock, ledger, number and draft; same command can retry',t=>{
  const s=fixture(t),d=draft(s);s.saveBillingDraft({draft:d,expectedRevision:0});
  const before=s.exportBackup(),command={operationId:randomUUID(),draft:d,expectedDraftRevision:1};
  s.db.exec("CREATE TRIGGER reject_bill BEFORE UPDATE ON billing_state BEGIN SELECT RAISE(ABORT, 'disk failure'); END;");
  assert.throws(()=>s.saveInvoice(command),/disk failure/);
  assert.equal(product(s).variants[0].stock,5);assert.equal(s.getBilling().nextNumber,1);assert.deepEqual(s.getBilling().draft,d);
  assert.deepEqual(JSON.parse(s.exportBackup()).payload.inventory,JSON.parse(before).payload.inventory);
  s.db.exec('DROP TRIGGER reject_bill');s.saveInvoice(command);assert.equal(product(s).variants[0].stock,3);
});
test('process interruption before invoice commit leaves no partial stock or invoice',t=>{
  const s=fixture(t),d=draft(s);s.saveBillingDraft({draft:d,expectedRevision:0});
  const script=`const {FoundationStore}=require(${JSON.stringify(require.resolve('../foundation-store.cjs'))});const s=new FoundationStore(process.argv[1]);s.putBilling=()=>process.exit(23);s.saveInvoice(JSON.parse(process.argv[2]));`;
  const child=spawnSync(process.execPath,['-e',script,s.directory,JSON.stringify({operationId:randomUUID(),draft:d,expectedDraftRevision:1})]);
  assert.equal(child.status,23);assert.equal(product(s).variants[0].stock,5);assert.equal(s.getBilling().bills.length,0);assert.deepEqual(s.getBilling().draft,d);
});
test('backup restores invoice lifecycle and draft, rejects tampering, retains number high-water and accepts schema 3',t=>{
  const s=fixture(t);const old=JSON.parse(s.exportBackup()).payload;old.schemaVersion=3;delete old.billing;
  save(s);const backup=s.exportBackup();save(s,draft(s,1));s.restoreBackup(backup);assert.equal(s.getBilling().bills.length,1);assert.equal(s.getBilling().nextNumber,3);
  for(const mutate of [p=>p.billing.bills[0].totals.totalPaise++,p=>p.billing.bills[0].saleOperations=[],p=>p.billing.nextNumber=1,p=>p.billing.bills=[]]) {const broken=JSON.parse(backup).payload;mutate(broken);assert.throws(()=>s.restoreBackup(envelope(broken)));}
  s.restoreBackup(envelope(old));assert.equal(s.getBilling().bills.length,0);assert.equal(s.getBilling().nextNumber,3);assert.equal(product(s).variants[0].stock,5);
  save(s);assert.equal(s.getBilling().bills[0].invoiceNumber,'KC-000003');
});
test('schema 3 upgrade keeps stock and creates a safety backup before initializing billing',t=>{
  const s=fixture(t);s.db.exec('DROP TABLE billing_state; PRAGMA user_version=3;');
  const reopened=new FoundationStore(s.directory);assert.equal(reopened.getBilling().nextNumber,1);assert.equal(product(reopened).variants[0].stock,5);reopened.close();
  assert.ok(fs.readdirSync(path.join(s.directory,'safety-backups')).some(f=>f.startsWith('before-schema-4')));
});

test('multi-product bill and cancellation failures roll back all products together',t=>{
  const s=fixture(t);let other=s.getCatalog().products.find(p=>p.sku==='100000');
  other.variants[0].sellingPricePaise=5000;s.saveProduct({operationId:randomUUID(),product:other});other=s.getCatalog().products.find(p=>p.id===other.id);
  s.receiveStock({operationId:randomUUID(),productId:other.id,expectedRevision:other.revision,lines:[{variantId:other.variants[0].id,quantity:3,purchaseCostPaise:2000}]});other=s.getCatalog().products.find(p=>p.id===other.id);
  const d=draft(s);d.lines.push({productId:other.id,variantId:other.variants[0].id,colorId:other.colors.find(c=>c.active)?.id||'',quantity:1,expectedRevision:other.revision});
  const r=save(s,d);assert.equal(s.getCatalog().products.find(p=>p.id===other.id).variants[0].stock,2);
  const before=s.getInventory();s.db.exec("CREATE TRIGGER reject_cancel BEFORE UPDATE ON billing_state BEGIN SELECT RAISE(ABORT, 'write failure'); END;");
  const command={operationId:randomUUID(),billId:r.billId,reason:'Cancelled order'};
  assert.throws(()=>s.cancelInvoice(command),/write failure/);assert.deepEqual(s.getInventory(),before);assert.equal(s.getBilling().bills[0].status,'unpaid');assert.equal(product(s).variants[0].stock,3);
  s.db.exec('DROP TRIGGER reject_cancel');s.cancelInvoice(command);assert.equal(product(s).variants[0].stock,5);assert.equal(s.getCatalog().products.find(p=>p.id===other.id).variants[0].stock,3);assert.doesNotThrow(()=>parseBackup(s.exportBackup()));
});

test('shop logo is snapshotted for new invoices and survives backup without changing historical branding',t=>{
  const s=fixture(t),logo='data:image/jpeg;base64,/9j/2Q==';
  s.updatePreferences({logo});save(s);s.updatePreferences({logo:'',shopName:'New name'});
  const b=s.getBilling().bills[0];assert.equal(b.business.logo,logo);assert.equal(b.business.shopName,'Kutty Couture');
  const backup=s.exportBackup();assert.equal(parseBackup(backup).billing.bills[0].business.logo,logo);
  assert.throws(()=>s.updatePreferences({logo:'https://example.com/logo.jpg'}),/logo/);
  s.restoreBackup(backup);assert.equal(s.getBilling().bills[0].business.logo,logo);
});
