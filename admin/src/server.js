const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({limit:'5mb'}));

// State JSON is shared from the main lab service via a volume mount at /app/lab/state
// __dirname = /app/src so we only need to go up one level.
const STATE_PATH = path.join(__dirname, '..','lab','state','state.json');
const SEED_PATH = path.join(__dirname, '..','seed','users_seed.json');
const TOKEN_FILE = path.join(__dirname, '..','token.txt');

function initStateFile(){
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    if(!fs.existsSync(STATE_PATH)){
      fs.writeFileSync(STATE_PATH, JSON.stringify({ users: [] }, null, 2));
    }
  } catch(e){
    console.error('Failed to initialize state file', e);
  }
}

function loadState(){
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH,'utf8'));
  } catch(e){
    console.warn('State file unreadable, reinitializing', e.message);
    initStateFile();
    return { users: [] };
  }
}
function saveState(st){ fs.writeFileSync(STATE_PATH, JSON.stringify(st,null,2)); }
function ensureUsers(st){ if(!st.users) st.users = []; return st.users; }

function loadSeed(){ return JSON.parse(fs.readFileSync(SEED_PATH,'utf8')); }
function buildSeedUsers(seed){
  const users = []; const { firstNames, lastNames, count } = seed;
  for(let i=1;i<=count;i++){
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[i % lastNames.length];
    users.push({ id:i, firstName:fn, lastName:ln });
  }
  return users;
}

let ADMIN_TOKEN = process.env.ADMIN_TOKEN;
if(!ADMIN_TOKEN){
  try { ADMIN_TOKEN = fs.readFileSync(TOKEN_FILE,'utf8').trim(); }
  catch { console.warn('No ADMIN_TOKEN env or token.txt; using insecure default.'); ADMIN_TOKEN='insecure-admin'; }
}

// Middleware: block CORS / browser console usage
function blockCors(req,res,next){
  if(req.method === 'OPTIONS' || req.headers.origin){
    return res.status(403).json({error:'CORS blocked'});
  }
  next();
}

function requireAuth(req,res,next){
  const auth = req.headers['authorization'] || '';
  if(!auth.startsWith('Bearer ')) return res.status(401).json({error:'missing bearer token'});
  const token = auth.slice(7).trim();
  if(token !== ADMIN_TOKEN) return res.status(403).json({error:'invalid token'});
  next();
}

app.use(blockCors);

app.get('/admin/health',(req,res)=> res.json({ok:true}));

// Optional list
app.get('/admin/users', requireAuth, (req,res)=>{
  const st = loadState();
  const all = ensureUsers(st);
  const offset = Math.max(parseInt(req.query.offset||'0',10),0);
  const limit = Math.min(Math.max(parseInt(req.query.limit||'100',10),1),5000);
  const slice = all.slice(offset, offset+limit);
  res.json({ total: all.length, offset, limit, users: slice });
});

app.delete('/admin/users/:id', requireAuth, (req,res)=>{
  const st = loadState();
  const list = ensureUsers(st);
  const id = parseInt(req.params.id,10);
  const idx = list.findIndex(u=>u.id===id);
  if(idx===-1) return res.status(404).json({error:'not found'});
  list.splice(idx,1);
  saveState(st);
  res.status(204).end();
});

app.post('/admin/reset', requireAuth, (req,res)=>{
  const st = loadState();
  const seed = loadSeed();
  st.users = buildSeedUsers(seed);
  saveState(st);
  res.json({ ok:true, total: st.users.length });
});

const PORT = process.env.PORT || 8082;
app.listen(PORT, ()=> console.log('Admin API listening on port '+PORT));
