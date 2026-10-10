# 学生错题集

面向家长/学生的错题管理桌面应用：PDF 试卷自动切题录入、错题分类筛选、随机组卷打印、知识点薄弱分析，并接入国内多家 AI 厂商提供知识点自动打标、答案解析生成、同类题生成、整卷切分校对能力。

**架构**：Tauri 2 壳 + **进程内嵌 Rust/axum 后端**（axum + rusqlite + reqwest + rust-embed）。无 Python 依赖、无 sidecar；demo/ 前端由 Rust 服务直接托管，18 个 REST 路由与原 Python 版逐字段一致。数据保存在本机 SQLite（`~/.cuotiji/cuotiji.db`），无需部署服务器、无需联网（AI 功能可选）。

## 一、普通用户：下载安装包即用

在 [GitHub Actions](../../actions)（或 Releases）下载对应系统的构建产物：

### macOS

1. 下载 `cuotiji-macOS`，解压得到 `.dmg`，双击挂载后把「错题集」拖入 Applications（或任意目录）。
2. 首次打开如被 Gatekeeper 拦截：右键 → 打开（未签名应用的正常提示）。

### Windows

1. 下载 `cuotiji-Windows`，解压得到 NSIS 安装包，双击安装后运行。
2. 如被 SmartScreen 提示，点「更多信息 → 仍要运行」。

### Android

已取消移动端开发（2026-10 决策），仅维护 macOS 与 Windows。历史版本的 Android 相关代码与构建链已移除。

应用启动后内置本地服务会自动运行，窗口直接显示错题集页面；退出应用时服务一并关闭。启动到可用 <1 秒。

### 数据位置与备份

- 数据库：`~/.cuotiji/cuotiji.db`（macOS/Linux）或 `C:\Users\<用户名>\.cuotiji\cuotiji.db`（Windows）
- AI 配置（API Key）：同目录 `config.json`
- **备份**：复制 `cuotiji.db` 即可；也可在页面顶部「导出数据」下载 JSON。换电脑时放回原路径即恢复全部数据。

### AI 使用（可选）

打开页面右上角「AI 设置」：选择厂商（GLM 智谱 / DeepSeek / Kimi / MiniMax / Qwen / 自定义），填入 API Key，保存后「测试连接」。选 **Mock** 无需 Key，返回模拟数据供体验流程。不配置 AI 不影响其他功能。

## 二、开发者：源码运行 / 自行打包

```
cuotiji/
├── demo/            # 网页前端（原生 HTML/CSS/JS）
├── src-tauri/       # Tauri 2 壳 + Rust 后端（axum/rusqlite/reqwest/rust-embed）
├── server/          # legacy Python 版（FastAPI），保留作参考，生产不再使用
├── launcher.py      # legacy Python 入口（开发者可用 python launcher.py 起 Python 版对比调试）
├── build_macos.sh / build_windows.bat
└── .github/workflows/build.yml   # tag 推送自动构建 macOS / Windows
```

### 前置

- Rust stable + cargo-tauri：`curl https://sh.rustup.rs -sSf | sh && cargo install tauri-cli --version '^2'`
- Xcode 命令行工具（macOS）

### 源码运行（桌面）

```bash
cd cuotiji/src-tauri
cargo tauri dev        # 开发模式（自动重编译并打开窗口）
# 无窗口调试（对拍/脚本用）：
CUOTIJI_HEADLESS=1 CUOTIJI_HEADLESS_PORT=8000 cargo run
```

### 构建

```bash
./build_macos.sh        # macOS：.app + .dmg
build_windows.bat       # Windows（在 Windows 机器上）：NSIS .exe
```

或推一个 `v*` 标签，GitHub Actions 自动构建 macOS / Windows 安装包并上传 artifact。

### 测试

```bash
cd src-tauri
cargo test     # Prompt/Mock 与 Python 版逐字对拍（5 项）
cargo clippy   # 静态检查
```

### 说明

- 数据库 schema 与旧 Python 版逐字段一致，**旧数据零迁移**：直接用 Rust 版打开 `~/.cuotiji/cuotiji.db` 即可。
- 环境变量 `CUOTIJI_DATA_DIR` 可覆盖数据目录（桌面版）。
- legacy Python 版（`server/` + `launcher.py`）仍可用 `python launcher.py` 启动，便于对比调试；两者 API 已逐路由对拍一致。
- 详细设计见 [docs/方案文档.md](docs/方案文档.md)。
