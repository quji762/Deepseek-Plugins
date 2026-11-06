<#
.SYNOPSIS
  Install or update the local plugins in this repository into a DSH profile.

.DESCRIPTION
  Self-contained and idempotent. Each subdirectory of the repository that holds
  a package.json is one plugin; the script installs one of them or all of them.

  Two modes:

    copy     (default)  Each plugin is copied to <DSH home>/local-plugins and
                        the profile links to that stable copy. Deleting or
                        moving this repository afterwards does not break DSH.
                        Re-run the script after `git pull` to apply an update.

    -InPlace           The profile links directly to the working copies, so
                        `git pull` alone updates the live plugins. Deleting the
                        clone breaks DSH until you reinstall.

  For every plugin the script links it into the profile's node_modules/@local,
  registers the link dependency in the profile's package.json, and -- when the
  plugin ships a cordis.patch.yml and the profile has a bundle list -- adds it
  to dsh.profile.bundles so the plugin mounts itself. A plugin without its own
  patch falls back to an insert entry appended to the profile patch.

  Nothing under the DSH installation is touched, so DSH upgrades cannot
  conflict with these plugins.

.PARAMETER Plugin
  Plugin directory name under the repository root, or "all" (the default).

.PARAMETER Profile
  Profile name under $DSH_HOME/profiles. Defaults to "desktop" when it exists,
  otherwise the first profile that has a cordis.patch.yml.

.PARAMETER InstallRoot
  Where the stable copies live in copy mode. Defaults to
  $env:USERPROFILE\.dsh\local-plugins. Ignored with -InPlace.

.PARAMETER InPlace
  Link the working copies directly instead of copying them.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\install.ps1
  Install every plugin in the repository.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\install.ps1 -Plugin llm-retry-settings
  Install just one plugin.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\install.ps1 -InPlace
  Link the working copies, so `git pull` updates the live plugins.
#>
[CmdletBinding()]
param(
  [string]$Plugin = 'all',
  [string]$Profile,
  [string]$InstallRoot,
  [switch]$InPlace
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step($text) { Write-Host "  $text" -ForegroundColor Gray }
function Write-Ok($text)   { Write-Host "  [ok] $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  [!]  $text" -ForegroundColor Yellow }
function Write-Head($text) { Write-Host "`n$text" -ForegroundColor Cyan }

$REQUIRED = @('package.json', 'index.js', 'client.js')

# ---------------------------------------------------------------- repository
$repoRoot = (Resolve-Path -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) '')).Path
Write-Head "Installing local DSH plugins from $repoRoot"
Write-Step "mode: $(if ($InPlace) { 'in-place (junctions -> working copies)' } else { 'copy (stable installs under the DSH home)' })"

$allPluginDirs = Get-ChildItem -LiteralPath $repoRoot -Directory |
  Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'package.json') } |
  Sort-Object Name
if ($null -eq $allPluginDirs -or $allPluginDirs.Count -eq 0) {
  throw "no plugin directories (a folder with package.json) found under $repoRoot"
}

if ($Plugin -eq 'all') {
  $selected = $allPluginDirs
} else {
  $selected = $allPluginDirs | Where-Object { $_.Name -eq $Plugin }
  if ($null -eq $selected) {
    throw "plugin '$Plugin' not found. Available: $(($allPluginDirs.Name) -join ', ')"
  }
}
Write-Step "plugins: $(($selected.Name) -join ', ')"

# ---------------------------------------------------------------- dsh home
$dshHome = $env:DSH_HOME
if ([string]::IsNullOrWhiteSpace($dshHome)) { $dshHome = Join-Path $env:USERPROFILE '.dsh' }
if (-not (Test-Path -LiteralPath $dshHome)) {
  throw "DSH home not found at $dshHome -- install DeepSeek Harness first, or set `$env:DSH_HOME."
}

