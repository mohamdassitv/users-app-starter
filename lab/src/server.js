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

const app = express();
const PORT = process.env.PORT || 8081;

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
const TASK_FILES = {casestudy:'casestudy.html',mail:'mail.html',users:'users.html',alerts:'alerts.html'}; // subset referenced
const GENERATED_DIR = path.join(__dirname,'public','generated');
function mkdirp(p){ try{ fs.mkdirSync(p,{recursive:true}); }catch(_e){} }
mkdirp(GENERATED_DIR);
function ensureTokens(c){ if(!c.taskTokens){ c.taskTokens={hub:makeToken(),casestudy:makeToken(),mail:makeToken(),users:makeToken(),alerts:makeToken()}; } }
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

// Root login page
app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'public','login.html')));

// Early redirect / guard for legacy task paths
app.use((req,res,next)=>{
  try {
    const p=req.path;
    if(p==='/admin.html' && req.cookies.admin!=='1') return res.redirect('/admin-login.html');
    const legacy = (p==='/tasks.html' || p.startsWith('/task/'));
    if(legacy){
      if(req.cookies.candidate!=='1') return res.redirect('/');
      const st=readState(); ensureCandidatesArray(st);
      const slug=req.cookies.candidateSlug;
      if(slug){
        const cand=(st.candidates||[]).find(c=>c.slug===slug);
        if(cand){ ensureTokens(cand); ensureStaticCopies(cand); writeState(st);
          if(p==='/tasks.html') return res.redirect(cand.staticPath);
          const file=p.replace(/^\/task\//,'').toLowerCase();
            const map={'casestudy.html':'casestudy','mail.html':'mail','users.html':'users','alerts.html':'alerts'};
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
app.use(express.static(path.join(__dirname,'public')));

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
  if(!owner && !admin) return res.status(403).send('Forbidden');
  ensureTokens(cand); writeState(st);
  const t=cand.taskTokens;
  if(token===t.hub){
    try {
      let html=fs.readFileSync(HUB_SRC,'utf8');
      html=html.replace(/href="\/task\/casestudy.html"/g,'href="/c/'+slug+'/'+t.casestudy+'"')
               .replace(/href="\/task\/mail.html"/g,'href="/c/'+slug+'/'+t.mail+'"')
               .replace(/href="\/task\/users.html"/g,'href="/c/'+slug+'/'+t.users+'"')
               .replace(/href="\/task\/alerts.html"/g,'href="/c/'+slug+'/'+t.alerts+'"')
               .replace(/href="\/tasks.html"/g,'href="/c/'+slug+'/'+t.hub+'"');
      return res.type('html').send(html);
    } catch(e){ return res.status(500).send('Hub load failed'); }
  }
  const map={[t.casestudy]:'casestudy.html',[t.mail]:'mail.html',[t.users]:'users.html',[t.alerts]:'alerts.html'};
  const file=map[token];
  if(!file) return res.status(404).send('Unknown task token');
  const full=path.join(__dirname,'public','task',file);
  if(fs.existsSync(full)) return res.sendFile(full);
  return res.status(404).send('Task file missing');
});

// Protect admin page (explicit)
app.get('/admin.html', requireAdmin, (req,res)=> res.sendFile(path.join(__dirname,'public','admin.html')));

// ---------------- Candidate Auth & Lifecycle ----------------
app.post('/api/candidate/login',(req,res)=>{
  const {name,email}=req.body||{};
  if(!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) return res.status(400).json({error:'invalid email'});
  const safeName=(name||'').trim().slice(0,120);
  const st=saveStateMut(s=>{
    ensureCandidatesArray(s);
    let c=findCandidate(s,email);
    const now=Date.now();
    if(!c){ c={email,name:safeName,startTime:null,endTime:null,createdAt:now,extraTimeMs:0}; s.candidates.push(c);} else if(safeName && !c.name) c.name=safeName;
    c=findCandidate(s,email);
    if(c && !c.slug){ let slug; const used=new Set(s.candidates.map(x=>x.slug).filter(Boolean)); do{ slug=makeSlug(); } while(used.has(slug)); c.slug=slug; }
    if(c){ ensureTokens(c); ensureStaticCopies(c); }
  });
  const c=findCandidate(st,email); const rem=computeRemaining(c);
  res.cookie('candidate','1',{httpOnly:false});
  if(c.slug) res.cookie('candidateSlug',c.slug,{httpOnly:false,sameSite:'lax'});
  res.json({candidate:{email:c.email,name:c.name,startTime:c.startTime,remainingMs:rem.remainingMs,running:rem.running,slug:c.slug,taskTokens:c.taskTokens,staticPath:c.staticPath}});
});

app.get('/api/candidate/:email',(req,res)=>{
  const email=req.params.email||''; const st=readState(); ensureCandidatesArray(st); const c=findCandidate(st,email); if(!c) return res.status(404).json({error:'not found'}); const rem=computeRemaining(c); res.json({email:c.email,name:c.name,startTime:c.startTime,remainingMs:rem.remainingMs,running:rem.running});
});

app.post('/api/candidate/:email/start',(req,res)=>{
  const email=req.params.email||''; const self=req.query.self==='1'; if(req.cookies.admin!=='1' && !self) return res.status(401).json({error:'admin or self start required'});
  let updated=null, notFound=false, already=false;
  saveStateMut(s=>{ ensureCandidatesArray(s); const c=findCandidate(s,email); if(!c){ notFound=true; return; } if(c.startTime){ already=true; updated=c; return; } c.startTime=Date.now(); c.running=true; updated=c; });
  if(notFound) return res.status(404).json({error:'not found'});
  if(already) return res.json({ok:true,candidate:updated,already:true});
  res.json({ok:true,candidate:updated});
});

app.post('/api/admin/candidate/:email/reset',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const email=req.params.email||''; saveStateMut(s=>{ ensureCandidatesArray(s); const c=findCandidate(s,email); if(c){ c.startTime=null; c.endTime=null; c.running=false; }}); res.json({ok:true}); });

app.post('/api/admin/candidate/:email/extend',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const email=req.params.email||''; let minutes=parseInt((req.body&&req.body.minutes)||0,10); if(!minutes||minutes<1) return res.status(400).json({error:'minutes>0 required'}); if(minutes>480) minutes=480; let updated=null; saveStateMut(s=>{ ensureCandidatesArray(s); const c=findCandidate(s,email); if(!c) return; c.extraTimeMs=(c.extraTimeMs||0)+minutes*60000; updated=c; }); if(!updated) return res.status(404).json({error:'not found'}); const rem=computeRemaining(updated); res.json({ok:true,remainingMs:rem.remainingMs,totalDurationMs:rem.totalDurationMs}); });

app.delete('/api/admin/candidate/:email',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const email=(req.params.email||'').toLowerCase(); let removed=false; saveStateMut(s=>{ ensureCandidatesArray(s); const before=s.candidates.length; s.candidates=s.candidates.filter(c=> c.email.toLowerCase()!==email); removed=before!==s.candidates.length; ensureAnswersRoot(s); if(s.answers.candidates[email]) delete s.answers.candidates[email]; }); if(!removed) return res.status(404).json({error:'not found'}); res.json({ok:true}); });

app.post('/api/admin/candidate',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const {name,email}=req.body||{}; if(!email) return res.status(400).json({error:'email required'}); saveStateMut(s=>{ ensureCandidatesArray(s); if(!findCandidate(s,email)) s.candidates.push({email,name:(name||'').trim(),startTime:null,endTime:null,createdAt:Date.now(),extraTimeMs:0}); }); res.json({ok:true}); });

app.get('/api/admin/candidates',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const st=readState(); ensureCandidatesArray(st); const list=st.candidates.map(c=>{ const rem=computeRemaining(c); return {...c,remainingMs:rem.remainingMs,totalDurationMs:rem.totalDurationMs,endTime:rem.endTime,running:rem.running}; }); res.json({total:list.length,candidates:list}); });

