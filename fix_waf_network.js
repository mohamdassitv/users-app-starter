const fs = require('fs');
let content = fs.readFileSync('/app/src/session-manager.js', 'utf8');

// Update waf-terminal config to use host network
const oldConfig = `name: \`\${prefix}-waf-terminal\`,
          image: 'alpine:3.20',
          hostname: 'waf-terminal',
          cmd: 'sh -c "apk add --no-cache bash curl docker-cli nano vim jq && tail -f /dev/null"',
          caps: [],
          dockerSocket: true`;

const newConfig = `name: \`\${prefix}-waf-terminal\`,
          image: 'alpine:3.20',
          hostname: 'waf-terminal',
          cmd: 'sh -c "apk add --no-cache bash curl docker-cli nano vim jq && tail -f /dev/null"',
          caps: [],
          dockerSocket: true,
          hostNetwork: true`;

content = content.replace(oldConfig, newConfig);

// Add hostNetwork handling in the docker run command
// Find the docker run command line and add hostNetworkArg
const oldDockerRun = '${capsArg} ${tmpfsArg} ${privilegedArg} ${dockerSocketArg} ${config.image}';
const newDockerRun = '${capsArg} ${tmpfsArg} ${privilegedArg} ${dockerSocketArg} ${hostNetworkArg} ${config.image}';

content = content.replace(oldDockerRun, newDockerRun);

// Add hostNetworkArg definition after dockerSocketArg
const oldSocketArg = `const dockerSocketArg = config.dockerSocket
          ? '-v /var/run/docker.sock:/var/run/docker.sock'
          : '';`;

const newSocketArg = `const dockerSocketArg = config.dockerSocket
          ? '-v /var/run/docker.sock:/var/run/docker.sock'
          : '';

        const hostNetworkArg = config.hostNetwork
          ? '--network host'
          : '';`;

content = content.replace(oldSocketArg, newSocketArg);

fs.writeFileSync('/app/src/session-manager.js', content);
console.log('Updated session-manager.js with hostNetwork support');
