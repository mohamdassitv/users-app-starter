# Test manual delete protections
$Base = 'http://localhost:8081'

function Get-UsersPage($limit=2){
  Invoke-WebRequest -UseBasicParsing "$Base/api/users?limit=$limit"
}

# 1. Fetch a page and capture cookie + csrf
$r = Get-UsersPage 2
$cookie = $r.Headers['Set-Cookie']
$json = $r.Content | ConvertFrom-Json
$uid = $json.users[0].id
$csrf = $json.users[0].uiCsrf
Write-Host "Initial user id=$uid csrf=$csrf"

# 2. Perform a delete
Invoke-WebRequest -UseBasicParsing -Method DELETE -Headers @{ 'X-CSRF-UI'=$csrf; 'Cookie'=$cookie } "$Base/api/users/$uid" | Out-Null
Write-Host "Deleted user $uid"

# 3. Attempt reuse of same nonce (should 403)
try {
  Invoke-WebRequest -UseBasicParsing -Method DELETE -Headers @{ 'X-CSRF-UI'=$csrf; 'Cookie'=$cookie } "$Base/api/users/$($uid+1)" -ErrorAction Stop | Out-Null
  Write-Warning "Unexpected success reusing nonce"
} catch {
  Write-Host "Reuse blocked OK"
}

# 4. Rapid loop until rate limit triggers
$success=0
for($i=0;$i -lt 25;$i++){
  $r2 = Get-UsersPage 1
  $c2 = $r2.Headers['Set-Cookie']
  $j2 = $r2.Content | ConvertFrom-Json
  $csrf2 = $j2.users[0].uiCsrf
  try {
    Invoke-WebRequest -UseBasicParsing -Method DELETE -Headers @{ 'X-CSRF-UI'=$csrf2; 'Cookie'=$c2 } "$Base/api/users/999999" -ErrorAction Stop | Out-Null
    $success++
    Start-Sleep -Milliseconds 100
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if($code -eq 404){
      # counts as an attempt; continue
      $success++
    } elseif($code -eq 429){
      Write-Host "Rate limit engaged after $success attempts"
      break
    } else {
      Write-Host "Stopped on status $code"
      break
    }
  }
}
