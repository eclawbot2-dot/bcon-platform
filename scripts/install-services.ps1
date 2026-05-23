# Idempotent registration of the two Windows services that run bcon in
# production:
#
#   * Cloudflared          - the named-tunnel daemon for bcon.velocitychs.com
#                            (installed via `cloudflared service install <TOKEN>`)
#   * bcon-next            - Next.js production server on port 3101
#                            (wrapped by NSSM for restart-on-failure +
#                            auto-start-on-boot)
#
# Both services run as LocalSystem so they survive user logout + reboot.
# This script is safe to re-run: each step removes the existing service
# (if any) before re-registering, so config changes always take effect.
#
# Usage (must be elevated):
#   powershell -ExecutionPolicy Bypass -File scripts\install-services.ps1
#
# Prereqs on the host:
#   - cloudflared.exe at C:\Program Files (x86)\cloudflared\cloudflared.exe
#   - nssm.exe on PATH (winget install nssm.nssm if missing)
#   - node.exe at C:\Program Files\nodejs\node.exe
#   - .tunnel-token present in repo root
#   - .env present in repo root with at minimum AUTH_SECRET + CRON_SECRET +
#     AUTH_URL=https://bcon.velocitychs.com + DEFAULT_TENANT_SLUG=velocity-demo
#   - npm run build has been run at least once (otherwise next start has
#     nothing to serve)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $root

$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$nssm = (Get-Command nssm.exe -ErrorAction SilentlyContinue).Source
if (-not $nssm) { throw 'nssm.exe not found on PATH. Install with: winget install nssm.nssm' }

$node = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path $node)) { throw "node.exe not found at $node" }
if (-not (Test-Path $cloudflared)) { throw "cloudflared not found at $cloudflared" }

$tunnelTokenFile = Join-Path $repo '.tunnel-token'
if (-not (Test-Path $tunnelTokenFile)) { throw "Missing $tunnelTokenFile - paste the cloudflared run token from the bcon-velocitychs CF tunnel into this file." }
$tunnelToken = (Get-Content -Raw -Path $tunnelTokenFile).Trim()

$logDir = Join-Path $repo 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

# -----------------------------------------------------------------
# 1. Cloudflared service for the bcon-velocitychs tunnel.
# -----------------------------------------------------------------

$svc = Get-Service Cloudflared -ErrorAction SilentlyContinue
if ($svc) {
  Write-Host 'Existing Cloudflared service found - reinstalling so the token is fresh.'
  & $cloudflared service uninstall | Out-Null
  Start-Sleep -Seconds 2
}

Write-Host 'Installing Cloudflared service...'
& $cloudflared service install $tunnelToken
if ($LASTEXITCODE -ne 0) { throw 'cloudflared service install failed' }

# `cloudflared service install` configures auto-restart at 20s, which is
# what we want. Confirm:
sc.exe failure Cloudflared reset= 86400 actions= restart/20000/restart/30000/restart/60000 | Out-Null

# -----------------------------------------------------------------
# 2. bcon-next NSSM service running `node next start -p 3101`.
# -----------------------------------------------------------------

$svc = Get-Service bcon-next -ErrorAction SilentlyContinue
if ($svc) {
  Write-Host 'Existing bcon-next service found - removing.'
  Stop-Service -Name bcon-next -Force -ErrorAction SilentlyContinue
  & $nssm remove bcon-next confirm | Out-Null
  Start-Sleep -Seconds 2
}

Write-Host 'Installing bcon-next service...'
& $nssm install bcon-next $node 'node_modules/next/dist/bin/next start -p 3101'
& $nssm set bcon-next AppDirectory $repo
& $nssm set bcon-next AppStdout (Join-Path $logDir 'bcon-next.out.log')
& $nssm set bcon-next AppStderr (Join-Path $logDir 'bcon-next.err.log')
& $nssm set bcon-next AppRotateFiles 1
& $nssm set bcon-next AppRotateBytes 5242880
& $nssm set bcon-next AppEnvironmentExtra 'NODE_ENV=production'
& $nssm set bcon-next Start SERVICE_AUTO_START
# NSSM-level restart-on-exit:
& $nssm set bcon-next AppExit Default Restart
& $nssm set bcon-next AppRestartDelay 5000
# Also configure SCM-level recovery actions as a belt-and-suspenders fallback:
sc.exe failure bcon-next reset= 86400 actions= restart/10000/restart/30000/restart/60000 | Out-Null

Write-Host 'Starting bcon-next...'
& $nssm start bcon-next
Start-Sleep -Seconds 6

$svcNext = Get-Service bcon-next
$svcTunnel = Get-Service Cloudflared
Write-Host ''
Write-Host "bcon-next   : $($svcNext.Status) ($($svcNext.StartType))"
Write-Host "Cloudflared : $($svcTunnel.Status) ($($svcTunnel.StartType))"
Write-Host ''
Write-Host 'Both services will survive logout, lid-close, and reboot. Logs:'
Write-Host "  $logDir\bcon-next.out.log"
Write-Host "  $logDir\bcon-next.err.log"
