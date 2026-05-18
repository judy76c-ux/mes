param(
    [string]$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519"
)

$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $ScriptRoot "deploy.config.ps1"

if (-not (Test-Path $ConfigPath)) {
    Write-Host "deploy.config.ps1 not found." -ForegroundColor Yellow
    Write-Host "Create it first: Copy-Item deploy.config.optmes.example.ps1 deploy.config.ps1"
    exit 1
}

. $ConfigPath

if (-not $DeployConfig) {
    throw "DeployConfig is missing in deploy.config.ps1"
}

$HostName = $DeployConfig.Host
$User = $DeployConfig.User
$Port = 22
if ($DeployConfig.ContainsKey("Port") -and $DeployConfig.Port) {
    $Port = [int]$DeployConfig.Port
}

if (-not $HostName -or -not $User) {
    throw "Host and User must be set in deploy.config.ps1"
}

if (-not (Get-Command ssh-keygen -ErrorAction SilentlyContinue)) {
    throw "ssh-keygen command not found. Install OpenSSH Client."
}
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    throw "ssh command not found. Install OpenSSH Client."
}

$SshDir = Split-Path -Parent $KeyPath
if (-not (Test-Path $SshDir)) {
    New-Item -ItemType Directory -Force -Path $SshDir | Out-Null
}

if (-not (Test-Path $KeyPath)) {
    Write-Host "Creating SSH key: $KeyPath" -ForegroundColor Cyan
    ssh-keygen -t ed25519 -f $KeyPath -N ""
    if ($LASTEXITCODE -ne 0) {
        throw "SSH key creation failed."
    }
} else {
    Write-Host "Using existing SSH key: $KeyPath" -ForegroundColor Cyan
}

$PubKeyPath = "$KeyPath.pub"
if (-not (Test-Path $PubKeyPath)) {
    throw "Public key not found: $PubKeyPath"
}

$PublicKey = Get-Content $PubKeyPath -Raw
$EncodedKey = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($PublicKey))
$Target = "$User@$HostName"

Write-Host "Installing public key to $Target" -ForegroundColor Cyan
Write-Host "You should be asked for the Ubuntu password once." -ForegroundColor Yellow

$RemoteCommand = @"
set -e
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo '$EncodedKey' | base64 -d >> ~/.ssh/authorized_keys
awk '!seen[`$0]++' ~/.ssh/authorized_keys > ~/.ssh/authorized_keys.tmp
mv ~/.ssh/authorized_keys.tmp ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo 'SSH key installed.'
"@

$RemoteCommand | ssh -p $Port $Target "bash -s"
if ($LASTEXITCODE -ne 0) {
    throw "SSH key install failed. Check the Ubuntu account name and password by running: ssh $Target"
}

Write-Host "Testing passwordless SSH login." -ForegroundColor Cyan
ssh -p $Port -i $KeyPath -o BatchMode=yes $Target "echo SSH key login OK"
if ($LASTEXITCODE -ne 0) {
    throw "SSH key login test failed. The key was not accepted by the Ubuntu server."
}

Write-Host "Done. Future deploys should not ask for the Ubuntu password." -ForegroundColor Green
