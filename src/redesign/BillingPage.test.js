import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FoundationApp from './FoundationApp';
import { prepareBill } from './domain/billing';
let root,container,data;
const buttons=()=>[...container.querySelectorAll('button')];
const click=async text=>act(async()=>{const b=buttons().find(b=>b.textContent===text);if(!b)throw new Error(`Missing ${text}`);b.click();});
const label=text=>[...container.querySelectorAll('label')].find(l=>l.textContent.startsWith(text)).querySelector('input,select');
async function input(el,value){await act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;let id=0;Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=>`billing-operation-${++id}`}});
  window.confirm=jest.fn(()=>true);
  const product={id:'p1',sku:'100089',name:'Frock',archived:false,revision:1,colors:[{id:'red',label:'Red',active:true}],variants:[{id:'s',label:'S',active:true,stock:5,sellingPricePaise:20000,purchaseCostPaise:10000,unitExpensesPaise:{shipping:0,packaging:0,other:0}}]};
  data={preferences:{theme:'light',lastScreen:'new-bill',shopName:'Kutty Couture'},catalog:{products:[product],state:{}},inventory:{movements:[],pendingAvailabilityCount:0},billing:{bills:[],draft:null,draftRevision:0}};
  window.foundationAPI={load:jest.fn(async()=>data),updatePreferences:jest.fn(async patch=>({...data.preferences,...patch})),loadBilling:jest.fn(async()=>data),saveBillingDraft:jest.fn(async({draft})=>{data={...data,billing:{...data.billing,draft,draftRevision:data.billing.draftRevision+1}};return data;}),saveInvoice:jest.fn(async({draft})=>{const b={id:'bill1',invoiceNumber:'KC-000001',status:draft.paymentStatus,paymentMode:draft.paymentMode,savedAt:new Date().toISOString(),paidAt:new Date().toISOString(),business:{shopName:'Kutty Couture'},draft,...prepareBill(draft,data.catalog.products)};data={...data,billing:{bills:[b],draft:null,draftRevision:data.billing.draftRevision+1}};return {...data,billId:b.id};})};
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();delete window.foundationAPI;});
async function add(){await input(label('Find product'),'100089');await act(async()=>label('Find product').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));await click('Add to bill');}
test('keyboard search auto-selects sole size/color and saves a recoverable draft without issuing a bill',async()=>{
  await act(async()=>root.render(<FoundationApp/>));await add();expect(document.activeElement).toBe(label('Find product'));
  await click('Save draft');expect(window.foundationAPI.saveBillingDraft.mock.calls[0][0].draft.lines[0]).toMatchObject({colorId:'red',variantId:'s',quantity:1});expect(window.foundationAPI.saveInvoice).not.toHaveBeenCalled();
  await act(async()=>root.unmount());root=createRoot(container);await act(async()=>root.render(<FoundationApp/>));expect(container.textContent).toContain('Remove item 1');
});
test('unpaid customer validation and save failure retain review and operation ID for retry',async()=>{
  await act(async()=>root.render(<FoundationApp/>));await add();await input(label('Payment status'),'unpaid');await click('Review bill');expect(container.textContent).toContain('needs a customer name or phone');
  await input(label('Customer name'),'Mohan');await click('Review bill');window.foundationAPI.saveInvoice.mockRejectedValueOnce(new Error('Disk full'));await click('Save unpaid bill');expect(container.textContent).toContain('Disk full');await click('Save unpaid bill');
  expect(window.foundationAPI.saveInvoice.mock.calls[0][0].operationId).toBe(window.foundationAPI.saveInvoice.mock.calls[1][0].operationId);expect(container.textContent).toContain('KC-000001');
});
test('zero-price items are blocked and quantity across cart is checked before review',async()=>{
  data.catalog.products[0].variants[0].sellingPricePaise=0;await act(async()=>root.render(<FoundationApp/>));await add();expect(container.textContent).toContain('Set a selling price in Products & Pricing.');expect(container.textContent).not.toContain('Remove item 1');
});
