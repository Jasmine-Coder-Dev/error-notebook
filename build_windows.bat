@echo off
rem Windows 一键构建（Tauri 2 壳 + Python sidecar）
rem 1) PyInstaller 构建 sidecar（x86_64-pc-windows-msvc）放入 src-tauri\binaries
rem 2) cargo tauri build --release 产出 NSIS 安装包
setlocal
cd /d %~dp0

set TRIPLE=x86_64-pc-windows-msvc
set SIDECAR=src-tauri\binaries\python-server-%TRIPLE%.exe

echo ==^> [1/2] PyInstaller 构建 sidecar（%TRIPLE%）
python -m venv .venv-build 2>nul || py -m venv .venv-build
if errorlevel 1 (echo 未找到 Python，请先安装 Python 3.10+ & exit /b 1)
call .venv-build\Scripts\activate.bat
python -m pip install -q --upgrade pip
pip install -q -r server\requirements.txt -r build-requirements.txt
pyinstaller --clean -y cuotiji.spec
if not exist src-tauri\binaries mkdir src-tauri\binaries
copy /y dist\python-server.exe "%SIDECAR%" >nul
echo sidecar: %SIDECAR%

echo ==^> [2/2] cargo tauri build
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
cargo tauri build

echo.
echo 构建完成：src-tauri\target\release\bundle\nsis\错题集.exe
endlocal
