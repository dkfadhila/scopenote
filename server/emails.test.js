import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accountEmail,receiptEmail,deliverEmail} from './emails.js';
import {createReceipts} from './receipts.js';

const config={origin:'https://scopenote.example',emailFrom:'ScopeNote <mail@example.com>',resendKey:'synthetic-key'};
const order={_id:'paid-order',userId:'alice',status:'paid',priceCents:100,currency:'USD',paidAt:new Date('2026-10-16T06:00:00Z'),premiumUntil:new Date('2026-11-15T06:00:00Z'),paymentCoin:'USDC',paymentAmount:'1.0013'};

test('account email has readable text, branded HTML, escaped names and exact secure link',()=>{
  for(const kind of ['verify','reset']){
    const url=`https://scopenote.example/#${kind}=synthetic-token`;
    const message=accountEmail(config,kind,{name:'<script>Alice</script>',url});
    assert(message.text.includes(url));assert(message.html.includes(url));
    assert(!message.html.includes('<script>'));assert(message.html.includes('&lt;script&gt;'));
    assert(message.html.includes('/email/scopenote-stationery.png'));assert(message.html.includes('/brand/scopenote-logo.png'));
    assert(message.html.includes(kind==='verify'?'24 hours':'15 minutes'));
  }
});

test('receipt uses the paid order amount, dates and reference without inventing tax or recurring billing',()=>{
  const message=receiptEmail(config,order,{name:'Alice & Bob'});
  for(const value of ['paid-order','$1.00 USD','15 November 2026','1.0013 USDC','No subscription','not a tax invoice'])assert(message.text.includes(value));
  assert(message.html.includes('Alice &amp; Bob'));assert(message.html.includes('not a tax invoice'));
});

function fixture(){
  const sets=new Map();let time=new Date('2026-10-16T07:00:00Z'),mailCalls=0,failMail=false,failOrderWrite=false;
  const match=(row,query)=>Object.entries(query).every(([key,value])=>{
    if(value&&typeof value==='object'&&!(value instanceof Date))return Object.entries(value).every(([op,target])=>({$ne:row[key]!==target,$in:target?.includes?.(row[key]),$lte:row[key]<=target,$exists:target?row[key]!==undefined:row[key]===undefined})[op]);
    return row[key]===value;
  });
  const collection=name=>{
    if(sets.has(name))return sets.get(name);
    const rows=[];const update=(row,change)=>{Object.assign(row,structuredClone(change.$set||{}));for(const [key,n]of Object.entries(change.$inc||{}))row[key]=(row[key]||0)+n;};
    const c={rows,async insertOne(row){if(rows.some(x=>x._id===row._id))throw Object.assign(new Error('duplicate'),{code:11000});rows.push(structuredClone(row));},async findOne(q){const row=rows.find(x=>match(x,q));return row?structuredClone(row):null;},async findOneAndUpdate(q,change){const row=rows.find(x=>match(x,q));if(!row)return null;update(row,change);return structuredClone(row);},async updateOne(q,change){if(name==='billingOrders'&&failOrderWrite){failOrderWrite=false;throw new Error('ledger write outage');}const row=rows.find(x=>match(x,q));if(row)update(row,change);},find(q){return {sort(){return this;},limit(){return this;},async toArray(){return structuredClone(rows.filter(x=>match(x,q)));}};}};sets.set(name,c);return c;
  };
  collection('billingOrders').rows.push(structuredClone(order));collection('users').rows.push({_id:'alice',email:'alice@example.invalid',name:'Alice'});
  const messages=[];
  const receipts=createReceipts(config,{database:async()=>({collection})},{now:()=>new Date(time),sendMail:async message=>{mailCalls++;messages.push(structuredClone(message));if(failMail)throw new Error('provider unavailable');return {id:'email-accepted'};}});
  return {receipts,collection,messages,calls:()=>mailCalls,advance(ms){time=new Date(+time+ms);},failMail(value){failMail=value;},failLedger(){failOrderWrite=true;}};
}

test('concurrent receipt attempts and repeated payment checks send once per paid order',async()=>{
  const f=fixture();await Promise.all(Array.from({length:8},()=>f.receipts.deliver(order._id)));await f.receipts.retry();
  assert.equal(f.calls(),1);assert(f.collection('billingOrders').rows[0].receiptSentAt);
  assert.equal(f.messages[0].to,'alice@example.invalid');assert.equal(f.messages[0].idempotencyKey,'scopenote-receipt/paid-order');
});

test('failed mail retries use the immutable payload and same idempotency key',async()=>{
  const f=fixture();f.failMail(true);assert.equal((await f.receipts.deliver(order._id)).status,'queued');
  assert.equal(f.collection('billingOrders').rows[0].status,'paid');
  f.collection('users').rows[0].name='Changed name';f.advance(61000);f.failMail(false);
  assert.equal((await f.receipts.deliver(order._id)).status,'sent');assert.deepEqual(f.messages[0],f.messages[1]);
});

test('accepted mail followed by a ledger failure is repaired without another send',async()=>{
  const f=fixture();f.failLedger();await f.receipts.deliver(order._id);await f.receipts.deliver(order._id);
  assert.equal(f.calls(),1);assert(f.collection('billingOrders').rows[0].receiptSentAt);
});

test('unpaid orders never get receipts and ambiguous retries stop before provider key expiry',async()=>{
  const f=fixture();f.collection('billingOrders').rows[0].status='pending';assert.equal((await f.receipts.deliver(order._id)).status,'unpaid');assert.equal(f.calls(),0);
  f.collection('billingOrders').rows[0].status='paid';f.failMail(true);await f.receipts.deliver(order._id);f.advance(24*3600000);f.failMail(false);
  assert.equal((await f.receipts.deliver(order._id)).status,'needs_review');assert.equal(f.calls(),1);
});

test('Resend receives HTML and text with an order-specific idempotency key',async()=>{
  let request;
  await deliverEmail(config,{to:'alice@example.invalid',subject:'Receipt',text:'Plain text',html:'<p>Receipt</p>',idempotencyKey:'receipt/unit'},{fetchImpl:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({id:'mail-unit'})};}});
  assert.equal(request.options.headers['Idempotency-Key'],'receipt/unit');const body=JSON.parse(request.options.body);assert.equal(body.html,'<p>Receipt</p>');assert.equal(body.text,'Plain text');
});
