const {test}=require('node:test');
const assert=require('node:assert/strict');
const {publicInvoice,invoiceHTML,whatsappText,normalizePhone}=require('../invoice-document.cjs');
function fixture(status='unpaid') {
  return {id:'invoice-test',invoiceNumber:'KC-000001',status,paymentMode:status==='paid'?'upi':null,paidAt:status==='paid'?'2026-10-11T10:00:00Z':null,cancelledAt:status==='cancelled'?'2026-10-11T10:00:00Z':null,cancelReason:'PRIVATE cancellation note',
    business:{shopName:'Kutty Couture',place:'Kelambakkam, Chennai',phone:'8610971628',website:'kuttycouture.in',instagram:'@kuttycouture.in',footer:'Thank you for shopping with Kutty Couture!',secret:'PRIVATE'},
    draft:{billDate:'2026-10-11',handover:'pickup',customer:{name:'Customer',phone:'9876543210',address:'PRIVATE pickup address'},discountType:'percent',discountValue:1000,deliveryChargePaise:5000,deliveryExpensePaise:9999},
    lines:[{productName:'Frock',sku:'100089',size:'S',color:'Red',quantity:2,unitPricePaise:20000,purchaseCostPaise:12345,unitExpensesPaise:{shipping:123,packaging:456,other:789},productId:'PRIVATE-ID'}],totals:{subtotalPaise:40000,discountPaise:4000,totalPaise:41000,costPaise:23456,profitPaise:5678}};
}
test('public output explicitly excludes private fields and uses historical invoice snapshots',()=>{
  const bill=fixture(),p=publicInvoice(bill),html=invoiceHTML(p),wa=whatsappText(p);
  for(const output of [JSON.stringify(p),html,wa]) for(const privateValue of ['PRIVATE','purchaseCostPaise','unitExpensesPaise','profitPaise','costPaise','deliveryExpensePaise','12345','23456']) assert.ok(!output.includes(privateValue),privateValue);
  assert.ok(html.includes('₹410.00'));assert.ok(html.includes('10%'));assert.ok(html.includes('KC-000001'));assert.ok(html.includes('Kelambakkam, Chennai'));
  bill.business.shopName='Edited';assert.equal(p.business.shopName,'Kutty Couture');
});
test('paid unpaid and cancelled outputs show correct amount due and status',()=>{
  for(const state of ['paid','unpaid','cancelled']) {
    const p=publicInvoice(fixture(state));assert.equal(p.amountDuePaise,state==='unpaid'?41000:0);
    assert.ok(whatsappText(p).includes(state==='paid'?'Paid (UPI)':state==='unpaid'?'Unpaid':'Cancelled - no payment due'));
    if(state==='cancelled')assert.ok(invoiceHTML(p).includes('CANCELLED - No payment due.'));
  }
});
test('HTML escapes all catalog and customer content; unsafe logos are not embedded',()=>{
  const bill=fixture();bill.lines[0].productName='<img src=x onerror=alert(1)>';bill.business.shopName='A & B';bill.business.logo='https://example.com/track';bill.draft.handover='delivery';bill.draft.customer.address='<script>bad()</script>';
  const html=invoiceHTML(publicInvoice(bill));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('A &amp; B'));assert.ok(!html.includes('https://example.com/track'));
});
test('WhatsApp recipients normalize India and international numbers and reject URL or malformed input',()=>{
  assert.equal(normalizePhone('98765 43210'),'919876543210');assert.equal(normalizePhone('+91 (98765) 43210'),'919876543210');assert.equal(normalizePhone('+44 7700 900123'),'447700900123');
  assert.equal(normalizePhone('+33 12345678'),'3312345678');
  for(const phone of ['',null,'wa.me/123','+91abc9876543210','00000000','123','+12+34','1234567890123456'])assert.throws(()=>normalizePhone(phone));
});
