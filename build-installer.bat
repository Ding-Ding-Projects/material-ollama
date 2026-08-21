@echo off
setlocal enabledelayedexpansion
set "SCRIPT_DIR=%~dp0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%POWERSHELL_EXE%" (
  echo [build-installer.bat] ERROR: Windows PowerShell 5.1 was not found at "%POWERSHELL_EXE%".
  exit /b 1
)
set "SILENT=0"
if /I "%~1"=="/s" set "SILENT=1"
if /I "%~1"=="--silent" set "SILENT=1"
call "%SCRIPT_DIR%build.bat" /s cpu cpuArm64 ollama ollamaArm64 app appArm64 deps sign installer zip
if errorlevel 1 exit /b %errorlevel%
if not exist "%SCRIPT_DIR%dist\OllamaSetup.exe" (
  echo [build-installer.bat] ERROR: expected dist\OllamaSetup.exe was not produced.
  exit /b 1
)
for %%F in ("%SCRIPT_DIR%dist\OllamaSetup.exe") do set "INSTALLER=%%~fF"
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\verify-unsigned-installer.ps1" -Path "%INSTALLER%"
if errorlevel 1 (
  echo [build-installer.bat] ERROR: installer is not verified as unsigned; no release or upload action is performed.
  exit /b 1
)
set "SOURCE_COMMIT="
for /f "tokens=*" %%C in ('git -C "%SCRIPT_DIR%" rev-parse HEAD') do set "SOURCE_COMMIT=%%C"
if "%SOURCE_COMMIT%"=="" (
  echo [build-installer.bat] ERROR: source commit could not be resolved for embedded installer provenance.
  exit /b 1
)
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\verify-installer-artifact.ps1" -Path "%INSTALLER%" -ExpectedCommit "%SOURCE_COMMIT%"
if errorlevel 1 (
  echo [build-installer.bat] ERROR: installer is not a non-empty PE carrying the intended source commit.
  exit /b 1
)
echo [build-installer.bat] No release or upload action is performed by this script.
exit /b 0
