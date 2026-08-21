@echo off
setlocal

rem Voice Bridge API launcher.
rem   VDC_ROOT            : Voice-Design-Cloner checkout directory
rem   VOICE_BRIDGE_PYTHON : python.exe to use (needs torch / soundfile / fastapi)
rem                         if unset, tries VDC venv, VDC .venv, then Irodori-TTS venv
rem   VOICE_BRIDGE_PORT   : listen port (default 8791)
rem   HF_HUB_OFFLINE      : defaults to 1 (SSL to huggingface.co fails in this
rem                         environment). Set to 0 before launch to fetch new models.

if "%VDC_ROOT%"=="" set "VDC_ROOT=E:\AI\Voice-Design-Cloner"
if "%VOICE_BRIDGE_PORT%"=="" set "VOICE_BRIDGE_PORT=8791"
if "%HF_HUB_OFFLINE%"=="" set "HF_HUB_OFFLINE=1"

set "SERVER_PY=%~dp0server.py"

if not "%VOICE_BRIDGE_PYTHON%"=="" goto check_paths

if exist "%VDC_ROOT%\venv\Scripts\python.exe" (
    set "VOICE_BRIDGE_PYTHON=%VDC_ROOT%\venv\Scripts\python.exe"
    goto check_paths
)
if exist "%VDC_ROOT%\.venv\Scripts\python.exe" (
    set "VOICE_BRIDGE_PYTHON=%VDC_ROOT%\.venv\Scripts\python.exe"
    goto check_paths
)
if exist "%USERPROFILE%\.vdc-engines\Irodori-TTS\.venv\Scripts\python.exe" (
    set "VOICE_BRIDGE_PYTHON=%USERPROFILE%\.vdc-engines\Irodori-TTS\.venv\Scripts\python.exe"
    goto check_paths
)

echo [voice-bridge] ERROR: no python.exe found. Checked:
echo [voice-bridge]   "%VDC_ROOT%\venv\Scripts\python.exe"
echo [voice-bridge]   "%VDC_ROOT%\.venv\Scripts\python.exe"
echo [voice-bridge]   "%USERPROFILE%\.vdc-engines\Irodori-TTS\.venv\Scripts\python.exe"
echo [voice-bridge] Run Voice-Design-Cloner setup.bat or set VOICE_BRIDGE_PYTHON.
pause
exit /b 1

:check_paths
if not exist "%VOICE_BRIDGE_PYTHON%" (
    echo [voice-bridge] ERROR: python not found: "%VOICE_BRIDGE_PYTHON%"
    pause
    exit /b 1
)
if not exist "%SERVER_PY%" (
    echo [voice-bridge] ERROR: server.py not found: "%SERVER_PY%"
    pause
    exit /b 1
)
if not exist "%VDC_ROOT%\modules\model_manager.py" (
    echo [voice-bridge] ERROR: Voice-Design-Cloner not found at "%VDC_ROOT%"
    echo [voice-bridge] Set VDC_ROOT to your Voice-Design-Cloner checkout.
    pause
    exit /b 1
)

echo [voice-bridge] VDC_ROOT=%VDC_ROOT%
echo [voice-bridge] PYTHON=%VOICE_BRIDGE_PYTHON%
echo [voice-bridge] PORT=%VOICE_BRIDGE_PORT%
"%VOICE_BRIDGE_PYTHON%" "%SERVER_PY%"
pause
