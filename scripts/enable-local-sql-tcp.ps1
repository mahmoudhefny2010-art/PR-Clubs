$ErrorActionPreference = 'Stop'
$instanceName = 'MSSQLSERVER01'
$port = 14330
$instanceMap = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
$instanceId = $instanceMap.MSSQLSERVER01
if (-not $instanceId -or $instanceId -notmatch '^MSSQL[0-9]+\.MSSQLSERVER01$') { throw 'Unexpected local SQL instance mapping.' }
$tcpPath = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\' + $instanceId + '\MSSQLServer\SuperSocketNetLib\Tcp'
$tcpSettings = Get-ItemProperty -LiteralPath $tcpPath
$portSettings = Get-ItemProperty -LiteralPath ($tcpPath + '\IPAll')
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listener -and -not ($tcpSettings.Enabled -eq 1 -and $portSettings.TcpPort -eq [string]$port)) { throw 'The chosen TCP port is already occupied.' }
Get-Service -Name ('MSSQL$' + $instanceName) | Out-Null
Set-ItemProperty -LiteralPath $tcpPath -Name Enabled -Value 1
Set-ItemProperty -LiteralPath ($tcpPath + '\IPAll') -Name TcpDynamicPorts -Value ''
Set-ItemProperty -LiteralPath ($tcpPath + '\IPAll') -Name TcpPort -Value ([string]$port)
Restart-Service -Name ('MSSQL$' + $instanceName)
Get-Service -Name ('MSSQL$' + $instanceName) | Select-Object Name, Status
