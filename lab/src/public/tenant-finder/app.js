(function(){
'use strict';
// Elements
const root=document.getElementById('appRoot');
const tenantIdInput=document.getElementById('tenantIdInput');
const reqIdInput=document.getElementById('reqIdInput');
const tenantIdFeedback=document.getElementById('tenantIdFeedback');
const reqIdFeedback=document.getElementById('reqIdFeedback');
const submitBtn=document.getElementById('submitBtn');
const submitStatus=document.getElementById('submitStatus');
const ndjsonList=document.getElementById('ndjsonList');
const syslogPane=document.getElementById('syslogPane');
const ndjsonFilter=document.getElementById('ndjsonFilter');
const syslogFilter=document.getElementById('syslogFilter');
const quickChips=document.getElementById('quickChips');
const groupToggle=document.getElementById('groupToggle');
const showCli=document.getElementById('showCli');
const cliBlock=document.getElementById('cliBlock');
// Loader section
const loaderSection=document.getElementById('loaderSection');
const fetchStatus=document.getElementById('fetchStatus');
const fallback=document.getElementById('fallback');
const ndjsonFile=document.getElementById('ndjsonFile');
const syslogFile=document.getElementById('syslogFile');
const manualLoad=document.getElementById('manualLoad');
const dropZone=document.getElementById('dropZone');

// State
let events=[]; // raw parsed NDJSON objects
let syslogLines=[]; // array of strings
let byReq={};
let expectedTenantId=null;
let duplicateTenantIds=false;
let localKey='tenantFinder';

function loadPersisted(){
  try{const raw=localStorage.getItem(localKey); if(!raw) return; const obj=JSON.parse(raw); if(obj){tenantIdInput.value=obj.tenantId||''; reqIdInput.value=obj.reqId||'';}}catch{}
}
function persist(){
  try{localStorage.setItem(localKey, JSON.stringify({tenantId:tenantIdInput.value.trim(), reqId:reqIdInput.value.trim()}));}catch{}
}

// Utility
function esc(str){return (str+'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
const uuidRegex=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseNDJSON(text){
  const lines=text.split(/\n+/); const arr=[]; for(const line of lines){ const trimmed=line.trim(); if(!trimmed) continue; try{ arr.push(JSON.parse(trimmed)); }catch(e){ /* ignore malformed */ } } return arr;
}
function buildByReq(){
  byReq={};
  for(const ev of events){ const k=ev.req_id; if(!k) continue; (byReq[k]||(byReq[k]=[])).push(ev); }
  // sort each by timestamp if ts present
  Object.values(byReq).forEach(list=> list.sort((a,b)=> (a.ts||'').localeCompare(b.ts||'')) );
}
function computeExpected(){
  const ids=new Set();
  for(const [req, list] of Object.entries(byReq)){
    let hasAlias=false; let idVal=null;
    for(const ev of list){ if(ev.tenant_alias==='zenith-core') hasAlias=true; if(ev.tenant_id) idVal=ev.tenant_id; }
    if(hasAlias && idVal) ids.add(idVal);
  }
  if(ids.size===1){ expectedTenantId=[...ids][0]; duplicateTenantIds=false; }
  else if(ids.size>1){ expectedTenantId=null; duplicateTenantIds=true; }
  else { expectedTenantId=null; duplicateTenantIds=false; }
}

function renderNDJSON(){
  const filter=ndjsonFilter.value.trim().toLowerCase();
  ndjsonList.innerHTML='';
  if(groupToggle.checked){
    // grouped mode
    const reqIds=Object.keys(byReq).sort();
    let any=false;
    for(const r of reqIds){
      const list=byReq[r];
      const textJoined=list.map(ev=>JSON.stringify(ev)).join('\n');
      if(filter && !textJoined.toLowerCase().includes(filter)) continue;
      any=true;
      const container=document.createElement('div'); container.className='req-group';
      const head=document.createElement('div'); head.className='req-head'; head.innerHTML=`<span>${esc(r)}</span><span class="badge">${list.length}</span>`; container.appendChild(head);
      const body=document.createElement('div'); body.className='req-body'; body.hidden=true;
      for(const ev of list){
        const line=document.createElement('div'); line.className='log-line';
        const jsonStr=JSON.stringify(ev);
        if(/tenant_alias|tenant_id/.test(jsonStr)) line.classList.add('highlight');
        line.textContent=jsonStr;
        body.appendChild(line);
      }
      head.addEventListener('click',()=> body.hidden=!body.hidden);
      container.appendChild(body);
      ndjsonList.appendChild(container);
    }
    if(!any) ndjsonList.innerHTML='<div class="no-matches">No matches</div>';
  } else {
    // flat mode
    let flat=events;
    if(filter) flat=flat.filter(ev=> JSON.stringify(ev).toLowerCase().includes(filter));
    if(flat.length===0){ ndjsonList.innerHTML='<div class="no-matches">No matches</div>'; return; }
    const frag=document.createDocumentFragment();
    flat.forEach(ev=>{ const d=document.createElement('div'); d.className='log-line'; const jsonStr=JSON.stringify(ev); if(/tenant_alias|tenant_id/.test(jsonStr)) d.classList.add('highlight'); d.textContent=jsonStr; frag.appendChild(d); });
    ndjsonList.appendChild(frag);
  }
}
function renderSyslog(){
  const filter=syslogFilter.value.trim().toLowerCase();
  let lines=syslogLines;
  if(filter) lines=lines.filter(l=> l.toLowerCase().includes(filter));
  syslogPane.textContent=lines.join('\n');
  if(!lines.length) syslogPane.textContent='No matches';
}

function validate(){
  const tenantVal=tenantIdInput.value.trim();
  const reqVal=reqIdInput.value.trim();
  let tenantOk=false; let reqOk=false;
  if(duplicateTenantIds){
    tenantIdFeedback.innerHTML='<span class="error-text">Multiple tenant IDs found for zenith-core — contact examiner.</span>';
  } else if(!expectedTenantId){
    tenantIdFeedback.textContent='Waiting for a zenith-core event with tenant_id…';
  } else if(!uuidRegex.test(tenantVal)){
    tenantIdFeedback.innerHTML='<span class="error-text">Enter a valid UUID.</span>';
  } else if(tenantVal!==expectedTenantId){
    tenantIdFeedback.innerHTML='<span class="error-text">Incorrect tenant ID.</span>';
  } else {
    tenantIdFeedback.innerHTML='<span class="success-badge">Tenant ID matches</span>';
    tenantOk=true;
  }
  if(reqVal){
    const group=byReq[reqVal];
    if(!group){ reqIdFeedback.innerHTML='<span class="error-text">Unknown req_id.</span>'; }
    else {
      const hasAlias=group.some(ev=>ev.tenant_alias==='zenith-core');
      const hasTenant=group.some(ev=>ev.tenant_id===expectedTenantId);
      if(hasAlias && hasTenant && tenantOk){ reqIdFeedback.innerHTML='<span class="success-badge">Correlation OK</span>'; reqOk=true; }
      else if(!tenantOk){ reqIdFeedback.textContent='Enter correct tenant ID first.'; }
      else { reqIdFeedback.innerHTML='<span class="error-text">req_id does not prove correlation.</span>'; }
    }
  } else { reqIdFeedback.textContent=''; }
  const allOk=tenantOk && reqOk;
  submitBtn.disabled=!allOk;
  if(allOk){ submitStatus.innerHTML='<span class="success-badge">Ready to submit</span>'; }
  else submitStatus.textContent='';
  persist();
}

submitBtn.addEventListener('click',()=>{
  submitStatus.innerHTML='<span class="success-badge">Submitted</span>';
});
[tenantIdInput,reqIdInput].forEach(inp=> inp.addEventListener('input', validate));
[ndjsonFilter,syslogFilter,groupToggle].forEach(el=> el.addEventListener('input',()=>{renderNDJSON(); renderSyslog();}));
ndjsonFilter.addEventListener('input',renderNDJSON);
syslogFilter.addEventListener('input',renderSyslog);
showCli.addEventListener('click',()=>{ cliBlock.hidden=!cliBlock.hidden; if(!cliBlock.hidden){navigator.clipboard && navigator.clipboard.writeText(cliBlock.textContent).catch(()=>{});} });

const chipDefs=[
  {label:'alias:zenith-core', apply:()=> ndjsonFilter.value='zenith-core'},
  {label:'has:tenant_id', apply:()=> ndjsonFilter.value='tenant_id'},
  {label:'status:401', apply:()=> ndjsonFilter.value='401'},
  {label:'msg:authz.decision', apply:()=> ndjsonFilter.value='authz.decision'}
];
chipDefs.forEach(c=>{ const b=document.createElement('button'); b.type='button'; b.className='chip'; b.textContent=c.label; b.addEventListener('click',()=>{ c.apply(); renderNDJSON(); validate();}); quickChips.appendChild(b); });

// Loading logic
async function tryFetch(){
  try{ fetchStatus.textContent='Fetching logs…';
    const [ndRes, sysRes]=await Promise.all([
      fetch('data/auth_gateway_logs.ndjson',{cache:'no-store'}),
      fetch('data/auth_gateway_syslog.txt',{cache:'no-store'})
    ]);
    if(!ndRes.ok || !sysRes.ok) throw new Error('HTTP error');
    const ndText=await ndRes.text();
    const sysText=await sysRes.text();
    ingest(ndText, sysText);
  }catch(e){
    fetchStatus.innerHTML='<span class="error-text">Fetch failed or blocked. Use fallback.</span>';
    fallback.hidden=false;
  }
}

function ingest(ndText, sysText){
  events=parseNDJSON(ndText);
  syslogLines=sysText.split(/\n+/).filter(Boolean);
  buildByReq();
  computeExpected();
  renderNDJSON();
  renderSyslog();
  validate();
  loaderSection.hidden=true;
  root.hidden=false;
}

function checkManualReady(){
  manualLoad.disabled=!(ndjsonFile.files.length && syslogFile.files.length);
}
[ndjsonFile,syslogFile].forEach(inp=> inp.addEventListener('change',checkManualReady));
manualLoad.addEventListener('click',()=>{
  const fr1=new FileReader(); const fr2=new FileReader();
  let t1=null,t2=null; function done(){ if(t1!=null && t2!=null) ingest(t1,t2); }
  fr1.onload=e=>{ t1=e.target.result; done(); }; fr2.onload=e=>{ t2=e.target.result; done(); };
  fr1.readAsText(ndjsonFile.files[0]); fr2.readAsText(syslogFile.files[0]);
});
// drag and drop
;['dragenter','dragover'].forEach(evt=> dropZone.addEventListener(evt,e=>{e.preventDefault(); dropZone.classList.add('drag');}));
;['dragleave','drop'].forEach(evt=> dropZone.addEventListener(evt,e=>{e.preventDefault(); if(evt==='drop') return; dropZone.classList.remove('drag');}));
 dropZone.addEventListener('drop',e=>{ dropZone.classList.remove('drag'); const files=[...e.dataTransfer.files]; const nd=files.find(f=>/ndjson|json|log|txt/i.test(f.name)); const sys=files.find(f=>/syslog|\.txt|\.log/i.test(f.name)); if(nd) ndjsonFile.files=new DataTransfer().files; if(sys) syslogFile.files=new DataTransfer().files; // simpler: just read all
  const frA=new FileReader(); const frB=new FileReader(); let a=null,b=null; function done(){ if(a!=null && b!=null) ingest(a,b);} frA.onload=ev=>{a=ev.target.result; done();}; frB.onload=ev=>{b=ev.target.result; done();}; if(files[0]) frA.readAsText(files[0]); if(files[1]) frB.readAsText(files[1]); });

loadPersisted();
tryFetch();
})();