/**
 * Session Manager - Per-Candidate Isolation System
 * 
 * Manages:
 * - Unique Docker containers per candidate session
 * - Isolated state directories
 * - Terminal routing to candidate-specific containers
 * - Session lifecycle (create, snapshot, cleanup)
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const execAsync = promisify(exec);

class SessionManager {
  constructor(pool) {
    this.pool = pool;
    this.activeSessions = new Map(); // sessionId -> { containers: [], stateDir: string, startedAt: number }
    // Use persistent mounted path: /app/lab/state/sessions (survives container restarts)
    this.STATE_ROOT = path.join(__dirname, '..', 'lab', 'state', 'sessions');
    this.ensureStateRoot();
  }

  ensureStateRoot() {
    try {
      fs.mkdirSync(this.STATE_ROOT, { recursive: true });
    } catch (e) {
      console.error('[SessionManager] Failed to create state root:', e.message);
    }
  }

  /**
   * Recover active sessions from running Docker containers on startup
   * This is important because SessionManager state is in-memory and lost on restart
   */
  async recoverExistingSessions() {
    console.log('[SessionManager] Recovering existing sessions from Docker containers...');
    
    try {
      // Get all running exam containers
      const { stdout } = await execAsync('docker ps --filter "name=exam-" --format "{{.Names}}"');
      const containerNames = stdout.trim().split('\n').filter(Boolean);
      
      if (containerNames.length === 0) {
        console.log('[SessionManager] No existing exam containers found');
        return;
      }
      
      // Group containers by session ID (exam-XXXXX-TYPE format)
      const sessionMap = new Map();
      for (const name of containerNames) {
        const match = name.match(/^exam-([a-z0-9]+)-(.+)$/);
        if (match) {
          const sessionPrefix = match[1]; // First 8 chars of session ID
          const containerType = match[2]; // tokyo, osaka, etc.
          
          if (!sessionMap.has(sessionPrefix)) {
            sessionMap.set(sessionPrefix, []);
          }
          sessionMap.get(sessionPrefix).push({ name, type: containerType });
        }
      }
      
      // Restore each session
      for (const [sessionPrefix, containers] of sessionMap.entries()) {
        // Try to find full session ID from state directories
        const stateDirs = fs.readdirSync(this.STATE_ROOT).filter(d => d.startsWith(sessionPrefix));
        const fullSessionId = stateDirs.length > 0 ? stateDirs[0] : `${sessionPrefix}unknown`;
        const stateDir = path.join(this.STATE_ROOT, fullSessionId);
        
        // Ensure state directory exists
        fs.mkdirSync(stateDir, { recursive: true });
        
        this.activeSessions.set(fullSessionId, {
          sessionId: fullSessionId,
          containers: containers.map(c => ({ name: c.name, id: c.name, hostname: c.type, network: `exam-${sessionPrefix}-net` })),
          stateDir: stateDir,
          startedAt: Date.now(),
          recovered: true
        });
        
        console.log(`[SessionManager] Recovered session ${fullSessionId} with ${containers.length} containers`);
      }
      
      console.log(`[SessionManager] Recovery complete: ${this.activeSessions.size} sessions restored`);
    } catch (error) {
      console.error('[SessionManager] Failed to recover sessions:', error.message);
    }
  }

  /**
   * Initialize a new candidate session
   * Creates isolated Docker containers and state directory
   */
  async initializeSession(sessionId, candidateEmail) {
    console.log(`[SessionManager] Initializing session ${sessionId} for ${candidateEmail}`);
    
    try {
      // Create isolated state directory
      const stateDir = path.join(this.STATE_ROOT, sessionId);
      fs.mkdirSync(stateDir, { recursive: true });
      fs.mkdirSync(path.join(stateDir, 'answers'), { recursive: true });
      fs.mkdirSync(path.join(stateDir, 'terminal-logs'), { recursive: true });
      fs.mkdirSync(path.join(stateDir, 'docker-snapshots'), { recursive: true });

      // Initialize session metadata
      const metadata = {
        sessionId,
        candidateEmail,
        createdAt: new Date().toISOString(),
        status: 'active',
        containers: [],
        terminalHistory: {}
      };
      fs.writeFileSync(
        path.join(stateDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      // Spawn Docker containers for this session
      const containers = await this.spawnSessionContainers(sessionId);

      // Reset WAF exam to broken state for Task 4
      await this.resetWafExam();

      // Register active session
      this.activeSessions.set(sessionId, {
        containers,
        stateDir,
        startedAt: Date.now(),
        candidateEmail
      });

      console.log(`[SessionManager] Session ${sessionId} initialized with ${containers.length} containers`);
      
      return {
        success: true,
        sessionId,
        stateDir,
        containers,
        containerNames: containers.map(c => c.name)
      };
    } catch (error) {
      console.error(`[SessionManager] Failed to initialize session ${sessionId}:`, error);
      // Cleanup on failure
      await this.cleanupSession(sessionId, false);
      throw error;
    }
  }

  /**
   * Spawn isolated Docker containers for a session
   * Each container gets a unique name based on sessionId
   */
  async spawnSessionContainers(sessionId) {
    const prefix = `exam-${sessionId.substring(0, 8)}`;
    const networkName = `${prefix}-net`;
    
    const containers = [];

    try {
      // Create dedicated network for this session
      console.log(`[SessionManager] Creating network ${networkName}`);
      await execAsync(`docker network create ${networkName} 2>/dev/null || true`);

      // Define container configurations
      const containerConfigs = [
        {
          name: `${prefix}-tokyo`,
          image: 'alpine:3.20',
          hostname: 'tokyo-branch',
          cmd: 'sh -c "apk add --no-cache bash curl iputils bind-tools tcpdump iproute2 util-linux traceroute coreutils && ln -sf /bin/bash /bin/sh && tail -f /dev/null"',
          caps: ['NET_ADMIN']
        },
        {
          name: `${prefix}-osaka`,
          image: 'alpine:3.20',
          hostname: 'osaka-branch',
          cmd: 'sh -c "apk add --no-cache bash curl iputils bind-tools tcpdump iproute2 util-linux traceroute coreutils stress-ng && ln -sf /bin/bash /bin/sh && tail -f /dev/null"',
          caps: ['NET_ADMIN'],
          slowBranch: true  // Mark as slow branch for diagnostics
        },
        {
          name: `${prefix}-kyoto`,
          image: 'alpine:3.20',
          hostname: 'kyoto-branch',
          cmd: 'sh -c "apk add --no-cache bash curl iputils bind-tools tcpdump iproute2 util-linux traceroute coreutils && ln -sf /bin/bash /bin/sh && tail -f /dev/null"',
          caps: ['NET_ADMIN']
        },
        {
          name: `${prefix}-g1`,
          image: 'alpine:3.20',
          hostname: 'g1',
          cmd: 'sh -c "apk add --no-cache bash curl iputils bind-tools util-linux coreutils && ln -sf /bin/bash /bin/sh && tail -f /dev/null"',
          caps: []
        },
        {
          name: `${prefix}-g2`,
          image: 'alpine:3.20',
          hostname: 'g2',
          cmd: 'sh -c "apk add --no-cache bash curl iputils bind-tools util-linux coreutils && ln -sf /bin/bash /bin/sh && tail -f /dev/null"',
          caps: []
        },
        {
          name: `${prefix}-g3`,
          image: 'alpine:3.20',
          hostname: 'g3',
          cmd: 'sh -c "apk add --no-cache bash curl iputils bind-tools util-linux coreutils && ln -sf /bin/bash /bin/sh && tail -f /dev/null"',
          caps: []
        },
        {
          name: `${prefix}-g4`,
          image: 'alpine:3.20',
          hostname: 'g4',
          cmd: 'sh -c "apk add --no-cache bash curl iputils bind-tools util-linux coreutils && ln -sf /bin/bash /bin/sh && tail -f /dev/null"',
          caps: [],
          highDisk: true,  // Mark for disk usage simulation
          tmpfs: '/mnt/limited:rw,size=50m,mode=1777'  // Limited 50MB filesystem (reduced to save disk)
        },
        {
          name: `${prefix}-phoenix`,
          image: 'alpine:3.20',
          hostname: 'gateway-phoenix',
          cmd: 'sh -c "apk add --no-cache bash curl iputils bind-tools util-linux coreutils && ln -sf /bin/bash /bin/sh && tail -f /dev/null"',
          caps: []
        },
        {
          name: `${prefix}-leaf01`,
          image: 'alpine:3.20',
          hostname: 'leaf01',
          cmd: 'sh -c "apk add --no-cache bash curl iputils bind-tools iproute2 util-linux coreutils && ip addr add 192.168.178.10/24 dev eth0 && ln -sf /bin/bash /bin/sh && tail -f /dev/null"',
          caps: ['NET_ADMIN'],
          needsRouting: true
        },
        {
          name: `${prefix}-leaf02`,
          image: 'alpine:3.20',
          hostname: 'leaf02',
          cmd: 'sh -c "apk add --no-cache bash curl iputils bind-tools iproute2 util-linux coreutils && ip addr add 10.0.0.20/16 dev eth0 && ln -sf /bin/bash /bin/sh && tail -f /dev/null"',
          caps: ['NET_ADMIN'],
          needsRouting: true
        },
        {
          name: `${prefix}-router`,
          image: 'alpine:3.20',
          hostname: 'router',
          cmd: 'sh -c "apk add --no-cache bash curl iputils bind-tools iproute2 util-linux coreutils && ip addr add 192.168.178.2/24 dev eth0 && ip addr add 10.0.0.2/16 dev eth0 && ln -sf /bin/bash /bin/sh && tail -f /dev/null"',
          caps: ['NET_ADMIN'],
          isRouter: true,
          privileged: true
        },
        // IMPORTANT: upstream must start BEFORE waf-nginx so nginx can resolve the hostname
        {
          name: `${prefix}-upstream`,
          image: 'node:18-alpine',
          hostname: 'upstream',
          cmd: 'sh -c "apk add --no-cache bash && tail -f /dev/null"',
          caps: [],
          needsAppSetup: true
        },
        {
          name: `${prefix}-waf-nginx`,
          image: 'nginx:alpine',
          hostname: 'waf-nginx',
          cmd: '',
          caps: [],
          needsAwsSetup: true, // Install AWS CLI and kubectl
          configFiles: [
            {
              path: '/etc/nginx/conf.d/default.conf',
              content: `server {
    listen 80;
    server_name gt.maswebics.com msy.maswebics.com;
    
    location / {
        proxy_pass http://${prefix}-upstream:80;
        proxy_set_header Host gt.maswebcs.com;
    }
}`
            },
            {
              path: '/root/.aws/config',
              content: `[default]
region = eu-west-1
output = json

[profile us-east-1]
region = us-east-1

[profile eu-west-1]
region = eu-west-1

[profile ap-southeast-1]
region = ap-southeast-1`
            },
            {
              path: '/root/.aws/credentials',
              content: `[default]
aws_access_key_id = AKIA_MOCK_ACCESS_KEY_ID
aws_secret_access_key = mock_secret_access_key_12345678901234567890

[us-east-1]
aws_access_key_id = AKIA_MOCK_US_EAST_1_KEY
aws_secret_access_key = mock_us_east_1_secret_key_1234567890

[eu-west-1]
aws_access_key_id = AKIA_MOCK_EU_WEST_1_KEY
aws_secret_access_key = mock_eu_west_1_secret_key_1234567890

[ap-southeast-1]
aws_access_key_id = AKIA_MOCK_AP_SE_1_KEY
aws_secret_access_key = mock_ap_se_1_secret_key_1234567890`
            }
          ]
        },
        {
          name: `${prefix}-waf-terminal`,
          image: 'alpine:3.20',
          hostname: 'waf-terminal',
          cmd: 'sh -c "apk add --no-cache bash curl docker-cli docker-cli-compose nano vim jq util-linux ncurses ncurses-terminfo-base socat python3 && tail -f /dev/null"',
          caps: [],
          dockerSocket: true,
          hostNetwork: true,
          wafMount: true
        }
      ];

      // Spawn all containers
      for (const config of containerConfigs) {
        console.log(`[SessionManager] Starting container ${config.name}`);
        
        const capsArg = config.caps.length > 0 
          ? config.caps.map(c => `--cap-add=${c}`).join(' ') 
          : '';
        
        const tmpfsArg = config.tmpfs 
          ? `--tmpfs ${config.tmpfs}` 
          : '';
        
        const privilegedArg = config.privileged ? '--privileged' : '';
        
        // Handle host network for waf-terminal (needs access to host ports)
        const networkArg = config.hostNetwork 
          ? '--network host' 
          : `--network ${networkName}`;
        
        // Mount docker socket for containers that need docker CLI access
        const dockerSocketArg = config.dockerSocket 
          ? '-v /var/run/docker.sock:/var/run/docker.sock' 
          : '';
        
        // Mount WAF exam directory for waf-terminal
        const wafMountArg = config.wafMount 
          ? '-v /opt/waf-exam:/opt/waf-exam' 
          : '';
        
        const cmd = `docker run -d --name ${config.name} --hostname ${config.hostname} ${networkArg} ${capsArg} ${tmpfsArg} ${privilegedArg} ${dockerSocketArg} ${wafMountArg} ${config.image} ${config.cmd}`;
        
        try {
          const { stdout } = await execAsync(cmd);
          const containerId = stdout.trim();
          
          containers.push({
            name: config.name,
            id: containerId,
            hostname: config.hostname,
            network: networkName
          });
          
          console.log(`[SessionManager] Started ${config.name}: ${containerId.substring(0, 12)}`);
          
          // Wait for packages to be installed (especially script utility)
          await this.waitForContainerReady(config.name);
          
          // Handle NGINX config files for WAF containers
          if (config.configFiles) {
            for (const file of config.configFiles) {
              console.log(`[SessionManager] Writing config file ${file.path} to ${config.name}`);
              const escapedContent = file.content.replace(/'/g, "'\\''");
              const dir = file.path.substring(0, file.path.lastIndexOf('/'));
              // Create directory first
              await execAsync(`docker exec ${config.name} sh -c 'mkdir -p ${dir}'`);
              // Write file
              await execAsync(`docker exec ${config.name} sh -c 'echo '"'${escapedContent}'"' > ${file.path}'`);
            }
            // Reload NGINX if it's a WAF container
            if (config.name.includes('-waf-nginx')) {
              await execAsync(`docker exec ${config.name} nginx -s reload`);
            }
          }
          
          // Install AWS CLI and kubectl for WAF containers
          if (config.needsAwsSetup && config.name.includes('-waf-nginx')) {
            console.log(`[SessionManager] Installing AWS CLI and kubectl for ${config.name}`);
            try {
              // Install required packages
              await execAsync(`docker exec ${config.name} sh -c 'apk add --no-cache python3 py3-pip curl bash'`);
              
              // Install AWS CLI
              await execAsync(`docker exec ${config.name} sh -c 'pip3 install --no-cache-dir awscli --break-system-packages'`);
              
              // Install kubectl
              await execAsync(`docker exec ${config.name} sh -c 'curl -LO "https://dl.k8s.io/release/v1.28.0/bin/linux/amd64/kubectl" && chmod +x kubectl && mv kubectl /usr/local/bin/'`);
              
              // Create mock kubeconfig
              const kubeconfig = `apiVersion: v1
clusters:
- cluster:
    server: https://mock-eks-cluster.eu-west-1.eks.amazonaws.com
  name: i2-eks-nexus-dev
contexts:
- context:
    cluster: i2-eks-nexus-dev
    user: mock-user
  name: i2-eks-nexus-dev
current-context: i2-eks-nexus-dev
kind: Config
users:
- name: mock-user
  user:
    token: mock-token-12345`;
              
              const escapedKubeconfig = kubeconfig.replace(/'/g, "'\\''");
              await execAsync(`docker exec ${config.name} sh -c 'mkdir -p /root/.kube && echo '"'${escapedKubeconfig}'"' > /root/.kube/config'`);
              
              console.log(`[SessionManager] AWS CLI and kubectl installed successfully in ${config.name}`);
            } catch (err) {
              console.error(`[SessionManager] Failed to install AWS tools in ${config.name}:`, err.message);
            }
          }
          
          // Handle Node.js app setup for upstream container
          if (config.needsAppSetup && config.name.includes('-upstream')) {
            console.log(`[SessionManager] Setting up Node.js app for ${config.name}`);
            // Create app directory and server.js
            await execAsync(`docker exec ${config.name} sh -c 'mkdir -p /app'`);
            const serverJs = `
const express = require('express');
const app = express();

const validHosts = ['gt.maswebics.com', 'msy.maswebics.com'];

app.use((req, res) => {
  const host = req.headers.host || '';
  
  if (!validHosts.includes(host)) {
    return res.status(404).send('DEPLOYMENT_NOT_FOUND');
  }
  
  const region = host.includes('gt.') ? 'Guatemala' : 'Malaysia';
  res.send(\`<html><body><h1>Welcome to BMI Iguaias Médicas - Healthcare Portal</h1><p>Region: \${region}</p></body></html>\`);
});

app.listen(80, () => console.log('Upstream server running on port 80'));
`;
            const escapedServer = serverJs.replace(/'/g, "'\\''").replace(/`/g, '\\`').replace(/\$/g, '\\$');
            await execAsync(`docker exec ${config.name} sh -c 'echo '"'${escapedServer}'"' > /app/server.js'`);
            // Install express
            await execAsync(`docker exec ${config.name} sh -c 'cd /app && npm init -y && npm install express'`);
            // Start the Node.js server in background
            await execAsync(`docker exec -d ${config.name} sh -c 'cd /app && node server.js'`);
            console.log(`[SessionManager] ✓ Upstream app configured and started for ${config.name}`);
          }
          
          // Apply performance degradation to Osaka branch to simulate slowdown
          if (config.name.includes('-osaka')) {
            await this.applyNetworkDelay(config.name);
          }
          
          // Simulate high disk usage on g4 gateway (85% full /var/log) - Task 3 requirement
          if (config.highDisk) {
            console.log(`[SessionManager] ⚠️  Setting up Task 3 - g4 with high disk usage (85% full)`);
            await this.simulateHighDiskUsage(config.name);
            console.log(`[SessionManager] ✓ Task 3 ready - g4 disk simulation complete`);
          }
          
          // Simulate normal/low disk usage on g1, g2, g3 gateways (15-25% usage)
          if (config.name.includes('-g1') || config.name.includes('-g2') || config.name.includes('-g3')) {
            await this.simulateNormalDiskUsage(config.name);
          }
          
          // Task 5: Remove default routes from leaf containers (candidate must add them)
          if (config.needsRouting) {
            console.log(`[SessionManager] Removing default route from ${config.name} (Task 5 requirement)`);
            await execAsync(`docker exec ${config.name} ip route del default 2>/dev/null || true`);
            console.log(`[SessionManager] ✓ ${config.name} - default route removed (network should be unreachable)`);
          }
          
          // Task 5: Disable IP forwarding on router (candidate must enable it)
          if (config.isRouter) {
            console.log(`[SessionManager] Disabling IP forwarding on ${config.name} (Task 5 requirement)`);
            await execAsync(`docker exec ${config.name} sh -c "echo 0 > /proc/sys/net/ipv4/ip_forward"`);
            console.log(`[SessionManager] ✓ ${config.name} - IP forwarding disabled (routing will not work)`);
          }
        } catch (error) {
          console.error(`[SessionManager] Failed to start ${config.name}:`, error.message);
          // Continue with other containers
        }
      }

      return containers;
    } catch (error) {
      console.error(`[SessionManager] Failed to spawn containers for session ${sessionId}:`, error);
      // Cleanup on failure
      await this.cleanupSessionContainers(sessionId);
      throw error;
    }
  }

  /**
   * Wait for container to be fully ready (packages installed)
   */
  async waitForContainerReady(containerName, maxRetries = 30) {
    console.log(`[SessionManager] Waiting for ${containerName} to be ready...`);
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Check if script command exists
        await execAsync(`docker exec ${containerName} which script 2>/dev/null`);
        console.log(`[SessionManager] ${containerName} is ready!`);
        return true;
      } catch (error) {
        // Not ready yet, wait 1 second
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.warn(`[SessionManager] ${containerName} may not be fully ready after ${maxRetries} seconds`);
    return false;
  }

  /**
   * Apply performance degradation to simulate branch slowdown
   * Uses CPU stress + network delay to make Osaka branch 10x slower
   */
  async applyNetworkDelay(containerName) {
    try {
      console.log(`[SessionManager] Applying performance degradation to ${containerName}...`);
      
      // Add CPU stress to simulate slow/overloaded branch
      // This creates noticeable lag when running commands
      // stress-ng: 2 CPU workers at 80% load with network I/O stress
      await execAsync(`docker exec -d ${containerName} stress-ng --cpu 2 --cpu-load 80 --io 1 --timeout 0`);
      
      // Add network latency using tc (traffic control)
      // Add 500ms delay to all outgoing packets (makes ping/curl 10x slower)
      await execAsync(`docker exec ${containerName} tc qdisc add dev eth0 root netem delay 500ms`);
      
      // Add warning message to MOTD
      await execAsync(`docker exec ${containerName} sh -c "echo '⚠️  WARNING: This branch is experiencing high latency and slow response times' > /etc/motd"`);
      
      console.log(`[SessionManager] Performance degradation applied to ${containerName} (CPU stress + 500ms network delay active)`);
    } catch (error) {
      console.error(`[SessionManager] Failed to apply performance degradation to ${containerName}:`, error.message);
      // Don't throw - container is still usable even without degradation
    }
  }

  /**
   * Simulate high disk usage on g4 gateway for Task 3 (85% full on /var/log)
   * Creates crash dumps in /var/log/crash and bulk FTP data in $DLPDIR/ftp
   * Candidates must clean these up following the playbook to resolve the disk issue
   */
  async simulateHighDiskUsage(containerName) {
    try {
      console.log(`[SessionManager] Simulating high disk usage on ${containerName}...`);
      
      // Create directories on the limited tmpfs filesystem (50MB at /mnt/limited - reduced to save disk)
      await execAsync(`docker exec ${containerName} mkdir -p /mnt/limited/log/crash`);
      await execAsync(`docker exec ${containerName} mkdir -p /mnt/limited/dlp/ftp/0000`);
      await execAsync(`docker exec ${containerName} mkdir -p /mnt/limited/dlp/ftp/0001`);
      await execAsync(`docker exec ${containerName} mkdir -p /mnt/limited/dlp/ftp/1000`);
      await execAsync(`docker exec ${containerName} mkdir -p /mnt/limited/dlp/ftp/1001`);
      await execAsync(`docker exec ${containerName} mkdir -p /mnt/limited/dlp/ftp/3000`);
      
      // Create crash dumps (10MB total - reduced)
      await execAsync(`docker exec ${containerName} dd if=/dev/zero of=/mnt/limited/log/crash/crash_dump_001.dmp bs=1M count=5 2>/dev/null`);
      await execAsync(`docker exec ${containerName} dd if=/dev/zero of=/mnt/limited/log/crash/crash_dump_002.dmp bs=1M count=5 2>/dev/null`);
      
      // Create FTP data (30MB - 5 folders × 6MB each - reduced)
      await execAsync(`docker exec ${containerName} dd if=/dev/zero of=/mnt/limited/dlp/ftp/0000/data.bin bs=1M count=6 2>/dev/null`);
      await execAsync(`docker exec ${containerName} dd if=/dev/zero of=/mnt/limited/dlp/ftp/0001/data.bin bs=1M count=6 2>/dev/null`);
      await execAsync(`docker exec ${containerName} dd if=/dev/zero of=/mnt/limited/dlp/ftp/1000/data.bin bs=1M count=6 2>/dev/null`);
      await execAsync(`docker exec ${containerName} dd if=/dev/zero of=/mnt/limited/dlp/ftp/1001/data.bin bs=1M count=6 2>/dev/null`);
      await execAsync(`docker exec ${containerName} dd if=/dev/zero of=/mnt/limited/dlp/ftp/3000/data.bin bs=1M count=6 2>/dev/null`);
      
      // Symlink /var/log and /opt/dlp to limited partition
      await execAsync(`docker exec ${containerName} sh -c "rm -rf /var/log && ln -s /mnt/limited/log /var/log"`);
      await execAsync(`docker exec ${containerName} sh -c "mkdir -p /opt && rm -rf /opt/dlp && ln -s /mnt/limited/dlp /opt/dlp"`);
      
      // Set DLPDIR environment variable
      await execAsync(`docker exec ${containerName} sh -c "echo 'export DLPDIR=/opt/dlp' >> /etc/profile"`);
      
      // Verify disk usage
      const { stdout } = await execAsync(`docker exec ${containerName} df -h /mnt/limited`);
      console.log(`[SessionManager] ${containerName} limited filesystem:\n${stdout}`);
      
      console.log(`[SessionManager] ✓ High disk usage simulated on ${containerName} (40MB on 50MB tmpfs = 80% - check /mnt/limited)`);
    } catch (error) {
      console.error(`[SessionManager] Failed to simulate disk usage on ${containerName}:`, error.message);
    }
  }

  /**
   * Simulate normal/low disk usage on healthy gateways (15-25% usage)
   * Creates small log files to show contrast with g4's high usage
   */
  async simulateNormalDiskUsage(containerName) {
    try {
      console.log(`[SessionManager] Simulating normal disk usage on ${containerName}...`);
      
      // Create normal /var/log with small log files (3MB total - reduced)
      await execAsync(`docker exec ${containerName} sh -c "mkdir -p /var/log && dd if=/dev/zero of=/var/log/syslog bs=1M count=1 2>/dev/null && dd if=/dev/zero of=/var/log/messages bs=1M count=1 2>/dev/null && dd if=/dev/zero of=/var/log/auth.log bs=1M count=1 2>/dev/null"`);
      
      // Create normal DLP directories with minimal data (2MB total - reduced)
      await execAsync(`docker exec ${containerName} sh -c "mkdir -p /opt/dlp/ftp/{0000,0001} && for dir in /opt/dlp/ftp/*; do dd if=/dev/zero of=\\$dir/data.bin bs=1M count=1 2>/dev/null; done"`);
      
      // Set DLPDIR environment variable
      await execAsync(`docker exec ${containerName} sh -c "echo 'export DLPDIR=/opt/dlp' >> /etc/profile"`);
      
      console.log(`[SessionManager] Normal disk usage simulated on ${containerName} (5MB total)`);
    } catch (error) {
      console.error(`[SessionManager] Failed to simulate normal disk usage on ${containerName}:`, error.message);
    }
  }

  /**
   * Reset WAF exam to broken state for Task 4
   * Uses docker to access host paths and run compose
   */
  async resetWafExam() {
    try {
      console.log('[SessionManager] Resetting WAF exam to broken state for Task 4...');
      
      // Check if broken config exists using alpine with host volume mount
      try {
        await execAsync(`docker run --rm -v /opt/waf-exam:/waf alpine test -f /waf/docker-compose.yml.broken`);
        console.log('[SessionManager] Found broken WAF config file');
      } catch (e) {
        console.error('[SessionManager] Broken WAF config not found at /opt/waf-exam/docker-compose.yml.broken');
        return;
      }
      
      // Copy broken config to active config
      await execAsync(`docker run --rm -v /opt/waf-exam:/waf alpine cp /waf/docker-compose.yml.broken /waf/docker-compose.yml`);
      console.log('[SessionManager] Copied broken WAF config');
      
      // Stop and remove existing WAF containers
      await execAsync(`docker stop waf backend 2>/dev/null || true`);
      await execAsync(`docker rm waf backend 2>/dev/null || true`);
      
      // Start WAF containers using docker:cli image with compose
      await execAsync(`docker run --rm -v /opt/waf-exam:/waf -v /var/run/docker.sock:/var/run/docker.sock -w /waf docker:cli sh -c "docker compose up -d"`);
      
      console.log('[SessionManager] ✓ WAF exam reset to broken state (Task 4 ready)');
    } catch (error) {
      console.error('[SessionManager] Failed to reset WAF exam:', error.message);
      // Don't throw - WAF exam is optional
    }
  }

  /**
   * Get container name for a specific terminal in a session
   */
  getContainerName(sessionId, terminalId) {
    const prefix = `exam-${sessionId.substring(0, 8)}`;
    
    // Map terminal IDs to container names
    const terminalMap = {
      // Direct container names (task2-task4)
      'tokyo': `${prefix}-tokyo`,
      'osaka': `${prefix}-osaka`,
      'kyoto': `${prefix}-kyoto`,
      'g1': `${prefix}-g1`,
      'g2': `${prefix}-g2`,
      'g3': `${prefix}-g3`,
      'g4': `${prefix}-g4`,
      'phoenix': `${prefix}-phoenix`,
      'gateway-phoenix': `${prefix}-phoenix`,
      
      // Branch terminals (task1 - casestudy.html)
      'branch-tokyo': `${prefix}-tokyo`,
      'branch-osaka': `${prefix}-osaka`,
      'branch-kyoto': `${prefix}-kyoto`,
      
      // Routing terminals (task5 - routing-task5.html)
      'leaf01': `${prefix}-leaf01`,
      'leaf02': `${prefix}-leaf02`,
      'router': `${prefix}-router`,
      'nbr-leaf01': `${prefix}-leaf01`,
      'nbr-leaf02': `${prefix}-leaf02`,
      'nbr-router': `${prefix}-router`,
      
      // WAF terminals (task4 - waf-troubleshooting.html)
      'waf-nginx': `${prefix}-waf-nginx`,
      'upstream': `${prefix}-upstream`,
      'waf-terminal': `${prefix}-waf-terminal`,
      
      // Note: Fallback to shared containers if session-specific ones don't exist
    };

    return terminalMap[terminalId] || terminalId; // Return as-is if not mapped (allows shared containers)
  }

  /**
   * Check if session is active
   * Supports both full session IDs and 8-character prefixes
   */
  isSessionActive(sessionId) {
    // Direct match
    if (this.activeSessions.has(sessionId)) {
      return true;
    }
    
    // Try matching by prefix (first 8 chars) for recovered sessions
    const prefix = sessionId.substring(0, 8);
    for (const [activeSessionId] of this.activeSessions) {
      if (activeSessionId.startsWith(prefix)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get session info
   * Supports both full session IDs and 8-character prefixes
   */
  getSession(sessionId) {
    // Direct match
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId);
    }
    
    // Try matching by prefix (first 8 chars) for recovered sessions
    const prefix = sessionId.substring(0, 8);
    for (const [activeSessionId, sessionData] of this.activeSessions) {
      if (activeSessionId.startsWith(prefix)) {
        return sessionData;
      }
    }
    
    return null;
  }

  /**
   * Get all active sessions
   */
  getAllSessions() {
    return Array.from(this.activeSessions.entries()).map(([sessionId, data]) => ({
      sessionId,
      ...data
    }));
  }

  /**
   * Save terminal history for a session
   */
  async saveTerminalHistory(sessionId, terminalId, history) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.warn(`[SessionManager] Cannot save terminal history: session ${sessionId} not found`);
      return;
    }

    try {
      const historyFile = path.join(session.stateDir, 'terminal-logs', `${terminalId}.json`);
      fs.writeFileSync(historyFile, JSON.stringify({
        terminalId,
        savedAt: new Date().toISOString(),
        history
      }, null, 2));
      
      console.log(`[SessionManager] Saved terminal history for ${terminalId} in session ${sessionId}`);
    } catch (error) {
      console.error(`[SessionManager] Failed to save terminal history:`, error);
    }
  }

  /**
   * Snapshot session state when candidate finishes
   */
  async snapshotSession(sessionId) {
    console.log(`[SessionManager] Creating snapshot for session ${sessionId}`);
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.warn(`[SessionManager] Cannot snapshot: session ${sessionId} not found`);
      return { success: false, error: 'Session not found' };
    }

    try {
      const snapshotDir = path.join(session.stateDir, 'docker-snapshots');
      
      // Export each container's filesystem state
      for (const container of session.containers) {
        console.log(`[SessionManager] Exporting container ${container.name}`);
        
        try {
          // Export container filesystem
          const exportPath = path.join(snapshotDir, `${container.name}.tar`);
          await execAsync(`docker export ${container.name} > "${exportPath}"`);
          
          // Save container logs
          const logsPath = path.join(snapshotDir, `${container.name}.log`);
          const { stdout: logs } = await execAsync(`docker logs ${container.name} 2>&1 || true`);
          fs.writeFileSync(logsPath, logs);
          
          console.log(`[SessionManager] Exported ${container.name}`);
        } catch (error) {
          console.error(`[SessionManager] Failed to export ${container.name}:`, error.message);
        }
      }

      // Update metadata
      const metadataPath = path.join(session.stateDir, 'metadata.json');
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      metadata.status = 'completed';
      metadata.completedAt = new Date().toISOString();
      metadata.snapshotCreated = true;
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      console.log(`[SessionManager] Snapshot complete for session ${sessionId}`);
      
      return { success: true, snapshotDir };
    } catch (error) {
      console.error(`[SessionManager] Failed to snapshot session ${sessionId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cleanup ALL sessions - used when starting a new candidate in single-candidate mode
   * Removes all exam containers and clears all active sessions
   */
  async cleanupAllSessions() {
    console.log(`[SessionManager] Cleaning up ALL sessions for single-candidate mode...`);
    
    try {
      // Get all running exam containers
      const { stdout } = await execAsync('docker ps -a --filter "name=exam-" --format "{{.Names}}" || true');
      const containerNames = stdout.trim().split('\n').filter(Boolean);
      
      if (containerNames.length > 0) {
        console.log(`[SessionManager] Removing ${containerNames.length} exam containers...`);
        
        // Stop and remove all containers in parallel
        const stopPromises = containerNames.map(name => 
          execAsync(`docker rm -f ${name}`).catch(err => 
            console.error(`Failed to remove ${name}:`, err.message)
          )
        );
        await Promise.all(stopPromises);
        
        console.log(`[SessionManager] All exam containers removed`);
      }
      
      // Remove all exam networks
      const { stdout: networks } = await execAsync('docker network ls --filter "name=exam-" --format "{{.Name}}" || true');
      const networkNames = networks.trim().split('\n').filter(Boolean);
      
      if (networkNames.length > 0) {
        console.log(`[SessionManager] Removing ${networkNames.length} exam networks...`);
        const netPromises = networkNames.map(name =>
          execAsync(`docker network rm ${name}`).catch(err =>
            console.error(`Failed to remove network ${name}:`, err.message)
          )
        );
        await Promise.all(netPromises);
      }
      
      // Clear all active sessions from memory
      this.activeSessions.clear();
      console.log(`[SessionManager] All sessions cleared`);
      
      return { success: true, containersRemoved: containerNames.length, networksRemoved: networkNames.length };
    } catch (error) {
      console.error(`[SessionManager] Failed to cleanup all sessions:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cleanup session - stop and remove containers
   * @param {string} sessionId 
   * @param {boolean} preserveState - If true, keep state directory for admin review
   */
  async cleanupSession(sessionId, preserveState = true) {
    console.log(`[SessionManager] Cleaning up session ${sessionId} (preserve: ${preserveState})`);
    
    const session = this.activeSessions.get(sessionId);
    
    try {
      // Stop and remove containers
      await this.cleanupSessionContainers(sessionId);
      
      // Remove from active sessions
      this.activeSessions.delete(sessionId);
      
      // Optionally remove state directory
      if (!preserveState && session) {
        try {
          fs.rmSync(session.stateDir, { recursive: true, force: true });
          console.log(`[SessionManager] Removed state directory for session ${sessionId}`);
        } catch (error) {
          console.error(`[SessionManager] Failed to remove state directory:`, error.message);
        }
      }
      
      console.log(`[SessionManager] Cleanup complete for session ${sessionId}`);
      return { success: true };
    } catch (error) {
      console.error(`[SessionManager] Failed to cleanup session ${sessionId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cleanup Docker containers and network for a session
   */
  async cleanupSessionContainers(sessionId) {
    const prefix = `exam-${sessionId.substring(0, 8)}`;
    const networkName = `${prefix}-net`;
    
    try {
      // Stop and remove all containers with this prefix
      const { stdout } = await execAsync(`docker ps -a --filter "name=${prefix}" --format "{{.Names}}" || true`);
      const containerNames = stdout.trim().split('\n').filter(Boolean);
      
      for (const name of containerNames) {
        try {
          console.log(`[SessionManager] Removing container ${name}`);
          await execAsync(`docker rm -f ${name} 2>/dev/null || true`);
        } catch (error) {
          console.error(`[SessionManager] Failed to remove ${name}:`, error.message);
        }
      }
      
      // Remove network
      try {
        await execAsync(`docker network rm ${networkName} 2>/dev/null || true`);
        console.log(`[SessionManager] Removed network ${networkName}`);
      } catch (error) {
        // Network might not exist or still in use
      }
    } catch (error) {
      console.error(`[SessionManager] Failed to cleanup containers:`, error);
    }
  }

  /**
   * List all saved sessions (for admin panel)
   */
  async listAllSessions() {
    try {
      const sessions = [];
      const dirs = fs.readdirSync(this.STATE_ROOT);
      
      for (const sessionId of dirs) {
        const metadataPath = path.join(this.STATE_ROOT, sessionId, 'metadata.json');
        
        if (fs.existsSync(metadataPath)) {
          try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            const isActive = this.activeSessions.has(sessionId);
            
            sessions.push({
              ...metadata,
              isActive,
              stateDir: path.join(this.STATE_ROOT, sessionId)
            });
          } catch (error) {
            console.error(`[SessionManager] Failed to read metadata for ${sessionId}:`, error.message);
          }
        }
      }
      
      return sessions.sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
      );
    } catch (error) {
      console.error('[SessionManager] Failed to list sessions:', error);
      return [];
    }
  }

  /**
   * Get session details for admin review
   */
  async getSessionDetails(sessionId) {
    const stateDir = path.join(this.STATE_ROOT, sessionId);
    
    if (!fs.existsSync(stateDir)) {
      return null;
    }

    try {
      const metadataPath = path.join(stateDir, 'metadata.json');
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      
      // Load terminal logs
      const terminalLogsDir = path.join(stateDir, 'terminal-logs');
      const terminalLogs = {};
      
      if (fs.existsSync(terminalLogsDir)) {
        const logFiles = fs.readdirSync(terminalLogsDir);
        for (const file of logFiles) {
          if (file.endsWith('.json')) {
            const terminalId = file.replace('.json', '');
            terminalLogs[terminalId] = JSON.parse(
              fs.readFileSync(path.join(terminalLogsDir, file), 'utf8')
            );
          }
        }
      }
      
      // Load answers
      const answersDir = path.join(stateDir, 'answers');
      const answers = {};
      
      if (fs.existsSync(answersDir)) {
        const answerFiles = fs.readdirSync(answersDir);
        for (const file of answerFiles) {
          if (file.endsWith('.json')) {
            const taskId = file.replace('.json', '');
            answers[taskId] = JSON.parse(
              fs.readFileSync(path.join(answersDir, file), 'utf8')
            );
          }
        }
      }
      
      return {
        metadata,
        terminalLogs,
        answers,
        isActive: this.activeSessions.has(sessionId)
      };
    } catch (error) {
      console.error(`[SessionManager] Failed to get session details for ${sessionId}:`, error);
      return null;
    }
  }
}

module.exports = SessionManager;
