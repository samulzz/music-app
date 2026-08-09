param(
    [switch]$DryRun,
    [switch]$Status
)

$ImporterDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = Split-Path -Parent (Split-Path -Parent $ImporterDir)
$ConfigPath = Join-Path $ImporterDir "automation.json"
$ExamplePath = Join-Path $ImporterDir "automation.example.json"

if (-not (Test-Path -LiteralPath $ConfigPath)) {
    Copy-Item -LiteralPath $ExamplePath -Destination $ConfigPath
    Write-Host "Criei $ConfigPath. Revise as fontes e execute novamente."
    exit 0
}

Set-Location -LiteralPath $RepoDir

if ($Status) {
    python tools\local-vps-importer\nightly.py --status
    exit $LASTEXITCODE
}

if ($DryRun) {
    python tools\local-vps-importer\nightly.py --config $ConfigPath --dry-run
    exit $LASTEXITCODE
}

$AutomationConfig = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$ConfiguredKeyPath = [string]$AutomationConfig.sshKeyPath
if ($ConfiguredKeyPath.StartsWith('~/') -or $ConfiguredKeyPath.StartsWith('~\')) {
    $UserProfilePath = [Environment]::GetFolderPath('UserProfile')
    $ConfiguredKeyPath = Join-Path $UserProfilePath $ConfiguredKeyPath.Substring(2)
}
$HasSshKey = $ConfiguredKeyPath -and (Test-Path -LiteralPath $ConfiguredKeyPath)

if (-not $env:NATIONMUSICS_SSH_PASSWORD -and -not $HasSshKey) {
    $SecurePassword = Read-Host "Senha SSH da VPS" -AsSecureString
    $PasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
    try {
        $env:NATIONMUSICS_SSH_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($PasswordPointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($PasswordPointer)
    }
}

try {
    python tools\local-vps-importer\nightly.py --config $ConfigPath
    exit $LASTEXITCODE
}
finally {
    Remove-Item Env:NATIONMUSICS_SSH_PASSWORD -ErrorAction SilentlyContinue
}
