const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
// DOCX export removed – library no longer required.

const app = express();
const PORT = process.env.PORT || 8081;

const STATE_PATH = path.join(__dirname, '..', 'state', 'state.json');
function readState(){return JSON.parse(fs.readFileSync(STATE_PATH,'utf8'));}
function writeState(s){fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));}

// ---- Helper utilities (re-added after refactor) ----
function saveStateMut(mut){
  const s = readState();
  try { mut(s); } catch(e){ console.error('State mutation error:', e); }
  writeState(s);
  return s;
}
function ensureCandidatesArray(s){ if(!Array.isArray(s.candidates)) s.candidates = []; }
function findCandidate(s,email){ const e=(email||'').toLowerCase(); return (s.candidates||[]).find(c=> (c.email||'').toLowerCase()===e); }
function ensureAnswersRoot(s){ if(!s.answers) s.answers={}; if(!s.answers.candidates) s.answers.candidates={}; }
function getCandidateAnswers(s,email){ ensureAnswersRoot(s); const key=(email||'').toLowerCase(); if(!s.answers.candidates[key]) s.answers.candidates[key]={}; return s.answers.candidates[key]; }
function mergeAnswerSet(existing, fields){ const now=Date.now(); if(!existing) return {updatedAt:now, fields:{...fields}}; return {updatedAt:now, fields:{...existing.fields, ...fields}}; }
function computeRemaining(c){
  const BASE=4*60*60*1000; // 4h base
  const extra = c && c.extraTimeMs ? c.extraTimeMs : 0;
  const totalDurationMs = BASE + extra;
  if(!c.startTime) return {remainingMs: totalDurationMs, totalDurationMs, running:false, endTime:null};
  const now=Date.now();
  const elapsed= now - c.startTime;
  if(elapsed >= totalDurationMs){
    if(!c.endTime) c.endTime = c.startTime + totalDurationMs;
    return {remainingMs:0,totalDurationMs,running:false,endTime:c.endTime};
  }
  return {remainingMs: totalDurationMs - elapsed, totalDurationMs, running:true, endTime: c.startTime + totalDurationMs};
}
function candidateLocked(c){ if(!c) return false; return !!c.submittedAt || computeRemaining(c).remainingMs<=0; }

app.use(bodyParser.json({limit:'2mb'}));
app.use(cookieParser());

// Serve login page directly at root BEFORE static so it always wins
app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'public','login.html')));

// Early access guard BEFORE static so static files cannot bypass
app.use((req,res,next)=>{
  try{
    const p=req.path;
    if(p==='/admin.html' && req.cookies.admin!=='1'){
      return res.redirect('/admin-login.html');
    }
    if( (p==='/tasks.html' || p.startsWith('/task/')) && req.cookies.candidate!=='1'){
      return res.redirect('/');
    }
  }catch(_e){}
  next();
});

// Static assets (CSS, images, other HTML)
app.use(express.static(path.join(__dirname,'public')));

// ---- Access control middleware ----
function requireCandidate(req,res,next){
  if(req.cookies.candidate==='1') return next();
  return res.redirect('/');
}
function requireAdmin(req,res,next){
  if(req.cookies.admin==='1') return next();
  return res.redirect('/admin-login.html');
}

// Protect tasks index and individual task pages (pattern /task/... and /tasks.html)
app.get('/tasks.html', requireCandidate, (req,res)=>{
  res.sendFile(path.join(__dirname,'public','tasks.html'));
});
app.get('/task/:page', requireCandidate, (req,res,next)=>{
  const file = req.params.page;
  const full = path.join(__dirname,'public','task',file);
  if(fs.existsSync(full)) return res.sendFile(full);
  return next();
});

// Protect admin page
app.get('/admin.html', requireAdmin, (req,res)=>{
  res.sendFile(path.join(__dirname,'public','admin.html'));
});

