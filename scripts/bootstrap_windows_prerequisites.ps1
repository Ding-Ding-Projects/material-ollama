#!powershell
[CmdletBinding()]
param(
  [switch]$Silent,
  [string]$ManifestPath = (Join-Path $PSScriptRoot 'root-prerequisites.json')
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Refresh-UserPath {
  # Preserve the caller's process-only tools and ordering.
  $known7Zip = Join-Path ${env:ProgramFiles} '7-Zip'
  if (Test-Path (Join-Path $known7Zip '7z.exe')) { $env:Path = "$known7Zip;$env:Path" }
}

function Has-CommandVersion {
  param([Parameter(Mandatory)][string]$Name, [Parameter(Mandatory)][scriptblock]$Probe)
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) { return $false }
  try { & $Probe; return ($LASTEXITCODE -eq 0) } catch { return $false }
}

function Get-SevenZipVersion {
  param([Parameter(Mandatory)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  try {
    $output = @(& $Path i 2>&1)
    if ($LASTEXITCODE -ne 0) { return $null }
    $text = $output -join [Environment]::NewLine
    if ($text -notmatch '(?m)^7-Zip(?:\s+\(a\))?\s+(?<version>\d+(?:\.\d+){1,2})\s+') { return $null }
    $parts = @($matches.version -split '\.') | ForEach-Object { [int]$_ }
    while ($parts.Count -lt 3) { $parts += 0 }
    return [Version]::new($parts[0], $parts[1], $parts[2])
  } catch {
    return $null
  }
}

function Test-SevenZipCompatible {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)]$ManifestEntry
  )
  $actual = Get-SevenZipVersion -Path $Path
  if (-not $actual) { return $false }
  return $actual -ge [Version]$ManifestEntry.version
}

function Test-NodeCompatible {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $command) { return $false }
  try {
    $versionText = (& $command.Source --version).Trim().TrimStart('v')
    return ($LASTEXITCODE -eq 0 -and [Version]$versionText -ge [Version]'22.13.0' -and ([Version]$versionText).Major -lt 26)
  } catch { return $false }
}

