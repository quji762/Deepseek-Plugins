<#
.SYNOPSIS
  Verify that the local DSH plugins from this repository are installed correctly.

.DESCRIPTION
  Checks, for every plugin directory in the repository root, that:
    - the profile declares the link/git dependency
    - the profile lists it in dsh.profile.bundles
    - the module resolves and its client bundle exists
    - the lockfile pins it
  Run this on each machine after installing, or when something looks wrong.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File verify-plugins.ps1
#>
param(
  [string]$Profile = 'desktop'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$profileDir = Join-Path $dshHome "profiles\$Profile"

if (-not (Test-Path -LiteralPath $profileDir)) {
  Write-Host "profile '$Profile' not found under $dshHome\profiles" -ForegroundColor Red
  exit 1
}

$pkgText = Get-Content -LiteralPath (Join-Path $profileDir 'package.json') -Raw
$lockText = ''
$lockPath = Join-Path $profileDir 'pnpm-lock.yaml'
if (Test-Path -LiteralPath $lockPath) { $lockText = Get-Content -LiteralPath $lockPath -Raw }

$pluginDirs = Get-ChildItem -LiteralPath $repoRoot -Directory |
  Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'package.json') }

if (-not $pluginDirs) {
  Write-Host "no plugin directories under $repoRoot" -ForegroundColor Yellow
  exit 0
}

$problems = 0
foreach ($dir in $pluginDirs) {
  $name = (Get-Content -LiteralPath (Join-Path $dir.FullName 'package.json') -Raw | ConvertFrom-Json).name
  Write-Host "`n[$name]  ($($dir.Name))"

  if ($pkgText -match [regex]::Escape("`"$name`"")) {
    $spec = [regex]::Match($pkgText, '"' + [regex]::Escape($name) + '"\s*:\s*"([^"]+)"').Groups[1].Value
    Write-Host "  [ok]   dependency: $spec" -ForegroundColor Green
  } else {
    Write-Host "  [MISS] not in package.json dependencies" -ForegroundColor Red; $problems += 1
  }

  if ($pkgText -match [regex]::Escape("`"$name`",") -or $pkgText -match ('"' + [regex]::Escape($name) + '"\s*\n')) {
    Write-Host "  [ok]   listed as a bundle" -ForegroundColor Green
  } else {
    Write-Host "  [MISS] not in dsh.profile.bundles" -ForegroundColor Red; $problems += 1
  }

  $localName = $name -split '/', 2 | Select-Object -Last 1
  $clientPath = Join-Path $profileDir "node_modules\$localName\client.js"
  if (Test-Path -LiteralPath $clientPath) {
    Write-Host "  [ok]   client bundle resolves" -ForegroundColor Green
  } else {
    Write-Host "  [MISS] client bundle missing at node_modules\$localName" -ForegroundColor Red; $problems += 1
  }

  if ($lockText -match [regex]::Escape($name)) {
    Write-Host "  [ok]   recorded in the lockfile" -ForegroundColor Green
  } else {
    Write-Host "  [warn] not found in pnpm-lock.yaml" -ForegroundColor Yellow
  }
}

Write-Host ""
if ($problems -eq 0) {
  Write-Host "all plugins installed correctly" -ForegroundColor Green
} else {
  Write-Host "$problems problem(s) -- reinstall with:" -ForegroundColor Yellow
  Write-Host "  dsh plugin --profile $Profile remove <package>"
  Write-Host "  dsh plugin --profile $Profile add `<repo>#path:<plugin-dir>`"
  exit 1
}
