import {deliverEmail,receiptEmail} from './emails.js';

/** Durable order-keyed email outbox. A failed email never revokes a paid plan. */
export function createReceipts(config,storage,{sendMail,now=()=>new Date()}={}){
  const ready=()=>!!sendMail||!!(config.resendKey&&config.emailFrom);
  async function deliver(orderId){
    if(!ready())return {status:'unconfigured'};
    const database=await storage.database(),orders=database.collection('billingOrders'),outbox=database.collection('receiptOutbox');
    const order=await orders.findOne({_id:orderId,status:'paid'});
    if(!order||order.receiptSentAt)return {status:order?'sent':'unpaid'};
    const user=await database.collection('users').findOne({_id:order.userId});
    if(!user?.email)return {status:'missing_email'};
    const time=now();
    try{await outbox.insertOne({_id:order._id,to:user.email,...receiptEmail(config,order,user),idempotencyKey:`scopenote-receipt/${order._id}`,createdAt:time,status:'pending',leaseUntil:new Date(0),attempts:0});}
    catch(error){if(error.code!==11000)throw error;}
    // Store the complete immutable email so retrying uses the same idempotency
    // key AND body. Stop automatic retries before Resend's 24-hour key expiry.
    const queued=await outbox.findOne({_id:order._id});
    if(queued.status==='sent'){
      await orders.updateOne({_id:order._id},{$set:{receiptSentAt:queued.sentAt,receiptEmailId:queued.emailId}});return {status:'sent'};
    }
    if(time-new Date(queued.createdAt)>23*3600000){await outbox.updateOne({_id:order._id,status:{$ne:'sent'}},{$set:{status:'needs_review'}});return {status:'needs_review'};}
    const claim=await outbox.findOneAndUpdate({_id:order._id,status:{$in:['pending','sending']},leaseUntil:{$lte:time}},{$set:{status:'sending',leaseUntil:new Date(+time+5*60000)},$inc:{attempts:1}},{returnDocument:'after'});
    if(!claim)return {status:'queued'};
    try{
      const result=await deliverEmail(config,{to:claim.to,subject:claim.subject,text:claim.text,html:claim.html,idempotencyKey:claim.idempotencyKey},{sendMail});
      const sentAt=now();
      await outbox.updateOne({_id:order._id},{$set:{status:'sent',sentAt,emailId:result?.id||null}});
      await orders.updateOne({_id:order._id},{$set:{receiptSentAt:sentAt,receiptEmailId:result?.id||null}});
      return {status:'sent'};
    }catch{
      await outbox.updateOne({_id:order._id,status:{$ne:'sent'}},{$set:{status:'pending',leaseUntil:new Date(+now()+60000),lastError:'Email delivery could not be confirmed.'}});
      return {status:'queued'};
    }
  }
  async function retry(){
    if(!ready())return;
    const rows=await(await storage.database()).collection('billingOrders').find({status:'paid',receiptSentAt:{$exists:false}}).sort({paidAt:1}).limit(10).toArray();
    for(const order of rows)await deliver(order._id);
  }
  return {deliver,retry};
}
