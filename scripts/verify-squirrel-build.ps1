#!powershell

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OutputRoot,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedCommit
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'squirrel-contract.ps1')
$verify = Join-Path $PSScriptRoot 'verify-squirrel-artifacts.ps1'
if (-not (Test-Path -LiteralPath $verify -PathType Leaf)) { throw "Squirrel verifier is missing: $verify" }
$resolvedRoot = (Resolve-Path -LiteralPath $OutputRoot -ErrorAction Stop).Path
Assert-NoReparsePath $resolvedRoot
$releaseRoot = Get-ContainedPath $resolvedRoot ('release-assets-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $releaseRoot | Out-Null
$manifest = [ordered]@{ schemaVersion = 1; version = ''; sourceCommit = $ExpectedCommit; architectures = [ordered]@{} }
function Get-AssetRecord([string]$Path) {
    $item = Get-Item -LiteralPath $Path
    return [ordered]@{ name = $item.Name; sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant(); size = $item.Length }
}
foreach ($architecture in @('x64', 'arm64')) {
    $dir = Join-Path $resolvedRoot $architecture
    $provenancePath = Join-Path $dir 'build-provenance.json'
    if (-not (Test-Path -LiteralPath $provenancePath -PathType Leaf)) { throw "Missing Squirrel build provenance for $($architecture): $provenancePath" }
    $provenance = Get-Content -Raw -LiteralPath $provenancePath | ConvertFrom-Json
    if ([string]$provenance.architecture -cne $architecture) { throw "Squirrel provenance architecture mismatch in $provenancePath" }
    $packageId = if ($architecture -eq 'x64') { 'MaterialOllamaX64' } else { 'MaterialOllamaArm64' }
    if ($manifest.version -and $manifest.version -cne $provenance.version) { throw 'Architectures must share one package version.' }
    $manifest.version = [string]$provenance.version
    & (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -NoProfile -ExecutionPolicy Bypass -File $verify `
        -ArtifactDirectory $dir `
        -ProvenancePath $provenancePath `
        -ExpectedCommit $ExpectedCommit `
        -SetupFile ([string]$provenance.setupFile) `
        -ExpectedPackageId $packageId `
        -ExpectedVersion ([string]$provenance.version) `
        -ExpectedArchitecture $architecture `
        -RequiredPackageEntry 'lib/net45/ollama app.exe' `
        -OutputPath (Join-Path $dir 'artifact-receipt.json')
    if ($LASTEXITCODE -ne 0) { throw "Squirrel artifact verification failed for $architecture with exit code $LASTEXITCODE" }
    $setupName = "MaterialOllama-$architecture-Setup.exe"
    Copy-Item -LiteralPath (Get-ContainedPath $dir $provenance.setupFile) -Destination (Join-Path $releaseRoot $setupName)
    $packages = @()
    $rows = @()
    foreach ($kind in @('full', 'delta')) {
        $name = "$packageId-$($manifest.version)-$kind.nupkg"
        $package = Get-ContainedPath $dir $name
        if (-not (Test-Path -LiteralPath $package)) { if ($kind -eq 'full') { throw 'Current full package missing.' }; continue }
        Copy-Item -LiteralPath $package -Destination (Join-Path $releaseRoot $name)
        $record = Get-AssetRecord $package
        $record.sha1 = (Get-FileHash -LiteralPath $package -Algorithm SHA1).Hash.ToLowerInvariant()
        $record.kind = $kind
        $packages += $record
        $rows += "$($record.sha1) $name $($record.size)"
    }
    $releaseName = "MaterialOllama-$architecture-RELEASES"
    [IO.File]::WriteAllText((Join-Path $releaseRoot $releaseName), ($rows -join "`n") + "`n", (New-Object Text.UTF8Encoding($false)))
    $manifest.architectures[$architecture] = [ordered]@{
        packageId = $packageId
        setup = Get-AssetRecord (Join-Path $releaseRoot $setupName)
        releases = Get-AssetRecord (Join-Path $releaseRoot $releaseName)
        packages = $packages
    }
}
Write-SquirrelJson (Join-Path $releaseRoot 'material-ollama-update.json') $manifest
if ((Get-Item -LiteralPath (Join-Path $releaseRoot 'material-ollama-update.json')).Length -gt 65536) { throw 'Update manifest exceeds 64 KiB.' }
& node (Join-Path $PSScriptRoot 'check-release-assets.mjs') --squirrel-dir $releaseRoot $ExpectedCommit
if ($LASTEXITCODE -ne 0) { throw 'Generated update manifest failed byte validation.' }
$pointer = Join-Path $resolvedRoot 'release-assets-path.txt'
[IO.File]::WriteAllText($pointer, (Split-Path -Leaf $releaseRoot), (New-Object Text.UTF8Encoding($false)))
Write-Output "Squirrel.Windows x64 and arm64 outputs verified under $resolvedRoot."
Write-Output "Release assets: $releaseRoot"
