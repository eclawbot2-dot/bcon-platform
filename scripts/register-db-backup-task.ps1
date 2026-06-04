# Register a Windows Task Scheduler entry that runs the physical SQLite
# backup (WAL checkpoint + VACUUM INTO) nightly at 03:10 local time.
#
# Unlike the per-tenant JSON backup (which is an HTTP cron endpoint), this
# is a local filesystem operation on prisma/dev.db, so the task runs the
# tsx script directly rather than hitting a URL. Output lands in
# backups/db/ and old snapshots are pruned (BACKUP_RETENTION_DAYS, def 14).
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts\register-db-backup-task.ps1

param(
  [string]$TaskName = 'bcon-nightly-db-backup',
  [string]$Time = '03:10'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $root

# Resolve npx so the task works when run as SYSTEM (which may have a
# different PATH). Fall back to a bare 'npx.cmd' and let PATH resolve it.
$npx = (Get-Command npx.cmd -ErrorAction SilentlyContinue).Source
if (-not $npx) { $npx = (Get-Command npx -ErrorAction SilentlyContinue).Source }
if (-not $npx) { $npx = 'npx.cmd' }

# Run from the repo root so process.cwd() resolves prisma/dev.db + backups/.
$action = New-ScheduledTaskAction `
  -Execute $npx `
  -Argument 'tsx scripts/db-backup.ts' `
  -WorkingDirectory $repo

$trigger = New-ScheduledTaskTrigger -Daily -At $Time

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Nightly physical SQLite backup (WAL checkpoint + VACUUM INTO) for bcon. Output: backups/db/."

Write-Host "Registered $TaskName, next run at $Time daily (npx tsx scripts/db-backup.ts in $repo)"
