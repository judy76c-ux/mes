# ===========================================================================
# watch-deploy.ps1  -  File-change watcher -> auto deploy
#
# Usage:
#   .\watch-deploy.ps1               # normal (deploy on save)
#   .\watch-deploy.ps1 -Debounce 3   # wait 3s after last save
#   .\watch-deploy.ps1 -DryRun       # detect only, no deploy
# ===========================================================================
param(
    [int]   $Debounce = 2,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ProjectRoot  = Split-Path -Parent $MyInvocation.MyCommand.Path
$DeployScript = Join-Path $ProjectRoot "deploy.ps1"

$WatchExtensions = @(".html", ".css", ".js")
$WatchSubdirs    = @("js", "css")
$ExcludeParts    = @(".git", "node_modules", ".venv", ".firebase", ".vscode", ".claude", "deploy-", "watch-deploy")

# ---- shared state (global so event handlers can write) --------------------
$global:_wdPending  = $false
$global:_wdLastFile = ""
$global:_wdLastTime = [DateTime]::MinValue

function _wd_ShouldIgnore([string]$path) {
    $ext = [IO.Path]::GetExtension($path).ToLower()
    if ($WatchExtensions -notcontains $ext) { return $true }
    foreach ($part in $ExcludeParts) {
        if ($path.IndexOf($part, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    }
    return $false
}

$onChanged = {
    $p = $Event.SourceEventArgs.FullPath
    if (_wd_ShouldIgnore $p) { return }
    $global:_wdPending  = $true
    $global:_wdLastFile = $p
    $global:_wdLastTime = [DateTime]::Now
}
$onRenamed = {
    $p = $Event.SourceEventArgs.FullPath
    if (_wd_ShouldIgnore $p) { return }
    $global:_wdPending  = $true
    $global:_wdLastFile = $p
    $global:_wdLastTime = [DateTime]::Now
}

# ---- register watchers ----------------------------------------------------
$watchers   = [Collections.Generic.List[IO.FileSystemWatcher]]::new()
$evHandlers = [Collections.Generic.List[Management.Automation.PSEventJob]]::new()

function Add-Watcher([string]$dir, [bool]$recurse) {
    if (-not (Test-Path $dir)) { Write-Host "  [skip] not found: $dir" -ForegroundColor DarkYellow; return }
    $w = [IO.FileSystemWatcher]::new($dir)
    $w.IncludeSubdirectories = $recurse
    $w.NotifyFilter = [IO.NotifyFilters]::LastWrite -bor [IO.NotifyFilters]::FileName -bor [IO.NotifyFilters]::DirectoryName
    $w.EnableRaisingEvents = $true
    $evHandlers.Add((Register-ObjectEvent $w Changed -Action $onChanged)) | Out-Null
    $evHandlers.Add((Register-ObjectEvent $w Created -Action $onChanged)) | Out-Null
    $evHandlers.Add((Register-ObjectEvent $w Deleted -Action $onChanged)) | Out-Null
    $evHandlers.Add((Register-ObjectEvent $w Renamed -Action $onRenamed)) | Out-Null
    $watchers.Add($w) | Out-Null
}

Add-Watcher $ProjectRoot $false              # root: index.html, 404.html
foreach ($sub in $WatchSubdirs) {
    Add-Watcher (Join-Path $ProjectRoot $sub) $true
}

# ---- read deploy target for display ---------------------------------------
$cfgHost = "(config missing)"
try {
    $cfgPath = Join-Path $ProjectRoot "deploy.config.ps1"
    if (Test-Path $cfgPath) {
        . $cfgPath | Out-Null
        $cfgHost = "$($DeployConfig.User)@$($DeployConfig.Host):$($DeployConfig.WebRoot)"
    }
} catch {}

# ---- console helpers -------------------------------------------------------
function Log([string]$msg, [string]$color = "Cyan") {
    Write-Host ("[" + (Get-Date -Format "HH:mm:ss") + "] " + $msg) -ForegroundColor $color
}
function Sep { Write-Host ("─" * 58) -ForegroundColor DarkGray }

# ---- startup banner --------------------------------------------------------
Clear-Host
Sep
Write-Host "  MES Auto-Deploy Watcher" -ForegroundColor White
Sep
Log "Project  : $ProjectRoot"        White
Log "Target   : $cfgHost"            White
Log "Debounce : ${Debounce}s"        White
Log "Watching : index.html, css/, js/" White
if ($DryRun) { Log "[DryRun] detect only - no deploy" Yellow }
Sep
Log "Save any file to trigger deploy.  Ctrl+C to quit." Green
Write-Host ""

$deployCount = 0
$failCount   = 0

# ---- main loop -------------------------------------------------------------
try {
    while ($true) {
        Start-Sleep -Milliseconds 300

        if (-not $global:_wdPending) { continue }

        $sinceChange = ([DateTime]::Now - $global:_wdLastTime).TotalSeconds
        if ($sinceChange -lt $Debounce) { continue }

        $global:_wdPending = $false
        $rel = $global:_wdLastFile.Replace($ProjectRoot, "").TrimStart("\", "/")

        Log "Changed : $rel" Yellow

        if ($DryRun) {
            Log "[DryRun] deploy skipped." DarkYellow
            Write-Host ""
            continue
        }

        $deployCount++
        Log "Deploy #$deployCount starting..." Cyan
        $t0 = [DateTime]::Now

        try {
            & $DeployScript
            $exitCode = $LASTEXITCODE
        } catch {
            $exitCode = 1
            Log ("Error: " + $_.Exception.Message) Red
        }

        $elapsed = [int]([DateTime]::Now - $t0).TotalSeconds

        if ($exitCode -eq 0) {
            Log ("Deploy #" + $deployCount + " OK  [" + $elapsed + "s]") Green
        } else {
            $failCount++
            Log ("Deploy #" + $deployCount + " FAILED  exit=" + $exitCode + "  (total fails: " + $failCount + ")") Red
        }

        Sep
        Log ("Watching...  deploys: " + $deployCount + "  fails: " + $failCount) DarkGray
        Write-Host ""
    }
}
finally {
    foreach ($w in $watchers)   { try { $w.EnableRaisingEvents = $false; $w.Dispose() } catch {} }
    foreach ($e in $evHandlers) { try { Unregister-Event -SourceIdentifier $e.Name -EA SilentlyContinue } catch {} }
    Sep
    Log ("Watcher stopped.  Total deploys: " + $deployCount) Yellow
}
