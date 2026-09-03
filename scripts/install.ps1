<#
.SYNOPSIS
    Install, upgrade, or uninstall Ollama on Windows.

.DESCRIPTION
    Resolves the exact published Material Ollama release, verifies its installer
    digest, and installs the unsigned OllamaSetup.exe asset.

    Quick install:

        .\install.ps1

    Specific version:

        $env:OLLAMA_VERSION="v0.0.0-build.19"; .\install.ps1

    Custom install directory:

        $env:OLLAMA_INSTALL_DIR="D:\Ollama"; .\install.ps1

    Uninstall:

        $env:OLLAMA_UNINSTALL=1; .\install.ps1

    Environment variables:

        OLLAMA_VERSION       Target version (default: latest stable)
        OLLAMA_INSTALL_DIR   Custom install directory
        OLLAMA_UNINSTALL     Set to 1 to uninstall Ollama
        OLLAMA_INSTALLER_SHA256
                              Published SHA-256 for OllamaSetup.exe
        OLLAMA_DEBUG         Enable verbose output

.EXAMPLE
    .\install.ps1

.EXAMPLE
    $env:OLLAMA_VERSION = "v0.0.0-build.19"; .\install.ps1

.EXAMPLE
    .\install.ps1 -ExpectedSha256 <published-release-sha256>

.NOTES
    The helper resolves the exact published Material Ollama release and its
    OllamaSetup.exe browser_download_url automatically. -ExpectedSha256 or
    OLLAMA_INSTALLER_SHA256 is an optional explicit cross-check, not a required
    undocumented prerequisite.

.LINK
    https://github.com/Ding-Ding-Projects/material-ollama/releases
#>

param(
    [string]$ExpectedSha256 = ""
)

$ErrorActionPreference = "Stop"
$utilityModulePath = Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
if (-not (Test-Path -LiteralPath $utilityModulePath -PathType Leaf)) { throw "Microsoft.PowerShell.Utility module manifest was not found under PSHOME: $utilityModulePath" }
Import-Module -Name $utilityModulePath -Force -ErrorAction Stop
$ProgressPreference = "SilentlyContinue"

# --------------------------------------------------------------------------
# Configuration from environment variables
# --------------------------------------------------------------------------

$Version      = if ($env:OLLAMA_VERSION) { $env:OLLAMA_VERSION } else { "" }
$InstallDir   = if ($env:OLLAMA_INSTALL_DIR) { $env:OLLAMA_INSTALL_DIR } else { "" }
$Uninstall    = $env:OLLAMA_UNINSTALL -eq "1"
$ExpectedInstallerSha256 = if ($ExpectedSha256) { $ExpectedSha256.Trim().ToLowerInvariant() } elseif ($env:OLLAMA_INSTALLER_SHA256) { $env:OLLAMA_INSTALLER_SHA256.Trim().ToLowerInvariant() } else { "" }
$DebugInstall = [bool]$env:OLLAMA_DEBUG

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------

$InnoSetupUninstallGuid = "{44E83376-CE68-45EB-8FC1-393500EB558C}_is1"

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

function Write-Status {
    param([string]$Message)
    if ($DebugInstall) { Write-Host $Message }
}

function Write-Step {
    param([string]$Message)
    if ($DebugInstall) { Write-Host ">>> $Message" -ForegroundColor Cyan }
}

