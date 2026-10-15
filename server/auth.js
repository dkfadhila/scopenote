import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest();
export const passwordMatches = (a,b) => timingSafeEqual(hash(a),hash(b));
export function createSession(secret) {
  const payload=Buffer.from(JSON.stringify({expires:Date.now()+8*60*60*1000,nonce:randomBytes(16).toString('hex')})).toString('base64url');
  return `${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`;
}
export function validSession(token,secret) {
  if(!token||token.length>1000)return false;
  try{const [payload,signature,...extra]=token.split('.');if(extra.length||!payload||!signature)return false;const expected=createHmac('sha256',secret).update(payload).digest('base64url');return passwordMatches(signature,expected)&&JSON.parse(Buffer.from(payload,'base64url').toString()).expires>Date.now();}catch{return false;}
}
export function sessionFrom(req){return req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('scopenote_session='))?.slice('scopenote_session='.length);}