# ---------------------------------------------------------------- profile
$profilesRoot = Join-Path $dshHome 'profiles'
if (-not (Test-Path -LiteralPath $profilesRoot)) {
  throw "no profiles directory under $dshHome"
}
if ([string]::IsNullOrWhiteSpace($Profile)) {
  if (Test-Path -LiteralPath (Join-Path $profilesRoot 'desktop')) {
    $Profile = 'desktop'
  } else {
    $candidate = Get-ChildItem -LiteralPath $profilesRoot -Directory |
      Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'cordis.patch.yml') } |
      Select-Object -First 1
    if ($null -eq $candidate) { throw "no profile with a cordis.patch.yml found under $profilesRoot" }
    $Profile = $candidate.Name
  }
}
$profileDir = Join-Path $profilesRoot $Profile
if (-not (Test-Path -LiteralPath $profileDir)) {
  throw "profile '$Profile' does not exist under $profilesRoot"
}
Write-Step "profile: $profileDir"

$pkgPath = Join-Path $profileDir 'package.json'
if (-not (Test-Path -LiteralPath $pkgPath)) {
  throw "profile package.json not found at $pkgPath"
}
$patchPath = Join-Path $profileDir 'cordis.patch.yml'

# ---------------------------------------------------------------- per plugin
$failures = 0

