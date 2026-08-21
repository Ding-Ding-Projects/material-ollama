[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $Path
)

$ErrorActionPreference = 'Stop'
$utilityModulePath = Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
if (-not (Test-Path -LiteralPath $utilityModulePath -PathType Leaf)) { throw "Microsoft.PowerShell.Utility module manifest was not found under PSHOME: $utilityModulePath" }
Import-Module -Name $utilityModulePath -Force -ErrorAction Stop
$securityModulePath = Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1'
if (-not (Test-Path -LiteralPath $securityModulePath -PathType Leaf)) { throw "Microsoft.PowerShell.Security module manifest was not found under PSHOME: $securityModulePath" }
Import-Module -Name $securityModulePath -Force -ErrorAction Stop
$resolvedPath = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
$signature = Get-AuthenticodeSignature -LiteralPath $resolvedPath
$status = [string]$signature.Status
if ($status -cne 'NotSigned') {
    throw "Unsigned installer check failed: Authenticode status is '$status', expected exactly 'NotSigned'."
}

$file = Get-Item -LiteralPath $resolvedPath -ErrorAction Stop
$hash = (Get-FileHash -LiteralPath $resolvedPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
Write-Output "Unsigned installer verified (Status=NotSigned): $resolvedPath"
Write-Output "Size: $($file.Length) bytes"
Write-Output "SHA-256: $hash"
