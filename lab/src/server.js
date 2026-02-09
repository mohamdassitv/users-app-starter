// Clean consolidated implementation of server with:
// - Candidate slug + token routing
// - Physical per-candidate static duplication (/public/generated/<slug>)
// - Legacy task redirection
// - Admin & candidate APIs (answers, timing, submission)
// - Gateway, IAM, Policy simulation endpoints
// - Health + ping

const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { Pool } = require('pg'); // Only used if PG_CONNECTIONSTRING or PGHOST is set
const { Client: SSHClient } = require('ssh2');
let httpServer = null; // will be set before listen if WS enabled
const USE_WS = process.env.USE_WS === '1';
let io = null;

const app = express();
const PORT = process.env.PORT || 8081;

// Import Session Manager for per-candidate isolation
const SessionManager = require('./session-manager');

// ---------------- Postgres Connection ----------------
// DISABLED: Using JSON file storage instead (no database required)
// Pool defaults to localhost:5432 which causes high CPU usage on connection retries
// Only create pool if EXPLICITLY configured via environment
const hasPgConfig = !!(
  process.env.PG_CONNECTION_STRING || 
  (process.env.PGHOST && process.env.PGHOST.trim())
);

let pool = null;
if (hasPgConfig) {
  // Only create pool if explicitly configured
  pool = new Pool({
    connectionString: process.env.PG_CONNECTION_STRING || undefined,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? parseInt(process.env.PGPORT,10) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  });
  pool.on('error', (err)=> console.error('PG pool error', err));
  console.log('[Server] Using PostgreSQL database');
} else {
  console.log('[Server] No PostgreSQL configured - using JSON file storage only');
}

// Initialize Session Manager with null pool (JSON storage mode)
const sessionManager = new SessionManager(pool);
console.log('[Server] SessionManager initialized - ' + (pool ? 'PostgreSQL mode' : 'JSON storage mode'));

// Recover existing sessions from Docker containers on startup
(async () => {
  try {
    await sessionManager.recoverExistingSessions();
  } catch(e) {
    console.error('[SessionManager] Recovery error:', e.message);
  }
})();

// Helper to broadcast session events to admin viewers
function broadcastSessionEvent(sessionId, eventType, data) {
  if (io) {
    io.to('session:' + sessionId).emit('sessionUpdate', {
      sessionId,
      eventType,
      timestamp: Date.now(),
      data
    });
  }
}

async function pgHealth(){
  if (!pool) return true; // No pool = using JSON storage (always healthy)
  try { await pool.query('SELECT 1'); return true; } catch(e){ return false; }
}

// Simple migration runner: loads all .sql in lab/db/migrations (if mounted at runtime)
async function runMigrations(){
  const migRoot = path.join(__dirname,'..','db','migrations');
  try {
    if(!fs.existsSync(migRoot)) return;
    const files = fs.readdirSync(migRoot).filter(f=>f.endsWith('.sql')).sort();
    for(const f of files){
      const sql = fs.readFileSync(path.join(migRoot,f),'utf8');
      try {
        await pool.query(sql);
        console.log('[migrate] applied', f);
      } catch(e){ console.error('[migrate] failed', f, e.message); }
    }
  } catch(e){ console.error('Migration scan error', e.message); }
}

// Global SSE client registry: sessionId -> Set(res)
const sseClients = new Map();
function broadcastSession(sessionId, eventName, payload){
  // SSE
  const set = sseClients.get(sessionId);
  if(set){
    const data = `event: ${eventName}\n`+`data: ${JSON.stringify(payload)}\n\n`;
    set.forEach(res=>{ try{ res.write(data); }catch(_e){} });
  }
  // WS
  if(io){ io.to('session:'+sessionId).emit(eventName, payload); }
}

// ---------------- State Helpers ----------------
const STATE_PATH = path.join(__dirname, '..', 'state', 'state.json');
function ensureStateFile(){
  try { if(!fs.existsSync(STATE_PATH)) fs.writeFileSync(STATE_PATH, JSON.stringify({candidates:[],answers:{candidates:{},finalSnapshots:{}},iam:{student:{roles:[]}},policy:{deny:[]},submissions:{},caseStudySubmission:null}, null, 2)); } catch(e){ console.error('Init state failed', e);} }
ensureStateFile();
function readState(){ return JSON.parse(fs.readFileSync(STATE_PATH,'utf8')); }
function writeState(s){ fs.writeFileSync(STATE_PATH, JSON.stringify(s,null,2)); }
function saveStateMut(mut){ const s=readState(); try{ mut(s); }catch(e){ console.error('State mutation error', e);} writeState(s); return s; }
function ensureCandidatesArray(s){ if(!Array.isArray(s.candidates)) s.candidates=[]; }
function ensureAnswersRoot(s){ if(!s.answers) s.answers={}; if(!s.answers.candidates) s.answers.candidates={}; if(!s.answers.finalSnapshots) s.answers.finalSnapshots={}; }
function ensureIAM(s){ if(!s.iam) s.iam={}; if(!s.iam.student) s.iam.student={roles:[]}; }
function ensurePolicy(s){ if(!s.policy) s.policy={deny:[]}; }
function ensureSubmissions(s){ if(!s.submissions) s.submissions={}; }
function ensureUploadsDirs(){
  const dir=path.join(__dirname,'..','state','uploads');
  try{ fs.mkdirSync(dir,{recursive:true}); }catch(_e){}
  return dir;
}
// Exam template directory helper
function ensureTemplateDir(){
  const dir=path.join(__dirname,'..','state','exam-template');
  try{ fs.mkdirSync(dir,{recursive:true}); }catch(_e){}
  return dir;
}
function ensureExamTemplate(s){ if(!Object.prototype.hasOwnProperty.call(s,'examTemplate')) s.examTemplate=null; }

// ---------------- Utility Functions ----------------
function randomChars(len){ const chars='abcdefghjkmnpqrstuvwxyz23456789'; let out=''; for(let i=0;i<len;i++) out+=chars[Math.floor(Math.random()*chars.length)]; return out; }
function makeSlug(){ return randomChars(12); }
function makeToken(){ return randomChars(16); }
function findCandidate(s,email){ const e=(email||'').toLowerCase(); return (s.candidates||[]).find(c=> (c.email||'').toLowerCase()===e); }
function computeRemaining(c){ const BASE=4*60*60*1000; const extra=c&&c.extraTimeMs?c.extraTimeMs:0; const total=BASE+extra; if(!c.startTime) return {remainingMs:total,totalDurationMs:total,running:false,endTime:null}; const now=Date.now(); const elapsed=now-c.startTime; if(elapsed>=total){ if(!c.endTime) c.endTime=c.startTime+total; return {remainingMs:0,totalDurationMs:total,running:false,endTime:c.endTime}; } return {remainingMs: total-elapsed,totalDurationMs:total,running:true,endTime:c.startTime+total}; }
function candidateLocked(c){ return !!(c && (c.submittedAt || computeRemaining(c).remainingMs<=0)); }
function getCandidateAnswers(s,email){ ensureAnswersRoot(s); const key=(email||'').toLowerCase(); if(!s.answers.candidates[key]) s.answers.candidates[key]={}; return s.answers.candidates[key]; }
function mergeAnswerSet(existing,fields){ const now=Date.now(); if(!existing) return {updatedAt:now,fields:{...fields}}; return {updatedAt:now,fields:{...existing.fields,...fields}}; }
function getFinalSnapshot(s,email){ ensureAnswersRoot(s); return s.answers.finalSnapshots[(email||'').toLowerCase()]; }

// ---------------- Token & Static Duplication ----------------
const HUB_SRC = path.join(__dirname,'public','tasks.html');
const TASK_FILES = {casestudy:'casestudy.html',mail:'mail.html',users:'users.html',alerts:'alerts.html',networking:'networking.html',tenants:'tenants.html',routing:'routing-task5.html',playbook:'compute-instance-disk-full-playbook.html',waf:'waf.html'}; // subset referenced
const GENERATED_DIR = path.join(__dirname,'public','generated');
function mkdirp(p){ try{ fs.mkdirSync(p,{recursive:true}); }catch(_e){} }
mkdirp(GENERATED_DIR);
function ensureTokens(c){ 
  if(!c.taskTokens){ 
    c.taskTokens={hub:makeToken(),casestudy:makeToken(),mail:makeToken(),users:makeToken(),alerts:makeToken(),networking:makeToken(),tenants:makeToken(),routing:makeToken(),playbook:makeToken(),waf:makeToken()}; 
  } else {
    // Ensure new tokens exist for existing candidates
    if(!c.taskTokens.routing) c.taskTokens.routing = makeToken();
    if(!c.taskTokens.playbook) c.taskTokens.playbook = makeToken();
    if(!c.taskTokens.tenants) c.taskTokens.tenants = makeToken();
    if(!c.taskTokens.waf) c.taskTokens.waf = makeToken();
  }
}
function ensureStaticCopies(c){
  if(!c || !c.slug) return;
  const base = path.join(GENERATED_DIR, c.slug);
  const hubTarget = path.join(base,'tasks.html');
  if(fs.existsSync(hubTarget)){ c.staticPath='/generated/'+c.slug+'/tasks.html'; return; }
  mkdirp(base);
  try {
    let hub=fs.readFileSync(HUB_SRC,'utf8');
    // convert absolute task links to relative in static copy
    hub=hub.replace(/href="\/task\/casestudy.html"/g,'href="casestudy.html"')
          .replace(/href="\/task\/mail.html"/g,'href="mail.html"')
          .replace(/href="\/task\/users.html"/g,'href="users.html"')
          .replace(/href="\/task\/alerts.html"/g,'href="alerts.html"')
          .replace(/href="\/task\/networking.html"/g,'href="networking.html"')
          .replace(/href="\/task\/tenants.html"/g,'href="tenants.html"')
          .replace(/href="\/task\/routing-task5.html"/g,'href="routing-task5.html"')
          .replace(/href="\/task\/compute-instance-disk-full-playbook.html"/g,'href="compute-instance-disk-full-playbook.html"')
          .replace(/href="\/task\/waf.html"/g,'href="waf.html"')
          .replace(/href="\/tasks.html"/g,'href="tasks.html"');
    fs.writeFileSync(hubTarget, hub);
    Object.values(TASK_FILES).forEach(f=>{
      const src=path.join(__dirname,'public','task',f);
      if(fs.existsSync(src)) fs.copyFileSync(src, path.join(base,f));
    });
    c.staticPath='/generated/'+c.slug+'/tasks.html';
  } catch(e){ console.error('Static copy failed', e); }
}

// ---------------- Middleware ----------------
app.use(bodyParser.json({limit:'2mb'}));
app.use(cookieParser());
// Universal no-cache per requirements
app.use((req,res,next)=>{
  res.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma','no-cache');
  next();
});

// Root login page
app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'public','login.html')));

// Early redirect / guard for legacy task paths
app.use((req,res,next)=>{
  try {
    const p=req.path;
    if(p==='/admin.html' && req.cookies.admin!=='1') return res.redirect('/admin-login.html');
    if(p==='/manager.html' && req.cookies.manager!=='1' && req.cookies.admin!=='1') return res.redirect('/admin-login.html');
    
    // Redirect /generated/ URLs to tokenized /c/ URLs to avoid duplicates
    // BUT allow direct access to task HTML files
    if(p.startsWith('/generated/')){
      const parts = p.split('/').filter(Boolean);
      if(parts[0] === 'generated' && parts[1]){
        const slug = parts[1];
        
        // Allow direct access to task files (casestudy.html, routing-task5.html, etc.)
        // Only redirect if accessing tasks.html (the hub)
        if(parts[2] && parts[2].toLowerCase() === 'tasks.html'){
          const st=readState(); ensureCandidatesArray(st);
          const cand=(st.candidates||[]).find(c=>c.slug===slug);
          if(cand){
            ensureTokens(cand);
            // Redirect to tokenized hub URL
            return res.redirect('/c/'+slug+'/'+cand.taskTokens.hub);
          }
        }
        // For all other files (task pages), allow direct access - fall through to static file serving
      }
    }
    
    const legacy = (p==='/tasks.html' || p.startsWith('/task/'));
    if(legacy){
      // Allow static assets (images, css, js) from routing folder
      if(p.startsWith('/task/routing/assets/') || p.startsWith('/task/routing/css/') || p.startsWith('/task/routing/js/')) {
        return next();
      }
      
      if(req.cookies.candidate!=='1') return res.redirect('/');
      const st=readState(); ensureCandidatesArray(st);
      const slug=req.cookies.candidateSlug;
      if(slug){
        const cand=(st.candidates||[]).find(c=>c.slug===slug);
        if(cand){ ensureTokens(cand); ensureStaticCopies(cand); writeState(st);
          if(p==='/tasks.html') return res.redirect(cand.staticPath);
          const file=p.replace(/^\/task\//,'').toLowerCase();
            const map={'casestudy.html':'casestudy','mail.html':'mail','users.html':'users','alerts.html':'alerts','networking.html':'networking','tenants.html':'tenants','routing-task5.html':'routing-task5','compute-instance-disk-full-playbook.html':'compute-instance-disk-full-playbook'};
            const key=map[file];
            if(key) return res.redirect('/generated/'+slug+'/'+key+'.html');
            return res.redirect(cand.staticPath);
        }
      }
    }
    // /generated/ pages now publicly viewable if someone has the link (requirement change)
  } catch(e){ /* swallow */ }
  next();
});

// Serve static assets (after guard)
// Special handling for topology image with correct MIME type
app.get('/task/routing/assets/topology.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.sendFile(path.join(__dirname, 'public', 'task', 'routing', 'assets', 'topology.png'));
});

