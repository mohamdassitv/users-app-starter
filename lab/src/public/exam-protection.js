// Exam Status Protection - Prevents candidates from accessing tasks after exam is finished
// Allows admin/manager viewing
(async function checkExamStatus(){
  const email = localStorage.getItem('candidateEmail');
  if(!email) return;
  
  // Check if already marked as submitted
  const alreadySubmitted = localStorage.getItem('candidateSubmitted') === '1';
  if(alreadySubmitted && !document.cookie.includes('admin=') && !document.cookie.includes('manager=')){
    alert('Your exam has been finished. You cannot continue.');
    location.href = '/finished.html';
    return;
  }
  
  // Check if this is admin viewing (has admin or manager cookie)
  const hasAdminCookie = document.cookie.split(';').some(c => {
    const trimmed = c.trim();
    return trimmed.startsWith('admin=') || trimmed.startsWith('manager=');
  });
  if(hasAdminCookie) return; // Allow admin/manager to view
  
  try {
    const r = await fetch('/api/candidate/' + encodeURIComponent(email));
    if(r.ok){
      const data = await r.json();
      // Only block if exam is explicitly finished (not just not started)
      // Check for finishedAt, submittedAt, or expiredAt timestamps
      if(data.finishedAt || data.submittedAt || data.expiredAt){
        localStorage.setItem('candidateSubmitted', '1');
        alert('Your exam has been finished. You cannot continue.');
        location.href = '/finished.html';
        return;
      }
      // Additional check: if exam was started but is no longer running (time expired)
      if(data.startTime && !data.running && data.remainingMs !== undefined && data.remainingMs <= 0){
        localStorage.setItem('candidateSubmitted', '1');
        alert('Your exam time has expired. You cannot continue.');
        location.href = '/finished.html';
        return;
      }
    }
  } catch(e){ /* ignore network errors */ }
  
  // Set up continuous monitoring for this page
  const checkInterval = setInterval(async () => {
    if(document.cookie.includes('admin=') || document.cookie.includes('manager=')) {
      clearInterval(checkInterval);
      return;
    }
    
    try {
      const r = await fetch('/api/candidate/' + encodeURIComponent(email));
      if(r.ok){
        const data = await r.json();
        if(data.finishedAt || data.submittedAt || data.expiredAt || 
           (data.startTime && !data.running && data.remainingMs !== undefined && data.remainingMs <= 0)){
          localStorage.setItem('candidateSubmitted', '1');
          clearInterval(checkInterval);
          location.href = '/finished.html';
        }
      }
    } catch(e){ /* ignore */ }
  }, 2000); // Check every 2 seconds
})();
