const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8081;

const STATE_PATH = path.join(__dirname, '..', 'state', 'state.json');
function readState(){return JSON.parse(fs.readFileSync(STATE_PATH,'utf8'));}
function writeState(s){fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));}

// ---- Exam / Timer helpers ----
function ensureExam(st){
  if(!st.exam){
    st.exam = { phone:null, startTime:null, durationMs: 6*60*60*1000, // 6 hours
      // derived fields are computed on request
    };
    writeState(st);
  }
  return st.exam;
}
function ensureContacts(st){ if(!st.contacts) { st.contacts = []; writeState(st);} return st.contacts; }
function examStatusObj(exam){
  const now = Date.now();
  let remainingMs = null;
  let running = false;
  if(exam.startTime){
    const end = new Date(exam.startTime).getTime() + exam.durationMs;
    remainingMs = Math.max(0, end - now);
    running = remainingMs > 0;
  }
  return { phone: exam.phone, startTime: exam.startTime, durationMs: exam.durationMs, running, remainingMs };
}

// Initialize large users dataset if absent
function ensureUsers(st){
  if(!st.users || !Array.isArray(st.users) || st.users.length === 0){
    const firstNames = ['Alice','Bob','Carol','David','Eve','Frank','Grace','Heidi','Ivan','Judy','Mallory','Niaj','Olivia','Peggy','Rupert','Sybil','Trent','Victor','Wendy','Yvonne','Zara'];
    const lastNames = ['Anderson','Baker','Clark','Davis','Evans','Franklin','Green','Hughes','Irwin','Johnson','Klein','Lopez','Miller','Norris','Olsen','Parker','Quinn','Reed','Simpson','Turner','Ulrich','Vance','White','Xu','Young','Zimmer'];
    const users = [];
    for(let i=1;i<=5000;i++){
      const fn = firstNames[i % firstNames.length];
      const ln = lastNames[i % lastNames.length];
      users.push({ id: i, firstName: fn, lastName: ln });
    }
    st.users = users;
    writeState(st);
  }
  return st.users;
}

// Ensure scenario primary key exists (simple reproducible token unless RESET_SCENARIO=1)
function ensureScenario(st){
  if (process.env.RESET_SCENARIO === '1' || !st.scenario || !st.scenario.pk){
    const pk = 'PK-' + Math.random().toString(36).slice(2,8).toUpperCase();
    const createdAt = new Date().toISOString();
  const okLabelNumber = Math.floor(100 + Math.random()*900); // 3-digit label for /gateway/ok
  const forbiddenLabelNumber = Math.floor(100 + Math.random()*900); // 3-digit label for /gateway/forbidden
  const badLabelNumber = Math.floor(100 + Math.random()*900); // 3-digit label for /gateway/bad
  st.scenario = { pk, createdAt, okLabelNumber, forbiddenLabelNumber, badLabelNumber };
    writeState(st);
  } else if (st.scenario && typeof st.scenario.okLabelNumber === 'undefined') {
    st.scenario.okLabelNumber = Math.floor(100 + Math.random()*900);
    writeState(st);
  } else if (st.scenario) {
    let mutated = false;
    if (typeof st.scenario.forbiddenLabelNumber === 'undefined') { st.scenario.forbiddenLabelNumber = Math.floor(100 + Math.random()*900); mutated = true; }
    if (typeof st.scenario.badLabelNumber === 'undefined') { st.scenario.badLabelNumber = Math.floor(100 + Math.random()*900); mutated = true; }
    if (mutated) writeState(st);
  }
  return st.scenario;
}

app.use(bodyParser.json({limit:'2mb'}));
app.use(express.static(path.join(__dirname,'public')));

// ---- Gateway simulation ----
function headerToken(res){ res.set('X-Lab-Trace','LAB-QGZK7V'); }
app.get('/gateway/ok', (req,res)=>{ 
  headerToken(res); 
  const st = readState();
  const sc = ensureScenario(st);
  res.send(String(sc.okLabelNumber));
});
app.get('/gateway/forbidden', (req,res)=>{ 
  headerToken(res); 
  const st = readState();
  const sc = ensureScenario(st);
  res.status(403).send(String(sc.forbiddenLabelNumber));
});
app.get('/gateway/bad', (req,res)=>{ 
  headerToken(res); 
  const st = readState();
  const sc = ensureScenario(st);
  res.status(502).send(String(sc.badLabelNumber));
});
app.get('/gateway/delay/:ms', (req,res)=>{
  headerToken(res);
  const ms = Math.min(parseInt(req.params.ms||'0',10), 10000);
  setTimeout(()=> res.send('Delayed '+ms+'ms'), ms);
});
// Utility endpoints kept
app.get('/api/token', (req,res)=> res.json({token: 'LAB-QGZK7V'}));
app.get('/api/scenario', (req,res)=>{ const st = readState(); const sc = ensureScenario(st); res.json(sc); });

