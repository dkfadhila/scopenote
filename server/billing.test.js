import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {createBilling} from './billing.js';
import {createAllscaleClient,verifyAllscaleWebhook} from './allscale.js';
import {createApp} from './app.js';

const config={accounts:true,allscaleEnabled:true,allscaleKey:'unit-key',allscaleSecret:'unit-secret',origin:'https://scopenote.example'};
const time=new Date('2026-10-16T12:00:00Z'),DAY=86400000;
const clone=value=>value===undefined?value:structuredClone(value);
function evaluate(value,row){
  if(typeof value==='string'&&value.startsWith('$'))return row[value.slice(1)];
  if(value===null||typeof value!=='object'||value instanceof Date)return value;
  if(Array.isArray(value))return value.map(item=>evaluate(item,row));
  const [op,args]=Object.entries(value)[0];
  const values=()=>args.map(item=>evaluate(item,row));
  if(op==='$cond'){const [condition,yes,no]=args;return evaluate(condition,row)?evaluate(yes,row):evaluate(no,row);}
  if(op==='$and')return values().every(Boolean);
  if(op==='$gt'){const [a,b]=values();return a>b;}
  if(op==='$ne'){const [a,b]=values();return a!==b;}
  if(op==='$ifNull'){const [a,b]=values();return a??b;}
  if(op==='$concatArrays')return values().flat();
  if(op==='$dateAdd')return new Date(+evaluate(args.startDate,row)+args.amount*DAY);
  throw new Error(`Unsupported test pipeline expression ${op}`);
}
function fixture(overrides={}){
  const sets=new Map(),calls=[],details=new Map();let failLedger=false;
  const matches=(row,query)=>Object.entries(query).every(([key,value])=>{
    const actual=row[key];
    if(value&&typeof value==='object'&&'$ne'in value)return Array.isArray(actual)?!actual.includes(value.$ne):actual!==value.$ne;
    return Array.isArray(actual)?actual.includes(value):actual===value;
  });
  function collection(name){
    if(sets.has(name))return sets.get(name);
    const rows=[];
    const col={rows,async createIndex(){},async findOne(query){return clone(rows.find(row=>matches(row,query)))||null;},
      async insertOne(row){if(rows.some(old=>old._id===row._id)){const error=new Error('Duplicate key');error.code=11000;throw error;}rows.push(clone(row));return {insertedId:row._id};},
      async updateOne(query,changes){if(name==='billingOrders'&&changes.$set?.status==='paid'&&failLedger){failLedger=false;throw new Error('Simulated ledger outage');}const row=rows.find(item=>matches(item,query));if(!row)return {matchedCount:0};Object.assign(row,clone(changes.$set||{}));return {matchedCount:1};},
      async findOneAndUpdate(query,pipeline){const row=rows.find(item=>matches(item,query));if(!row)return null;assert(Array.isArray(pipeline),'entitlement must use one atomic pipeline');const snapshot=clone(row);for(const stage of pipeline)for(const [key,value]of Object.entries(stage.$set))row[key]=clone(evaluate(value,snapshot));return clone(row);}
    };sets.set(name,col);return col;
  }
  const database={collection},storage={database:async()=>database};
  const request=async(method,path,body)=>{
    calls.push({method,path,body:clone(body)});
    if(method==='POST'){
      const intentId=`intent-${body.order_id}`;
      details.set(intentId,{amount_cents:body.amount_cents,currency:body.currency,order_id:body.order_id,user_id:body.user_id,status:10});
      return {allscale_checkout_intent_id:intentId,checkout_url:'https://checkout.allscale.io/pay/test'};
    }
    return clone(details.get(path.split('/').at(-1)));
  };
  const billing=createBilling({...config,...overrides},storage,{request,now:()=>new Date(time)});
  async function checkout(userId='alice'){
    if(!collection('users').rows.some(user=>user._id===userId))await collection('users').insertOne({_id:userId});
    const result=await billing.checkout({id:userId,email:`${userId}@example.com`});
    const order=collection('billingOrders').rows.find(row=>row._id===result.orderId);return {result,order,detail:details.get(order.intentId)};
  }
  return {billing,collection,calls,checkout,details,storage,failNextLedger(){failLedger=true;}};
}

test('checkout fixes USD100 cents and binds order to authenticated owner',async()=>{
  const f=fixture(),{result,order}=await f.checkout();
  const call=f.calls[0];assert.equal(call.body.amount_cents,100);assert.equal(call.body.currency,1);assert.equal(call.body.user_id,'alice');assert.equal(call.body.order_id,result.orderId);
  assert.equal(call.body.redirect_url,`${config.origin}/#billing=${result.orderId}`);
  assert.equal(order.priceCents,100);assert.equal(order.days,30);assert.equal(order.status,'pending');
  assert.equal((await f.billing.get(order._id,'alice')).priceCents,100);
  await assert.rejects(f.billing.get(order._id,'bob'),error=>error.status===404);
  await assert.rejects(f.billing.refresh(order._id,'bob'),error=>error.status===404);
});

