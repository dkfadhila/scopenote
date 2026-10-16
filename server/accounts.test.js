import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from './app.js';
import {createSession} from './auth.js';
import {sampleScope} from '../src/domain.js';

const clone=value=>value===undefined?value:structuredClone(value);
function matches(row,query){
  return Object.entries(query).every(([key,value])=>{
    if(key==='$or')return value.some(item=>matches(row,item));
    if(key==='$and')return value.every(item=>matches(row,item));
    const actual=row[key];
    if(value&&typeof value==='object'&&!(value instanceof Date))return Object.entries(value).every(([op,target])=>({$gt:()=>actual>target,$gte:()=>actual>=target,$lt:()=>actual<target,$lte:()=>actual<=target,$ne:()=>actual!==target,$exists:()=>target?actual!==undefined:actual===undefined,$in:()=>target.includes(actual)})[op]?.());
    return value instanceof Date?+actual===+value:actual===value;
  });
}
function memoryDatabase(){
  const collections=new Map();
  const collection=name=>{
    if(collections.has(name))return collections.get(name);
    const rows=[],indexes=[];
    const update=(row,change)=>{
      Object.assign(row,clone(change.$set||{}));
      for(const [key,value] of Object.entries(change.$inc||{}))row[key]=(row[key]||0)+value;
      for(const key of Object.keys(change.$unset||{}))delete row[key];
    };
    const api={rows,
      async createIndex(keys,options={}){if(options.unique)indexes.push(Object.keys(keys));return 'index';},
      async insertOne(row){if(rows.some(old=>old._id===row._id||indexes.some(keys=>keys.every(key=>old[key]===row[key])))){const error=new Error('Duplicate key');error.code=11000;throw error;}rows.push(clone(row));return {insertedId:row._id};},
      async findOne(query){return clone(rows.find(row=>matches(row,query)))||null;},
      async updateOne(query,change,options={}){let row=rows.find(row=>matches(row,query));if(!row&&options.upsert){row={...clone(query),...clone(change.$setOnInsert||{})};rows.push(row);}if(!row)return {matchedCount:0,modifiedCount:0};update(row,change);return {matchedCount:1,modifiedCount:1};},
      async findOneAndUpdate(query,change,options={}){const row=rows.find(row=>matches(row,query));if(!row)return null;const old=clone(row);update(row,change);return options.returnDocument==='after'?clone(row):old;},
      async deleteOne(query){const index=rows.findIndex(row=>matches(row,query));if(index<0)return {deletedCount:0};rows.splice(index,1);return {deletedCount:1};},
      async deleteMany(query){let count=0;for(let i=rows.length-1;i>=0;i--)if(matches(rows[i],query)){rows.splice(i,1);count++;}return {deletedCount:count};},
      async countDocuments(query){return rows.filter(row=>matches(row,query)).length;}
    };
    collections.set(name,api);return api;
  };
  return {collection,collections};
}

async function accountFixture(overrides={},delivery=true){
  const {createAccounts}=await import('./accounts.js');
  const db=memoryDatabase(),messages=[];
  const config={accounts:true,mongoUri:'mongodb://test',origin:'https://scopenote.example',resendKey:'unit-key',emailFrom:'test@example.com',dailyAiLimit:50,...overrides};
  const accounts=createAccounts(config,{database:async()=>db},delivery?{sendMail:async(...args)=>{messages.push(args);}}:{});
  return {accounts,db,messages,config};
}

test('account passwords and opaque session tokens are never stored in plaintext',async()=>{
  const {accounts,db}=await accountFixture();
  const result=await accounts.register({name:'Ada',email:'ADA@example.com',password:'Long-password-123!'});
  assert.equal(result.user.email,'ada@example.com');
  assert.equal(result.user.plan,'Free');
  assert(result.token);
  assert.equal((await accounts.resolve(result.token)).id,result.user.id);
  const data=JSON.stringify([...db.collections.values()].flatMap(col=>col.rows));
  assert(!data.includes('Long-password-123!'));
  assert(!data.includes(result.token));
  assert(!JSON.stringify(result.user).includes('password'));
  await assert.rejects(accounts.login({email:'ada@example.com',password:'wrong-password'}),error=>error.status===401);
  const login=await accounts.login({email:'ada@example.com',password:'Long-password-123!'});
  await accounts.logout(login.token);
  assert.equal(await accounts.resolve(login.token),null);
});

test('registration rejects weak passwords and normalized duplicate email addresses',async()=>{
  const {accounts}=await accountFixture();
  await assert.rejects(accounts.register({name:'Ada',email:'ada@example.com',password:'short'}),error=>error.status===400);
  await accounts.register({name:'Ada',email:'ada@example.com',password:'Long-password-123!'});
  await assert.rejects(accounts.register({name:'Other',email:' ADA@EXAMPLE.COM ',password:'Different-password-123!'}),error=>[400,409].includes(error.status));
});