app.use(express.static(path.join(__dirname,'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    }
  }
}));

// Helpers
function requireCandidate(req,res,next){ if(req.cookies.candidate==='1') return next(); return res.redirect('/'); }
function requireAdmin(req,res,next){ if(req.cookies.admin==='1') return next(); return res.redirect('/admin-login.html'); }

// ---------------- Tokenized Hub & Tasks ----------------
app.get('/c/:slug/:token',(req,res)=>{
  const {slug,token}=req.params;
  const st=readState(); ensureCandidatesArray(st);
  const cand=(st.candidates||[]).find(c=>c.slug===slug);
  if(!cand) return res.status(404).send('Not found');
  const owner=req.cookies.candidate==='1' && req.cookies.candidateSlug===slug;
  const admin=req.cookies.admin==='1';
  const manager=req.cookies.manager==='1';
  
  ensureTokens(cand);
  const tCand=cand.taskTokens||{};
  const tokenMatches = Object.values(tCand).includes(token);
  
  // If admin or manager, allow access and set candidate cookies for iframe functionality
  if((admin || manager) && tokenMatches){
    res.cookie('candidate','1',{httpOnly:false,sameSite:'lax',maxAge:2*60*60*1000});
    res.cookie('candidateSlug',slug,{httpOnly:false,sameSite:'lax',maxAge:2*60*60*1000});
  }
  // Fallback: if not owner/admin/manager but token matches candidate task tokens, auto-set candidate cookies
  else if(!owner && !admin && !manager){
    if(tokenMatches){
      // Auto-authenticate candidate for convenience (single-link access)
      res.cookie('candidate','1',{httpOnly:false,sameSite:'lax',maxAge:2*60*60*1000});
      res.cookie('candidateSlug',slug,{httpOnly:false,sameSite:'lax',maxAge:2*60*60*1000});
    } else {
      return res.status(403).send('Forbidden');
    }
  }
  writeState(st);
  const t=cand.taskTokens;
  if(token===t.hub){
    try {
      let html=fs.readFileSync(HUB_SRC,'utf8');
      html=html.replace(/href="\/task\/casestudy.html"/g,'href="/c/'+slug+'/'+t.casestudy+'"')
               .replace(/href="\/task\/mail.html"/g,'href="/c/'+slug+'/'+t.mail+'"')
               .replace(/href="\/task\/users.html"/g,'href="/c/'+slug+'/'+t.users+'"')
               .replace(/href="\/task\/alerts.html"/g,'href="/c/'+slug+'/'+t.alerts+'"')
               .replace(/href="\/task\/networking.html"/g,'href="/c/'+slug+'/'+t.networking+'"')
               .replace(/href="\/task\/tenants.html"/g,'href="/c/'+slug+'/'+t.tenants+'"')
               .replace(/href="\/task\/routing-task5.html"/g,'href="/c/'+slug+'/'+t.routing+'"')
               .replace(/href="\/task\/compute-instance-disk-full-playbook.html"/g,'href="/c/'+slug+'/'+t.playbook+'"')
               .replace(/href="\/task\/waf.html"/g,'href="/c/'+slug+'/'+t.waf+'"')
               .replace(/href="\/tasks.html"/g,'href="/c/'+slug+'/'+t.hub+'"');
      return res.type('html').send(html);
    } catch(e){ return res.status(500).send('Hub load failed'); }
  }
  const map={[t.casestudy]:'casestudy.html',[t.mail]:'mail.html',[t.users]:'users.html',[t.alerts]:'alerts.html',[t.networking]:'networking.html',[t.tenants]:'tenants.html',[t.routing]:'routing-task5.html',[t.playbook]:'compute-instance-disk-full-playbook.html',[t.waf]:'waf.html'};
  const file=map[token];
  if(!file) return res.status(404).send('Unknown task token');
  const full=path.join(__dirname,'public','task',file);
  if(fs.existsSync(full)) return res.sendFile(full);
  return res.status(404).send('Task file missing');
});

// Protect admin page (explicit)
app.get('/admin.html', requireAdmin, (req,res)=> {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(path.join(__dirname,'public','admin.html'));
});

// ---------------- Candidate Auth & Lifecycle ----------------
app.post('/api/candidate/login',(req,res)=>{
  const {name,email}=req.body||{};
  if(!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) return res.status(400).json({error:'invalid email'});
  const safeName=(name||'').trim().slice(0,120);
  
  // Check if candidate is pre-registered by admin
  const st=readState();
  ensureCandidatesArray(st);
  let c=findCandidate(st,email);
  
  if(!c){
    return res.status(403).json({error:'Access denied. You must be registered by an administrator before you can login. Please contact your exam proctor.'});
  }
  
  // Check if exam has been started by admin
  if(!c.startedAt && !c.startTime){
    return res.status(403).json({error:'Your exam has not been started yet. Please wait for the administrator to start your exam session.'});
  }
  
  // Update candidate info if needed
  const updatedSt=saveStateMut(s=>{
    ensureCandidatesArray(s);
    let candidate=findCandidate(s,email);
    if(candidate && safeName && !candidate.name) candidate.name=safeName;
    if(candidate && !candidate.slug){ let slug; const used=new Set(s.candidates.map(x=>x.slug).filter(Boolean)); do{ slug=makeSlug(); } while(used.has(slug)); candidate.slug=slug; }
    if(candidate){ ensureTokens(candidate); ensureStaticCopies(candidate); }
    
    // Log candidate login
    if(!candidate.loginHistory) candidate.loginHistory = [];
    candidate.loginHistory.push({timestamp: Date.now(), ip: req.ip || 'unknown'});
  });
  
  const updatedC=findCandidate(updatedSt,email); 
  const rem=computeRemaining(updatedC);
  res.cookie('candidate','1',{httpOnly:false,maxAge:2*60*60*1000});
  if(updatedC.slug) res.cookie('candidateSlug',updatedC.slug,{httpOnly:false,sameSite:'lax',maxAge:2*60*60*1000});
  res.json({candidate:{email:updatedC.email,name:updatedC.name,startTime:updatedC.startTime,remainingMs:rem.remainingMs,running:rem.running,slug:updatedC.slug,taskTokens:updatedC.taskTokens,staticPath:updatedC.staticPath}});
});

// ---------------- Candidate Answers (MUST come before /api/candidate/:email) ----------------
app.get('/api/candidate/answers',(req,res)=>{ 
  if(req.cookies.candidate!=='1' && req.cookies.admin!=='1' && req.cookies.manager!=='1') return res.status(401).json({error:'auth required'}); 
  const email=(req.query.email||'').toString(); 
  if(!email) return res.status(400).json({error:'email required'}); 
  const st=readState(); 
  ensureAnswersRoot(st); 
  const cand=findCandidate(st,email); 
  console.log('[GET /api/candidate/answers] email:', email, 'found:', !!cand, 'total candidates:', (st.candidates||[]).length);
  if(!cand) return res.status(404).json({error:'candidate not found'}); 
  const answers=getCandidateAnswers(st,email); 
  res.json({ok:true,answers}); 
});

app.post('/api/candidate/answers',(req,res)=>{ 
  const isCandidate = req.cookies.candidate==='1';
  const isAdmin = req.cookies.admin==='1';
  const isManager = req.cookies.manager==='1';
  
  console.log('[POST /api/candidate/answers] Cookies received:', {admin: req.cookies.admin, manager: req.cookies.manager, candidate: req.cookies.candidate, adminUser: req.cookies.adminUser});
  
  // Allow candidates, admins, or managers to save
  if(!isCandidate && !isAdmin && !isManager) {
    return res.status(401).json({error:'authentication required'}); 
  }
  
  const {taskId,fields,email}=req.body||{}; 
  if(!taskId||typeof taskId!=='string') return res.status(400).json({error:'taskId required'}); 
  if(!fields||typeof fields!=='object') return res.status(400).json({error:'fields object required'}); 
  if(!email) return res.status(400).json({error:'email required'}); 
  let updated=null; 
  let candidateSlug=null;
  
  console.log('[POST /api/candidate/answers] email:', email, 'isCandidate:', isCandidate, 'isAdmin:', isAdmin, 'isManager:', isManager, 'taskId:', taskId);
  
  saveStateMut(s=>{ 
    ensureCandidatesArray(s); 
    ensureAnswersRoot(s); 
    const cand=findCandidate(s,email); 
    console.log('[POST answers] Found candidate:', !!cand, 'Locked:', cand ? candidateLocked(cand) : 'N/A', 'isCandidate:', isCandidate);
    // Admin/Manager can save even if locked, candidates cannot
    if(!cand) return;
    if(isCandidate && candidateLocked(cand)) return;
    candidateSlug=cand.slug;
    const ans=getCandidateAnswers(s,email); 
    ans[taskId]=mergeAnswerSet(ans[taskId],fields); 
    updated=ans[taskId]; 
    console.log('[POST answers] Saved for:', email, 'taskId:', taskId, 'updated:', !!updated);
  }); 
  if(!updated) return res.status(404).json({error:'candidate not found or locked'}); 
  
  // Also save to session-specific directory if session exists
  if(candidateSlug && sessionManager.isSessionActive(candidateSlug)){
    const session = sessionManager.getSession(candidateSlug);
    if(session){
      try {
        const answerFile = path.join(session.stateDir, 'answers', `${taskId}.json`);
        fs.writeFileSync(answerFile, JSON.stringify({
          taskId,
          email,
          savedAt: new Date().toISOString(),
          answer: updated
        }, null, 2));
        console.log(`[Answer] Saved ${taskId} to session directory for ${email}`);
        
        // Broadcast answer save event to admin viewers
        broadcastSessionEvent(candidateSlug, 'answer-saved', {
          taskId,
          email,
          timestamp: Date.now(),
          fieldCount: Object.keys(fields).length
        });
      } catch(e){
        console.error('[Answer] Failed to save to session directory:', e);
      }
    }
  }
  
  res.json({ok:true,taskId,answer:updated}); 
});

// Candidate info lookup by slug (for session recovery when localStorage is cleared)
// NOTE: This route MUST come BEFORE /api/candidate/:email to avoid :email matching "info"
app.get('/api/candidate/info',(req,res)=>{ 
  if(req.cookies.candidate!=='1') return res.status(401).json({error:'candidate auth required'}); 
  const slug=req.query.slug||req.cookies.candidateSlug||''; 
  if(!slug) return res.status(400).json({error:'slug required'});
  const st=readState(); 
  ensureCandidatesArray(st); 
  const cand=(st.candidates||[]).find(c=>c.slug===slug); 
  if(!cand) return res.status(404).json({error:'not found'}); 
  console.log('[GET /api/candidate/info] Resolved slug', slug, 'to email:', cand.email);
  res.json({email:cand.email,slug:cand.slug}); 
});

app.get('/api/candidate/:email',(req,res)=>{
  const email=req.params.email||''; const st=readState(); ensureCandidatesArray(st); const c=findCandidate(st,email); if(!c) return res.status(404).json({error:'not found'}); const rem=computeRemaining(c); res.json({email:c.email,name:c.name,startTime:c.startTime,remainingMs:rem.remainingMs,running:rem.running,finishedAt:c.finishedAt,submittedAt:c.submittedAt,expiredAt:c.expiredAt});
});

