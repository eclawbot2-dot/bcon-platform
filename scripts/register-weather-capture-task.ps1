# Register a Windows Task Scheduler entry that hits /api/cron/weather-capture
# once each working morning (07:05 local) to write current conditions into
# every project's daily log.
#
# Reads CRON_SECRET from .env in the repo root. Hits the public Cloudflare
# tunnel URL by default; pass -LocalOnly to hit http://127.0.0.1:3101.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts\register-weather-capture-task.ps1

param(
  [string]$TaskName = 'bcon-daily-weather-capture',
  [string]$Time = '07:05',
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

$url = if ($LocalOnly) { 'http://127.0.0.1:3101/api/cron/weather-capture' } else { 'https://bcon.jahdev.com/api/cron/weather-capture' }

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
  -Description "Daily weather auto-capture into project daily logs for bcon. Endpoint: $url"

Write-Host "Registered $TaskName, next run at $Time daily ($url)"
