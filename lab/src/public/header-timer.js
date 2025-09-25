// Global header timer component
(async function(){
  function el(sel){ return document.querySelector(sel); }
  const header = el('.site-header');
  if(!header) return;
  if(el('.header-timer')) return; // avoid duplicate
  const wrap = document.createElement('div');
  wrap.className='header-timer';
  wrap.innerHTML = '<span class="candidate-badge" id="candidateBadge" style="display:none"></span>'+
    '<div class="neon-mini-countdown" id="neonCountdown" aria-label="Remaining time" role="timer">'+
      '<div class="neon-mini-box" id="boxHours"><div class="digit" id="digitHours">00</div><div class="digit-label">HRS</div></div>'+
      '<div class="neon-mini-box" id="boxMinutes"><div class="digit" id="digitMinutes">00</div><div class="digit-label">MIN</div></div>'+
      '<div class="neon-mini-box" id="boxSeconds"><div class="digit" id="digitSeconds">00</div><div class="digit-label">SEC</div></div>'+
      '<div class="neon-finale-text" id="finaleMsg" style="display:none;margin-left:8px;">BREACH COMPLETE</div>'+
  '</div>'+
  '<button type="button" id="htAdmin">Admin</button>';
  header.appendChild(wrap);

  function getCandidateEmail(){ return localStorage.getItem('candidateEmail') || null; }
  async function candidateStatus(email){ try { const r=await fetch('/api/candidate/'+encodeURIComponent(email)); return r.ok? r.json():null; } catch(e){ return null; } }
  async function examStatus(){ try { const r=await fetch('/api/exam/status'); return r.ok? r.json():{}; } catch(e){ return {}; } }
  function fmt(ms){ if(ms==null) return '--:--:--'; let s=Math.floor(ms/1000); const h=String(Math.floor(s/3600)).padStart(2,'0'); s%=3600; const m=String(Math.floor(s/60)).padStart(2,'0'); s%=60; return h+':'+m+':'+String(s).padStart(2,'0'); }
  function updateBar(){ /* removed progress bar */ }

  async function refresh(){
    const email = getCandidateEmail();
    let st=null; let mode='exam';
    if(email){ st = await candidateStatus(email); mode='candidate'; if(!st){ // stale email
        localStorage.removeItem('candidateEmail');
        localStorage.removeItem('candidateName');
        mode='exam';
        st = await examStatus();
      }}
    if(!st){ st = await examStatus(); mode='exam'; }
    const hEl=el('#digitHours');
    const mEl=el('#digitMinutes');
    const sEl=el('#digitSeconds');
    const finale=el('#finaleMsg');
  const startBtn=null; // removed manual start button
    const badge=el('#candidateBadge');
    if(!hEl||!mEl||!sEl) return;
    if(mode==='candidate' && st && st.email){
      badge.style.display='inline-flex';
      badge.textContent = st.name || st.email;
      badge.title = st.email + ' (candidate)';
    } else {
      badge.style.display='none';
    }
    function setDigits(ms){
      if(ms<0) ms=0;
      const totalSeconds=Math.floor(ms/1000);
      const hours=Math.floor(totalSeconds/3600);
      const minutes=Math.floor((totalSeconds%3600)/60);
      const seconds=totalSeconds%60;
      hEl.textContent=String(hours).padStart(2,'0');
      mEl.textContent=String(minutes).padStart(2,'0');
      sEl.textContent=String(seconds).padStart(2,'0');
    }
    if(st.running){
      setDigits(st.remainingMs);
  // already running
      if(st.remainingMs===0){
        finale.style.display='inline-block';
        document.getElementById('boxHours').classList.add('expired');
        document.getElementById('boxMinutes').classList.add('expired');
        document.getElementById('boxSeconds').classList.add('expired');
  // finished
      } else { finale.style.display='none'; }
    } else if(st.startTime){
      setDigits(0);
      finale.style.display='inline-block';
      document.getElementById('boxHours').classList.add('expired');
      document.getElementById('boxMinutes').classList.add('expired');
      document.getElementById('boxSeconds').classList.add('expired');
  // finished
    } else {
      setDigits(4*60*60*1000); // full 4h shown before start
      finale.style.display='none';
  // not started yet
    }
  }
  // Auto-start logic: if candidate logged in and no startTime yet, start immediately.
  async function autoStartIfNeeded(){
    const email=getCandidateEmail();
    if(!email) return; // only auto-start for candidate mode
    const st = await candidateStatus(email);
    if(!st || st.startTime) return; // already started or cannot fetch
    await fetch('/api/candidate/'+encodeURIComponent(email)+'/start',{method:'POST'});
  }
  // Kick off auto-start early
  autoStartIfNeeded();
  el('#htAdmin').addEventListener('click', ()=>{ window.location='/admin-login.html'; });
  setInterval(refresh,1000); refresh();
})();
