import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import InvoiceActions from './InvoiceActions';
let container,root,run;
const bill={id:'bill',invoiceNumber:'KC-000001',status:'unpaid',draft:{customer:{phone:'9876543210'}}};
async function click(text){await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent===text).click());}
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);run=jest.fn(async fn=>fn());
 window.foundationAPI={previewInvoice:jest.fn(async()=>({html:'<!doctype html><p>Invoice</p>',invoiceNumber:'KC-000001'})),exportInvoicePDF:jest.fn(async()=>null),printInvoice:jest.fn(async()=>({submitted:false})),previewInvoiceShare:jest.fn(async()=>({phone:'919876543210',text:'Invoice KC-000001 summary'})),openInvoiceWhatsApp:jest.fn(async()=>true),copyInvoiceSummary:jest.fn(async()=>true)};
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();delete window.foundationAPI;});
test('invoice preview is sandboxed and PDF/print actions target only the saved invoice ID',async()=>{
 await act(async()=>root.render(<InvoiceActions bill={bill} busy={false} run={run}/>));await click('Preview A4');expect(container.querySelector('iframe').getAttribute('sandbox')).toBe('');expect(container.querySelector('iframe').srcdoc).toContain('Invoice');await click('Save PDF');await click('Print A4…');expect(window.foundationAPI.exportInvoicePDF).toHaveBeenCalledWith('bill');expect(window.foundationAPI.printInvoice).toHaveBeenCalledWith('bill');
});
test('preparing and reviewing WhatsApp never opens it until the explicit Open action',async()=>{
 await act(async()=>root.render(<InvoiceActions bill={bill} busy={false} run={run}/>));await click('Prepare WhatsApp');expect(window.foundationAPI.openInvoiceWhatsApp).not.toHaveBeenCalled();await click('Review message');expect(container.querySelector('textarea').value).toBe('Invoice KC-000001 summary');expect(window.foundationAPI.openInvoiceWhatsApp).not.toHaveBeenCalled();await click('Open WhatsApp');expect(window.foundationAPI.openInvoiceWhatsApp).toHaveBeenCalledWith({billId:'bill',phone:'+919876543210',expectedText:'Invoice KC-000001 summary'});
 await act(async()=>root.render(<InvoiceActions bill={{...bill,status:'paid'}} busy={false} run={run}/>));expect(container.querySelector('textarea')).toBeNull();
});
