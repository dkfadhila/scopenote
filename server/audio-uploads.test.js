import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAudioUploads} from './audio-uploads.js';

function setup({read,remove,handle}={}){
  const rows=new Map(),removed=[],time=new Date('2026-10-26T00:00:00Z');
  const col={
    createIndex:async()=>{},countDocuments:async()=>rows.size,
    insertOne:async row=>{if(rows.has(row._id))throw Object.assign(new Error(),{code:11000});rows.set(row._id,row);},
    findOneAndUpdate:async(q,u)=>{const row=rows.get(q._id);if(!row||row.owner!==q.owner||row.status!==q.status||row.expiresAt<=time)return null;Object.assign(row,u.$set);return row;},
    deleteOne:async q=>{rows.delete(q._id);},
    find:q=>({limit:()=>({toArray:async()=>[...rows.values()].filter(r=>r.expiresAt<=q.expiresAt.$lte)})})
  };
  const storage={database:async()=>({collection:()=>col})};
  const uploads=createAudioUploads({blobToken:'test'},storage,{now:()=>time,
    handle:handle|| (async options=>options.onBeforeGenerateToken(options.body.payload.pathname)),
    read:read|| (async()=>({statusCode:200,blob:{size:5,contentType:'audio/mpeg'},stream:new ReadableStream({start(c){c.enqueue(Buffer.from('audio'));c.close();}})})),
    remove:remove|| (async path=>{removed.push(path);})
  });
  const pathname=`voice/${randomUUID()}`;
  const req={user:{id:'owner'},body:{type:'blob.generate-client-token',payload:{pathname}}};
  return {uploads,rows,removed,time,pathname,req};
}

test('private audio upload tokens restrict path, type, size, expiry and ownership',async()=>{
  const s=setup(),token=await s.uploads.issue(s.req);
  assert.equal(token.maximumSizeInBytes,12*1024*1024);assert.equal(token.allowOverwrite,false);assert.equal(token.addRandomSuffix,false);
  assert.equal(token.validUntil,+s.time+10*60000);assert(token.allowedContentTypes.includes('audio/mpeg'));
  await assert.rejects(s.uploads.issue(s.req),e=>e.status===409);
  await assert.rejects(s.uploads.issue({...s.req,body:{type:'blob.generate-client-token',payload:{pathname:'https://example.com/file'}}}),e=>e.status===400);
  await assert.rejects(s.uploads.transcribe({user:{id:'another'},body:{pathname:s.pathname}},{consume:()=>assert.fail(),run:()=>assert.fail()}),e=>e.status===404);
  assert.equal(s.rows.get(s.pathname).status,'pending');
});

test('audio claim is single-use across concurrent requests and private bytes are removed',async()=>{
  const s=setup();await s.uploads.issue(s.req);let consumed=0,calls=0;
  const req={user:s.req.user,body:{pathname:s.pathname}},options={consume:async()=>consumed++,run:async file=>{calls++;assert.equal(file.buffer.toString(),'audio');return {text:'A client brief'};}};
  const results=await Promise.allSettled([s.uploads.transcribe(req,options),s.uploads.transcribe(req,options)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(consumed,1);assert.equal(calls,1);assert.deepEqual(s.removed,[s.pathname]);assert.equal(s.rows.size,0);
});

test('provider failure and exhausted quota still delete temporary audio',async()=>{
  for(const failAt of ['consume','run']){
    const s=setup();await s.uploads.issue(s.req);
    await assert.rejects(s.uploads.transcribe({user:s.req.user,body:{pathname:s.pathname}},{consume:async()=>{if(failAt==='consume')throw new Error('quota');},run:async()=>{throw new Error('provider');}}));
    assert.deepEqual(s.removed,[s.pathname]);assert.equal(s.rows.size,0);
  }
});

test('expired uploads cannot transcribe; cleanup retries failed blob deletion',async()=>{
  let attempts=0;
  const s=setup({remove:async()=>{if(++attempts===1)throw new Error('temporary outage');}});
  await s.uploads.issue(s.req);s.time.setTime(+s.time+16*60000);
  await assert.rejects(s.uploads.transcribe({user:s.req.user,body:{pathname:s.pathname}},{consume:()=>assert.fail(),run:()=>assert.fail()}),e=>e.status===404);
  await assert.rejects(s.uploads.cleanup());assert.equal(s.rows.size,1);
  await s.uploads.cleanup();assert.equal(s.rows.size,0);
});

test('oversized private audio is rejected before consuming quota and is deleted',async()=>{
  let cancelled=false;
  const s=setup({read:async()=>({statusCode:200,blob:{size:13*1024*1024,contentType:'audio/mpeg'},stream:{cancel:async()=>{cancelled=true;}}})});
  await s.uploads.issue(s.req);
  await assert.rejects(s.uploads.transcribe({user:s.req.user,body:{pathname:s.pathname}},{consume:()=>assert.fail(),run:()=>assert.fail()}),e=>e.status===400);
  assert(cancelled);assert.deepEqual(s.removed,[s.pathname]);
});
