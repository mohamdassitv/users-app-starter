# 🚀 Quick Deployment Guide - New EC2 Instance

## Instance Details
```
Instance ID:  i-0fc5a91af937f1212
Name:         ExamForNewCandidates
Public IP:    34.244.246.180
Public DNS:   ec2-34-244-246-180.eu-west-1.compute.amazonaws.com
Region:       eu-west-1 (Ireland)
OS:           Ubuntu
SSH Key:      ExamForNewCandidates.pem
```

## 🎯 One-Command Deployment (Windows)

```powershell
.\deploy-new-ec2.ps1
```

This script will:
1. ✅ Set correct PEM file permissions
2. ✅ Upload all application files
3. ✅ Install Docker on EC2
4. ✅ Build and start the container
5. ✅ Configure everything automatically

## 📝 Manual Deployment Steps

### Step 1: Prepare SSH Key (Windows)
```powershell
icacls ExamForNewCandidates.pem /inheritance:r
icacls ExamForNewCandidates.pem /grant:r "$($env:USERNAME):(R)"
```

### Step 2: Upload Files
```powershell
# Upload lab directory
scp -i ExamForNewCandidates.pem -r lab ubuntu@34.244.246.180:~/app/

# Upload Dockerfile
scp -i ExamForNewCandidates.pem Dockerfile ubuntu@34.244.246.180:~/app/

# Upload deployment script
scp -i ExamForNewCandidates.pem deploy-current-instance.sh ubuntu@34.244.246.180:~/
```

### Step 3: Connect and Deploy
```powershell
# Connect to EC2
ssh -i ExamForNewCandidates.pem ubuntu@34.244.246.180

# Run deployment (on EC2)
chmod +x ~/deploy-current-instance.sh
./deploy-current-instance.sh
```

## ✅ Verify Deployment

### From Your Computer
```powershell
# Test if application is running
curl http://34.244.246.180:8081
```

### From EC2 Instance
```bash
# Check container status
docker ps | grep users-app

# View logs
docker logs users-app

# Follow logs
docker logs -f users-app
```

## 🔗 Access URLs

After deployment, access at:
- **Main App:** http://34.244.246.180:8081
- **Tasks Page:** http://34.244.246.180:8081/tasks.html
- **WAF Task:** http://34.244.246.180:8081/task/waf-troubleshooting.html
- **Admin:** http://34.244.246.180:8081/admin.html
- **Manager:** http://34.244.246.180:8081/manager.html

## 🛡️ Security Group Settings

**Required Inbound Rules:**
| Type | Port | Source | Description |
|------|------|--------|-------------|
| SSH | 22 | Your IP | SSH access |
| Custom TCP | 8081 | 0.0.0.0/0 | Application |

To configure:
1. AWS Console → EC2 → Instances
2. Select i-0fc5a91af937f1212
3. Security tab → Security group link
4. Edit inbound rules → Add rules

## 🔧 Useful Commands

### Container Management
```bash
docker logs users-app              # View logs
docker logs -f users-app           # Follow logs
docker restart users-app           # Restart
docker exec -it users-app sh       # Shell access
docker stats users-app             # Resource usage
```

### Update Code
```powershell
# From your computer - upload updated file
scp -i ExamForNewCandidates.pem lab/src/server.js ubuntu@34.244.246.180:~/

# On EC2 - update and restart
docker cp ~/server.js users-app:/app/lab/src/server.js
docker restart users-app
```

### Check Status
```bash
docker ps                          # Running containers
docker ps -a                       # All containers
docker network ls                  # Networks
docker ps | grep exam-            # Active exam sessions
```

## ⚠️ Troubleshooting

### Application Not Accessible
```bash
# 1. Check if container is running
docker ps | grep users-app

# 2. Check logs for errors
docker logs users-app | grep -i error

# 3. Test from inside EC2
curl http://localhost:8081

# 4. Check if port is listening
docker exec users-app netstat -tulpn | grep 8081

# 5. Verify security group allows port 8081
```

### Terminal Not Working
```bash
# Check Docker socket mount
docker inspect users-app | grep -A 5 Mounts

# Verify privileged mode
docker inspect users-app | grep Privileged

# Check terminal logs
docker logs users-app | grep -i terminal
```

### Container Won't Start
```bash
# View full logs
docker logs users-app

# Check if port is already in use
sudo netstat -tulpn | grep 8081

# Rebuild and restart
cd ~/app
docker build -t users-app .
docker rm -f users-app
docker run -d --name users-app -p 8081:8081 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --privileged users-app
```

## 📊 What Changed from Old Instance

| Component | Old Value | New Value |
|-----------|-----------|-----------|
| Instance ID | i-07956dd65db5a171a | i-0fc5a91af937f1212 |
| Public IP | 108.128.139.193 | 34.244.246.180 |
| SSH Key | candidatessss.pem | ExamForNewCandidates.pem |

All configuration files have been updated automatically! ✅

## 📚 Additional Resources

- Full guide: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- WAF Lab: [lab/waf-lab/README.md](lab/waf-lab/README.md)
- Testing: [TESTING_GUIDE.md](TESTING_GUIDE.md)

## 🆘 Getting Help

If deployment fails:
1. Check container logs: `docker logs users-app`
2. Verify security group settings in AWS Console
3. Ensure PEM file permissions are correct
4. Check if Docker socket is mounted properly
5. Confirm port 8081 is not in use

---

**Last Updated:** January 18, 2026  
**Instance:** i-0fc5a91af937f1212 (ExamForNewCandidates)