test('community totals count accounts and only unexpired Premium access',async()=>{
  const {accounts,db}=await accountFixture();
  assert.deepEqual(await accounts.publicStats(),{members:0,premiumMembers:0});
  const users=db.collection('users');
  users.rows.push(
    {_id:'free',email:'free@example.com'},
    {_id:'active',email:'active@example.com',premiumUntil:new Date(Date.now()+86400000)},
    {_id:'expired',email:'expired@example.com',plan:'Premium',premiumUntil:new Date(Date.now()-1000)},
    {_id:'spoofed',plan:'Premium'}
  );
  assert.deepEqual(await accounts.publicStats(),{members:4,premiumMembers:1});
});

test('anonymous community endpoint exposes only cached totals and recovers after a failed query',async()=>{
  let calls=0;
  const accounts={publicStats:async()=>{calls++;if(calls===1)throw new Error('Database unavailable');return {members:7,premiumMembers:2,email:'never-public@example.com'};}};
  const app=createApp({accounts:true,origin:'https://scopenote.example'},{accounts,storage:{},generate:async()=>{},telemetry:{captureError(){}}});
  const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const url=`http://127.0.0.1:${server.address().port}/api/public/stats`;
  try{
    assert.equal((await fetch(url)).status,500);
    const responses=await Promise.all(Array.from({length:4},()=>fetch(url).then(r=>r.json())));
    for(const data of responses)assert.deepEqual(data,{members:7,premiumMembers:2});
    assert.equal(calls,2);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('password reset is unavailable explicitly when delivery is unconfigured',async()=>{
  const {accounts}=await accountFixture({resendKey:'',emailFrom:''},false);
  await assert.rejects(accounts.requestReset('ada@example.com'),error=>error.status===503);
});

test('reset links are single-use, expire, and revoke all existing sessions',async()=>{
  const {accounts,messages,db}=await accountFixture();
  const first=await accounts.register({name:'Ada',email:'ada@example.com',password:'Old-password-123!'});
  const second=await accounts.login({email:'ada@example.com',password:'Old-password-123!'});
  const known=await accounts.requestReset('ada@example.com');
  const unknown=await accounts.requestReset('unknown@example.com');
  assert.deepEqual(known,unknown);
  const resetMessage=messages.map(args=>args[0]).find(message=>message.subject==='Reset your ScopeNote password');
  const token=resetMessage.text.match(/#reset=([a-f0-9]{64})/)[1];
  assert(!JSON.stringify(db.collection('users').rows).includes(token));
  await accounts.resetPassword(token,'New-password-123!');
  assert.equal(await accounts.resolve(first.token),null);
  assert.equal(await accounts.resolve(second.token),null);
  await assert.rejects(accounts.resetPassword(token,'Another-password-123!'),error=>error.status===400);
  await assert.rejects(accounts.login({email:'ada@example.com',password:'Old-password-123!'}),error=>error.status===401);
  assert((await accounts.login({email:'ada@example.com',password:'New-password-123!'})).token);
  await accounts.requestReset('ada@example.com');
  const expired=messages.at(-1)[0].text.match(/#reset=([a-f0-9]{64})/)[1];
  db.collection('users').rows[0].resetExpires=new Date(Date.now()-1000);
  await assert.rejects(accounts.resetPassword(expired,'Third-password-123!'),error=>error.status===400);
});

test('verification tokens are single-use and free usage limits isolate each user',async()=>{
  const {accounts,messages}=await accountFixture();
  const {user,token}=await accounts.register({name:'Ada',email:'ada@example.com',password:'Long-password-123!'});
  assert.equal(user.emailVerified,false);
  const verifyToken=messages[0][0].text.match(/#verify=([a-f0-9]{64})/)[1];
  await accounts.verifyEmail(verifyToken);
  assert.equal((await accounts.resolve(token)).emailVerified,true);
  await assert.rejects(accounts.verifyEmail(verifyToken),error=>error.status===400);
  await Promise.all(Array.from({length:3},()=>accounts.consume(user.id,'scopes')));
  await assert.rejects(accounts.consume(user.id,'scopes'),error=>error.status===429);
  await accounts.consume('other-user','scopes');
  assert.equal((await accounts.usage(user.id)).scopes,3);
  assert.equal((await accounts.usage('other-user')).scopes,1);
  await accounts.consume(user.id,'voice');
  await assert.rejects(accounts.consume(user.id,'voice'),error=>error.status===429);
});

test('Premium entitlement is read from paid expiry, never a client plan field, and expires immediately',async()=>{
  const {accounts,db}=await accountFixture();
  const {user,token}=await accounts.register({name:'Paid user',email:'paid@example.com',password:'Long-password-123!',plan:'Premium',premiumUntil:new Date(Date.now()+86400000).toISOString()});
  assert.equal(user.plan,'Free');assert.equal(user.premiumUntil,null);
  const stored=db.collection('users').rows.find(row=>row._id===user.id);
  stored.plan='Premium';
  assert.equal((await accounts.resolve(token)).plan,'Free','a plan string cannot grant entitlement');
  stored.premiumStartedAt=new Date(Date.now()-86400000);stored.premiumUntil=new Date(Date.now()+29*86400000);
  const paid=await accounts.resolve(token);
  assert.equal(paid.plan,'Premium');assert.equal(paid.premiumUntil,stored.premiumUntil.toISOString());
  stored.premiumUntil=new Date(Date.now()-1000);
  const expired=await accounts.resolve(token);
  assert.equal(expired.plan,'Free');
  assert.equal((await accounts.usage(user.id)).voiceLimit,1);
  stored.premiumUntil='invalid';
  assert.equal((await accounts.resolve(token)).plan,'Free');assert.equal((await accounts.resolve(token)).premiumUntil,null);
});

test('Premium allows ten voice imports per anchored billing period while scopes stay capped at three',async()=>{
  const {accounts,db}=await accountFixture();
  const {user}=await accounts.register({name:'Paid user',email:'paid@example.com',password:'Long-password-123!'});
  const stored=db.collection('users').rows.find(row=>row._id===user.id);
  const started=new Date(Date.now()-5*86400000);stored.premiumStartedAt=started;stored.premiumUntil=new Date(started.getTime()+30*86400000);
  const initial=await accounts.usage(user.id);
  assert.equal(initial.periodStart,started.toISOString());assert.equal(initial.periodEnd,stored.premiumUntil.toISOString());
  assert.equal(initial.voiceLimit,10);assert.equal(initial.scopeLimit,3);assert.equal(initial.projectLimit,5);
  await Promise.all(Array.from({length:10},()=>accounts.consume(user.id,'voice')));
  await assert.rejects(accounts.consume(user.id,'voice'),error=>error.status===429);
  assert.equal((await accounts.usage(user.id)).voice,10);
  await Promise.all(Array.from({length:3},()=>accounts.consume(user.id,'scopes')));
  await assert.rejects(accounts.consume(user.id,'scopes'),error=>error.status===429);
  assert.equal((await accounts.usage(user.id)).scopes,3);
  const counter=db.collection('accountUsage').rows.find(row=>row._id===`${user.id}:voice:${initial.period}`);
  assert.equal(counter.count,10,'read and consume use the identical billing period counter');
});

test('Premium renewal advances anchored thirty-day quota windows independently from calendar months',async()=>{
  const {accounts,db}=await accountFixture();
  const {user}=await accounts.register({name:'Renewed user',email:'renewed@example.com',password:'Long-password-123!'});
  const stored=db.collection('users').rows.find(row=>row._id===user.id);
  stored.premiumStartedAt=new Date(Date.now()-2*86400000);stored.premiumUntil=new Date(Date.now()+58*86400000);
  const first=await accounts.usage(user.id);await accounts.consume(user.id,'voice');
  assert.equal((await accounts.usage(user.id)).voice,1);
  // Move the anchor back one full cycle to model entering the renewed period.
  // Its expected start is still the original current-period start, so no reset
  // occurs merely because an entitlement was extended.
  stored.premiumStartedAt=new Date(stored.premiumStartedAt.getTime()-30*86400000);
  const unchanged=await accounts.usage(user.id);
  assert.equal(unchanged.period,first.period);assert.equal(unchanged.voice,1);
  // A subsequent paid period with a new anchor owns a fresh counter.
  stored.premiumStartedAt=new Date(Date.now()-86400000);stored.premiumUntil=new Date(stored.premiumStartedAt.getTime()+30*86400000);
  const renewed=await accounts.usage(user.id);
  assert.notEqual(renewed.period,first.period);assert.equal(renewed.voice,0);
  await accounts.consume(user.id,'voice');assert.equal((await accounts.usage(user.id)).voice,1);
});

const config={production:false,accounts:true,password:'legacy-password',sessionSecret:'test-secret-'.repeat(4),origin:'http://127.0.0.1:5178',mongoUri:'mongodb://unit-test',model:'gemma-test',googleKey:'',sentryDsn:'',elevenKey:'',dailyAiLimit:50};
async function withAccountServer(fn){
  const users={alice:{id:'alice',name:'Alice',email:'alice@example.com',plan:'free',emailVerified:true},bob:{id:'bob',name:'Bob',email:'bob@example.com',plan:'free',emailVerified:true}};
  const records=new Map(),owners=[];
  const storage={
    async list(owner){owners.push(owner);return [...records.values()].filter(item=>item.owner===owner).map(item=>item.project);},
    async save(project,owner){owners.push(owner);const saved={...project,revision:1};records.set(`${owner}:${project.id}`,{owner,project:saved});return saved;},
    async history(id,owner){owners.push(owner);return records.has(`${owner}:${id}`)?[{revision:1}]:[];},
    async remove(id,owner){owners.push(owner);return records.delete(`${owner}:${id}`);},async ping(){}
  };
  const accounts={resolve:async token=>users[token]||null,mailReady:()=>false,usage:async()=>({scope:0,transcribe:0}),consume:async()=>{},logout:async()=>{}};
  const app=createApp(config,{storage,accounts,generate:async()=>({scope:sampleScope}),telemetry:{captureError(){},traced:(_op,_name,fn)=>fn()}});
  const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const url=`http://127.0.0.1:${server.address().port}`;
  const request=(path,token,options={})=>fetch(`${url}${path}`,{...options,headers:{...(token?{Cookie:`scopenote_account=${token}`} :{}),...options.headers}});
  try{await fn({request,records,owners,accounts});}finally{await new Promise(resolve=>server.close(resolve));}
}

test('account mode does not allow old workspace cookies or empty-password fallback',async()=>{
  await withAccountServer(async({request})=>{
    assert.equal((await request('/api/projects')).status,401);
    assert.equal((await request('/api/projects',createSession(config.sessionSecret))).status,401);
    assert.equal((await request('/api/projects',null,{headers:{Cookie:`scopenote_session=${createSession(config.sessionSecret)}`}})).status,401);
    assert.equal((await request('/api/session',null,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:config.password})})).status,410);
    assert.equal((await request('/api/projects','alice')).status,200);
    const account=await(await request('/api/account')).json();
    assert(!account.user);
  });
});

test('project ownership comes from the session; other users cannot list history or remove it',async()=>{
  await withAccountServer(async({request,owners})=>{
    const project={id:'shared-id',project:'Alice private draft',client:'Alice client',brief:'A private brief',scope:sampleScope,rate:50,buffer:10,currency:'USD',source:'manual',workspace:'bob',owner:'bob',userId:'bob'};
    const save=await request('/api/projects/shared-id','alice',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(project)});
    assert.equal(save.status,200);
    assert.equal((await(await request('/api/projects','bob')).json()).projects.length,0);
    assert.equal((await(await request('/api/projects/shared-id/history','bob')).json()).history.length,0);
    assert.equal((await request('/api/projects/shared-id','bob',{method:'DELETE'})).status,404);
    const bobSave=await request('/api/projects/shared-id','bob',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...project,project:'Bob independent draft'})});
    assert.equal(bobSave.status,200);
    assert.equal((await(await request('/api/projects','alice')).json()).projects[0].project,'Alice private draft');
    assert(owners.every(owner=>owner==='alice'||owner==='bob'));
  });
});

