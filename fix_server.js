const fs = require('fs');
let content = fs.readFileSync('/app/src/server.js', 'utf8');
content = content.replace("'host']", "'host', 'waf-terminal']");
fs.writeFileSync('/app/src/server.js', content);
console.log('Fixed validContainers');
