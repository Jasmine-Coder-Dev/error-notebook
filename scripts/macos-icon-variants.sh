#!/usr/bin/env bash
# macOS 图标双外观注入：有完整 Xcode（actool 可用）时编译含 Any/Dark 双外观的
# asset catalog 并注入 .app；否则跳过（回退 tauri icon 生成的普通 icns）。
# 用法: scripts/macos-icon-variants.sh <path/to/错题集.app>
set -euo pipefail
APP="$1"
cd "$(dirname "$0")/.."
if ! ACTOOL=$(DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun -f actool 2>/dev/null); then
  echo "[icon] actool 不可用（CLT 或未同意许可），跳过双外观注入"
  exit 0
fi
OUT=$(mktemp -d)
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun actool \
  --compile "$OUT" --minimum-deployment-target 11.0 --platform macosx \
  --app-icon AppIcon --output-partial-info-plist "$OUT/plist.plist" \
  src-tauri/icon.xcassets >/dev/null 2>&1 || { echo "[icon] actool 编译失败，跳过"; exit 0; }
if [ -d "$OUT/AppIcon.acet" ] || compgen -G "$OUT/*.car" >/dev/null; then
  mkdir -p "$APP/Contents/Resources"
  find "$OUT" -name '*.car' -exec cp {} "$APP/Contents/Resources/Assets.car" \; || true
  if [ -f "$APP/Contents/Resources/Assets.car" ]; then
    /usr/libexec/PlistBuddy -c "Set :CFBundleIconName AppIcon" "$APP/Contents/Info.plist" 2>/dev/null \
      || /usr/libexec/PlistBuddy -c "Add :CFBundleIconName string AppIcon" "$APP/Contents/Info.plist"
    echo "[icon] 已注入 Any/Dark 双外观（Assets.car + CFBundleIconName）"
  else
    echo "[icon] 未找到 Assets.car，跳过"
  fi
else
  echo "[icon] 未找到编译产物，跳过"
fi
rm -rf "$OUT"
