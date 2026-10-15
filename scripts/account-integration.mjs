import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';

// Run against an isolated QA database. Creates two synthetic accounts; deletes
// their projects on completion. Never calls an AI provider or prints passwords.
const base=new URL(process.env.ACCOUNT_TEST_URL||'http://127.0.0.1:3012');
if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw new Error('Account integration tests require a local QA server.');
const run=randomUUID(),projectId=`qa-${run}`,accounts=[];
let assertions=0;
async function request(path,{cookie,body,method=body?'POST':'GET'}={}){
  const response=await fetch(new URL(path,base),{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  const text=await response.text();
  let data;try{data=JSON.parse(text);}catch{throw new Error(`${method} ${path}: expected JSON, received HTTP ${response.status}`);}
  return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
function equal(actual,expected,message){assert.equal(actual,expected,message);assertions++;}
async function register(label){
  const email=`qa-${label}-${run}@example.com`,password=randomBytes(24).toString('base64url');
  const response=await request('/api/account/register',{body:{name:`QA ${label}`,email,password,plan:'Premium',emailVerified:true}});
  equal(response.status,200,'QA signup should succeed');
  assert(response.cookie,'signup should set a session cookie');assertions++;
  equal(response.data.user.plan,'Free','clients cannot grant themselves Premium');
  equal(response.data.user.emailVerified,false,'clients cannot verify their own email');
  const account={...response,email,password};accounts.push(account);return account;
}
function project(name){return {id:projectId,project:name,client:'Integration QA',brief:'Synthetic QA draft; safe to delete.',scope:null,rate:50,buffer:10,currency:'USD',source:'manual',model:''};}

try{
  equal((await request('/api/health')).status,200,'QA server health');
  equal((await request('/api/projects')).status,401,'anonymous project access is denied');
  const alice=await register('alice'),bob=await register('bob');
  const saveA=await request(`/api/projects/${projectId}`,{cookie:alice.cookie,method:'PUT',body:{...project('Alice private project'),workspace:bob.data.user.id,owner:bob.data.user.id}});
  equal(saveA.status,200,'Alice can save');equal(saveA.data.project.revision,1,'first revision');
  const bobList=await request('/api/projects',{cookie:bob.cookie});
  equal(bobList.data.projects.length,0,'Bob cannot list Alice project');
  equal((await request(`/api/projects/${projectId}/history`,{cookie:bob.cookie})).data.history.length,0,'Bob cannot read Alice history');
  equal((await request(`/api/projects/${projectId}`,{cookie:bob.cookie,method:'DELETE'})).status,404,'Bob cannot delete Alice project');
  const saveB=await request(`/api/projects/${projectId}`,{cookie:bob.cookie,method:'PUT',body:project('Bob independent project')});
  equal(saveB.status,200,'same project ID is independent per user');
  const update=await request(`/api/projects/${projectId}`,{cookie:alice.cookie,method:'PUT',body:{...project('Alice revision two'),revision:1}});
  equal(update.status,200,'Alice revision update');equal(update.data.project.revision,2,'revision increments');
  equal((await request(`/api/projects/${projectId}`,{cookie:alice.cookie,method:'PUT',body:{...project('Stale overwritten title'),revision:1}})).status,409,'stale update conflicts');
  const history=await request(`/api/projects/${projectId}/history`,{cookie:alice.cookie});
  equal(history.status,200,'Alice history');equal(history.data.history[0].revision,1,'history preserves previous revision');
  const aliceList=await request('/api/projects',{cookie:alice.cookie});
  equal(aliceList.data.projects.find(p=>p.id===projectId)?.project,'Alice revision two','Alice reads only her revision');
  equal((await request('/api/projects',{cookie:bob.cookie})).data.projects.find(p=>p.id===projectId)?.project,'Bob independent project','Bob draft stays independent');
  const account=await request('/api/account',{cookie:alice.cookie});
  equal(account.status,200,'account endpoint');equal(account.data.usage.scopes,0,'test did not consume AI');equal(account.data.usage.voice,0,'test did not consume transcription');
  equal(account.data.usage.scopeLimit,3,'free scope allowance');equal(account.data.usage.voiceLimit,1,'free voice allowance');equal(account.data.usage.projectLimit,5,'free project allowance');
  assert.match(account.data.usage.period,/^\d{4}-\d{2}$/);assertions++;
  // Remove projects before logout so this test leaves no draft data behind.
  for(const user of accounts)equal((await request(`/api/projects/${projectId}`,{cookie:user.cookie,method:'DELETE'})).status,200,'QA project cleanup');
  equal((await request('/api/account/logout',{cookie:alice.cookie,method:'POST'})).status,200,'logout');
  equal((await request('/api/projects',{cookie:alice.cookie})).status,401,'logout revokes stored session');
  const relogin=await request('/api/account/login',{body:{email:alice.email,password:alice.password}});
  equal(relogin.status,200,'password login works after logout');
  equal((await request('/api/projects',{cookie:relogin.cookie})).status,200,'fresh session works');
  await request('/api/account/logout',{cookie:relogin.cookie,method:'POST'});
  console.log(`Account integration passed: ${assertions} assertions; tenant isolation, revisions, usage and session revocation verified. No provider calls.`);
}finally{
  for(const account of accounts){
    await request(`/api/projects/${projectId}`,{cookie:account.cookie,method:'DELETE'}).catch(()=>{});
    await request('/api/account/logout',{cookie:account.cookie,method:'POST'}).catch(()=>{});
  }
}
