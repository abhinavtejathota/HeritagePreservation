#!/usr/bin/env pwsh
# Heritage process manager — same flags as Python/bash:
#   .\scripts\start-all.ps1
#   .\scripts\start-all.ps1 --stop
#   .\scripts\start-all.ps1 --restart
#   .\scripts\start-all.ps1 --status
#   .\scripts\start-all.ps1 --build-frontend
#   .\scripts\start-all.ps1 --with-webgl --with-api-fallback

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if ($args.Count -eq 0) {
    python scripts/start_all.py --start
} else {
    python scripts/start_all.py @args
}
exit $LASTEXITCODE