app.post('/api/candidate/:email/start',(req,res)=>{
  const email=req.params.email||''; const self=req.query.self==='1'; if(req.cookies.admin!=='1' && req.cookies.manager!=='1' && !self) return res.status(401).json({error:'admin or self start required'});
  let updated=null, notFound=false, already=false, anotherRunning=false, runningEmail=null;
  const startedBy = req.cookies.adminUser || req.cookies.managerUser || 'Candidate';
  saveStateMut(s=>{ 
    ensureCandidatesArray(s); 
    const c=findCandidate(s,email); 
    if(!c){ notFound=true; return; } 
    if(c.startTime){ already=true; } 
    else { 
      // Check if any OTHER candidate is currently running
      const otherRunning = (s.candidates || []).find(candidate => 
        candidate.email !== email && 
        candidate.running === true && 
        !candidate.finishedAt
      );
      if(otherRunning) {
        anotherRunning = true;
        runningEmail = otherRunning.email;
        return;
      }
      c.startTime=Date.now(); 
      c.startedAt=Date.now(); 
      c.startedBy=startedBy; 
      c.running=true; 
    } 
    updated=c; 
  });
  if(notFound) return res.status(404).json({error:'not found'});
  if(anotherRunning) return res.status(409).json({error:'Another candidate is currently taking the exam', runningCandidate: runningEmail});
  
  // Always initialize Docker containers (even if already started) for single-candidate mode
  const candidate = updated;
  if (candidate.slug) {
    // Clean up ALL existing exam containers (since only one candidate at a time)
    sessionManager.cleanupAllSessions()
      .then(() => {
        console.log(`[Server] Cleaned up all existing sessions for single-candidate mode`);
        // Now initialize fresh session for this candidate
        return sessionManager.initializeSession(candidate.slug, email);
      })
      .then(result => {
        console.log(`[Server] Fresh session initialized for ${email}:`, result.containerNames);
        // Store session info in candidate record
        saveStateMut(s => {
          const c = findCandidate(s, email);
          if (c) {
            c.sessionInitialized = true;
            // Container names are like "exam-abc123-tokyo", we want just "exam-abc123"
            c.containerPrefix = result.containerNames[0] ? result.containerNames[0].split('-').slice(0, 2).join('-') : null;
          }
        });
        res.json({ok:true,candidate:updated,sessionInitialized:true,containers:result.containerNames,already:already});
      })
      .catch(error => {
        console.error(`[Server] Failed to initialize session for ${email}:`, error);
        res.json({ok:true,candidate:updated,sessionInitialized:false,error:error.message});
      });
  } else {
    res.json({ok:true,candidate:updated,already:already});
  }
});

app.post('/api/admin/candidate/:email/reset', async (req,res)=>{ 
  if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); 
  const email=req.params.email||''; 
  
  let candidate = null;
  saveStateMut(s=>{ 
    ensureCandidatesArray(s); 
    const c=findCandidate(s,email); 
    if(c){ 
      c.startTime=null; 
      c.endTime=null; 
      c.running=false; 
      c.sessionInitialized=false;
      c.submittedAt=null;
      candidate = c;
      
      // Clear all answers for this candidate
      ensureAnswersRoot(s);
      if(s.answers.candidates[email]) {
        s.answers.candidates[email] = {};
      }
    }
  }); 
  
  if(!candidate) return res.status(404).json({error:'candidate not found'});
  
  // Cleanup Docker containers for this candidate
  if(candidate.slug) {
    try {
      await sessionManager.cleanupSession(candidate.slug, false);
      console.log(`[Server] Reset complete: cleaned up session for ${email}`);
    } catch(error) {
      console.error(`[Server] Failed to cleanup session during reset for ${email}:`, error);
    }
  }
  
  res.json({ok:true, message: 'Candidate reset complete. Docker containers cleaned up.'});
});

app.post('/api/admin/candidate/:email/extend',(req,res)=>{ if(req.cookies.admin!=='1' && req.cookies.manager!=='1') return res.status(401).json({error:'admin or manager required'}); const email=req.params.email||''; let minutes=parseInt((req.body&&req.body.minutes)||0,10); if(!minutes||minutes<1) return res.status(400).json({error:'minutes>0 required'}); if(minutes>480) minutes=480; let updated=null; saveStateMut(s=>{ ensureCandidatesArray(s); const c=findCandidate(s,email); if(!c) return; c.extraTimeMs=(c.extraTimeMs||0)+minutes*60000; updated=c; }); if(!updated) return res.status(404).json({error:'not found'}); const rem=computeRemaining(updated); res.json({ok:true,remainingMs:rem.remainingMs,totalDurationMs:rem.totalDurationMs}); });

app.post('/api/admin/candidate/:email/finish',(req,res)=>{ if(req.cookies.admin!=='1' && req.cookies.manager!=='1') return res.status(401).json({error:'admin required'}); const email=req.params.email||''; let finished=null; saveStateMut(s=>{ ensureCandidatesArray(s); const c=findCandidate(s,email); if(!c) return; c.endTime=Date.now(); c.running=false; c.submittedAt=Date.now(); c.finishedAt=Date.now(); c.finishedBy=(req.cookies.managerUser||req.cookies.adminUser||'Admin'); finished=c; }); if(!finished) return res.status(404).json({error:'not found'}); res.json({ok:true,candidate:finished}); });

app.delete('/api/admin/candidate/:email',(req,res)=>{ if(req.cookies.admin!=='1' && req.cookies.manager!=='1') return res.status(401).json({error:'admin or manager required'}); const email=(req.params.email||'').toLowerCase(); let removed=false; saveStateMut(s=>{ ensureCandidatesArray(s); const before=s.candidates.length; s.candidates=s.candidates.filter(c=> c.email.toLowerCase()!==email); removed=before!==s.candidates.length; ensureAnswersRoot(s); if(s.answers.candidates[email]) delete s.answers.candidates[email]; }); if(!removed) return res.status(404).json({error:'not found'}); res.json({ok:true}); });

app.delete('/api/admin/candidates/all',(req,res)=>{ if(req.cookies.admin!=='1' && req.cookies.manager!=='1') return res.status(401).json({error:'admin or manager required'}); let count=0; saveStateMut(s=>{ ensureCandidatesArray(s); count=s.candidates.length; s.candidates=[]; ensureAnswersRoot(s); s.answers.candidates={}; }); res.json({ok:true,deleted:count}); });

app.post('/api/admin/candidate',(req,res)=>{ if(req.cookies.admin!=='1' && req.cookies.manager!=='1') return res.status(401).json({error:'admin required'}); const {name,email}=req.body||{}; if(!email) return res.status(400).json({error:'email required'}); let candidate=null; let isNew=false; const createdBy=req.cookies.adminUser||req.cookies.managerUser||'Admin'; saveStateMut(s=>{ ensureCandidatesArray(s); if(!findCandidate(s,email)){ isNew=true; const newCand={email,name:(name||'').trim(),startTime:null,endTime:null,createdAt:Date.now(),createdBy:createdBy,extraTimeMs:0}; s.candidates.push(newCand); const c=findCandidate(s,email); if(c && !c.slug){ let slug; const used=new Set(s.candidates.map(x=>x.slug).filter(Boolean)); do{ slug=makeSlug(); } while(used.has(slug)); c.slug=slug; } candidate=c; } else { candidate=findCandidate(s,email); } }); console.log(`[Admin] Candidate ${isNew?'created':'retrieved'}: ${email} by ${createdBy}`); res.json({ok:true,candidate,created:isNew}); });

app.get('/api/admin/candidates',(req,res)=>{ 
  // Allow both admin and manager to access
  if(req.cookies.admin!=='1' && req.cookies.manager!=='1') return res.status(401).json({error:'admin or manager required'}); 
  const st=readState(); 
  ensureCandidatesArray(st); 
  let tokensUpdated = false;
  const list=st.candidates.map(c=>{ 
    ensureTokens(c); // Ensure all candidates have all tokens including routing
    if(!c.taskTokens.routing || !c.taskTokens.playbook || !c.taskTokens.tenants || !c.taskTokens.waf) {
      tokensUpdated = true;
    }
    const rem=computeRemaining(c); 
    return {...c,remainingMs:rem.remainingMs,totalDurationMs:rem.totalDurationMs,endTime:rem.endTime,running:rem.running}; 
  }); 
  if(tokensUpdated) {
    writeState(st); // Save if tokens were added
  }
  res.json({total:list.length,candidates:list}); 
});

// Admin lookup candidate by slug (for viewer auto-hydration)
app.get('/api/admin/slug/:slug/info',(req,res)=>{ 
  if(req.cookies.admin!=='1' && req.cookies.manager!=='1') return res.status(401).json({error:'admin or manager required'}); 
  const slug=req.params.slug||''; 
  const st=readState(); 
  ensureCandidatesArray(st); 
  const cand=(st.candidates||[]).find(c=>c.slug===slug); 
  if(!cand) return res.status(404).json({error:'not found'}); 
  ensureTokens(cand); // Ensure all tokens exist
  writeState(st); // Save the updated tokens
  res.json({email:cand.email,slug:cand.slug,taskTokens:cand.taskTokens||{},submittedAt:cand.submittedAt||null}); 
});

// Public slug info (no auth) - exposes only email & slug
app.get('/public/slug/:slug/info',(req,res)=>{ const slug=req.params.slug||''; const st=readState(); ensureCandidatesArray(st); const cand=(st.candidates||[]).find(c=>c.slug===slug); if(!cand) return res.status(404).json({error:'not found'}); res.json({email:cand.email,slug:cand.slug}); });

// Public answers view (no auth) - returns sanitized answers
app.get('/public/slug/:slug/answers',(req,res)=>{ const slug=req.params.slug||''; const st=readState(); ensureCandidatesArray(st); const cand=(st.candidates||[]).find(c=>c.slug===slug); if(!cand) return res.status(404).json({error:'not found'}); ensureAnswersRoot(st); const raw=getCandidateAnswers(st,cand.email); const sanitized={}; Object.entries(raw).forEach(([taskId,obj])=>{ if(obj && obj.fields){ sanitized[taskId]={updatedAt:obj.updatedAt||null,fields:obj.fields}; } }); res.json({slug,email:cand.email,answers:sanitized}); });

// ---------------- Session Management APIs ----------------

// Snapshot session when candidate finishes
app.post('/api/session/:sessionId/snapshot', async (req, res) => {
  if (req.cookies.admin !== '1' && req.cookies.candidateSlug !== req.params.sessionId) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  
  const sessionId = req.params.sessionId;
  const result = await sessionManager.snapshotSession(sessionId);
  res.json(result);
});

// Cleanup session (admin only)
app.post('/api/session/:sessionId/cleanup', async (req, res) => {
  if (req.cookies.admin !== '1') {
    return res.status(401).json({ error: 'admin required' });
  }
  
  const sessionId = req.params.sessionId;
  const preserveState = req.body.preserveState !== false;
  const result = await sessionManager.cleanupSession(sessionId, preserveState);
  res.json(result);
});

// List all sessions (admin only)
app.get('/api/admin/sessions', async (req, res) => {
  if (req.cookies.admin !== '1') {
    return res.status(401).json({ error: 'admin required' });
  }
  
  const sessions = await sessionManager.listAllSessions();
  res.json({ sessions });
});

// Get session details (admin only)
app.get('/api/admin/session/:sessionId/details', async (req, res) => {
  if (req.cookies.admin !== '1') {
    return res.status(401).json({ error: 'admin required' });
  }
  
  const sessionId = req.params.sessionId;
  const details = await sessionManager.getSessionDetails(sessionId);
  
  if (!details) {
    return res.status(404).json({ error: 'session not found' });
  }
  
  res.json(details);
});

// Get terminal logs for a session (admin only)
app.get('/api/admin/session/:sessionId/terminal-logs', async (req, res) => {
  if (req.cookies.admin !== '1') {
    return res.status(401).json({ error: 'admin required' });
  }
  
  const sessionId = req.params.sessionId;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'session not found' });
  }
  
  const terminalLogsDir = path.join(session.stateDir, 'terminal-logs');
  const logs = {};
  
  try {
    if (fs.existsSync(terminalLogsDir)) {
      const files = fs.readdirSync(terminalLogsDir);
      for (const file of files) {
        if (file.endsWith('.log')) {
          const containerName = file.replace('.log', '');
          const logPath = path.join(terminalLogsDir, file);
          const content = fs.readFileSync(logPath, 'utf8');
          logs[containerName] = content;
        }
      }
    }
  } catch (error) {
    console.error('[API] Failed to read terminal logs:', error);
  }
  
  res.json({ sessionId, logs });
});

