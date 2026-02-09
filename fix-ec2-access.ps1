# Fix EC2 Access Script
# Run this from AWS Console CloudShell or EC2 Instance Connect

$ErrorActionPreference = "Continue"

Write-Host "=== EC2 Access Fix Script ===" -ForegroundColor Cyan
Write-Host ""

# Instance details
$INSTANCE_ID = "i-07956dd65db5a171a"
$REGION = "eu-west-1"
$PUBLIC_IP = "108.129.251.79"

# Test current connectivity
Write-Host "1. Testing SSH connectivity to $PUBLIC_IP..." -ForegroundColor Yellow
$testResult = Test-NetConnection -ComputerName $PUBLIC_IP -Port 22 -WarningAction SilentlyContinue
if ($testResult.TcpTestSucceeded) {
    Write-Host "   ✓ SSH port 22 is accessible!" -ForegroundColor Green
} else {
    Write-Host "   ✗ SSH port 22 is NOT accessible" -ForegroundColor Red
    Write-Host "   This could be due to:" -ForegroundColor Yellow
    Write-Host "     - Network ACL blocking traffic" -ForegroundColor Yellow
    Write-Host "     - Corporate firewall" -ForegroundColor Yellow
    Write-Host "     - Instance firewall (iptables/firewalld)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "2. Testing application port 3100..." -ForegroundColor Yellow
$testResult = Test-NetConnection -ComputerName $PUBLIC_IP -Port 3100 -WarningAction SilentlyContinue
if ($testResult.TcpTestSucceeded) {
    Write-Host "   ✓ Application port 3100 is accessible!" -ForegroundColor Green
} else {
    Write-Host "   ✗ Application port 3100 is NOT accessible" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Solution: Use AWS Console EC2 Instance Connect ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Since SSH from your network is blocked, use AWS Console:" -ForegroundColor White
Write-Host ""
Write-Host "Step 1: Open AWS Console" -ForegroundColor Green
Write-Host "   https://eu-west-1.console.aws.amazon.com/ec2/home?region=eu-west-1#Instances:instanceId=$INSTANCE_ID" -ForegroundColor Blue
Write-Host ""
Write-Host "Step 2: Click 'Connect' button → 'EC2 Instance Connect' → 'Connect'" -ForegroundColor Green
Write-Host ""
Write-Host "Step 3: Run this command in the browser terminal:" -ForegroundColor Green
Write-Host "   curl -fsSL https://raw.githubusercontent.com/mohamdassitv/users-app-starter/main/deploy-to-ec2.sh | bash" -ForegroundColor Yellow
Write-Host ""
Write-Host "Step 4: After deployment, access your app:" -ForegroundColor Green
Write-Host "   http://$PUBLIC_IP:3100" -ForegroundColor Blue
Write-Host ""
