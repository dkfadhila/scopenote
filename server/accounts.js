import {createHash,randomBytes,randomUUID,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {z} from 'zod';

const derive=promisify(scrypt);
const hash=value=>createHash('sha256').update(value).digest('hex');
const error=(status,message)=>Object.assign(new Error(message),{status});
const emailSchema=z.string().trim().toLowerCase().email().max(254);
const passwordSchema=z.string().min(10).max(128);
const day=86400000,billingPeriod=30*day;
const dateValue=value=>value?new Date(value).getTime():NaN;
const premiumActive=u=>Number.isFinite(dateValue(u?.premiumUntil))&&dateValue(u.premiumUntil)>Date.now();
const userView=u=>({id:u._id,name:u.name,email:u.email,plan:premiumActive(u)?'Premium':'Free',premiumUntil:Number.isFinite(dateValue(u.premiumUntil))?new Date(u.premiumUntil).toISOString():null,emailVerified:!!u.emailVerified});
const cookieAge=7*86400000;
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');const key=await derive(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return `scrypt:${salt}:${key.toString('hex')}`;}
export async function checkPassword(password,encoded){
  if(typeof password!=='string'||password.length>128)return false;
  const [type,salt,digest]=String(encoded||'').split(':');
  if(type!=='scrypt'||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(digest))return false;
  const key=await derive(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return timingSafeEqual(key,Buffer.from(digest,'hex'));
}
export function createAccounts(config,storage,{sendMail}={}){
  let initialized;
  async function db(){
    const d=await storage.database();
    if(!initialized)initialized=Promise.all([
      d.collection('users').createIndex({email:1},{unique:true}),
      d.collection('sessions').createIndex({expiresAt:1},{expireAfterSeconds:0}),
      d.collection('accountUsage').createIndex({expiresAt:1},{expireAfterSeconds:0})
    ]).catch(e=>{initialized=null;throw e;});
    await initialized;return d;
  }
  const mailReady=()=>!!sendMail||!!(config.resendKey&&config.emailFrom);
  async function mail(to,subject,text){
    if(sendMail)return sendMail({to,subject,text});
    if(!mailReady())throw error(503,'Password reset email is not enabled yet. Please contact the site owner.');
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${config.resendKey}`,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({from:config.emailFrom,to:[to],subject,text}),signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw error(503,'Email delivery is temporarily unavailable. Please try again later.');
  }
  function credentials(input,registration=false){
    const schema=z.object({email:emailSchema,password:passwordSchema,...(registration?{name:z.string().trim().min(1).max(80)}:{})});
    const parsed=schema.safeParse(input);if(!parsed.success)throw error(400,'Enter a valid email and a password between 10 and 128 characters.');return parsed.data;
  }
  async function session(user){
    const token=randomBytes(32).toString('hex');await(await db()).collection('sessions').insertOne({_id:hash(token),userId:user._id,version:user.passwordVersion||0,expiresAt:new Date(Date.now()+cookieAge)});return {user:userView(user),token};
  }
  async function counter(id,limit){
    const col=(await db()).collection('accountUsage');
    try{await col.updateOne({_id:id},{$setOnInsert:{count:0,expiresAt:new Date(Date.now()+35*86400000)}},{upsert:true});}catch(e){if(e.code!==11000)throw e;}
    const r=await col.findOneAndUpdate({_id:id,count:{$lt:limit}},{$inc:{count:1}},{returnDocument:'after'});
    if(!r)throw error(429,'The usage limit has been reached. You can still edit, save and export existing projects.');
  }
  async function quota(id){
    const user=await(await db()).collection('users').findOne({_id:id}),now=Date.now();
    if(premiumActive(user)){
      const started=dateValue(user.premiumStartedAt),anchor=Number.isFinite(started)?started:dateValue(user.premiumUntil)-billingPeriod;
      const start=anchor+Math.max(0,Math.floor((now-anchor)/billingPeriod))*billingPeriod;
      return {period:`premium:${new Date(start).toISOString()}`,periodStart:new Date(start).toISOString(),periodEnd:new Date(Math.min(start+billingPeriod,dateValue(user.premiumUntil))).toISOString(),scopeLimit:3,voiceLimit:10,projectLimit:5};
    }
    const date=new Date(now),start=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1)),end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1));
    return {period:date.toISOString().slice(0,7),periodStart:start.toISOString(),periodEnd:end.toISOString(),scopeLimit:3,voiceLimit:1,projectLimit:5};
  }
  return {
    mailReady,
    async register(input){
      const data=credentials(input,true),d=await db();await counter(`signups:${new Date().toISOString().slice(0,10)}`,30);
      const user={_id:randomUUID(),...data,passwordHash:await hashPassword(data.password),passwordVersion:0,emailVerified:false,createdAt:new Date()};delete user.password;
      try{await d.collection('users').insertOne(user);}catch(e){if(e.code===11000)throw error(409,'An account already uses that email. Sign in or reset your password.');throw e;}
      const result=await session(user);
      if(mailReady()){try{await this.resendVerification(userView(user));}catch{result.emailDeliveryFailed=true;}}
      return result;
    },
    async login(input){
      const data=credentials(input),u=await(await db()).collection('users').findOne({email:data.email});
      // Use the same costly derivation for unknown accounts, too.
      const dummy='scrypt:'+ '0'.repeat(32)+':'+ '0'.repeat(128);
      const valid=await checkPassword(data.password,u?.passwordHash||dummy);
      if(!u||!valid)throw error(401,'Email or password is incorrect.');return session(u);
    },
    async resolve(token){
      if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;
      const d=await db(),s=await d.collection('sessions').findOne({_id:hash(token),expiresAt:{$gt:new Date()}});if(!s)return null;
      const u=await d.collection('users').findOne({_id:s.userId});if(!u||s.version!==(u.passwordVersion||0))return null;return userView(u);
    },
    async logout(token){if(typeof token==='string')await(await db()).collection('sessions').deleteOne({_id:hash(token)});},
    async requestReset(email){
      const parsed=emailSchema.safeParse(email);if(!parsed.success)throw error(400,'Enter a valid email address.');
      if(!mailReady())throw error(503,'Password reset email is not enabled yet. Please contact the site owner.');
      const users=(await db()).collection('users'),u=await users.findOne({email:parsed.data});
      if(u){const token=randomBytes(32).toString('hex');await users.updateOne({_id:u._id},{$set:{resetHash:hash(token),resetExpires:new Date(Date.now()+15*60000)}});await mail(u.email,'Reset your ScopeNote password',`Use this link to choose a new password. It expires in 15 minutes and can only be used once.\n\n${config.origin}/#reset=${token}\n\nIf you did not request this, ignore this email.`);}
      return {message:'If an account exists for this email, a reset link will arrive shortly.'};
    },
    async resetPassword(token,password){
      if(!passwordSchema.safeParse(password).success)throw error(400,'Use a password between 10 and 128 characters.');
      if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw error(400,'This reset link is invalid or expired. Request a new one.');
      const users=(await db()).collection('users'),passwordHash=await hashPassword(password);
      const u=await users.findOneAndUpdate({resetHash:hash(token),resetExpires:{$gt:new Date()}},{$set:{passwordHash},$inc:{passwordVersion:1},$unset:{resetHash:'',resetExpires:''}},{returnDocument:'after'});
      if(!u)throw error(400,'This reset link is invalid or expired. Request a new one.');
      await(await db()).collection('sessions').deleteMany({userId:u._id});return {ok:true};
    },
    async resendVerification(user){
      if(!mailReady())throw error(503,'Email verification is not enabled yet.');
      if(user.emailVerified)return {ok:true};const token=randomBytes(32).toString('hex');
      await(await db()).collection('users').updateOne({_id:user.id},{$set:{verifyHash:hash(token),verifyExpires:new Date(Date.now()+86400000)}});
      await mail(user.email,'Verify your ScopeNote email',`Confirm your email address using this link. It expires in 24 hours.\n\n${config.origin}/#verify=${token}`);return {ok:true};
    },
    async verifyEmail(token){
      if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw error(400,'Invalid email verification link.');
      const u=await(await db()).collection('users').findOneAndUpdate({verifyHash:hash(token),verifyExpires:{$gt:new Date()}},{$set:{emailVerified:true},$unset:{verifyHash:'',verifyExpires:''}},{returnDocument:'after'});
      if(!u)throw error(400,'This verification link is invalid or expired.');return {ok:true};
    },
    async profile(id,name){if(typeof name!=='string'||!name.trim()||name.length>80)throw error(400,'Use a name between 1 and 80 characters.');const u=await(await db()).collection('users').findOneAndUpdate({_id:id},{$set:{name:name.trim()}},{returnDocument:'after'});return userView(u);},
    async usage(id){const limits=await quota(id),col=(await db()).collection('accountUsage');const [scopes,voice]=await Promise.all(['scopes','voice'].map(kind=>col.findOne({_id:`${id}:${kind}:${limits.period}`})));return {scopes:scopes?.count||0,voice:voice?.count||0,...limits};},
    async consume(id,kind){if(!['scopes','voice'].includes(kind))throw error(400,'Unknown AI usage type.');const limits=await quota(id);await counter(`global-ai:${new Date().toISOString().slice(0,10)}`,config.dailyAiLimit||50);await counter(`${id}:${kind}:${limits.period}`,kind==='scopes'?limits.scopeLimit:limits.voiceLimit);}
  };
}