test('authenticated cross-origin mutations are rejected before storage writes',async()=>{
  await withAccountServer(async({request,records})=>{
    const response=await request('/api/projects/project','alice',{method:'DELETE',headers:{Origin:'https://evil.example'}});
    assert.equal(response.status,403);
    assert.equal(records.size,0);
  });
});

test('account HTTP endpoints set secure session semantics and ignore client plan escalation',async()=>{
  const {accounts}=await accountFixture();
  const app=createApp(config,{accounts,storage:{},generate:async()=>{},telemetry:{captureError(){}}});
  const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const url=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(`${url}/api/account/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Ada',email:'ada@example.com',password:'Long-password-123!',plan:'Premium',emailVerified:true})});
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.user.plan,'Free');
    assert.equal(data.user.emailVerified,false);
    assert(!data.token);
    const cookie=response.headers.get('set-cookie');
    assert.match(cookie,/HttpOnly/i);
    assert.match(cookie,/SameSite=Strict/i);
    const headers={Cookie:cookie.split(';')[0],'Content-Type':'application/json'};
    const profile=await fetch(`${url}/api/account`,{method:'PATCH',headers,body:JSON.stringify({name:'Updated Ada',plan:'Premium',email:'takeover@example.com',emailVerified:true})});
    assert.equal(profile.status,200);
    const updated=(await profile.json()).user;
    assert.equal(updated.name,'Updated Ada');
    assert.equal(updated.plan,'Free');
    assert.equal(updated.email,'ada@example.com');
    assert.equal(updated.emailVerified,false);
    assert.equal((await fetch(`${url}/api/account/logout`,{method:'POST',headers})).status,200);
    assert.equal((await(await fetch(`${url}/api/account`,{headers})).json()).user,null);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
