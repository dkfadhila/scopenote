import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
export function createStorage(config,{client:providedClient}={}) {
  let client, connecting;
  async function collection(){
    if(!config.mongoUri){const error=new Error('MongoDB is not configured. Add MONGODB_URI on the server.');error.status=503;throw error;}
    if(!connecting){client=providedClient||new MongoClient(config.mongoUri,{serverSelectionTimeoutMS:5000});connecting=client.connect().catch(error=>{connecting=null;throw error;});}
    await connecting;return client.db(config.mongoDb).collection('projects');
  }
  return {
    async database(){await collection();return client.db(config.mongoDb);},
    async ping(){await collection();await client.db(config.mongoDb).command({ping:1});},
    async list(owner='owner'){return (await collection()).find({workspace:owner},{projection:{_id:0,workspace:0,history:0}}).sort({updatedAt:-1}).limit(100).toArray();},
    async publicList(){const rows=await(await collection()).find({visibility:'public'},{projection:{_id:0,shareId:1,project:1,'scope.summary':1,updatedAt:1}}).sort({updatedAt:-1}).limit(100).toArray();return rows.map(p=>({shareId:p.shareId,project:p.project,summary:p.scope?.summary||'',updatedAt:p.updatedAt}));},
    async publicGet(shareId){const row=await(await collection()).findOne({shareId,visibility:'public'},{projection:{_id:0,shareId:1,project:1,brief:1,scope:1,rate:1,buffer:1,currency:1,updatedAt:1,visibility:1}});if(!row)return null;const {project,brief,scope,rate,buffer,currency,updatedAt,visibility}=row;return {shareId,project,brief,scope,rate,buffer,currency,updatedAt,visibility};},
    async save(project,owner='owner',{plan='Free',publishConsent=false}={}){
      const col=await collection(),key=owner==='owner'?project.id:`${owner}:${project.id}`,previous=await col.findOne({_id:key,workspace:owner});
      const visibility=plan==='Premium'?'private':previous?.visibility||(previous||owner==='owner'?'private':'public');
      if(!previous&&visibility==='public'&&!publishConsent){const error=new Error('Free drafts are public. Confirm that your brief and scope can be published before saving.');error.status=400;throw error;}
      if(!previous&&owner!=='owner'&&await col.countDocuments({workspace:owner})>=5){const error=new Error('Free accounts can save up to 5 projects. Export or remove a draft to make room.');error.status=429;throw error;}
      if(previous&&project.revision!==previous.revision){const error=new Error('This draft changed elsewhere. Reload saved drafts before saving again.');error.status=409;throw error;}
      const {revision,...fields}=project;
      const entry={...fields,workspace:owner,visibility,...(visibility==='public'?{shareId:previous?.shareId||randomUUID(),publicationConsentAt:previous?.publicationConsentAt||new Date().toISOString()}:{}),updatedAt:new Date().toISOString(),revision:(previous?.revision||0)+1,history:previous?[{scope:previous.scope,brief:previous.brief,revision:previous.revision,updatedAt:previous.updatedAt},...(previous.history||[])].slice(0,10):[]};
      if(previous){const result=await col.replaceOne({_id:key,workspace:owner,revision:previous.revision},{_id:key,...entry});if(!result.matchedCount){const error=new Error('Another save completed first. Reload the draft.');error.status=409;throw error;}}
      else{try{await col.insertOne({_id:key,...entry});}catch(error){if(error.code===11000){const conflict=new Error('This draft already exists. Reload saved drafts.');conflict.status=409;throw conflict;}throw error;}}
      const {workspace,history,...result}=entry;return result;
    },
    async history(id,owner='owner'){const item=await (await collection()).findOne({_id:owner==='owner'?id:`${owner}:${id}`,workspace:owner},{projection:{history:1}});return item?.history||[];},
    async remove(id,owner='owner'){return (await (await collection()).deleteOne({_id:owner==='owner'?id:`${owner}:${id}`,workspace:owner})).deletedCount>0;},
    async close(){await client?.close();}
  };
}
