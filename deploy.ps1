param(
    [switch]$DryRun,
    [switch]$SkipRestart
)

$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $ScriptRoot "deploy.config.ps1"
$ExampleConfigPath = Join-Path $ScriptRoot "deploy.config.example.ps1"

if (-not (Test-Path $ConfigPath)) {
    Write-Host "deploy.config.ps1 not found." -ForegroundColor Yellow
    Write-Host "Create it from deploy.config.example.ps1, then edit Ubuntu paths/account." -ForegroundColor Yellow
    Write-Host "Example: Copy-Item deploy.config.example.ps1 deploy.config.ps1"
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
$WebRoot = ""
if ($DeployConfig.ContainsKey("WebRoot") -and $DeployConfig.WebRoot) {
    $WebRoot = [string]$DeployConfig.WebRoot
}
$WebRoot = $WebRoot.TrimEnd("/")
$AppRoot = ""
if ($DeployConfig.ContainsKey("AppRoot") -and $DeployConfig.AppRoot) {
    $AppRoot = [string]$DeployConfig.AppRoot
}
$AppRoot = $AppRoot.TrimEnd("/")
$RestartCommand = $DeployConfig.RestartCommand
$BackupRoot = "/home/$User/mes-deploy-backups"
if ($DeployConfig.ContainsKey("BackupRoot") -and $DeployConfig.BackupRoot) {
    $BackupRoot = [string]$DeployConfig.BackupRoot
}
$BackupRoot = $BackupRoot.TrimEnd("/")

if (-not $HostName -or -not $User -or -not $WebRoot -or -not $AppRoot) {
    throw "Host, User, WebRoot, and AppRoot must be set in deploy.config.ps1"
}

$SshTarget = "$User@$HostName"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$WorkDir = Join-Path $env:TEMP "mes-deploy-$Stamp"
$PackagePath = Join-Path $env:TEMP "mes-deploy-$Stamp.tar.gz"
$RemotePackage = "/tmp/mes-deploy-$Stamp.tar.gz"
$RemoteStage = "/tmp/mes-deploy-$Stamp"
$RemoteBackup = "$BackupRoot/$Stamp"

$FrontendItems = @(
    "index.html",
    "404.html",
    "css",
    "js",
    "modules"
)

$ApiItems = @(
    "api-server/server.js",
    "api-server/package.json",
    "api-server/Dockerfile"
)

function Require-Command($Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name command not found. Install OpenSSH Client or make sure it is in PATH."
    }
}

function Copy-DeployItem($RelativePath) {
    $Source = Join-Path $ScriptRoot $RelativePath
    if (-not (Test-Path $Source)) {
        Write-Host "Skip missing: $RelativePath" -ForegroundColor DarkYellow
        return
    }

    $Target = Join-Path $WorkDir $RelativePath
    $TargetParent = Split-Path -Parent $Target
    New-Item -ItemType Directory -Force -Path $TargetParent | Out-Null

    if ((Get-Item $Source).PSIsContainer) {
        Copy-Item $Source $Target -Recurse -Force
    } else {
        Copy-Item $Source $Target -Force
    }
}

Require-Command ssh
Require-Command scp
Require-Command tar

if (Test-Path $WorkDir) {
    Remove-Item $WorkDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

foreach ($item in $FrontendItems) {
    Copy-DeployItem $item
}
foreach ($item in $ApiItems) {
    Copy-DeployItem $item
}

$RemovePatterns = @(
    ".git",
    "node_modules",
    ".firebase",
    ".venv",
    ".sisyphus",
    ".vscode",
    ".claude"
)

foreach ($pattern in $RemovePatterns) {
    Get-ChildItem $WorkDir -Force -Recurse -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -eq $pattern } |
        ForEach-Object { Remove-Item $_.FullName -Recurse -Force }
}

Get-ChildItem $WorkDir -Force -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq ".DS_Store" -or $_.Name.StartsWith("._") } |
    ForEach-Object { Remove-Item $_.FullName -Force }

if (Test-Path $PackagePath) {
    Remove-Item $PackagePath -Force
}

Push-Location $WorkDir
try {
    tar -czf $PackagePath .
} finally {
    Pop-Location
}

Write-Host "Deploy target: $SshTarget" -ForegroundColor Cyan
Write-Host "WebRoot: $WebRoot" -ForegroundColor Cyan
Write-Host "AppRoot: $AppRoot" -ForegroundColor Cyan
Write-Host "Backup: $RemoteBackup" -ForegroundColor Cyan
Write-Host "Package: $PackagePath" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "Dry run only. No files were uploaded." -ForegroundColor Yellow
    exit 0
}

scp -P $Port $PackagePath "$SshTarget`:$RemotePackage"

$RemoteScript = @"
set -e
WEB_ROOT='$WebRoot'
APP_ROOT='$AppRoot'
REMOTE_PACKAGE='$RemotePackage'
REMOTE_STAGE='$RemoteStage'
REMOTE_BACKUP='$RemoteBackup'

mkdir -p "`$REMOTE_STAGE" "`$REMOTE_BACKUP/web" "`$REMOTE_BACKUP/api-server"
tar -xzf "`$REMOTE_PACKAGE" -C "`$REMOTE_STAGE"

if [ -d "`$WEB_ROOT" ]; then
  for item in index.html 404.html css js modules; do
    if [ -e "`$WEB_ROOT/`$item" ]; then
      cp -a "`$WEB_ROOT/`$item" "`$REMOTE_BACKUP/web/" || true
    fi
  done
fi

if [ -d "`$APP_ROOT/api-server" ]; then
  for item in server.js package.json Dockerfile; do
    if [ -e "`$APP_ROOT/api-server/`$item" ]; then
      cp -a "`$APP_ROOT/api-server/`$item" "`$REMOTE_BACKUP/api-server/" || true
    fi
  done
fi

mkdir -p "`$WEB_ROOT" "`$APP_ROOT/api-server"

for item in index.html 404.html css js modules; do
  if [ -e "`$REMOTE_STAGE/`$item" ]; then
    rm -rf "`$WEB_ROOT/`$item"
    cp -a "`$REMOTE_STAGE/`$item" "`$WEB_ROOT/"
  fi
done

if [ -d "`$REMOTE_STAGE/api-server" ]; then
  cp -a "`$REMOTE_STAGE/api-server/." "`$APP_ROOT/api-server/"
fi

rm -rf "`$REMOTE_STAGE" "`$REMOTE_PACKAGE"
echo "Files deployed. Backup saved to `$REMOTE_BACKUP"
"@

$RemoteScript | ssh -p $Port $SshTarget "bash -s"

if (-not $SkipRestart -and $RestartCommand) {
    Write-Host "Restarting API: $RestartCommand" -ForegroundColor Cyan
    ssh -p $Port $SshTarget $RestartCommand
} else {
    Write-Host "API restart skipped." -ForegroundColor Yellow
}

Remove-Item $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $PackagePath -Force -ErrorAction SilentlyContinue

Write-Host "Deploy complete." -ForegroundColor Green
