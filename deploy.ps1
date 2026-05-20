param(
    [switch]$DryRun,
    [switch]$SkipRestart,
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $ScriptRoot "deploy.config.ps1"

if (-not (Test-Path $ConfigPath)) {
    Write-Host "deploy.config.ps1 not found." -ForegroundColor Yellow
    Write-Host "Create it from deploy.config.optmes.example.ps1, then edit Ubuntu account." -ForegroundColor Yellow
    Write-Host "Example: Copy-Item deploy.config.optmes.example.ps1 deploy.config.ps1"
    exit 1
}

. $ConfigPath

# ── Git 커밋 (변경사항 있을 때만) ───────────────────────────────
$gitStatus = git -C $ScriptRoot status --porcelain 2>&1
if ($gitStatus) {
    $commitMsg = if ($Message) { $Message } else { "배포 자동 커밋 $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
    Write-Host "Git 변경사항 발견 → 커밋 중..." -ForegroundColor Cyan
    git -C $ScriptRoot add -A
    git -C $ScriptRoot commit -m $commitMsg
    if ($LASTEXITCODE -ne 0) { throw "Git 커밋 실패" }
    Write-Host "Git 커밋 완료: $commitMsg" -ForegroundColor Green
} else {
    Write-Host "Git 변경사항 없음 — 커밋 건너뜀." -ForegroundColor DarkGray
}

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

$KeepDeployBackups = 10
if ($DeployConfig.ContainsKey("KeepDeployBackups") -and $DeployConfig.KeepDeployBackups -ne $null) {
    $KeepDeployBackups = [int]$DeployConfig.KeepDeployBackups
}

$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519"
if ($DeployConfig.ContainsKey("KeyPath") -and $DeployConfig.KeyPath) {
    $KeyPath = [Environment]::ExpandEnvironmentVariables([string]$DeployConfig.KeyPath)
}

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
    "modules",
    "ubuntu"
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

function Quote-ShSingle($Value) {
    return "'" + ([string]$Value).Replace("'", "'\''") + "'"
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

$SshArgs = @("-p", "$Port", "-o", "NumberOfPasswordPrompts=1")
$ScpArgs = @("-P", "$Port", "-o", "NumberOfPasswordPrompts=1")
if ($KeyPath) {
    $SshArgs += @("-i", $KeyPath)
    $ScpArgs += @("-i", $KeyPath)
    Write-Host "SSH key: $KeyPath" -ForegroundColor Cyan
} else {
    Write-Host "SSH key not configured. Password authentication may ask once per connection." -ForegroundColor Yellow
    Write-Host "Run .\setup-ssh-key.ps1 to stop password prompts." -ForegroundColor Yellow
}

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

$RemoteDeployScriptPath = Join-Path $WorkDir "deploy-remote.sh"
$RemoteDeployScript = @'
set -e

WEB_ROOT="$1"
APP_ROOT="$2"
REMOTE_BACKUP="$3"
SKIP_RESTART="$4"
RESTART_COMMAND="$5"
BACKUP_ROOT="$6"
KEEP_DEPLOY_BACKUPS="$7"

mkdir -p "$REMOTE_BACKUP/web" "$REMOTE_BACKUP/api-server"

if [ -d "$WEB_ROOT" ]; then
  for item in index.html 404.html css js modules ubuntu; do
    if [ -e "$WEB_ROOT/$item" ]; then
      cp -a "$WEB_ROOT/$item" "$REMOTE_BACKUP/web/" || true
    fi
  done
fi

if [ -d "$APP_ROOT/api-server" ]; then
  for item in server.js package.json Dockerfile; do
    if [ -e "$APP_ROOT/api-server/$item" ]; then
      cp -a "$APP_ROOT/api-server/$item" "$REMOTE_BACKUP/api-server/" || true
    fi
  done
fi

mkdir -p "$WEB_ROOT" "$APP_ROOT/api-server"

for item in index.html 404.html css js modules ubuntu; do
  if [ -e "$PWD/$item" ]; then
    rm -rf "$WEB_ROOT/$item"
    cp -a "$PWD/$item" "$WEB_ROOT/"
  fi
done

if [ -d "$PWD/api-server" ]; then
  cp -a "$PWD/api-server/." "$APP_ROOT/api-server/"
fi

printf '%s\n' "Files deployed. Backup saved to $REMOTE_BACKUP"

if [ "$SKIP_RESTART" != "1" ] && [ -n "$RESTART_COMMAND" ]; then
  printf '%s\n' "Restarting API: $RESTART_COMMAND"
  sh -lc "$RESTART_COMMAND"
else
  printf '%s\n' "API restart skipped."
fi

if [ "${KEEP_DEPLOY_BACKUPS:-0}" -gt 0 ] && [ -d "$BACKUP_ROOT" ]; then
  deleted_count=0
  while IFS= read -r old_backup; do
    [ -n "$old_backup" ] || continue
    rm -rf "$old_backup"
    deleted_count=$((deleted_count + 1))
  done <<EOF
$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | tail -n +"$((KEEP_DEPLOY_BACKUPS + 1))" | cut -d' ' -f2-)
EOF
  printf '%s\n' "Deploy backup cleanup: kept newest $KEEP_DEPLOY_BACKUPS, deleted $deleted_count old backup(s)."
fi
'@
Set-Content -Path $RemoteDeployScriptPath -Value $RemoteDeployScript -Encoding ASCII

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
    # Windows System32 tar을 명시적으로 사용 (Git bash tar는 Windows 경로를 처리 못함)
    $tarExe = "$env:SystemRoot\System32\tar.exe"
    if (-not (Test-Path $tarExe)) { $tarExe = "tar" }
    & $tarExe -czf $PackagePath .
} finally {
    Pop-Location
}

Write-Host "Deploy target: $SshTarget" -ForegroundColor Cyan
Write-Host "WebRoot: $WebRoot" -ForegroundColor Cyan
Write-Host "AppRoot: $AppRoot" -ForegroundColor Cyan
Write-Host "Backup: $RemoteBackup" -ForegroundColor Cyan
Write-Host "Keep deploy backups: $KeepDeployBackups" -ForegroundColor Cyan
Write-Host "Package: $PackagePath" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "Dry run only. No files were uploaded." -ForegroundColor Yellow
    exit 0
}

