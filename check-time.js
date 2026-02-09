const s = require('/app/state/state.json');
const c = s.candidates.find(x => x.email === 'zahalka02@gmail.com');
const base = 3 * 60 * 60 * 1000; // 3 hours
const extra = c.extraTimeMs || 0;
const elapsed = Date.now() - c.startTime;
const remaining = base + extra - elapsed;
console.log('Start time:', new Date(c.startTime).toISOString());
console.log('Extra time:', Math.round(extra / 60000), 'minutes');
console.log('Elapsed:', Math.round(elapsed / 60000), 'minutes');
console.log('Remaining:', Math.round(remaining / 60000), 'minutes');
console.log('Running:', c.running);
