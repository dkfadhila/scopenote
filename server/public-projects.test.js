import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from './app.js';
import {createStorage} from './storage.js';
import {sampleScope} from '../src/domain.js';

const shareId='0fc82342-3047-4902-b5fb-c7a77c093eb9';
const project={id:'consent-draft',client:'Private client name',project:'Public project title',brief:'A client brief that should not be listed in a public directory.',scope:sampleScope,rate:50,buffer:10,currency:'USD',source:'manual',model:''};
const config={accounts:true,production:false,mongoUri:'mongodb://test',model:'gemma-test'};
async function withServer(storage,fn){
  const accounts={resolve:async token=>token==='alice'?{id:'alice',plan:'Free',email:'alice@example.com'}:null,mailReady:()=>false};
  const app=createApp(config,{storage,accounts,generate:async()=>{},telemetry:{captureError(){}}});
  const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const url=`http://127.0.0.1:${server.address().port}`;
  const request=(path,{body,cookie,method=body?'PUT':'GET'}={})=>fetch(`${url}${path}`,{method,headers:{...(cookie?{Cookie:`scopenote_account=${cookie}`} :{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  try{await fn(request);}finally{await new Promise(resolve=>server.close(resolve));}
}

test('public directory and shared project can be read without an account',async()=>{
  const publicProject={shareId,project:project.project,summary:sampleScope.summary};
  await withServer({publicList:async()=>[publicProject],publicGet:async id=>id===shareId?publicProject:null},async request=>{
    const directory=await request('/api/public/projects');assert.equal(directory.status,200);assert.deepEqual((await directory.json()).projects,[publicProject]);
    const detail=await request(`/api/public/projects/${shareId}`);assert.equal(detail.status,200);assert.deepEqual((await detail.json()).project,publicProject);
    assert.equal((await request('/api/public/projects/invalid')).status,404);
    assert.equal((await request('/api/public/projects/1035c426-b494-434e-ae9f-eb940db64ae5')).status,404);
  });
});

function storageFixture(){
  const rows=[];
  const match=(row,query)=>Object.entries(query).every(([key,value])=>row[key]===value);
  const copy=value=>value===undefined?value:structuredClone(value);
  function projected(row,options={}){
    if(!row)return null;
    const projection=options.projection;if(!projection)return copy(row);
    const inclusion=Object.entries(projection).filter(([key,value])=>key!=='_id'&&value===1);
    if(!inclusion.length){const data=copy(row);for(const [key,value]of Object.entries(projection))if(value===0)delete data[key];return data;}
    const data={};
    for(const [key]of inclusion){const segments=key.split('.');let source=row,target=data;for(let i=0;i<segments.length;i++){const segment=segments[i];if(source?.[segment]===undefined)break;if(i===segments.length-1)target[segment]=copy(source[segment]);else{target[segment]??={};target=target[segment];source=source[segment];}}}
    return data;
  }
  const collection={
    async findOne(query,options){return projected(rows.find(row=>match(row,query)),options);},
    find(query,options){let result=rows.filter(row=>match(row,query));const cursor={sort(){result.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));return cursor;},limit(n){result=result.slice(0,n);return cursor;},async toArray(){return result.map(row=>projected(row,options));}};return cursor;},
    async countDocuments(query){return rows.filter(row=>match(row,query)).length;},
    async insertOne(row){rows.push(copy(row));return {insertedId:row._id};},
    async replaceOne(query,row){const index=rows.findIndex(item=>match(item,query));if(index===-1)return {matchedCount:0};rows[index]=copy(row);return {matchedCount:1};},
    async deleteOne(query){const index=rows.findIndex(item=>match(item,query));if(index===-1)return {deletedCount:0};rows.splice(index,1);return {deletedCount:1};}
  };
  const client={async connect(){return client;},db:()=>({collection:()=>collection}),async close(){}};
  return {rows,storage:createStorage(config,{client})};
}

test('new Free draft publishes directly on save and server assigns its public share ID',async()=>{
  const {storage,rows}=storageFixture();
  assert.equal(rows.length,0);
  const saved=await storage.save({...project,visibility:'private',shareId:'spoofed'},'alice',{plan:'Free'});
  assert.equal(saved.visibility,'public');
  assert.match(saved.shareId,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  const updated=await storage.save({...project,revision:1},'alice',{plan:'Free'});
  assert.equal(updated.shareId,saved.shareId);
  assert.equal(updated.visibility,'public');
});

test('Premium and legacy drafts remain private even if client body requests public',async()=>{
  const {storage,rows}=storageFixture();
  const premium=await storage.save({...project,visibility:'public'},'paid-user',{plan:'Premium'});
  assert.equal(premium.visibility,'private');
  rows.push({...project,_id:'legacy-user:legacy',id:'legacy',workspace:'legacy-user',revision:1,history:[]});
  const updated=await storage.save({...project,id:'legacy',revision:1},'legacy-user',{plan:'Free'});
  assert.equal(updated.visibility,'private');
  assert.deepEqual(await storage.publicList(),[]);
});

test('saved Free client names are public while owner, email and history remain private',async()=>{
  const {storage,rows}=storageFixture();
  const saved=await storage.save({...project,email:'private@example.com'},'alice',{plan:'Free'});
  rows.push({_id:'hidden:old',id:'old',workspace:'hidden',client:'Hidden client',project:'Legacy private',scope:sampleScope,shareId:'1035c426-b494-434e-ae9f-eb940db64ae5'});
  const listing=await storage.publicList();
  assert.equal(listing.length,1);
  assert.deepEqual(Object.keys(listing[0]).sort(),['client','project','shareId','summary','updatedAt']);
  assert.equal(listing[0].client,project.client);
  assert.equal(listing[0].summary,sampleScope.summary);
  const detail=await storage.publicGet(saved.shareId);
  for(const key of ['_id','id','workspace','owner','email','history','clientPublicationConsentAt','clientNamePublishedAt'])assert.equal(detail[key],undefined,`${key} is private metadata`);
  assert.equal(detail.client,project.client);
  assert.equal(detail.brief,project.brief);
  assert.deepEqual(detail.scope,sampleScope);
  assert.equal(await storage.publicGet('1035c426-b494-434e-ae9f-eb940db64ae5'),null,'legacy share-like fields cannot make it public');
  await storage.remove(project.id,'alice');
  assert.deepEqual(await storage.publicList(),[]);
  assert.equal(await storage.publicGet(saved.shareId),null);
});

test('older hidden client names publish on the next owner save without a confirmation flag',async()=>{
  const {storage,rows}=storageFixture();
  rows.push({...project,_id:`alice:${project.id}`,workspace:'alice',visibility:'public',shareId,revision:1,history:[],publicationConsentAt:'2026-10-01T00:00:00.000Z'});
  assert.equal((await storage.publicGet(shareId)).client,undefined);
  assert.equal((await storage.publicList())[0].client,undefined);
  const saved=await storage.save({...project,revision:1},'alice',{plan:'Free'});
  assert(saved.clientNamePublishedAt);
  assert.equal(saved.clientPublicationConsentAt,undefined);
  assert.equal((await storage.publicGet(shareId)).client,project.client);
  assert.equal((await storage.publicList())[0].client,project.client);
});

test('saving a previously public project under Premium removes anonymous access',async()=>{
  const {storage}=storageFixture();
  const free=await storage.save(project,'alice',{plan:'Free'});
  assert(await storage.publicGet(free.shareId));
  const premium=await storage.save({...project,revision:1},'alice',{plan:'Premium'});
  assert.equal(premium.visibility,'private');
  assert.equal(await storage.publicGet(free.shareId),null);
  assert.deepEqual(await storage.publicList(),[]);
});

test('previously published client names remain visible across the policy update',async()=>{
  const {storage,rows}=storageFixture();
  rows.push({...project,_id:`alice:${project.id}`,workspace:'alice',visibility:'public',shareId,revision:1,history:[],clientPublicationConsentAt:'2026-10-16T00:00:00.000Z'});
  assert.equal((await storage.publicGet(shareId)).client,project.client);
  const saved=await storage.save({...project,revision:1},'alice',{plan:'Free'});
  assert.equal(saved.clientNamePublishedAt,'2026-10-16T00:00:00.000Z');
  assert.equal((await storage.publicGet(shareId)).client,project.client);
});

test('save routes derive plan and owner from session without any publication confirmation flag',async()=>{
  const calls=[];
  await withServer({save:async(...args)=>{calls.push(args);return {...args[0],revision:1};}},async request=>{
    const response=await request(`/api/projects/${project.id}`,{cookie:'alice',body:{...project,plan:'Premium',owner:'other',visibility:'private',shareId}});
    assert.equal(response.status,200);
    assert.equal(calls[0][1],'alice');
    assert.deepEqual(calls[0][2],{plan:'Free'});
    assert.equal(calls[0][0].plan,undefined);
    assert.equal(calls[0][0].visibility,undefined);
    assert.equal(calls[0][0].shareId,undefined);
    const noConsent=await request(`/api/projects/${project.id}`,{cookie:'alice',body:{...project,publishConsent:'true'}});
    assert.equal(noConsent.status,200);
    assert.deepEqual(calls[1][2],{plan:'Free'},'obsolete confirmation fields cannot affect saving');
  });
});

test('expired Premium cannot silently publish a new draft requested as private',async()=>{
  let writes=0;
  await withServer({save:async()=>{writes++;return project;}},async request=>{
    const result=await request(`/api/projects/${project.id}`,{cookie:'alice',body:{...project,revision:0,requirePrivate:true}});
    assert.equal(result.status,409);
    assert.equal(writes,0);
    const existing=await request(`/api/projects/${project.id}`,{cookie:'alice',body:{...project,revision:1,requirePrivate:true}});
    assert.equal(existing.status,200,'existing private drafts remain editable on expiry');
    assert.equal(writes,1);
  });
});