Write-Host "Uploading package." -ForegroundColor Cyan
& scp @ScpArgs $PackagePath "$SshTarget`:$RemotePackage"
if ($LASTEXITCODE -ne 0) {
    throw "Package upload failed. Check Ubuntu password or run .\setup-ssh-key.ps1 for key login."
}

$SkipRestartFlag = "0"
if ($SkipRestart -or -not $RestartCommand) {
    $SkipRestartFlag = "1"
}

$RemoteCommand = @(
    "set -e",
    "rm -rf $(Quote-ShSingle $RemoteStage)",
    "mkdir -p $(Quote-ShSingle $RemoteStage)",
    "tar -xzf $(Quote-ShSingle $RemotePackage) -C $(Quote-ShSingle $RemoteStage)",
    "cd $(Quote-ShSingle $RemoteStage)",
    "sed -i 's/\r$//' ./deploy-remote.sh",
    "bash ./deploy-remote.sh $(Quote-ShSingle $WebRoot) $(Quote-ShSingle $AppRoot) $(Quote-ShSingle $RemoteBackup) $(Quote-ShSingle $SkipRestartFlag) $(Quote-ShSingle $RestartCommand) $(Quote-ShSingle $BackupRoot) $(Quote-ShSingle $KeepDeployBackups)",
    "cd /",
    "rm -rf $(Quote-ShSingle $RemoteStage) $(Quote-ShSingle $RemotePackage)"
) -join " && "

& ssh @SshArgs $SshTarget $RemoteCommand
if ($LASTEXITCODE -ne 0) {
    throw "Remote deploy failed. Check /opt/mes permissions and restart command."
}

Remove-Item $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $PackagePath -Force -ErrorAction SilentlyContinue

Write-Host "Deploy complete." -ForegroundColor Green
