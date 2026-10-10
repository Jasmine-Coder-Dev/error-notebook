#!/usr/bin/env bash
# macOS 一键构建（Tauri 2 壳 + Python sidecar）：
# 1) PyInstaller 把 server/ 打成 sidecar 二进制，命名带 target triple 放入 src-tauri/binaries/
# 2) cargo tauri build 产出 .app 与 .dmg
set -euo pipefail
cd "$(dirname "$0")"

PY=python3
command -v python3 >/dev/null 2>&1 || { echo "未找到 python3，请先安装 Xcode 命令行工具或 Python"; exit 1; }

TRIPLE="aarch64-apple-darwin"
case "$(uname -m)" in
  x86_64) TRIPLE="x86_64-apple-darwin" ;;
esac
SIDECAR="src-tauri/binaries/python-server-${TRIPLE}"

echo "==> [1/2] PyInstaller 构建 sidecar（${TRIPLE}）"
$PY -m venv .venv-build
# shellcheck disable=SC1091
source .venv-build/bin/activate
pip install -q --upgrade pip
pip install -q -r server/requirements.txt -r build-requirements.txt
pyinstaller --clean -y cuotiji.spec
mkdir -p src-tauri/binaries
cp dist/python-server "$SIDECAR"
chmod +x "$SIDECAR"
echo "sidecar: $SIDECAR"

echo "==> [2/2] cargo tauri build"
export PATH="$HOME/.cargo/bin:$PATH"
cargo tauri build

echo ""
echo "构建完成："
echo "  .app: src-tauri/target/release/bundle/macos/错题集.app"
echo "  .dmg: src-tauri/target/release/bundle/dmg/*.dmg"
