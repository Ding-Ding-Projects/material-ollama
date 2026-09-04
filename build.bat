@echo off
setlocal DisableDelayedExpansion
set "SCRIPT_DIR=%~dp0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%POWERSHELL_EXE%" exit /b 1
set "BUILD_STEPS="
set "SILENT_ARG="
set "RUN_ARG="
set "FAST_ARG="
if /I "%MATERIAL_OLLAMA_BUILD_MODE%"=="release-fast" set "FAST_ARG=-ReleaseFast"
if "%SILENT%"=="1" set "SILENT_ARG=-SilentMode"
if "%RUN_AFTER_BUILD%"=="1" set "RUN_ARG=-RunAfterBuild"
:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="/s" goto arg_silent
if /I "%~1"=="--silent" goto arg_silent
if /I "%~1"=="/run" goto arg_run
if /I "%~1"=="--run" goto arg_run
if /I "%~1"=="--release-fast" goto arg_fast
set "BUILD_STEPS=%BUILD_STEPS% "%~1""
shift
goto parse_args
:arg_silent
set "SILENT_ARG=-SilentMode"
shift
goto parse_args
:arg_run
set "RUN_ARG=-RunAfterBuild"
shift
goto parse_args
:args_done
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\root-build.ps1" %SILENT_ARG% %RUN_ARG% %FAST_ARG% %BUILD_STEPS%
exit /b %errorlevel%
:arg_fast
set "FAST_ARG=-ReleaseFast"
shift
goto parse_args
