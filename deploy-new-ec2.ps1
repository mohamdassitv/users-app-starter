# Deploy to New EC2 Instance
# Instance: i-0fc5a91af937f1212
# IP: 34.255.197.158
# =============================================

$EC2_IP = "34.255.197.158"
$EC2_DNS = "ec2-34-255-197-158.eu-west-1.compute.amazonaws.com"
$PEM_FILE = "ExamForNewCandidates.pem"
$EC2_USER = "ubuntu"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Deploying to New EC2 Instance" -ForegroundColor Cyan
Write-Host "Instance: i-0fc5a91af937f1212" -ForegroundColor Cyan
Write-Host "IP: $EC2_IP" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check if PEM file exists
if (-not (Test-Path $PEM_FILE)) {
    Write-Host "❌ Error: $PEM_FILE not found!" -ForegroundColor Red
    Write-Host "Please make sure the PEM file is in the current directory." -ForegroundColor Yellow
    exit 1
}

# Step 1: Set correct permissions on PEM file
Write-Host "Setting PEM file permissions..." -ForegroundColor Yellow
icacls $PEM_FILE /inheritance:r
icacls $PEM_FILE /grant:r "$($env:USERNAME):(R)"
Write-Host "✓ Permissions set" -ForegroundColor Green
Write-Host ""

# Step 2: Upload lab directory
Write-Host "Uploading lab directory..." -ForegroundColor Yellow
scp -i $PEM_FILE -r lab ${EC2_USER}@${EC2_IP}:~/app/
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to upload lab directory" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Lab directory uploaded" -ForegroundColor Green
Write-Host ""

# Step 3: Upload Dockerfile
Write-Host "Uploading Dockerfile..." -ForegroundColor Yellow
scp -i $PEM_FILE Dockerfile ${EC2_USER}@${EC2_IP}:~/app/
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to upload Dockerfile" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Dockerfile uploaded" -ForegroundColor Green
Write-Host ""

# Step 4: Upload deployment script
Write-Host "Uploading deployment script..." -ForegroundColor Yellow
scp -i $PEM_FILE deploy-current-instance.sh ${EC2_USER}@${EC2_IP}:~/
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to upload deployment script" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Deployment script uploaded" -ForegroundColor Green
Write-Host ""

# Step 5: Execute deployment on EC2
Write-Host "Executing deployment on EC2..." -ForegroundColor Yellow
Write-Host ""

$deployCommands = @"
chmod +x ~/deploy-current-instance.sh && \
./deploy-current-instance.sh
"@

ssh -i $PEM_FILE ${EC2_USER}@${EC2_IP} $deployCommands

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host "Deployment Successful!" -ForegroundColor Green
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your application is now available at:" -ForegroundColor Cyan
    Write-Host "   http://${EC2_IP}:8081" -ForegroundColor White
    Write-Host "   http://${EC2_DNS}:8081" -ForegroundColor White
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "   1. Verify Security Group allows port 8081" -ForegroundColor White
    Write-Host "   2. Test application: http://${EC2_IP}:8081" -ForegroundColor White
    Write-Host "   3. Test WAF task: http://${EC2_IP}:8081/task/waf-troubleshooting.html" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Red
    Write-Host "Deployment Failed!" -ForegroundColor Red
    Write-Host "=========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check the error messages above and try again." -ForegroundColor Yellow
    Write-Host "You can also connect manually and check logs:" -ForegroundColor Yellow
    Write-Host "   ssh -i $PEM_FILE ${EC2_USER}@${EC2_IP}" -ForegroundColor White
    Write-Host "   docker logs users-app" -ForegroundColor White
    Write-Host ""
}
