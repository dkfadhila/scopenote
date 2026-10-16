import express from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectInput, projectId, briefInput } from './schemas.js';
import { createSession, validSession, sessionFrom, passwordMatches } from './auth.js';
import {createAccounts} from './accounts.js';
import {createBilling} from './billing.js';

export function createApp(config,{storage,generate,telemetry,transcribe=transcribeAudio,accounts:providedAccounts,billing:providedBilling}){
  const app=express();app.disable('x-powered-by');if(config.production)app.set('trust proxy',1);
  const accounts=providedAccounts||(config.accounts?createAccounts(config,storage):null);
  const billing=providedBilling||createBilling(config,storage);
  const tokenFrom=req=>req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('scopenote_account='))?.slice('scopenote_account='.length);
  const cookieOptions={httpOnly:true,secure:config.production,sameSite:'strict',maxAge:7*86400000,path:'/'};
  app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');if(config.production){res.setHeader('Strict-Transport-Security','max-age=31536000');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");}next();});
  const webhookLimit=rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-7',legacyHeaders:false});
  app.post('/api/billing/allscale/webhook',webhookLimit,express.raw({type:'application/json',limit:'32kb'}),async(req,res)=>{if(!Buffer.isBuffer(req.body))return res.status(400).json({error:'A JSON payment notification is required.'});res.json(await billing.webhook({headers:req.headers,rawBody:req.body,path:req.originalUrl}));});
  app.use(express.json({limit:'96kb'}));
  app.get('/draft.html',(_req,res)=>res.redirect(301,'/'));
  app.use('/api',(req,res,next)=>{
    res.setHeader('Cache-Control','no-store');const origin=req.headers.origin;
    if(origin&&origin!==(config.origin||'http://127.0.0.1:5178')&&!(!config.production&&/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)))return res.status(403).json({error:'Request origin is not allowed.'});next();
  });
  const authenticated=req=>config.accounts?!!req.user:!config.password||validSession(sessionFrom(req),config.sessionSecret);
  app.use('/api',async(req,_res,next)=>{if(accounts)req.user=await accounts.resolve(tokenFrom(req));next();});
  const authLimit=rateLimit({windowMs:15*60000,limit:15,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many account attempts. Please try again in 15 minutes.'}});
  const resetLimit=rateLimit({windowMs:15*60000,limit:5,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Please wait before requesting another email or password change.'}});
  const requireUser=(req,res,next)=>req.user?next():res.status(401).json({error:'Sign in to access your private projects.'});
  const requireAccounts=(_req,res,next)=>accounts?next():res.status(503).json({error:'Individual accounts are not enabled on this deployment yet.'});
  app.get('/api/billing',(req,res)=>res.json(billing.info(req.user)));
  const paymentLimit=rateLimit({windowMs:60000,limit:5,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Please wait a minute before checking or creating another payment.'}});
  app.post('/api/billing/checkout',requireAccounts,requireUser,paymentLimit,async(req,res)=>res.json(await billing.checkout(req.user)));
  app.get('/api/billing/orders/:id',requireAccounts,requireUser,paymentLimit,async(req,res)=>res.json(await billing.get(req.params.id,req.user.id)));
  app.post('/api/billing/orders/:id/refresh',requireAccounts,requireUser,paymentLimit,async(req,res)=>res.json(await billing.refresh(req.params.id,req.user.id)));
  app.get('/api/public/projects',async(_req,res)=>res.json({projects:await storage.publicList()}));
  app.get('/api/public/projects/:shareId',async(req,res)=>{if(!/^[a-f0-9-]{36}$/.test(req.params.shareId))return res.status(404).json({error:'Public draft not found.'});const project=await storage.publicGet(req.params.shareId);res.status(project?200:404).json(project?{project}:{error:'Public draft not found.'});});
  app.get('/api/account',requireAccounts,async(req,res)=>res.json({accountMode:true,user:req.user||null,usage:req.user?await accounts.usage(req.user.id):null,emailEnabled:accounts.mailReady()}));
  for(const action of ['register','login'])app.post(`/api/account/${action}`,requireAccounts,authLimit,async(req,res)=>{const result=await accounts[action](req.body);res.cookie('scopenote_account',result.token,cookieOptions);res.json({user:result.user,emailDeliveryFailed:!!result.emailDeliveryFailed});});
  app.post('/api/account/logout',requireAccounts,async(req,res)=>{await accounts.logout(tokenFrom(req));res.clearCookie('scopenote_account',{...cookieOptions,maxAge:undefined});res.json({ok:true});});
  app.patch('/api/account',requireAccounts,requireUser,async(req,res)=>res.json({user:await accounts.profile(req.user.id,req.body?.name)}));
  app.post('/api/account/forgot-password',requireAccounts,resetLimit,async(req,res)=>res.json(await accounts.requestReset(req.body?.email)));
  app.post('/api/account/reset-password',requireAccounts,resetLimit,async(req,res)=>res.json(await accounts.resetPassword(req.body?.token,req.body?.password)));
  app.post('/api/account/verify-email',requireAccounts,resetLimit,async(req,res)=>res.json(await accounts.verifyEmail(req.body?.token)));
  app.post('/api/account/resend-verification',requireAccounts,requireUser,resetLimit,async(req,res)=>res.json(await accounts.resendVerification(req.user)));
  app.get('/api/health',(_req,res)=>res.json({status:'ok'}));
  app.get('/api/status',(req,res)=>res.json({accountMode:!!config.accounts,authenticated:authenticated(req),passwordRequired:!config.accounts&&!!config.password,storage:config.mongoUri?'mongodb':'browser',services:[
    {id:'render',name:'Render',configured:!!process.env.RENDER},{id:'gemma',name:`Gemma · ${config.model}`,configured:!!config.googleKey},{id:'mastra',name:'Mastra workflow',configured:true},{id:'mongodb',name:'MongoDB Atlas',configured:!!config.mongoUri},{id:'sentry',name:'Sentry Agent Tracing',configured:!!config.sentryDsn},{id:'elevenlabs',name:'ElevenLabs Scribe',configured:!!config.elevenKey}]}));
  app.post('/api/session',rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many sign-in attempts. Try again later.'}}),(req,res)=>{
    if(config.accounts)return res.status(410).json({error:'Use your email and password to sign in. Shared workspace access is retired.'});
    if(!config.password)return res.json({authenticated:true});
    if(typeof req.body?.password!=='string'||!passwordMatches(req.body.password,config.password))return res.status(401).json({error:'Incorrect workspace password.'});
    res.cookie('scopenote_session',createSession(config.sessionSecret),{httpOnly:true,secure:config.production,sameSite:'strict',maxAge:8*60*60*1000,path:'/'});res.json({authenticated:true});
  });
  app.delete('/api/session',(_req,res)=>{res.clearCookie('scopenote_session',{httpOnly:true,secure:config.production,sameSite:'strict',path:'/'});res.json({ok:true});});
  app.use('/api',(req,res,next)=>authenticated(req)?next():res.status(401).json({error:config.accounts?'Sign in to access your private projects.':'Unlock this private workspace in Connections first.'}));
  const aiQuota=kind=>async(req,res,next)=>{if(accounts){if(accounts.mailReady()&&!req.user.emailVerified)return res.status(403).json({error:'Verify your email before using AI. You can still edit and save projects.'});await accounts.consume(req.user.id,kind);}next();};
  const aiLimit=rateLimit({windowMs:60*1000,limit:6,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Please wait a minute before another AI request.'}});
  app.post('/api/scope',aiLimit,async(req,res,next)=>{if(!briefInput.safeParse(req.body).success)return res.status(400).json({error:'Use a brief of 30–20,000 characters.'});if(!config.googleKey)return res.status(503).json({error:'AI drafting is not configured yet. Please try again later.'});next();},aiQuota('scopes'),async(req,res)=>res.json(await generate(briefInput.parse(req.body).brief)));
  app.get('/api/projects',async(req,res)=>res.json({projects:await storage.list(req.user?.id)}));
  const editLimit=rateLimit({windowMs:60000,limit:30,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many changes. Please wait a minute.'}});
  app.put('/api/projects/:id',editLimit,async(req,res)=>{const input=projectInput.safeParse(req.body);if(!input.success||input.data.id!==req.params.id)return res.status(400).json({error:'Invalid project. Check required fields, scope and estimates.'});if(req.body.requirePrivate===true&&!input.data.revision&&req.user?.plan!=='Premium')return res.status(409).json({error:'Premium expired before this private draft was saved. Review the Free public visibility notice before saving again.'});res.json({project:await storage.save(input.data,req.user?.id,{plan:req.user?.plan||'Free'})});});
  app.get('/api/projects/:id/history',async(req,res)=>{if(!projectId.safeParse(req.params.id).success)return res.status(400).json({error:'Invalid project ID.'});res.json({history:await storage.history(req.params.id,req.user?.id)});});
  app.delete('/api/projects/:id',editLimit,async(req,res)=>{if(!projectId.safeParse(req.params.id).success)return res.status(400).json({error:'Invalid project ID.'});const removed=await storage.remove(req.params.id,req.user?.id);res.status(removed?200:404).json(removed?{ok:true}:{error:'Draft not found.'});});
  app.get('/api/check-database',async(_req,res)=>{await storage.ping();res.json({status:'connected'});});
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:12*1024*1024,files:1},fileFilter(_req,file,cb){if(!['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/x-m4a','audio/webm','video/webm','audio/ogg','application/ogg'].includes(file.mimetype)){const error=new Error('Upload an MP3, WAV, M4A, WebM or OGG voice note.');error.status=400;return cb(error);}cb(null,true);}});
  app.post('/api/transcribe',aiLimit,(req,res,next)=>{if(!config.elevenKey)return res.status(503).json({error:'ElevenLabs is not configured. Set ELEVENLABS_API_KEY on the server.'});next();},upload.single('audio'),(req,res,next)=>req.file?next():res.status(400).json({error:'Choose an audio file first.'}),aiQuota('voice'),async(req,res)=>{res.json(await telemetry.traced('gen_ai.execute_tool','ElevenLabs / transcribe brief',()=>transcribe(config,req.file)));});
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
