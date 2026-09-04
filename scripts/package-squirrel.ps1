#!powershell

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string]$PayloadRoot,
    [Parameter(Mandatory = $true)][string]$OutputRoot,
    [Parameter(Mandatory = $true)][ValidateSet('x64', 'arm64')][string]$Architecture,
    [Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedCommit,
    [Parameter(Mandatory = $true)][string]$SquirrelPath,
    [Parameter(Mandatory = $true)][string]$IconPath,
    [switch]$KeepStaging
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
. (Join-Path $PSScriptRoot 'squirrel-contract.ps1')
$sourceState = Get-SquirrelSourceState $SourceRoot $ExpectedCommit
if ((Get-SquirrelVersion $SourceRoot $Version) -cne $Version) { throw 'Invalid package version.' }
$payloadReceiptPath = Get-ContainedPath $PayloadRoot 'payload-receipt.json'
$payloadReceipt = Get-Content -Raw -LiteralPath $payloadReceiptPath | ConvertFrom-Json
if ($payloadReceipt.schemaVersion -ne 1 -or $payloadReceipt.version -cne $Version -or $payloadReceipt.sourceCommit -cne $ExpectedCommit -or $payloadReceipt.sourceTree -cne $sourceState.sourceTree -or $payloadReceipt.indexTree -cne $sourceState.indexTree -or $payloadReceipt.dependencyManifestSha256 -cne $sourceState.dependencyManifestSha256) { throw 'Payload receipt does not match the current source and version.' }
$payloadFiles = @{}
foreach ($file in $payloadReceipt.files) {
    $absolute = Get-ContainedPath $PayloadRoot $file.path
    if ($payloadFiles.ContainsKey($absolute)) { throw 'Duplicate payload receipt path.' }
    if ((Get-Item -LiteralPath $absolute).Length -ne $file.size -or (Get-FileHash -LiteralPath $absolute -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.sha256) { throw 'Payload bytes differ from the build receipt.' }
    $payloadFiles[$absolute] = $true
}

$architectureDirectory = if ($Architecture -eq 'x64') { 'amd64' } else { 'arm64' }
$packageId = if ($Architecture -eq 'x64') { 'MaterialOllamaX64' } else { 'MaterialOllamaArm64' }
$appSource = Join-Path $PayloadRoot "windows-ollama-app-$architectureDirectory.exe"
$serverRoot = Join-Path $PayloadRoot "windows-$architectureDirectory"
$webviewName = if ($Architecture -eq 'x64') { 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe' } else { 'MicrosoftEdgeWebView2RuntimeInstallerARM64.exe' }
$webviewSource = Join-Path $PayloadRoot "webview2\$webviewName"
$entryPoint = 'ollama app.exe'

function Assert-NonEmptyFile {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Required Squirrel payload is missing: $Path" }
    $item = Get-Item -LiteralPath $Path
    if ($item.Length -le 0) { throw "Required Squirrel payload is empty: $Path" }
}

function Copy-PayloadFile {
    param([Parameter(Mandatory)][string]$Source, [Parameter(Mandatory)][string]$Destination)
    Assert-NonEmptyFile -Path $Source
    $absolute = [IO.Path]::GetFullPath($Source)
    Assert-NoReparsePath $absolute
    if ($absolute -cne [IO.Path]::GetFullPath($IconPath) -and -not $payloadFiles.ContainsKey($absolute)) { throw "Unreceipted payload file: $Source" }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Get-FileSha1 {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA1).Hash.ToLowerInvariant()
}

function Read-ReleasesRows {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return @() }
    $rows = @()
    foreach ($line in (Get-Content -LiteralPath $Path)) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
        $parts = $line -split '\s+', 3
        if ($parts.Count -ne 3 -or $parts[0] -notmatch '^[0-9a-fA-F]{40}$' -or $parts[1] -notmatch '\.nupkg$' -or $parts[2] -notmatch '^\d+$') {
            return @()
        }
        $rows += [pscustomobject]@{ Sha1 = $parts[0].ToLowerInvariant(); Length = [int64]$parts[2]; Name = [IO.Path]::GetFileName($parts[1]) }
    }
    return $rows
}

function Get-ValidPriorPackage {
    param([Parameter(Mandatory)][string]$Path)
    $releases = Join-Path $Path 'RELEASES'
    $rows = @(Read-ReleasesRows -Path $releases)
    if ($rows.Count -lt 1) { return $null }
    $full = @($rows | Where-Object { $_.Name -match "^$packageId-(\d+\.\d+\.\d+)-full[.]nupkg$" } | Sort-Object { [version]([regex]::Match($_.Name, '-(\d+\.\d+\.\d+)-full').Groups[1].Value) } | Select-Object -Last 1)
    if ($full.Count -ne 1) { return $null }
    $package = Join-Path $Path $full[0].Name
    if (-not (Test-Path -LiteralPath $package -PathType Leaf)) { return $null }
    $item = Get-Item -LiteralPath $package
    if ($item.Length -ne $full[0].Length -or (Get-FileSha1 -Path $package) -ne $full[0].Sha1) { return $null }
    $priorVersion = [version]([regex]::Match($full[0].Name, '-(\d+\.\d+\.\d+)-full').Groups[1].Value)
    if ([version]$Version -le $priorVersion) { throw 'New package version must be greater than the validated prior version.' }
    return $full[0]
}

function Write-NuGetPackage {
    param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string]$Destination)
    $archive = [IO.Compression.ZipFile]::Open($Destination, [IO.Compression.ZipArchiveMode]::Create)
    try {
        $rootFull = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\') + '\'
        foreach ($file in (Get-ChildItem -LiteralPath $Root -File -Recurse)) {
            $relative = $file.FullName.Substring($rootFull.Length).Replace('\', '/')
            $entry = $archive.CreateEntry($relative, [IO.Compression.CompressionLevel]::Optimal)
            $input = [IO.File]::OpenRead($file.FullName)
            $output = $entry.Open()
            try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }
        }
    } finally { $archive.Dispose() }
}

