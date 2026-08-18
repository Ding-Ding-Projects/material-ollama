#!powershell

[CmdletBinding()]
param(
    [string]$ManifestPath = (Join-Path $PSScriptRoot 'release-dependencies.json')
)

$ErrorActionPreference = 'Stop'

function Normalize-PathForComparison {
    param([Parameter(Mandatory)][string]$Path)

    return ([IO.Path]::GetFullPath($Path).TrimEnd('\')).Replace('/', '\').ToLowerInvariant()
}

function Get-ManifestDependency {
    param(
        [Parameter(Mandatory)]$Manifest,
        [Parameter(Mandatory)][string]$Name
    )

    $matches = @($Manifest.dependencies | Where-Object { $_.name -eq $Name })
    if ($matches.Count -ne 1) {
        throw "Windows dependency manifest must contain exactly one '$Name' entry; found $($matches.Count)."
    }
    return $matches[0]
}

function Get-ToolVersion {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][ValidateSet('CMake', 'Ninja')][string]$Kind
    )

    $output = @(& $Path '--version' 2>&1)
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        return $null
    }

    $text = ($output -join [Environment]::NewLine)
    if ($Kind -eq 'CMake' -and $text -match '(?m)^cmake version\s+(?<version>\d+(?:\.\d+){2,3})') {
        return $matches.version
    }
    if ($Kind -eq 'Ninja' -and $text -match '(?m)^(?<version>\d+(?:\.\d+){1,3})\s*$') {
        return $matches.version
    }
    return $null
}

function Test-InnoSetupVersion {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$ExpectedVersion
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $false
    }
    $directory = Split-Path -Parent $Path
    if ($directory -notmatch [regex]::Escape($ExpectedVersion)) {
        return $false
    }
    $output = @(& $Path '/?' 2>&1)
    return (($output -join [Environment]::NewLine) -match 'Inno Setup 6 Command-Line Compiler')
}

function Find-MachineExecutable {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)]$Dependency
    )

    switch ($Name) {
        'CMake' {
            return (Get-Command -Name 'cmake.exe' -ErrorAction SilentlyContinue | Select-Object -First 1).Path
        }
        'Ninja' {
            return (Get-Command -Name 'ninja.exe' -ErrorAction SilentlyContinue | Select-Object -First 1).Path
        }
        'Inno Setup' {
            $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }
            foreach ($root in $roots) {
                $candidate = Get-ChildItem -Path (Join-Path $root 'Inno Setup*\ISCC.exe') -File -ErrorAction SilentlyContinue |
                    Select-Object -First 1
                if ($candidate) {
                    return $candidate.FullName
                }
            }
            return (Get-Command -Name 'ISCC.exe' -ErrorAction SilentlyContinue | Select-Object -First 1).Path
        }
        'llvm-mingw' {
            $candidate = (Get-Command -Name 'x86_64-w64-mingw32-gcc.exe' -ErrorAction SilentlyContinue | Select-Object -First 1).Path
            if ($candidate -and $candidate -match [regex]::Escape([string]$Dependency.version)) {
                return $candidate
            }

            $roots = @()
            if ($env:ProgramFiles) {
                $roots += Get-ChildItem -Path (Join-Path $env:ProgramFiles 'llvm-mingw-*') -Directory -ErrorAction SilentlyContinue
            }
            if ($env:LOCALAPPDATA) {
                $roots += Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\MartinStorsjo.LLVM-MinGW*') -Directory -ErrorAction SilentlyContinue
            }
            foreach ($root in ($roots | Sort-Object -Property FullName -Descending)) {
                $candidate = Get-ChildItem -Path (Join-Path $root.FullName "llvm-mingw-$($Dependency.version)\bin\x86_64-w64-mingw32-gcc.exe") -File -ErrorAction SilentlyContinue |
                    Select-Object -First 1
                if ($candidate) {
                    return $candidate.FullName
                }
            }
            return $null
        }
        default {
            throw "Unsupported Windows dependency '$Name'."
        }
    }
}

function Test-MachineTool {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)]$Dependency,
        [Parameter(Mandatory)][string]$Path
    )

    if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $false
    }
    switch ($Name) {
        'CMake' { return (Get-ToolVersion -Path $Path -Kind CMake) -eq [string]$Dependency.version }
        'Ninja' { return (Get-ToolVersion -Path $Path -Kind Ninja) -eq [string]$Dependency.version }
        'Inno Setup' { return Test-InnoSetupVersion -Path $Path -ExpectedVersion ([string]$Dependency.version) }
        'llvm-mingw' { return $Path -match [regex]::Escape([string]$Dependency.version) }
        default { return $false }
    }
}

