# EC2 Deployment Guide

## Instance Information
- **Instance ID:** i-0fc5a91af937f1212
- **Name:** ExamForNewCandidates
- **Public IP:** 34.244.246.180
- **Public DNS:** ec2-34-244-246-180.eu-west-1.compute.amazonaws.com
- **Region:** eu-west-1 (Ireland)
- **OS:** Ubuntu
- **SSH Key:** ExamForNewCandidates.pem

## Quick Deployment Steps

### Step 1: Prepare SSH Key
```powershell
# On Windows PowerShell (run from your project directory)
icacls ExamForNewCandidates.pem /inheritance:r
icacls ExamForNewCandidates.pem /grant:r "$($env:USERNAME):(R)"
```

### Step 2: Upload Application Files
```powershell
# Upload the lab directory
scp -i ExamForNewCandidates.pem -r lab ubuntu@34.244.246.180:~/app/

# Upload Dockerfile
scp -i ExamForNewCandidates.pem Dockerfile ubuntu@34.244.246.180:~/app/

# Upload deployment script
scp -i ExamForNewCandidates.pem deploy-current-instance.sh ubuntu@34.244.246.180:~/
```

### Step 3: Connect to EC2
```powershell
ssh -i ExamForNewCandidates.pem ubuntu@34.244.246.180
```

### Step 4: Run Deployment Script
```bash
# Make script executable
chmod +x ~/deploy-current-instance.sh

# Run deployment
./deploy-current-instance.sh
```

## Manual Deployment (Alternative)

If you prefer manual deployment or the script fails:

### 1. Install Docker
```bash
# Update system
sudo apt-get update -y

# Install Docker
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io
sudo usermod -aG docker ubuntu

# Logout and login again, or run:
newgrp docker
```

### 2. Build and Run Container
```bash
cd ~/app

# Build image
docker build -t users-app .

# Create state directory
mkdir -p ~/app/lab/state

# Stop any existing container
docker stop users-app 2>/dev/null || true
docker rm users-app 2>/dev/null || true

# Run container
docker run -d \
  --name users-app \
  -p 8081:8081 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ~/app/lab/state:/app/lab/state \
  --privileged \
  --restart unless-stopped \
  users-app

# Check logs
docker logs -f users-app
```

## Verify Deployment

### Check Container Status
```bash
docker ps | grep users-app
```

### Test Application
```bash
# From EC2 instance
curl http://localhost:8081

# From your computer
curl http://34.244.246.180:8081
```

### View Logs
```bash
# Last 100 lines
docker logs --tail=100 users-app

# Follow logs in real-time
docker logs -f users-app

# Check for errors
docker logs users-app 2>&1 | grep -i error
```

## Security Group Configuration

Make sure your EC2 security group allows:

| Type | Protocol | Port | Source |
|------|----------|------|--------|
| SSH | TCP | 22 | Your IP |
| Custom TCP | TCP | 8081 | 0.0.0.0/0 |

To configure:
1. Go to EC2 Console → Instances
2. Select instance i-0fc5a91af937f1212
3. Click "Security" tab
4. Click the security group link
5. Edit inbound rules → Add rules above

## Application URLs

After deployment, access your application at:
- http://34.244.246.180:8081
- http://ec2-34-244-246-180.eu-west-1.compute.amazonaws.com:8081

### Available Pages
- Main page: `/`
- Tasks: `/tasks.html`
- WAF Troubleshooting: `/task/waf-troubleshooting.html`
- Admin: `/admin.html`
- Manager: `/manager.html`

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker logs users-app

# Check if port is in use
sudo netstat -tulpn | grep 8081

# Check Docker socket
ls -la /var/run/docker.sock
```

### Terminal Not Working
```bash
# Verify Docker socket is mounted
docker inspect users-app | grep -A 5 Mounts

# Check container privileges
docker inspect users-app | grep Privileged
```

### Application Not Accessible
```bash
# Check if container is running
docker ps

# Check if process is listening
docker exec users-app netstat -tulpn | grep 8081

# Check security group settings in AWS Console
```

### Update Application Code
```powershell
# From your local machine
scp -i ExamForNewCandidates.pem lab/src/server.js ubuntu@34.244.246.180:~/

# On EC2
docker cp ~/server.js users-app:/app/lab/src/server.js
docker restart users-app
```

## Useful Commands

### Container Management
```bash
# View running containers
docker ps

# View all containers
docker ps -a

# Stop container
docker stop users-app

# Start container
docker start users-app

# Restart container
docker restart users-app

# Remove container
docker rm -f users-app

# Shell access
docker exec -it users-app sh
```

### Monitoring
```bash
# View resource usage
docker stats users-app

# View container details
docker inspect users-app

# List Docker networks
docker network ls

# List active exam sessions
docker ps | grep exam-
```

### Maintenance
```bash
# Clean up stopped containers
docker container prune

# Clean up unused images
docker image prune

# Clean up everything (careful!)
docker system prune -a
```

## Backup and Restore

### Backup State
```bash
# Backup exam state
tar -czf state-backup-$(date +%Y%m%d).tar.gz ~/app/lab/state

# Download to local machine (from your computer)
scp -i ExamForNewCandidates.pem ubuntu@34.244.246.180:~/state-backup-*.tar.gz .
```

### Restore State
```bash
# Upload from local machine (from your computer)
scp -i ExamForNewCandidates.pem state-backup-*.tar.gz ubuntu@34.244.246.180:~/

# Extract on EC2
tar -xzf state-backup-*.tar.gz -C ~/app/lab/state
docker restart users-app
```

## Performance Optimization

### Check Logs Size
```bash
# View log sizes
docker ps -q | xargs docker inspect --format='{{.Name}} {{.LogPath}}' | xargs -I {} sh -c 'echo {} $(du -sh $(echo {} | awk "{print \$2}"))'

# Clear logs if too large
truncate -s 0 $(docker inspect --format='{{.LogPath}}' users-app)
```

### Monitor Resources
```bash
# Check disk space
df -h

# Check memory usage
free -h

# Check Docker disk usage
docker system df
```

## Support

For issues or questions:
1. Check container logs: `docker logs users-app`
2. Verify security group settings in AWS Console
3. Ensure Docker socket is properly mounted
4. Confirm application is listening on port 8081