function Assert-ToolPath {
  param([string]$Path)
  $full = [IO.Path]::GetFullPath($Path)
  $part = $full
  while ($part) {
    if ((Test-Path -LiteralPath $part) -and ((Get-Item -LiteralPath $part -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Tool path contains a reparse point: $part" }
    $part = [IO.Path]::GetDirectoryName($part)
  }
  return $full
}

function Get-ToolChild {
  param([string]$Root, [string]$Relative)
  if ([IO.Path]::IsPathRooted($Relative) -or $Relative.Contains(':')) { throw "Invalid archive path: $Relative" }
  $base = (Assert-ToolPath $Root).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
  $result = [IO.Path]::GetFullPath((Join-Path $Root $Relative))
  if (-not $result.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { throw "Archive path escapes destination: $Relative" }
  return (Assert-ToolPath $result)
}

function Move-ToolPath {
  param([string]$Source, [string]$Destination)
  for ($attempt = 0; ; $attempt++) {
    try { Move-Item -LiteralPath $Source -Destination $Destination -ErrorAction Stop; return }
    catch {
      if ($attempt -ge 5 -or ($_.Exception.HResult -band 65535) -notin @(5, 32, 33)) { throw }
      Start-Sleep -Milliseconds (50 * ($attempt + 1))
    }
  }
}

function Get-ToolDownload {
  param($Record, [string]$Destination)
  $null = Assert-ToolPath $Destination
  $uri = [Uri]$Record.url
  if ($uri.Scheme -ne 'https' -or $uri.UserInfo -or [string]$Record.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Tool manifest requires HTTPS and a SHA-256 digest.' }
  if ((Test-Path -LiteralPath $Destination -PathType Leaf) -and (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -eq $Record.sha256) { return }
  $temporary = "$Destination.download-$PID-$([Guid]::NewGuid().ToString('N'))"
  try {
    Write-Host "Downloading pinned tool from $uri"
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $uri -OutFile $temporary -UseBasicParsing -TimeoutSec 300
    if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $Record.sha256) { throw 'Downloaded tool SHA-256 mismatch.' }
    if (Test-Path -LiteralPath $Destination) { Move-ToolPath $Destination "$Destination.invalid-$([Guid]::NewGuid().ToString('N'))" }
    Move-ToolPath $temporary $Destination
  } catch { throw "Cannot obtain pinned tool $uri at ${Destination}: $($_.Exception.Message)" }
  finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
}

function Expand-ToolArchive {
  param([string]$Archive, $Record, [string]$Destination, [string]$Extractor)
  New-Item -ItemType Directory -Path $Destination | Out-Null
  if ($Record.archive -eq 'zip') {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
      $seen = @{}
      foreach ($entry in $zip.Entries) {
        $target = Get-ToolChild $Destination $entry.FullName
        if ($seen.ContainsKey($target)) { throw 'Duplicate archive path.' }
        $seen[$target] = $true
        if (($entry.ExternalAttributes -shr 16 -band 61440) -eq 40960) { throw 'Archive symlinks are not supported.' }
        if ($entry.FullName.EndsWith('/') -or $entry.FullName.EndsWith('\')) { [IO.Directory]::CreateDirectory($target) | Out-Null }
        else {
          [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
          [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
        }
      }
    } finally { $zip.Dispose() }
  } elseif ($Record.archive -eq '7z') {
    $listing = @(& $Extractor l -slt -- $Archive 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to list pinned archive.' }
    $entries = $false
    foreach ($line in $listing) {
      if ([string]$line -eq '----------') { $entries = $true; continue }
      if ($entries -and [string]$line -match '^Path = (.+)$') { $null = Get-ToolChild $Destination $matches[1] }
      if ($entries -and [string]$line -match '^(Symbolic Link|Hard Link) = .+') { throw 'Archive links are not supported.' }
    }
    if (-not $entries) { throw 'Pinned archive listing has no entry boundary.' }
    & $Extractor x -y "-o$Destination" -- $Archive | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Pinned archive extraction failed.' }
  } else { throw "Unsupported archive type: $($Record.archive)" }
}

function Get-ToolTree {
  param([string]$Root)
  $null = Assert-ToolPath $Root
  $files = @{}
  foreach ($item in Get-ChildItem -LiteralPath $Root -Recurse -Force) {
    $null = Assert-ToolPath $item.FullName
    if (-not $item.PSIsContainer) { $files[$item.FullName.Substring($Root.TrimEnd('\', '/').Length).TrimStart('\', '/')] = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash }
  }
  return $files
}

function Test-ToolTree {
  param([string]$Root, [hashtable]$Expected)
  if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return $false }
  $actual = Get-ToolTree $Root
  if ($actual.Count -eq 0 -or $actual.Count -ne $Expected.Count) { return $false }
  foreach ($key in $Expected.Keys) { if ($actual[$key] -ne $Expected[$key]) { return $false } }
  return $true
}

function Install-PortableTool {
  param($Entry, $Record, [string]$CacheRoot, $ExtractorRecord)
  $id = ($Entry.name -replace '[^a-zA-Z0-9]', '').ToLowerInvariant() + '-' + $Entry.version + '-' + $Record.sha256.Substring(0, 16)
  $toolRoot = Get-ToolChild $CacheRoot $id
  [IO.Directory]::CreateDirectory($toolRoot) | Out-Null
  $lock = $null
  $deadline = [DateTime]::UtcNow.AddMinutes(5)
  while (-not $lock) {
    try { $lock = [IO.File]::Open((Join-Path $toolRoot 'activation.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch [IO.IOException] { if ([DateTime]::UtcNow -ge $deadline) { throw 'Timed out waiting for tool activation lock.' }; Start-Sleep -Milliseconds 200 }
  }
  $stage = Get-ToolChild $toolRoot ('stage-' + $PID + '-' + [Guid]::NewGuid().ToString('N'))
  try {
    $archive = Join-Path $toolRoot ('source.' + $Record.archive)
    Get-ToolDownload $Record $archive
    $extractor = ''
    if ($Record.archive -eq '7z') { $extractor = Join-Path $toolRoot '7zr.exe'; Get-ToolDownload $ExtractorRecord $extractor }
    Expand-ToolArchive $archive $Record $stage $extractor
    $source = if ($Record.archiveRoot) { Get-ToolChild $stage $Record.archiveRoot } else { $stage }
    $relativeExe = $Record.relativeExecutable
    $sourceExe = Get-ToolChild $source $relativeExe
    if (-not (Test-Path -LiteralPath $sourceExe -PathType Leaf)) { throw "Pinned package is missing $relativeExe." }
    if ($Entry.name -eq '7-Zip') { Copy-Item -LiteralPath $sourceExe -Destination (Join-Path $source '7z.exe'); $relativeExe = '7z.exe' }
    # Re-extraction from a verified archive is the independent warm-cache reference.
    $expected = Get-ToolTree $source
    $active = Join-Path $toolRoot 'active'
    $journal = Join-Path $toolRoot 'activation.json'
    if (-not (Test-ToolTree $active $expected)) {
      $backup = Get-ChildItem -LiteralPath $toolRoot -Directory -Filter 'backup-*' | Sort-Object Name -Descending | Where-Object { Test-ToolTree $_.FullName $expected } | Select-Object -First 1
      if ($backup) {
        if (Test-Path -LiteralPath $active) { Move-ToolPath $active (Join-Path $toolRoot ('invalid-' + [Guid]::NewGuid().ToString('N'))) }
        Move-ToolPath $backup.FullName $active
      }
    }
    # Journal contents never supply paths or hashes. Even malformed interrupted
    # journals are retained while recovery uses independently validated trees.
    if (Test-Path -LiteralPath $journal) { Move-ToolPath $journal "$journal.recovered-$([Guid]::NewGuid().ToString('N'))" }
    if (-not (Test-ToolTree $active $expected)) {
      $backupPath = Join-Path $toolRoot ('backup-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffffZ') + '-' + [Guid]::NewGuid().ToString('N'))
      [IO.File]::WriteAllText($journal, (@{ schemaVersion = 1; archiveSha256 = $Record.sha256; state = 'activating' } | ConvertTo-Json -Compress))
      if (Test-Path -LiteralPath $active) { Move-ToolPath $active $backupPath }
      try {
        Move-ToolPath $source $active
        if (-not (Test-ToolTree $active $expected)) { throw 'Activated tool failed archive-reference verification.' }
      } catch {
        if (Test-Path -LiteralPath $active) { Move-ToolPath $active (Join-Path $toolRoot ('invalid-' + [Guid]::NewGuid().ToString('N'))) }
        if (Test-Path -LiteralPath $backupPath) { Move-ToolPath $backupPath $active }
        throw
      }
      Move-ToolPath $journal "$journal.completed-$([Guid]::NewGuid().ToString('N'))"
    }
    Write-Host "Verified portable $($Entry.name) $($Entry.version) at $active"
    return (Join-Path $active $relativeExe)
  } finally {
    try {
      if (Test-Path -LiteralPath $stage) {
        $resolvedStage = Get-ToolChild $toolRoot ([IO.Path]::GetFileName($stage))
        foreach ($item in Get-ChildItem -LiteralPath $resolvedStage -Recurse -Force) { $null = Assert-ToolPath $item.FullName }
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
      }
    } finally { $lock.Dispose() }
  }
}

$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
$sevenZipManifest = @($manifest.dependencies | Where-Object name -eq '7-Zip') | Select-Object -First 1
if (-not $sevenZipManifest) { throw "root-prerequisites.json must contain a 7-Zip version record." }
if ($manifest.schemaVersion -ne 1 -or $manifest.platform -ne 'windows') { throw 'Unsupported portable prerequisite manifest.' }
$architectureName = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$architecture = switch ($architectureName.ToUpperInvariant()) { 'AMD64' { 'amd64' }; 'ARM64' { 'arm64' }; default { throw "Unsupported Windows architecture: $architectureName" } }
$cacheRoot = if ($env:OLLAMA_TOOLCHAIN_ROOT) { $env:OLLAMA_TOOLCHAIN_ROOT } else { Join-Path $env:LOCALAPPDATA 'MaterialOllama/tools-v2' }
$cacheRoot = Assert-ToolPath $cacheRoot
[IO.Directory]::CreateDirectory($cacheRoot) | Out-Null
Refresh-UserPath
foreach ($name in @('Node.js', 'Go', '7-Zip')) {
  $entries = @($manifest.dependencies | Where-Object name -eq $name)
  if ($entries.Count -ne 1) { throw "Portable manifest must contain exactly one $name entry." }
  $entry = $entries[0]
  $record = $entry.architectures.$architecture
  if (-not $record) { throw "Portable $name has no $architecture package." }
  $command = Get-Command $entry.command -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  $managed = $command -and $command.Source.StartsWith($cacheRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
  $compatible = $false
  if ($command -and -not $managed) {
    $compatible = switch ($name) {
      'Node.js' { Test-NodeCompatible }
      'Go' { (Has-CommandVersion -Name 'go.exe' -Probe { go.exe version | Out-Host }) -and ((go.exe version) -match '^go version go1\.26(?:\.\d+)? windows/(amd64|arm64)$') }
      '7-Zip' { Test-SevenZipCompatible -Path $command.Source -ManifestEntry $entry }
    }
  }
  if ($compatible) { Write-Host "Using compatible installed $name at $($command.Source)" }
  else {
    $executable = Install-PortableTool $entry $record $cacheRoot $manifest.extractor
    $env:Path = [IO.Path]::GetDirectoryName($executable) + ';' + $env:Path
  }
}

foreach ($required in @('node.exe', 'go.exe')) {
  if (-not (Get-Command $required -ErrorAction SilentlyContinue)) { throw "Prerequisite bootstrap completed without a usable $required on PATH." }
}
if (-not (Test-NodeCompatible)) { throw 'Portable Node.js failed its version probe.' }
if (-not (Has-CommandVersion -Name 'go.exe' -Probe { go.exe version | Out-Host }) -or (go.exe version) -notmatch '^go version go1\.26(?:\.\d+)? windows/(amd64|arm64)$') { throw 'Portable Go failed its version probe.' }
$sevenZip = Get-Command 7z.exe -ErrorAction SilentlyContinue
if (-not $sevenZip -or -not (Test-SevenZipCompatible -Path $sevenZip.Source -ManifestEntry $sevenZipManifest)) {
  $actualVersion = if ($sevenZip) { Get-SevenZipVersion -Path $sevenZip.Source } else { $null }
  $actualText = if ($actualVersion) { [string]$actualVersion } else { 'missing or unparseable' }
  throw "Prerequisite bootstrap completed without a compatible 7z.exe; expected version >= $($sevenZipManifest.version), found $actualText."
}
Write-Host 'Node.js, Go, and 7-Zip are available for the repository build path.'