// ============ Task 4: User Management API (per-candidate storage) ============
// Get users for current candidate
app.get('/api/users', (req, res) => {
  const candidateSlug = req.cookies.candidateSlug;
  if (!candidateSlug) {
    return res.status(401).json({ error: 'not logged in' });
  }
  
  const st = readState();
  if (!st.task4Users) st.task4Users = {};
  
  // Initialize users for this candidate if not exists
  if (!st.task4Users[candidateSlug]) {
    st.task4Users[candidateSlug] = generateFreshUsers();
    writeState(st);
  }
  
  res.json({ users: st.task4Users[candidateSlug] });
});

// Add a user (current candidate only)
app.post('/api/users', (req, res) => {
  const candidateSlug = req.cookies.candidateSlug;
  if (!candidateSlug) {
    return res.status(401).json({ error: 'not logged in' });
  }
  
  const { firstName, lastName, role } = req.body;
  if (!firstName || !lastName || !role) {
    return res.status(400).json({ error: 'firstName, lastName, and role required' });
  }
  
  const st = readState();
  if (!st.task4Users) st.task4Users = {};
  if (!st.task4Users[candidateSlug]) {
    st.task4Users[candidateSlug] = generateFreshUsers();
  }
  
  const users = st.task4Users[candidateSlug];
  const newId = Math.max(0, ...users.map(u => u.id)) + 1;
  const newUser = { id: newId, firstName, lastName, role };
  users.push(newUser);
  
  st.task4Users[candidateSlug] = users;
  writeState(st);
  
  res.json({ ok: true, user: newUser });
});

// Delete a user (current candidate only)
app.delete('/api/users/:id', (req, res) => {
  const candidateSlug = req.cookies.candidateSlug;
  if (!candidateSlug) {
    return res.status(401).json({ error: 'not logged in' });
  }
  
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'invalid user id' });
  }
  
  const st = readState();
  if (!st.task4Users) st.task4Users = {};
  if (!st.task4Users[candidateSlug]) {
    return res.status(404).json({ error: 'no users found' });
  }
  
  const users = st.task4Users[candidateSlug];
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) {
    return res.status(404).json({ error: 'user not found' });
  }
  
  users.splice(idx, 1);
  st.task4Users[candidateSlug] = users;
  writeState(st);
  
  res.json({ ok: true, deletedId: userId });
});

// Reset users to fresh 1000 (current candidate only)
app.post('/api/users/reset', (req, res) => {
  const candidateSlug = req.cookies.candidateSlug;
  if (!candidateSlug) {
    return res.status(401).json({ error: 'not logged in' });
  }
  
  const st = readState();
  if (!st.task4Users) st.task4Users = {};
  st.task4Users[candidateSlug] = generateFreshUsers();
  writeState(st);
  
  res.json({ ok: true, users: st.task4Users[candidateSlug] });
});

// Helper function to generate fresh 10000 users (500 inactive + 9500 valid)
function generateFreshUsers() {
  const firstNames = ['Liam','Emma','Noah','Olivia','Elijah','Ava','Sophia','Mason','Isabella','Logan','Mia','Lucas','Charlotte','Amelia','Ethan','Harper','James','Evelyn','Benjamin','Abigail','Henry','Ella','Sebastian','Avery','Jackson','Scarlett','Alexander','Emily','Owen','Aria','Daniel','Layla','Matthew','Chloe','Wyatt','Mila','Carter','Nora','Julian','Lily','Grayson','Zoey','Leo','Riley','Isaac','Victoria','Lincoln','Aurora','Ezra','Penelope'];
  const lastNames = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores','Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter'];
  const validRoles = ['admin','user','guest','support'];
  
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const users = [];
  let nextId = 1;
  
  // Generate 500 inactive users
  for (let i = 0; i < 500; i++) {
    users.push({
      id: nextId++,
      firstName: rand(firstNames),
      lastName: rand(lastNames),
      role: 'inactive'
    });
  }
  
  // Generate 9500 users with valid roles
  for (let i = 0; i < 9500; i++) {
    users.push({
      id: nextId++,
      firstName: rand(firstNames),
      lastName: rand(lastNames),
      role: rand(validRoles)
    });
  }
  
  // Shuffle array so inactive users are mixed in
  for (let i = users.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [users[i], users[j]] = [users[j], users[i]];
  }
  
  return users;
}

// Get live candidate view (admin only) - returns all current answers + terminal logs
app.get('/api/admin/candidate/:email/live-view', async (req, res) => {
  if (req.cookies.admin !== '1' && req.cookies.manager !== '1') {
    return res.status(401).json({ error: 'admin or manager required' });
  }
  
  const email = req.params.email;
  const st = readState();
  ensureCandidatesArray(st);
  const cand = (st.candidates || []).find(c => c.email === email);
  
  if (!cand) {
    return res.status(404).json({ error: 'candidate not found' });
  }
  
  // Get answers
  ensureAnswersRoot(st);
  const answers = getCandidateAnswers(st, email);
  
  // Get session info
  let sessionInfo = null;
  let terminalLogs = {};
  
  if (cand.sessionId) {
    const session = sessionManager.getSession(cand.sessionId);
    if (session) {
      sessionInfo = {
        sessionId: cand.sessionId,
        containers: session.containers.map(c => c.name),
        startedAt: session.startedAt
      };
      
      // Get terminal logs
      const terminalLogsDir = path.join(session.stateDir, 'terminal-logs');
      try {
        if (fs.existsSync(terminalLogsDir)) {
          const files = fs.readdirSync(terminalLogsDir);
          for (const file of files) {
            if (file.endsWith('.log')) {
              const containerName = file.replace('.log', '');
              const logPath = path.join(terminalLogsDir, file);
              const content = fs.readFileSync(logPath, 'utf8');
              // Return last 5000 characters to avoid huge payloads
              terminalLogs[containerName] = content.slice(-5000);
            }
          }
        }
      } catch (error) {
        console.error('[API] Failed to read terminal logs:', error);
      }
    }
  }
  
  res.json({
    email,
    slug: cand.slug,
    answers,
    session: sessionInfo,
    terminalLogs
  });
});

// Save terminal history during session
app.post('/api/session/:sessionId/terminal/:terminalId/history', async (req, res) => {
  const { sessionId, terminalId } = req.params;
  const { history } = req.body;
  
  if (!history) {
    return res.status(400).json({ error: 'history required' });
  }
  
  await sessionManager.saveTerminalHistory(sessionId, terminalId, history);
  res.json({ ok: true });
});

// ---------------- Admin Auth ----------------
// Admin/staff directory
const STAFF_DIRECTORY = [
  {name:'Nastasya Narsia', email:'nastasyan@checkpoint.com', phone:'0525090113', manager:true},
  {name:'Shay Naveh', email:'shayn@checkpoint.com', phone:'0523485099', manager:true},
  {name:'Othman Kharoubi', email:'othmank@checkpoint.com', phone:'0547586780', manager:true},
  {name:'Ahmed Hanni', email:'ahmedh@checkpoint.com', phone:'0549961976'},
  {name:'Ayham Ghanem', email:'ayhamg@checkpoint.com', phone:'0584666228'},
  {name:'Benjamin Sabbag', email:'benjaminsa@checkpoint.com', phone:'0523020782'},
  {name:'David Elik', email:'davidel@checkpoint.com', phone:'0528587773'},
  {name:'Guy Regev', email:'guyreg@checkpoint.com', phone:'0524445853'},
  {name:'Ilee Levanon', email:'ileel@checkpoint.com', phone:'0535232542'},
  {name:'Mohamad Asi', email:'mohamadasi@checkpoint.com', phone:'0556658395'},
  {name:'Mousa Bakri', email:'mousab@checkpoint.com', phone:'0547507553'},
  {name:'Sliman Ayashe', email:'slimana@checkpoint.com', phone:'0547507553'},
  {name:'Yana Silutin', email:'yanasi@checkpoint.com', phone:'0542519667'},
  {name:'Lihia S', email:'lihias@checkpoint.com', phone:'0542578783'},
  {name:'Nitai D', email:'nitaid@checkpoint.com', phone:'0548181885'}
];

app.get('/api/admin/staff',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const st=readState(); const onCall=st.onCall||''; res.json({ok:true,onCall,staff:STAFF_DIRECTORY}); });

app.post('/api/auth/admin-login',(req,res)=>{ 
  const {password,username}=req.body||{}; 
  const expected=process.env.ADMIN_PASSWORD||'2025'; 
  if(password!==expected) return res.status(401).json({error:'bad password'}); 

  const sanitized=(username||'').trim().toLowerCase().replace(/[^a-z0-9._@-]/g,'');
  if(!sanitized) return res.status(400).json({error:'username required'});

  const fullEmail = sanitized.includes('@') ? sanitized : `${sanitized}@checkpoint.com`;
  const allowed=STAFF_DIRECTORY.find(s=> s.email.toLowerCase()===fullEmail);
  if(!allowed) return res.status(403).json({error:'unauthorized user'});

  res.cookie('admin','1',{httpOnly:false,sameSite:'lax'});
  res.cookie('adminUser',allowed.email,{httpOnly:false,sameSite:'lax'});
  
  // Log admin login
  saveStateMut(s=>{
    if(!s.systemLogs) s.systemLogs=[];
    s.systemLogs.push({timestamp:Date.now(),action:'admin_login',user:allowed.email,name:allowed.name,ip:req.ip||'unknown'});
  });
  console.log(`[Auth] Admin login: ${allowed.email}`);
  
  res.json({ok:true,user:allowed.email}); 
});
app.post('/api/auth/admin-logout',(req,res)=>{ res.clearCookie('admin'); res.json({ok:true}); });

// ---------------- Manager Authentication ----------------
app.post('/api/auth/manager-login',(req,res)=>{ 
  const {password,username}=req.body||{}; 
  const expected=process.env.ADMIN_PASSWORD||'2025'; 
  if(password!==expected) return res.status(401).json({error:'bad password'}); 

  const sanitized=(username||'').trim().toLowerCase().replace(/[^a-z0-9._@-]/g,'');
  if(!sanitized) return res.status(400).json({error:'username required'});

  const fullEmail = sanitized.includes('@') ? sanitized : `${sanitized}@checkpoint.com`;
  const manager=STAFF_DIRECTORY.find(s=> s.email.toLowerCase()===fullEmail && s.manager===true);
  if(!manager) return res.status(403).json({error:'unauthorized - managers only'});

  res.cookie('manager','1',{httpOnly:false,sameSite:'lax'});
  res.cookie('managerUser',manager.email,{httpOnly:false,sameSite:'lax'});
  
  // Log manager login
  saveStateMut(s=>{
    if(!s.systemLogs) s.systemLogs=[];
    s.systemLogs.push({timestamp:Date.now(),action:'manager_login',user:manager.email,name:manager.name,ip:req.ip||'unknown'});
  });
  console.log(`[Auth] Manager login: ${manager.email}`);
  
  res.json({ok:true,user:manager.email,name:manager.name}); 
});

app.post('/api/auth/manager-logout',(req,res)=>{ 
  res.clearCookie('manager'); 
  res.clearCookie('managerUser'); 
  res.json({ok:true}); 
});

app.get('/api/manager/check',(req,res)=>{ 
  if(req.cookies.manager!=='1') return res.status(401).json({error:'manager required'}); 
  const email=req.cookies.managerUser||'';
  const manager=STAFF_DIRECTORY.find(s=>s.email===email);
  res.json({ok:true,email,name:manager?manager.name:'Manager'}); 
});

app.get('/api/manager/finished-exams',(req,res)=>{ 
  if(req.cookies.manager!=='1') return res.status(401).json({error:'manager required'}); 
  const st=readState(); 
  ensureCandidatesArray(st);
  
  // Return only finished or expired exams
  const finished=(st.candidates||[]).filter(c=>{
    return c.finishedAt || c.expiredAt;
  }).map(c=>({
    name:c.name,
    email:c.email,
    slug:c.slug,
    taskTokens:c.taskTokens,
    startedAt:c.startedAt,
    finishedAt:c.finishedAt,
    expiredAt:c.expiredAt,
    duration:c.finishedAt && c.startedAt ? c.finishedAt-c.startedAt : null,
    scores:c.scores,
    totalScore:c.totalScore
  }));
  
  res.json({ok:true,candidates:finished}); 
});

