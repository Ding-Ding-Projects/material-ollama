#!powershell

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ArtifactDirectory,
    [Parameter(Mandatory = $true)][string]$ProvenancePath,
    [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedCommit,
    [Parameter(Mandatory = $true)][string]$SetupFile,
    [Parameter(Mandatory = $true)][string]$ExpectedPackageId,
    [Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$')][string]$ExpectedVersion,
    [Parameter(Mandatory = $true)][ValidateSet('x64', 'arm64')][string]$ExpectedArchitecture,
    [Parameter(Mandatory = $true)][string]$RequiredPackageEntry,
    [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'squirrel-contract.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Fail([string]$Message) { throw "Squirrel artifact verification failed: $Message" }
function Resolve-SafeFile([string]$Root, [string]$Name) {
    if ([string]::IsNullOrWhiteSpace($Name) -or $Name -ne [IO.Path]::GetFileName($Name) -or $Name.Contains('/') -or $Name.Contains('\') -or $Name.Contains('..')) {
        Fail "unsafe file name '$Name'"
    }
    $path = Join-Path $Root $Name
    Assert-NoReparsePath $path
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Fail "missing file '$Name'" }
    return (Resolve-Path -LiteralPath $path).Path
}

$root = (Resolve-Path -LiteralPath $ArtifactDirectory -ErrorAction Stop).Path
Assert-NoReparsePath $root
$provenanceFile = (Resolve-Path -LiteralPath $ProvenancePath -ErrorAction Stop).Path
$expectedCommitLower = $ExpectedCommit.ToLowerInvariant()
$setupPath = Resolve-SafeFile -Root $root -Name $SetupFile
$releasesPath = Resolve-SafeFile -Root $root -Name 'RELEASES'

try { $provenance = Get-Content -Raw -LiteralPath $provenanceFile | ConvertFrom-Json } catch { Fail "provenance JSON is malformed" }
if ($provenance.schemaVersion -ne 1) { Fail 'provenance schemaVersion must be 1' }
if ([string]$provenance.packageId -cne $ExpectedPackageId) { Fail "provenance package ID is '$($provenance.packageId)', expected '$ExpectedPackageId'" }
if ([string]$provenance.version -cne $ExpectedVersion) { Fail "provenance version is '$($provenance.version)', expected '$ExpectedVersion'" }
if ([string]$provenance.architecture -cne $ExpectedArchitecture) { Fail "provenance architecture is '$($provenance.architecture)', expected '$ExpectedArchitecture'" }
if ([string]$provenance.sourceCommit -cne $expectedCommitLower) { Fail 'provenance source commit does not match expected commit' }
if ([string]$provenance.setupFile -cne $SetupFile) { Fail 'provenance setup file does not match requested setup file' }
if ([string]$provenance.signing -cne 'disabled') { Fail 'provenance signing state is not disabled' }

$setupItem = Get-Item -LiteralPath $setupPath
if ($setupItem.Length -lt 64) { Fail 'setup executable is empty or too small' }
$null = Assert-PeFile $setupPath ''
$setupSignature = Get-AuthenticodeSignature -LiteralPath $setupPath
if ([string]$setupSignature.Status -cne 'NotSigned') { Fail "setup executable Authenticode status is '$($setupSignature.Status)', expected 'NotSigned'" }

$rows = @()
foreach ($line in (Get-Content -LiteralPath $releasesPath)) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
    $parts = $line -split '\s+', 3
    if ($parts.Count -ne 3 -or $parts[0] -notmatch '^[0-9a-fA-F]{40}$' -or $parts[1] -notmatch '\.nupkg$' -or $parts[2] -notmatch '^\d+$') { Fail "malformed RELEASES row: $line" }
    $name = [string]$parts[1]
    if ($name -ne [IO.Path]::GetFileName($name) -or $name.Contains('/') -or $name.Contains('\') -or $name.Contains('..') -or $name -notmatch '\.nupkg$') { Fail "unsafe or non-package RELEASES member '$name'" }
    $rows += [pscustomobject]@{ Sha1 = $parts[0].ToLowerInvariant(); Length = [int64]$parts[2]; Name = $name }
}
if ($rows.Count -lt 1) { Fail 'RELEASES has no package rows' }
$duplicateRows = @($rows | Group-Object Name | Where-Object Count -gt 1)
if ($duplicateRows.Count -gt 0) { Fail "RELEASES contains duplicate package names: $($duplicateRows.Name -join ', ')" }

$packageFiles = @(Get-ChildItem -LiteralPath $root -File -Filter '*.nupkg')
foreach ($row in $rows) {
    $packagePath = Resolve-SafeFile -Root $root -Name $row.Name
    $item = Get-Item -LiteralPath $packagePath
    if ($item.Length -ne $row.Length) { Fail "RELEASES length mismatch for $($row.Name): row=$($row.Length), actual=$($item.Length)" }
    $actualSha1 = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA1).Hash.ToLowerInvariant()
    if ($actualSha1 -ne $row.Sha1) { Fail "RELEASES SHA-1 mismatch for $($row.Name): row=$($row.Sha1), actual=$actualSha1" }
}
foreach ($packageFile in $packageFiles) {
    if (-not @($rows | Where-Object Name -eq $packageFile.Name)) { Fail "unindexed package '$($packageFile.Name)'" }
}

$fullName = "$ExpectedPackageId-$ExpectedVersion-full.nupkg"
$fullPath = Resolve-SafeFile -Root $root -Name $fullName
$fullRow = @($rows | Where-Object Name -eq $fullName)
if ($fullRow.Count -ne 1) { Fail "RELEASES does not index the required full package '$fullName'" }
if ([string]$provenance.fullPackage -cne $fullName) { Fail 'provenance full package does not match the expected package' }
$fullHash = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ([string]$provenance.fullPackageSha256 -cne $fullHash) { Fail 'provenance full package SHA-256 does not match the package bytes' }
if ([int64]$provenance.fullPackageLength -ne (Get-Item -LiteralPath $fullPath).Length) { Fail 'provenance full package length does not match the package bytes' }

$zip = [IO.Compression.ZipFile]::OpenRead($fullPath)
try {
    if ($zip.Entries.Count -gt 20000) { Fail 'package entry count exceeds limit' }
    $entryNames = @($zip.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    if (@($entryNames | Group-Object { $_.ToLowerInvariant() } | Where-Object Count -gt 1).Count) { Fail 'package has duplicate case-insensitive paths' }
    foreach ($entry in $entryNames) {
        $parts = $entry.TrimEnd('/').Split('/')
        if ($entry.StartsWith('/') -or $entry.Contains(':') -or $parts -contains '..' -or $parts -contains '.' -or $entry.Contains('//')) { Fail "package contains path traversal entry '$entry'" }
    }
    $requiredNormal = $RequiredPackageEntry.Replace('\', '/').TrimStart('/')
    if (-not $entryNames.Contains($requiredNormal)) { Fail "required package entry '$RequiredPackageEntry' is missing" }
    $webviewName = if ($ExpectedArchitecture -eq 'x64') { 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe' } else { 'MicrosoftEdgeWebView2RuntimeInstallerARM64.exe' }
    foreach ($required in @('lib/net45/ollama app.exe', 'lib/net45/ollama.exe', 'lib/net45/lib/ollama/llama-server.exe', 'lib/net45/app.ico', 'lib/net45/package-version.json', "lib/net45/webview2/$webviewName")) {
        $item = $zip.GetEntry($required)
        if (-not $item -or $item.Length -le 0) { Fail "required package entry '$required' is missing or empty" }
    }
    foreach ($entry in $zip.Entries) {
        if ($entry.FullName -match '^lib/net45/.*[.](exe|dll)$' -and $entry.FullName -notmatch '^lib/net45/webview2/') {
            $stream = $entry.Open()
            $header = New-Object byte[] ([int][Math]::Min(65536, $entry.Length))
            try {
                $read = 0
                while ($read -lt $header.Length) { $n = $stream.Read($header, $read, $header.Length - $read); if ($n -eq 0) { break }; $read += $n }
                $memory = New-Object IO.MemoryStream(,$header)
                try { $machine = Get-PeMachine $memory } finally { $memory.Dispose() }
                $expectedMachine = if ($ExpectedArchitecture -eq 'x64') { 0x8664 } else { 0xaa64 }
                # Squirrel may add its x86 native execution stub to the package.
                if ($entry.Name -ne 'Squirrel.exe' -and $machine -ne $expectedMachine) { Fail "PE architecture mismatch for $($entry.FullName)" }
            } finally { $stream.Dispose() }
        }
    }
    $versionEntry = $zip.GetEntry('lib/net45/package-version.json')
    if ($versionEntry.Length -gt 4096) { Fail 'installed package version metadata exceeds limit' }
    $reader = New-Object IO.StreamReader($versionEntry.Open())
    try { $installedVersion = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    if ($installedVersion.schemaVersion -ne 1 -or $installedVersion.version -cne $ExpectedVersion -or $installedVersion.sourceCommit -cne $expectedCommitLower -or $installedVersion.packageId -cne $ExpectedPackageId -or $installedVersion.architecture -cne $ExpectedArchitecture -or $installedVersion.entryPoint -cne 'ollama app.exe') { Fail 'installed package version metadata does not match expected identity' }
    $manifestEntries = @($zip.Entries | Where-Object { $_.FullName -match '^[^/\\]+[.]nuspec$' })
    if ($manifestEntries.Count -ne 1) { Fail 'full package must have exactly one package manifest' }
    $manifestEntry = $manifestEntries[0]
    if (-not $manifestEntry) { Fail 'full package has no package manifest' }
    if ($manifestEntry.Length -gt 65536) { Fail 'package manifest exceeds limit' }
    $reader = New-Object IO.StreamReader($manifestEntry.Open())
    try { $manifestText = $reader.ReadToEnd() } finally { $reader.Dispose() }
} finally { $zip.Dispose() }

try {
    $settings = New-Object Xml.XmlReaderSettings
    $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $xmlReader = [Xml.XmlReader]::Create((New-Object IO.StringReader($manifestText)), $settings)
    $xml = New-Object Xml.XmlDocument
    $xml.XmlResolver = $null
    try { $xml.Load($xmlReader) } finally { $xmlReader.Dispose() }
} catch { Fail 'package manifest is malformed XML' }
$metadata = $xml.package.metadata
if (-not $metadata -or [string]$metadata.id -cne $ExpectedPackageId) { Fail 'package manifest ID does not match the expected package ID' }
if ([string]$metadata.version -cne $ExpectedVersion) { Fail 'package manifest version does not match the expected version' }
$description = [string]$metadata.description
if ($description -notmatch [regex]::Escape($ExpectedArchitecture)) { Fail 'package manifest architecture description does not match the expected architecture' }
$releaseNotes = [string]$metadata.releaseNotes
if ($releaseNotes -notmatch [regex]::Escape($expectedCommitLower)) { Fail 'package manifest release notes do not carry the expected source commit' }

$receipt = [ordered]@{
    schemaVersion = 1
    packageId = $ExpectedPackageId
    version = $ExpectedVersion
    architecture = $ExpectedArchitecture
    sourceCommit = $expectedCommitLower
    setupFile = $SetupFile
    setupLength = $setupItem.Length
    setupSha256 = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash.ToLowerInvariant()
    setupAuthenticode = [string]$setupSignature.Status
    releasesFile = 'RELEASES'
    releasesRows = @($rows | ForEach-Object { [ordered]@{ name = $_.Name; length = $_.Length; sha1 = $_.Sha1 } })
    fullPackage = $fullName
    fullPackageSha256 = $fullHash
    fullPackageLength = (Get-Item -LiteralPath $fullPath).Length
    requiredPackageEntry = $RequiredPackageEntry.Replace('\', '/')
    verified = $true
}
$outputFull = [IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputFull) | Out-Null
$receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outputFull -Encoding UTF8
Write-Output "Squirrel.Windows artifacts verified: package=$ExpectedPackageId version=$ExpectedVersion architecture=$ExpectedArchitecture setup=$SetupFile"
Write-Output "Receipt: $outputFull"
