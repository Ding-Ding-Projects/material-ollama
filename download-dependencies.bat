@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%POWERSHELL_EXE%" (
  echo [download-dependencies.bat] ERROR: Windows PowerShell 5.1 was not found at "%POWERSHELL_EXE%".
  exit /b 1
)
set "SILENT=0"
if /I "%~1"=="/s" set "SILENT=1"
if /I "%~1"=="--silent" set "SILENT=1"
if "%SILENT%"=="1" echo [download-dependencies.bat] Silent mode enabled.
set "SILENT_ARG="
if "%SILENT%"=="1" set "SILENT_ARG=-Silent"
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\bootstrap_windows_prerequisites.ps1" -ManifestPath "%SCRIPT_DIR%scripts\release-dependencies.json" %SILENT_ARG%
if errorlevel 1 exit /b %errorlevel%
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\bootstrap_windows_tools.ps1" -ManifestPath "%SCRIPT_DIR%scripts\release-dependencies.json"
if errorlevel 1 exit /b %errorlevel%
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\fetch-webview2.ps1" -ManifestPath "%SCRIPT_DIR%scripts\release-dependencies.json" -OutputRoot "%SCRIPT_DIR%dist\webview2"
if errorlevel 1 exit /b %errorlevel%
rem Child PowerShell processes cannot mutate this cmd.exe PATH. Refresh the
rem well-known user-scoped tool locations before the caller runs its next step.
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%ProgramFiles%\Go\bin;%ProgramFiles%\7-Zip;%PATH%"
echo [download-dependencies.bat] Verified all pinned Windows build dependencies.
exit /b 0