function Test-InstallerHash {
    param([string]$FilePath)

    if ($ExpectedInstallerSha256 -notmatch '^[0-9a-f]{64}$') {
        throw "Installer SHA-256 verification requires the published 64-character release hash (resolved from the exact release or supplied with -ExpectedSha256)."
    }
    $actual = (Get-FileHash -LiteralPath $FilePath -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Status "  SHA-256: $actual"
    if ($actual -ne $ExpectedInstallerSha256) {
        Write-Status "  Expected SHA-256: $ExpectedInstallerSha256"
        return $false
    }
    return $true
}

function Resolve-PublishedInstaller {
    # Resolve the exact Material Ollama release first, then download its exact
    # browser_download_url. Never compare a project release digest with an
    # unrelated upstream download URL.
    $apiBase = "https://api.github.com/repos/Ding-Ding-Projects/material-ollama/releases"
    $releaseTag = if ($Version) {
        if ($Version.StartsWith('v')) { $Version } else { "v$Version" }
    } else { $null }
    $apiUrl = if ($releaseTag) { "$apiBase/tags/$([Uri]::EscapeDataString($releaseTag))" } else { "$apiBase/latest" }
    try {
        $release = Invoke-RestMethod -Uri $apiUrl -Headers @{ 'User-Agent' = 'material-ollama-install-helper' } -TimeoutSec 20
    } catch {
        throw "Unable to resolve the published Material Ollama release: $($_.Exception.Message)"
    }
    $assets = @($release.assets)
    if (-not $release.tag_name -or $release.draft -or $release.prerelease -or
        $assets.Count -ne 1 -or -not ($assets.name -contains 'OllamaSetup.exe')) {
        throw "The published release does not satisfy the exact one-asset contract; refusing installer verification."
    }
    $installerAsset = $assets | Where-Object name -eq 'OllamaSetup.exe' | Select-Object -First 1
    if ($installerAsset.browser_download_url -notmatch '^https://') { throw 'Published installer browser_download_url is not HTTPS.' }
    $digest = if ($installerAsset.digest -match '^sha256:([0-9a-f]{64})$') { $Matches[1] } else { $null }
    if (-not $digest) {
        $body = [string]$release.body
        $digest = [regex]::Match($body, 'OllamaSetup\.exe\s+[^\r\n]*SHA-256\s+`(?<hash>[0-9a-f]{64})`', [Text.RegularExpressions.RegexOptions]::IgnoreCase).Groups['hash'].Value
    }
    if ($digest -notmatch '^[0-9a-f]{64}$') { throw "The published release omitted a usable SHA-256 for the installer." }
    $digest = $digest.ToLowerInvariant()
    if ($ExpectedInstallerSha256 -and $ExpectedInstallerSha256 -notmatch '^[0-9a-f]{64}$') { throw 'Explicit ExpectedSha256 is not a 64-character hexadecimal digest.' }
    if ($ExpectedInstallerSha256 -and $ExpectedInstallerSha256 -ne $digest) { throw 'Explicit ExpectedSha256 does not match the published installer digest.' }
    $script:ExpectedInstallerSha256 = $digest
    $script:PublishedInstaller = [pscustomobject]@{
        tag = [string]$release.tag_name
        url = [string]$installerAsset.browser_download_url
        sha256 = $digest
        size = [int64]$installerAsset.size
    }
    Write-Status "  Resolved published installer SHA-256 from release $($release.tag_name)"
    return $script:PublishedInstaller
}

function Find-InnoSetupInstall {
    # Check both HKCU (per-user) and HKLM (per-machine) locations
    $possibleKeys = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$InnoSetupUninstallGuid",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$InnoSetupUninstallGuid",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\$InnoSetupUninstallGuid"
    )

    foreach ($key in $possibleKeys) {
        if (Test-Path $key) {
            Write-Status "  Found install at: $key"
            return $key
        }
    }
    return $null
}

function Update-SessionPath {
    # Update PATH in current session so 'ollama' works immediately
    if ($InstallDir) {
        $ollamaDir = $InstallDir
    } else {
        $ollamaDir = Join-Path $env:LOCALAPPDATA "Programs\Ollama"
    }

    # Add to PATH if not already present
    if (Test-Path $ollamaDir) {
        $currentPath = $env:PATH -split ';'
        if ($ollamaDir -notin $currentPath) {
            $env:PATH = "$ollamaDir;$env:PATH"
            Write-Status "  Added $ollamaDir to session PATH"
        }
    }
}

function Invoke-Download {
    param(
        [string]$Url,
        [string]$OutFile
    )

    Write-Status "  Downloading: $Url"
    try {
        $request = [System.Net.HttpWebRequest]::Create($Url)
        $request.AllowAutoRedirect = $true
        $response = $request.GetResponse()
        $totalBytes = $response.ContentLength
        $stream = $response.GetResponseStream()
        $fileStream = [System.IO.FileStream]::new($OutFile, [System.IO.FileMode]::Create)
        $buffer = [byte[]]::new(65536)
        $totalRead = 0
        $lastUpdate = [DateTime]::MinValue
        $barWidth = 40

        try {
            while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $fileStream.Write($buffer, 0, $read)
                $totalRead += $read

                $now = [DateTime]::UtcNow
                if (($now - $lastUpdate).TotalMilliseconds -ge 250) {
                    if ($totalBytes -gt 0) {
                        $pct = [math]::Min(100.0, ($totalRead / $totalBytes) * 100)
                        $filled = [math]::Floor($barWidth * $pct / 100)
                        $empty = $barWidth - $filled
                        $bar = ('#' * $filled) + (' ' * $empty)
                        $pctFmt = $pct.ToString("0.0")
                        Write-Host -NoNewline "`r$bar ${pctFmt}%"
                    } else {
                        $sizeMB = [math]::Round($totalRead / 1MB, 1)
                        Write-Host -NoNewline "`r${sizeMB} MB downloaded..."
                    }
                    $lastUpdate = $now
                }
            }

            # Final progress update
            if ($totalBytes -gt 0) {
                $bar = '#' * $barWidth
                Write-Host "`r$bar 100.0%"
            } else {
                $sizeMB = [math]::Round($totalRead / 1MB, 1)
                Write-Host "`r${sizeMB} MB downloaded.          "
            }
        } finally {
            $fileStream.Close()
            $stream.Close()
            $response.Close()
        }
    } catch {
        if ($_.Exception -is [System.Net.WebException]) {
            $webEx = [System.Net.WebException]$_.Exception
            if ($webEx.Response -and ([System.Net.HttpWebResponse]$webEx.Response).StatusCode -eq [System.Net.HttpStatusCode]::NotFound) {
                throw "Download failed: not found at $Url"
            }
        }
        if ($_.Exception.InnerException -is [System.Net.WebException]) {
            $webEx = [System.Net.WebException]$_.Exception.InnerException
            if ($webEx.Response -and ([System.Net.HttpWebResponse]$webEx.Response).StatusCode -eq [System.Net.HttpStatusCode]::NotFound) {
                throw "Download failed: not found at $Url"
            }
        }
        throw "Download failed for ${Url}: $($_.Exception.Message)"
    }
}

