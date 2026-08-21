#!powershell

[CmdletBinding()]
param(
    [string]$SourceRoot = ''
)

$ErrorActionPreference = 'Stop'
if (-not $SourceRoot) { $SourceRoot = Split-Path -Parent $PSScriptRoot }

# Disable implicit module discovery for this proof. Every production helper
# below must carry its own explicit import before its first hash call.
$PSModuleAutoloadingPreference = 'None'
$utilityModulePath = Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
if (-not (Test-Path -LiteralPath $utilityModulePath -PathType Leaf)) { throw "Microsoft.PowerShell.Utility module manifest was not found under PSHOME: $utilityModulePath" }
Import-Module -Name $utilityModulePath -Force -ErrorAction Stop

$hashScripts = @(
    'scripts/bootstrap_windows_tools.ps1',
    'scripts/build_windows.ps1',
    'scripts/fetch-webview2.ps1',
    'scripts/install.ps1',
    'scripts/verify-installer-artifact.ps1',
    'scripts/verify-unsigned-installer.ps1'
)
$importLine = 'Import-Module -Name $utilityModulePath -Force -ErrorAction Stop'
foreach ($relative in $hashScripts) {
    $path = Join-Path $SourceRoot $relative
    $source = Get-Content -Raw -LiteralPath $path
    $hashIndex = $source.IndexOf('Get-FileHash', [StringComparison]::Ordinal)
    $importIndex = $source.IndexOf($importLine, [StringComparison]::Ordinal)
    if ($hashIndex -lt 0 -or $importIndex -lt 0 -or $importIndex -gt $hashIndex) {
        throw "$relative must explicitly import Microsoft.PowerShell.Utility before Get-FileHash."
    }
}

$probe = Join-Path ([IO.Path]::GetTempPath()) ("material-ollama-hash-module-probe-" + [guid]::NewGuid().ToString('N') + '.txt')
try {
    Set-Content -LiteralPath $probe -Value 'hash-module-probe' -Encoding UTF8
    $hash = (Get-FileHash -LiteralPath $probe -Algorithm SHA256 -ErrorAction Stop).Hash
    if ([string]::IsNullOrWhiteSpace($hash)) { throw 'Explicit Microsoft.PowerShell.Utility import did not provide Get-FileHash.' }
    Write-Output 'PASS: no-profile hash-module fixture verified explicit imports before every production Get-FileHash call.'
} finally {
    Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
}
