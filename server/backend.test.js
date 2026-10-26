import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from './app.js';
import {readConfig} from './config.js';
import {createSession,validSession} from './auth.js';
import {parseScope} from './schemas.js';
import {createScopeAgent} from './agent.js';
import {sampleScope} from '../src/domain.js';
const telemetry={traced:(_op,_name,fn)=>fn(null),captureError:()=>{}};
async function withServer(config,fn,overrides={}){
  const projects=new Map();
  const storage={list:async()=>[...projects.values()],save:async p=>{const data={...p,revision:1};projects.set(p.id,data);return data;},remove:async id=>projects.delete(id),history:async()=>[],ping:async()=>{}};
  const app=createApp(config,{storage,generate:async()=>({scope:sampleScope,model:config.model,durationMs:10}),telemetry,...overrides});
  const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  try{await fn(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));}
}
test('production refuses an unprotected private workspace',()=>{
  assert.throws(()=>readConfig({NODE_ENV:'production'}),/requires/);
  assert.throws(()=>readConfig({GEMMA_MODEL:'gemini-2.5-flash'}),/actual Gemma/);
});

test('maintenance requires its own bearer secret and awaits scheduled work',async()=>{
  let calls=0;
  await withServer(readConfig({CRON_SECRET:'private-maintenance-key'}),async url=>{
    assert.equal((await fetch(`${url}/api/internal/maintenance`)).status,401);
    assert.equal((await fetch(`${url}/api/internal/maintenance`,{headers:{Authorization:'Bearer wrong'}})).status,401);
    const response=await fetch(`${url}/api/internal/maintenance`,{headers:{Authorization:'Bearer private-maintenance-key'}});
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});assert.equal(calls,1);
  },{billing:{retryReceipts:async()=>{calls++;}}});
});
test('tampered and wrong-secret session tokens fail',()=>{
  const token=createSession('a'.repeat(40));assert(validSession(token,'a'.repeat(40)));assert(!validSession(`${token}x`,'a'.repeat(40)));assert(!validSession(token,'b'.repeat(40)));assert(!validSession('invalid','a'.repeat(40)));
});
test('protected APIs reject unauthenticated calls; login uses an HttpOnly cookie',async()=>{
  await withServer(readConfig({WORKSPACE_PASSWORD:'test-password',SESSION_SECRET:'x'.repeat(40)}),async url=>{
    assert.equal((await fetch(`${url}/api/projects`)).status,401);
    const denied=await fetch(`${url}/api/session`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'wrong'})});assert.equal(denied.status,401);
    const response=await fetch(`${url}/api/session`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'test-password'})});
    const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=Strict/i);
    assert.equal((await fetch(`${url}/api/projects`,{headers:{Cookie:cookie.split(';')[0]}})).status,200);
  });
});
test('scope API validates input before invoking a model and rejects a foreign origin',async()=>{
  let calls=0;
  await withServer(readConfig({}),async url=>{
    const r=await fetch(`${url}/api/scope`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brief:'short'})});assert.equal(r.status,400);assert.equal(calls,0);
    assert.equal((await fetch(`${url}/api/scope`,{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:JSON.stringify({brief:'This is a valid brief that is long enough.'})})).status,403);
  },{generate:async()=>{calls++;return {};}});
});
test('API contract saves, reopens and deletes a draft through injected storage',async()=>{
  await withServer(readConfig({}),async url=>{
    const project={id:'test-project',project:'Ceramics site',client:'Tanah',brief:'A website',scope:sampleScope,rate:65,buffer:15,currency:'USD',source:'model',model:'gemma-3-27b-it'};
    const response=await fetch(`${url}/api/projects/test-project`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(project)});assert.equal(response.status,200);
    const data=await(await fetch(`${url}/api/projects`)).json();assert.equal(data.projects[0].project,project.project);
    assert.equal((await fetch(`${url}/api/projects/test-project`,{method:'DELETE'})).status,200);
    assert.equal((await(await fetch(`${url}/api/projects`)).json()).projects.length,0);
  });
});
test('unconfigured services fail explicitly without substituting example output',async()=>{
  const config=readConfig({}),generate=createScopeAgent(config,telemetry);
  await withServer(config,async url=>{
    const result=await fetch(`${url}/api/scope`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brief:'Design a four page ceramics website with an external booking link.'})});assert.equal(result.status,503);const data=await result.json();assert.match(data.error,/not configured/);assert(!data.scope);
    assert.equal((await fetch(`${url}/api/transcribe`,{method:'POST'})).status,503);
    const status=await(await fetch(`${url}/api/status`)).json();assert.equal(status.services.length,6);assert.equal(status.services.find(s=>s.id==='gemma').configured,false);assert(!JSON.stringify(status).includes('googleKey'));
  },{generate});
});
test('audio upload validates format before calling the transcription adapter',async()=>{
  let calls=0;
  await withServer(readConfig({ELEVENLABS_API_KEY:'unit-test-key'}),async url=>{
    const invalid=new FormData();invalid.append('audio',new Blob(['text'],{type:'text/plain'}),'test.txt');assert.equal((await fetch(`${url}/api/transcribe`,{method:'POST',body:invalid})).status,400);assert.equal(calls,0);
    const valid=new FormData();valid.append('audio',new Blob(['test audio bytes'],{type:'audio/wav'}),'brief.wav');const response=await fetch(`${url}/api/transcribe`,{method:'POST',body:valid});assert.equal(response.status,200);assert.equal((await response.json()).text,'A transcribed test brief.');assert.equal(calls,1);
  },{transcribe:async()=>{calls++;return {text:'A transcribed test brief.'};}});
});
test('actual Mastra workflow validates a stub model response and preserves token usage',async()=>{
  const spans=[];
  const generate=createScopeAgent(readConfig({GOOGLE_GENERATIVE_AI_API_KEY:'test-key'}),{...telemetry,traced:async(op,name,fn)=>{spans.push(op);return fn({setAttribute:()=>{}});}},{generate:async()=>({text:JSON.stringify(sampleScope),totalUsage:{inputTokens:123,outputTokens:234}})});
  const result=await generate('Design a ceramics website with four pages and a booking service link.');
  assert.deepEqual(result.scope,sampleScope);assert.equal(result.inputTokens,123);assert.equal(result.outputTokens,234);assert(result.runId);assert(spans.includes('gen_ai.invoke_agent'));assert(spans.includes('gen_ai.chat'));assert(spans.includes('workflow.step'));
});
test('model parser rejects valid-shaped but impossible hours and arbitrary prose',()=>{
  assert.throws(()=>parseScope(JSON.stringify({...sampleScope,deliverables:[{title:'Site',detail:'',hours:-2}]})));
  assert.throws(()=>parseScope(`Sure, here is a scope: ${JSON.stringify(sampleScope)}`));
  assert.deepEqual(parseScope('```json\n'+JSON.stringify(sampleScope)+'\n```'),sampleScope);
});
