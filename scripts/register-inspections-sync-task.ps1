# Register a Windows Task Scheduler entry that POSTs to
# /api/cron/inspections-sync every 2 hours from 6am to 10pm America/New_York.
#
# Reads CRON_SECRET from .env in the repo root. Hits the public Cloudflare
# tunnel URL by default so the task survives a localhost-port change;
# pass -LocalOnly to hit http://127.0.0.1:3101 instead.
#
# Trigger explanation: Task Scheduler triggers fire in the machine's local
# time. This script schedules 9 separate daily triggers - 6am, 8am, 10am,
# 12pm, 2pm, 4pm, 6pm, 8pm, 10pm - in machine-local time. If the box is
# already on America/New_York that's exactly what the user asked for. If
# not, override with -Times "06:00 08:00 10:00 12:00 14:00 16:00 18:00 20:00 22:00".
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts\register-inspections-sync-task.ps1

param(
  [string]$TaskName = 'bcon-inspections-sync',
  [string[]]$Times = @('06:00','08:00','10:00','12:00','14:00','16:00','18:00','20:00','22:00'),
  [switch]$LocalOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $root

# Pull CRON_SECRET out of the repo's .env file.
$envFile = Join-Path $repo '.env'
if (-not (Test-Path $envFile)) { throw "No .env at $envFile - set CRON_SECRET first." }
$secretLine = Get-Content $envFile | Where-Object { $_ -match '^CRON_SECRET=' } | Select-Object -First 1
if (-not $secretLine) { throw "CRON_SECRET not present in .env" }
$secret = ($secretLine -replace '^CRON_SECRET=', '').Trim('"').Trim("'")

$url = if ($LocalOnly) { 'http://127.0.0.1:3101/api/cron/inspections-sync' } else { 'https://bcon.velocitychs.com/api/cron/inspections-sync' }

$action = New-ScheduledTaskAction `
  -Execute 'curl.exe' `
  -Argument "-sf -H ""Authorization: Bearer $secret"" -X POST $url"

# Build one daily trigger per time-of-day. Task Scheduler supports
# multiple triggers on a single task; we don't need to register multiple
# tasks.
$triggers = foreach ($t in $Times) {
  New-ScheduledTaskTrigger -Daily -At $t
}

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

# Run as SYSTEM so the task fires when the user is logged out.
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest

# Replace any existing task with the same name.
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $triggers `
  -Settings $settings `
  -Principal $principal `
  -Description "Charleston-area inspection sync every 2 hours, $($Times[0]) to $($Times[-1]) local. Endpoint: $url"

Write-Host "Registered $TaskName, triggers: $($Times -join ', ') ($url)"
