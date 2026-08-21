#!powershell
[CmdletBinding()]
param(
  [switch]$Silent,
  [string]$ManifestPath = (Join-Path $PSScriptRoot 'release-dependencies.json')
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Refresh-UserPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$user;$machine"
  $known7Zip = Join-Path ${env:ProgramFiles} '7-Zip'
  if (Test-Path (Join-Path $known7Zip '7z.exe')) { $env:Path = "$known7Zip;$env:Path" }
}

function Has-CommandVersion {
  param([Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][scriptblock]$Probe)
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) { return $false }
  try { & $Probe; return ($LASTEXITCODE -eq 0) } catch { return $false }
}

function Get-SevenZipVersion {
  param([Parameter(Mandatory)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  try {
    $output = @(& $Path i 2>&1)
    if ($LASTEXITCODE -ne 0) { return $null }
    $text = $output -join [Environment]::NewLine
    if ($text -notmatch '(?m)^7-Zip\s+(?<version>\d+(?:\.\d+){1,2})\s+\(') { return $null }
    $parts = @($matches.version -split '\.') | ForEach-Object { [int]$_ }
    while ($parts.Count -lt 3) { $parts += 0 }
    return [Version]::new($parts[0], $parts[1], $parts[2])
  } catch {
    return $null
  }
}

function Test-SevenZipCompatible {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)]$ManifestEntry
  )
  $actual = Get-SevenZipVersion -Path $Path
  if (-not $actual) { return $false }
  return $actual -ge [Version]$ManifestEntry.version
}

function Test-NodeCompatible {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $command) { return $false }
  try {
    $versionText = (& $command.Source --version).Trim().TrimStart('v')
    return ([Version]$versionText -ge [Version]'22.13.0')
  } catch { return $false }
}

function Install-WingetPackage {
  param([Parameter(Mandatory)][string]$Id, [Parameter(Mandatory)][string]$Label, [string]$Version = '')
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "Cannot bootstrap ${Label}: winget.exe is unavailable and no interactive/manual-install fallback is permitted. Use a current Windows image that includes App Installer or provide the repository's approved portable tool cache."
  }
  $args = @('install', '--id', $Id, '--exact', '--scope', 'user', '--silent', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity')
  if ($Version) { $args += @('--version', $Version) }
  Write-Host "Bootstrapping $Label through the canonical Windows package source."
  & $winget.Source @args
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0 -and $Id -eq '7zip.7zip') {
    Write-Host 'User-scoped 7-Zip installation was not applicable; retrying the official package in machine scope.'
    & $winget.Source install --id $Id --exact --scope machine --silent --accept-source-agreements --accept-package-agreements --disable-interactivity
    $exitCode = $LASTEXITCODE
    if (Test-Path (Join-Path (Join-Path ${env:ProgramFiles} '7-Zip') '7z.exe')) { $exitCode = 0 }
  }
  if ($exitCode -ne 0) { throw "winget failed to bootstrap $Label (package $Id) with exit code $exitCode." }
  Refresh-UserPath
}

$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
$sevenZipManifest = @($manifest.dependencies | Where-Object name -eq '7-Zip') | Select-Object -First 1
if (-not $sevenZipManifest) { throw "release-dependencies.json must contain a 7-Zip version record." }
Refresh-UserPath
if (-not (Test-NodeCompatible)) { Install-WingetPackage -Id 'OpenJS.NodeJS.LTS' -Label 'Node.js LTS' }
if (-not (Has-CommandVersion -Name 'go.exe' -Probe { go.exe version }) -or (go.exe version) -notmatch 'go1\.26(?:\.\d+)?') { Install-WingetPackage -Id 'GoLang.Go' -Label 'Go 1.26' -Version '1.26.0' }
$sevenZip = Get-Command 7z.exe -ErrorAction SilentlyContinue
if (-not $sevenZip -or -not (Test-SevenZipCompatible -Path $sevenZip.Source -ManifestEntry $sevenZipManifest)) {
  $choco = Get-Command choco.exe -ErrorAction SilentlyContinue
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($choco -and $sevenZipManifest -and $isAdmin) {
    & $choco.Source install 7zip.install --version ([string]$sevenZipManifest.version) -y --no-progress
    if ($LASTEXITCODE -eq 0) { Refresh-UserPath }
  }
  $sevenZip = Get-Command 7z.exe -ErrorAction SilentlyContinue
  if (-not $sevenZip -or -not (Test-SevenZipCompatible -Path $sevenZip.Source -ManifestEntry $sevenZipManifest)) {
    Install-WingetPackage -Id '7zip.7zip' -Label '7-Zip' -Version '26.02'
  }
}

foreach ($required in @('node.exe', 'go.exe')) {
  if (-not (Get-Command $required -ErrorAction SilentlyContinue)) { throw "Prerequisite bootstrap completed without a usable $required on PATH." }
}
$sevenZip = Get-Command 7z.exe -ErrorAction SilentlyContinue
if (-not $sevenZip -or -not (Test-SevenZipCompatible -Path $sevenZip.Source -ManifestEntry $sevenZipManifest)) {
  $actualVersion = if ($sevenZip) { Get-SevenZipVersion -Path $sevenZip.Source } else { $null }
  $actualText = if ($actualVersion) { [string]$actualVersion } else { 'missing or unparseable' }
  throw "Prerequisite bootstrap completed without a compatible 7z.exe; expected version >= $($sevenZipManifest.version), found $actualText."
}
Write-Host 'Node.js, Go, and 7-Zip are available for the repository build path.'
