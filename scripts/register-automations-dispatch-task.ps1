# Register a Windows Task Scheduler entry that POSTs to
# /api/cron/automations-dispatch once per hour.
#
# This ticks the autonomous-workflow engine: each enabled workflow runs on
# its own DB-gated cadence (daily/weekly workflows are honored by a per-
# workflow due check, not by this schedule), so an hourly tick is safe and
# does not over-run anything. Mirrors register-alert-scan-task.ps1.
#
# Reads CRON_SECRET from .env in the repo root. Hits the public Cloudflare
# tunnel URL by default; pass -LocalOnly to hit http://127.0.0.1:3101.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts\register-automations-dispatch-task.ps1

param(
  [string]$TaskName = 'bcon-automations-dispatch',
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

$url = if ($LocalOnly) { 'http://127.0.0.1:3101/api/cron/automations-dispatch' } else { 'https://bcon.velocitychs.com/api/cron/automations-dispatch' }

$action = New-ScheduledTaskAction `
  -Execute 'curl.exe' `
  -Argument "-sf -H ""Authorization: Bearer $secret"" -X POST $url"

# Fire hourly: a trigger at "now" repeating every hour, indefinitely.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Hours 1) `
  -RepetitionDuration ([TimeSpan]::MaxValue)

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
  -Description "Hourly autonomous-workflow dispatch tick. Endpoint: $url"

Write-Host "Registered $TaskName, hourly ($url)"