foreach ($dir in $selected) {
  $source = $dir.FullName
  $slug = $dir.Name
  Write-Head "[$slug]"

  foreach ($file in $REQUIRED) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $file) -PathType Leaf)) {
      Write-Warn "missing $file -- skipped"
      $script:failures += 1
      continue
    }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $source 'package.json') -PathType Leaf)) { continue }

  $manifest = Get-Content -LiteralPath (Join-Path $source 'package.json') -Raw | ConvertFrom-Json
  $pkgName = [string]$manifest.name
  if ($pkgName -notmatch '^@[^/]+/[^/]+$') {
    Write-Warn "package.json name '$pkgName' is not a scoped package name -- skipped"
    $script:failures += 1
    continue
  }
  $scope, $localName = $pkgName -split '/', 2
  $hasOwnPatch = Test-Path -LiteralPath (Join-Path $source 'cordis.patch.yml') -PathType Leaf
  Write-Step "package: $pkgName$(if ($hasOwnPatch) { ' (ships its own patch)' } else { '' })"

  # ---- install target -------------------------------------------------
  if ($InPlace) {
    $targetDir = $source
    Write-Ok "linking this working copy directly"
  } else {
    if ([string]::IsNullOrWhiteSpace($InstallRoot)) { $InstallRoot = Join-Path $dshHome 'local-plugins' }
    $targetDir = Join-Path $InstallRoot $localName
    # Never install into (or under) the source: the clean copy would delete it.
    if ($targetDir -eq $source -or $targetDir.StartsWith($source.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
      Write-Warn "install root '$targetDir' is inside the source -- skipped (use -InPlace)"
      $script:failures += 1
      continue
    }
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    $targetDir = (Resolve-Path -LiteralPath $targetDir).Path
    # A clean copy keeps removed files from lingering between versions.
    Get-ChildItem -LiteralPath $targetDir -Force | Remove-Item -Recurse -Force
    Copy-Item -Path (Join-Path $source '*') -Destination $targetDir -Recurse -Force
    Write-Ok "installed copy: $targetDir"
  }

  # ---- junction -------------------------------------------------------
  $localModules = Join-Path $profileDir ("node_modules\" + $scope)
  New-Item -ItemType Directory -Force -Path $localModules | Out-Null
  $link = Join-Path $localModules $localName

  $needsLink = $true
  if (Test-Path -LiteralPath $link) {
    $item = Get-Item -LiteralPath $link -Force
    $targets = @($item.Target)
    if ($item.LinkType -eq 'Junction' -and ($targets -contains $targetDir)) {
      $needsLink = $false
    } else {
      Write-Warn "replacing existing entry at $link ($($item.LinkType))"
      Remove-Item -LiteralPath $link -Recurse -Force
    }
  }
  if ($needsLink) {
    New-Item -ItemType Junction -Path $link -Target $targetDir | Out-Null
  }
  if (-not (Test-Path -LiteralPath (Join-Path $link 'client.js') -PathType Leaf)) {
    Write-Warn "junction did not resolve -- the client bundle is missing behind $link"
    $script:failures += 1
    continue
  }
  Write-Ok "module link: $link -> $targetDir"

  # ---- package.json registration --------------------------------------
  $pkgText = [System.IO.File]::ReadAllText($pkgPath)
  $pkgEscaped = [regex]::Escape($pkgName)
  $linkSpec = 'link:' + ($targetDir -replace '\\', '/')
  $depLine = "`"$pkgName`": `"$linkSpec`""

  if ($pkgText -match [regex]::Escape("`"$pkgName`"")) {
    # Replace the whole line so a stale path never survives, keeping the
    # trailing comma: dropping it would make the profile's JSON invalid.
    $pkgText = [regex]::Replace($pkgText, '(?m)^(\s*)"' + $pkgEscaped + '"\s*:.*?(,?)\s*$', {
      param($m)
      $m.Groups[1].Value + $depLine + $m.Groups[2].Value
    })
    Write-Ok "package.json dependency refreshed"
  } elseif ($pkgText -match '"dependencies"') {
    $pkgText = [regex]::Replace($pkgText, '("dependencies"\s*:\s*\{)', { param($m) $m.Groups[1].Value + "`n    " + $depLine })
    Write-Ok "package.json dependency inserted"
  } else {
    Write-Warn "profile package.json has no dependencies block -- add `"$pkgName`": `"$linkSpec`"` manually"
    $script:failures += 1
    continue
  }

  # ---- mounting -------------------------------------------------------
  # A plugin that ships its own cordis.patch.yml mounts itself through the
  # bundle list. Without a bundle list to extend, the entry goes into the
  # profile patch. Doing both would compose the entry twice.
  $mountedByBundle = $false
  if ($hasOwnPatch -and ($pkgText -match '(?s)("bundles"\s*:\s*\[)(?<body>.*?)(\s*\])')) {
    $body = $Matches['body']
    if ($body -match [regex]::Escape("`"$pkgName`"")) {
      $mountedByBundle = $true
      Write-Ok "package.json already lists it as a bundle"
    } else {
      $indent = '        '
      $firstLine = [regex]::Match($body, '(?m)^(\s*)"')
      if ($firstLine.Success) { $indent = $firstLine.Groups[1].Value }
      $pkgText = [regex]::Replace($pkgText, '(?s)("bundles"\s*:\s*\[)(?<body>.*?)(\s*\])', {
        param($m)
        $head = $m.Groups[1].Value
        $inner = $m.Groups[2].Value
        $tail = $m.Groups[3].Value
        if ($inner.Trim().Length -eq 0) {
          $addition = "`n" + $indent + "`"$pkgName`""
        } else {
          $comma = if ($inner.TrimEnd().EndsWith(',')) { '' } else { ',' }
          $addition = $comma + "`n" + $indent + "`"$pkgName`""
        }
        return $head + $inner + $addition + $tail
      })
      $mountedByBundle = $true
      Write-Ok "package.json bundle registration inserted"
    }
  }

  $null = $pkgText | ConvertFrom-Json
  [System.IO.File]::WriteAllText($pkgPath, $pkgText, (New-Object System.Text.UTF8Encoding($false)))

  if ($mountedByBundle) {
    if ((Test-Path -LiteralPath $patchPath) -and ([System.IO.File]::ReadAllText($patchPath) -match [regex]::Escape($pkgName))) {
      # Drop a leftover manual insert: the bundle now provides it.
      $patchText = [System.IO.File]::ReadAllText($patchPath)
      $patchText = [regex]::Replace($patchText, '(?ms)^\r?\n?#[^\r\n]*(Retry|' + [regex]::Escape($localName) + ')[^\r\n]*\r?\n(#[^\r\n]*\r?\n)*?- insert:\r?\n(?:\s*-\s*id:\s*' + [regex]::Escape($localName) + '\r?\n\s*name:\s*''' + [regex]::Escape($pkgName) + '''\r?\n?)', '')
      $patchText = $patchText -replace "(\r?\n){3,}", "`n`n"
      [System.IO.File]::WriteAllText($patchPath, $patchText, (New-Object System.Text.UTF8Encoding($false)))
      Write-Ok "cordis.patch.yml: removed the redundant manual insert"
    } else {
      Write-Ok "cordis.patch.yml untouched (the bundle mounts the entry)"
    }
  } elseif ($hasOwnPatch) {
    Write-Warn "no dsh.profile.bundles list to extend -- add the insert entry manually or extend the bundle list"
  } else {
    $insertBlock = "`n- insert:`n    - id: $localName`n      name: '$pkgName'`n"
    if (-not (Test-Path -LiteralPath $patchPath)) {
      $header = "# Your patch layer for this dsh profile, applied after every bundle layer:`n# a top-level YAML array of loader patch entries.`n"
      [System.IO.File]::WriteAllText($patchPath, $header + $insertBlock.TrimStart("`r", "`n"), (New-Object System.Text.UTF8Encoding($false)))
      Write-Ok "cordis.patch.yml created with the loader entry"
    } elseif ([System.IO.File]::ReadAllText($patchPath) -match [regex]::Escape($pkgName)) {
      Write-Ok "cordis.patch.yml already carries the loader entry"
    } else {
      $patchText = [System.IO.File]::ReadAllText($patchPath)
      if (-not $patchText.EndsWith("`n")) { $patchText += "`n" }
      [System.IO.File]::WriteAllText($patchPath, $patchText + $insertBlock, (New-Object System.Text.UTF8Encoding($false)))
      Write-Ok "cordis.patch.yml loader entry appended"
    }
  }

  # ---- verify ---------------------------------------------------------
  $problems = 0
  if (-not (Test-Path -LiteralPath (Join-Path $link 'package.json'))) { Write-Warn "module does not resolve through the link"; $problems += 1 }
  if (-not (Test-Path -LiteralPath (Join-Path $link 'client.js'))) { Write-Warn "client bundle missing behind the link"; $problems += 1 }
  if (-not (([System.IO.File]::ReadAllText($pkgPath)) -match [regex]::Escape($pkgName))) { Write-Warn "package.json lost the dependency"; $problems += 1 }
  $patchMentions = (Test-Path -LiteralPath $patchPath) -and ([System.IO.File]::ReadAllText($patchPath) -match [regex]::Escape($pkgName))
  if ($patchMentions -and $mountedByBundle) { Write-Warn "duplicate mount: bundle and profile patch both declare the entry"; $problems += 1 }
  if ($problems -eq 0) { Write-Ok "verified" } else { $script:failures += $problems }
}

# ---------------------------------------------------------------- summary
Write-Head "Summary"
if ($failures -eq 0) {
  Write-Host "All done. Restart DeepSeek Harness to pick up host-side changes;" -ForegroundColor Green
  Write-Host "a browser refresh is enough for client.js-only edits." -ForegroundColor Green
  if ($InPlace) {
    Write-Host ""
    Write-Host "In-place mode: 'git pull' updates the live plugins directly." -ForegroundColor DarkGray
  } else {
    Write-Host ""
    Write-Host "Copy mode: re-run this script after 'git pull' to apply updates." -ForegroundColor DarkGray
  }
} else {
  Write-Host "Finished with $failures problem(s) -- see the warnings above." -ForegroundColor Yellow
  exit 1
}
