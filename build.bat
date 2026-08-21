@echo off
setlocal enabledelayedexpansion

rem build.bat - repository-root gate + delegated Windows build.
rem
rem Before any packaging step runs, this proves the shared user-facing
rem feature inventory is genuinely fail-closed:
rem
rem   1. the checker's own --self-test case table must pass: every guard it
rem      knows how to raise turns red on its own exact mutation and green
rem      again after restoration (a guard nobody has watched fail proves
rem      nothing);
rem   2. the current docs\features\uh-completeness\inventory.json must pass
rem      the plain structural + evidence-resolution check with no flags.
rem
rem Only once both are green does this delegate to scripts\build_windows.ps1
rem for the real Windows build. /s and --silent are consumed here instead of
rem being mistaken for build step names. SILENT=1 selects the same touchless
rem route. Every remaining argument is passed to build_windows.ps1's step-name
rem argument list (for example `build.bat /s app` builds only the app step);
rem with no step names build_windows.ps1 runs its full default build.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%POWERSHELL_EXE%" (
    echo [build.bat] ERROR: Windows PowerShell 5.1 was not found at "%POWERSHELL_EXE%".
    exit /b 1
)

set "BUILD_STEPS="
set "SILENT_MODE=0"
:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="/s" goto arg_silent
if /I "%~1"=="--silent" goto arg_silent
set "BUILD_STEPS=!BUILD_STEPS! "%~1""
shift
goto parse_args

:arg_silent
set "SILENT=1"
set "SILENT_MODE=1"
shift
goto parse_args

:args_done
if /I "%SILENT%"=="1" set "SILENT_MODE=1"
if "%SILENT_MODE%"=="1" echo [build.bat] Silent mode enabled; no build prompt will be shown.

echo [build.bat] Verifying pinned Windows build dependencies...
call "%SCRIPT_DIR%download-dependencies.bat" /s
if errorlevel 1 (
    echo [build.bat] ERROR: dependency bootstrap failed.
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo [build.bat] ERROR: node was not found on PATH. Install Node.js and try again.
    exit /b 1
)

echo [build.bat] Running inventory checker self-test ^(guard-of-guards^)...
call node scripts\check-uh-inventory.mjs --self-test
if errorlevel 1 (
    echo [build.bat] ERROR: inventory checker self-test failed. The fail-closed gate itself is broken - fix scripts\check-uh-inventory.mjs before building.
    exit /b 1
)

echo [build.bat] Running inventory structural + evidence check...
call node scripts\check-uh-inventory.mjs
if errorlevel 1 (
    echo [build.bat] ERROR: inventory structural check failed. Fix docs\features\uh-completeness\inventory.json before building.
    exit /b 1
)

echo [build.bat] Running vocabulary hash lock check...
call node scripts\check-vocabulary.mjs
if errorlevel 1 (
    echo [build.bat] ERROR: vocabulary hash lock check failed. A private vocabulary source was found but does not match its lock - see the message above, review the change, then re-run `node scripts\check-vocabulary.mjs --lock`.
    exit /b 1
)

echo [build.bat] Inventory gate is green. Delegating to scripts\build_windows.ps1...
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\build_windows.ps1" %BUILD_STEPS%
if errorlevel 1 (
    echo [build.bat] ERROR: scripts\build_windows.ps1 failed.
    exit /b 1
)

echo [build.bat] Build complete.
exit /b 0
