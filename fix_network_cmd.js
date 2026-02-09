const fs = require('fs');
let content = fs.readFileSync('/app/src/session-manager.js', 'utf8');

// Fix: When hostNetwork is true, don't include --network ${networkName}
// Change the docker run command to conditionally use network
const oldCmd = 'const cmd = `docker run -d --name ${config.name} --hostname ${config.hostname} --network ${networkName} ${capsArg} ${tmpfsArg} ${privilegedArg} ${dockerSocketArg} ${hostNetworkArg} ${config.image} ${config.cmd}`;';

const newCmd = `const networkArg = config.hostNetwork ? '' : \`--network \${networkName}\`;
        const cmd = \`docker run -d --name \${config.name} --hostname \${config.hostname} \${networkArg} \${capsArg} \${tmpfsArg} \${privilegedArg} \${dockerSocketArg} \${hostNetworkArg} \${config.image} \${config.cmd}\`;`;

content = content.replace(oldCmd, newCmd);

fs.writeFileSync('/app/src/session-manager.js', content);
console.log('Fixed docker run command for host network');
