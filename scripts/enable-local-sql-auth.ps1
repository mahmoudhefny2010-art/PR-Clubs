$ErrorActionPreference = 'Stop'
$instanceMap = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
$instanceId = $instanceMap.MSSQLSERVER01
if (-not $instanceId -or $instanceId -notmatch '^MSSQL[0-9]+\.MSSQLSERVER01$') { throw 'Unexpected local SQL instance mapping.' }
$serverPath = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\' + $instanceId + '\MSSQLServer'
Get-Service -Name 'MSSQL$MSSQLSERVER01' | Out-Null
Set-ItemProperty -LiteralPath $serverPath -Name LoginMode -Value 2
Restart-Service -Name 'MSSQL$MSSQLSERVER01'
Get-Service -Name 'MSSQL$MSSQLSERVER01' | Select-Object Name, Status
