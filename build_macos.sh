#!/usr/bin/env bash
# macOS 一键构建（Tauri 2 + 内嵌 Rust 后端，无 Python sidecar）
# 产物：src-tauri/target/release/bundle/macos/ 下的 .app 与 .dmg
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v cargo >/dev/null 2>&1; then
  echo "未找到 Rust，请先安装：curl https://sh.rustup.rs -sSf | sh"
  exit 1
fi

echo "==> cargo tauri build"
export PATH="$HOME/.cargo/bin:$PATH"
if ! cargo tauri --version >/dev/null 2>&1; then
  cargo install tauri-cli --version '^2'
fi
(cd src-tauri && cargo tauri build)

echo ""
echo "构建完成："
echo "  .app: src-tauri/target/release/bundle/macos/错题集.app"
echo "  .dmg: src-tauri/target/release/bundle/dmg/*.dmg"
