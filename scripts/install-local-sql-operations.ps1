param(
  [string]$OperationsDirectory = 'D:\pr-private-sql-operations',
  [string]$Database = 'clubs',
  [string]$SqlService = 'MSSQL$MSSQLSERVER01'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
New-Item -ItemType Directory -Path (Join-Path $root '.frontend-audit') -Force | Out-Null
Start-Transcript -Path (Join-Path $root '.frontend-audit\sql-operations-install.log') -Force | Out-Null
$node = (Get-Command node.exe -ErrorAction Stop).Source
$service = Get-CimInstance Win32_Service | Where-Object { $_.Name -eq $SqlService }
if (-not $service -or $service.State -ne 'Running') { throw 'The selected SQL service must be running.' }
if ($Database -notmatch '^[A-Za-z0-9_-]+$') { throw 'Invalid database name.' }
if (-not [IO.Path]::IsPathRooted($OperationsDirectory)) { throw 'An absolute private operations path is required.' }
$privateRoot = [IO.Path]::GetFullPath($OperationsDirectory)
if ($privateRoot.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw 'SQL backups must be outside the repository.' }
$backups = Join-Path $privateRoot 'backups'
New-Item -ItemType Directory -Path $backups -Force | Out-Null
$operator = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$sqlIdentity = $service.StartName
if ($sqlIdentity -eq 'LocalSystem') { $sqlIdentity = '*S-1-5-18' }
& icacls.exe $privateRoot /inheritance:r /grant:r "${operator}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' "${sqlIdentity}:(RX)" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot protect operations directory.' }
& icacls.exe $backups /grant:r "${sqlIdentity}:(OI)(CI)M" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot grant SQL service backup access.' }
$script = Join-Path $root 'scripts\sqlserver-operations.cjs'
# Run a first real backup before enabling cleanup or registering any jobs.
& $node $script backup --directory $backups --database $Database
if ($LASTEXITCODE -ne 0) { throw 'Initial SQL backup or checksum verification failed.' }
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
$backupAction = New-ScheduledTaskAction -Execute $node -Argument ('"' + $script + '" backup --directory "' + $backups + '" --database "' + $Database + '"') -WorkingDirectory $root
$cleanupAction = New-ScheduledTaskAction -Execute $node -Argument ('"' + $script + '" cleanup --directory "' + $backups + '" --database "' + $Database + '"') -WorkingDirectory $root
$backupTrigger = New-ScheduledTaskTrigger -Daily -At '03:00'
$cleanupTrigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(10)) -RepetitionInterval (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName 'PRClubs-SQL-DailyBackup' -Action $backupAction -Trigger $backupTrigger -Principal $principal -Settings $settings -Description 'Daily checksum-verified SQL backup; 14-day retention, minimum two verified copies.' -Force | Out-Null
Register-ScheduledTask -TaskName 'PRClubs-SQL-ExpiredDataCleanup' -Action $cleanupAction -Trigger $cleanupTrigger -Principal $principal -Settings $settings -Description 'Hourly declared TTL cleanup, requiring a verified backup less than 36 hours old.' -Force | Out-Null
Get-ScheduledTask -TaskName 'PRClubs-SQL-DailyBackup','PRClubs-SQL-ExpiredDataCleanup' | Select-Object TaskName, State
Get-ScheduledTask -TaskName 'PRClubs-SQL-DailyBackup','PRClubs-SQL-ExpiredDataCleanup' | ForEach-Object {
  [pscustomobject]@{ TaskName = $_.TaskName; State = [string]$_.State; UserId = $_.Principal.UserId; Actions = $_.Actions; Triggers = $_.Triggers }
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root '.frontend-audit\sql-operations-tasks.json') -Encoding UTF8
Stop-Transcript | Out-Null
