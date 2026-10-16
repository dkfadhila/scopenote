import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig, motion, AnimatePresence } from 'motion/react';
import { NotePencil, Plus, ArrowRight, ArrowLeft, FolderSimple, FileText, Microphone, Check, CheckCircle, LockSimple, SignOut, GearSix, MagnifyingGlass, DownloadSimple, Copy, X, EnvelopeSimple, Eye, EyeSlash, ArrowUpRight, CaretDown, Clock, Trash, PaperPlaneTilt, Question, Flask, Globe } from '@phosphor-icons/react';
import '@fontsource-variable/dm-sans';
import { estimate, proposalText } from '../domain';
import './style.css';
const blankProject = {
  id: crypto.randomUUID(),
  client: '',
  project: '',
  brief: '',
  scope: null,
  rate: 65,
  buffer: 15,
  currency: 'USD',
  source: 'manual',
  model: '',
  revision: 0
};
const currency = (n, code = 'USD') => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: code,
  maximumFractionDigits: 0
}).format(n);
function App() {
  const [page, setPage] = useState('Sign in'),
    [work, setWork] = useState(structuredClone(blankProject));
  const [projects, setProjects] = useState([]),
    [plan, setPlan] = useState('Free'),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('All projects');
  const [modal, setModal] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [reviewTab, setReviewTab] = useState('Deliverables');
  const [email, setEmail] = useState(''),
    [resetStep, setResetStep] = useState('request'),
    [showPassword, setShowPassword] = useState(false);
  const [newClient, setNewClient] = useState(''),
    [newTitle, setNewTitle] = useState(''),
    [name, setName] = useState('');
  const [fileName, setFileName] = useState(''),
    [authError, setAuthError] = useState(''),
    [user, setUser] = useState(null),
    [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState({
      scopes: 0,
      voice: 0
    }),
    [publicRead, setPublicRead] = useState(false),
    [saved, setSaved] = useState(false),
    [history, setHistory] = useState([]),
    [pendingAudio, setPendingAudio] = useState(null);
  const [loadError, setLoadError] = useState(''),
    [resetToken, setResetToken] = useState(''),
    [emailEnabled, setEmailEnabled] = useState(false),
    [publicProjects, setPublicProjects] = useState([]),
    [exportBusy, setExportBusy] = useState(false),
    [exportError, setExportError] = useState('');
  const toast = text => {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 6500);
  };
  const go = next => {
    if (!publicRead && !saved && ['Brief', 'Review scope', 'Proposal'].includes(page) && ['Projects', 'Plans'].includes(next) && !window.confirm('Leave without saving your latest changes?')) return;
    setPage(next);
    if(!['Brief','Review scope','Proposal'].includes(next))window.history.replaceState(null,'',location.pathname+(next==='Public drafts'?'#gallery':''));
    setAuthError('');
    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
  };
  async function api(path, options = {}) {
    const headers = options.body instanceof FormData ? {} : {
      'Content-Type': 'application/json'
    };
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...headers,
        ...options.headers
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        setUser(null);
        setProjects([]);
        setPublicRead(false);
        go('Sign in');
      }
      throw new Error(data.error || 'Something went wrong. Please try again.');
    }
    return data;
  }
  const displayProject = p => ({
    ...p,
    date: p.updatedAt ? new Date(p.updatedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    }) : 'Unsaved',
    stage: p.scope ? 'Review scope' : 'Brief added'
  });
  async function refreshProjects() {
    const data = await api('/api/projects');
    setProjects((data.projects || []).map(displayProject));
    setLoadError('');
  }
  async function refreshAccount() {
    const data = await api('/api/account');
    setUser(data.user || null);
    setEmailEnabled(!!data.emailEnabled);
    setUsage(data.usage || {
      scopes: 0,
      voice: 0
    });
    if (data.user) {
      setName(data.user.name);
      setEmail(data.user.email);
      setPlan(data.user.plan || 'Free');
    }
    return data;
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const hash = new URLSearchParams(location.hash.slice(1)),
          token = hash.get('reset'),
          verify = hash.get('verify'),
          share = hash.get('public');
        if (token || verify) window.history.replaceState(null, '', location.pathname);
        const account = await refreshAccount();
        if (!active) return;
        if (token) {
          setResetToken(token);
          setResetStep('new');
          go('Forgot password');
        } else if (verify) {
          try {
            await api('/api/account/verify-email', {
              method: 'POST',
              body: JSON.stringify({
                token: verify
              })
            });
            await refreshAccount();
            toast('Email verified.');
            go(account.user ? 'Projects' : 'Sign in');
          } catch (e) {
            setAuthError(e.message);
          }
        } else if (share) await openPublic(share);else if (location.hash === '#gallery') await gallery();else if (account.user) go('Projects');
        if (account.user) await refreshProjects();
      } catch (e) {
        if (active) setLoadError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement,
      dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return;
    const focusable = () => [...dialog.querySelectorAll('button:not(:disabled),input,select,textarea,a[href]')];
    (dialog.querySelector('input') || focusable()[0])?.focus();
    const trap = e => {
      if (e.key === 'Escape') {
        setModal('');
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', trap);
      document.body.style.overflow = scroll;
      previous?.focus();
    };
  }, [modal]);
  useEffect(() => {
    const warn = e => {
      if (!saved && ['Brief', 'Review scope', 'Proposal'].includes(page)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saved, page]);
  const stats = work.scope ? estimate(work.scope.deliverables, work.rate, work.buffer) : {
    hours: 0,
    total: 0
  };
  const update = patch => {
    if (publicRead) return;
    setWork(w => ({
      ...w,
      ...patch
    }));
    setSaved(false);
  };
  const open = p => {
    setWork(structuredClone(p));
    setPublicRead(false);
    setSaved(true);
    setFileName('');
    go(p.scope ? 'Review scope' : 'Brief');
  };
  async function gallery() {
    if (!saved && !publicRead && ['Brief', 'Review scope', 'Proposal'].includes(page) && !window.confirm('Leave without saving?')) return;
    setPage('Public drafts');
    setLoadError('');
    setBusy(true);
    window.history.replaceState(null, '', location.pathname + '#gallery');
    try {
      const data = await api('/api/public/projects');
      setPublicProjects(data.projects || []);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function openPublic(shareId) {
    setBusy(true);
    setLoadError('');
    try {
      const data = await api('/api/public/projects/' + encodeURIComponent(shareId));
      setWork({
        ...data.project,
        client: data.project.client || '',
        revision: 0
      });
      setPublicRead(true);
      setSaved(true);
      setPage(data.project.scope ? 'Review scope' : 'Brief');
      window.history.replaceState(null, '', location.pathname + '#public=' + encodeURIComponent(shareId));
      window.scrollTo(0, 0);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!user || publicRead) return;
    if (!work.client.trim() || !work.project.trim()) {
      toast('Add a client and project name before saving.');
      return;
    }
    setBusy(true);
    try {
      const data = await api('/api/projects/' + work.id, {
        method: 'PUT',
        body: JSON.stringify({
          ...work
        })
      });
      const entry = displayProject(data.project);
      setWork(entry);
      setProjects(list => [entry, ...list.filter(p => p.id !== entry.id)]);
      setSaved(true);
      setModal('');
      toast(entry.visibility === 'public' ? 'Public draft and scope saved. Anyone can read them.' : 'Private project saved.');
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  function newProject(e) {
    e.preventDefault();
    if (!user) {
      setModal('');
      go('Create account');
      return;
    }
    setPublicRead(false);
    setSaved(false);
    setFileName('');
    setWork({
      ...structuredClone(blankProject),
      id: crypto.randomUUID(),
      client: newClient.trim(),
      project: newTitle.trim(),
      brief: '',
      scope: null,
      source: 'manual',
      revision: 0,
      visibility: plan === 'Premium' ? 'private' : 'public',
      date: 'Unsaved'
    });
    setModal('');
    setNewClient('');
    setNewTitle('');
    go('Brief');
  }
  async function generate() {
    if (work.brief.trim().length < 30) {
      toast('Add at least 30 characters to the brief.');
      return;
    }
    if (publicRead) return;
    setBusy(true);
    try {
      const data = await api('/api/scope', {
        method: 'POST',
        body: JSON.stringify({
          brief: work.brief
        })
      });
      update({
        scope: data.scope,
        model: data.model || '',
        source: 'model'
      });
      await refreshAccount();
      go('Review scope');
      toast('Scope created. Review the details before sharing.');
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function transcribe(file) {
    if (!file || publicRead || !user) return;
    if (file.size > 12 * 1024 * 1024) {
      toast('Choose an audio file smaller than 12 MB.');
      return;
    }
    setBusy(true);
    setPendingAudio(null);
    try {
      const form = new FormData();
      form.append('audio', file);
      const data = await api('/api/transcribe', {
        method: 'POST',
        body: form
      });
      update({
        brief: data.text,
        scope: null,
        source: 'manual'
      });
      setFileName(file.name);
      await refreshAccount();
      toast('Transcript added. Review it before creating a scope.');
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  function chooseAudio(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (work.brief.trim()) {
      setPendingAudio(file);
      setModal('replace-audio');
    } else transcribe(file);
  }
  const exportName=extension=>[work.project||'scopenote',work.client].filter(Boolean).join('-').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()+'.'+extension;
  const proposalDocument=()=>proposalText(work).replace(/^Prepared for \s*$/m, '')+'\n\n---\nMade with ScopeNote\n';
  async function downloadPdf(){
    if(!work.scope||exportBusy)return;setExportBusy(true);setExportError('');
    try{const {createProposalPdf}=await import('../proposal-pdf.js');const bytes=await createProposalPdf(work);const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download=exportName('pdf');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('PDF proposal downloaded.');}
    catch(error){setExportError(error.message||'The PDF could not be created. Try again, or download the Markdown proposal.');}
    finally{setExportBusy(false);}
  }
  function download() {
    const text = proposalDocument();
    const url = URL.createObjectURL(new Blob([text], {
      type: 'text/markdown'
    }));
    const a = document.createElement('a');
    a.href = url;
    a.download = exportName('md');
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Markdown proposal downloaded.');
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(proposalDocument());
      toast('Proposal copied.');
    } catch {
      toast('Clipboard unavailable. Download the proposal instead.');
    }
  }
  async function authenticate(e) {
    e.preventDefault();
    setAuthError('');
    const form = new FormData(e.currentTarget),
      password = String(form.get('password') || '');
    if (page === 'Create account' && password.length < 10) {
      setAuthError('Use at least 10 characters for your password.');
      return;
    }
    setBusy(true);
    try {
      await api('/api/account/' + (page === 'Create account' ? 'register' : 'login'), {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name') || ''),
          email,
          password
        })
      });
      await refreshAccount();
      await refreshProjects();
      setPublicRead(false);
      go('Projects');
    } catch (e) {
      setAuthError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function forgot(e) {
    e?.preventDefault();
    setAuthError('');
    setBusy(true);
    try {
      await api('/api/account/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          email
        })
      });
      setResetStep('email');
    } catch (e) {
      setAuthError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword(e) {
    e.preventDefault();
    setAuthError('');
    const form = new FormData(e.currentTarget),
      password = String(form.get('password') || '');
    if (password !== form.get('confirm')) {
      setAuthError('Both passwords need to match.');
      return;
    }
    setBusy(true);
    try {
      await api('/api/account/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token: resetToken,
          password
        })
      });
      setResetStep('done');
      setResetToken('');
      setUser(null);
      setProjects([]);
    } catch (e) {
      setAuthError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await api('/api/account/logout', {
        method: 'POST'
      });
      setUser(null);
      setProjects([]);
      setPublicRead(false);
      setModal('');
      setWork(structuredClone(blankProject));
      setEmail('');
      go('Sign in');
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveProfile() {
    setBusy(true);
    try {
      await api('/api/account', {
        method: 'PATCH',
        body: JSON.stringify({
          name
        })
      });
      await refreshAccount();
      setModal('');
      toast('Profile updated.');
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteProject(p) {
    setBusy(true);
    try {
      await api('/api/projects/' + p.id, {
        method: 'DELETE'
      });
      setProjects(list => list.filter(v => v.id !== p.id));
      setModal('');
      toast('Project deleted.');
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function showHistory() {
    setBusy(true);
    try {
      const data = await api('/api/projects/' + work.id + '/history');
      setHistory(data.history || []);
      setModal('history');
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }
  const auth = ['Sign in', 'Create account', 'Forgot password'].includes(page);
  const editor = ['Brief', 'Review scope', 'Proposal'].includes(page);
  const shown = projects.filter(p => `${p.project} ${p.client}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'All projects' || (filter === 'With a scope' ? !!p.scope : !p.scope)));
  const logo = <button className="logo" onClick={() => go(user ? 'Projects' : 'Sign in')} aria-label="ScopeNote home"><span className="logo-symbol"><NotePencil size={23} weight="bold" /></span>scopenote<span className="logo-period">.</span></button>;
  if (loading) return <div className="loading-screen" role="status"><NotePencil size={30} /><p>Opening your workspace…</p></div>;
  return <MotionConfig reducedMotion="user">
    {auth ? <div className="auth-layout"><section className="auth-main">{logo}<button className="back-link" onClick={() => {
          if (user) go('Projects');else gallery();
        }}><ArrowLeft size={15} /> {'Browse public drafts'}</button><AnimatePresence mode="wait"><motion.div className="auth-form-wrap" key={`${page}-${resetStep}`} initial={{
            opacity: 0,
            y: 8
          }} animate={{
            opacity: 1,
            y: 0
          }} exit={{
            opacity: 0
          }} transition={{
            duration: .18
          }}>{loadError && <div className="inline-alert" role="alert">{loadError}<button onClick={() => location.reload()}>Try again</button></div>}
      {page === 'Forgot password' ? <>
        <div className="auth-icon"><EnvelopeSimple size={25} /></div>
        <h1>{resetStep === 'request' ? 'Reset password.' : resetStep === 'email' ? 'Check your inbox.' : resetStep === 'new' ? 'A new password.' : 'You’re all set.'}</h1>
        <p className="auth-description">{resetStep === 'request' ? 'It happens. Enter your email and we’ll help you get back to your projects.' : resetStep === 'email' ? `If an account exists for ${email}, a reset link has been requested. Check your inbox and spam folder.` : resetStep === 'new' ? 'Use a password you haven’t used for this account before.' : 'Your password has been updated. Sign in with your new password.'}</p>
        {resetStep === 'request' ? <form onSubmit={forgot}><label>Email address<input type="email" placeholder="you@yourstudio.com" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label><button className="btn primary full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'} <ArrowRight size={17} /></button></form> : resetStep === 'email' ? <><button className="text-link" disabled={busy} onClick={forgot}>Resend email</button></> : resetStep === 'new' ? <form onSubmit={resetPassword}><label>New password<input type="password" name="password" maxLength={128} minLength={10} required autoComplete="new-password" placeholder="At least 10 characters" /></label><label>Confirm new password<input type="password" name="confirm" minLength={10} required autoComplete="new-password" placeholder="Enter it once more" /></label>{authError && <p role="alert" className="form-error">{authError}</p>}<button className="btn primary full" disabled={busy}>Reset password <ArrowRight size={17} /></button></form> : <button className="btn primary full" onClick={() => {
                setResetStep('request');
                go('Sign in');
              }}>Back to sign in <ArrowRight size={17} /></button>}
        {authError && ['request', 'email'].includes(resetStep) && <p role="alert" className="form-error">{authError}</p>}{resetStep !== 'done' && <button className="back-link centered" onClick={() => go('Sign in')}><ArrowLeft size={15} /> Back to sign in</button>}
      </> : <><h1>{page === 'Sign in' ? 'Sign in.' : 'Get started.'}</h1><p className="auth-description">{page === 'Sign in' ? 'Your briefs, scopes and proposals. Right where you left them.' : 'Start free, with no payment details. New Free client names, drafts and scopes are public when saved.'}</p><form onSubmit={authenticate}>
        {page === 'Create account' && <label>Your name<input name="name" required maxLength={80} placeholder="What should we call you?" autoComplete="name" /></label>}
        <label>Email address<input type="email" name="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourstudio.com" autoComplete="email" /></label>
        <div className="auth-password"><div className="label-row"><label htmlFor="auth-password">Password</label>{page === 'Sign in' && <button type="button" className="text-link" onClick={() => {
                      setResetStep('request');
                      go('Forgot password');
                    }}>Forgot password?</button>}</div><div className="password-field"><input id="auth-password" name="password" maxLength={128} type={showPassword ? 'text' : 'password'} required minLength={page === 'Create account' ? 10 : 1} placeholder={page === 'Create account' ? 'At least 10 characters' : 'Enter your password'} autoComplete={page === 'Create account' ? 'new-password' : 'current-password'} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}</button></div></div>
        {authError && <p role="alert" className="form-error">{authError}</p>}<button className="btn primary full" disabled={busy}>{busy ? 'Please wait…' : page === 'Sign in' ? 'Sign in' : 'Create free account'} <ArrowRight size={17} /></button><p className="form-footnote">Free includes 3 AI scopes per month. Saved client names, briefs, scopes and estimates are public when saved.</p></form>
        <p className="auth-switch">{page === 'Sign in' ? 'New to ScopeNote?' : 'Already have an account?'} <button className="text-link" onClick={() => go(page === 'Sign in' ? 'Create account' : 'Sign in')}>{page === 'Sign in' ? 'Create an account' : 'Sign in'}</button></p><div className="auth-divider"><span>read what people are working on</span></div><button className="btn outline full" onClick={gallery}>Browse public drafts <ArrowUpRight size={17} /></button>
      </>}
    </motion.div></AnimatePresence><footer className="auth-footer"><span>Made for independent work.</span><button onClick={() => go('Plans')}>Plans</button><button onClick={() => setModal('data')}>Data & privacy</button><a href="https://x.com/tirtavex" target="_blank" rel="noreferrer">X / @tirtavex <ArrowUpRight size={12} /></a></footer></section><aside className="auth-story"><h2>A good scope.<br />A clearer start.</h2><p>Turn a client’s first message into a scope you can review, price and talk through.</p><ol className="auth-process"><li><h3>Bring the brief.</h3><p>Start with a message, meeting notes or a voice recording.</p></li><li><h3>Make the scope yours.</h3><p>Review deliverables, ask the missing questions and set your rate.</p></li><li><h3>Start the conversation.</h3><p>Export a proposal and agree on the details before work begins.</p></li></ol><span className="story-caption">AI drafts. You decide.</span></aside></div> : <div className="app-layout"><header className="edition-nav">{logo}<nav aria-label="Main navigation"><button className={page === 'Public drafts' ? 'active' : ''} onClick={gallery}>Public drafts</button><button className={page === 'Projects' ? 'active' : ''} onClick={() => user ? go('Projects') : go('Sign in')}>My projects</button><button className={page === 'Plans' ? 'active' : ''} onClick={() => go('Plans')}>Plans & usage</button></nav><button className="account-link" onClick={() => {
          if (user) setModal('settings');else go('Sign in');
        }}>{user ? name : 'Sign in'}<ArrowUpRight size={18} /></button></header><div className="main-shell"><main>{user && emailEnabled && !user.emailVerified && <div className="inline-alert"><EnvelopeSimple size={18} /><span>Verify your email to create AI scopes and import voice notes.</span><button onClick={() => setModal('settings')}>Verify email</button></div>}{loadError && !publicRead && <div className="inline-alert" role="alert">{loadError}<button onClick={() => location.reload()}>Try again</button></div>}{page === 'Public drafts' ? <section className="projects-page"><div className="project-masthead"><div><h1>Public drafts</h1><p>Real briefs and full scopes shared by their authors.</p></div><div className="masthead-actions"><button className="btn outline" disabled={busy} onClick={gallery}>{busy ? 'Loading…' : 'Refresh drafts'}</button>{!user && <button className="btn ink" onClick={() => go('Create account')}>Start your own <Plus size={18} /></button>}</div></div><p className="public-gallery-note">Published client names, briefs, deliverables, questions, exclusions and estimates are readable by everyone. These are working documents, not verified advice.</p><div className="project-index">{publicProjects.map(p => <article className="index-project" key={p.shareId}><div className="index-meta"><span>{p.client ? `For ${p.client}` : 'Public draft & scope'}</span><span>{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : ''}</span></div><button className="index-title" onClick={() => openPublic(p.shareId)}><span>{p.project}</span><ArrowUpRight size={28} /></button><p>{p.summary || 'Read the shared brief and scope.'}</p><div className="index-bottom"><span>Read only</span></div></article>)}{!publicProjects.length && !busy && <div className="no-results"><h3>No public drafts yet.</h3><p>Free drafts and scopes appear here when their author saves them.</p></div>}</div></section> : page === 'Projects' ? <motion.section className="projects-page" initial="hidden" animate="shown" variants={{
            hidden: {},
            shown: {
              transition: {
                staggerChildren: .075
              }
            }
          }}><div className="project-masthead"><motion.div variants={{
                hidden: {
                  opacity: 0,
                  y: 12
                },
                shown: {
                  opacity: 1,
                  y: 0
                }
              }}><h1>My projects</h1><p>Pick up a draft, or start with a new client brief.</p></motion.div><motion.div className="masthead-actions" variants={{
                hidden: {
                  opacity: 0,
                  y: 12
                },
                shown: {
                  opacity: 1,
                  y: 0
                }
              }}><button className="btn ink" onClick={() => {
                  if (!user) go('Create account');else setModal('new');
                }}>New project <Plus size={18} /></button><button className="gallery-access" onClick={gallery}>Browse public drafts <ArrowUpRight size={16} /></button></motion.div></div><div className="project-registry"><div className="registry-main"><div className="registry-tools">{user && <button className="text-link refresh-projects" disabled={busy} onClick={async () => {
                    setBusy(true);
                    try {
                      await refreshProjects();
                      toast('Your projects are up to date.');
                    } catch (e) {
                      setLoadError(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}>Reload projects</button>}<div className="filters" role="tablist" aria-label="Project status">{['All projects', 'Briefs', 'With a scope'].map(t => <button role="tab" key={t} aria-selected={filter === t} className={filter === t ? 'selected' : ''} onClick={() => setFilter(t)}>{t}</button>)}</div><label className="search"><MagnifyingGlass size={19} /><input aria-label="Search projects" placeholder="Find a project" value={query} onChange={e => setQuery(e.target.value)} /></label></div><div className="project-index">{shown.map((p, i) => <motion.article data-ui className="index-project" key={p.id} variants={{
                    hidden: {
                      opacity: 0,
                      y: 24
                    },
                    shown: {
                      opacity: 1,
                      y: 0
                    }
                  }}><div className="index-meta"><span>{p.client}</span><span>{p.date}</span></div><button className="index-title" onClick={() => open(p)}><span>{p.project}</span><ArrowUpRight size={28} /></button><p>{p.scope ? p.scope.summary : 'A brief on the table. A scope still to come.'}</p><div className="index-bottom"><span>{p.stage}</span><button className="project-delete" aria-label={`Delete ${p.project}`} onClick={() => {
                        setWork(p);
                        setModal('delete');
                      }}><Trash size={17} /></button><span>{p.scope ? p.scope.deliverables.length + ' deliverables' : 'Start with the brief'}</span></div></motion.article>)}{!shown.length && <div className="no-results"><h3>{projects.length ? 'No projects found.' : 'Your next project starts here.'}</h3><p>{projects.length ? 'Try another project or client name.' : 'Add a client brief and turn it into a scope you can discuss.'}</p>{projects.length ? <button className="text-link" onClick={() => {
                      setQuery('');
                      setFilter('All projects');
                    }}>Clear filters</button> : <button className="text-link" onClick={() => {
                      if (!user) go('Create account');else setModal('new');
                    }}>Create your first project <Plus size={16} /></button>}</div>}</div></div></div></motion.section> : page === 'Plans' ? <section className="plans-page"><button className="back-link" onClick={() => user ? go('Projects') : gallery()}><ArrowLeft size={15} /> {user ? 'Back to projects' : 'Back to public drafts'}</button><h1>Room to work.</h1>{user&&<p className="usage-line">{usage.scopes} / 3 AI scopes · {projects.length} / 5 saved projects · {`${usage.voice} / ${plan==='Premium'?10:1} voice imports`} this month</p>}<p className="page-description">Free publishes client names, drafts and scopes when saved. Premium keeps them private and adds more voice imports.</p><div className="pricing-grid">{[{
                name: 'Free',
                price: '0',
                summary: 'For working in the open.',
                items: ['3 AI scopes per month', '5 saved projects', 'Public client names, drafts and AI scopes', '1 voice import per month (up to 12 MB)', 'Paste or type a client brief', 'Editable scopes & estimates', 'Markdown and PDF proposal export']
              }, {
                name: 'Premium',
                price: '1',
                summary: 'More room. Private by default.',
                items: ['20 AI scopes per month', '50 saved projects', 'Private client names, drafts and AI scopes', '10 voice imports per month (up to 12 MB each)', 'Editable scopes & estimates', 'Markdown and PDF proposal export']
              }].map(p => <article className={`price-card ${p.name === 'Premium' ? 'premium' : ''}`} key={p.name}><div className="plan-title"><h2>{p.name}</h2>{plan === p.name && <span>{!user ? 'Free to start' : 'Current plan'}</span>}</div><p>{p.summary}</p><div className="price"><sup>$</sup><strong>{p.price}</strong><span>/ month</span></div><button className={`btn full ${p.name === 'Premium' ? 'primary' : 'outline'}`} disabled={p.name === 'Premium' ? true : !!user} onClick={() => {
                  if (!user && p.name === 'Free') go('Create account');
                }}>{!user && p.name === 'Free' ? 'Create free account' : plan === p.name ? 'Your current plan' : p.name === 'Premium' ? 'Coming soon' : 'Switch to Free'}{plan !== p.name && <ArrowRight size={17} />}</button><ul>{p.items.map(t => <li key={t}><Check size={17} />{t}</li>)}</ul></article>)}</div><p className="plan-assumption"><Flask size={17} /><span><strong>Premium is in development.</strong> $1/month is the proposed price. Premium is coming soon. No payment is taken and no subscription is activated.</span></p><div className="plan-faq"><h3>What can other people see on Free?</h3><p>Free shares the project title, client name, brief, full scope and estimate when saved. Your account email, owner identifier and revision history stay private. Only publish client information you have permission to share.</p><h3>What about existing private projects?</h3><p>Existing private projects stay private. Previously hidden client names on existing public drafts become public on the owner’s next save.</p><button className="text-link arrow" onClick={gallery}>Browse public drafts <ArrowUpRight size={16} /></button></div></section> : editor ? <section className={`editor-page ${publicRead ? 'read-only' : ''}`}><button className="back-link" onClick={() => publicRead ? gallery() : go('Projects')}><ArrowLeft size={15} /> {publicRead ? 'Public drafts' : 'All projects'}</button><div className="editor-heading"><div><h1>{work.project}</h1>{work.client&&<p className="page-description">For {work.client}</p>}</div><div className="editor-save-actions">{!publicRead && work.revision > 0 && <button className="text-link" disabled={busy} onClick={showHistory}><Clock size={16} /> History</button>}<button className="btn outline" disabled={busy || publicRead} onClick={() => save()}><Check size={16} /> {publicRead ? 'Read only' : busy ? 'Working…' : saved ? 'Saved' : work.visibility === 'public' || !work.revision && plan === 'Free' ? 'Save public draft' : 'Save draft'}</button></div></div>{publicRead || work.visibility === 'public' || !work.revision && plan === 'Free' ? <div className="visibility-notice public"><Globe size={19} /><div><strong>{publicRead ? 'Public draft & scope · read only' : work.revision ? 'Public draft & scope · visible to anyone' : 'Free plan · saving publishes the client name, brief and scope'}</strong><p>{publicRead ? 'Published when saved by its author. Read the client name, brief, full scope and estimate below.' : 'The project title, client name, brief, full scope and estimate will be visible to everyone. Publish only information you have permission to share; remove confidential or sensitive details before saving.'}</p></div></div> : <div className="visibility-notice"><LockSimple size={18} /><p>This saved project is private to your account.</p></div>}<nav className="workflow" aria-label="Proposal steps">{['Brief', 'Review scope', 'Proposal'].map((s, i) => <button key={s} className={page === s ? 'current' : ''} onClick={() => {
                if (i > 0 && !work.scope) {
                  toast('Add a brief and create a scope first.');
                  return;
                }
                go(s);
              }}><span className="step-marker" /><strong>{s}</strong>{i < 2 && <ArrowRight size={15} />}</button>)}</nav>
          {page === 'Brief' ? <div className="editor-columns"><section className="editor-card"><div className="section-heading"><h2>The client brief.</h2><p>{publicRead?'The original brief shared by its author.':'Paste the client’s message as it is. You can clean it up later.'}</p></div><div className="form-grid">{(!publicRead||work.client) && <label>Client<input maxLength={100} value={work.client} onChange={e => update({
                      client: e.target.value
                    })} readOnly={publicRead} /></label>}<label>Project name<input maxLength={150} value={work.project} onChange={e => update({
                      project: e.target.value
                    })} readOnly={publicRead} /></label></div><label className="brief-input">The client brief<textarea value={work.brief} onChange={e => update({
                    brief: e.target.value,
                    scope: null
                  })} maxLength={20000} placeholder="What does the client need? Paste an email, meeting notes, or the first message they sent you." readOnly={publicRead} /></label><div className="brief-meta"><span>{work.brief.length.toLocaleString()} / 20,000 characters</span></div><label className="voice-drop"><span className="voice-icon"><Microphone size={21} /></span><span><strong>{fileName || 'Got a voice note instead?'}</strong><small>{fileName ? 'Transcript added to your brief.' : `Choose MP3, WAV or M4A · ${plan === 'Premium' ? '10 voice imports/month · 12 MB max each' : '1 free import/month · 12 MB max'}`}</small></span><span className="upload-label">Choose file</span><input type="file" accept="audio/*" aria-label="Choose voice brief" disabled={busy || publicRead} onChange={chooseAudio} /></label><div className="card-actions"><span>{usage.scopes} / {usage.scopeLimit || 3} AI scopes used this month</span><button className="btn primary" disabled={busy || publicRead} onClick={generate}>{busy ? 'Working…' : publicRead ? 'Read only' : 'Create a scope'} <ArrowRight size={17} /></button></div></section><aside className="editor-aside"><span className="aside-icon"><NotePencil size={24} /></span><h3>A useful brief doesn’t have to be perfect.</h3><p>Start with the basics. ScopeNote turns missing details into questions, rather than promises.</p><ul className="brief-tips"><li>What needs to be made?</li><li>Who is it for?</li><li>What’s the timeline or budget?</li></ul><div className="aside-footnote"><Flask size={16} /><p>{'AI can miss details. Review each deliverable, estimate and open question before sending a proposal.'}</p></div></aside></div> : page === 'Review scope' ? <div className="editor-columns review-columns"><section className="editor-card scope-card"><div className="section-heading"><h2>The working scope.</h2><p>Check the deliverables and hours before turning this into a proposal.</p></div><div className="review-tabs" role="tablist" aria-label="Review content">{['Deliverables', 'Questions & exclusions'].map(t => <button key={t} role="tab" aria-selected={reviewTab === t} className={reviewTab === t ? 'selected' : ''} onClick={() => setReviewTab(t)}>{t}{t === 'Questions & exclusions' && <span>{work.scope?.questions.length || 0}</span>}</button>)}</div>{work.scope ? reviewTab === 'Deliverables' ? <><label className="overview-label">Project overview<textarea maxLength={3000} value={work.scope.summary} onChange={e => update({
                      scope: {
                        ...work.scope,
                        summary: e.target.value
                      }
                    })} readOnly={publicRead} /></label><div className="deliverable-label"><span>Deliverable</span><span>Hours</span></div>{work.scope.deliverables.map((d, i) => <div className="deliverable" key={i}><div><input aria-label={`Deliverable ${i + 1} title`} maxLength={200} value={d.title} onChange={e => update({
                        scope: {
                          ...work.scope,
                          deliverables: work.scope.deliverables.map((v, j) => j === i ? {
                            ...v,
                            title: e.target.value
                          } : v)
                        }
                      })} readOnly={publicRead} /><textarea aria-label={`Deliverable ${i + 1} details`} maxLength={1200} value={d.detail} onChange={e => update({
                        scope: {
                          ...work.scope,
                          deliverables: work.scope.deliverables.map((v, j) => j === i ? {
                            ...v,
                            detail: e.target.value
                          } : v)
                        }
                      })} readOnly={publicRead} /></div><button className="remove-row" aria-label={`Remove deliverable ${i + 1}`} disabled={work.scope.deliverables.length <= 1 || publicRead} onClick={() => update({
                      scope: {
                        ...work.scope,
                        deliverables: work.scope.deliverables.filter((_, j) => j !== i)
                      }
                    })}><Trash size={16} /></button><label className="hours"><input type="number" min="0.25" max="500" step="0.25" aria-label={`Deliverable ${i + 1} hours`} value={d.hours} onChange={e => update({
                        scope: {
                          ...work.scope,
                          deliverables: work.scope.deliverables.map((v, j) => j === i ? {
                            ...v,
                            hours: Number(e.target.value)
                          } : v)
                        }
                      })} readOnly={publicRead} /><span>h</span></label></div>)}<button className="text-link add-row" disabled={work.scope.deliverables.length >= 20 || publicRead} onClick={() => update({
                    scope: {
                      ...work.scope,
                      deliverables: [...work.scope.deliverables, {
                        title: 'New deliverable',
                        detail: 'Describe what is included.',
                        hours: 1
                      }]
                    }
                  })}><Plus size={16} /> Add deliverable</button><p className="review-reminder"><CheckCircle size={16} /> A draft, not a client agreement. You make the final call.</p></> : <div className="question-content"><h3>Before you say yes</h3><p>These details need a conversation with the client.</p>{work.scope.questions.map((q, i) => <label className="question-row" key={i}><input type="checkbox" /><textarea aria-label={`Question ${i + 1}`} maxLength={800} value={q} onChange={e => update({
                      scope: {
                        ...work.scope,
                        questions: work.scope.questions.map((v, j) => j === i ? e.target.value : v)
                      }
                    })} readOnly={publicRead} /><button className="remove-row" aria-label={`Remove question ${i + 1}`} onClick={() => update({
                      scope: {
                        ...work.scope,
                        questions: work.scope.questions.filter((_, j) => j !== i)
                      }
                    })} disabled={publicRead}><X size={16} /></button></label>)}<button className="text-link add-row" disabled={work.scope.questions.length >= 12 || publicRead} onClick={() => update({
                    scope: {
                      ...work.scope,
                      questions: [...work.scope.questions, 'What else should we confirm?']
                    }
                  })}><Plus size={16} /> Add question</button><h3>Outside this scope</h3>{work.scope.exclusions.map((x, i) => <div className="exclusion" key={i}><button className="remove-row" aria-label={`Remove exclusion ${i + 1}`} onClick={() => update({
                      scope: {
                        ...work.scope,
                        exclusions: work.scope.exclusions.filter((_, j) => j !== i)
                      }
                    })} disabled={publicRead}><X size={15} /></button><textarea aria-label={`Exclusion ${i + 1}`} maxLength={800} value={x} onChange={e => update({
                      scope: {
                        ...work.scope,
                        exclusions: work.scope.exclusions.map((v, j) => j === i ? e.target.value : v)
                      }
                    })} readOnly={publicRead} /></div>)}<button className="text-link add-row" disabled={work.scope.exclusions.length >= 12 || publicRead} onClick={() => update({
                    scope: {
                      ...work.scope,
                      exclusions: [...work.scope.exclusions, 'Describe an excluded item.']
                    }
                  })}><Plus size={16} /> Add exclusion</button></div> : <p>No scope yet. Return to the brief to create one.</p>}</section><aside className="estimate-card"><h2>Put a number on it.</h2><p>Adjust your rate and leave a little breathing room.</p><label>Currency<select aria-label="Estimate currency" value={work.currency} onChange={e => update({
                    currency: e.target.value
                  })} disabled={publicRead}>{['USD', 'EUR', 'GBP', 'IDR'].map(code => <option key={code}>{code}</option>)}</select></label><label>Hourly rate<div className="input-affix"><input type="number" aria-label="Hourly rate" min="0" value={work.rate} onChange={e => update({
                      rate: Number(e.target.value)
                    })} readOnly={publicRead} /><span>{work.currency} / hour</span></div></label><label>Contingency<div className="input-affix"><input type="number" min="0" max="100" aria-label="Contingency" value={work.buffer} onChange={e => update({
                      buffer: Number(e.target.value)
                    })} readOnly={publicRead} /><span>%</span></div></label><div className="estimate-breakdown"><span>{stats.hours} hours × {currency(work.rate, work.currency)}</span><strong>{currency(stats.hours * work.rate, work.currency)}</strong><span>Contingency ({work.buffer}%)</span><strong>{currency(stats.total - stats.hours * work.rate, work.currency)}</strong></div><div className="estimate-total"><span>Estimated project fee</span><strong>{currency(stats.total, work.currency)}</strong><small>Subject to scope confirmation</small></div><button className="btn primary full" disabled={!work.scope} onClick={() => go('Proposal')}>View proposal <ArrowRight size={17} /></button></aside></div> : <div className="proposal-layout"><article className="proposal-paper"><p className="proposal-eyebrow">Scope of work · Working draft</p><h2>{work.project}</h2>{work.client && <p className="prepared">Prepared for {work.client}</p>}<hr /><h3>Project overview</h3><p>{work.scope?.summary}</p><h3>What’s included</h3>{work.scope?.deliverables.map((d, i) => <div className="proposal-item" key={i}><div><h4>{d.title}</h4><p>{d.detail}</p></div><small>{d.hours}h</small></div>)}<div className="proposal-fee"><span>Estimated project fee<small>{stats.hours} hours + {work.buffer}% contingency</small></span><strong>{currency(stats.total, work.currency)}</strong></div><h3>Questions to resolve</h3><ul>{work.scope?.questions.map(q => <li key={q}>{q}</li>)}</ul><h3>Outside this scope</h3><ul>{work.scope?.exclusions.map(q => <li key={q}>{q}</li>)}</ul><footer><p>Confirm the scope, timeline and payment terms together before work begins.</p><span className="proposal-brand">Made with ScopeNote</span></footer></article><aside className="proposal-actions"><span className="aside-icon"><PaperPlaneTilt size={25} /></span><h2>{publicRead?'A shared working draft.':'Ready to discuss.'}</h2><p>{publicRead?'Read the proposal as its author shared it.':'Give it one last read, then download a copy to share with your client.'}</p><button className="btn primary full" disabled={!work.scope||exportBusy} onClick={downloadPdf}><DownloadSimple size={18}/>{exportBusy?'Creating PDF…':'Download PDF'}</button>{exportError&&<p className="form-error" role="alert">{exportError}</p>}<button className="btn outline full" disabled={!work.scope} onClick={download}><DownloadSimple size={18} /> Download Markdown</button><button className="btn outline full" disabled={!work.scope} onClick={copy}><Copy size={17} /> Copy proposal</button><button className="text-link" onClick={() => go('Review scope')}><ArrowLeft size={15} /> {publicRead?'Back to scope':'Keep editing'}</button><p className="export-note">PDF and Markdown include the project name, client name when available, full scope, estimate and Made with ScopeNote credit.</p></aside></div>}
        </section> : null}<footer className="app-footer"><span>Less admin. More independent work.</span><div><button onClick={() => setModal('data')}>Data & privacy</button><a href="https://x.com/tirtavex" target="_blank" rel="noreferrer">X / @tirtavex <ArrowUpRight size={12} /></a><a href="https://github.com/dkfadhila/scopenote" target="_blank" rel="noreferrer">Open source <ArrowUpRight size={12} /></a></div></footer>
      </main></div></div>}
    <AnimatePresence>{modal && <div className="modal-backdrop" onClick={() => setModal('')}><motion.section className="modal" role="dialog" aria-modal="true" aria-label={modal === 'new' ? 'New project' : 'Workspace information'} initial={{
          opacity: 0,
          y: 15
        }} animate={{
          opacity: 1,
          y: 0
        }} exit={{
          opacity: 0,
          y: 8
        }} onClick={e => e.stopPropagation()}><button className="close-modal" aria-label="Close dialog" onClick={() => setModal('')}><X size={20} /></button>{modal === 'new' ? <><span className="aside-icon"><NotePencil size={25} /></span><h2>Start with a name.</h2><p>You can work out the details as you go.</p><form onSubmit={newProject}><label>Client name<input required maxLength={100} value={newClient} onChange={e => setNewClient(e.target.value)} placeholder="Client or company" autoFocus /></label><label>Project name<input required maxLength={150} value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="What are you working on?" /></label><button className="btn primary full">Create project <ArrowRight size={17} /></button></form><span className="modal-privacy">{plan === 'Premium' ? <LockSimple size={16} /> : <Globe size={16} />} {plan === 'Premium' ? 'Private drafts and scopes' : 'Free client names, briefs, scopes and estimates are public when saved'}</span></> : modal === 'data' ? <><span className="aside-icon"><Globe size={24} /></span><h2>Know what you share.</h2><ul className="info-list"><li>Free drafts are public when saved. Anyone can read the project title, client name, brief, full scope and estimate.</li><li>Your account email, owner identifier and revision history stay private. Previously hidden client names on older public drafts become public on the owner’s next save.</li><li>Premium keeps client names, drafts and scopes private. Existing private projects stay private.</li><li>Text goes to the model provider when you generate a scope. Audio goes to ElevenLabs when you request transcription.</li><li>Open-source code does not publish database credentials or API keys.</li></ul></> : modal === 'settings' ? <><h2>Account settings</h2><p>Manage your name, email and account access.</p><label>Display name<input value={name} onChange={e => setName(e.target.value)} /></label><label>Email address<input type="email" value={email} readOnly={true} onChange={e => setEmail(e.target.value)} placeholder="Your account email" /></label><button className="btn ink full" disabled={busy} onClick={saveProfile}>Save profile</button><button className="text-link settings-reset" onClick={() => {
              setModal('');
              setResetStep('request');
              go('Forgot password');
            }}>Reset password <ArrowRight size={15} /></button>{user && !user.emailVerified && <button className="text-link settings-reset" disabled={busy} onClick={async () => {
              setBusy(true);
              try {
                await api('/api/account/resend-verification', {
                  method: 'POST'
                });
                toast('Verification email requested. Check your inbox.');
              } catch (e) {
                toast(e.message);
              } finally {
                setBusy(false);
              }
            }}>Verify email <EnvelopeSimple size={15} /></button>}<button className="btn outline full settings-logout" disabled={busy} onClick={logout}><SignOut size={17} /> Sign out</button></> : modal === 'delete' ? <><h2>Delete this project?</h2><p>“{work.project}” and its saved revisions will be removed permanently.</p><button className="btn primary full" disabled={busy} onClick={() => deleteProject(work)}>Delete project <Trash size={17} /></button></> : modal === 'history' ? <><h2>Saved revisions</h2><p>Earlier versions of {work.project}.</p>{history.length ? history.map(h => <div className="revision-entry" key={h.revision}><strong>Revision {h.revision}</strong><span>{new Date(h.updatedAt).toLocaleString()}</span><button className="text-link" onClick={() => {
                update({
                  scope: h.scope,
                  brief: h.brief
                });
                setModal('');
                go(h.scope ? 'Review scope' : 'Brief');
                toast('Earlier content loaded. Save to create a new revision.');
              }} disabled={publicRead}>Use this content</button></div>) : <p>No earlier revisions yet. Save another change to create one.</p>}</> : modal === 'replace-audio' ? <><h2>Replace the brief?</h2><p>The new transcript will replace the current brief and clear its generated scope. Your saved version stays unchanged until you save.</p><button className="btn primary full" disabled={busy} onClick={() => {
              setModal('');
              transcribe(pendingAudio);
            }}>Transcribe and replace <ArrowRight size={17} /></button></> : <><span className="aside-icon"><NotePencil size={25} /></span><h2>From conversation to proposal.</h2><ol className="help-steps"><li><strong>Bring the brief</strong><p>Paste a message or import a voice note.</p></li><li><strong>Review the scope</strong><p>Edit deliverables, resolve questions and adjust your rate.</p></li><li><strong>Send a proposal</strong><p>Preview and export a document to discuss with your client.</p></li></ol><button className="btn primary full" onClick={() => {
              setModal('');
              gallery();
            }}>Browse public drafts <ArrowRight size={17} /></button></>}</motion.section></div>}</AnimatePresence>
    <AnimatePresence>{notice && <motion.div className="toast" role="status" initial={{
        opacity: 0,
        y: 12
      }} animate={{
        opacity: 1,
        y: 0
      }} exit={{
        opacity: 0
      }}><CheckCircle size={18} />{notice}</motion.div>}</AnimatePresence>
  </MotionConfig>;
}
const root = import.meta.hot?.data.root || createRoot(document.getElementById('root'));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<App />);
