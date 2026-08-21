#!powershell

[CmdletBinding()]
param(
    [string]$BootstrapScript = ''
)

$ErrorActionPreference = 'Stop'
if (-not $BootstrapScript) { $BootstrapScript = Join-Path $PSScriptRoot 'bootstrap_windows_prerequisites.ps1' }
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path -LiteralPath $BootstrapScript),
    [ref]$tokens,
    [ref]$parseErrors
)
if ($parseErrors.Count -gt 0) {
    throw "Prerequisite bootstrap script could not be parsed: $($parseErrors[0].Message)"
}

foreach ($functionName in @('Get-SevenZipVersion', 'Test-SevenZipCompatible')) {
    $functionAst = $ast.FindAll({
            param($node)
            $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
                $node.Name -eq $functionName
        }, $true) | Select-Object -First 1
    if (-not $functionAst) { throw "Prerequisite bootstrap script is missing '$functionName'." }
    . ([scriptblock]::Create($functionAst.Extent.Text))
}

$probeRoot = Join-Path ([IO.Path]::GetTempPath()) ("material-ollama-sevenzip-probe-" + [guid]::NewGuid().ToString('N'))
$manifestEntry = [pscustomobject]@{ version = '26.2.0' }
$cases = @(
    [pscustomobject]@{ name = 'missing'; output = $null; expectedVersion = $null; expectedCompatible = $false },
    [pscustomobject]@{ name = 'unparseable'; output = 'not a 7-Zip banner'; expectedVersion = $null; expectedCompatible = $false },
    [pscustomobject]@{ name = 'older'; output = '7-Zip 25.01 (x64)'; expectedVersion = '25.1.0'; expectedCompatible = $false },
    [pscustomobject]@{ name = 'compatible'; output = '7-Zip 26.02 (x64)'; expectedVersion = '26.2.0'; expectedCompatible = $true }
)

try {
    New-Item -ItemType Directory -Force -Path $probeRoot | Out-Null
    foreach ($case in $cases) {
        $fakePath = Join-Path $probeRoot ("$($case.name).cmd")
        if ($case.output) {
            @("@echo off", "echo $($case.output)", 'exit /b 0') | Set-Content -LiteralPath $fakePath -Encoding ASCII
        }
        $version = if ($case.output) { Get-SevenZipVersion -Path $fakePath } else { Get-SevenZipVersion -Path $fakePath }
        $compatible = Test-SevenZipCompatible -Path $fakePath -ManifestEntry $manifestEntry
        $versionText = if ($version) { [string]$version } else { $null }
        if ($versionText -ne $case.expectedVersion -or $compatible -ne $case.expectedCompatible) {
            throw "7-Zip compatibility fixture '$($case.name)' drifted: version=$versionText compatible=$compatible."
        }
    }
    Write-Output 'PASS: 7-Zip missing, unparseable, older, and compatible fixtures are classified correctly.'
} finally {
    if (Test-Path -LiteralPath $probeRoot) {
        Remove-Item -LiteralPath $probeRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
