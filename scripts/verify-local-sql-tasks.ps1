$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$results = @()
foreach ($name in @('PRClubs-SQL-DailyBackup', 'PRClubs-SQL-ExpiredDataCleanup')) {
  $previous = (Get-ScheduledTaskInfo -TaskName $name).LastRunTime
  Start-ScheduledTask -TaskName $name
  $deadline = (Get-Date).AddMinutes(2)
  do {
    Start-Sleep -Seconds 1
    $task = Get-ScheduledTask -TaskName $name
    $info = Get-ScheduledTaskInfo -TaskName $name
    if ((Get-Date) -gt $deadline) { throw "Timed out verifying $name" }
  } while ($info.LastRunTime -le $previous -or $task.State -eq 'Running')
  if ($info.LastTaskResult -ne 0) { throw "Task $name failed with result $($info.LastTaskResult)" }
  $results += [pscustomobject]@{ TaskName = $name; UserId = $task.Principal.UserId; LastTaskResult = $info.LastTaskResult; LastRunTime = $info.LastRunTime.ToString('o'); NextRunTime = $info.NextRunTime.ToString('o'); State = [string]$task.State }
}
$results | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root '.frontend-audit\sql-operations-task-runs.json') -Encoding UTF8
