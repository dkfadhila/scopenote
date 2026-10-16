import {createHash,createHmac,randomUUID} from 'node:crypto';

const ORIGIN='https://openapi.allscale.io';

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