// ---- Gateway simulation ----
function headerToken(res){ res.set('X-Lab-Trace','LAB-QGZK7V'); }
app.get('/gateway/ok', (req,res)=>{ headerToken(res); res.send('OK'); });
app.get('/gateway/forbidden', (req,res)=>{ headerToken(res); res.status(403).send('Forbidden'); });
app.get('/gateway/bad', (req,res)=>{ headerToken(res); res.status(502).send('Bad Gateway'); });
app.get('/gateway/delay/:ms', (req,res)=>{
  headerToken(res);
  const ms = Math.min(parseInt(req.params.ms||'0',10), 10000);
  setTimeout(()=> res.send('Delayed '+ms+'ms'), ms);
});
// admin path respects deny policy
app.get('/gateway/admin', (req,res)=>{
  headerToken(res);
  const st = readState();
  if (st.policy && Array.isArray(st.policy.deny) && st.policy.deny.includes('/admin')) {
    return res.status(403).send('Admin blocked by policy');
  }
  res.send('Admin panel');
});

// ---- IAM simulation ----
app.get('/iam/status', (req,res)=>{ res.json(readState().iam); });
app.post('/iam/grant', (req,res)=>{
  const key = req.headers['x-api-key'];
  if (key !== 'admin123') return res.status(401).json({error:'invalid api key'});
  const { user, role } = req.body || {}
  if (!user || !role) return res.status(400).json({error:'user and role required'});
  const st = readState();
  if (!st.iam[user]) st.iam[user] = { roles: [] };
  if (!st.iam[user].roles.includes(role)) st.iam[user].roles.push(role);
  writeState(st);
  res.json({ok:true, iam: st.iam});
});
// logs protected by role
app.get('/cloud/logs', (req,res)=>{
  const st = readState();
  const roles = (st.iam.student && st.iam.student.roles) || [];
  if (!roles.includes('LogReader')) return res.status(403).json({error:'requires LogReader role'});
  const logPath = path.join(__dirname, '..', 'logs', 'app.log');
  const data = fs.readFileSync(logPath,'utf8');
  res.type('text/plain').send(data);
});

// ---- Policy apply/check ----
app.post('/policy', (req,res)=>{
  const pol = req.body || {};
  if (!pol.deny || !Array.isArray(pol.deny)) return res.status(400).json({error:'policy must be {deny: ["/path", ...]}'});
  const st = readState();
  st.policy = { deny: pol.deny };
  writeState(st);
  res.json({ok:true, policy: st.policy});
});
app.get('/policy', (req,res)=>{ res.json(readState().policy); });

// ---- Submit & check endpoints ----
app.post('/submit/health', (req,res)=>{
  const st = readState();
  st.submissions.health = req.body;
  writeState(st);
  res.json({ok:true});
});
// Removed DOCX helper remnants
function htmlValueToLines(val){
  if(!val) return [];
  let str = String(val);
  str = str.replace(/<[^>]+>/g,'');
  return str ? [str] : [];
}

// Candidate login (create if not exists). Body: {name, email}
app.post('/api/candidate/login',(req,res)=>{
  const {name,email}=req.body||{};
  if(!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) return res.status(400).json({error:'invalid email'});
  const safeName=(name||'').trim().slice(0,120);
  const st=saveStateMut(s=>{
    ensureCandidatesArray(s);
    let c=findCandidate(s,email);
    const now=Date.now();
    if(!c){ c={email,name:safeName,startTime:null,endTime:null,createdAt:now,extraTimeMs:0}; s.candidates.push(c); }
    else if(safeName && !c.name) c.name=safeName; // backfill name if missing
  });
  const c=findCandidate(st,email);
  const rem = computeRemaining(c);
  // set candidate cookie for access control (session style, no secure flag for simplicity)
  res.cookie('candidate','1',{httpOnly:false});
  res.json({candidate:{email:c.email,name:c.name,startTime:c.startTime,remainingMs:rem.remainingMs,running:rem.running}});
});

