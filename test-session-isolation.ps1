# Session Isolation Testing Script
# This script helps test the per-candidate isolation system

param(
    [switch]$Full,
    [switch]$Quick
)

$baseUrl = "http://localhost:8081"
$adminPassword = "2025"

Write-Host "=== Session Isolation Testing Script ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Check application health
Write-Host "[Test 1] Checking application health..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get
    if ($health.ok) {
        Write-Host "✓ Application is healthy" -ForegroundColor Green
        Write-Host "  Candidates in system: $($health.candidates)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Application health check failed: $_" -ForegroundColor Red
    exit 1
}

# Test 2: Check Docker containers (baseline)
Write-Host "`n[Test 2] Checking baseline Docker containers..." -ForegroundColor Yellow
$baselineContainers = docker ps --filter "name=exam-" --format "{{.Names}}"
if ($baselineContainers) {
    Write-Host "⚠ Found existing exam containers (should be cleaned):" -ForegroundColor Yellow
    $baselineContainers | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
} else {
    Write-Host "✓ No exam containers (clean state)" -ForegroundColor Green
}

# Test 3: Check session state directories
Write-Host "`n[Test 3] Checking session state directories..." -ForegroundColor Yellow
$sessionDir = "lab\state\sessions"
if (Test-Path $sessionDir) {
    $sessions = Get-ChildItem $sessionDir -Directory -ErrorAction SilentlyContinue
    if ($sessions) {
        Write-Host "  Found $($sessions.Count) existing session(s):" -ForegroundColor Gray
        $sessions | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Gray }
    } else {
        Write-Host "✓ No existing sessions (clean state)" -ForegroundColor Green
    }
} else {
    Write-Host "✓ Sessions directory doesn't exist yet (will be created on first use)" -ForegroundColor Green
}

# Test 4: Create test candidate via API
Write-Host "`n[Test 4] Creating test candidate..." -ForegroundColor Yellow
$testEmail = "test-$(Get-Date -Format 'MMdd-HHmmss')@example.com"
$testName = "Test User $(Get-Date -Format 'HH:mm:ss')"

Write-Host "  Email: $testEmail" -ForegroundColor Gray
Write-Host "  Name: $testName" -ForegroundColor Gray