// Save candidate score (manager only)
app.post('/api/manager/candidate/:email/score',(req,res)=>{
  if(req.cookies.manager!=='1') return res.status(401).json({error:'manager required'});
  const email=req.params.email||'';
  const {scores,totalScore}=req.body||{};
  
  if(!email || !scores) return res.status(400).json({error:'email and scores required'});
  
  let updated=null;
  saveStateMut(s=>{
    ensureCandidatesArray(s);
    const c=findCandidate(s,email);
    if(!c) return;
    c.scores=scores;
    c.totalScore=totalScore;
    c.scoredAt=Date.now();
    c.scoredBy=req.cookies.managerUser||'Manager';
    updated=c;
  });
  
  if(!updated) return res.status(404).json({error:'candidate not found'});
  res.json({ok:true,candidate:updated});
});

app.get('/api/admin/system-logs',(req,res)=>{
  if(req.cookies.admin!=='1' && req.cookies.manager!=='1') return res.status(401).json({error:'auth required'});
  const st=readState();
  ensureCandidatesArray(st);
  
  // Build logs from candidate events and system logs
  const logs=[];
  
  // Add system-level logs (admin/manager logins, etc)
  if(st.systemLogs && Array.isArray(st.systemLogs)){
    st.systemLogs.forEach(log=>{
      logs.push({
        timestamp:log.timestamp,
        action:log.action,
        candidateEmail:log.user||'-',
        performedBy:log.name||log.user||'System',
        details:log.ip?`IP: ${log.ip}`:'-'
      });
    });
  }
  
  (st.candidates||[]).forEach(c=>{
    // Log candidate creation
    if(c.createdAt){
      logs.push({
        timestamp:c.createdAt,
        action:'candidate_created',
        candidateEmail:c.email,
        performedBy:c.createdBy||'Admin',
        details:`Name: ${c.name||'Not set'}`
      });
    }
    
    // Log candidate logins
    if(c.loginHistory && Array.isArray(c.loginHistory)){
      c.loginHistory.forEach(login=>{
        logs.push({
          timestamp:login.timestamp,
          action:'candidate_login',
          candidateEmail:c.email,
          performedBy:'Candidate',
          details:`IP: ${login.ip||'unknown'}`
        });
      });
    }
    
    if(c.startedAt){
      logs.push({
        timestamp:c.startedAt,
        action:'start',
        candidateEmail:c.email,
        performedBy:c.startedBy||'Admin',
        details:`Started exam (${c.duration||120}min duration)`
      });
    }
    
    if(c.finishedAt){
      logs.push({
        timestamp:c.finishedAt,
        action:'finish',
        candidateEmail:c.email,
        performedBy:c.finishedBy||'Candidate',
        details:`Exam completed`
      });
    }
    
    if(c.resetAt){
      logs.push({
        timestamp:c.resetAt,
        action:'reset',
        candidateEmail:c.email,
        performedBy:c.resetBy||'Admin',
        details:`Exam reset`
      });
    }
    
    if(c.deletedAt){
      logs.push({
        timestamp:c.deletedAt,
        action:'delete',
        candidateEmail:c.email,
        performedBy:c.deletedBy||'Admin',
        details:`Candidate deleted`
      });
    }
    
    if(c.extendHistory && Array.isArray(c.extendHistory)){
      c.extendHistory.forEach(ext=>{
        logs.push({
          timestamp:ext.timestamp,
          action:'extend',
          candidateEmail:c.email,
          performedBy:ext.by||'Admin',
          details:`Added ${ext.minutes} minutes`
        });
      });
    }
  });
  
  // Sort by timestamp descending (newest first)
  logs.sort((a,b)=>b.timestamp-a.timestamp);
  
  res.json({ok:true,logs});
});

// ---------------- Candidate Task Submission ----------------
app.post('/api/candidate/task1/save',(req,res)=>{ if(req.cookies.candidate!=='1') return res.status(401).json({error:'candidate required'}); const {email,fields}=req.body||{}; if(!email) return res.status(400).json({error:'email required'}); if(!fields||typeof fields!=='object') return res.status(400).json({error:'fields object required'}); let updated=null; let candRef=null; saveStateMut(s=>{ ensureCandidatesArray(s); ensureAnswersRoot(s); const c=findCandidate(s,email); if(!c){return;} candRef=c; if(candidateLocked(c)||c.task1SubmittedAt) return; const ans=getCandidateAnswers(s,email); ans.task1=mergeAnswerSet(ans.task1,fields); updated=ans.task1; }); if(!candRef) return res.status(404).json({error:'candidate not found'}); if(!updated) return res.status(400).json({error:'task1 locked or not updated'}); res.json({ok:true,answer:updated}); });

app.post('/api/candidate/task1/submit',(req,res)=>{ if(req.cookies.candidate!=='1') return res.status(401).json({error:'candidate required'}); const {email}=req.body||{}; if(!email) return res.status(400).json({error:'email required'}); let candRef=null; saveStateMut(s=>{ ensureCandidatesArray(s); const c=findCandidate(s,email); if(!c) return; candRef=c; if(!c.task1SubmittedAt) c.task1SubmittedAt=Date.now(); }); if(!candRef) return res.status(404).json({error:'candidate not found'}); res.json({ok:true,task1SubmittedAt:candRef.task1SubmittedAt}); });

app.post('/api/candidate/submit',(req,res)=>{ 
  if(req.cookies.candidate!=='1') return res.status(401).json({error:'candidate required'}); 
  const email=(req.body&&req.body.email)||''; 
  if(!email) return res.status(400).json({error:'email required'}); 
  let candRef=null; 
  let candidateSlug=null;
  saveStateMut(s=>{ 
    ensureCandidatesArray(s); 
    const c=findCandidate(s,email); 
    if(!c) return; 
    candRef=c; 
    candidateSlug=c.slug;
    if(!c.submittedAt){ 
      c.submittedAt=Date.now(); 
      c.finishedAt=Date.now(); // Mark as finished
      c.endTime=Date.now(); // Set end time
      c.running=false; // Stop the timer
      c.finishedBy='Candidate'; // Track who finished
      ensureAnswersRoot(s); 
      const answers=getCandidateAnswers(s,email); 
      s.answers.finalSnapshots[email.toLowerCase()]={createdAt:Date.now(),answers:JSON.parse(JSON.stringify(answers))}; 
    } 
  }); 
  if(!candRef) return res.status(404).json({error:'candidate not found'}); 
  
  // Snapshot session on submission
  if(candidateSlug && sessionManager.isSessionActive(candidateSlug)){
    console.log(`[Submit] Creating session snapshot for ${email}`);
    sessionManager.snapshotSession(candidateSlug)
      .then(result => {
        console.log(`[Submit] Snapshot complete for ${email}:`, result);
        // Optionally cleanup containers but preserve state
        return sessionManager.cleanupSession(candidateSlug, true);
      })
      .then(() => {
        console.log(`[Submit] Session cleanup complete for ${email}`);
      })
      .catch(error => {
        console.error(`[Submit] Snapshot/cleanup failed for ${email}:`, error);
      });
  }
  
  res.json({ok:true,submittedAt:candRef.submittedAt}); 
});

// ---------------- File Upload (PDF + DOCX) ----------------
const uploadStorage = multer.diskStorage({
  destination: function(_req,_file,cb){ cb(null, ensureUploadsDirs()); },
  filename: function(req,file,cb){
    const email=(req.body.email||'unknown').toLowerCase().replace(/[^a-z0-9@._-]/g,'_');
    const ts=Date.now();
    const ext=path.extname(file.originalname)||'';
    const kind = file.fieldname==='pdfFile' ? 'final' : 'work';
    cb(null, email+'_'+kind+'_'+ts+ext);
  }
});
const upload = multer({storage:uploadStorage, limits:{fileSize:15*1024*1024}}); // 15MB per file

app.post('/api/candidate/upload-final', upload.fields([{name:'pdfFile',maxCount:1},{name:'docxFile',maxCount:1}]), (req,res)=>{
  const email=(req.body.email||'').toLowerCase();
  if(!email) return res.status(400).json({error:'email required'});
  if(req.cookies.candidate!=='1' || (req.cookies.candidate==='1' && req.cookies.candidateSlug && !findCandidate(readState(),email))){
    // Basic candidate presence check; not strict slug match (email param drives)
  }
  let filesSaved=[];
  if(req.files){
    Object.values(req.files).forEach(list=> list.forEach(f=> filesSaved.push({field:f.fieldname,size:f.size,name:f.filename}))); }
  // Mark candidate exam over (lock) regardless of previous state
  let locked=null; saveStateMut(s=>{ ensureCandidatesArray(s); const c=findCandidate(s,email); if(!c) return; if(!c.submittedAt) c.submittedAt=Date.now(); c.fileSubmissionAt=Date.now(); locked=c; ensureSubmissions(s); if(!s.submissions.uploads) s.submissions.uploads={}; s.submissions.uploads[email]={time:Date.now(),files:filesSaved}; });
  res.json({ok:true,files:filesSaved,locked:!!locked});
});

// ---------------- Session Asset (Screenshot) Upload ----------------
// Allows candidates to upload small screenshot images tied to a session & task.
const screenshotStorage = multer.diskStorage({
  destination: function(req,file,cb){
    const sessionId=req.params.id;
    const dir=path.join(__dirname,'..','state','session-assets',sessionId);
    try{ fs.mkdirSync(dir,{recursive:true}); }catch(_e){}
    cb(null,dir);
  },
  filename: function(req,file,cb){
    const ext=(path.extname(file.originalname)||'.png').toLowerCase();
    const safe='shot_'+Date.now()+'_'+Math.random().toString(36).slice(2)+ext;
    cb(null,safe);
  }
});
const screenshotUpload = multer({storage:screenshotStorage, limits:{fileSize:4*1024*1024}}); // 4MB cap

app.post('/api/sessions/:id/assets', screenshotUpload.single('image'), async (req,res)=>{
  const id=req.params.id;
  const taskId=(req.body&&req.body.task_id)||null;
  // Basic auth: candidate or admin cookie must exist
  if(req.cookies.candidate!=='1' && req.cookies.admin!=='1') return res.status(401).json({error:'auth required'});
  try {
    const s = await pool.query('SELECT id FROM exam_sessions WHERE id=$1',[id]);
    if(!s.rowCount) return res.status(404).json({error:'session not found'});
    if(!req.file) return res.status(400).json({error:'image file required'});
    const relUrl='/session-assets/'+encodeURIComponent(id)+'/'+req.file.filename;
    // Broadcast asset event (does not alter answer directly)
    broadcastSession(id,'asset_uploaded',{task_id:taskId,filename:req.file.filename,url:relUrl,created_at:Date.now()});
    return res.json({ok:true,image:{task_id:taskId,filename:req.file.filename,url:relUrl,size:req.file.size}});
  } catch(e){ console.error('asset upload failed',e); return res.status(500).json({error:'asset upload failed'}); }
});

// Serve session assets statically (read-only). Path prefix /session-assets/:sessionId/:file
app.get('/session-assets/:sid/:file',(req,res)=>{
  const {sid,file}=req.params;
  if(!/^[a-zA-Z0-9_.-]+$/.test(file)) return res.status(400).send('bad name');
  const dir=path.join(__dirname,'..','state','session-assets',sid);
  const full=path.join(dir,file);
  if(!fs.existsSync(full)) return res.status(404).send('not found');
  res.sendFile(full);
});

// Admin list & download uploads
app.get('/api/admin/uploads',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const root=ensureUploadsDirs(); const entries=fs.readdirSync(root).filter(f=>!f.startsWith('.')).map(f=>{ const full=path.join(root,f); const st=fs.statSync(full); return {file:f,size:st.size,mtime:st.mtimeMs}; }); res.json({ok:true,files:entries}); });
app.get('/api/admin/uploads/:file',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).send('admin required'); const root=ensureUploadsDirs(); const file=req.params.file||''; if(!/^[a-z0-9@._-]+_(final|work)_\d+\.[a-z0-9]+$/i.test(file)) return res.status(400).send('bad name'); const full=path.join(root,file); if(!fs.existsSync(full)) return res.status(404).send('not found'); res.download(full); });

