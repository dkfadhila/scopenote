import {randomUUID} from 'node:crypto';
import {createAllscaleClient,verifyAllscaleWebhook} from './allscale.js';

const PRICE=100,DAYS=30;
const fail=(status,message)=>Object.assign(new Error(message),{status});
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,150}$/.test(id);
const view=order=>({orderId:order._id,status:order.status==='paid'?'paid':['failed','expired'].includes(order.status)?order.status:'pending',priceCents:PRICE,currency:'USD',days:DAYS,...(order.premiumUntil?{premiumUntil:new Date(order.premiumUntil).toISOString()}:{})});

export function createBilling(config,storage,{request:injectedRequest,now=()=>new Date()}={}){
  const credentials={apiKey:config.allscaleKey,apiSecret:config.allscaleSecret};
  const enabled=!!(config.accounts&&config.allscaleEnabled&&credentials.apiKey&&credentials.apiSecret&&config.origin);
  const request=injectedRequest||createAllscaleClient(credentials);
  let initialized;
  async function db(){
    const database=await storage.database();
    if(!initialized)initialized=Promise.all([
      database.collection('billingOrders').createIndex({intentId:1},{unique:true,partialFilterExpression:{intentId:{$type:'string'}}}),
      database.collection('billingWebhookNonces').createIndex({expiresAt:1},{expireAfterSeconds:0})
    ]).catch(error=>{initialized=null;throw error;});
    await initialized;return database;
  }
  const requireEnabled=()=>{if(!enabled)throw fail(503,'Premium checkout is not available yet.');};
  async function owned(id,userId){
    if(!validId(id))throw fail(404,'Payment not found.');
    const order=await(await db()).collection('billingOrders').findOne({_id:id,userId});
    if(!order)throw fail(404,'Payment not found.');return order;
  }
  async function reconcile(order,webhook){
    const database=await db(),orders=database.collection('billingOrders');
    if(order.status==='paid')return view(order);
    if(!order.intentId)return view(order);
    const detail=await request('GET',`/v1/checkout_intents/${order.intentId}`);
    // Only the authoritative server-to-server status can grant access.
    if(detail?.amount_cents!==order.priceCents||detail?.currency!==1||detail.order_id!==order._id||detail.user_id!==order.userId)throw fail(409,'Payment details did not match this order. Please contact support.');
    if(webhook&&(webhook.amount_cents!==order.priceCents||webhook.currency!==1||webhook.order_id!==order._id||webhook.user_id!==order.userId))throw fail(409,'Payment notification did not match this order.');
    if(detail.status!==20){
      const status=detail.status===-5?'expired':detail.status<0?'failed':'pending';
      await orders.updateOne({_id:order._id,status:{$ne:'paid'}},{$set:{status,providerStatus:detail.status,checkedAt:now()}});
      // A concurrent webhook may already have fulfilled this order.
      return view(await orders.findOne({_id:order._id}));
    }
    const users=database.collection('users'),time=now();
    // The grant and its order-level deduplication live in ONE atomic user write.
    // If the following ledger write fails, retrying finds the applied order and
    // repairs the ledger without extending Premium a second time.
    let user=await users.findOneAndUpdate({_id:order.userId,allscalePaidOrders:{$ne:order._id}},[{$set:{
      premiumStartedAt:{$cond:[{$and:[{$gt:['$premiumUntil',time]},{$ne:[{$ifNull:['$premiumStartedAt',null]},null]}]},'$premiumStartedAt',time]},
      premiumUntil:{$dateAdd:{startDate:{$cond:[{$gt:['$premiumUntil',time]},'$premiumUntil',time]},unit:'day',amount:DAYS}},
      allscalePaidOrders:{$concatArrays:[{$ifNull:['$allscalePaidOrders',[]]},[order._id]]}
    }}],{returnDocument:'after'});
    if(!user)user=await users.findOne({_id:order.userId,allscalePaidOrders:order._id});
    if(!user)throw fail(409,'The payment account could not be found. Please contact support.');
    const changes={status:'paid',premiumUntil:user.premiumUntil,paidAt:time,providerStatus:20,...(webhook?.all_scale_transaction_id?{transactionId:webhook.all_scale_transaction_id}:{})};
    await orders.updateOne({_id:order._id},{$set:changes});
    return view({...order,...changes});
  }
  return {
    info(user){return {enabled,provider:'allscale',kind:'prepaid',priceCents:PRICE,currency:'USD',days:DAYS,premiumUntil:user?.premiumUntil||null};},
    async checkout(user){
      requireEnabled();
      if(!user?.id)throw fail(401,'Sign in before buying Premium.');
      const orders=(await db()).collection('billingOrders');
      const order={_id:randomUUID(),userId:user.id,priceCents:PRICE,currency:'USD',days:DAYS,status:'creating',createdAt:now()};
      await orders.insertOne(order);
      let intent;
      try{intent=await request('POST','/v1/checkout_intents/',{currency:1,amount_cents:PRICE,order_id:order._id,user_id:user.id,order_description:'ScopeNote Premium — 30 days, one-time payment',redirect_url:`${config.origin}/#billing=${order._id}`});}
      catch(error){await orders.updateOne({_id:order._id},{$set:{status:'setup_failed'}});throw error;}
      if(!validId(intent?.allscale_checkout_intent_id))throw fail(503,'The payment provider returned an invalid checkout.');
      let url;try{url=new URL(intent.checkout_url);}catch{throw fail(503,'The payment provider returned an invalid checkout.');}
      const hostedCheckout=url.hostname==='checkout.allscale.io'||(url.hostname==='app.allscale.io'&&/^\/pay\/checkout\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname));
      if(url.protocol!=='https:'||!hostedCheckout||url.port||url.username||url.password)throw fail(503,'The payment provider returned an invalid checkout.');
      await orders.updateOne({_id:order._id},{$set:{intentId:intent.allscale_checkout_intent_id,status:'pending'}});
      return {orderId:order._id,checkoutUrl:url.href};
    },
    async get(id,userId){requireEnabled();return view(await owned(id,userId));},
    async refresh(id,userId){requireEnabled();return reconcile(await owned(id,userId));},
    async webhook(input){
      requireEnabled();
      const verified=verifyAllscaleWebhook(input,credentials);
      if(!verified)throw fail(401,'Invalid payment notification signature.');
      const database=await db(),nonces=database.collection('billingWebhookNonces');
      try{await nonces.insertOne({_id:verified.nonce,webhookId:verified.id,bodyHash:verified.bodyHash,expiresAt:new Date(now().getTime()+600000)});}
      catch(error){if(error.code!==11000)throw error;const seen=await nonces.findOne({_id:verified.nonce});if(seen?.bodyHash!==verified.bodyHash||seen?.webhookId!==verified.id)throw fail(409,'Payment notification nonce was reused.');}
      const payload=verified.payload;
      if(!validId(payload.all_scale_checkout_intent_id)||!validId(payload.all_scale_transaction_id))throw fail(400,'Invalid payment notification.');
      const order=await database.collection('billingOrders').findOne({intentId:payload.all_scale_checkout_intent_id});
      if(!order)throw fail(503,'Payment order is not available yet. Retry this notification.');
      await reconcile(order,payload);return {ok:true};
    }
  };
}
