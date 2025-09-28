const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 8081;

const STATE_PATH = path.join(__dirname, '..', 'state', 'state.json');
function readState(){return JSON.parse(fs.readFileSync(STATE_PATH,'utf8'));}
function writeState(s){fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));}

app.use(bodyParser.json({limit:'2mb'}));
app.use(cookieParser());

// Serve login page directly at root BEFORE static so it always wins
app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'public','login.html')));

// Static assets (CSS, images, other HTML)
app.use(express.static(path.join(__dirname,'public')));

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
app.get('/check/health', (req,res)=>{
  const s = readState().submissions.health;
  if (!s) return res.json({pass:false, reason:'no submission'});
  const keys = ['dns_ok','https_ok','avg_latency_ms','vip_status'];
  const has = keys.every(k => Object.prototype.hasOwnProperty.call(s, k));
  res.json({pass: !!has, received: s});
});

app.post('/check/regex', (req,res)=>{
  const p = (req.body && req.body.pattern) || '';
  function test(rx, s){ try { return new RegExp('^'+rx.replace(/^\^|\$$/g,'')+'$').test(s); } catch(e) { return false; } }
  const valid = ['john123@domain1.com','A9@Z7.net','USER99@DOMAIN99.com'];
  const invalid = ['john.doe@domain.com','john@sub.domain.com','john@domain-1.com','jo_hn@domain.com','john@domain.org','@domain.com','john@.com'];
  let ok=0,total=0, detail=[];
  valid.forEach(v=>{ total++; const pass=test(p,v); if(pass) ok++; detail.push({s:v, pass}); });
  invalid.forEach(v=>{ total++; const pass=!test(p,v); if(pass) ok++; detail.push({s:v, pass}); });
  const st = readState(); st.submissions.regex = { pattern: p, score: ok+'/'+total }; writeState(st);
  res.json({score: ok+'/'+total, detail});
});

app.post('/check/incident', (req,res)=>{
  const text = (req.body && req.body.text || '').toLowerCase();
  const haveImpact = /impact|users|customers|service|outage/.test(text);
  const haveNext = /next update|\d+\s*(min|mins|minutes)/.test(text);
  const haveOwn = /i'?m taking ownership|i will|we will|owner/.test(text);
  const st = readState(); st.submissions.incident_text = text; writeState(st);
  res.json({pass: (haveImpact && haveNext && haveOwn), haveImpact, haveNext, haveOwn});
});

// ---- Utility endpoints for the portal ----
app.get('/api/token', (req,res)=> res.json({token: 'LAB-QGZK7V'}));
app.get('/api/state', (req,res)=> res.json(readState()));

// ---- Candidate & Admin Auth / Tracking ----
// Helpers
function saveStateMut(fn){ const st=readState(); fn(st); writeState(st); return st; }
function ensureCandidatesArray(st){ if(!Array.isArray(st.candidates)) st.candidates=[]; }
function findCandidate(st,email){ return (st.candidates||[]).find(c=> c.email.toLowerCase()===email.toLowerCase()); }

// Candidate login (create if not exists). Body: {name, email}
app.post('/api/candidate/login',(req,res)=>{
  const {name,email}=req.body||{};
  if(!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) return res.status(400).json({error:'invalid email'});
  const safeName=(name||'').trim().slice(0,120);
  const st=saveStateMut(s=>{
    ensureCandidatesArray(s);
    let c=findCandidate(s,email);
    const now=Date.now();
    if(!c){ c={email,name:safeName,startTime:null,endTime:null,createdAt:now}; s.candidates.push(c); }
    else if(safeName && !c.name) c.name=safeName; // backfill name if missing
  });
  const c=findCandidate(st,email);
  res.json({candidate:{email:c.email,name:c.name,startTime:c.startTime}});
});

// Start candidate timer (admin only)
app.post('/api/candidate/:email/start',(req,res)=>{
  // simple admin guard: require admin cookie
  if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'});
  const email=req.params.email||'';
  const st=saveStateMut(s=>{
    ensureCandidatesArray(s);
    const c=findCandidate(s,email); if(c && !c.startTime){ c.startTime=Date.now(); c.running=true; }
  });
  const c=findCandidate(st,email); if(!c) return res.status(404).json({error:'not found'});
  res.json({ok:true,candidate:c});
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

// Create candidate (admin)
app.post('/api/admin/candidate',(req,res)=>{
  if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'});
  const {name,email}=req.body||{}; if(!email) return res.status(400).json({error:'email required'});
  saveStateMut(s=>{ ensureCandidatesArray(s); if(!findCandidate(s,email)) s.candidates.push({email,name:(name||'').trim(),startTime:null,endTime:null,createdAt:Date.now()}); });
  res.json({ok:true});
});

// List candidates (admin)
app.get('/api/admin/candidates',(req,res)=>{
  if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'});
  const st=readState(); ensureCandidatesArray(st);
  res.json({total:st.candidates.length,candidates:st.candidates});
});

// Admin login (simple password; DO NOT use in production)
app.post('/api/auth/admin-login',(req,res)=>{
  const {password}=req.body||{}; if(password!=='2025') return res.status(401).json({error:'bad password'});
  res.cookie('admin','1',{httpOnly:false,sameSite:'lax'}); res.json({ok:true});
});
app.post('/api/auth/admin-logout',(req,res)=>{ res.clearCookie('admin'); res.json({ok:true}); });

// Admin config endpoints (guarded)
app.get('/api/admin/config',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const st=readState(); res.json({recipients:st.recipients||'',onCall:st.onCall||''}); });
app.post('/api/admin/config',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const {recipients,onCall}=req.body||{}; saveStateMut(s=>{ s.recipients=recipients||''; s.onCall=onCall||''; }); res.json({ok:true}); });

// Case study submission placeholder
app.get('/api/case-study/submission',(req,res)=>{ const st=readState(); res.json(st.caseStudySubmission||{submitted:false}); });
app.post('/api/case-study/submission',(req,res)=>{ const {html,meta}=req.body||{}; saveStateMut(s=>{ s.caseStudySubmission={submitted:true,submittedAt:Date.now(),html:html||'',meta:meta||{}}; }); res.json({ok:true}); });

// ---- Static pages catch-all (excluding root which is handled above)
app.get(/^\/(?!$).*/, (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT, ()=> console.log('Ops 101 Exam Lab on http://localhost:'+PORT));
