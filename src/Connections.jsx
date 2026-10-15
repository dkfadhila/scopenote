import { useState } from 'react';
import { ArrowRight, CheckCircle, X } from '@phosphor-icons/react';
export function Connections({dialogRef,services,state,checking,error,password,setPassword,connect,unlock,request}){
  const [database,setDatabase]=useState(''),[testing,setTesting]=useState(false);
  async function checkDatabase(){setTesting(true);try{await request('/api/check-database');setDatabase('Connected: MongoDB answered the database check.');}catch(e){setDatabase(e.message);}finally{setTesting(false);}}
  async function logout(){try{await request('/api/session',{method:'DELETE'});await connect();}catch(e){setDatabase(e.message);}}
  return <dialog ref={dialogRef} className="modal connections-modal" aria-labelledby="connections-title">
    <form method="dialog"><button className="modal-close icon-button" aria-label="Close settings"><X size={20}/></button></form>
    <h2 id="connections-title">Workspace connections</h2>
    <p>Service credentials are configured on the server. “Configured” means credentials are present; it does not confirm quota or successful execution.</p>
    {state?.passwordRequired&&!state.authenticated&&<form className="unlock-form" onSubmit={unlock}><label>Workspace password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="button dark" type="submit">Unlock workspace <ArrowRight size={16}/></button></form>}
    <div className="service-list">{services.map(service=><div key={service.id}><span>{service.name}</span><span className={service.configured?'service-configured':'service-missing'}>{service.id==='mastra'?'Loaded':service.id==='render'?(service.configured?'On Render':'Local preview'):service.configured?'Configured':'Not configured'}</span></div>)}</div>
    <div className="connection-actions"><button className="button dark" disabled={checking} onClick={connect}>{checking?'Checking backend…':'Refresh configuration'}</button>{state?.storage==='mongodb'&&state.authenticated&&<button className="button ghost" disabled={testing} onClick={checkDatabase}>{testing?'Testing…':'Test database'}</button>}</div>
    {error&&<p className="inline-error" role="alert">{error}</p>}{database&&<p role="status" className="database-result">{database}</p>}
    {state?.passwordRequired&&state.authenticated&&<button className="text-button logout" onClick={logout}>Lock workspace</button>}
    <p className="modal-footnote">Text briefs are sent to the Gemma provider. Uploaded voice notes are sent to ElevenLabs. Saved projects use {state?.storage==='mongodb'?'MongoDB Atlas':'this browser until MongoDB is configured'}. Tracing omits raw brief and proposal content.</p>
  </dialog>;
}
