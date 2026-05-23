param(
  [switch]$RestartTunnel
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$node = 'C:\Program Files\nodejs\node.exe'
$npm = 'C:\Program Files\nodejs\npm.cmd'
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$tunnelTokenFile = Join-Path $root '.tunnel-token'
$tunnelId = 'debe5119-05cc-4c58-83cb-4bbdf065fe8e'
$publicUrl = 'https://bcon.velocitychs.com'
$localPort = 3101

if (-not (Test-Path $node)) { throw "Node not found at $node" }
if (-not (Test-Path $cloudflared)) { throw "cloudflared not found at $cloudflared" }
if (-not (Test-Path $tunnelTokenFile)) { throw "Tunnel token not found at $tunnelTokenFile" }

Write-Host 'Installing dependencies if needed...'
& $npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }

Write-Host 'Pushing Prisma schema...'
& $npm run db:generate | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'prisma generate failed' }
& $npm run db:push | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'prisma db push failed' }

Write-Host 'Seeding demo tenants if DB is empty...'
& $npm run db:seed | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'Seed already applied or failed non-fatally.' }

Write-Host 'Building Next.js...'
& $npm run build
if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }

Write-Host 'Stopping previous bcon processes...'
# Primary: kill whatever process owns localhost:$localPort. The previous
# regex-based kill missed the actual command line (which includes
# `next start -p 3101` but NOT `construction-project`), leaving the old
# process running with the port bound and the new one silently failing
# to start. Killing by port is the only reliable signal.
$portOwners = @()
try {
  $portOwners = Get-NetTCPConnection -LocalPort $localPort -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique
} catch {}
foreach ($targetPid in $portOwners) {
  try { Stop-Process -Id $targetPid -Force -ErrorAction Stop; Write-Host "  killed PID $targetPid (was bound to $localPort)" } catch {}
}
# Secondary: kill any other stray `next start` processes that might be
# left over from a previous botched deploy.
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match 'next.*start' -and ($_.CommandLine -match "-p $localPort" -or $_.CommandLine -match "--port $localPort") } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Write-Host "  killed PID $($_.ProcessId) (next start)" } catch {}
  }

Start-Sleep -Seconds 2

Write-Host "Starting Next.js on port $localPort..."
$env:PORT = $localPort
Start-Process -FilePath $node -ArgumentList 'node_modules/next/dist/bin/next','start','-p',$localPort -WorkingDirectory $root -WindowStyle Hidden | Out-Null

Start-Sleep -Seconds 8

$localProc = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'node_modules/next/dist/bin/next start' }
if (-not $localProc) { throw 'Next.js did not start' }

Write-Host 'Checking local server...'
try {
  $localHealth = Invoke-WebRequest -Uri "http://127.0.0.1:$localPort/" -UseBasicParsing -TimeoutSec 15
  if ($localHealth.StatusCode -ne 200) { throw "Local health check returned $($localHealth.StatusCode)" }
} catch {
  throw "Local server unreachable on port $localPort`: $_"
}

if ($RestartTunnel) {
  Write-Host 'Restarting Cloudflare tunnel...'
  Get-CimInstance Win32_Process |
    Where-Object { $_.Name -eq 'cloudflared.exe' -and $_.CommandLine -match $tunnelId } |
    ForEach-Object {
      try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
    }

  Start-Sleep -Seconds 2

  $tunnelToken = (Get-Content -Raw -Path $tunnelTokenFile).Trim()
  Start-Process -FilePath $cloudflared -ArgumentList 'tunnel','run','--token',$tunnelToken -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 5
}

Write-Host "Checking public URL $publicUrl ..."
try {
  $publicHealth = Invoke-WebRequest -Uri "$publicUrl/" -UseBasicParsing -TimeoutSec 20
  if ($publicHealth.StatusCode -ne 200) { throw "Public health check returned $($publicHealth.StatusCode)" }
} catch {
  Write-Warning "Public URL check failed: $_"
}

Write-Host "bcon deployment OK. PID: $($localProc.ProcessId) · $publicUrl"
