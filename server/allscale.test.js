import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {signAllscale,createAllscaleProbe} from './allscale.js';

test('AllScale signs the exact raw body, query and required trailing slash',()=>{
  const body='{"probe":"café"}',timestamp='1792123200',nonce='qa-nonce',secret='synthetic-test-secret';
  const canonical=['POST','/v1/test/post','a=1',timestamp,nonce,createHash('sha256').update(body).digest('hex')].join('\n');
  assert.equal(signAllscale({method:'POST',path:'/v1/test/post?a=1',body,timestamp,nonce},secret)['X-Signature'],`v1=${createHmac('sha256',secret).update(canonical).digest('base64')}`);
  assert.notEqual(signAllscale({method:'POST',path:'/v1/test/post/',body,timestamp,nonce},secret)['X-Signature'],signAllscale({method:'POST',path:'/v1/test/post',body,timestamp,nonce},secret)['X-Signature']);
});

test('AllScale probes cannot call checkout, payout or an arbitrary destination',async()=>{
  let calls=0;
  const probe=createAllscaleProbe({apiKey:'synthetic-key',apiSecret:'synthetic-secret'},{fetchImpl:async()=>{calls++;return {status:200,json:async()=>({code:0,payload:{pong:'ok'}})};}});
  for(const path of ['/v1/checkout_intents/','/v1/claim_link_auto_payouts','https://example.invalid/'])await assert.rejects(probe(path),/Only AllScale connectivity/);
  assert.equal(calls,0);
  assert.deepEqual(await probe('/v1/test/ping'),{httpStatus:200,code:0,payload:{pong:'ok'}});
});
