@echo off
rem Windows 一键构建（Tauri 2 + 内嵌 Rust 后端，无 Python sidecar）
rem 产物：src-tauri\target\release\bundle\nsis\错题集-setup.exe
setlocal
cd /d %~dp0

where cargo >nul 2>nul
if errorlevel 1 (echo 未找到 Rust，请先安装 https://rustup.rs & exit /b 1)

set PATH=%USERPROFILE%\.cargo\bin;%PATH%
cargo tauri --version >nul 2>nul
if errorlevel 1 cargo install tauri-cli --version "^2"

echo ==^> cargo tauri build
cd src-tauri
cargo tauri build
echo.
echo 构建完成：src-tauri\target\release\bundle\nsis\错题集-setup.exe
endlocal
