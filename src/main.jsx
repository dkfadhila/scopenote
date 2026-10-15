import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { DownloadSimple as ArrowDownTray, ArrowRight, ArrowUpRight, BookOpen, Check, CheckCircle, Circle, Copy, FileText, FolderSimple, GearSix, Microphone, NotePencil, Plus, ShieldCheck, SlidersHorizontal, Trash, X } from '@phosphor-icons/react';
import '@fontsource-variable/dm-sans';
import '@fontsource/instrument-serif/400.css';
import './style.css';
import { Connections } from './Connections';
import { estimate, proposalText, sampleBrief, sampleScope, scopeSchema } from './domain';

const spring={type:'spring',stiffness:280,damping:28};
const money=(value,currency)=>new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:0}).format(value);
const initial={id:'tanah-example',client:'Tanah Studio',project:'A home for handmade things',brief:sampleBrief,scope:sampleScope,rate:65,buffer:15,currency:'USD',source:'example',model:''};
function readSaved(){try{const data=JSON.parse(localStorage.getItem('scopenote-projects')||'[]');return Array.isArray(data)?data.filter(p=>p&&typeof p.id==='string'&&typeof p.brief==='string'&&typeof p.project==='string'&&typeof p.client==='string'&&Number.isFinite(p.rate)&&p.rate>=0&&Number.isFinite(p.buffer)&&p.buffer>=0&&['USD','EUR','IDR','GBP'].includes(p.currency)&&(!p.scope||scopeSchema.safeParse(p.scope).success)):[];}catch{return [];}}

