import express from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectInput, projectId, briefInput } from './schemas.js';
import { createSession, validSession, sessionFrom, passwordMatches } from './auth.js';

export function createApp(config,{storage,generate,telemetry,transcribe=transcribeAudio}){
  const app=express();app.disable('x-powered-by');if(config.production)app.set('trust proxy',1);
  app.use(express.json({limit:'96kb'}));
  app.use('/api',(req,res,next)=>{
    res.setHeader('Cache-Control','no-store');const origin=req.headers.origin;
    if(origin&&origin!==(config.origin||'http://127.0.0.1:5178')&&!(!config.production&&/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)))return res.status(403).json({error:'Request origin is not allowed.'});next();
  });
  const authenticated=req=>!config.password||validSession(sessionFrom(req),config.sessionSecret);
  app.get('/api/health',(_req,res)=>res.json({status:'ok'}));
  app.get('/api/status',(req,res)=>res.json({authenticated:authenticated(req),passwordRequired:!!config.password,storage:config.mongoUri?'mongodb':'browser',services:[
    {id:'render',name:'Render',configured:!!process.env.RENDER},{id:'gemma',name:`Gemma · ${config.model}`,configured:!!config.googleKey},{id:'mastra',name:'Mastra workflow',configured:true},{id:'mongodb',name:'MongoDB Atlas',configured:!!config.mongoUri},{id:'sentry',name:'Sentry Agent Tracing',configured:!!config.sentryDsn},{id:'elevenlabs',name:'ElevenLabs Scribe',configured:!!config.elevenKey}]}));
  app.post('/api/session',rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many sign-in attempts. Try again later.'}}),(req,res)=>{
    if(!config.password)return res.json({authenticated:true});
    if(typeof req.body?.password!=='string'||!passwordMatches(req.body.password,config.password))return res.status(401).json({error:'Incorrect workspace password.'});
    res.cookie('scopenote_session',createSession(config.sessionSecret),{httpOnly:true,secure:config.production,sameSite:'strict',maxAge:8*60*60*1000,path:'/'});res.json({authenticated:true});
  });
  app.delete('/api/session',(_req,res)=>{res.clearCookie('scopenote_session',{httpOnly:true,secure:config.production,sameSite:'strict',path:'/'});res.json({ok:true});});
  app.use('/api',(req,res,next)=>authenticated(req)?next():res.status(401).json({error:'Unlock this private workspace in Connections first.'}));
  const aiLimit=rateLimit({windowMs:60*1000,limit:6,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Please wait a minute before another AI request.'}});
  app.post('/api/scope',aiLimit,async(req,res)=>{const input=briefInput.safeParse(req.body);if(!input.success)return res.status(400).json({error:'Use a brief of 30–20,000 characters.'});res.json(await generate(input.data.brief));});
  app.get('/api/projects',async(_req,res)=>res.json({projects:await storage.list()}));
  app.put('/api/projects/:id',async(req,res)=>{const input=projectInput.safeParse(req.body);if(!input.success||input.data.id!==req.params.id)return res.status(400).json({error:'Invalid project. Check required fields, scope and estimates.'});res.json({project:await storage.save(input.data)});});
  app.get('/api/projects/:id/history',async(req,res)=>{if(!projectId.safeParse(req.params.id).success)return res.status(400).json({error:'Invalid project ID.'});res.json({history:await storage.history(req.params.id)});});
  app.delete('/api/projects/:id',async(req,res)=>{if(!projectId.safeParse(req.params.id).success)return res.status(400).json({error:'Invalid project ID.'});const removed=await storage.remove(req.params.id);res.status(removed?200:404).json(removed?{ok:true}:{error:'Draft not found.'});});
  app.get('/api/check-database',async(_req,res)=>{await storage.ping();res.json({status:'connected'});});
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:12*1024*1024,files:1},fileFilter(_req,file,cb){if(!['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/x-m4a','audio/webm','video/webm','audio/ogg','application/ogg'].includes(file.mimetype)){const error=new Error('Upload an MP3, WAV, M4A, WebM or OGG voice note.');error.status=400;return cb(error);}cb(null,true);}});
  app.post('/api/transcribe',aiLimit,(req,res,next)=>{if(!config.elevenKey)return res.status(503).json({error:'ElevenLabs is not configured. Set ELEVENLABS_API_KEY on the server.'});next();},upload.single('audio'),async(req,res)=>{if(!req.file)return res.status(400).json({error:'Choose an audio file first.'});res.json(await telemetry.traced('gen_ai.execute_tool','ElevenLabs / transcribe brief',()=>transcribe(config,req.file)));});
  app.use('/api',(_req,res)=>res.status(404).json({error:'API endpoint not found.'}));
  const dist=fileURLToPath(new URL('../dist',import.meta.url));
  if(existsSync(resolve(dist,'index.html'))){app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.sendFile(resolve(dist,'index.html')));}
  app.use((error,req,res,_next)=>{
    const requestId=randomUUID();telemetry.captureError(error);const status=error.code==='LIMIT_FILE_SIZE'?413:error.status||500;
    const message=error.code==='LIMIT_FILE_SIZE'?'Audio must be under 12 MB.':error.type==='entity.too.large'?'Request is too large.':status<500||error.status===503||error.status===502?error.message:'The server could not complete this request. Check the service configuration and try again.';
    res.status(status).json({error:message,requestId});
  });return app;
}
export async function transcribeAudio(config,file){
  const form=new FormData();form.append('model_id',config.elevenModel);form.append('file',new Blob([file.buffer],{type:file.mimetype}),file.originalname);
  const response=await fetch('https://api.elevenlabs.io/v1/speech-to-text',{method:'POST',headers:{'xi-api-key':config.elevenKey},body:form,signal:AbortSignal.timeout(120000)});
  if(!response.ok){const error=new Error('ElevenLabs could not transcribe this file. Check API access, credit balance and audio format.');error.status=502;throw error;}
  const data=await response.json();if(typeof data.text!=='string'||!data.text.trim()){const error=new Error('No speech was found in this recording.');error.status=422;throw error;}
  if(data.text.length>20000){const error=new Error('The transcript is longer than 20,000 characters. Upload a shorter clip.');error.status=422;throw error;}
  return {text:data.text,language:data.language_code||null,model:config.elevenModel};
}
