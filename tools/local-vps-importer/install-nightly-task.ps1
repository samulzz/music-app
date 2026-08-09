param(
    [switch]$Uninstall,
    [switch]$StartNow
)

$TaskName = 'NationMusics Importer 24x7'
$RunnerPath = Join-Path $PSScriptRoot 'run-nightly.ps1'

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host 'Inicializacao automatica removida.'
    exit 0
}

if (-not (Test-Path -LiteralPath $RunnerPath)) {
    throw "Executor nao encontrado: $RunnerPath"
}

$PowerShellPath = (Get-Command powershell.exe).Source
$Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RunnerPath`""
$Action = New-ScheduledTaskAction -Execute $PowerShellPath -Argument $Arguments -WorkingDirectory $PSScriptRoot
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Principal $Principal `
    -Settings $Settings `
    -Description 'Importa continuamente lotes pequenos de musicas brasileiras para o NationMusics.' `
    -Force | Out-Null

if ($StartNow) {
    Start-ScheduledTask -TaskName $TaskName
}

Write-Host "Tarefa '$TaskName' instalada. Ela inicia automaticamente ao entrar no Windows."
