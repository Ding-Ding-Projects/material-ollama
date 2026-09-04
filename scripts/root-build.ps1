[CmdletBinding()]
param(
    [switch]$DependenciesOnly,
    [string]$PathOutput,
    [switch]$SilentMode,
    [switch]$RunAfterBuild,
    [switch]$ReleaseFast,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$BuildSteps
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# A caller running a different PowerShell edition can pass an incompatible
# module search path. Resolve native modules before using their cmdlets, and
# keep the corrected search path local to this process and its children.
$nativeModuleRoot = [IO.Path]::Combine($PSHOME, 'Modules')
$env:PSModulePath = $nativeModuleRoot + [IO.Path]::PathSeparator + $env:PSModulePath
foreach ($moduleName in @('Microsoft.PowerShell.Utility', 'Microsoft.PowerShell.Management')) {
    $moduleManifest = [IO.Path]::Combine($nativeModuleRoot, $moduleName, "$moduleName.psd1")
    if (-not [IO.File]::Exists($moduleManifest)) { throw "Required native PowerShell module manifest is missing: $moduleManifest" }
    Import-Module -Name $moduleManifest -Force -ErrorAction Stop
}
$root = Split-Path -Parent $PSScriptRoot
$powershell = Join-Path $PSHOME 'powershell.exe'

function Resolve-RootPath([string]$Relative) {
    if ([IO.Path]::IsPathRooted($Relative)) { throw "Build manifest path must be relative: $Relative" }
    $full = [IO.Path]::GetFullPath((Join-Path $root $Relative))
    if ($full -cne $root -and -not $full.StartsWith($root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Build path escapes repository: $Relative" }
    return $full
}
function Invoke-Child([string]$Script, [string[]]$Arguments) {
    & $powershell -NoProfile -ExecutionPolicy Bypass -File $Script @Arguments
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
function Get-SourceBinding {
    $state = Get-SquirrelSourceState -SourceRoot $root -ExpectedCommit $expectedCommit
    return [ordered]@{
        sourceCommit = $state.sourceCommit
        sourceTree = $state.sourceTree
        indexTree = $state.indexTree
        dependencyManifestSha256 = $state.dependencyManifestSha256
        rootManifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
        prerequisiteManifestSha256 = (Get-FileHash -LiteralPath $prerequisitePath -Algorithm SHA256).Hash.ToLowerInvariant()
        version = Get-SquirrelVersion -SourceRoot $root
    }
}
function Assert-Binding($Expected) {
    $actual = Get-SourceBinding
    foreach ($key in $actual.Keys) {
        if ($Expected[$key] -cne $actual[$key]) { throw "Source changed during build: $key" }
    }
}
function Assert-Payload($Binding) {
    $receipt = Get-Content -Raw -LiteralPath (Resolve-RootPath $manifest.payloadReceipt) | ConvertFrom-Json
    if ($receipt.schemaVersion -ne 1) { throw 'Unsupported native payload receipt.' }
    foreach ($key in @('sourceCommit', 'sourceTree', 'indexTree', 'dependencyManifestSha256', 'version')) {
        if ($receipt.$key -cne $Binding[$key]) { throw "Stale payload receipt: $key" }
    }
    if (@($receipt.files).Count -eq 0) { throw 'Payload receipt contains no files.' }
    $paths = @{}
    foreach ($file in $receipt.files) {
        if ([string]$file.path -match '(^|[\\/])\.\.([\\/]|$)' -or [IO.Path]::IsPathRooted([string]$file.path)) { throw 'Unsafe payload receipt path.' }
        $full = Resolve-RootPath ('dist/' + [string]$file.path)
        if ($paths.ContainsKey($full)) { throw 'Duplicate payload receipt path.' }
        $paths[$full] = $true
        $item = Get-Item -LiteralPath $full
        if ($item.PSIsContainer -or $item.Length -le 0 -or $item.Length -ne $file.size -or
            (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant() -cne $file.sha256) {
            throw "Payload validation failed: $($file.path)"
        }
    }
    foreach ($target in @($manifest.targets.amd64, $manifest.targets.arm64)) {
        foreach ($path in @($target.executable, $target.server)) {
            if (-not $paths.ContainsKey((Resolve-RootPath $path))) { throw "Required native payload is absent from receipt: $path" }
        }
    }
    return $receipt
}

try {
    Set-Location -LiteralPath $root
    $manifestPath = Join-Path $PSScriptRoot 'root-build-manifest.json'
    $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
    if ($manifest.schemaVersion -ne 1 -or $manifest.platform -cne 'windows') { throw 'Unsupported root build manifest.' }
    $dependencyPath = Resolve-RootPath $manifest.dependencyManifest
    $prerequisitePath = Resolve-RootPath $manifest.prerequisiteManifest
    if (-not $DependenciesOnly) {
        . (Join-Path $PSScriptRoot 'squirrel-contract.ps1')
        $expectedCommit = (& git -C $root rev-parse HEAD).Trim()
        if ($LASTEXITCODE -ne 0 -or $expectedCommit -notmatch '^[a-f0-9]{40}$') { throw 'Cannot resolve the current build commit.' }
        $binding = Get-SourceBinding
        if (-not $BuildSteps) { $BuildSteps = @($manifest.defaultSteps) }
        foreach ($step in $BuildSteps) {
            if ($step -cnotin $manifest.allowedSteps) { throw "Unsupported build step: $step" }
        }
        $complete = @($manifest.defaultSteps | Where-Object { $_ -cnotin $BuildSteps }).Count -eq 0
        if ($RunAfterBuild -and -not $complete) { throw 'Run requires the complete native payload build.' }
    }
    Write-Host '[build] Resolving verified tools in this process.'
    & (Join-Path $PSScriptRoot 'bootstrap_windows_prerequisites.ps1') -Silent -ManifestPath $prerequisitePath
    Invoke-Child (Join-Path $PSScriptRoot 'bootstrap_windows_tools.ps1') @('-ManifestPath', $dependencyPath)
    # The tool bootstrap is a child process. Restore its verified, manifest-owned
    # executable directories for the next child and for command-script callers.
    $toolRoot = if ($env:OLLAMA_TOOLCHAIN_ROOT) { $env:OLLAMA_TOOLCHAIN_ROOT } else { Join-Path $env:LOCALAPPDATA 'MaterialOllama/tools-v2' }
    $dependencies = Get-Content -Raw -LiteralPath $dependencyPath | ConvertFrom-Json
    foreach ($dependency in $dependencies.dependencies) {
        if ($dependency.user.directory -and $dependency.user.relativeExecutable) {
            $executable = Join-Path (Join-Path $toolRoot $dependency.user.directory) $dependency.user.relativeExecutable
            if (Test-Path -LiteralPath $executable -PathType Leaf) { $env:Path = (Split-Path -Parent $executable) + ';' + $env:Path }
        }
    }
    Invoke-Child (Join-Path $PSScriptRoot 'fetch-webview2.ps1') @('-ManifestPath', $dependencyPath, '-OutputRoot', (Join-Path $root 'dist\webview2'))
    if ($DependenciesOnly) {
        if ($PathOutput) { [IO.File]::WriteAllText($PathOutput, $env:Path, [Text.Encoding]::Default) }
        Write-Host '[build] Dependencies ready.'
        exit 0
    }
    if (-not $ReleaseFast) {
        & node.exe scripts/check-uh-inventory.mjs --self-test
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & node.exe scripts/check-uh-inventory.mjs
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } else {
        Write-Host '[build] Fast release mode: quality suites and UI capture are not run.'
    }
    & node.exe scripts/check-vocabulary.mjs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Assert-Binding $binding
    $launchReceipt = Resolve-RootPath $manifest.launchReceipt
    if (Test-Path -LiteralPath $launchReceipt) { Remove-Item -LiteralPath $launchReceipt -Force }
    if ($complete) {
        $payloadPath = Resolve-RootPath $manifest.payloadReceipt
        if (Test-Path -LiteralPath $payloadPath) { Remove-Item -LiteralPath $payloadPath -Force }
    }
    Invoke-Child (Resolve-RootPath $manifest.buildScript) $BuildSteps
    Assert-Binding $binding
    if (-not $complete) { Write-Host '[build] Selected steps completed; no runnable payload was certified.'; exit 0 }
    $payload = Assert-Payload $binding
    $record = [ordered]@{ schemaVersion = 1; source = $binding; steps = $BuildSteps; files = $payload.files }
    $record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $launchReceipt -Encoding UTF8
    Write-Host "[build] Native payload verified at $($binding.sourceCommit)."
    if (-not $SilentMode -and -not $RunAfterBuild) { $RunAfterBuild = (Read-Host 'Run the verified desktop application now? [y/N]') -match '^(?i:y|yes)$' }
    if ($RunAfterBuild) {
        Assert-Binding $binding
        $null = Assert-Payload $binding
        $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'amd64' }
        $target = $manifest.targets.$architecture
        # The native developer resolver looks below the repository working directory.
        # Put the certified server first so its PATH fallback cannot select another install.
        $env:Path = (Split-Path -Parent (Resolve-RootPath $target.server)) + ';' + $env:Path
        Start-Process -FilePath (Resolve-RootPath $target.executable) -WorkingDirectory (Resolve-RootPath $target.workingDirectory) | Out-Null
    }
    exit 0
} catch {
    Write-Error "Root build failed: $($_.Exception.Message)" -ErrorAction Continue
    exit 1
}
