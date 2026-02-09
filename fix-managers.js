const fs = require('fs');
const file = '/app/src/server.js';
let content = fs.readFileSync(file, 'utf8');

// Remove manager:true from ileel, lihias, nitaid
content = content.replace(
  "{name:'Ilee Levanon', email:'ileel@checkpoint.com', phone:'0535232542', manager:true}",
  "{name:'Ilee Levanon', email:'ileel@checkpoint.com', phone:'0535232542'}"
);
content = content.replace(
  "{name:'Lihia S', email:'lihias@checkpoint.com', phone:'0542578783', manager:true}",
  "{name:'Lihia S', email:'lihias@checkpoint.com', phone:'0542578783'}"
);
content = content.replace(
  "{name:'Nitai D', email:'nitaid@checkpoint.com', phone:'0548181885', manager:true}",
  "{name:'Nitai D', email:'nitaid@checkpoint.com', phone:'0548181885'}"
);

fs.writeFileSync(file, content);
console.log('Updated - removed manager:true from ileel, lihias, nitaid');

// Verify managers
const managers = content.match(/manager:true/g) || [];
console.log('Total managers:', managers.length);

// Show who has manager:true
const staffMatch = content.match(/const STAFF_DIRECTORY = \[([\s\S]*?)\];/);
if (staffMatch) {
  const entries = staffMatch[1].split('},');
  entries.forEach(e => {
    if (e.includes('manager:true')) {
      const nameMatch = e.match(/name:'([^']+)'/);
      console.log('  Manager:', nameMatch ? nameMatch[1] : 'unknown');
    }
  });
}