// Admin lookup candidate by slug (for viewer auto-hydration)
app.get('/api/admin/slug/:slug/info',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const slug=req.params.slug||''; const st=readState(); ensureCandidatesArray(st); const cand=(st.candidates||[]).find(c=>c.slug===slug); if(!cand) return res.status(404).json({error:'not found'}); res.json({email:cand.email,slug:cand.slug,taskTokens:cand.taskTokens||{},submittedAt:cand.submittedAt||null}); });

// Public slug info (no auth) - exposes only email & slug
app.get('/public/slug/:slug/info',(req,res)=>{ const slug=req.params.slug||''; const st=readState(); ensureCandidatesArray(st); const cand=(st.candidates||[]).find(c=>c.slug===slug); if(!cand) return res.status(404).json({error:'not found'}); res.json({email:cand.email,slug:cand.slug}); });
// Public answers view (no auth) - returns sanitized answers
app.get('/public/slug/:slug/answers',(req,res)=>{ const slug=req.params.slug||''; const st=readState(); ensureCandidatesArray(st); const cand=(st.candidates||[]).find(c=>c.slug===slug); if(!cand) return res.status(404).json({error:'not found'}); ensureAnswersRoot(st); const raw=getCandidateAnswers(st,cand.email); const sanitized={}; Object.entries(raw).forEach(([taskId,obj])=>{ if(obj && obj.fields){ sanitized[taskId]={updatedAt:obj.updatedAt||null,fields:obj.fields}; } }); res.json({slug,email:cand.email,answers:sanitized}); });

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
  {name:'Yana Silutin', email:'yanasi@checkpoint.com', phone:'0542519667'}
];