// ---- Exam endpoints ----
app.get('/api/exam/status',(req,res)=>{
  const st = readState();
  const exam = ensureExam(st);
  res.json(examStatusObj(exam));
});
app.post('/api/exam/phone',(req,res)=>{
  const st = readState();
  const exam = ensureExam(st);
  if(exam.phone){ return res.status(400).json({error:'phone already set'}); }
  const { phone } = req.body || {};
  if(!phone || !/^\+?\d{6,15}$/.test(phone)) return res.status(400).json({error:'invalid phone'});
  exam.phone = phone;
  writeState(st);
  res.json(examStatusObj(exam));
});
app.post('/api/exam/start',(req,res)=>{
  const st = readState();
  const exam = ensureExam(st);
  if(!exam.startTime){
    exam.startTime = new Date().toISOString();
    writeState(st);
  }
  res.json(examStatusObj(exam));
});
app.post('/api/exam/reset-all',(req,res)=>{
  const { password } = req.body || {};
  if(password !== '2025') return res.status(403).json({error:'forbidden'});
  const st = readState();
  // Reset scenario, users, exam
  st.scenario = null;
  st.users = [];
  st.exam = null;
  st.contacts = [];
  writeState(st);
  // Repopulate baseline structures
  ensureScenario(st);
  ensureUsers(st);
  ensureExam(st);
  res.json({reset:true});
});

// ---- Contact endpoints ----
app.post('/api/contact',(req,res)=>{
  const { subject, message } = req.body || {};
  if(!message || typeof message !== 'string' || !message.trim()) return res.status(400).json({error:'message required'});
  const st = readState();
  const contacts = ensureContacts(st);
  const entry = { id: contacts.length+1, subject: (subject||'').trim()||null, message: message.trim(), ts: new Date().toISOString() };
  contacts.push(entry);
  writeState(st);
  res.status(201).json({saved:true,id:entry.id});
});
app.get('/api/contact',(req,res)=>{ const st = readState(); const contacts = ensureContacts(st); res.json({total:contacts.length, contacts}); });

// ---- Users dataset endpoints ----
// GET /api/users?offset=0&limit=100 (defaults)
app.get('/api/users', (req,res)=>{
  const st = readState();
  const all = ensureUsers(st);
  const offset = Math.max(parseInt(req.query.offset||'0',10),0);
  const limit = Math.min(Math.max(parseInt(req.query.limit||'100',10),1),5000);
  const slice = all.slice(offset, offset+limit);
  res.json({ total: all.length, offset, limit, users: slice });
});
// POST /api/users/reset -> regenerate baseline 5000 users (IDs reset sequentially)
app.post('/api/users/reset', (req,res)=>{
  const st = readState();
  // Clear list and repopulate
  st.users = [];
  ensureUsers(st); // will repopulate and write
  res.json({reset:true,total:st.users.length});
});
// POST /api/users {firstName,lastName}
app.post('/api/users', (req,res)=>{
  const { firstName, lastName } = req.body || {};
  if(!firstName || !lastName) return res.status(400).json({error:'firstName and lastName required'});
  const st = readState();
  const list = ensureUsers(st);
  const id = (list.length ? list[list.length-1].id+1 : 1);
  const user = { id, firstName, lastName };
  list.push(user);
  writeState(st);
  res.status(201).json(user);
});
// DELETE /api/users/:id
app.delete('/api/users/:id', (req,res)=>{
  const id = parseInt(req.params.id,10);
  const st = readState();
  const list = ensureUsers(st);
  const idx = list.findIndex(u=>u.id===id);
  if(idx===-1) return res.status(404).json({error:'not found'});
  const removed = list.splice(idx,1)[0];
  writeState(st);
  res.json({removed});
});

// Root serves simplified index (static file already in public)
// Fallback 404 for any other removed routes to avoid implying other tasks
app.use((req,res)=> res.status(404).json({error:'not found'}));

app.listen(PORT, ()=> console.log('Ops 101 Exam Lab on http://localhost:'+PORT));
