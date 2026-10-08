@echo off
rem Windows 一键构建：建 venv → 装依赖 + pyinstaller → 打包 onefile
setlocal
cd /d %~dp0

echo ==^> 创建构建虚拟环境 .venv-build
python -m venv .venv-build 2>nul || py -m venv .venv-build
if errorlevel 1 (echo 未找到 Python，请先安装 Python 3.10+ & exit /b 1)

call .venv-build\Scripts\activate.bat

echo ==^> 安装运行依赖与打包工具
python -m pip install -q --upgrade pip
pip install -q -r server\requirements.txt -r build-requirements.txt

echo ==^> 执行 PyInstaller 打包（onefile / windowed）
pyinstaller --clean -y cuotiji.spec

echo.
echo 构建完成：dist\cuotiji.exe
echo 双击即可运行；数据文件位于 %%USERPROFILE%%\.cuotiji\cuotiji.db
endlocal