// Fetch candidate status
app.get('/api/candidate/:email',(req,res)=>{
  const email=req.params.email||''; const st=readState(); ensureCandidatesArray(st);
  const c=findCandidate(st,email); if(!c) return res.status(404).json({error:'not found'});
  const rem=computeRemaining(c);
  res.json({email:c.email,name:c.name,startTime:c.startTime,remainingMs:rem.remainingMs,running:rem.running});
});

// Start candidate timer (admin only)
app.post('/api/candidate/:email/start',(req,res)=>{
  const email=req.params.email||'';
  const selfStart = req.query.self==='1';
  // Admin can always start; self-start allowed if candidate exists and not started yet
  if(req.cookies.admin!=='1' && !selfStart){
    return res.status(401).json({error:'admin or self start required'});
  }
  let updatedCandidate=null; let notFound=false; let already=false;
  const st=saveStateMut(s=>{
    ensureCandidatesArray(s);
    const c=findCandidate(s,email); if(!c){ notFound=true; return; }
    if(c.startTime){ already=true; updatedCandidate=c; return; }
    c.startTime=Date.now(); c.running=true; updatedCandidate=c;
  });
  if(notFound) return res.status(404).json({error:'not found'});
  if(already) return res.json({ok:true,candidate:updatedCandidate,already:true});
  res.json({ok:true,candidate:updatedCandidate});
});

// Reset candidate (admin only)
app.post('/api/admin/candidate/:email/reset',(req,res)=>{
  if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'});
  const email=req.params.email||'';
  const st=saveStateMut(s=>{
    ensureCandidatesArray(s);
    const c=findCandidate(s,email); if(c){ c.startTime=null; c.endTime=null; c.running=false; }
  });
  res.json({ok:true});
});

// Extend candidate time (minutes)
app.post('/api/admin/candidate/:email/extend',(req,res)=>{
  if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'});
  const email=req.params.email||'';
  let minutes = (req.body && parseInt(req.body.minutes,10)) || 0;
  if(!minutes || minutes<1) return res.status(400).json({error:'minutes>0 required'});
  if(minutes>8*60) minutes = 8*60; // cap extension at 8h
  let updated=null;
  saveStateMut(s=>{
    ensureCandidatesArray(s);
    const c=findCandidate(s,email); if(!c) return;
    if(!c.extraTimeMs) c.extraTimeMs=0;
    c.extraTimeMs += minutes*60*1000;
    updated=c;
  });
  if(!updated) return res.status(404).json({error:'not found'});
  const rem=computeRemaining(updated);
  res.json({ok:true, remainingMs: rem.remainingMs, totalDurationMs: rem.totalDurationMs});
});

// Delete candidate (and their answers/doc)
app.delete('/api/admin/candidate/:email',(req,res)=>{
  if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'});
  const email=(req.params.email||'').toLowerCase();
  let removed=false;
  saveStateMut(s=>{
    ensureCandidatesArray(s);
    const before=s.candidates.length;
    s.candidates = s.candidates.filter(c=> c.email.toLowerCase()!==email);
    removed = before !== s.candidates.length;
    ensureAnswersRoot(s);
    if(s.answers.candidates[email]) delete s.answers.candidates[email];
  });
  try {
    const safe=email.replace(/[^a-z0-9@._-]/gi,'_');
    const f=path.join(__dirname,'..','state','docs', safe+'.docx');
    if(fs.existsSync(f)) fs.unlinkSync(f);
  } catch(_e){}
  if(!removed) return res.status(404).json({error:'not found'});
  res.json({ok:true});
});
// Create candidate (admin)
app.post('/api/admin/candidate',(req,res)=>{
  if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'});
  const {name,email}=req.body||{}; if(!email) return res.status(400).json({error:'email required'});
  saveStateMut(s=>{ ensureCandidatesArray(s); if(!findCandidate(s,email)) s.candidates.push({email,name:(name||'').trim(),startTime:null,endTime:null,createdAt:Date.now(),extraTimeMs:0}); });
  res.json({ok:true});
});

