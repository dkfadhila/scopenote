import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {sampleScope} from '../src/domain.js';

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
function project(name){return {id:projectId,project:name,client:'Integration QA',brief:'Synthetic QA draft; safe to delete.',scope:sampleScope,rate:50,buffer:10,currency:'USD',source:'manual',model:'',publishConsent:true};}

try{
  equal((await request('/api/health')).status,200,'QA server health');
  equal((await request('/api/projects')).status,401,'anonymous project access is denied');
  const alice=await register('alice'),bob=await register('bob');
  const {publishConsent:_,...withoutConsent}=project('Unconsented QA draft');
  equal((await request(`/api/projects/${projectId}`,{cookie:alice.cookie,method:'PUT',body:withoutConsent})).status,400,'first Free save requires explicit publication consent');
  equal((await request('/api/projects',{cookie:alice.cookie})).data.projects.length,0,'unconsented draft was not stored');
  const saveA=await request(`/api/projects/${projectId}`,{cookie:alice.cookie,method:'PUT',body:{...project('Alice published project'),workspace:bob.data.user.id,owner:bob.data.user.id}});
  equal(saveA.status,200,'Alice can save');equal(saveA.data.project.revision,1,'first revision');
  const shareId=saveA.data.project.shareId;
  assert.match(shareId,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);assertions++;
  equal(saveA.data.project.visibility,'public','consented Free draft is public');
  const directory=await request('/api/public/projects');
  equal(directory.status,200,'directory is anonymous');
  const listing=directory.data.projects.find(item=>item.shareId===shareId);
  assert(listing,'consented draft appears in directory');assertions++;
  assert.deepEqual(Object.keys(listing).sort(),['project','shareId','summary','updatedAt']);assertions++;
  equal(listing.summary,sampleScope.summary,'directory includes scope summary');
  const publicResponse=await request(`/api/public/projects/${shareId}`);
  equal(publicResponse.status,200,'public detail is anonymous');
  equal(publicResponse.data.project.brief,project('').brief,'public detail includes full consented brief');
  assert.deepEqual(publicResponse.data.project.scope,sampleScope,'public detail includes full scope');assertions++;
  for(const field of ['owner','workspace','client','email','userEmail','history','id','_id'])equal(publicResponse.data.project[field],undefined,`public detail excludes ${field}`);
  const bobList=await request('/api/projects',{cookie:bob.cookie});
  equal(bobList.data.projects.length,0,'Bob cannot list Alice project');
  equal((await request(`/api/projects/${projectId}/history`,{cookie:bob.cookie})).data.history.length,0,'Bob cannot read Alice history');
  equal((await request(`/api/projects/${projectId}`,{cookie:bob.cookie,method:'DELETE'})).status,404,'Bob cannot delete Alice project');
  const saveB=await request(`/api/projects/${projectId}`,{cookie:bob.cookie,method:'PUT',body:project('Bob independent project')});
  equal(saveB.status,200,'same project ID is independent per user');
  const update=await request(`/api/projects/${projectId}`,{cookie:alice.cookie,method:'PUT',body:{...project('Alice revision two'),revision:1}});
  equal(update.status,200,'Alice revision update');equal(update.data.project.revision,2,'revision increments');
  equal(update.data.project.shareId,shareId,'public share ID survives revision update');
  equal((await request(`/api/public/projects/${shareId}`)).data.project.project,'Alice revision two','anonymous detail reflects latest public revision');
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
  equal((await request(`/api/public/projects/${shareId}`)).status,404,'deleted public draft no longer accessible');
  equal((await request('/api/public/projects')).data.projects.some(item=>item.shareId===shareId),false,'deleted draft disappears from directory');
  equal((await request('/api/account/logout',{cookie:alice.cookie,method:'POST'})).status,200,'logout');
  equal((await request('/api/projects',{cookie:alice.cookie})).status,401,'logout revokes stored session');
  const relogin=await request('/api/account/login',{body:{email:alice.email,password:alice.password}});
  equal(relogin.status,200,'password login works after logout');
  equal((await request('/api/projects',{cookie:relogin.cookie})).status,200,'fresh session works');
  await request('/api/account/logout',{cookie:relogin.cookie,method:'POST'});
  console.log(`Account integration passed: ${assertions} assertions; tenant isolation, public consent and lifecycle, revisions, usage and session revocation verified. No provider calls.`);
}finally{
  for(const account of accounts){
    await request(`/api/projects/${projectId}`,{cookie:account.cookie,method:'DELETE'}).catch(()=>{});
    await request('/api/account/logout',{cookie:account.cookie,method:'POST'}).catch(()=>{});
  }
}
