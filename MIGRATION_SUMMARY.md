# EC2 Instance Migration Summary

## Overview
Successfully migrated from deleted EC2 instance to new instance with updated configuration.

## Instance Details

### Old Instance (DELETED)
- **Instance ID:** i-07956dd65db5a171a
- **Public IP:** 108.128.139.193
- **SSH Key:** candidatessss.pem
- **Status:** Accidentally deleted ❌

### New Instance (ACTIVE)
- **Instance ID:** i-0fc5a91af937f1212
- **Name:** ExamForNewCandidates
- **Public IP:** 34.244.246.180
- **Public DNS:** ec2-34-244-246-180.eu-west-1.compute.amazonaws.com
- **Region:** eu-west-1 (Ireland)
- **OS:** Ubuntu
- **SSH Key:** ExamForNewCandidates.pem
- **Status:** Ready for deployment ✅

## Files Updated

### Configuration Files
1. ✅ **deploy-task7-to-ec2.ps1**
   - Updated EC2_IP: 108.128.139.193 → 34.244.246.180
   - Updated PEM_FILE: candidatessss.pem → ExamForNewCandidates.pem
   - Updated EC2_USER: ec2-user → ubuntu

2. ✅ **deploy-task7-to-ec2.sh**
   - Updated EC2_IP: 108.128.139.193 → 34.244.246.180
   - Updated PEM_FILE: candidatessss.pem → ExamForNewCandidates.pem
   - Updated EC2_USER: ec2-user → ubuntu

3. ✅ **EC2-UPDATE-COMMANDS.txt**
   - Updated instance ID: i-07956dd65db5a171a → i-0fc5a91af937f1212
   - Updated IP: 108.128.139.193 → 34.244.246.180

4. ✅ **update-task7-server.bat**
   - Updated IP: 108.128.139.193 → 34.244.246.180
   - Updated PEM file: candidatessss.pem → ExamForNewCandidates.pem

5. ✅ **lab/waf-lab/README.md**
   - Updated all IP references: 108.128.139.193 → 34.244.246.180
   - Updated task URLs
   - Updated deployment commands

### New Files Created
1. ✅ **deploy-current-instance.sh**
   - Complete automated deployment script for new instance
   - Installs Docker
   - Builds and runs container
   - Configures everything automatically

2. ✅ **deploy-new-ec2.ps1**
   - PowerShell deployment script for Windows
   - Uploads files via SCP
   - Executes remote deployment
   - Provides status feedback

3. ✅ **DEPLOYMENT_GUIDE.md**
   - Comprehensive deployment documentation
   - Step-by-step manual deployment instructions
   - Troubleshooting guide
   - Useful commands reference

4. ✅ **QUICK_DEPLOY.md**
   - Quick reference card for deployment
   - One-command deployment instructions
   - Common commands and troubleshooting
   - URL references

## Application Features Preserved

All previously implemented features are included in the deployment:

### Terminal Functionality ✅
- ✅ Manual echo for Alpine containers
- ✅ Dynamic prompt display (waf-nginx#)
- ✅ Prompt injection after command completion
- ✅ Prompt protection from backspace deletion
- ✅ Copy/paste functionality (Ctrl+Shift+V)
- ✅ Double paste prevention
- ✅ Terminal logging

### AWS/Kubernetes Integration ✅
- ✅ AWS CLI v1.44.13 in waf-nginx containers
- ✅ kubectl v1.28.0 installed
- ✅ Multi-region AWS config (us-east-1, eu-west-1, ap-southeast-1)
- ✅ Mock kubeconfig for i2-eks-nexus-dev cluster

### Container Management ✅
- ✅ Docker socket mounting
- ✅ Privileged mode for nested containers
- ✅ Dynamic session creation
- ✅ Automatic cleanup
- ✅ State persistence

## Deployment Instructions

### Quick Deployment (Recommended)
```powershell
# From your project directory on Windows
.\deploy-new-ec2.ps1
```

### Manual Deployment
See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for detailed manual steps.

## Verification Checklist

After deployment, verify:

- [ ] Container is running: `docker ps | grep users-app`
- [ ] Application responds: http://34.244.246.180:8081
- [ ] WAF task loads: http://34.244.246.180:8081/task/waf-troubleshooting.html
- [ ] Terminal connects and shows prompt
- [ ] Copy/paste works without double-paste
- [ ] AWS CLI available in waf-nginx containers
- [ ] Exam sessions create and cleanup properly

## Security Configuration

### Required Security Group Rules
| Type | Protocol | Port | Source | Description |
|------|----------|------|--------|-------------|
| SSH | TCP | 22 | Your IP | SSH access |
| Custom TCP | TCP | 8081 | 0.0.0.0/0 | Application |

### To Configure
1. Go to AWS Console → EC2 → Instances
2. Select instance i-0fc5a91af937f1212
3. Click "Security" tab
4. Click security group link
5. Edit inbound rules → Add rules above

## URLs After Deployment

Replace all old URLs with new ones:

| Service | Old URL | New URL |
|---------|---------|---------|
| Main App | http://108.128.139.193:8081 | http://34.244.246.180:8081 |
| WAF Task | http://108.128.139.193:8081/task/waf-troubleshooting.html | http://34.244.246.180:8081/task/waf-troubleshooting.html |
| Tasks | http://108.128.139.193:8081/tasks.html | http://34.244.246.180:8081/tasks.html |
| Admin | http://108.128.139.193:8081/admin.html | http://34.244.246.180:8081/admin.html |
| Manager | http://108.128.139.193:8081/manager.html | http://34.244.246.180:8081/manager.html |

## Next Steps

1. **Deploy Application**
   ```powershell
   .\deploy-new-ec2.ps1
   ```

2. **Configure Security Group**
   - Add port 8081 to inbound rules
   - Restrict SSH to your IP (optional but recommended)

3. **Verify Deployment**
   - Test application access
   - Test WAF troubleshooting task
   - Test terminal functionality
   - Test copy/paste in terminal

4. **Update Documentation**
   - Update any external documentation with new IP
   - Update bookmarks
   - Inform team members of new URLs

## Backup Strategy

### Before Major Changes
```bash
# On EC2 instance
tar -czf state-backup-$(date +%Y%m%d).tar.gz ~/app/lab/state
```

### Download Backup
```powershell
# From your computer
scp -i ExamForNewCandidates.pem ubuntu@34.244.246.180:~/state-backup-*.tar.gz .
```

## Rollback Plan

If deployment fails:
1. Check logs: `docker logs users-app`
2. Review security group settings
3. Verify Docker is installed correctly
4. Check if files were uploaded completely
5. Try manual deployment steps from DEPLOYMENT_GUIDE.md

## Support Resources

- **Deployment Guide:** [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- **Quick Deploy:** [QUICK_DEPLOY.md](QUICK_DEPLOY.md)
- **WAF Lab Documentation:** [lab/waf-lab/README.md](lab/waf-lab/README.md)
- **Testing Guide:** [TESTING_GUIDE.md](TESTING_GUIDE.md)

## Migration Completion Status

- ✅ All configuration files updated
- ✅ Deployment scripts created
- ✅ Documentation updated
- ✅ Ready for deployment to new instance

## Important Notes

1. **PEM File Location:** Make sure `ExamForNewCandidates.pem` is in your project root directory
2. **Permissions:** Windows users should run deployment from PowerShell with proper permissions
3. **Security Group:** Don't forget to configure security group rules before testing
4. **Docker Socket:** Container needs Docker socket mounted with `--privileged` flag
5. **State Persistence:** State directory is mounted to preserve exam data

---

**Migration Date:** January 18, 2026  
**Old Instance:** i-07956dd65db5a171a (108.128.139.193) - DELETED  
**New Instance:** i-0fc5a91af937f1212 (34.244.246.180) - ACTIVE  
**Status:** Ready for deployment ✅
