const fs = require('fs');
const file = '/app/lab/state/state.json';
const state = JSON.parse(fs.readFileSync(file, 'utf8'));

const email = 'zahalka02@gmail.com';
const minutesToAdd = 30;

const candidate = state.candidates.find(c => c.email === email);
if (candidate) {
  const oldExtra = candidate.extraTimeMs || 0;
  candidate.extraTimeMs = oldExtra + (minutesToAdd * 60000);
  candidate.endTime = null; // Clear cached end time
  
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
  
  console.log('SUCCESS: Added', minutesToAdd, 'minutes to', email);
  console.log('Old extraTimeMs:', oldExtra);
  console.log('New extraTimeMs:', candidate.extraTimeMs);
  console.log('Total extra time:', Math.round(candidate.extraTimeMs / 60000), 'minutes');
} else {
  console.log('ERROR: Candidate not found:', email);
}