app.get('/api/admin/staff',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const st=readState(); const onCall=st.onCall||''; res.json({ok:true,onCall,staff:STAFF_DIRECTORY}); });

app.post('/api/auth/admin-login',(req,res)=>{ const {password,username}=req.body||{}; const expected=process.env.ADMIN_PASSWORD||'2025'; if(password!==expected) return res.status(401).json({error:'bad password'}); // username without domain
  let userEmail='';
  if(username){
    const uname = username.toLowerCase().replace(/[^a-z0-9._-]/g,'');
    const full=uname.includes('@')? uname : uname+'@checkpoint.com';
    const found=STAFF_DIRECTORY.find(s=> s.email.toLowerCase()===full);
    if(found) userEmail=found.email; else userEmail=full;
  }
  res.cookie('admin','1',{httpOnly:false,sameSite:'lax'});
  if(userEmail) res.cookie('adminUser',userEmail,{httpOnly:false,sameSite:'lax'});
  res.json({ok:true,user:userEmail}); });
app.post('/api/auth/admin-logout',(req,res)=>{ res.clearCookie('admin'); res.json({ok:true}); });

// ---------------- Candidate Answers & Submission ----------------
app.post('/api/candidate/answers',(req,res)=>{ if(req.cookies.candidate!=='1') return res.status(401).json({error:'candidate required'}); const {taskId,fields,email}=req.body||{}; if(!taskId||typeof taskId!=='string') return res.status(400).json({error:'taskId required'}); if(!fields||typeof fields!=='object') return res.status(400).json({error:'fields object required'}); if(!email) return res.status(400).json({error:'email required'}); let updated=null; saveStateMut(s=>{ ensureCandidatesArray(s); ensureAnswersRoot(s); const cand=findCandidate(s,email); if(!cand||candidateLocked(cand)) return; const ans=getCandidateAnswers(s,email); ans[taskId]=mergeAnswerSet(ans[taskId],fields); updated=ans[taskId]; }); if(!updated) return res.status(404).json({error:'candidate not found or locked'}); res.json({ok:true,taskId,answer:updated}); });

app.post('/api/candidate/task1/save',(req,res)=>{ if(req.cookies.candidate!=='1') return res.status(401).json({error:'candidate required'}); const {email,fields}=req.body||{}; if(!email) return res.status(400).json({error:'email required'}); if(!fields||typeof fields!=='object') return res.status(400).json({error:'fields object required'}); let updated=null; let candRef=null; saveStateMut(s=>{ ensureCandidatesArray(s); ensureAnswersRoot(s); const c=findCandidate(s,email); if(!c){return;} candRef=c; if(candidateLocked(c)||c.task1SubmittedAt) return; const ans=getCandidateAnswers(s,email); ans.task1=mergeAnswerSet(ans.task1,fields); updated=ans.task1; }); if(!candRef) return res.status(404).json({error:'candidate not found'}); if(!updated) return res.status(400).json({error:'task1 locked or not updated'}); res.json({ok:true,answer:updated}); });

