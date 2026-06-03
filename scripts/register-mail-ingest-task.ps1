# Register a Windows Task Scheduler entry that POSTs to /api/cron/mail-ingest
# once daily (default 05:45 machine-local time).
#
# Workspace transparency: polls every tenant whose MailConnection is ENABLED,
# pulls recent mail (Google Workspace OR Microsoft 365), dedupes + classifies,
# and stores tenant-scoped MailMessage rows. Tenants without a connection, or
# with the opt-in OFF, are skipped. Daily polling is the safety-net sweep.
#
# Reads CRON_SECRET from .env in the repo root. Hits the public Cloudflare
# tunnel URL by default; pass -LocalOnly to hit http://127.0.0.1:3101.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts\register-mail-ingest-task.ps1

param(
  [string]$TaskName = 'bcon-mail-ingest',
  [string]$Time = '05:45',
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

$url = if ($LocalOnly) { 'http://127.0.0.1:3101/api/cron/mail-ingest' } else { 'https://bcon.jahdev.com/api/cron/mail-ingest' }

$action = New-ScheduledTaskAction `
  -Execute 'curl.exe' `
  -Argument "-sf -H ""Authorization: Bearer $secret"" -X POST $url"

$trigger = New-ScheduledTaskTrigger -Daily -At $Time

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Daily workspace-transparency mail ingest at $Time local. Endpoint: $url"

Write-Host "Registered $TaskName, daily at $Time ($url)"