Assert-NonEmptyFile -Path $appSource
Assert-NonEmptyFile -Path (Join-Path $serverRoot 'ollama.exe')
Assert-NonEmptyFile -Path (Join-Path $serverRoot 'lib\ollama\llama-server.exe')
Assert-NonEmptyFile -Path $webviewSource
Assert-NonEmptyFile -Path $IconPath
if (-not (Test-Path -LiteralPath $SquirrelPath -PathType Leaf)) { throw "Squirrel.Windows executable is missing: $SquirrelPath" }

$resolvedOutput = Get-ContainedPath $SourceRoot "dist/squirrel-windows/$Architecture"
if ([IO.Path]::GetFullPath($OutputRoot) -ine $resolvedOutput) { throw 'OutputRoot must be the architecture directory under dist/squirrel-windows.' }
$parentOutput = Split-Path -Parent $resolvedOutput
$stagingRoot = Join-Path ([IO.Path]::GetTempPath()) ('material-ollama-squirrel-' + [guid]::NewGuid().ToString('N'))
$packageRoot = Join-Path $stagingRoot 'package'
$packageLib = Join-Path $packageRoot 'lib\net45'
$priorRoot = Join-Path $stagingRoot 'prior'
$packagePath = Join-Path $stagingRoot "$packageId-$Version.nupkg"
$hadPrior = $false
$candidateOutput = Join-Path $parentOutput ('.candidate-' + $Architecture + '-' + [guid]::NewGuid().ToString('N'))
$backupOutput = Join-Path $parentOutput ('.previous-' + $Architecture + '-' + [guid]::NewGuid().ToString('N'))
$promoted = $false
$oldEnv = @{}
foreach ($key in @('KEY_CONTAINER', 'OLLAMA_CERT', 'SIGN_TOOL', 'CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK')) { $oldEnv[$key] = [Environment]::GetEnvironmentVariable($key) }

