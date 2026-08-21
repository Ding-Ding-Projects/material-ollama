#!powershell
[CmdletBinding()]
param(
  [string]$ManifestPath = (Join-Path $PSScriptRoot 'release-dependencies.json'),
  [string]$OutputRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) 'dist\webview2')
)
$ErrorActionPreference = 'Stop'
$utilityModulePath = Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
if (-not (Test-Path -LiteralPath $utilityModulePath -PathType Leaf)) { throw "Microsoft.PowerShell.Utility module manifest was not found under PSHOME: $utilityModulePath" }
Import-Module -Name $utilityModulePath -Force -ErrorAction Stop
$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
if (-not $manifest.webview2 -or @($manifest.webview2).Count -ne 2) { throw 'release-dependencies.json must pin exactly x64 and ARM64 WebView2 payloads.' }
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
$cacheRoot = Join-Path $env:LOCALAPPDATA 'MaterialOllama\webview2'
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
foreach ($item in $manifest.webview2) {
  if ($item.url -notmatch '^https://msedge\.sf\.dl\.delivery\.mp\.microsoft\.com/') { throw "WebView2 source is not an official Microsoft URL: $($item.url)" }
  if ($item.sha256 -notmatch '^[0-9a-f]{64}$') { throw "WebView2 digest is invalid for $($item.name)" }
  $cachePath = Join-Path $cacheRoot $item.filename
  $actual = if (Test-Path -LiteralPath $cachePath -PathType Leaf) { (Get-FileHash -LiteralPath $cachePath -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null }
  if ($actual -ne $item.sha256) {
    Write-Host "Downloading pinned $($item.name) v$($item.version) from Microsoft."
    Invoke-WebRequest -UseBasicParsing -Uri $item.url -OutFile $cachePath
    $actual = (Get-FileHash -LiteralPath $cachePath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  if ($actual -ne $item.sha256) { throw "WebView2 digest mismatch for $($item.filename): expected $($item.sha256), got $actual" }
  Copy-Item -LiteralPath $cachePath -Destination (Join-Path $OutputRoot $item.filename) -Force
}
Write-Host "Verified x64 and ARM64 offline WebView2 installers in $OutputRoot."
