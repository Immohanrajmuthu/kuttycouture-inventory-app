// Explicit public invoice projection: never pass private billing records to a template.
function publicInvoice(bill) {
  return {
    invoiceNumber: bill.invoiceNumber,
    billDate: bill.draft.billDate,
    status: bill.status,
    paymentMode: bill.status === 'paid' ? bill.paymentMode : null,
    paidAt: bill.status === 'paid' ? bill.paidAt : null,
    cancelledAt: bill.status === 'cancelled' ? bill.cancelledAt : null,
    business: Object.fromEntries(['shopName','place','phone','website','instagram','footer','logo'].map(key => [key, bill.business[key] || ''])),
    customer: { name: bill.draft.customer.name, phone: bill.draft.customer.phone, address: bill.draft.handover === 'delivery' ? bill.draft.customer.address : '' },
    handover: bill.draft.handover,
    lines: bill.lines.map(line => ({ name: line.productName, sku: line.sku, size: line.size, color: line.color, quantity: line.quantity, unitPricePaise: line.unitPricePaise, amountPaise: line.quantity * line.unitPricePaise })),
    subtotalPaise: bill.totals.subtotalPaise,
    discountPaise: bill.totals.discountPaise,
    discountLabel: bill.draft.discountType === 'percent' ? `Discount (${bill.draft.discountValue / 100}%)` : 'Discount',
    deliveryChargePaise: bill.draft.deliveryChargePaise,
    totalPaise: bill.totals.totalPaise,
    amountDuePaise: bill.status === 'unpaid' ? bill.totals.totalPaise : 0,
  };
}
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value / 100);
const date = value => value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(value.length === 10 ? `${value}T12:00:00+05:30` : value)) : '';
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function invoiceHTML(invoice) {
  const e = escapeHTML, b = invoice.business;
  const state = invoice.status === 'paid' ? `Paid - ${invoice.paymentMode.toUpperCase()}` : invoice.status === 'cancelled' ? 'Cancelled' : 'Unpaid';
  const logo = /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(b.logo) && b.logo.length <= 110000 ? `<img class="logo" src="${e(b.logo)}" alt="Shop logo">` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; base-uri 'none'; form-action 'none'"><title>${e(invoice.invoiceNumber)} - ${e(b.shopName)}</title><style>
    @page { size:A4 portrait; margin:14mm 14mm 18mm; @bottom-right { content:"Page " counter(page) " of " counter(pages); font:9pt 'Segoe UI',sans-serif; color:#53645a; } }
    * { box-sizing:border-box; } body { margin:0; color:#22372c; font:10pt/1.45 'Segoe UI','Nirmala UI',Arial,sans-serif; background:white; }
    .header { display:flex; justify-content:space-between; gap:10mm; border-bottom:2px solid #285b45; padding-bottom:6mm; margin-bottom:6mm; break-inside:avoid; }
    .brand { display:flex; gap:4mm; align-items:flex-start; min-width:0; } .logo { width:18mm; height:18mm; object-fit:contain; }
    h1 { font-size:20pt; line-height:1.2; margin:0 0 2mm; overflow-wrap:anywhere; } h2 { font-size:15pt; margin:0 0 2mm; } p { margin:0 0 1.5mm; overflow-wrap:anywhere; }
    .meta { text-align:right; min-width:48mm; } .status { display:inline-block; font-weight:700; border:1px solid #64786c; border-radius:3px; padding:1mm 3mm; margin-top:2mm; }
    .customer { margin-bottom:6mm; break-inside:avoid; } .muted { color:#53645a; } .address { white-space:pre-wrap; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; } thead { display:table-header-group; } th { font-size:9pt; text-align:left; background:#eef2ef; color:#344c3d; } th,td { padding:3mm 2mm; border-bottom:1px solid #d8e0da; vertical-align:top; overflow-wrap:anywhere; }
    tr { break-inside:avoid; } th.num,td.num { text-align:right; } .sku { display:block; font-size:8pt; color:#53645a; margin-top:1mm; } .continuation th { padding:2mm; background:white; font-size:8pt; }
    .summary h2 { font-size:10pt; color:#53645a; margin-bottom:3mm; }
    .summary { margin-top:6mm; break-inside:avoid; page-break-inside:avoid; } .totals { width:88mm; margin-left:auto; table-layout:auto; } .totals td { padding:2mm; border:0; } .totals td:last-child { text-align:right; white-space:nowrap; } .total td { border-top:1px solid #285b45; font-size:13pt; font-weight:700; padding-top:3mm; }
    .footer { text-align:center; margin-top:8mm; border-top:1px solid #d8e0da; padding-top:4mm; } .cancelled { border:1px solid #805d57; padding:3mm; margin:4mm 0; color:#754037; break-inside:avoid; }
    @media screen { body { width:210mm; min-height:297mm; padding:14mm; margin:0 auto; } }
    @media print { body { width:auto; } }
  </style></head><body>
  <header class="header"><div class="brand">${logo}<div><h1>${e(b.shopName)}</h1><p>${e(b.place)}</p><p>${e(b.phone)}</p><p>${e(b.website)}${b.instagram ? ` | ${e(b.instagram)}` : ''}</p></div></div><div class="meta"><h2>Invoice</h2><p><strong>${e(invoice.invoiceNumber)}</strong></p><p>${e(date(invoice.billDate))}</p><span class="status">${e(state)}</span></div></header>
  <section class="customer"><p class="muted">Billed to</p><p><strong>${e(invoice.customer.name || 'Walk-in customer')}</strong></p>${invoice.customer.phone ? `<p>${e(invoice.customer.phone)}</p>` : ''}<p>${invoice.handover === 'delivery' ? 'Delivery' : 'Pickup'}</p>${invoice.customer.address ? `<p class="address">${e(invoice.customer.address)}</p>` : ''}</section>
  ${invoice.status === 'cancelled' ? `<p class="cancelled"><strong>CANCELLED - No payment due.</strong> Cancelled on ${e(date(invoice.cancelledAt))}. This document is retained for reference.</p>` : ''}
  <table aria-label="Invoice items"><colgroup><col style="width:7%"><col style="width:35%"><col style="width:20%"><col style="width:8%"><col style="width:15%"><col style="width:15%"></colgroup><thead><tr class="continuation"><th colspan="6">${e(invoice.invoiceNumber)} | Item details</th></tr><tr><th>No.</th><th>Product / SKU</th><th>Size / color</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>${invoice.lines.map((l,i) => `<tr><td>${i+1}</td><td>${e(l.name)}<span class="sku">${e(l.sku)}</span></td><td>${e(l.size)}${l.color ? `<br>${e(l.color)}` : ''}</td><td class="num">${e(l.quantity)}</td><td class="num">${e(money(l.unitPricePaise))}</td><td class="num">${e(money(l.amountPaise))}</td></tr>`).join('')}</tbody></table>
  <section class="summary"><h2>${e(invoice.invoiceNumber)} | Invoice totals</h2><table class="totals" aria-label="Invoice totals"><tbody><tr><td>Product subtotal</td><td>${e(money(invoice.subtotalPaise))}</td></tr><tr><td>${e(invoice.discountLabel)}</td><td>-${e(money(invoice.discountPaise))}</td></tr><tr><td>Delivery charge</td><td>${e(money(invoice.deliveryChargePaise))}</td></tr><tr class="total"><td>Total</td><td>${e(money(invoice.totalPaise))}</td></tr><tr><td>Amount due</td><td>${e(money(invoice.amountDuePaise))}</td></tr></tbody></table>${invoice.status === 'paid' ? `<p class="muted">Paid by ${e(invoice.paymentMode.toUpperCase())} on ${e(date(invoice.paidAt))}.</p>` : ''}<footer class="footer">${e(b.footer)}</footer></section>
  </body></html>`;
}
function whatsappText(invoice) {
  const state = invoice.status === 'paid' ? `Paid (${invoice.paymentMode.toUpperCase()})` : invoice.status === 'cancelled' ? 'Cancelled - no payment due' : 'Unpaid';
  return [`${invoice.business.shopName}`, `Invoice ${invoice.invoiceNumber} | ${date(invoice.billDate)}`, invoice.customer.name ? `Customer: ${invoice.customer.name}` : '', `Status: ${state}`, '', `Product subtotal: ${money(invoice.subtotalPaise)}`, `${invoice.discountLabel}: ${money(invoice.discountPaise)}`, `Delivery charge: ${money(invoice.deliveryChargePaise)}`, `Total: ${money(invoice.totalPaise)}`, `Amount due: ${money(invoice.amountDuePaise)}`, '', 'Please see the attached invoice PDF for item details.', invoice.business.footer, [invoice.business.phone, invoice.business.website, invoice.business.instagram].filter(Boolean).join(' | ')].filter(line => line !== null).join('\n');
}
function normalizePhone(value) {
  if (typeof value !== 'string' || value.length > 40 || !/^\+?[\d ()-]+$/.test(value.trim())) throw new Error('Enter a valid WhatsApp phone number with country code, for example +91 9876543210.');
  let phone = value.replace(/[ ()+-]/g,'');
  if (phone.length === 10 && !value.trim().startsWith('+')) phone = `91${phone}`;
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error('Enter a valid WhatsApp phone number with country code.');
  return phone;
}
module.exports = { publicInvoice, invoiceHTML, whatsappText, normalizePhone };
