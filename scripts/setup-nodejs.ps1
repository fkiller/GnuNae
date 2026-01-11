# GnuNae Node.js Setup (Legacy - Deprecated)
# ===========================================
# This script is kept for compatibility but is no longer needed.
# GnuNae now includes embedded portable Node.js in the package.
#
# For development/testing, use: .\scripts\env-node.ps1
# This will set up environment variables to use the portable Node.js.

param(
    [string]$InstallDir,
    [string]$LogFile = "$env:TEMP\gnunae-setup.log"
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  NOTICE: This script is deprecated" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "GnuNae now includes portable Node.js." -ForegroundColor Cyan
Write-Host "No separate installation is required." -ForegroundColor Cyan
Write-Host ""
Write-Host "For development/testing environment:" -ForegroundColor Gray
Write-Host "  .\scripts\env-node.ps1" -ForegroundColor White
Write-Host ""

# The script now just verifies the embedded Node.js exists
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeDir = $null

# Check various possible locations
$Locations = @(
    (Join-Path $ScriptDir "..\node"),           # Packaged app: resources/scripts/../node
    (Join-Path $ScriptDir "..\..\resources\node")  # Development: scripts/../../resources/node
)

foreach ($loc in $Locations) {
    if (Test-Path $loc) {
        $NodeDir = (Resolve-Path $loc).Path
        break
    }
}

if ($NodeDir -and (Test-Path (Join-Path $NodeDir "node.exe"))) {
    $NodeExe = Join-Path $NodeDir "node.exe"
    $Version = & $NodeExe --version 2>$null
    
    Write-Host "Embedded Node.js found:" -ForegroundColor Green
    Write-Host "  Version: $Version" -ForegroundColor White
    Write-Host "  Path: $NodeDir" -ForegroundColor Gray
    Write-Host ""
    exit 0
}
else {
    Write-Host "WARNING: Embedded Node.js not found." -ForegroundColor Red
    Write-Host "Run 'npm run download-node' from the project root." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