function Get-UserToolRoot {
    $root = $env:OLLAMA_TOOLCHAIN_ROOT
    if (-not $root) {
        if (-not $env:LOCALAPPDATA) {
            throw 'LOCALAPPDATA is unavailable; cannot choose a user-scoped Windows toolchain root.'
        }
        $root = Join-Path $env:LOCALAPPDATA 'MaterialOllama\tools'
    }
    $root = [IO.Path]::GetFullPath($root)
    New-Item -ItemType Directory -Force -Path $root | Out-Null
    return $root
}

function Get-ToolMarker {
    param(
        [Parameter(Mandatory)][string]$ToolRoot,
        [Parameter(Mandatory)]$Dependency
    )

    $user = $Dependency.user
    $candidateRoot = Join-Path $ToolRoot ([string]$user.directory)
    if (-not (Test-Path -LiteralPath $candidateRoot -PathType Container)) {
        return $null
    }

    $markerPath = Join-Path $candidateRoot 'material-ollama-toolchain.json'
    if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
        throw "Refusing unverified user-scoped $($Dependency.name) directory '$candidateRoot'; its provenance marker is missing."
    }
    try {
        $marker = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
    } catch {
        throw "Refusing unverified user-scoped $($Dependency.name) directory '$candidateRoot'; its provenance marker is invalid."
    }

    $expectedExecutable = Join-Path $candidateRoot ([string]$user.relativeExecutable)
    $matches =
        $marker.schemaVersion -eq 1 -and
        $marker.name -eq $Dependency.name -and
        [string]$marker.version -eq [string]$Dependency.version -and
        $marker.origin -eq 'official-release-asset' -and
        $marker.sourceUrl -eq $user.url -and
        $marker.archiveSha256 -eq $user.sha256 -and
        ((Normalize-PathForComparison ([string]$marker.root)) -eq (Normalize-PathForComparison $candidateRoot)) -and
        $marker.relativeExecutable -eq $user.relativeExecutable -and
        (Test-Path -LiteralPath $expectedExecutable -PathType Leaf)

    if (-not $matches) {
        throw "Refusing unverified user-scoped $($Dependency.name) directory '$candidateRoot'; its provenance does not match the release manifest."
    }

    if ($Dependency.name -eq 'CMake' -and (Get-ToolVersion -Path $expectedExecutable -Kind CMake) -ne [string]$Dependency.version) {
        throw "User-scoped CMake at '$expectedExecutable' failed its version check."
    }
    if ($Dependency.name -eq 'Ninja' -and (Get-ToolVersion -Path $expectedExecutable -Kind Ninja) -ne [string]$Dependency.version) {
        throw "User-scoped Ninja at '$expectedExecutable' failed its version check."
    }
    if ($Dependency.name -eq 'Inno Setup' -and -not (Test-InnoSetupVersion -Path $expectedExecutable -ExpectedVersion ([string]$Dependency.version))) {
        throw "User-scoped Inno Setup at '$expectedExecutable' failed its version check."
    }

    return [pscustomobject]@{
        Root = $candidateRoot
        Executable = $expectedExecutable
        Origin = 'verified-user-archive'
    }
}

function Get-DownloadPath {
    param([Parameter(Mandatory)][string]$Url)

    $uri = [Uri]$Url
    $name = [IO.Path]::GetFileName($uri.AbsolutePath)
    if (-not $name -or $name -match '[\\/]') {
        throw "Manifest asset URL does not have a safe filename: $Url"
    }
    $downloadRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
    if (-not $downloadRoot) {
        throw 'Neither RUNNER_TEMP nor TEMP is available for a bounded dependency download.'
    }
    $downloadRoot = Join-Path $downloadRoot 'material-ollama-toolchain-downloads'
    New-Item -ItemType Directory -Force -Path $downloadRoot | Out-Null
    return Join-Path $downloadRoot $name
}

