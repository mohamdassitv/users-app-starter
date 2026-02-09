const fs = require('fs');
const file = '/app/src/server.js';
let content = fs.readFileSync(file, 'utf8');

// Replace Yana line and add new entries
const oldLine = "  {name:'Yana Silutin', email:'yanasi@checkpoint.com', phone:'0542519667'}\n];";
const newLines = `  {name:'Yana Silutin', email:'yanasi@checkpoint.com', phone:'0542519667'},
  {name:'Lihia S', email:'lihias@checkpoint.com', phone:'0542578783', manager:true},
  {name:'Nitai D', email:'nitaid@checkpoint.com', phone:'0548181885', manager:true}
];`;

if (content.includes(oldLine)) {
  content = content.replace(oldLine, newLines);
  fs.writeFileSync(file, content);
  console.log('SUCCESS: Added lihias and nitaid to STAFF_DIRECTORY');
} else {
  console.log('Pattern not found, trying alternative...');
  // Try with different line endings
  const alt = "  {name:'Yana Silutin', email:'yanasi@checkpoint.com', phone:'0542519667'}";
  if (content.includes(alt + '\r\n];')) {
    content = content.replace(alt + '\r\n];', newLines);
  } else if (content.includes(alt)) {
    content = content.replace(alt + '\n];', newLines);
  }
  fs.writeFileSync(file, content);
  console.log('SUCCESS (alt): Added lihias and nitaid');
}

// Verify
const verify = fs.readFileSync(file, 'utf8');
console.log('Verification:');
['lihias', 'nitaid', 'ileel'].forEach(name => {
  const found = verify.includes(name + '@checkpoint.com');
  const isManager = verify.includes(`email:'${name}@checkpoint.com'`) && 
                    verify.match(new RegExp(`email:'${name}@checkpoint.com'[^}]*manager:true`));
  console.log(`  ${name}: ${found ? 'EXISTS' : 'MISSING'} - manager: ${isManager ? 'YES' : 'NO'}`);
});
