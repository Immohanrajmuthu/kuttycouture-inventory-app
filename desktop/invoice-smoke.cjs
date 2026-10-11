// Render fixtures use the production PDF renderer and an isolated smoke-test store.
const fs=require('node:fs');
const path=require('node:path');
const {nativeImage}=require('electron');
const {FoundationStore}=require('./foundation-store.cjs');
const {publicInvoice}=require('./invoice-document.cjs');
const {pdfBytes,writePDF}=require('./invoice-output.cjs');
module.exports=async function checkInvoiceOutput(window,directory) {
  const store=new FoundationStore(directory);
  let bills;try {bills=store.getBilling().bills;}finally{store.close();}
  const paid=publicInvoice(bills.find(b=>b.status==='paid'));
  const cancelled=publicInvoice(bills.find(b=>b.status==='cancelled'));
  const long=JSON.parse(JSON.stringify(paid));
  long.invoiceNumber='KC-TEST-LONG';long.status='unpaid';long.paymentMode=null;long.paidAt=null;
  long.customer={name:'Sample customer with a long name for print verification',phone:'9876543210',address:'Sample delivery address, Apartment 12, Second Floor, Near the community centre, Kelambakkam, Chennai 603103.\nPlease call before arriving.'};long.handover='delivery';
  long.lines=Array.from({length:40},(_,i)=>({name:`Sample item ${i+1}: Beautiful cotton clothing with a long descriptive product name and coordinated accessory details for page wrapping verification`,sku:`100${String(i).padStart(3,'0')}`,size:'Large - suitable for children aged 5 to 6 years',color:'Rose gold and deep maroon with floral accents',quantity:i%3+1,unitPricePaise:14950,amountPaise:(i%3+1)*14950}));
  long.subtotalPaise=long.lines.reduce((n,l)=>n+l.amountPaise,0);long.discountPaise=Math.round(long.subtotalPaise*.075);long.discountLabel='Discount (7.5%)';long.deliveryChargePaise=6000;long.totalPaise=long.subtotalPaise-long.discountPaise+long.deliveryChargePaise;long.amountDuePaise=long.totalPaise;
  const bitmap=Buffer.alloc(32*32*4);for(let i=0;i<bitmap.length;i+=4){bitmap[i]=70;bitmap[i+1]=100;bitmap[i+2]=35;bitmap[i+3]=255;}
  long.business.logo=`data:image/jpeg;base64,${nativeImage.createFromBitmap(bitmap,{width:32,height:32}).toJPEG(80).toString('base64')}`;
  for(const [name,invoice] of [['invoice-paid',paid],['invoice-unpaid-long',long],['invoice-cancelled',cancelled]]) {
    const bytes=await pdfBytes(invoice,window);if(bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('Invoice PDF invalid.');
    writePDF(path.join(directory,`${name}.pdf`),bytes);
  }
  fs.writeFileSync(path.join(directory,'invoice-output-expected.json'),JSON.stringify({longTotal:long.totalPaise,longLines:long.lines.length}));
  console.log(JSON.stringify({result:'Invoice PDF fixtures generated',directory}));
};