// ---------------- Admin Answer Views ----------------
app.get('/api/admin/candidate/:email/answers',(req,res)=>{ if(req.cookies.admin!=='1' && req.cookies.manager!=='1') return res.status(401).json({error:'admin or manager required'}); const email=req.params.email||''; const st=readState(); ensureAnswersRoot(st); const cand=findCandidate(st,email); if(!cand) return res.status(404).json({error:'candidate not found'}); const answers=getCandidateAnswers(st,email); res.json({ok:true,email,answers}); });
app.get('/api/admin/candidate/:email/final-work',(req,res)=>{ if(req.cookies.admin!=='1' && req.cookies.manager!=='1') return res.status(401).json({error:'admin or manager required'}); const email=req.params.email||''; const st=readState(); ensureAnswersRoot(st); const cand=findCandidate(st,email); if(!cand) return res.status(404).json({error:'candidate not found'}); const snap=getFinalSnapshot(st,email); if(!snap) return res.status(404).json({error:'no final submission'}); res.json({ok:true,email,submittedAt:cand.submittedAt,snapshot:snap}); });
app.get('/api/admin/answers/export',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const st=readState(); ensureAnswersRoot(st); const rows=[]; Object.entries(st.answers.candidates).forEach(([email,tasks])=>{ Object.entries(tasks).forEach(([taskId,obj])=>{ rows.push({email,taskId,updatedAt:obj.updatedAt,fields:obj.fields}); }); }); res.json({ok:true,rows}); });

// ---------------- Admin Config ----------------
app.get('/api/admin/config',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const st=readState(); res.json({recipients:st.recipients||'',onCall:st.onCall||''}); });
app.post('/api/admin/config',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const {recipients,onCall}=req.body||{}; saveStateMut(s=>{ s.recipients=recipients||''; s.onCall=onCall||''; }); res.json({ok:true}); });

// ---------------- Exam Template (DOCX) ----------------
// Admin uploads a single DOCX template for candidates to download & complete externally.
const templateStorage = multer.diskStorage({
  destination: function(_req,_file,cb){ cb(null, ensureTemplateDir()); },
  filename: function(_req,file,cb){
    const safeBase = path.basename(file.originalname).replace(/[^a-zA-Z0-9_.-]/g,'_');
    const baseNoExt = safeBase.replace(/\.docx$/i,'');
    cb(null, baseNoExt + '_' + Date.now() + '.docx');
  }
});
const templateUpload = multer({storage:templateStorage, limits:{fileSize:10*1024*1024}}); // 10MB limit

// Upload / replace template
app.post('/api/admin/exam-template', templateUpload.single('template'), (req,res)=>{
  if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'});
  if(!req.file) return res.status(400).json({error:'template file required'});
  let meta=null;
  saveStateMut(s=>{ ensureExamTemplate(s); s.examTemplate={file:req.file.filename,originalName:req.file.originalname,uploadedAt:Date.now()}; meta=s.examTemplate; });
  res.json({ok:true,template:meta});
});
// Admin fetch meta
app.get('/api/admin/exam-template',(req,res)=>{
  if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'});
  const st=readState(); ensureExamTemplate(st);
  if(!st.examTemplate) return res.json({ok:true,template:null});
  res.json({ok:true,template:st.examTemplate});
});
// Candidate/public meta
app.get('/exam-template/meta',(req,res)=>{
  const st=readState(); ensureExamTemplate(st);
  if(!st.examTemplate) return res.json({available:false});
  const {originalName,uploadedAt}=st.examTemplate;
  res.json({available:true,originalName,uploadedAt});
});
// Candidate download
app.get('/exam-template/download',(req,res)=>{
  const st=readState(); ensureExamTemplate(st);
  if(!st.examTemplate) return res.status(404).send('Template not available');
  const dir=ensureTemplateDir();
  const full=path.join(dir, st.examTemplate.file);
  if(!fs.existsSync(full)) return res.status(404).send('Template file missing');
  const downloadName = st.examTemplate.originalName && /\.docx$/i.test(st.examTemplate.originalName)? st.examTemplate.originalName : 'exam_template.docx';
  res.download(full, downloadName);
});

// Public on-call info (no auth): returns minimal contact for display
app.get('/api/oncall',(req,res)=>{
  try {
    const st=readState();
    const email=(st.onCall||'').toLowerCase();
    if(!email) return res.json({ok:true,onCall:null});
    const staff = (STAFF_DIRECTORY||[]).find(s=> s.email.toLowerCase()===email);
    if(!staff) return res.json({ok:true,onCall:{email}});
    res.json({ok:true,onCall:{email:staff.email,name:staff.name,phone:staff.phone}});
  } catch(e){ res.status(500).json({ok:false,error:'oncall lookup failed'}); }
});

// ---------------- Case Study Placeholder ----------------
app.get('/api/case-study/submission',(req,res)=>{ const st=readState(); res.json(st.caseStudySubmission||{submitted:false}); });
app.post('/api/case-study/submission',(req,res)=>{ const {html,meta}=req.body||{}; saveStateMut(s=>{ s.caseStudySubmission={submitted:true,submittedAt:Date.now(),html:html||'',meta:meta||{}}; }); res.json({ok:true}); });

// ---------------- Gateway Simulation ----------------
function headerToken(res){ res.set('X-Lab-Trace','LAB-QGZK7V'); }
app.get('/gateway/ok',(req,res)=>{ headerToken(res); res.send('OK'); });
app.get('/gateway/forbidden',(req,res)=>{ headerToken(res); res.status(403).send('Forbidden'); });
app.get('/gateway/bad',(req,res)=>{ headerToken(res); res.status(502).send('Bad Gateway'); });
app.get('/gateway/delay/:ms',(req,res)=>{ headerToken(res); const ms=Math.min(parseInt(req.params.ms||'0',10),10000); setTimeout(()=>res.send('Delayed '+ms+'ms'),ms); });
app.get('/gateway/admin',(req,res)=>{ headerToken(res); const st=readState(); ensurePolicy(st); if(st.policy && Array.isArray(st.policy.deny) && st.policy.deny.includes('/admin')) return res.status(403).send('Admin blocked by policy'); res.send('Admin panel'); });

// ---------------- IAM Simulation ----------------
app.get('/iam/status',(req,res)=>{ const st=readState(); ensureIAM(st); writeState(st); res.json(st.iam); });
app.post('/iam/grant',(req,res)=>{ const key=req.headers['x-api-key']; if(key!=='admin123') return res.status(401).json({error:'invalid api key'}); const {user,role}=req.body||{}; if(!user||!role) return res.status(400).json({error:'user and role required'}); const st=saveStateMut(s=>{ ensureIAM(s); if(!s.iam[user]) s.iam[user]={roles:[]}; if(!s.iam[user].roles.includes(role)) s.iam[user].roles.push(role); }); res.json({ok:true,iam:st.iam}); });
app.get('/cloud/logs',(req,res)=>{ const st=readState(); ensureIAM(st); const roles=(st.iam.student && st.iam.student.roles)||[]; if(!roles.includes('LogReader')) return res.status(403).json({error:'requires LogReader role'}); const logPath=path.join(__dirname,'..','logs','app.log'); let data=''; try{ data=fs.readFileSync(logPath,'utf8'); }catch(e){ data='(no logs)'; } res.type('text/plain').send(data); });

// ---------------- Policy ----------------
app.post('/policy',(req,res)=>{ const pol=req.body||{}; if(!pol.deny||!Array.isArray(pol.deny)) return res.status(400).json({error:'policy must be {deny:["/path",...] }'}); const st=saveStateMut(s=>{ ensurePolicy(s); s.policy={deny:pol.deny}; }); res.json({ok:true,policy:st.policy}); });
app.get('/policy',(req,res)=>{ const st=readState(); ensurePolicy(st); res.json(st.policy); });

// ---------------- Misc Submissions ----------------
app.post('/submit/health',(req,res)=>{ const st=saveStateMut(s=>{ ensureSubmissions(s); s.submissions.health=req.body; }); res.json({ok:true}); });

// ---------------- Health & Ping ----------------
app.get('/health',(req,res)=>{ try{ const st=readState(); res.json({ok:true,time:Date.now(),candidates:(st.candidates||[]).length}); }catch(e){ res.status(500).json({ok:false,error:'state read failed'});} });
app.get('/api/ping',(req,res)=> res.json({ok:true,time:Date.now()}));

// ================== New Persistent Session / Answers / Events APIs ==================
// Create new exam session - uses file-based state instead of PostgreSQL
app.post('/api/sessions', async (req,res)=>{
  const {candidate_name,email} = req.body||{};
  if(!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) return res.status(400).json({error:'valid email required'});
  try {
    // Use file-based state to find/create session
    const st = readState();
    ensureCandidatesArray(st);
    const candidate = findCandidate(st, email);
    if(!candidate) {
      return res.status(404).json({error:'candidate not found - please contact admin'});
    }
    // Use the slug as the session ID
    const sessionId = candidate.slug || email.replace(/[^a-z0-9]/gi, '').slice(0,12) + Date.now().toString(36).slice(-4);
    if(!candidate.slug) {
      saveStateMut(s => {
        const c = findCandidate(s, email);
        if(c) c.slug = sessionId;
      });
    }
    return res.json({ok:true,reused:!!candidate.slug,session:{id:sessionId,email,candidate_name:candidate_name||candidate.name||null,started_at:candidate.startedAt||Date.now()}});
  } catch(e){ console.error('session create failed', e); return res.status(500).json({error:'session create failed'}); }
});

// Fetch all answers for a session - uses file-based state
app.get('/api/sessions/:id/answers', async (req,res)=>{
  const id = req.params.id;
  try {
    const st = readState();
    ensureCandidatesArray(st);
    const candidate = (st.candidates||[]).find(c => c.slug === id);
    if(!candidate) return res.status(404).json({error:'session not found'});
    ensureAnswersRoot(st);
    const answers = getCandidateAnswers(st, candidate.email) || {};
    // Convert to array format
    const answersList = Object.entries(answers).map(([task_id, content]) => ({
      task_id,
      content,
      version: 1,
      updated_at: new Date().toISOString()
    }));
    return res.json({ok:true,answers:answersList});
  } catch(e){ console.error('answers fetch error', e); return res.status(500).json({error:'fetch failed'}); }
});

// Upsert answer - uses file-based state
app.post('/api/sessions/:id/answers', async (req,res)=>{
  const id = req.params.id;
  const {task_id, content} = req.body||{};
  if(!task_id || typeof task_id !== 'string') return res.status(400).json({error:'task_id required'});
  if(typeof content === 'undefined') return res.status(400).json({error:'content required'});
  try {
    const st = readState();
    ensureCandidatesArray(st);
    const candidate = (st.candidates||[]).find(c => c.slug === id);
    if(!candidate) return res.status(404).json({error:'session not found'});
    
    // Save using file-based state
    let updated = null;
    saveStateMut(s => {
      ensureAnswersRoot(s);
      const ans = getCandidateAnswers(s, candidate.email);
      ans[task_id] = content;
      updated = ans[task_id];
    });
    
    const payload={task_id,version:1,updated_at:new Date().toISOString(),content};
    broadcastSession(id,'answer_updated', payload);
    return res.json({ok:true,answer:payload});
  } catch(e){ console.error('answer upsert failed', e); return res.status(500).json({error:'save failed'}); }
});

// Log arbitrary event - simplified without PostgreSQL
app.post('/api/sessions/:id/events', async (req,res)=>{
  const id=req.params.id;
  const {type,payload} = req.body||{};
  if(!type) return res.status(400).json({error:'type required'});
  try {
    const st = readState();
    ensureCandidatesArray(st);
    const candidate = (st.candidates||[]).find(c => c.slug === id);
    if(!candidate) return res.status(404).json({error:'session not found'});
    
    const out={id:Date.now().toString(36),type,created_at:new Date().toISOString(),payload:payload||{}};
    broadcastSession(id,'event_logged', out);
    return res.json({ok:true,event:out});
  } catch(e){ console.error('event insert failed', e); return res.status(500).json({error:'event failed'}); }
});

