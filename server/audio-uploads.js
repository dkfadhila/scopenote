import {handleUpload} from '@vercel/blob/client';
import {get,del} from '@vercel/blob';

export const audioTypes=['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/x-m4a','audio/webm','video/webm','audio/ogg','application/ogg'];
const maxBytes=12*1024*1024;
const fail=(status,message)=>Object.assign(new Error(message),{status});

export function createAudioUploads(config,storage,{handle=handleUpload,read=get,remove=del,now=()=>new Date()}={}){
  let initialized;
  async function collection(){
    const col=(await storage.database()).collection('temporaryAudioUploads');
    // Keep records until cleanup deletes the corresponding private blob.
    if(!initialized)initialized=col.createIndex({expiresAt:1}).catch(e=>{initialized=null;throw e;});
    await initialized;return col;
  }
  async function issue(req){
    if(!config.blobToken)throw fail(503,'Voice uploads are not configured.');
    if(req.body?.type!=='blob.generate-client-token')throw fail(400,'Invalid audio upload request.');
    return handle({request:req,body:req.body,token:config.blobToken,onBeforeGenerateToken:async pathname=>{
      if(!/^voice\/[a-f0-9-]{36}$/.test(pathname))throw fail(400,'Invalid audio upload path.');
      const col=await collection(),time=now();
      if(await col.countDocuments({owner:req.user.id,createdAt:{$gte:new Date(+time-3600000)}})>=20)throw fail(429,'Please wait before uploading more voice notes.');
      try{await col.insertOne({_id:pathname,owner:req.user.id,createdAt:time,expiresAt:new Date(+time+15*60000),status:'pending'});}
      catch(e){if(e.code===11000)throw fail(409,'Start a new audio upload.');throw e;}
      return {allowedContentTypes:audioTypes,maximumSizeInBytes:maxBytes,validUntil:+time+10*60000,addRandomSuffix:false,allowOverwrite:false};
    }});
  }
  async function transcribe(req,{consume,run}){
    const pathname=req.body?.pathname;
    if(typeof pathname!=='string'||!/^voice\/[a-f0-9-]{36}$/.test(pathname))throw fail(400,'Choose an audio file first.');
    const col=await collection();
    const claimed=await col.findOneAndUpdate({_id:pathname,owner:req.user.id,status:'pending',expiresAt:{$gt:now()}},{$set:{status:'processing'}},{returnDocument:'after'});
    if(!claimed)throw fail(404,'Audio upload expired or was already used. Choose the file again.');
    try{
      const result=await read(pathname,{access:'private',token:config.blobToken,useCache:false});
      if(!result||result.statusCode!==200)throw fail(404,'Audio upload could not be found. Choose the file again.');
      if(result.blob.size>maxBytes||!audioTypes.includes(result.blob.contentType?.split(';')[0])){
        await result.stream.cancel();throw fail(400,'Upload an audio file under 12 MB.');
      }
      const chunks=[];let size=0;
      for await(const chunk of result.stream){size+=chunk.length;if(size>maxBytes)throw fail(413,'Audio must be under 12 MB.');chunks.push(chunk);}
      await consume();
      return await run({buffer:Buffer.concat(chunks),mimetype:result.blob.contentType,originalname:'voice-note'});
    }finally{
      // Leave the record for scheduled cleanup if deletion could not finish.
      try{await remove(pathname,{token:config.blobToken});await col.deleteOne({_id:pathname,owner:req.user.id});}catch{}
    }
  }
  async function cleanup(){
    if(!config.blobToken)return;
    const col=await collection(),rows=await col.find({expiresAt:{$lte:now()}}).limit(100).toArray();
    for(const row of rows){await remove(row._id,{token:config.blobToken});await col.deleteOne({_id:row._id});}
  }
  return {issue,transcribe,cleanup};
}
