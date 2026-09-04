@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%POWERSHELL_EXE%" (
  echo [build-installer.bat] ERROR: Windows PowerShell 5.1 was not found at "%POWERSHELL_EXE%".
  exit /b 1
)

call "%SCRIPT_DIR%build.bat" /s cpu cpuArm64 ollama ollamaArm64 app appArm64 deps installer
if errorlevel 1 exit /b %errorlevel%

set "SOURCE_COMMIT="
for /f "tokens=*" %%C in ('git -C "%SCRIPT_DIR%" rev-parse HEAD') do set "SOURCE_COMMIT=%%C"
if "%SOURCE_COMMIT%"=="" (
  echo [build-installer.bat] ERROR: source commit could not be resolved for Squirrel provenance.
  exit /b 1
)

"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\verify-squirrel-build.ps1" -OutputRoot "%SCRIPT_DIR%dist\squirrel-windows" -ExpectedCommit "%SOURCE_COMMIT%"
if errorlevel 1 (
  echo [build-installer.bat] ERROR: Squirrel.Windows outputs were not verified; no release or upload action is performed.
  exit /b 1
)
echo [build-installer.bat] Squirrel.Windows outputs are unsigned and verified for x64 and arm64.
echo [build-installer.bat] No release or upload action is performed by this script.
exit /b 0
