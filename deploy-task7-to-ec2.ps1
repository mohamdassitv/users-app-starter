# Deploy Task 7 to EC2
# =====================

$EC2_IP = "34.255.197.158"
$PEM_FILE = "ExamForNewCandidates.pem"
$EC2_USER = "ubuntu"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "🚀 Deploying Task 7 to EC2" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check if PEM file exists
if (-not (Test-Path $PEM_FILE)) {
    Write-Host "❌ Error: PEM file not found: $PEM_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "📁 Preparing files for upload..." -ForegroundColor Yellow

# Create temporary directory for files to upload
$TEMP_DIR = "temp-task7-deploy"
if (Test-Path $TEMP_DIR) {
    Remove-Item -Recurse -Force $TEMP_DIR
}
New-Item -ItemType Directory -Path $TEMP_DIR | Out-Null

# Copy Task 7 files
Copy-Item "lab\src\public\task\waf-troubleshooting.html" "$TEMP_DIR\waf-troubleshooting.html"
Copy-Item -Recurse "waf-lab" "$TEMP_DIR\waf-lab"

Write-Host "✅ Files prepared" -ForegroundColor Green
Write-Host ""

Write-Host "📤 Uploading files to EC2..." -ForegroundColor Yellow

# Upload files using SCP
scp -i $PEM_FILE -r "$TEMP_DIR\waf-troubleshooting.html" "${EC2_USER}@${EC2_IP}:~/"
scp -i $PEM_FILE -r "$TEMP_DIR\waf-lab" "${EC2_USER}@${EC2_IP}:~/"

Write-Host "✅ Files uploaded" -ForegroundColor Green
Write-Host ""

Write-Host "🔧 Configuring Task 7 on EC2..." -ForegroundColor Yellow

# Create a bash script file
$bashScriptContent = @'
#!/bin/bash
CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'lab-app|app' | head -n 1)

if [ -z "$CONTAINER" ]; then
    echo "No container found"
    docker ps
    exit 1
fi

echo "Found container: $CONTAINER"
docker cp ~/waf-troubleshooting.html $CONTAINER:/app/lab/src/public/task/waf-troubleshooting.html
echo "Copied waf-troubleshooting.html"
docker cp ~/waf-lab $CONTAINER:/app/waf-lab
echo "Copied waf-lab directory"
docker exec $CONTAINER ls -la /app/lab/src/public/task/waf-troubleshooting.html
docker exec $CONTAINER ls -la /app/waf-lab/
echo "Task 7 Deployment Complete!"
'@

# Save to temp file
$scriptFile = "deploy-task7-remote.sh"
$bashScriptContent | Out-File -FilePath $scriptFile -Encoding ASCII -NoNewline

# Upload script
Write-Host "Uploading deployment script..." -ForegroundColor Yellow
scp -i $PEM_FILE $scriptFile "${EC2_USER}@${EC2_IP}:~/"

# Execute script
ssh -i $PEM_FILE "${EC2_USER}@${EC2_IP}" "bash ~/deploy-task7-remote.sh"

# Cleanup
Remove-Item $scriptFile

# Cleanup temp directory
Remove-Item -Recurse -Force $TEMP_DIR

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "✅ DEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "🔗 Access Task 7:" -ForegroundColor Cyan
Write-Host "   http://${EC2_IP}:8081/tasks.html" -ForegroundColor White
Write-Host ""
Write-Host "📝 Task 7 should now appear in the tasks list" -ForegroundColor Yellow
Write-Host ""
Write-Host "🐳 To start the WAF lab on EC2:" -ForegroundColor Cyan
Write-Host "   ssh -i $PEM_FILE ${EC2_USER}@${EC2_IP}" -ForegroundColor White
Write-Host "   cd waf-lab" -ForegroundColor White
Write-Host "   docker-compose up -d" -ForegroundColor White
Write-Host ""
