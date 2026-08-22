[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $Path,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string] $ExpectedCommit
)

$ErrorActionPreference = 'Stop'
$utilityModulePath = Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
if (-not (Test-Path -LiteralPath $utilityModulePath -PathType Leaf)) { throw "Microsoft.PowerShell.Utility module manifest was not found under PSHOME: $utilityModulePath" }
Import-Module -Name $utilityModulePath -Force -ErrorAction Stop
$resolvedPath = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
$file = Get-Item -LiteralPath $resolvedPath -ErrorAction Stop
if ($file.Length -le 0) { throw "Installer artifact is empty: $resolvedPath" }

function Read-ExactBytes {
    param(
        [Parameter(Mandatory)][IO.FileStream]$Stream,
        [Parameter(Mandatory)][byte[]]$Buffer
    )
    $offset = 0
    while ($offset -lt $Buffer.Length) {
        $count = $Stream.Read($Buffer, $offset, $Buffer.Length - $offset)
        if ($count -le 0) { return $false }
        $offset += $count
    }
    return $true
}

$stream = $null
try {
    # Only the DOS header and four-byte PE signature are read. The offset is
    # bounded before seeking, so a malformed file cannot force an unbounded
    # allocation or seek; Get-FileHash below remains streaming as well.
    $stream = [IO.File]::OpenRead($resolvedPath)
    if ($stream.Length -lt 64) { throw "Installer artifact is not a PE file with a complete MZ header: $resolvedPath" }
    $dosHeader = New-Object byte[] 64
    if (-not (Read-ExactBytes -Stream $stream -Buffer $dosHeader) -or $dosHeader[0] -ne 0x4d -or $dosHeader[1] -ne 0x5a) {
        throw "Installer artifact is not a PE file with an MZ header: $resolvedPath"
    }
    $peOffset = [BitConverter]::ToInt32($dosHeader, 0x3c)
    $maximumHeaderOffset = [Math]::Min($stream.Length - 4, 16MB)
    if ($peOffset -lt 64 -or $peOffset -gt $maximumHeaderOffset) {
        throw "Installer artifact PE header offset is outside the bounded header range: $resolvedPath"
    }
    $stream.Position = $peOffset
    $peHeader = New-Object byte[] 4
    if (-not (Read-ExactBytes -Stream $stream -Buffer $peHeader) -or $peHeader[0] -ne 0x50 -or $peHeader[1] -ne 0x45 -or $peHeader[2] -ne 0 -or $peHeader[3] -ne 0) {
        throw "Installer artifact is not a PE file with a valid PE signature: $resolvedPath"
    }
} finally {
    if ($null -ne $stream) { $stream.Dispose() }
}

$expectedDescription = "MO build $($ExpectedCommit.ToLowerInvariant())"
$description = ([string]$file.VersionInfo.FileDescription).TrimEnd()
if ($description -ne $expectedDescription) {
    throw "Installer artifact provenance mismatch: expected FileDescription '$expectedDescription', got '$description'."
}

$hash = (Get-FileHash -LiteralPath $resolvedPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
if ([string]::IsNullOrWhiteSpace($hash)) { throw "Installer artifact SHA-256 is empty: $resolvedPath" }
Write-Output "Installer PE and intended commit verified: $($ExpectedCommit.ToLowerInvariant())"
Write-Output "Installer size: $($file.Length) bytes"
Write-Output "Installer path: $resolvedPath"
Write-Output "SHA-256: $hash"
