#!powershell

[CmdletBinding()]
param(
    [string]$BootstrapScript = ''
)

$ErrorActionPreference = 'Stop'
if (-not $BootstrapScript) { $BootstrapScript = Join-Path $PSScriptRoot 'bootstrap_windows_tools.ps1' }
Add-Type -AssemblyName System.IO.Compression.FileSystem

$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path -LiteralPath $BootstrapScript),
    [ref]$tokens,
    [ref]$parseErrors
)
if ($parseErrors.Count -gt 0) { throw "Tool bootstrap script could not be parsed: $($parseErrors[0].Message)" }

foreach ($functionName in @('Normalize-PathForComparison', 'Get-ToolMarker', 'Expand-VerifiedZip', 'Install-UserTool')) {
    $functionAst = $ast.FindAll({
            param($node)
            $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                $node.Name -eq $functionName
        }, $true) | Select-Object -First 1
    if (-not $functionAst) { throw "Tool bootstrap script is missing '$functionName'." }
    . ([scriptblock]::Create($functionAst.Extent.Text))
}

# Keep the lifecycle fixture offline and deterministic while exercising the
# real staging, marker, and publish code from bootstrap_windows_tools.ps1.
$script:ProbeRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-ollama-tool-install-probe-" + [guid]::NewGuid().ToString('N'))
$script:FixtureByUrl = @{}
$script:DownloadCounter = 0

function Get-ToolVersion {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][ValidateSet('CMake', 'Ninja')][string]$Kind
    )
    if ($Kind -eq 'CMake') { return '4.4.2' }
    return $null
}

function Get-DownloadPath {
    param([Parameter(Mandatory)][string]$Url)
    $script:DownloadCounter += 1
    return Join-Path $script:ProbeRoot ("download-$($script:DownloadCounter).zip")
}

function Download-VerifiedAsset {
    param(
        [Parameter(Mandatory)]$Dependency,
        [Parameter(Mandatory)][string]$Path
    )
    Copy-Item -LiteralPath $script:FixtureByUrl[[string]$Dependency.user.url] -Destination $Path -Force
}

function New-ZipFixture {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$ArchiveRoot,
        [Parameter(Mandatory)][string]$RelativeExecutable,
        [Parameter(Mandatory)][bool]$IncludeExecutable,
        [int]$EntryCount = 0
    )
    $sourceRoot = Join-Path $script:ProbeRoot ("source-$Name")
    $relativeFile = if ($IncludeExecutable) { $RelativeExecutable } else { 'missing.txt' }
    $filePath = Join-Path $sourceRoot (Join-Path $ArchiveRoot $relativeFile)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $filePath) | Out-Null
    Set-Content -LiteralPath $filePath -Value 'fixture' -Encoding ASCII
    for ($index = 0; $index -lt $EntryCount; $index += 1) {
        $manyEntry = Join-Path $sourceRoot (Join-Path $ArchiveRoot ("fixture-data\entry-$index.txt"))
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $manyEntry) | Out-Null
        Set-Content -LiteralPath $manyEntry -Value "entry-$index" -Encoding ASCII
    }
    $zipPath = Join-Path $script:ProbeRoot ("$Name.zip")
    Compress-Archive -LiteralPath (Join-Path $sourceRoot $ArchiveRoot) -DestinationPath $zipPath -Force
    Remove-Item -LiteralPath $sourceRoot -Recurse -Force
    return $zipPath
}

$fixtures = @(
    [pscustomobject]@{
        name = 'CMake'
        version = '4.4.2'
        directory = 'cmake-4.4.2'
        archiveRoot = 'cmake-4.4.2-windows-x86_64'
        relativeExecutable = 'bin/cmake.exe'
        url = 'https://example.invalid/cmake.zip'
        entryCount = 512
    },
    [pscustomobject]@{
        name = 'llvm-mingw'
        version = '20260616-ucrt-x86_64'
        directory = 'llvm-mingw-20260616-ucrt-x86_64'
        archiveRoot = 'llvm-mingw-20260616-ucrt-x86_64'
        relativeExecutable = 'bin/x86_64-w64-mingw32-gcc.exe'
        url = 'https://example.invalid/llvm-mingw.zip'
        entryCount = 0
    }
)

try {
    New-Item -ItemType Directory -Force -Path $script:ProbeRoot | Out-Null
    $toolRoot = Join-Path $script:ProbeRoot 'toolchain'
    New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
    foreach ($fixture in $fixtures) {
        $dependency = [pscustomobject]@{
            name = [string]$fixture.name
            version = [string]$fixture.version
            user = [pscustomobject]@{
                directory = [string]$fixture.directory
                archiveRoot = [string]$fixture.archiveRoot
                relativeExecutable = [string]$fixture.relativeExecutable
                url = [string]$fixture.url
                sha256 = ('0' * 64)
                archive = 'zip'
            }
        }
        $bad = New-ZipFixture -Name ("$($fixture.name)-bad") -ArchiveRoot $fixture.archiveRoot -RelativeExecutable $fixture.relativeExecutable -IncludeExecutable $false -EntryCount 0
        $good = New-ZipFixture -Name ("$($fixture.name)-good") -ArchiveRoot $fixture.archiveRoot -RelativeExecutable $fixture.relativeExecutable -IncludeExecutable $true -EntryCount ([int]$fixture.entryCount)
        $script:FixtureByUrl[[string]$fixture.url] = $bad
        $candidateRoot = Join-Path $toolRoot $fixture.directory
        $failed = $false
        try { [void](Install-UserTool -Dependency $dependency -ToolRoot $toolRoot) } catch { $failed = $true }
        if (-not $failed) { throw "Expected the incomplete cold-cache $($fixture.name) archive to fail." }
        if (Test-Path -LiteralPath $candidateRoot) { throw "Failed $($fixture.name) install left a candidate directory that blocks retry: $candidateRoot" }

        $script:FixtureByUrl[[string]$fixture.url] = $good
        $result = Install-UserTool -Dependency $dependency -ToolRoot $toolRoot
        $expectedExecutable = Join-Path $candidateRoot $fixture.relativeExecutable
        if (-not $result -or $result.Executable -ne $expectedExecutable -or -not (Test-Path -LiteralPath $expectedExecutable -PathType Leaf)) {
            throw "Valid cold-cache $($fixture.name) archive did not publish its declared executable."
        }
        if ([int]$fixture.entryCount -gt 0 -and @(Get-ChildItem -LiteralPath $candidateRoot -Recurse -File).Count -lt ([int]$fixture.entryCount + 1)) {
            throw "Valid cold-cache $($fixture.name) many-entry archive did not fully extract."
        }
        Remove-Item -LiteralPath $candidateRoot -Recurse -Force
    }
    Write-Output 'PASS: cold-cache CMake and LLVM-MinGW installs reject incomplete archives, leave no blocking candidate, and retry successfully.'
} finally {
    if (Test-Path -LiteralPath $script:ProbeRoot) {
        Remove-Item -LiteralPath $script:ProbeRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
