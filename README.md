# 学生错题集

面向家长/学生的错题管理桌面应用：PDF 试卷自动切题录入、错题分类筛选、随机组卷打印、知识点薄弱分析，并接入国内多家 AI 厂商提供知识点自动打标、答案解析生成、同类题生成、整卷切分校对能力。

**架构**：Tauri 2 壳 + Python sidecar（FastAPI + SQLite + AI 代理）。Rust 只承担壳职责（启 sidecar、开窗口），业务零重写；数据保存在本机 SQLite（`~/.cuotiji/cuotiji.db`），无需部署服务器、无需联网（AI 功能可选）。

## 一、普通用户：下载安装包即用

在 [GitHub Actions](../../actions)（或 Releases）下载对应系统的构建产物：

### macOS

1. 下载 `cuotiji-macOS`，解压得到 `.dmg`，双击挂载后把「错题集」拖入 Applications（建议固定安装在这里，不要装到多处）。
2. 首次打开如被 Gatekeeper 拦截：右键 → 打开（未签名应用的正常提示）。
3. **更新**：新版本同样拖入 Applications 即可，会因同名同标识符（`com.stevesunyifan.error-notebook`）直接覆盖旧版本，不会产生第二个 App；数据在 `~/.cuotiji/`，与 App 本体无关，升级不丢。

### Windows

1. 下载 `cuotiji-Windows`，解压得到 NSIS 安装包 `错题集-setup.exe`，双击安装后运行。
2. 如被 SmartScreen 提示，点「更多信息 → 仍要运行」。

应用启动后内置本地服务会自动运行，窗口直接显示错题集页面；退出应用时服务一并关闭。

### 数据位置与备份

- 数据库：`~/.cuotiji/cuotiji.db`（macOS/Linux）或 `C:\Users\<用户名>\.cuotiji\cuotiji.db`（Windows）
- 运行日志：同目录 `app.log`
- AI 配置（API Key）：同目录 `config.json`
- **备份**：复制 `cuotiji.db` 即可；也可在页面顶部「导出数据」下载 JSON。换电脑时放回原路径即恢复全部数据。

### AI 使用（可选）

打开页面右上角「AI 设置」：选择厂商（GLM 智谱 / DeepSeek / Kimi / MiniMax / Qwen / 自定义），填入 API Key，保存后「测试连接」。选 **Mock** 无需 Key，返回模拟数据供体验流程。不配置 AI 不影响其他功能。

> 若窗口显示 "Local service failed to start"，请查看 `~/.cuotiji/app.log` 排查。

## 二、开发者：源码运行 / 自行打包

```
cuotiji/
├── demo/            # 网页前端（原生 HTML/CSS/JS，由 FastAPI 托管）
├── server/          # FastAPI：AI 代理 + 题目 CRUD（SQLite）
├── launcher.py      # Python 入口（开发者模式 / --port sidecar 模式）
├── cuotiji.spec     # PyInstaller 配置 → python-server sidecar
├── src-tauri/       # Tauri 2 壳（Rust）
├── build_macos.sh / build_windows.bat   # 一键打包脚本
└── .github/workflows/build.yml          # tag 推送自动双平台构建
```

### 前置

- Python 3.10+（3.9 亦可，代码已兼容）
- Rust stable + cargo-tauri：`curl https://sh.rustup.rs -sSf | sh && cargo install tauri-cli --version '^2'`
- Xcode 命令行工具（macOS）

### 源码运行（最快调试，浏览器版）

```bash
cd cuotiji
python3 -m venv .venv && source .venv/bin/activate
pip install -r server/requirements.txt
python launcher.py          # 自动选端口并打开浏览器
```

### 构建桌面安装包

```bash
# macOS（产出 .app + .dmg）
./build_macos.sh

# Windows（在 Windows 机器上执行，产出 NSIS .exe）
build_windows.bat
```

或推一个 `v*` 标签，GitHub Actions 自动在 macOS / Windows 上构建并上传 artifact。

### 说明

- sidecar 由 PyInstaller 打成 `python-server-<target-triple>` 放入 `src-tauri/binaries/`，随应用打包。
- 数据库与配置在首次启动时自动创建于 `~/.cuotiji/`。
- 旧版浏览器 localStorage 数据会在首次启动时自动迁移到 SQLite。
- 详细设计见 [docs/方案文档.md](docs/方案文档.md)。