function App(){
  const [saved,setSaved]=useState(readSaved);
  const [work,setWork]=useState(initial);
  const [page,setPage]=useState('workspace');
  const [tab,setTab]=useState('scope');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [model,setModel]=useState('');
  const [checking,setChecking]=useState(false);
  const [connectionError,setConnectionError]=useState('');
  const [storageError,setStorageError]=useState(false);
  const [services,setServices]=useState([]),[serviceState,setServiceState]=useState(null);
  const [saving,setSaving]=useState(false),[transcribing,setTranscribing]=useState(false),[password,setPassword]=useState('');
  const audioInput=useRef(null);
  const settings=useRef(null),newProject=useRef(null),guide=useRef(null),briefRef=useRef(null);
  const [newName,setNewName]=useState(''),[newClient,setNewClient]=useState('');
  const [newError,setNewError]=useState('');
  useEffect(()=>{connect();},[]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),3800);return()=>clearTimeout(timer);},[notice]);
  const update=(patch)=>setWork(w=>({...w,...patch}));
  const toast=(text)=>setNotice(text);
  async function request(path,options){
    const response=await fetch(path,options);let data;try{data=await response.json();}catch{throw new Error('Backend is unavailable. Run npm run dev to start both servers.');}
    if(!response.ok)throw new Error(data.error||'Request failed.');return data;
  }
  async function save(){
    if(!work.project.trim()||!work.client.trim()){setError('Add a project name and client before saving.');return;}
    if(work.scope&&!scopeSchema.safeParse(work.scope).success){setError('Complete the overview, deliverable titles and questions before saving. Hours must be between 0.25 and 500.');return;}
    const entry={...work,updatedAt:new Date().toISOString()};
    if(serviceState?.storage==='mongodb'){
      setSaving(true);try{const data=await request(`/api/projects/${encodeURIComponent(work.id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)});setWork(data.project);setSaved(list=>[data.project,...list.filter(p=>p.id!==work.id)]);toast('Draft saved to MongoDB.');setStorageError(false);}catch(e){setError(e.message);setStorageError(true);}finally{setSaving(false);}return;
    }
    const list=[entry,...saved.filter(p=>p.id!==work.id)];
    try{localStorage.setItem('scopenote-projects',JSON.stringify(list));setSaved(list);setStorageError(false);toast('Draft saved in this browser.');}catch{setStorageError(true);setError('Browser storage is full or unavailable. Export your proposal to keep a copy.');}
  }
  async function connect(){
    setChecking(true);setConnectionError('');
    try{const data=await request('/api/status');setServiceState(data);setServices(data.services);if(data.passwordRequired&&!data.authenticated)setWork(initial);setModel(data.services.find(s=>s.id==='gemma'&&s.configured)?.name||'');if(data.storage==='mongodb'){setSaved([]);if(data.authenticated){const projects=await request('/api/projects');setSaved(projects.projects);}}else{setSaved(readSaved());}}
    catch(e){setConnectionError(e.message||'Could not connect to the backend.');}finally{setChecking(false);}
  }
  async function unlock(e){e.preventDefault();setConnectionError('');try{await request('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});setPassword('');await connect();}catch(e){setConnectionError(e.message);}}
  async function uploadAudio(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>12*1024*1024){setError('Choose a voice note under 12 MB.');return;}
    if(work.brief.trim()&&!window.confirm('Replace the current brief with the transcript?'))return;
    setTranscribing(true);setError('');
    try{const body=new FormData();body.append('audio',file);const data=await request('/api/transcribe',{method:'POST',body});update({brief:data.text,scope:null,source:'manual'});toast('Voice note transcribed. Review the text before drafting a scope.');}catch(e){setError(e.message);}finally{setTranscribing(false);}
  }
  async function generate(){
    setError('');
    if(work.brief.trim().length<30){setError('Add a little more detail — at least 30 characters.');briefRef.current?.focus();return;}
    if(!model||serviceState?.authenticated===false){settings.current.showModal();return;}
    const requestProjectId=work.id,requestBrief=work.brief;
    setLoading(true);
    try{const data=await request('/api/scope',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({brief:work.brief})});setWork(current=>current.id===requestProjectId&&current.brief===requestBrief?{...current,scope:data.scope,source:'model',model:data.model}:current);setTab('scope');toast(`Scope drafted in ${(data.durationMs/1000).toFixed(1)}s. Review the scope and hours.`);}
    catch(e){setError(e.message||'Could not generate a scope. Please try again.');}finally{setLoading(false);}
  }
  function loadExample(){update({...initial,id:crypto.randomUUID()});setError('');setTab('scope');toast('Loaded the Tanah Studio example. No model was used.');}
  function create(e){e.preventDefault();if(!newName.trim()||!newClient.trim()){setNewError('Both fields are required.');return;}setWork({...initial,id:crypto.randomUUID(),project:newName.trim(),client:newClient.trim(),brief:'',scope:null,source:'manual',model:''});setPage('workspace');setTab('scope');setNewName('');setNewClient('');setNewError('');setError('');newProject.current.close();setTimeout(()=>briefRef.current?.focus(),100);}
  function exportProposal(){if(!work.scope)return;const blob=new Blob([proposalText(work)],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${work.project.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'proposal'}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Proposal exported as Markdown.');}
  async function copyProposal(){try{await navigator.clipboard.writeText(proposalText(work));toast('Proposal copied to clipboard.');}catch{toast('Clipboard unavailable. Use Export instead.');}}
  async function remove(id){if(!window.confirm('Remove this saved draft?'))return;const list=saved.filter(p=>p.id!==id);try{if(serviceState?.storage==='mongodb'){await request(`/api/projects/${encodeURIComponent(id)}`,{method:'DELETE'});}else localStorage.setItem('scopenote-projects',JSON.stringify(list));setSaved(list);toast('Saved draft removed.');}catch(e){toast(e.message||'Could not update storage.');}}
  const scope=work.scope;
  const stats=scope?estimate(scope.deliverables,work.rate,work.buffer):{hours:0,total:0};
  const openDraft=(p)=>{setWork(p);setPage('workspace');setError('');setTab('scope');};

  return <MotionConfig reducedMotion="user" transition={spring}>
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" aria-label="ScopeNote home" onClick={()=>setPage('workspace')}><span className="brand-mark"><NotePencil size={24} weight="bold"/></span><span>scope<span className="brand-light">note</span><span className="brand-dot">.</span></span></button>
        <button className="workspace-switch" onClick={()=>guide.current.showModal()}><span className="avatar">DT</span><span>Personal workspace<small>Independent by choice</small></span><SlidersHorizontal size={15}/></button>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button className={page==='workspace'?'nav-item active':'nav-item'} onClick={()=>setPage('workspace')}><NotePencil size={19}/>Scope builder<ArrowUpRight size={15}/></button>
          <button className={page==='drafts'?'nav-item active':'nav-item'} onClick={()=>setPage('drafts')}><FolderSimple size={19}/>Saved drafts<span className="count">{saved.length}</span></button>
        </nav>
        <div className="sidebar-section-label recent-label">RECENT PROJECTS<button aria-label="Create project" onClick={()=>newProject.current.showModal()}><Plus size={15}/></button></div>
        <div className="recent-list">{saved.length?saved.slice(0,4).map(p=><button key={p.id} onClick={()=>openDraft(p)}><span className="project-dot"/>{p.client}</button>):<><button onClick={()=>{setWork(initial);setPage('workspace');}}><span className="project-dot"/>Tanah Studio<span className="example-label">Example</span></button><span className="recent-empty">Your next good project goes here.</span></>}</div>
        <div className="sidebar-bottom">
          <div className="privacy-card"><ShieldCheck size={22} weight="duotone"/><strong>Review before sharing.</strong><p>Your scope is a draft.<br/>Every commitment stays yours.</p><button onClick={()=>guide.current.showModal()}>How it works <ArrowUpRight size={14}/></button></div>
          <button className="nav-item" onClick={()=>settings.current.showModal()}><GearSix size={19}/>Connections<span className={model?'connection-dot connected':'connection-dot'}/></button>
          <div className="profile"><span className="avatar profile-avatar">DT</span><span>Decka Tirta<small>Personal workspace</small></span><span className="version">v0.1</span></div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="slash">/</span><strong>{page==='workspace'?'Scope builder':'Saved drafts'}</strong></div><div className="top-actions"><button className="text-button guide-button" onClick={()=>guide.current.showModal()}><BookOpen size={17}/> Quick guide</button><button className="button small dark" onClick={()=>newProject.current.showModal()}><Plus size={16}/> New project</button></div></header>
        <main>
          {page==='workspace'?<>
            <motion.section className="intro workbench-intro" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}><div><h1>Scope builder</h1><p>Bring the brief. Review the scope. Send a clear proposal.</p></div><button className="text-button" onClick={()=>settings.current.showModal()}><span className={model?'connection-dot connected':'connection-dot'}/>{model?'Gemma configured':'Set up Gemma'}<ArrowUpRight size={15}/></button></motion.section>

            <section className="project-heading"><div className="project-title"><span className="client-monogram">{work.client.slice(0,1).toUpperCase()}</span><div><div className="client-name">{work.client}</div><h2>{work.project}</h2></div></div><div className="project-actions"><span className="status"><span/>{work.source==='example'?'Example project':'Working draft'}</span><button className="button ghost small" disabled={saving} onClick={save}><FileText size={16}/> {saving?'Saving…':'Save draft'}</button></div></section>
            <div className="workspace-grid">
              <motion.section className="brief-panel panel" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{...spring,delay:.07}}>
                <div className="panel-title"><div><span className="step">01</span><h3>The client brief</h3></div><span className="small-note">Start with the messy version.</span></div>
                <div className="brief-body"><div className="field-row"><label>Client<input value={work.client} maxLength={100} onChange={e=>update({client:e.target.value})}/></label><label>Project name<input value={work.project} maxLength={150} onChange={e=>update({project:e.target.value})}/></label></div>
                  <label className="brief-label" htmlFor="brief">What did they have in mind?<span>Email, meeting notes, or a very long message.</span></label>
                  <textarea disabled={loading||transcribing} ref={briefRef} id="brief" value={work.brief} maxLength={20000} onChange={e=>{update({brief:e.target.value,scope:null,source:'manual'});setError('');}} placeholder="Paste the client’s brief here. What do they need, what do you know, and what’s still a question?"/>
                  <div className="voice-import"><input ref={audioInput} type="file" accept="audio/*,video/webm" aria-label="Voice brief file" hidden onChange={uploadAudio}/><button className="button ghost small" disabled={transcribing||loading} onClick={()=>audioInput.current.click()}><Microphone size={17}/>{transcribing?'Transcribing voice note…':'Import voice brief'}</button><span>MP3, WAV, M4A · up to 12 MB · ElevenLabs</span></div>
                  <div className="textarea-footer"><span><ShieldCheck size={14}/> Gemma via your workspace backend</span><span>{work.brief.length.toLocaleString()} / 20,000</span></div>
                  <div className="brief-help"><span className="help-symbol">i</span><p>You don’t need a perfect brief. Unclear details become questions to ask, not promises to keep.</p></div>
                  <AnimatePresence>{error&&<motion.div className="inline-error" role="alert" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>{error}</motion.div>}</AnimatePresence>
                  <button className="button accent generate" disabled={loading||transcribing} onClick={generate}><NotePencil size={19}/>{loading?'Drafting with Gemma…':'Shape this into a scope'}{!loading&&<ArrowRight size={18}/>}</button>
                  <button className="example-button" onClick={loadExample} disabled={loading}>Just looking around? <span>Try an example <ArrowUpRight size={13}/></span></button>
                </div>
                <div className="brief-bottom"><span className={model?'connection-dot connected':'connection-dot'}/><button onClick={()=>settings.current.showModal()}>{model?'Gemma configured · verify with a real brief':'Configure Gemma in Connections'}</button><ArrowUpRight size={14}/></div>
              </motion.section>

              <motion.section className="scope-panel panel" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{...spring,delay:.13}}>
                <div className="panel-title"><div><span className="step">02</span><h3>Your working scope</h3></div><span className="review-note"><Circle size={7} weight="fill"/> Yours to refine</span></div>
                <div className="tabs" role="tablist" aria-label="Output view">{[['scope','Scope of work'],['questions',`Questions${scope?` (${scope.questions.length})`:''}`],['proposal','Proposal preview']].map(([id,label])=><button role="tab" aria-selected={tab===id} aria-controls="output-panel" id={`tab-${id}`} key={id} onClick={()=>setTab(id)} className={tab===id?'selected':''}>{label}{tab===id&&<motion.span className="tab-line" layoutId="active-tab"/>}</button>)}</div>
                <div role="tabpanel" id="output-panel" aria-labelledby={`tab-${tab}`} className="output-body" aria-live="polite" aria-busy={loading}>
                  {loading?<div className="loading-state"><div className="loading-lines">{[92,72,86,54,80].map((w,i)=><motion.div key={i} style={{width:`${w}%`}} animate={{opacity:[.35,.8,.35]}} transition={{duration:1.5,repeat:Infinity,delay:i*.1}}/>)}</div><h4>Making room for the details.</h4><p>Gemma is reading your brief through the Mastra workflow. Keep this page open while it runs.</p></div>:!scope?<div className="empty-state"><FileText size={48} weight="thin"/><h4>A blank page, in a good way.</h4><p>Add a brief and configure Gemma to generate a scope. The labeled example is also available.</p><button className="button ghost" onClick={loadExample}>Explore the example <ArrowRight size={16}/></button></div>:<AnimatePresence mode="wait"><motion.div key={`${tab}-${work.id}`} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} transition={{duration:.18}}>
                    {tab==='scope'?<><div className="scope-summary"><span className="document-kicker">PROJECT OVERVIEW</span><textarea className="scope-editor" aria-label="Project overview" rows={3} value={scope.summary} onChange={e=>update({scope:{...scope,summary:e.target.value}})}/></div><div className="deliverable-head"><h4>Deliverables</h4><span>EST. HOURS</span></div><div className="deliverables">{scope.deliverables.map((d,i)=><div className="deliverable" key={i}><span className="deliverable-number">{String(i+1).padStart(2,'0')}</span><div><input aria-label={`Deliverable ${i+1} title`} className="editable-title" value={d.title} onChange={e=>update({scope:{...scope,deliverables:scope.deliverables.map((row,j)=>j===i?{...row,title:e.target.value}:row)}})}/><textarea className="scope-editor" aria-label={`Details for ${d.title}`} rows={2} value={d.detail} onChange={e=>update({scope:{...scope,deliverables:scope.deliverables.map((row,j)=>j===i?{...row,detail:e.target.value}:row)}})}/></div><label className="hours-input"><input aria-label={`Hours for ${d.title}`} type="number" min="0.25" max="500" step="0.25" value={d.hours} onChange={e=>{const n=Number(e.target.value);if(n>=.25&&n<=500)update({scope:{...scope,deliverables:scope.deliverables.map((row,j)=>j===i?{...row,hours:n}:row)}});}}/><span>h</span></label></div>)}</div><div className="scope-caveat"><CheckCircle size={15}/><span>{work.source==='example'?'Illustrative example. No AI was used to produce this sample.':'Model-generated draft. Check the scope and hours before sharing.'}</span></div></>:tab==='questions'?<div className="questions-view"><span className="document-kicker">BEFORE YOU SAY YES</span><h4>A few things to ask.</h4><p className="muted">Close these gaps with your client before agreeing on the work.</p>{scope.questions.map((q,i)=><div className="question" key={i}><input type="checkbox" aria-label={`Question ${i+1} resolved`}/><textarea className="scope-editor" aria-label={`Clarification question ${i+1}`} rows={2} value={q} onChange={e=>update({scope:{...scope,questions:scope.questions.map((v,j)=>j===i?e.target.value:v)}})}/></div>)}<h4 className="exclusions-title">Outside this scope</h4>{scope.exclusions.map((x,i)=><div className="exclusion" key={i}><X size={14}/><textarea className="scope-editor" aria-label={`Exclusion ${i+1}`} rows={2} value={x} onChange={e=>update({scope:{...scope,exclusions:scope.exclusions.map((v,j)=>j===i?e.target.value:v)}})}/></div>)}</div>:<div className="proposal-view"><div className="proposal-meta"><span>PROPOSAL / WORKING DRAFT</span><button className="icon-button" aria-label="Copy proposal" onClick={copyProposal}><Copy size={16}/></button></div><h4>{work.project}</h4><p className="prepared-for">Prepared for {work.client}</p><p>{scope.summary}</p><h5>Scope of work</h5>{scope.deliverables.map(d=><p key={d.title}><strong>{d.title}</strong><br/>{d.detail}</p>)}<div className="proposal-price"><span>Estimated project fee</span><strong>{money(stats.total,work.currency)}</strong></div><h5>Before work begins</h5><p>Confirm open questions, schedule, and payment terms together. This estimate includes {work.buffer}% contingency. Additional deliverables require a separate estimate.</p><h5>Questions to resolve</h5><ul>{scope.questions.map(q=><li key={q}>{q}</li>)}</ul><h5>Outside this scope</h5><ul>{scope.exclusions.map(x=><li key={x}>{x}</li>)}</ul></div>}
                  </motion.div></AnimatePresence>}
                </div>
                <div className="output-footer"><span><Check size={14}/> Review it. Make it yours.</span><button className="text-button" disabled={!scope||loading} onClick={exportProposal}>Export proposal <ArrowDownTray size={16}/></button></div>
              </motion.section>
              <section className="estimate-panel panel"><div className="estimate-intro"><div className="panel-title compact"><div><span className="step">03</span><h3>Put a number on it.</h3></div></div><p>A starting point, with a little breathing room.</p></div><div className="estimate-fields"><label>Hourly rate<div className="input-affix"><span>{work.currency==='IDR'?'Rp':work.currency==='EUR'?'€':work.currency==='GBP'?'£':'$'}</span><input type="number" min="0" max="100000000" aria-label="Hourly rate" value={work.rate} onChange={e=>update({rate:Math.min(100000000,Math.max(0,Number(e.target.value)))})}/><select aria-label="Currency" value={work.currency} onChange={e=>update({currency:e.target.value})}>{['USD','EUR','GBP','IDR'].map(c=><option key={c}>{c}</option>)}</select></div></label><label>Contingency<div className="input-affix"><input type="number" min="0" max="100" value={work.buffer} aria-label="Contingency percentage" onChange={e=>update({buffer:Math.min(100,Math.max(0,Number(e.target.value)))})}/><span>%</span></div></label></div><div className="estimate-total"><span>{stats.hours} hours + {work.buffer}% buffer</span><strong>{money(stats.total,work.currency)}<small> estimated</small></strong></div></section>
            </div>
            <footer className="page-footer"><span>A small tool for independent work.</span><span>Built around open models.<span className="footer-dot">·</span><button onClick={()=>guide.current.showModal()}>About ScopeNote <ArrowUpRight size={12}/></button></span></footer>
          </>:<section className="drafts-page"><div className="eyebrow">YOUR WORK, IN PROGRESS</div><h1>Good things take drafts.</h1><p className="muted">{serviceState?.storage==='mongodb'?'Projects saved to your private MongoDB workspace.':'Drafts saved in this browser. Configure MongoDB for server storage.'}</p><button className="text-button" onClick={connect}>Refresh saved drafts</button>{storageError&&<p role="alert">Browser storage is currently unavailable.</p>}{saved.length?<div className="draft-list">{saved.map(p=><article key={p.id}><div className="draft-initial">{p.client[0]}</div><div><h2>{p.project}</h2><p>{p.client} · {p.scope?`${p.scope.deliverables.length} deliverables`:'No scope yet'} · {new Date(p.updatedAt).toLocaleDateString()}</p></div><button className="button ghost small" onClick={()=>openDraft(p)}>Open draft <ArrowUpRight size={15}/></button><button className="icon-button" aria-label={`Remove saved draft ${p.project}`} onClick={()=>remove(p.id)}><Trash size={17}/></button></article>)}</div>:<div className="drafts-empty"><FolderSimple size={50} weight="thin"/><h2>Your first draft belongs here.</h2><p>Save a project from the scope builder to pick it up later.</p><button className="button dark" onClick={()=>setPage('workspace')}>Back to the builder <ArrowRight size={16}/></button></div>}</section>}
        </main>
      </div>
    </div>
    <Connections dialogRef={settings} services={services} state={serviceState} checking={checking} error={connectionError} password={password} setPassword={setPassword} connect={connect} unlock={unlock} request={request}/>
    <dialog ref={newProject} className="modal"><form method="dialog"><button className="modal-close icon-button" aria-label="Close new project"><X size={20}/></button></form><NotePencil size={28}/><h2>Every good project starts here.</h2><form onSubmit={create}><label>Client name<input required maxLength={100} value={newClient} onChange={e=>setNewClient(e.target.value)} placeholder="Who are you working with?"/></label><label>Project name<input required maxLength={150} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Give this one a name"/></label>{newError&&<p className="inline-error" role="alert">{newError}</p>}<button className="button dark" type="submit">Create project <ArrowRight size={16}/></button></form></dialog>
    <dialog ref={guide} className="modal guide"><form method="dialog"><button className="modal-close icon-button" aria-label="Close guide"><X size={20}/></button></form><BookOpen size={28}/><h2>Less admin.<br/>More independent work.</h2><p>ScopeNote helps freelance designers and developers turn early conversations into a concrete starting point.</p><ol><li><strong>Bring the brief.</strong> Paste the client’s message, notes, or requirements.</li><li><strong>Shape the scope.</strong> Try the labeled example, or configure Gemma to draft from your own brief.</li><li><strong>Make it yours.</strong> Review deliverables, adjust hours and rate, then export a Markdown proposal.</li></ol><p>Drafts are stored only when you press Save draft. MongoDB is used when configured; otherwise drafts stay in this browser. Text briefs go to the configured Gemma service, and uploaded voice notes go to ElevenLabs. The sample is fictional. No customer results or measured time savings are claimed.</p><p className="modal-footnote">Prototype for the Hacktoberfest 2026 Week 2 Side Hustle challenge. Model output is a planning aid, not a client agreement.</p></dialog>
    <AnimatePresence>{notice&&<motion.div className="toast" role="status" initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} exit={{opacity:0,y:12}}><CheckCircle size={18}/>{notice}</motion.div>}</AnimatePresence>
  </MotionConfig>;
}

createRoot(document.getElementById('root')).render(<App/>);