try {
    New-Item -ItemType Directory -Force -Path $packageLib, $priorRoot, $parentOutput | Out-Null

    $prior = Get-ValidPriorPackage -Path $resolvedOutput
    if ($prior) {
        $hadPrior = $true
        [IO.File]::WriteAllText((Join-Path $priorRoot 'RELEASES'), "$($prior.Sha1) $($prior.Name) $($prior.Length)`n", (New-Object Text.UTF8Encoding($false)))
        Copy-Item -LiteralPath (Join-Path $resolvedOutput $prior.Name) -Destination (Join-Path $priorRoot $prior.Name) -Force
        Write-Output "Preserving validated prior Squirrel package for delta generation: $($prior.Name)"
    } else {
        Write-Output 'No validated prior Squirrel package pair found; delta generation is disabled for this build.'
    }

    Copy-PayloadFile -Source $appSource -Destination (Join-Path $packageLib $entryPoint)
    Copy-PayloadFile -Source (Join-Path $serverRoot 'ollama.exe') -Destination (Join-Path $packageLib 'ollama.exe')
    Copy-PayloadFile -Source (Join-Path $serverRoot 'lib\ollama\llama-server.exe') -Destination (Join-Path $packageLib 'lib\ollama\llama-server.exe')
    $runtimeFiles = Get-ChildItem -LiteralPath $serverRoot -File -Recurse
    foreach ($runtime in $runtimeFiles) {
        $relative = $runtime.FullName.Substring($serverRoot.Length).TrimStart('\', '/')
        Copy-PayloadFile -Source $runtime.FullName -Destination (Join-Path $packageLib $relative)
    }
    Copy-PayloadFile -Source $IconPath -Destination (Join-Path $packageLib 'app.ico')
    Copy-PayloadFile -Source $webviewSource -Destination (Join-Path $packageLib (Join-Path 'webview2' $webviewName))
    foreach ($binary in (Get-ChildItem -LiteralPath $packageLib -File -Recurse | Where-Object { $_.Extension -in @('.exe', '.dll') -and $_.DirectoryName -notlike '*\webview2' })) { $null = Assert-PeFile $binary.FullName $Architecture }
    Write-SquirrelJson (Join-Path $packageLib 'package-version.json') ([ordered]@{ schemaVersion = 1; version = $Version; sourceCommit = $ExpectedCommit; architecture = $Architecture; packageId = $packageId; entryPoint = $entryPoint })

    $nuspec = @"
<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://schemas.microsoft.com/packaging/2013/05/nuspec.xsd">
  <metadata>
    <id>$packageId</id>
    <version>$Version</version>
    <title>Material Ollama</title>
    <authors>Ollama</authors>
    <owners>Ollama</owners>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <description>Material Ollama native Windows payload for $Architecture.</description>
    <projectUrl>https://ollama.com/</projectUrl>
    <releaseNotes>Source commit $($ExpectedCommit.ToLowerInvariant()); unsigned Squirrel.Windows package.</releaseNotes>
  </metadata>
</package>
"@
    [IO.File]::WriteAllText((Join-Path $packageRoot 'package.nuspec'), $nuspec.TrimStart(), (New-Object Text.UTF8Encoding($false)))
    $relsRoot = Join-Path $packageRoot '_rels'
    New-Item -ItemType Directory -Force -Path $relsRoot | Out-Null
    $rels = '<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.microsoft.com/packaging/2010/07/manifest" Target="/package.nuspec" Id="RMaterialOllamaManifest" /></Relationships>'
    [IO.File]::WriteAllText((Join-Path $relsRoot '.rels'), $rels, (New-Object Text.UTF8Encoding($false)))
    $types = '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="nuspec" ContentType="application/octet" /><Default Extension="exe" ContentType="application/octet" /><Default Extension="dll" ContentType="application/octet" /><Default Extension="ico" ContentType="image/x-icon" /></Types>'
    $typesXml = [xml]$types
    foreach ($extension in @(Get-ChildItem -LiteralPath $packageLib -File -Recurse | ForEach-Object { $_.Extension.TrimStart('.').ToLowerInvariant() } | Sort-Object -Unique)) {
        if ($extension -and $extension -notin @('rels', 'nuspec', 'exe', 'dll', 'ico')) {
            $node = $typesXml.CreateElement('Default', $typesXml.DocumentElement.NamespaceURI)
            $node.SetAttribute('Extension', $extension)
            $node.SetAttribute('ContentType', 'application/octet-stream')
            $null = $typesXml.DocumentElement.AppendChild($node)
        }
    }
    $types = $typesXml.OuterXml
    [IO.File]::WriteAllText((Join-Path $packageRoot '[Content_Types].xml'), $types, (New-Object Text.UTF8Encoding($false)))
    Write-NuGetPackage -Root $packageRoot -Destination $packagePath
    Assert-NonEmptyFile -Path $packagePath

    New-Item -ItemType Directory -Path $candidateOutput | Out-Null
    if ($hadPrior) {
        Copy-Item -LiteralPath (Join-Path $priorRoot 'RELEASES') -Destination (Join-Path $candidateOutput 'RELEASES') -Force
        Copy-Item -LiteralPath (Join-Path $priorRoot $prior.Name) -Destination (Join-Path $candidateOutput $prior.Name) -Force
    }

    foreach ($key in $oldEnv.Keys) { [Environment]::SetEnvironmentVariable($key, $null) }
    # Start-Process does not quote ArgumentList members for the child parser.
    # Quote every path-bearing option because the default Documents location
    # contains a space in its checkout parent directory.
    $releasifyArgs = @('--releasify="' + $packagePath + '"', '--releaseDir="' + $candidateOutput + '"', '--no-msi', '--icon="' + $IconPath + '"', '--setupIcon="' + $IconPath + '"')
    if (-not $hadPrior) { $releasifyArgs += '--no-delta' }
    Write-Output "Running Squirrel.Windows releasify for $packageId $Version ($Architecture)"
    $stdoutPath = Join-Path $stagingRoot 'squirrel.stdout.log'
    $stderrPath = Join-Path $stagingRoot 'squirrel.stderr.log'
    $process = Start-Process -FilePath $SquirrelPath -ArgumentList $releasifyArgs -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    if ($process.ExitCode -ne 0) {
        $details = @()
        if (Test-Path -LiteralPath $stderrPath) { $details += Get-Content -LiteralPath $stderrPath }
        if (Test-Path -LiteralPath $stdoutPath) { $details += Get-Content -LiteralPath $stdoutPath }
        throw "Squirrel.Windows releasify failed for $Architecture with exit code $($process.ExitCode): $($details -join ' ')"
    }

    $setup = Get-ChildItem -LiteralPath $candidateOutput -File -Filter '*Setup.exe' | Select-Object -First 1
    if (-not $setup) { throw "Squirrel.Windows releasify produced no setup executable under $resolvedOutput." }
    Assert-NonEmptyFile -Path $setup.FullName
    $fullPackage = Get-Item -LiteralPath (Join-Path $candidateOutput "$packageId-$Version-full.nupkg")
    if (-not $fullPackage) { throw "Squirrel.Windows releasify produced no full package for $packageId $Version." }

    $provenance = [ordered]@{
        schemaVersion = 1
        packageId = $packageId
        version = $Version
        architecture = $Architecture
        sourceCommit = $ExpectedCommit.ToLowerInvariant()
        entryPoint = $entryPoint
        setupFile = $setup.Name
        fullPackage = $fullPackage.Name
        fullPackageSha256 = (Get-FileHash -LiteralPath $fullPackage.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        fullPackageLength = (Get-Item -LiteralPath $fullPackage.FullName).Length
        deltaGenerated = [bool]($hadPrior -and @(Get-ChildItem -LiteralPath $candidateOutput -File -Filter '*-delta.nupkg').Count -gt 0)
        sourceTree = $sourceState.sourceTree
        indexTree = $sourceState.indexTree
        dependencyManifestSha256 = $sourceState.dependencyManifestSha256
        payloadReceiptSha256 = (Get-FileHash -LiteralPath $payloadReceiptPath -Algorithm SHA256).Hash.ToLowerInvariant()
        signing = 'disabled'
        generatedBy = 'scripts/package-squirrel.ps1'
    }
    $provenancePath = Join-Path $candidateOutput 'build-provenance.json'
    $provenance | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $provenancePath -Encoding UTF8
    & (Join-Path $PSScriptRoot 'verify-squirrel-artifacts.ps1') -ArtifactDirectory $candidateOutput -ProvenancePath $provenancePath -ExpectedCommit $ExpectedCommit -SetupFile $setup.Name -ExpectedPackageId $packageId -ExpectedVersion $Version -ExpectedArchitecture $Architecture -RequiredPackageEntry 'lib/net45/ollama app.exe' -OutputPath (Join-Path $candidateOutput 'artifact-receipt.json')
    $null = Get-SquirrelSourceState $SourceRoot $ExpectedCommit
    Assert-NoReparsePath $resolvedOutput
    if (Test-Path -LiteralPath $resolvedOutput) { Move-Item -LiteralPath $resolvedOutput -Destination $backupOutput }
    try { Move-Item -LiteralPath $candidateOutput -Destination $resolvedOutput; $promoted = $true } catch {
        if ((Test-Path -LiteralPath $backupOutput) -and -not (Test-Path -LiteralPath $resolvedOutput)) { Move-Item -LiteralPath $backupOutput -Destination $resolvedOutput }
        throw
    }
    Write-Output "Squirrel.Windows package verified: $($setup.Name), $($fullPackage.Name), RELEASES, architecture=$Architecture"
    Write-Output "Build provenance: $(Join-Path $resolvedOutput 'build-provenance.json')"
    if (Test-Path -LiteralPath $backupOutput) { Write-Output "Previous verified output retained at $backupOutput" }
} finally {
    foreach ($key in $oldEnv.Keys) { [Environment]::SetEnvironmentVariable($key, $oldEnv[$key]) }
    if (-not $KeepStaging -and (Test-Path -LiteralPath $stagingRoot)) { Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