// SSE stream (feature flag USE_WS overrides, but SSE always available)
app.get('/api/sessions/:id/stream',(req,res)=>{
  const id=req.params.id;
  res.set({
    'Content-Type':'text/event-stream',
    'Cache-Control':'no-store',
    'Connection':'keep-alive'
  });
  res.flushHeaders && res.flushHeaders();
  res.write(`event: hello\n`+`data: {"session":"${id}"}\n\n`);
  let set = sseClients.get(id);
  if(!set){ set=new Set(); sseClients.set(id,set); }
  set.add(res);
  req.on('close',()=>{ set.delete(res); if(set.size===0) sseClients.delete(id); });
});

// Optional WebSocket setup
function initWebSocket(){
  if(!USE_WS) return;
  try {
    const { Server } = require('socket.io');
    httpServer = require('http').createServer(app);
    io = new Server(httpServer, { cors:{origin:'*'}, path:'/ws'});
    io.on('connection',(socket)=>{
      const sessionId = socket.handshake.query.sessionId;
      if(sessionId){ socket.join('session:'+sessionId); socket.emit('connected',{sessionId}); }
    });
  } catch(e){ console.error('WS init failed', e); }
}

initWebSocket();
// After optional WS init, run migrations then log DB health
(async ()=>{
  try {
    const healthy = await pgHealth();
    if(!healthy) console.warn('[db] initial health check failed');
    else {
      await runMigrations();
      console.log('[db] migrations complete');
    }
  } catch(e){ console.error('[db] migration bootstrap error', e.message); }
})();

// ================= Gateway Remote Restart (Admin) =================
// POST /api/admin/gateway/restart { gateway_domain, services:["svc"], dry_run:true? }
// Requires admin cookie and env vars:
//   BASTION_HOST, BASTION_USER, BASTION_PASS (or BASTION_KEY_PATH), Optional BASTION_PORT
// Performs an SSH connection to bastion then runs restart commands for each service against the gateway.
// Security: validates service names (alphanum, dash, underscore only) and limits to max 6 services.
app.post('/api/admin/gateway/restart', async (req,res)=>{
  if(req.cookies.admin !== '1') return res.status(401).json({error:'admin required'});
  const { gateway_domain, services, dry_run } = req.body || {};
  if(!gateway_domain || typeof gateway_domain !== 'string') return res.status(400).json({error:'gateway_domain required'});
  let list = Array.isArray(services)? services.slice(0,6) : [];
  const bad = list.filter(s=> !/^[-a-zA-Z0-9_]{1,60}$/.test(s));
  if(bad.length) return res.status(400).json({error:'invalid service names', bad});
  const host = process.env.BASTION_HOST || 'ssh.eu-4.checkpoint.security';
  const port = process.env.BASTION_PORT ? parseInt(process.env.BASTION_PORT,10) : 22;
  const user = process.env.BASTION_USER || process.env.BASTION_USERNAME || 'otp';
  const pass = process.env.BASTION_PASS || process.env.BASTION_PASSWORD || '';
  const keyPath = process.env.BASTION_KEY_PATH;

  if(!pass && !keyPath && !dry_run) return res.status(500).json({error:'no bastion credentials (BASTION_PASS or BASTION_KEY_PATH)'});

  // Build commands (placeholder gwctl calls; adapt to real CLI)
  const commands = list.map(svc => `gwctl --domain ${gateway_domain} restart ${svc}`);
  if(dry_run){
    return res.json({ok:true,dry_run:true,host,user,gateway_domain,commands});
  }

  const startTs = Date.now();
  const conn = new SSHClient();
  let output = [];
  let error = null;

  function finish(code){
    try{ conn.end(); }catch(_e){}
    res.json({ok: !error, error, gateway_domain, services:list, host, user, durationMs: Date.now()-startTs, output});
  }

  conn.on('ready', ()=>{
    conn.shell((err,stream)=>{
      if(err){ error='shell error: '+err.message; return finish(0); }
      stream.on('data', d => {
        const text = d.toString();
        output.push(text);
        // naive prompt detection; we issue commands once early
      });
      stream.on('close', ()=> finish(0));
      // send commands serially with brief delay
      let idx=0;
      function sendNext(){
        if(idx>=commands.length){ stream.end('exit\n'); return; }
        const cmd=commands[idx++];
        stream.write(cmd+'\n');
        setTimeout(sendNext, 400); // small spacing
      }
      sendNext();
    });
  }).on('error', e => { error='ssh error: '+e.message; finish(0); }).connect({
    host, port, username:user,
    password: pass || undefined,
    privateKey: keyPath? fs.readFileSync(keyPath,'utf8'): undefined
  });
});

// ---------------- Terminal Access for Task 5 ----------------
const { spawn, exec } = require('child_process');

// Reset routing lab endpoint
app.post('/api/reset-routing-lab', (req, res) => {
  console.log('[Reset] Resetting routing lab...');
  
  // Restart the routing lab containers using docker CLI
  const containers = ['nbr-leaf01', 'nbr-router', 'nbr-leaf02'];
  let completed = 0;
  let errors = [];
  
  containers.forEach(container => {
    const restartCmd = spawn('docker', ['restart', container]);
    
    restartCmd.on('close', (code) => {
      completed++;
      if (code !== 0) {
        errors.push(`Failed to restart ${container}`);
      }
      
      // Check if all containers are processed
      if (completed === containers.length) {
        if (errors.length > 0) {
          console.error('[Reset] Errors:', errors.join(', '));
          res.status(500).json({ success: false, error: errors.join(', ') });
        } else {
          console.log('[Reset] All containers restarted successfully');
          res.json({ success: true, message: 'Lab reset successfully' });
        }
      }
    });
  });
});

// Reset gateway g4 - recreates the disk issue
app.post('/api/reset-gateway', (req, res) => {
  console.log('[Reset Gateway] Resetting g4 container...');
  
  exec('docker restart g4', (error, stdout, stderr) => {
    if (error) {
      console.error('[Reset Gateway] Error:', error);
      return res.status(500).json({ success: false, message: 'Failed to reset gateway' });
    }
    
    console.log('[Reset Gateway] g4 restarted, disk issue recreated');
    res.json({ success: true, message: 'Gateway g4 reset successfully' });
  });
});

// Clear terminal - sends 'clear' command and resets the terminal
app.post('/api/terminal/:container/clear', (req, res) => {
  const container = req.params.container;
  const candidateSlug = req.cookies.candidateSlug;
  let actualContainerName = container;
  
  // Map to actual container name
  if (candidateSlug && sessionManager.isSessionActive(candidateSlug)) {
    actualContainerName = sessionManager.getContainerName(candidateSlug, container);
  } else {
    const containerMap = {
      'branch-tokyo': 'branch-tokyo',
      'branch-osaka': 'branch-osaka',
      'branch-kyoto': 'branch-kyoto'
    };
    actualContainerName = containerMap[container] || container;
  }
  
  console.log(`[Terminal Clear] Clearing terminal for: ${actualContainerName}`);
  
  // Execute clear command in the container
  exec(`docker exec ${actualContainerName} sh -c "clear"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`[Terminal Clear] Error clearing ${actualContainerName}:`, error);
      return res.status(200).json({ success: false, message: 'Clear command sent (may not be visible)' });
    }
    res.json({ success: true, message: 'Terminal cleared' });
  });
});

// Get terminal history
app.get('/api/terminal/:container/history', (req, res) => {
  const container = req.params.container;
  const candidateSlug = req.cookies.candidateSlug;
  let actualContainerName = container;
  
  // Map to actual container name
  if (candidateSlug && sessionManager.isSessionActive(candidateSlug)) {
    actualContainerName = sessionManager.getContainerName(candidateSlug, container);
  } else {
    const containerMap = {
      'branch-tokyo': 'branch-tokyo',
      'branch-osaka': 'branch-osaka',
      'branch-kyoto': 'branch-kyoto'
    };
    actualContainerName = containerMap[container] || container;
  }
  
  console.log(`[Terminal History] Getting history for: ${actualContainerName}`);
  
  // Try to get bash history from the container
  exec(`docker exec ${actualContainerName} sh -c "history || cat ~/.bash_history || echo 'No history available'"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`[Terminal History] Error:`, error);
      return res.status(200).send('Terminal history not available');
    }
    
    const historyContent = `=== Terminal History for ${actualContainerName} ===\nDownloaded: ${new Date().toLocaleString()}\n${'='.repeat(60)}\n\n${stdout}`;
    res.set('Content-Type', 'text/plain');
    res.send(historyContent);
  });
});

// Simple terminal page that embeds xterm.js and connects to Docker containers
app.get('/api/terminal/:container', (req, res) => {
  const container = req.params.container;
  const validContainers = ['leaf01', 'leaf02', 'router', 'nbr-leaf01', 'nbr-leaf02', 'nbr-router', 'branch-tokyo', 'branch-osaka', 'branch-kyoto', 'gateway-phoenix', 'g1', 'g2', 'g3', 'g4', 'tokyo', 'osaka', 'kyoto', 'phoenix', 'waf-terminal'];
  
  if (!validContainers.includes(container)) {
    return res.status(400).send('Invalid container');
  }

  // Get candidate's session ID from cookie
  const candidateSlug = req.cookies.candidateSlug;
  let actualContainerName = container;
  
  // If candidate has a session, route to their isolated containers
  if (candidateSlug && sessionManager.isSessionActive(candidateSlug)) {
    actualContainerName = sessionManager.getContainerName(candidateSlug, container);
    console.log(`[Terminal] Routing ${container} to session container: ${actualContainerName}`);
  } else {
    // Fallback to shared containers for legacy/admin access
    const containerMap = {
      'leaf01': 'nbr-leaf01',
      'leaf02': 'nbr-leaf02',
      'router': 'nbr-router',
      'nbr-leaf01': 'nbr-leaf01',
      'nbr-leaf02': 'nbr-leaf02',
      'nbr-router': 'nbr-router',
      'branch-tokyo': 'branch-tokyo',
      'branch-osaka': 'branch-osaka',
      'branch-kyoto': 'branch-kyoto',
      'gateway-phoenix': 'gateway-phoenix',
      'tokyo': 'branch-tokyo',
      'osaka': 'branch-osaka',
      'kyoto': 'branch-kyoto',
      'phoenix': 'gateway-phoenix',
      'g1': 'g1',
      'g2': 'g2',
      'g3': 'g3',
      'g4': 'g4',
      'waf-terminal': 'waf-terminal'
    };
    actualContainerName = containerMap[container] || container;
  }

  // Return an HTML page with xterm.js that connects via WebSocket
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Terminal: ${container}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css" />
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #0d1117;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    #terminal {
      flex: 1;
      padding: 12px;
      background: #0d1117;
    }
    .terminal {
      height: 100%;
    }
    /* Better text rendering */
    .xterm {
      padding: 8px;
    }
    .xterm-viewport {
      background: #0d1117 !important;
    }
    .xterm-screen {
      background: #0d1117 !important;
    }
    /* Force proper space rendering */
    .xterm-rows span {
      display: inline-block !important;
    }
    .xterm-char-measure-element {
      display: inline-block !important;
      visibility: hidden !important;
    }
  </style>
</head>
<body>
  <div id="terminal"></div>
  <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/lib/xterm-addon-web-links.js"></script>
  <script>
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 14,
      cols: 140,
      rows: 40,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", Menlo, Monaco, "Courier New", monospace',
      letterSpacing: 0,
      lineHeight: 1.2,
      rendererType: 'canvas',
      fontWeight: '400',
      fontWeightBold: '600',
      allowTransparency: false,
      scrollback: 5000,
      drawBoldTextInBrightColors: true,
      fastScrollModifier: 'shift',
      minimumContrastRatio: 1,
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selection: 'rgba(56, 139, 253, 0.4)',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc'
      }
    });
    
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    
    // Add web links support
    if (window.WebLinksAddon) {
      const webLinksAddon = new WebLinksAddon.WebLinksAddon();
      term.loadAddon(webLinksAddon);
    }
    
    term.open(document.getElementById('terminal'));
    
    // Fit after a small delay to ensure proper sizing
    setTimeout(() => {
      fitAddon.fit();
      term.focus();
    }, 100);

    // Handle resize events and update shell stty
    window.addEventListener('resize', () => {
      fitAddon.fit();
      // Send stty resize after fitting
      setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          const dims = fitAddon.proposeDimensions();
          if (dims) {
            ws.send('stty rows ' + dims.rows + ' cols ' + dims.cols + '\\r');
          }
        }
      }, 100);
    });

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    let ws = null;

    function connect() {
      ws = new WebSocket('ws://' + location.host + '/api/terminal-ws/${actualContainerName}');
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
        // Send stty resize command silently for vi/nano support
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('stty rows 40 cols 140 2>/dev/null\\r');
            // Send clear and newline to clean up the terminal
            setTimeout(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send('clear\\r');
              }
            }, 100);
          }
        }, 200);
      };

      ws.onmessage = (event) => {
        term.write(event.data);
      };

      ws.onclose = (event) => {
        term.write('\\r\\n\\r\\n[Connection closed]\\r\\n');
        // Don't reconnect - user should refresh page after starting exam
        term.write('[Container stopped. Please start the exam from the admin panel, then refresh this page.]\\r\\n');
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        term.write('\\r\\n\\r\\n[Connection error - container may not be running]\\r\\n');
      };

      term.onData((data) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });
    }

    // Initial connection
    connect();

    // Listen for commands from parent window (e.g., clear command on page load)
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'terminal-command') {
        const command = event.data.command;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(command);
        }
      }
    });
  </script>