function Download-VerifiedAsset {
    param(
        [Parameter(Mandatory)]$Dependency,
        [Parameter(Mandatory)][string]$Path
    )

    $expected = ([string]$Dependency.user.sha256).ToLowerInvariant()
    $actual = $null
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    if ($actual -ne $expected) {
        Write-Output "Downloading verified $($Dependency.name) asset from $($Dependency.user.provider)."
        Invoke-WebRequest -UseBasicParsing -Uri $Dependency.user.url -OutFile $Path
        $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    if ($actual -ne $expected) {
        throw "$($Dependency.name) digest mismatch: expected $expected, got $actual"
    }
}

function Install-UserTool {
    param(
        [Parameter(Mandatory)]$Dependency,
        [Parameter(Mandatory)][string]$ToolRoot
    )

    $user = $Dependency.user
    $candidateRoot = Join-Path $ToolRoot ([string]$user.directory)
    if (Test-Path -LiteralPath $candidateRoot) {
        throw "Cannot install user-scoped $($Dependency.name) into existing unverified path '$candidateRoot'."
    }

    $assetPath = Get-DownloadPath -Url $user.url
    Download-VerifiedAsset -Dependency $Dependency -Path $assetPath
    $stagingRoot = Join-Path $env:TEMP ("material-ollama-toolchain-stage-" + [guid]::NewGuid().ToString('N'))
    try {
        New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
        if ($user.archive -eq 'zip') {
            Expand-Archive -LiteralPath $assetPath -DestinationPath $stagingRoot -Force
            $sourceRoot = $stagingRoot
            if ($user.archiveRoot) {
                $sourceRoot = Join-Path $stagingRoot ([string]$user.archiveRoot)
            }
            if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
                throw "$($Dependency.name) archive did not contain expected root '$($user.archiveRoot)'."
            }
            Move-Item -LiteralPath $sourceRoot -Destination $candidateRoot
        } elseif ($user.installer -eq 'exe') {
            $process = Start-Process -FilePath $assetPath -ArgumentList @(
                '/VERYSILENT',
                '/SUPPRESSMSGBOXES',
                '/NORESTART',
                "/DIR=$candidateRoot"
            ) -Wait -PassThru -WindowStyle Hidden
            if ($process.ExitCode -ne 0) {
                throw "$($Dependency.name) installer exited with code $($process.ExitCode)."
            }
        } else {
            throw "Unsupported user-scoped install format '$($user.archive)$($user.installer)' for $($Dependency.name)."
        }

        $marker = [ordered]@{
            schemaVersion = 1
            name = [string]$Dependency.name
            version = [string]$Dependency.version
            origin = 'official-release-asset'
            sourceUrl = [string]$user.url
            archiveSha256 = ([string]$user.sha256).ToLowerInvariant()
            root = [IO.Path]::GetFullPath($candidateRoot)
            relativeExecutable = [string]$user.relativeExecutable
            verifiedBy = 'scripts/bootstrap_windows_tools.ps1'
        }
        $markerPath = Join-Path $candidateRoot 'material-ollama-toolchain.json'
        $marker | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $markerPath -Encoding utf8
    } finally {
        if (Test-Path -LiteralPath $stagingRoot) {
            Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    return Get-ToolMarker -ToolRoot $ToolRoot -Dependency $Dependency
}

function Add-ToolToPath {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Executable,
        [Parameter(Mandatory)][string]$Origin
    )

    $directory = Split-Path -Parent $Executable
    $env:PATH = "$directory;$env:PATH"
    if ($env:GITHUB_PATH) {
        $directory | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append
    }
    Write-Output "Resolved $Name from $Origin at $Executable"
}

$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
if ($manifest.platform -ne 'windows' -or $manifest.schemaVersion -ne 2) {
    throw "Unsupported Windows dependency manifest: expected schemaVersion 2 and platform windows."
}

$toolRoot = Get-UserToolRoot
if ($env:GITHUB_ENV) {
    "OLLAMA_TOOLCHAIN_ROOT=$toolRoot" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
}

foreach ($name in @('CMake', 'Ninja', 'llvm-mingw', 'Inno Setup')) {
    $dependency = Get-ManifestDependency -Manifest $manifest -Name $name
    $machinePath = Find-MachineExecutable -Name $name -Dependency $dependency
    if ($machinePath -and (Test-MachineTool -Name $name -Dependency $dependency -Path $machinePath)) {
        Add-ToolToPath -Name $name -Executable $machinePath -Origin 'verified machine installation'
        continue
    }

    $userTool = Get-ToolMarker -ToolRoot $toolRoot -Dependency $dependency
    if (-not $userTool) {
        $userTool = Install-UserTool -Dependency $dependency -ToolRoot $toolRoot
    }
    Add-ToolToPath -Name $name -Executable $userTool.Executable -Origin $userTool.Origin
}

Write-Output "Verified user-scoped toolchain root: $toolRoot"