test('authoritative pending, failed and expired statuses never grant Premium',async()=>{
  for(const [status,expected]of [[10,'pending'],[-1,'failed'],[-5,'expired']]){
    const f=fixture(),{order,detail}=await f.checkout();detail.status=status;
    assert.equal((await f.billing.refresh(order._id,'alice')).status,expected);
    assert.equal(f.collection('users').rows[0].premiumUntil,undefined);
  }
});

test('paid amount, currency, order and owner must exactly match server-created order',async()=>{
  for(const [field,value]of [['amount_cents',1],['amount_cents','100'],['currency',2],['order_id','other-order'],['user_id','bob']]){
    const f=fixture(),{order,detail}=await f.checkout();detail.status=20;detail[field]=value;
    await assert.rejects(f.billing.refresh(order._id,'alice'),error=>error.status===409);
    assert.equal(f.collection('users').rows[0].premiumUntil,undefined);
  }
});

test('concurrent paid refreshes and subsequent replays grant exactly thirty days once',async()=>{
  const f=fixture(),{order,detail}=await f.checkout();detail.status=20;
  const results=await Promise.all(Array.from({length:8},()=>f.billing.refresh(order._id,'alice')));
  assert(results.every(result=>result.status==='paid'));
  const user=f.collection('users').rows[0];assert.equal(+user.premiumUntil,+time+30*DAY);assert.equal(+user.premiumStartedAt,+time);assert.deepEqual(user.allscalePaidOrders,[order._id]);
  await f.billing.refresh(order._id,'alice');assert.equal(+user.premiumUntil,+time+30*DAY);
});

test('grant survives ledger write failure and retry repairs ledger without extending again',async()=>{
  const f=fixture(),{order,detail}=await f.checkout();detail.status=20;f.failNextLedger();
  await assert.rejects(f.billing.refresh(order._id,'alice'),/Simulated ledger outage/);
  const user=f.collection('users').rows[0];assert.equal(+user.premiumUntil,+time+30*DAY);assert.equal(order.status,'pending');
  assert.equal((await f.billing.refresh(order._id,'alice')).status,'paid');assert.equal(+user.premiumUntil,+time+30*DAY);assert.deepEqual(user.allscalePaidOrders,[order._id]);
});

test('a separate paid order extends existing Premium and preserves its original billing anchor',async()=>{
  const f=fixture(),{order,detail}=await f.checkout();detail.status=20;
  const user=f.collection('users').rows[0],started=new Date(+time-5*DAY),until=new Date(+time+25*DAY);user.premiumStartedAt=started;user.premiumUntil=until;
  await f.billing.refresh(order._id,'alice');assert.equal(+user.premiumUntil,+until+30*DAY);assert.equal(+user.premiumStartedAt,+started);
  const next=await f.checkout();next.detail.status=20;await f.billing.refresh(next.order._id,'alice');assert.equal(+user.premiumUntil,+until+60*DAY);assert.equal(user.allscalePaidOrders.length,2);
});

function signed(payload,{nonce=randomUUID(),id=payload.webhook_id,timestamp=String(Math.floor(Date.now()/1000)),secret=config.allscaleSecret,path='/api/billing/allscale/webhook'}={}){
  const rawBody=Buffer.from(JSON.stringify(payload)),[pathname,query='']=path.split('?');
  const hash=createHash('sha256').update(rawBody).digest('hex');
  const canonical=['allscale:webhook:v1','POST',pathname,query,id,timestamp,nonce,hash].join('\n');
  return {rawBody,path,headers:{'x-api-key':config.allscaleKey,'x-webhook-id':id,'x-webhook-nonce':nonce,'x-webhook-timestamp':timestamp,'x-webhook-signature':`v1=${createHmac('sha256',secret).update(canonical).digest('base64')}`}};
}
function payload(order,extra={}){return {webhook_id:'webhook-unit',all_scale_checkout_intent_id:order.intentId,all_scale_transaction_id:'transaction-unit',amount_cents:100,currency:1,order_id:order._id,user_id:order.userId,...extra};}

test('webhook verification authenticates raw bytes, timestamp, path, key and webhook ID',()=>{
  const original=signed({webhook_id:'signed-id',status:20}),credentials={apiKey:config.allscaleKey,apiSecret:config.allscaleSecret};
  assert(verifyAllscaleWebhook(original,credentials));
  assert.equal(verifyAllscaleWebhook({...original,rawBody:Buffer.from(`${original.rawBody} `)},credentials),null);
  assert.equal(verifyAllscaleWebhook({...original,path:'/wrong/path'},credentials),null);
  assert.equal(verifyAllscaleWebhook(signed({webhook_id:'signed-id'},{timestamp:String(Math.floor(Date.now()/1000)-301)}),credentials),null);
  assert.equal(verifyAllscaleWebhook(signed({webhook_id:'body-id'},{id:'header-id'}),credentials),null);
  assert.equal(verifyAllscaleWebhook({...original,headers:{...original.headers,'x-api-key':'wrong'}},credentials),null);
  assert.equal(verifyAllscaleWebhook(signed({webhook_id:'signed-id'},{secret:'wrong'}),credentials),null);
});