</body>
</html>
  `);
});

// WebSocket endpoint for terminal communication
const WebSocket = require('ws');
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws, req) => {
  const match = req.url.match(/\/api\/terminal-ws\/([\w-]+)/);
  if (!match) {
    ws.close();
    return;
  }

  const requestedContainer = match[1];
  
  // Parse cookies from WebSocket upgrade request
  const cookies = {};
  if (req.headers.cookie) {
    req.headers.cookie.split(';').forEach(cookie => {
      const parts = cookie.trim().split('=');
      if (parts.length === 2) {
        cookies[parts[0]] = parts[1];
      }
    });
  }
  
  // Get candidate session and map container name
  const candidateSlug = cookies.candidateSlug;
  let containerName = requestedContainer;
  
  // If candidate has a session, route to their isolated containers
  if (candidateSlug && sessionManager.isSessionActive(candidateSlug)) {
    containerName = sessionManager.getContainerName(candidateSlug, requestedContainer);
    console.log(`[Terminal] WebSocket routing ${requestedContainer} to session container: ${containerName}`);
  } else {
    // Fallback to shared containers for legacy/admin access
    const containerMap = {
      'nbr-leaf01': 'nbr-leaf01',
      'nbr-leaf02': 'nbr-leaf02',
      'nbr-router': 'nbr-router',
      'branch-tokyo': 'branch-tokyo',
      'branch-osaka': 'branch-osaka',
      'branch-kyoto': 'branch-kyoto',
      'gateway-phoenix': 'gateway-phoenix',
      'g1': 'g1',
      'g2': 'g2',
      'g3': 'g3',
      'g4': 'g4'
    };
    containerName = containerMap[requestedContainer] || requestedContainer;
    console.log(`[Terminal] WebSocket using shared container: ${containerName}`);
  }
  
  console.log(`[WebSocket] Terminal connection to container: ${containerName}`);

  // Extract session info and terminal log file path
  const slugMatch = containerName.match(/^exam-([a-z0-9]+)/);
  let sessionId = null;
  let terminalLogFile = null;
  
  if (slugMatch) {
    const sessionPrefix = slugMatch[1];
    const sessions = sessionManager.getAllSessions();
    const session = sessions.find(s => s.sessionId.startsWith(sessionPrefix));
    if (session) {
      sessionId = session.sessionId;
      const terminalRole = containerName.split('-').pop(); // tokyo, osaka, kyoto, g1, g2, etc.
      terminalLogFile = path.join(session.stateDir, 'terminal-logs', `${terminalRole}.log`);
    }
  }

  // First check if container exists and is running
  exec(`docker inspect -f '{{.State.Running}}' ${containerName}`, (error, stdout) => {
    const isRunning = !error && stdout.trim() === 'true';
    
    if (!isRunning) {
      // Container is not running - show historical logs if available
      console.log(`[WebSocket] Container ${containerName} is not running - attempting to show historical logs`);
      
      if (terminalLogFile && fs.existsSync(terminalLogFile)) {
        // Send historical terminal output
        const historicalContent = fs.readFileSync(terminalLogFile, 'utf8');
        ws.send('\r\n=== Terminal History (Read-Only) ===\r\n');
        ws.send(historicalContent);
        ws.send('\r\n\r\n[Connection closed - Container stopped]\r\n');
        setTimeout(() => ws.close(), 500);
      } else {
        // No historical logs available
        ws.send('\r\n[Error: Container is not running and no historical logs found]\r\n');
        ws.send('\r\n[Please start the exam from the admin panel first, then refresh this page]\r\n');
        ws.send('\r\n[Connection will now close]\r\n');
        setTimeout(() => ws.close(), 500);
      }
      return;
    }

    // Container exists and is running, proceed with connection
    startTerminalSession(ws, containerName, sessionId, terminalLogFile);
  });
});

function startTerminalSession(ws, containerName, sessionId, terminalLogFile) {
  // Ensure terminal-logs directory exists
  if (terminalLogFile) {
    fs.mkdirSync(path.dirname(terminalLogFile), { recursive: true });
    
    // Load and send existing terminal history (filtered for clean display)
    if (fs.existsSync(terminalLogFile)) {
      const existingContent = fs.readFileSync(terminalLogFile, 'utf8');
      if (existingContent.trim()) {
        // Filter out noise from history
        let filteredHistory = existingContent
          .replace(/\[Connected to [^\]]+\]/g, '')
          .replace(/export PATH=[^\n\r]+/g, '')
          .replace(/export PS1=[^\n\r]+/g, '')
          .replace(/<[^\n\r]*\/sbin[^\n\r]*\/bin[^\n\r]*/g, '')
          .replace(/[^\n\r]*-branch:\/# */g, '')
          .replace(/^=== Session started:.*===.*$/gm, '')
          .replace(/^=== Session ended:.*===.*$/gm, '')
          .replace(/\[Connection closed\]/g, '')
          .replace(/[\r\n]{3,}/g, '\r\n');
        
        // Send filtered history if there's actual content
        if (filteredHistory.trim()) {
          ws.send(filteredHistory);
        }
      }
    }
    
    // Append session start marker (only to log file, not to user)
    fs.appendFileSync(terminalLogFile, `\n\n=== Session started: ${new Date().toISOString()} ===\n`);
  }

  // Start persistent shell with script utility (provides PTY for proper echo)
  // For Alpine containers, use script utility which is available in util-linux package
  const isAlpine = containerName.includes('waf') || containerName.includes('nginx');
  
  // All containers use script for proper PTY - Alpine has it from util-linux
  const shellCmd = spawn('docker', [
    'exec',
    '-i',
    '-e', 'TERM=xterm-256color',
    '-e', 'COLUMNS=140',
    '-e', 'LINES=40',
    containerName,
    'script',
    '-q',
    '-c',
    '/bin/sh',
    '/dev/null'
  ]);

  console.log(`[Terminal] Spawned shell for ${containerName}, isAlpine: ${isAlpine}`);

  const shortName = containerName.replace(/^exam-[a-z0-9]+-/, '').replace(/^nbr-/, '');
  let initialized = false;

  // Send initial prompt setup after shell starts
  setTimeout(() => {
    if (shellCmd.stdin && !shellCmd.stdin.destroyed && shellCmd.stdin.writable) {
      try {
        // Configure terminal properly
        shellCmd.stdin.write('stty sane 2>/dev/null\n');
        shellCmd.stdin.write('stty cols 140 rows 40 2>/dev/null\n');
        shellCmd.stdin.write('export TERM=xterm-256color\n');
        shellCmd.stdin.write('export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n');
        shellCmd.stdin.write(`export PS1="${shortName}# "\n`);
        shellCmd.stdin.write('clear\n');
        initialized = true;
        console.log(`[Terminal] Initialized shell for ${containerName}`);
      } catch (err) {
        console.error('[Terminal] Failed to write initial setup:', err.message);
      }
    } else {
      console.error(`[Terminal] stdin not writable for ${containerName} during setup`);
    }
  }, 300);

  // Handle spawn errors
  shellCmd.on('error', (error) => {
    console.error(`[WebSocket] Failed to spawn docker exec for ${containerName}:`, error);
    ws.send(`\r\n[Error: Failed to start terminal session: ${error.message}]\r\n`);
    ws.close();
  });

  // Handle stdin errors (EPIPE) to prevent server crashes
  if (shellCmd.stdin) {
    shellCmd.stdin.on('error', (error) => {
      console.error(`[WebSocket] stdin error for ${containerName}:`, error.message);
    });
  }

  // Forward output from container to WebSocket AND save to log
  shellCmd.stdout.on('data', (data) => {
    const output = data.toString();
    
    // Filter out initialization noise only
    let filteredOutput = output
      .replace(/Script started[^\n]*\n?/g, '')
      .replace(/script: [^\n]*\n?/g, '')
      .replace(/^stty [^\n]*\n?/gm, '')
      .replace(/^export TERM=[^\n]*\n?/gm, '')
      .replace(/^export PATH=[^\n]*\n?/gm, '')
      .replace(/^export PS1=[^\n]*\n?/gm, '')
      .replace(/^clear\r?\n?/gm, '');
    
    if (filteredOutput && ws.readyState === WebSocket.OPEN) {
      ws.send(filteredOutput);
    }
    
    // Save to terminal log file
    if (terminalLogFile) {
      try {
        fs.appendFileSync(terminalLogFile, output);
      } catch (e) {
        console.error('[Terminal] Failed to save output:', e.message);
      }
    }
    
    // Broadcast terminal activity to admin viewers
    if (sessionId && filteredOutput) {
      broadcastSessionEvent(sessionId, 'terminal-output', {
        container: containerName,
        output: filteredOutput,
        timestamp: Date.now()
      });
    }
  });

  shellCmd.stderr.on('data', (data) => {
    const output = data.toString();
    
    // Filter out TTY-related stderr messages for Alpine containers
    // Filter out common noise from stderr
    if (output.includes('not a tty') || output.includes('not a TTY') || 
        output.includes('stty:') || output.includes('stdin isn')) {
      return; // Silently ignore TTY warnings
    }
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(output);
    }
    
    // Save stderr to terminal log file
    if (terminalLogFile) {
      try {
        fs.appendFileSync(terminalLogFile, `[STDERR] ${output}`);
      } catch (e) {
        console.error('[Terminal] Failed to save stderr:', e.message);
      }
    }
  });

  shellCmd.on('close', () => {
    if (terminalLogFile) {
      fs.appendFileSync(terminalLogFile, `\n=== Session ended: ${new Date().toISOString()} ===\n`);
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  // Forward input from WebSocket to container
  ws.on('message', (data) => {
    if (shellCmd && shellCmd.stdin && shellCmd.stdin.writable) {
      const input = data.toString();
      try {
        shellCmd.stdin.write(input);
      } catch (err) {
        console.error('[Terminal] Failed to write to stdin:', err.message);
      }
      
      // Log input to terminal log file
      if (terminalLogFile) {
        try {
          fs.appendFileSync(terminalLogFile, input);
        } catch (e) {
          console.error('[Terminal] Failed to save input:', e.message);
        }
      }
      
      // Broadcast terminal activity to admin viewers
      if (sessionId && (input.includes('\r') || input.includes('\n'))) {
        broadcastSessionEvent(sessionId, 'terminal-activity', {
          container: containerName,
          timestamp: Date.now()
        });
      }
    }
  });

  // Handle cleanup
  ws.on('close', () => {
    console.log('[Terminal] WebSocket closed');
    if (shellCmd && !shellCmd.killed) {
      shellCmd.kill();
    }
  });

  ws.on('error', (error) => {
    console.error('[Terminal] WebSocket error:', error);
    if (shellCmd && !shellCmd.killed) {
      shellCmd.kill();
    }
  });
}

// ---------------- Catch-all (fallback) - COMMENTED OUT to allow static files to work ----------------
// app.get(/^\/(?!$).*/, (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));

// Start server with WebSocket support
if(!httpServer) httpServer = require('http').createServer(app);

// Upgrade HTTP server to handle WebSocket connections for terminals
httpServer.on('upgrade', (request, socket, head) => {
  if (request.url.startsWith('/api/terminal-ws/')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

httpServer.listen(PORT, ()=> console.log('Ops 101 Exam Lab on http://localhost:'+PORT+' (with terminal WebSocket support)'));
