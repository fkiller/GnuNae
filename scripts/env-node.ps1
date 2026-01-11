# GnuNae Portable Node.js Environment
# Run this script to get a PowerShell session with embedded Node.js environment
# Usage: .\scripts\env-node.ps1

param(
    [switch]$NoLogo
)

# Determine script location and project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# Determine Node.js location
# When running from source: resources/node
# When running from packaged app: resources/node (relative to resources folder)
$NodeDir = Join-Path $ProjectRoot "resources\node"

# Check for packaged app location (if running from installed app)
if (-not (Test-Path $NodeDir)) {
    # Try relative to script in packaged app
    $PackagedNodeDir = Join-Path $ScriptDir "..\node"
    if (Test-Path $PackagedNodeDir) {
        $NodeDir = (Resolve-Path $PackagedNodeDir).Path
    }
}

if (-not (Test-Path $NodeDir)) {
    Write-Host "ERROR: Node.js portable not found at: $NodeDir" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run 'npm run download-node' first to download Node.js portable." -ForegroundColor Yellow
    exit 1
}

$NodeExe = Join-Path $NodeDir "node.exe"
$NpmCmd = Join-Path $NodeDir "npm.cmd"
$NpxCmd = Join-Path $NodeDir "npx.cmd"

if (-not (Test-Path $NodeExe)) {
    Write-Host "ERROR: node.exe not found in: $NodeDir" -ForegroundColor Red
    exit 1
}

# Get versions
$NodeVersion = & $NodeExe --version 2>$null
$NpmVersion = & $NpmCmd --version 2>$null

if (-not $NoLogo) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  GnuNae Portable Node.js Environment" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Node.js: $NodeVersion" -ForegroundColor Green
    Write-Host "  npm:     v$NpmVersion" -ForegroundColor Green
    Write-Host "  Path:    $NodeDir" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Commands available: node, npm, npx" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

# Set up environment variables
$env:GNUNAE_NODE_DIR = $NodeDir
$env:PATH = "$NodeDir;$env:PATH"

# Set npm global prefix to a local folder to avoid permission issues
$NpmGlobalDir = Join-Path $ProjectRoot "resources\npm-global"
if (-not (Test-Path $NpmGlobalDir)) {
    New-Item -ItemType Directory -Force -Path $NpmGlobalDir | Out-Null
}
$env:npm_config_prefix = $NpmGlobalDir
$env:PATH = "$NpmGlobalDir;$env:PATH"

# Return to project root for convenience
Set-Location $ProjectRoot

# Show prompt hint
function prompt {
    Write-Host "[GnuNae-Node] " -NoNewline -ForegroundColor Cyan
    Write-Host "$(Get-Location)" -NoNewline -ForegroundColor Yellow
    Write-Host ">" -NoNewline
    return " "
}

Write-Host "Environment ready. Type 'exit' to leave." -ForegroundColor Gray
Write-Host ""