# --------------------------------------------------------------------------
# Uninstall
# --------------------------------------------------------------------------

function Invoke-Uninstall {
    Write-Step "Uninstalling Ollama"

    $regKey = Find-InnoSetupInstall
    if (-not $regKey) {
        Write-Host ">>> Ollama is not installed."
        return
    }

    $uninstallString = (Get-ItemProperty -Path $regKey).UninstallString
    if (-not $uninstallString) {
        Write-Warning "No uninstall string found in registry"
        return
    }

    # Strip quotes if present
    $uninstallExe = $uninstallString -replace '"', ''
    Write-Status "  Uninstaller: $uninstallExe"

    if (-not (Test-Path $uninstallExe)) {
        Write-Warning "Uninstaller not found at: $uninstallExe"
        return
    }

    Write-Host ">>> Launching uninstaller..."
    # Run with GUI so user can choose whether to keep models
    Start-Process -FilePath $uninstallExe -Wait

    # Verify removal
    if (Find-InnoSetupInstall) {
        Write-Warning "Uninstall may not have completed"
    } else {
        Write-Host ">>> Ollama has been uninstalled."
    }
}

# --------------------------------------------------------------------------
# Install
# --------------------------------------------------------------------------

function Invoke-Install {
    $published = Resolve-PublishedInstaller
    $installerUrl = $published.url

    # Download installer
    Write-Step "Downloading Ollama"
    if (-not $DebugInstall) {
        Write-Host ">>> Downloading Ollama for Windows..."
    }

    $tempInstaller = Join-Path $env:TEMP "OllamaSetup.exe"
    Invoke-Download -Url $installerUrl -OutFile $tempInstaller

    # This project deliberately ships unsigned installers; Authenticode is not
    # an integrity contract here.
    Write-Step "Verifying published SHA-256"
    if (-not (Test-InstallerHash -FilePath $tempInstaller)) {
        Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue
        throw "Installer SHA-256 verification failed"
    }

    # Build installer arguments
    $installerArgs = "/VERYSILENT /NORESTART /SUPPRESSMSGBOXES"
    if ($InstallDir) {
        $installerArgs += " /DIR=`"$InstallDir`""
    }
    Write-Status "  Installer args: $installerArgs"

    # Run installer
    Write-Step "Installing Ollama"
    if (-not $DebugInstall) {
        Write-Host ">>> Installing Ollama..."
    }

    # Create upgrade marker so the app starts hidden
    # The app checks for this file on startup and removes it after
    $markerDir = Join-Path $env:LOCALAPPDATA "Ollama"
    $markerFile = Join-Path $markerDir "upgraded"
    if (-not (Test-Path $markerDir)) {
        New-Item -ItemType Directory -Path $markerDir -Force | Out-Null
    }
    New-Item -ItemType File -Path $markerFile -Force | Out-Null
    Write-Status "  Created upgrade marker: $markerFile"

    # Start installer and wait for just the installer process (not children)
    # Using -Wait would wait for Ollama to exit too, which we don't want
    $proc = Start-Process -FilePath $tempInstaller `
        -ArgumentList $installerArgs `
        -PassThru
    $proc.WaitForExit()

    if ($proc.ExitCode -ne 0) {
        Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue
        throw "Installation failed with exit code $($proc.ExitCode)"
    }

    # Cleanup
    Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue

    # Update PATH in current session so 'ollama' works immediately
    Write-Step "Updating session PATH"
    Update-SessionPath

    Write-Host ">>> Install complete. Run 'ollama' from the command line."
}

# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

if ($Uninstall) {
    Invoke-Uninstall
} else {
    Invoke-Install
}
