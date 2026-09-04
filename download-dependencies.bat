@echo off
setlocal DisableDelayedExpansion
set "SCRIPT_DIR=%~dp0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%POWERSHELL_EXE%" exit /b 1
set "PATH_OUTPUT=%TEMP%\material-ollama-path-%RANDOM%-%RANDOM%.txt"
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\root-build.ps1" -DependenciesOnly -PathOutput "%PATH_OUTPUT%"
if errorlevel 1 exit /b %errorlevel%
rem Export the verified process path without executing a generated script.
for /f "usebackq delims=" %%P in ("%PATH_OUTPUT%") do (
  del "%PATH_OUTPUT%"
  endlocal
  set "PATH=%%P"
  exit /b 0
)
del "%PATH_OUTPUT%" 2>nul
exit /b 1
