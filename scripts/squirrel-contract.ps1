# Shared packaging contracts. This file performs no work when dot-sourced.
function Get-SquirrelVersion {
    param([string]$SourceRoot, [string]$ExplicitVersion = $env:PACKAGE_VERSION)
    if ($ExplicitVersion) {
        if ($ExplicitVersion -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') { throw 'PACKAGE_VERSION must be a numeric three-part version.' }
        foreach ($part in $ExplicitVersion.Split('.')) { if ([long]$part -gt 65534) { throw 'Package version components must not exceed 65534.' } }
        return $ExplicitVersion
    }
    $height = & git -C $SourceRoot rev-list --count HEAD
    if ($LASTEXITCODE -ne 0 -or "$height" -notmatch '^\d+$' -or [long]$height -gt 65534) { throw 'Cannot derive bounded reachable-commit package version.' }
    $sequence = 0
    if ($env:GITHUB_RUN_NUMBER) {
        if ($env:GITHUB_RUN_NUMBER -notmatch '^\d+$' -or $env:GITHUB_RUN_ATTEMPT -notmatch '^[1-9]$') { throw 'Workflow package sequence requires numeric run number and attempt 1..9.' }
        $sequence = [long]$env:GITHUB_RUN_NUMBER * 10 + [int]$env:GITHUB_RUN_ATTEMPT
        if ($sequence -gt 65534) { throw 'Workflow package sequence exceeds 65534; select a reviewed PACKAGE_VERSION.' }
    }
    return "1.$height.$sequence"
}

function Assert-NoReparsePath {
    param([string]$Path)
    $cursor = [IO.Path]::GetFullPath($Path)
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -Force -LiteralPath $cursor).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse path is not permitted: $cursor" }
        }
        $parent = Split-Path -Parent $cursor
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
}

function Get-ContainedPath {
    param([string]$Root, [string]$Relative)
    if ([IO.Path]::IsPathRooted($Relative)) { throw 'Relative path required.' }
    $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $full = [IO.Path]::GetFullPath((Join-Path $rootFull $Relative))
    if (-not $full.StartsWith($rootFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path escapes its designated root.' }
    Assert-NoReparsePath $full
    return $full
}

function Get-SquirrelSourceState {
    param([string]$SourceRoot, [string]$ExpectedCommit)
    $head = (& git -C $SourceRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $head -cne $ExpectedCommit) { throw 'Source commit changed during packaging.' }
    $dirty = @(& git -C $SourceRoot status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) { throw 'Packaging requires unchanged committed source and index, including untracked files.' }
    $tree = (& git -C $SourceRoot rev-parse 'HEAD^{tree}').Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve source tree.' }
    $index = (& git -C $SourceRoot write-tree).Trim()
    if ($LASTEXITCODE -ne 0 -or $tree -cne $index) { throw 'Source index does not match commit.' }
    $manifest = Join-Path $SourceRoot 'scripts/release-dependencies.json'
    $state = [ordered]@{ sourceCommit = $head; sourceTree = $tree; indexTree = $index; dependencyManifestSha256 = (Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash.ToLowerInvariant() }
    foreach ($pair in @(@('rootPrerequisitesSha256', 'scripts/root-prerequisites.json'), @('rootBuildManifestSha256', 'scripts/root-build-manifest.json'))) {
        $file = Join-Path $SourceRoot $pair[1]
        if (Test-Path -LiteralPath $file -PathType Leaf) { $state[$pair[0]] = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    return $state
}

function Get-PeMachine {
    param([IO.Stream]$Stream)
    $reader = New-Object IO.BinaryReader($Stream, [Text.Encoding]::UTF8, $true)
    try {
        if ($Stream.Length -lt 128 -or $reader.ReadUInt16() -ne 0x5a4d) { throw 'Invalid PE DOS header.' }
        $Stream.Position = 60
        $offset = $reader.ReadUInt32()
        if ($offset -lt 64 -or $offset -gt $Stream.Length - 24) { throw 'Invalid PE header offset.' }
        $Stream.Position = $offset
        if ($reader.ReadUInt32() -ne 0x00004550) { throw 'Invalid PE signature.' }
        $machine = $reader.ReadUInt16()
        $sections = $reader.ReadUInt16()
        $Stream.Position = $offset + 20
        $optionalSize = $reader.ReadUInt16()
        if ($sections -lt 1 -or $sections -gt 96 -or $optionalSize -lt 96 -or $offset + 24 + $optionalSize + 40 * $sections -gt $Stream.Length) { throw 'Invalid PE section table.' }
        $Stream.Position = $offset + 24
        if ($reader.ReadUInt16() -notin @(0x10b, 0x20b)) { throw 'Invalid PE optional header.' }
        return $machine
    } finally { $reader.Dispose() }
}

function Assert-PeFile {
    param([string]$Path, [string]$Architecture)
    $stream = [IO.File]::OpenRead($Path)
    try { $machine = Get-PeMachine $stream } finally { $stream.Dispose() }
    $expected = if ($Architecture -eq 'x64') { 0x8664 } elseif ($Architecture -eq 'arm64') { 0xaa64 } else { 0 }
    if ($expected -and $machine -ne $expected) { throw "PE architecture mismatch for $Path" }
    return $machine
}

function Write-SquirrelJson {
    param([string]$Path, $Value)
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
}
