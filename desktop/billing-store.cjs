const { randomUUID, createHash } = require('node:crypto');
const { fields, text, validateDraft, totals, prepareBill } = require('../src/redesign/domain/billing');
const { integer } = require('../src/redesign/domain/pricing');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const initialBilling = () => ({ nextNumber:1, draft:null, draftRevision:0, bills:[], operations:[] });
const timestamp = value => { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Invalid invoice timestamp.'); };
const operationId = value => { if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(value)) throw new Error('Invalid billing operation.'); };
function validateBilling(state, inventory, catalog) {
  fields(state,'nextNumber,draft,draftRevision,bills,operations');
  integer(state.nextNumber,'Invoice sequence',999999999); if (!state.nextNumber) throw new Error('Invalid invoice sequence.');
  integer(state.draftRevision,'Draft revision'); if (state.draft !== null) validateDraft(state.draft);
  if (!Array.isArray(state.bills) || state.bills.length > 10000 || !Array.isArray(state.operations) || state.operations.length > 30000) throw new Error('Too many billing records.');
  const ids = new Set(), numbers = new Set(), linked = new Set();
  for (const b of state.bills) {
    fields(b,'id,number,invoiceNumber,savedAt,paidAt,cancelledAt,cancelReason,status,paymentMode,draft,lines,totals,business,saleOperations,cancelOperations');
    operationId(b.id); integer(b.number,'Invoice number');
    if (!b.number || b.number >= state.nextNumber || ids.has(b.id) || numbers.has(b.number) || b.invoiceNumber !== `KC-${String(b.number).padStart(6,'0')}`) throw new Error('Invalid invoice identity or sequence.');
    ids.add(b.id); numbers.add(b.number); timestamp(b.savedAt); validateDraft(b.draft,true);
    if (!['paid','unpaid','cancelled'].includes(b.status)) throw new Error('Invalid invoice status.');
    text(b.cancelReason,500);
    if (b.status === 'paid') { timestamp(b.paidAt); if (!['cash','upi'].includes(b.paymentMode)) throw new Error('Invalid payment mode.'); }
    else if (b.paidAt !== null || b.paymentMode !== null) throw new Error('Invalid unpaid invoice.');
    if (b.status === 'cancelled') { timestamp(b.cancelledAt); if (!b.cancelReason.trim()) throw new Error('Missing cancellation reason.'); }
    else if (b.cancelledAt !== null || b.cancelReason !== '') throw new Error('Invalid cancellation.');
    if (b.draft.paymentStatus === 'paid' && b.status !== 'paid') throw new Error('Paid invoices cannot be cancelled.');
    const { logo, ...businessText } = b.business;
    fields(businessText,'shopName,place,phone,website,instagram,footer'); Object.values(businessText).forEach(v => text(v));
    if (logo !== undefined && (typeof logo !== 'string' || logo.length > 110000 || (logo !== '' && !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(logo)))) throw new Error('Invalid invoice logo.');
    if (!Array.isArray(b.lines) || b.lines.length !== b.draft.lines.length) throw new Error('Invalid invoice lines.');
    b.lines.forEach((l,i) => {
      fields(l,'productId,variantId,colorId,productName,sku,size,color,quantity,unitPricePaise,purchaseCostPaise,unitExpensesPaise');
      for (const key of ['productId','variantId','colorId','productName','sku','size','color']) text(l[key]);
      const d=b.draft.lines[i];
      if (['productId','variantId','colorId','quantity'].some(k => d[k] !== l[k]) || !catalog.products.some(p => p.id===l.productId && p.variants.some(v=>v.id===l.variantId))) throw new Error('Invoice product reference mismatch.');
      integer(l.quantity,'Invoice quantity',1000000); integer(l.unitPricePaise,'Invoice price'); integer(l.purchaseCostPaise,'Invoice cost');
      if (!l.unitPricePaise) throw new Error('Invalid invoice price.');
      fields(l.unitExpensesPaise,'shipping,packaging,other'); Object.values(l.unitExpensesPaise).forEach(v=>integer(v,'Expense'));
    });
    if (JSON.stringify(totals(b.lines,b.draft)) !== JSON.stringify(b.totals)) throw new Error('Invoice totals do not reconcile.');
    for (const [key,type,sign] of [['saleOperations','Sold',-1],['cancelOperations','Cancelled bill',1]]) {
      if (!Array.isArray(b[key]) || (key==='cancelOperations' && b.status!=='cancelled' && b[key].length)) throw new Error('Invalid invoice stock links.');
      const expected=new Map();
      if (key==='saleOperations' || b.status==='cancelled') for (const l of b.lines) { const k=JSON.stringify([l.productId,l.variantId]); expected.set(k,(expected.get(k)||0)+sign*l.quantity); }
      for (const id of b[key]) {
        if (linked.has(id)) throw new Error('Duplicate invoice stock link.'); linked.add(id);
        const op=inventory.operations.find(o=>o.id===id);
        if (!op || op.type!==type) throw new Error('Missing invoice stock operation.');
        for (const m of inventory.movements.filter(m=>m.operationId===id)) {
          const k=JSON.stringify([m.productId,m.variantId]);
          if (expected.get(k)!==m.delta || m.reason!==b.invoiceNumber || m.recordedAt!==(type==='Sold'?b.savedAt:b.cancelledAt)) throw new Error('Invoice stock does not reconcile.');
          expected.delete(k);
        }
      }
      if (expected.size) throw new Error('Missing invoice stock movement.');
    }
  }
  if (inventory.operations.some(o=>['Sold','Cancelled bill'].includes(o.type) && !linked.has(o.id))) throw new Error('Stock sale has no invoice.');
  const ops=new Set();
  for (const op of state.operations) {
    fields(op,'id,requestHash,billId,action'); operationId(op.id);
    if (ops.has(op.id) || !ids.has(op.billId) || !['save','pay','cancel'].includes(op.action) || !/^[a-f0-9]{64}$/.test(op.requestHash)) throw new Error('Invalid billing operation history.');
    ops.add(op.id);
  }
  for (const b of state.bills) {
    const actions=state.operations.filter(o=>o.billId===b.id).map(o=>o.action);
    if(actions.filter(a=>a==='save').length!==1 || actions.filter(a=>a==='pay').length!==(b.draft.paymentStatus==='unpaid' && b.status==='paid'?1:0) || actions.filter(a=>a==='cancel').length!==(b.status==='cancelled'?1:0)) throw new Error('Invoice lifecycle operation history is inconsistent.');
  }
}
const methods = {
  getBilling() { return JSON.parse(this.db.prepare('SELECT value FROM billing_state WHERE id=1').get().value); },
  billingResult(billId=null) { return { billing:this.getBilling(), catalog:this.getCatalog(), inventory:this.getStockView(), billId }; },
  putBilling(state) { this.db.prepare('UPDATE billing_state SET value=? WHERE id=1').run(JSON.stringify(state)); },
  saveBillingDraft(command) {
    fields(command,'draft,expectedRevision'); integer(command.expectedRevision,'Draft revision');
    if(command.draft!==null) validateDraft(command.draft);
    return this.transaction(()=>{const state=this.getBilling();
      if(command.expectedRevision!==state.draftRevision) {
        if(JSON.stringify(command.draft)===JSON.stringify(state.draft)) return this.billingResult();
        throw new Error('Draft changed. Reload billing before saving.');
      }
      state.draft=command.draft; state.draftRevision++; this.putBilling(state); return this.billingResult();
    });
  },
  changeInvoiceStock(bill,type,now) {
    const groups=new Map();
    for(const l of bill.lines) { if(!groups.has(l.productId)) groups.set(l.productId,new Map()); const sizes=groups.get(l.productId); sizes.set(l.variantId,(sizes.get(l.variantId)||0)+l.quantity); }
    const ids=[];
    for(const [productId,sizes] of groups) {
      const p=JSON.parse(this.db.prepare('SELECT value FROM products WHERE id=?').get(productId).value);
      const beforeAvailability=JSON.stringify(p.variants.map(v=>v.active && !p.archived && v.stock>0));
      const id=randomUUID(); ids.push(id);
      this.db.prepare('INSERT INTO stock_operations VALUES (?,?,?,?,?)').run(id,hash({billId:bill.id,type,productId}),productId,type,now);
      for(const [variantId,qty] of sizes) {
        const v=p.variants.find(v=>v.id===variantId); if(!v) throw new Error('Invoice size no longer exists.');
        const before=v.stock, delta=type==='Sold'?-qty:qty; v.stock=integer(before+delta,'Resulting stock',1000000);
        const m={id:randomUUID(),operationId:id,productId,variantId,productName:p.name,sku:p.sku,size:v.label,type,before,delta,after:v.stock,purchaseCostPaise:null,reason:bill.invoiceNumber,note:type==='Sold'?'Bill saved':bill.cancelReason,recordedAt:now};
        this.db.prepare('INSERT INTO stock_movements (id,operationId,value) VALUES (?,?,?)').run(m.id,id,JSON.stringify(m));
      }
      p.revision++; p.updatedAt=now; this.db.prepare('UPDATE products SET value=? WHERE id=?').run(JSON.stringify(p),productId);
      if(beforeAvailability!==JSON.stringify(p.variants.map(v=>v.active && !p.archived && v.stock>0))) this.db.prepare('INSERT INTO pending_availability VALUES (?,?) ON CONFLICT(productId) DO UPDATE SET updatedAt=excluded.updatedAt').run(productId,now);
    }
    return ids;
  },
  saveInvoice(command) { return this.invoiceCommand(command,'save'); },
  payInvoice(command) { return this.invoiceCommand(command,'pay'); },
  cancelInvoice(command) { return this.invoiceCommand(command,'cancel'); },
  invoiceCommand(command,action) {
    fields(command,action==='save'?'operationId,draft,expectedDraftRevision':action==='pay'?'operationId,billId,paymentMode':'operationId,billId,reason'); operationId(command.operationId);
    return this.transaction(()=>{
      const state=this.getBilling(), requestHash=hash({action,command}), prior=state.operations.find(o=>o.id===command.operationId);
      if(prior) { if(prior.requestHash!==requestHash) throw new Error('Billing operation already used for another change.'); return this.billingResult(prior.billId); }
      const now=new Date().toISOString(); let bill;
      if(action==='save') {
        integer(command.expectedDraftRevision,'Draft revision');
        if(command.expectedDraftRevision!==state.draftRevision) throw new Error('Draft changed. Reload billing before saving.');
        if(state.nextNumber>=999999999 || state.bills.length>=10000) throw new Error('Invoice capacity reached.');
        const prepared=prepareBill(command.draft,this.getCatalog().products), preferences=this.getPreferences();
        const number=state.nextNumber++;
        bill={id:randomUUID(),number,invoiceNumber:`KC-${String(number).padStart(6,'0')}`,savedAt:now,paidAt:command.draft.paymentStatus==='paid'?now:null,cancelledAt:null,cancelReason:'',status:command.draft.paymentStatus,paymentMode:command.draft.paymentStatus==='paid'?command.draft.paymentMode:null,draft:JSON.parse(JSON.stringify(command.draft)),...prepared,business:{...Object.fromEntries(['shopName','place','phone','website','instagram','footer'].map(k=>[k,preferences[k]])), ...(preferences.logo ? {logo:preferences.logo} : {})},saleOperations:[],cancelOperations:[]};
        bill.saleOperations=this.changeInvoiceStock(bill,'Sold',now); state.bills.unshift(bill); state.draft=null; state.draftRevision++;
      } else {
        bill=state.bills.find(b=>b.id===command.billId);
        if(!bill || bill.status!=='unpaid') throw new Error('Only an unpaid bill can be paid or cancelled. Reload bills.');
        if(action==='pay') { if(!['cash','upi'].includes(command.paymentMode)) throw new Error('Choose Cash or UPI.'); bill.status='paid';bill.paymentMode=command.paymentMode;bill.paidAt=now; }
        else { text(command.reason,500); if(!command.reason.trim()) throw new Error('Enter a cancellation reason.'); bill.status='cancelled';bill.cancelReason=command.reason.trim();bill.cancelledAt=now;bill.cancelOperations=this.changeInvoiceStock(bill,'Cancelled bill',now); }
      }
      state.operations.push({id:command.operationId,requestHash,billId:bill.id,action}); this.putBilling(state); return this.billingResult(bill.id);
    });
  },
};
module.exports={initialBilling,validateBilling,methods};
