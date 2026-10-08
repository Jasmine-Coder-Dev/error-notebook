#!/usr/bin/env bash
# macOS 一键构建：建 venv → 装依赖 + pyinstaller → 打包 onefile
set -euo pipefail
cd "$(dirname "$0")"

PY=python3
command -v python3 >/dev/null 2>&1 || { echo "未找到 python3，请先安装 Xcode 命令行工具或 Python"; exit 1; }

echo "==> 创建构建虚拟环境 .venv-build"
$PY -m venv .venv-build
# shellcheck disable=SC1091
source .venv-build/bin/activate

echo "==> 安装运行依赖与打包工具"
pip install -q --upgrade pip
pip install -q -r server/requirements.txt -r build-requirements.txt

echo "==> 执行 PyInstaller 打包（onefile / windowed）"
pyinstaller --clean -y cuotiji.spec

echo ""
echo "构建完成：dist/cuotiji"
echo "双击即可运行；数据文件位于 ~/.cuotiji/cuotiji.db"