test('valid webhook retries are idempotent but nonce reuse with another body is rejected',async()=>{
  const f=fixture(),{order,detail}=await f.checkout();detail.status=20;
  const notification=signed(payload(order));
  assert.deepEqual(await f.billing.webhook(notification),{ok:true});
  assert.deepEqual(await f.billing.webhook(notification),{ok:true});
  assert.equal(+f.collection('users').rows[0].premiumUntil,+time+30*DAY);
  const altered=signed(payload(order,{amount_cents:101}),{nonce:notification.headers['x-webhook-nonce']});
  await assert.rejects(f.billing.webhook(altered),error=>error.status===409);
});

test('signed webhook cannot override unpaid authoritative status or mismatched notification data',async()=>{
  const f=fixture(),first=await f.checkout();
  await f.billing.webhook(signed(payload(first.order,{status:20})));
  assert.equal(f.collection('users').rows[0].premiumUntil,undefined);
  for(const [field,value]of [['amount_cents',99],['currency',2],['order_id','other'],['user_id','bob']]){
    const g=fixture(),{order,detail}=await g.checkout();detail.status=20;
    await assert.rejects(g.billing.webhook(signed(payload(order,{[field]:value}))),error=>error.status===409);
    assert.equal(g.collection('users').rows[0].premiumUntil,undefined);
  }
});

test('disabled checkout fails closed and provider checkout URLs must be on the exact HTTPS host',async()=>{
  const disabled=fixture({allscaleEnabled:false});assert.equal(disabled.billing.info().enabled,false);
  await assert.rejects(disabled.billing.checkout({id:'alice'}),error=>error.status===503);assert.equal(disabled.calls.length,0);
  for(const url of ['http://checkout.allscale.io/pay','https://checkout.allscale.io.evil.example/pay','https://app.allscale.io/pay/login','https://evil.example/pay','https://user:password@checkout.allscale.io/pay','https://checkout.allscale.io:444/pay','javascript:alert(1)']){
    const f=fixture(),billing=createBilling(config,f.storage,{request:async()=>({allscale_checkout_intent_id:'intent-unit',checkout_url:url})});
    await assert.rejects(billing.checkout({id:'alice'}),error=>error.status===503);
  }
  const actual=fixture(),liveHost=createBilling(config,actual.storage,{request:async()=>({allscale_checkout_intent_id:'intent-live-host',checkout_url:'https://app.allscale.io/pay/checkout/intent-live-host'})});
  assert.equal(new URL((await liveHost.checkout({id:'alice'})).checkoutUrl).hostname,'app.allscale.io');
});

test('AllScale API transport returns only successful authenticated provider payloads',async()=>{
  let sent;
  const request=createAllscaleClient({apiKey:'key',apiSecret:'secret'},{fetchImpl:async(url,options)=>{sent={url,options};return {ok:true,json:async()=>({code:0,payload:{status:10}})};}});
  assert.deepEqual(await request('GET','/v1/checkout_intents/intent-unit'),{status:10});assert.match(sent.options.headers['X-Signature'],/^v1=/);assert.equal(sent.url,'https://openapi.allscale.io/v1/checkout_intents/intent-unit');
  const denied=createAllscaleClient({apiKey:'key',apiSecret:'secret'},{fetchImpl:async()=>({ok:true,json:async()=>({code:500,payload:{status:20}})})});
  await assert.rejects(denied('GET','/v1/checkout_intents/intent-unit'),error=>error.status===503);
});

test('HTTP checkout ignores client amount and plan; webhook receives exact raw JSON bytes',async()=>{
  const seen=[],raw='{"webhook_id":"raw-unit", "amount_cents":100}';
  const billing={info:()=>({enabled:true}),checkout:async user=>{seen.push(user);return {orderId:'order-unit'};},webhook:async input=>{assert(Buffer.isBuffer(input.rawBody));assert.equal(input.rawBody.toString(),raw);return {ok:true};}};
  const accounts={resolve:async token=>token==='session'?{id:'alice',plan:'Free',email:'alice@example.com'}:null};
  const app=createApp(config,{billing,accounts,storage:{},generate:async()=>{},telemetry:{captureError(){}}});
  const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});const base=`http://127.0.0.1:${server.address().port}`;
  try{
    assert.equal((await fetch(`${base}/api/billing/checkout`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
    const response=await fetch(`${base}/api/billing/checkout`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:'scopenote_account=session'},body:JSON.stringify({userId:'bob',amount:1,plan:'Premium'})});assert.equal(response.status,200);assert.deepEqual(seen,[{id:'alice',plan:'Free',email:'alice@example.com'}]);
    assert.equal((await fetch(`${base}/api/billing/allscale/webhook`,{method:'POST',headers:{'Content-Type':'application/json'},body:raw})).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