// List candidates (admin)
app.get('/api/admin/candidates',(req,res)=>{
  if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'});
  const st=readState(); ensureCandidatesArray(st);
  const list = st.candidates.map(c=>{ const rem=computeRemaining(c); return {...c, remainingMs: rem.remainingMs, totalDurationMs: rem.totalDurationMs, endTime: rem.endTime, running: rem.running}; });
  res.json({total:list.length,candidates:list});
});

// Admin login (simple password; DO NOT use in production)
app.post('/api/auth/admin-login',(req,res)=>{
  const {password}=req.body||{}; if(password!=='2025') return res.status(401).json({error:'bad password'});
  res.cookie('admin','1',{httpOnly:false,sameSite:'lax'}); res.json({ok:true});
});
app.post('/api/auth/admin-logout',(req,res)=>{ res.clearCookie('admin'); res.json({ok:true}); });

// ---- Candidate Answers Endpoints ----
// Save/merge answers for the logged-in candidate. Body: { taskId, fields: {k:v,...} }
app.post('/api/candidate/answers',(req,res)=>{
  if(req.cookies.candidate!=='1') return res.status(401).json({error:'candidate required'});
  const { taskId, fields } = req.body || {};
  if(!taskId || typeof taskId!=='string') return res.status(400).json({error:'taskId required'});
  if(!fields || typeof fields!=='object') return res.status(400).json({error:'fields object required'});
  // Candidate email inferred from localStorage on client; we require client to send email for identification
  const email = (req.body && req.body.email)||'';
  if(!email) return res.status(400).json({error:'email required'});
  let updated;
  const st=saveStateMut(s=>{
    ensureCandidatesArray(s);
    ensureAnswersRoot(s);
    const cand=findCandidate(s,email); if(!cand) return; // silent; will handle below
    if(cand.submittedAt){ return; }
    const answers=getCandidateAnswers(s,email);
    const existing = answers[taskId];
    answers[taskId]=mergeAnswerSet(existing, fields);
    updated=answers[taskId];
  });
  if(!updated) return res.status(404).json({error:'candidate not found'});
  // (Docx generation removed)
  res.json({ok:true, taskId, answer: updated});
});

// Final submission (candidate). Locks further edits and regenerates doc.
// POST /api/candidate/submit {email}
app.post('/api/candidate/submit',(req,res)=>{
  if(req.cookies.candidate!=='1') return res.status(401).json({error:'candidate required'});
  const email=(req.body && req.body.email)||'';
  if(!email) return res.status(400).json({error:'email required'});
  let candRef=null; let stRef=null;
  const st=saveStateMut(s=>{
    ensureCandidatesArray(s);
    const c=findCandidate(s,email); if(!c) return; candRef=c;
    if(!c.submittedAt) c.submittedAt=Date.now();
  });
  if(!candRef) return res.status(404).json({error:'candidate not found'});
  res.json({ok:true, submittedAt: candRef.submittedAt});
});

// ---- Task 1 Focused Endpoints ----
// Save Task1 fields (independent of generic answers) at taskId 'task1'
app.post('/api/candidate/task1/save',(req,res)=>{
  if(req.cookies.candidate!=='1') return res.status(401).json({error:'candidate required'});
  const {email, fields} = req.body||{};
  if(!email) return res.status(400).json({error:'email required'});
  if(!fields || typeof fields!=='object') return res.status(400).json({error:'fields object required'});
  let updated=null; let candidateRef=null;
  const st=saveStateMut(s=>{
    ensureCandidatesArray(s); ensureAnswersRoot(s);
    const c=findCandidate(s,email); if(!c) return; candidateRef=c;
    if(c.task1SubmittedAt) return; // locked
    const answers=getCandidateAnswers(s,email);
    const existing=answers['task1'];
    answers['task1']=mergeAnswerSet(existing, fields);
    updated=answers['task1'];
  });
  if(!candidateRef) return res.status(404).json({error:'candidate not found'});
  if(!updated) return res.status(400).json({error:'task1 locked or not updated'});
  // (Docx generation removed)
  res.json({ok:true, answer: updated});
});