app.post('/api/candidate/task1/submit',(req,res)=>{ if(req.cookies.candidate!=='1') return res.status(401).json({error:'candidate required'}); const {email}=req.body||{}; if(!email) return res.status(400).json({error:'email required'}); let candRef=null; saveStateMut(s=>{ ensureCandidatesArray(s); const c=findCandidate(s,email); if(!c) return; candRef=c; if(!c.task1SubmittedAt) c.task1SubmittedAt=Date.now(); }); if(!candRef) return res.status(404).json({error:'candidate not found'}); res.json({ok:true,task1SubmittedAt:candRef.task1SubmittedAt}); });

app.post('/api/candidate/submit',(req,res)=>{ if(req.cookies.candidate!=='1') return res.status(401).json({error:'candidate required'}); const email=(req.body&&req.body.email)||''; if(!email) return res.status(400).json({error:'email required'}); let candRef=null; saveStateMut(s=>{ ensureCandidatesArray(s); const c=findCandidate(s,email); if(!c) return; candRef=c; if(!c.submittedAt){ c.submittedAt=Date.now(); ensureAnswersRoot(s); const answers=getCandidateAnswers(s,email); s.answers.finalSnapshots[email.toLowerCase()]={createdAt:Date.now(),answers:JSON.parse(JSON.stringify(answers))}; } }); if(!candRef) return res.status(404).json({error:'candidate not found'}); res.json({ok:true,submittedAt:candRef.submittedAt}); });

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

// Admin list & download uploads
app.get('/api/admin/uploads',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const root=ensureUploadsDirs(); const entries=fs.readdirSync(root).filter(f=>!f.startsWith('.')).map(f=>{ const full=path.join(root,f); const st=fs.statSync(full); return {file:f,size:st.size,mtime:st.mtimeMs}; }); res.json({ok:true,files:entries}); });
app.get('/api/admin/uploads/:file',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).send('admin required'); const root=ensureUploadsDirs(); const file=req.params.file||''; if(!/^[a-z0-9@._-]+_(final|work)_\d+\.[a-z0-9]+$/i.test(file)) return res.status(400).send('bad name'); const full=path.join(root,file); if(!fs.existsSync(full)) return res.status(404).send('not found'); res.download(full); });

app.get('/api/candidate/answers',(req,res)=>{ if(req.cookies.candidate!=='1') return res.status(401).json({error:'candidate required'}); const email=(req.query.email||'').toString(); if(!email) return res.status(400).json({error:'email required'}); const st=readState(); ensureAnswersRoot(st); const cand=findCandidate(st,email); if(!cand) return res.status(404).json({error:'candidate not found'}); const answers=getCandidateAnswers(st,email); res.json({ok:true,answers}); });

// ---------------- Admin Answer Views ----------------
app.get('/api/admin/candidate/:email/answers',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const email=req.params.email||''; const st=readState(); ensureAnswersRoot(st); const cand=findCandidate(st,email); if(!cand) return res.status(404).json({error:'candidate not found'}); const answers=getCandidateAnswers(st,email); res.json({ok:true,email,answers}); });
app.get('/api/admin/candidate/:email/final-work',(req,res)=>{ if(req.cookies.admin!=='1') return res.status(401).json({error:'admin required'}); const email=req.params.email||''; const st=readState(); ensureAnswersRoot(st); const cand=findCandidate(st,email); if(!cand) return res.status(404).json({error:'candidate not found'}); const snap=getFinalSnapshot(st,email); if(!snap) return res.status(404).json({error:'no final submission'}); res.json({ok:true,email,submittedAt:cand.submittedAt,snapshot:snap}); });
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

// ---------------- Catch-all (fallback) ----------------
app.get(/^\/(?!$).*/, (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT, ()=> console.log('Ops 101 Exam Lab on http://localhost:'+PORT));