# First, get a session cookie by logging in as admin
try {
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginBody = @{ password = $adminPassword } | ConvertTo-Json
    $loginResponse = Invoke-WebRequest -Uri "$baseUrl/api/auth/admin-login" `
        -Method Post `
        -Body $loginBody `
        -ContentType "application/json" `
        -SessionVariable session `
        -ErrorAction Stop
    
    if ($loginResponse.StatusCode -eq 200) {
        Write-Host "✓ Admin login successful" -ForegroundColor Green
        
        # Now create candidate
        $candidateBody = @{ 
            name = $testName
            email = $testEmail 
        } | ConvertTo-Json
        
        $createResponse = Invoke-RestMethod -Uri "$baseUrl/api/admin/candidate" `
            -Method Post `
            -Body $candidateBody `
            -ContentType "application/json" `
            -WebSession $session
        
        Write-Host "✓ Candidate created successfully" -ForegroundColor Green
        Write-Host "  Slug: $($createResponse.candidate.slug)" -ForegroundColor Gray
        $candidateSlug = $createResponse.candidate.slug
        
    } else {
        Write-Host "✗ Admin login failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Failed to create candidate: $_" -ForegroundColor Red
    Write-Host $_.Exception.Response.StatusCode -ForegroundColor Red
    exit 1
}

# Test 5: Start candidate session (trigger container spawn)
Write-Host "`n[Test 5] Starting candidate session..." -ForegroundColor Yellow
try {
    $startResponse = Invoke-RestMethod -Uri "$baseUrl/api/candidate/$testEmail/start" `
        -Method Post `
        -WebSession $session
    
    if ($startResponse.ok) {
        Write-Host "✓ Session started successfully" -ForegroundColor Green
        if ($startResponse.sessionInitialized) {
            Write-Host "✓ Session initialized" -ForegroundColor Green
            Write-Host "  Containers spawned:" -ForegroundColor Gray
            $startResponse.containers | ForEach-Object { Write-Host "    - $_" -ForegroundColor Gray }
        } else {
            Write-Host "⚠ Session not initialized (error: $($startResponse.error))" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "✗ Failed to start session: $_" -ForegroundColor Red
}

# Wait for containers to fully start
Write-Host "`n  Waiting 3 seconds for containers to start..." -ForegroundColor Gray
Start-Sleep -Seconds 3

# Test 6: Verify containers spawned
Write-Host "`n[Test 6] Verifying spawned containers..." -ForegroundColor Yellow
$examContainers = docker ps --filter "name=exam-" --format "table {{.Names}}\t{{.Status}}" 2>$null
if ($examContainers) {
    $containerLines = $examContainers -split "`n" | Select-Object -Skip 1
    $containerCount = ($containerLines | Where-Object { $_ -match "exam-" }).Count
    
    if ($containerCount -eq 8) {
        Write-Host "✓ Found exactly 8 containers (expected)" -ForegroundColor Green
    } elseif ($containerCount -gt 0) {
        Write-Host "⚠ Found $containerCount containers (expected 8)" -ForegroundColor Yellow
    } else {
        Write-Host "✗ No exam containers found" -ForegroundColor Red
    }
    
    Write-Host "`n  Container details:" -ForegroundColor Gray
    $examContainers | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
} else {
    Write-Host "✗ No exam containers found" -ForegroundColor Red
}

# Test 7: Check session directory created
Write-Host "`n[Test 7] Checking session directory..." -ForegroundColor Yellow
$sessionPath = "lab\state\sessions\$candidateSlug"
if (Test-Path $sessionPath) {
    Write-Host "✓ Session directory created: $sessionPath" -ForegroundColor Green
    
    # Check for metadata.json
    $metadataPath = Join-Path $sessionPath "metadata.json"
    if (Test-Path $metadataPath) {
        Write-Host "✓ metadata.json exists" -ForegroundColor Green
        $metadata = Get-Content $metadataPath | ConvertFrom-Json
        Write-Host "  Session ID: $($metadata.sessionId)" -ForegroundColor Gray
        Write-Host "  Status: $($metadata.status)" -ForegroundColor Gray
        Write-Host "  Candidate: $($metadata.candidateEmail)" -ForegroundColor Gray
    } else {
        Write-Host "⚠ metadata.json not found" -ForegroundColor Yellow
    }
    
    # Check subdirectories
    $subdirs = @("answers", "terminal-logs", "docker-snapshots")
    foreach ($subdir in $subdirs) {
        $subdirPath = Join-Path $sessionPath $subdir
        if (Test-Path $subdirPath) {
            Write-Host "  ✓ $subdir/ exists" -ForegroundColor Green
        } else {
            Write-Host "  ⚠ $subdir/ not found" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "✗ Session directory not created" -ForegroundColor Red
}

# Test 8: Check session API
Write-Host "`n[Test 8] Testing session API..." -ForegroundColor Yellow
try {
    $sessionsResponse = Invoke-RestMethod -Uri "$baseUrl/api/admin/sessions" `
        -Method Get `
        -WebSession $session
    
    if ($sessionsResponse.sessions) {
        $sessionCount = $sessionsResponse.sessions.Count
        Write-Host "✓ Sessions API working: $sessionCount session(s) found" -ForegroundColor Green
        
        # Find our test session
        $ourSession = $sessionsResponse.sessions | Where-Object { $_.candidateEmail -eq $testEmail }
        if ($ourSession) {
            Write-Host "✓ Found our test session" -ForegroundColor Green
            Write-Host "  Status: $($ourSession.status)" -ForegroundColor Gray
            Write-Host "  Containers: $($ourSession.containers.Count)" -ForegroundColor Gray
        } else {
            Write-Host "⚠ Test session not found in API response" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "✗ Sessions API failed: $_" -ForegroundColor Red
}

# Test 9: Test container networking (if containers are running)
Write-Host "`n[Test 9] Testing container networking..." -ForegroundColor Yellow
$firstContainer = docker ps --filter "name=exam-$($candidateSlug.Substring(0,8))" --format "{{.Names}}" 2>$null | Select-Object -First 1
if ($firstContainer) {
    Write-Host "  Testing in container: $firstContainer" -ForegroundColor Gray
    try {
        $hostname = docker exec $firstContainer hostname 2>$null
        if ($hostname) {
            Write-Host "✓ Container hostname: $hostname" -ForegroundColor Green
        }
        
        $ping = docker exec $firstContainer ping -c 1 -W 1 gateway-phoenix 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Can reach gateway-phoenix from session container" -ForegroundColor Green
        } else {
            Write-Host "⚠ Cannot ping gateway-phoenix" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠ Container networking test failed: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠ No container found to test networking" -ForegroundColor Yellow
}

# Summary
Write-Host "`n=== Test Summary ===" -ForegroundColor Cyan
Write-Host "Test candidate created: $testEmail" -ForegroundColor White
Write-Host "Candidate slug: $candidateSlug" -ForegroundColor White
Write-Host ""
Write-Host "Next steps for manual testing:" -ForegroundColor Yellow
Write-Host "1. Open browser: http://localhost:8081/admin-login.html" -ForegroundColor White
Write-Host "   Password: $adminPassword" -ForegroundColor Gray
Write-Host "2. Check Session Browser panel for active session" -ForegroundColor White
Write-Host "3. Open incognito: http://localhost:8081/login.html?email=$testEmail" -ForegroundColor White
Write-Host "4. Test terminal access in candidate view" -ForegroundColor White
Write-Host "5. Submit exam to test snapshot and cleanup" -ForegroundColor White
Write-Host ""

# Cleanup option
Write-Host "Cleanup commands (run after testing):" -ForegroundColor Yellow
Write-Host "  docker ps --filter 'name=exam-' -q | ForEach-Object { docker rm -f `$_ }" -ForegroundColor Gray
Write-Host "  Remove-Item -Recurse -Force 'lab\state\sessions\$candidateSlug'" -ForegroundColor Gray
Write-Host ""
