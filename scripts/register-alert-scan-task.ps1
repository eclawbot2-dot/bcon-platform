# Register a Windows Task Scheduler entry that POSTs to /api/cron/alert-scan
# once daily at 06:30 machine-local time.
#
# The alert engine scans every tenant for permit / insurance / vendor-prequal
# expiry, overdue RFIs, budget + commitment over-runs, stale pay-apps awaiting
# approval, outstanding lien waivers, and stalled submittals, then dispatches
# the configured notifications. Daily is the right cadence — these are
# date-threshold alerts, not real-time events.
#
# Reads CRON_SECRET from .env in the repo root. Hits the public Cloudflare
# tunnel URL by default; pass -LocalOnly to hit http://127.0.0.1:3101.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts\register-alert-scan-task.ps1

param(
  [string]$TaskName = 'bcon-alert-scan',
  [string]$Time = '06:30',
  [switch]$LocalOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $root

$envFile = Join-Path $repo '.env'
if (-not (Test-Path $envFile)) { throw "No .env at $envFile - set CRON_SECRET first." }
$secretLine = Get-Content $envFile | Where-Object { $_ -match '^CRON_SECRET=' } | Select-Object -First 1
if (-not $secretLine) { throw "CRON_SECRET not present in .env" }
$secret = ($secretLine -replace '^CRON_SECRET=', '').Trim('"').Trim("'")

$url = if ($LocalOnly) { 'http://127.0.0.1:3101/api/cron/alert-scan' } else { 'https://bcon.jahdev.com/api/cron/alert-scan' }

$action = New-ScheduledTaskAction `
  -Execute 'curl.exe' `
  -Argument "-sf -H ""Authorization: Bearer $secret"" -X POST $url"

$trigger = New-ScheduledTaskTrigger -Daily -At $Time

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Daily platform-wide alert scan at $Time local. Endpoint: $url"

Write-Host "Registered $TaskName, daily at $Time ($url)"
