#!powershell

[CmdletBinding()]
param(
    [string]$BootstrapScript = ''
)

$ErrorActionPreference = 'Stop'
if (-not $BootstrapScript) { $BootstrapScript = Join-Path $PSScriptRoot 'bootstrap_windows_tools.ps1' }

if (-not (Test-Path -LiteralPath $BootstrapScript -PathType Leaf)) {
    throw "Bootstrap script was not found: $BootstrapScript"
}

$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path -LiteralPath $BootstrapScript),
    [ref]$tokens,
    [ref]$parseErrors
)
if ($parseErrors.Count -gt 0) {
    throw "Bootstrap script could not be parsed: $($parseErrors[0].Message)"
}

foreach ($functionName in @('Normalize-PathForComparison', 'Get-ToolMarker')) {
    $functionAst = $ast.FindAll({
            param($node)
            $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                $node.Name -eq $functionName
        }, $true) | Select-Object -First 1
    if (-not $functionAst) {
        throw "Bootstrap script is missing required function '$functionName'."
    }
    . ([scriptblock]::Create($functionAst.Extent.Text))
}

function Get-ToolVersion {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][ValidateSet('CMake', 'Ninja')][string]$Kind
    )
    if ($Kind -eq 'CMake') { return 'probe-cmake' }
    return $null
}

$probeRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-ollama-tool-marker-probe-" + [guid]::NewGuid().ToString('N'))
try {
    $fixtures = @(
        [pscustomobject]@{
            name = 'llvm-mingw'
            version = 'probe'
            directory = 'llvm-mingw-probe'
            relativeExecutable = 'bin/x86_64-w64-mingw32-gcc.exe'
            url = 'https://example.invalid/llvm-mingw-probe.zip'
        },
        [pscustomobject]@{
            name = 'CMake'
            version = 'probe-cmake'
            directory = 'cmake-probe'
            relativeExecutable = 'bin/cmake.exe'
            url = 'https://example.invalid/cmake-probe.zip'
        }
    )
    foreach ($fixture in $fixtures) {
        $candidateRoot = Join-Path $probeRoot $fixture.directory
        $relativeExecutable = [string]$fixture.relativeExecutable
        $executable = Join-Path $candidateRoot $relativeExecutable
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $executable) | Out-Null
        New-Item -ItemType File -Path $executable | Out-Null

        $dependency = [pscustomobject]@{
            name = [string]$fixture.name
            version = [string]$fixture.version
            user = [pscustomobject]@{
                directory = [string]$fixture.directory
                relativeExecutable = $relativeExecutable
                url = [string]$fixture.url
                sha256 = ('0' * 64)
            }
        }
        $marker = [ordered]@{
            schemaVersion = 1
            name = [string]$dependency.name
            version = [string]$dependency.version
            origin = 'official-release-asset'
            sourceUrl = [string]$dependency.user.url
            archiveSha256 = [string]$dependency.user.sha256
            root = [IO.Path]::GetFullPath($candidateRoot)
            relativeExecutable = [string]$dependency.user.relativeExecutable
            verifiedBy = 'scripts/bootstrap_windows_tools.ps1'
        }
        $markerPath = Join-Path $candidateRoot 'material-ollama-toolchain.json'
        $marker | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $markerPath -Encoding utf8

        $result = Get-ToolMarker -ToolRoot $probeRoot -Dependency $dependency
        if (-not $result -or $result.Executable -ne $executable -or $result.Origin -ne 'verified-user-archive') {
            throw "Get-ToolMarker returned an unexpected result for valid $($fixture.name) marker fixture."
        }
        Remove-Item -LiteralPath $candidateRoot -Recurse -Force
    }
    Write-Output 'PASS: Get-ToolMarker accepted valid CMake and LLVM-MinGW user-scoped marker fixtures.'
} finally {
    if (Test-Path -LiteralPath $probeRoot) {
        Remove-Item -LiteralPath $probeRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
