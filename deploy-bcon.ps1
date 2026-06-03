param(
  [switch]$RestartTunnel,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$node = 'C:\Program Files\nodejs\node.exe'
$npm = 'C:\Program Files\nodejs\npm.cmd'
$publicUrl = 'https://bcon.jahdev.com'
$localPort = 3101
$nextService = 'bcon-next'
$tunnelService = 'Cloudflared'

if (-not (Test-Path $node)) { throw "Node not found at $node" }

# bcon-next and Cloudflared are registered as Windows services (see
# scripts/install-services.ps1). This script is now a deploy-rebuild
# loop: it (re)installs deps, regenerates Prisma client, pushes schema,
# seeds, builds, then restarts the bcon-next service so it picks up the
# new .next/ output. If the services don't exist yet, run
# scripts/install-services.ps1 once first.
$svcNext = Get-Service $nextService -ErrorAction SilentlyContinue
$svcTunnel = Get-Service $tunnelService -ErrorAction SilentlyContinue
if (-not $svcNext) { throw "Service '$nextService' not installed. Run scripts/install-services.ps1 first." }
if (-not $svcTunnel) { throw "Service '$tunnelService' not installed. Run scripts/install-services.ps1 first." }

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

if (-not $SkipBuild) {
  Write-Host 'Building Next.js...'
  & $npm run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }
}

Write-Host "Restarting Windows service '$nextService'..."
Restart-Service -Name $nextService -Force
Start-Sleep -Seconds 6

$svcNextStatus = (Get-Service $nextService).Status
if ($svcNextStatus -ne 'Running') { throw "Service '$nextService' did not start (status: $svcNextStatus)" }

Write-Host 'Checking local server...'
$tries = 0
$localOk = $false
while ($tries -lt 12) {
  try {
    $localHealth = Invoke-WebRequest -Uri "http://127.0.0.1:$localPort/" -UseBasicParsing -TimeoutSec 5
    if ($localHealth.StatusCode -eq 200 -or $localHealth.StatusCode -eq 307) { $localOk = $true; break }
  } catch {}
  Start-Sleep -Seconds 2
  $tries += 1
}
if (-not $localOk) { throw "Local server never came up on port $localPort" }

if ($RestartTunnel) {
  Write-Host "Restarting Cloudflare tunnel service '$tunnelService'..."
  Restart-Service -Name $tunnelService -Force
  Start-Sleep -Seconds 8
}

Write-Host "Checking public URL $publicUrl ..."
try {
  $publicHealth = Invoke-WebRequest -Uri "$publicUrl/login" -UseBasicParsing -TimeoutSec 20
  if ($publicHealth.StatusCode -ne 200) { Write-Warning "Public health check returned $($publicHealth.StatusCode)" }
  else { Write-Host "Public URL OK." }
} catch {
  Write-Warning "Public URL check failed: $_"
}

Write-Host "bcon deployment OK. Services: $nextService (Running), $tunnelService (Running). URL: $publicUrl"
