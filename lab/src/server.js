const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8081;

const STATE_PATH = path.join(__dirname, '..', 'state', 'state.json');
function readState(){return JSON.parse(fs.readFileSync(STATE_PATH,'utf8'));}
function writeState(s){fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));}

app.use(bodyParser.json({limit:'2mb'}));

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

// ---- Static pages catch-all (excluding root which is handled above)
app.get(/^\/(?!$).*/, (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT, ()=> console.log('Ops 101 Exam Lab on http://localhost:'+PORT));