// Submit Task1 (locks just task1 edits, not whole exam)
app.post('/api/candidate/task1/submit',(req,res)=>{
  if(req.cookies.candidate!=='1') return res.status(401).json({error:'candidate required'});
  const {email} = req.body||{}; if(!email) return res.status(400).json({error:'email required'});
  let candRef=null; const st=saveStateMut(s=>{ ensureCandidatesArray(s); const c=findCandidate(s,email); if(!c) return; candRef=c; if(!c.task1SubmittedAt) c.task1SubmittedAt=Date.now(); });
  if(!candRef) return res.status(404).json({error:'candidate not found'});
  // (Docx generation removed)
  res.json({ok:true, task1SubmittedAt: candRef.task1SubmittedAt});
});
// (Removed docx download & generation endpoints)

// Get all answers for logged-in candidate (requires email param to match a candidate) /api/candidate/answers?email=foo
app.get('/api/candidate/answers',(req,res)=>{
  if(req.cookies.candidate!=='1') return res.status(401).json({error:'candidate required'});
  const email=(req.query.email||'').toString();
  if(!email) return res.status(400).json({error:'email required'});
  const st=readState(); ensureAnswersRoot(st);
  const cand=findCandidate(st,email); if(!cand) return res.status(404).json({error:'candidate not found'});
  const answers=getCandidateAnswers(st,email);
  res.json({ok:true, answers});
});

// Admin fetch candidate answers
app.get('/api/admin/candidate/:email/answers',(req,res)=>{
  if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'});
  const email=req.params.email||'';
  const st=readState(); ensureAnswersRoot(st);
  const cand=findCandidate(st,email); if(!cand) return res.status(404).json({error:'candidate not found'});
  const answers=getCandidateAnswers(st,email);
  res.json({ok:true,email,answers});
});

// (Removed candidate docx download endpoint)

// Admin export all answers (CSV-ish JSON lines)
app.get('/api/admin/answers/export',(req,res)=>{
  if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'});
  const st=readState(); ensureAnswersRoot(st);
  const rows=[];
  Object.entries(st.answers.candidates).forEach(([email, tasks])=>{
    Object.entries(tasks).forEach(([taskId, obj])=>{
      rows.push({email, taskId, updatedAt: obj.updatedAt, fields: obj.fields});
    });
  });
  res.json({ok:true, rows});
});

// Admin config endpoints (guarded)
app.get('/api/admin/config',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const st=readState(); res.json({recipients:st.recipients||'',onCall:st.onCall||''}); });
app.post('/api/admin/config',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const {recipients,onCall}=req.body||{}; saveStateMut(s=>{ s.recipients=recipients||''; s.onCall=onCall||''; }); res.json({ok:true}); });

// Case study submission placeholder
app.get('/api/case-study/submission',(req,res)=>{ const st=readState(); res.json(st.caseStudySubmission||{submitted:false}); });
app.post('/api/case-study/submission',(req,res)=>{ const {html,meta}=req.body||{}; saveStateMut(s=>{ s.caseStudySubmission={submitted:true,submittedAt:Date.now(),html:html||'',meta:meta||{}}; }); res.json({ok:true}); });

// Simple health endpoint for container diagnostics
app.get('/health',(req,res)=>{
  try {
    const st = readState();
    res.json({ok:true,time:Date.now(),candidates:(st.candidates||[]).length});
  } catch(e){
    res.status(500).json({ok:false,error:'state read failed'});
  }
});

// Simple ping for debugging candidate login issues
app.get('/api/ping',(req,res)=> res.json({ok:true, time:Date.now()}));

// ---- Static pages catch-all (excluding root which is handled above)
app.get(/^\/(?!$).*/, (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT, ()=> console.log('Ops 101 Exam Lab on http://localhost:'+PORT));
