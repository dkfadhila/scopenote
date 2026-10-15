import { MongoClient } from 'mongodb';
export function createStorage(config) {
  let client, connecting;
  async function collection(){
    if(!config.mongoUri){const error=new Error('MongoDB is not configured. Add MONGODB_URI on the server.');error.status=503;throw error;}
    if(!connecting){client=new MongoClient(config.mongoUri,{serverSelectionTimeoutMS:5000});connecting=client.connect().catch(error=>{connecting=null;throw error;});}
    await connecting;return client.db(config.mongoDb).collection('projects');
  }
  return {
    async database(){await collection();return client.db(config.mongoDb);},
    async ping(){await collection();await client.db(config.mongoDb).command({ping:1});},
    async list(owner='owner'){return (await collection()).find({workspace:owner},{projection:{_id:0,workspace:0,history:0}}).sort({updatedAt:-1}).limit(100).toArray();},
    async save(project,owner='owner'){
      const col=await collection(),key=owner==='owner'?project.id:`${owner}:${project.id}`,previous=await col.findOne({_id:key,workspace:owner});
      if(!previous&&owner!=='owner'&&await col.countDocuments({workspace:owner})>=5){const error=new Error('Free accounts can save up to 5 projects. Export or remove a draft to make room.');error.status=429;throw error;}
      if(previous&&project.revision!==previous.revision){const error=new Error('This draft changed elsewhere. Reload saved drafts before saving again.');error.status=409;throw error;}
      const {revision,...fields}=project;
      const entry={...fields,workspace:owner,updatedAt:new Date().toISOString(),revision:(previous?.revision||0)+1,history:previous?[{scope:previous.scope,brief:previous.brief,revision:previous.revision,updatedAt:previous.updatedAt},...(previous.history||[])].slice(0,10):[]};
      if(previous){const result=await col.replaceOne({_id:key,workspace:owner,revision:previous.revision},{_id:key,...entry});if(!result.matchedCount){const error=new Error('Another save completed first. Reload the draft.');error.status=409;throw error;}}
      else{try{await col.insertOne({_id:key,...entry});}catch(error){if(error.code===11000){const conflict=new Error('This draft already exists. Reload saved drafts.');conflict.status=409;throw conflict;}throw error;}}
      const {workspace,history,...result}=entry;return result;
    },
    async history(id,owner='owner'){const item=await (await collection()).findOne({_id:owner==='owner'?id:`${owner}:${id}`,workspace:owner},{projection:{history:1}});return item?.history||[];},
    async remove(id,owner='owner'){return (await (await collection()).deleteOne({_id:owner==='owner'?id:`${owner}:${id}`,workspace:owner})).deletedCount>0;},
    async close(){await client?.close();}
  };
}
