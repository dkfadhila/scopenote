import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';

const ORIGIN='https://openapi.allscale.io';

export function createAllscaleClient({apiKey,apiSecret},{fetchImpl=fetch}={}){
  return async function request(method,path,data){
    if(!apiKey||!apiSecret)throw Object.assign(new Error('AllScale is not configured.'),{status:503});
    if(!((method==='POST'&&path==='/v1/checkout_intents/')||(method==='GET'&&/^\/v1\/checkout_intents\/[a-zA-Z0-9_-]{1,150}$/.test(path))))throw new Error('Unsupported AllScale operation.');
    const body=data===undefined?'':JSON.stringify(data);
    let response,result;
    try{
      response=await fetchImpl(ORIGIN+path,{method,headers:{'X-API-Key':apiKey,'Content-Type':'application/json',...signAllscale({method,path,body},apiSecret)},...(body?{body}:{}),signal:AbortSignal.timeout(15000)});
      result=await response.json();
    }catch{throw Object.assign(new Error('Could not reach the payment provider. Please check payment status before trying again.'),{status:503});}
    if(!response.ok||result.code!==0)throw Object.assign(new Error(`Payment provider could not complete this request (code ${Number(result.code)||'unavailable'}).`),{status:503});
    return result.payload;
  };
}

export function verifyAllscaleWebhook({headers,rawBody,path='/api/billing/allscale/webhook',now=Date.now()},config){
  const id=headers['x-webhook-id'],nonce=headers['x-webhook-nonce'],timestamp=headers['x-webhook-timestamp'],signature=headers['x-webhook-signature'];
  if(!config.apiSecret||headers['x-api-key']!==config.apiKey||typeof id!=='string'||!id||id.length>200||typeof nonce!=='string'||!nonce||nonce.length>200||!/^\d{10,13}$/.test(timestamp||'')||Math.abs(now/1000-Number(timestamp))>300||!/^v1=[A-Za-z0-9+/]{43}=$/.test(signature||''))return null;
  const [pathname,query='']=path.split('?');
  const bodyHash=createHash('sha256').update(rawBody).digest('hex');
  const canonical=['allscale:webhook:v1','POST',pathname,query,id,timestamp,nonce,bodyHash].join('\n');
  const expected=createHmac('sha256',config.apiSecret).update(canonical).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature.slice(3),'base64')))return null;
  let payload;try{payload=JSON.parse(rawBody.toString('utf8'));}catch{return null;}
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.webhook_id!==id)return null;
  return {id,nonce,bodyHash,payload};
}

/** Server-only signing for the official AllScale Checkout API. */
export function signAllscale({method,path,body='',timestamp=String(Math.floor(Date.now()/1000)),nonce=randomUUID()},secret){
  const [pathname,query='']=path.split('?');
  const canonical=[method.toUpperCase(),pathname,query,timestamp,nonce,createHash('sha256').update(body).digest('hex')].join('\n');
  return {'X-Timestamp':timestamp,'X-Nonce':nonce,'X-Signature':`v1=${createHmac('sha256',secret).update(canonical).digest('base64')}`};
}

/** Connectivity probes only. No checkout or money-moving endpoint is exposed. */
export function createAllscaleProbe({apiKey,apiSecret},{fetchImpl=fetch}={}){
  return async function probe(path,{method='GET',data}={}){
    if(!apiKey||!apiSecret)throw new Error('AllScale credentials are not configured.');
    if(!['/v1/test/ping','/v1/test/fail','/v1/test/post'].includes(path))throw new Error('Only AllScale connectivity test endpoints are allowed.');
    const body=data===undefined?'':JSON.stringify(data);
    const response=await fetchImpl(ORIGIN+path,{method,headers:{'X-API-Key':apiKey,'Content-Type':'application/json',...signAllscale({method,path,body},apiSecret)},...(body?{body}:{}),signal:AbortSignal.timeout(10000)});
    let result;
    try{result=await response.json();}catch{throw new Error(`AllScale returned an unreadable response (HTTP ${response.status}).`);}
    // Deliberately return only structured status, never headers or request data.
    return {httpStatus:response.status,code:result.code,payload:result.payload};
  };
}
