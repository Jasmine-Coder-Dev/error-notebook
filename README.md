# 学生错题集

面向家长/学生的错题管理桌面应用：PDF 试卷自动切题录入、错题分类筛选、随机组卷打印、知识点薄弱分析，并接入国内多家 AI 厂商提供知识点自动打标、答案解析生成、同类题生成、整卷切分校对能力。

数据保存在本机 SQLite 数据库（`~/.cuotiji/cuotiji.db`），无需部署服务器、无需联网（AI 功能可选）。

## 一、普通用户：下载安装包双击即用

在 [GitHub Actions](../../actions)（或 Releases）下载对应系统的构建产物：

### macOS

1. 下载 `cuotiji-macos-latest` 压缩包并解压，得到 `cuotiji`。
2. 双击运行（首次如被 Gatekeeper 拦截：右键 → 打开）。
3. 自动启动本地服务并用默认浏览器打开页面；菜单栏/程序坞中出现运行中的程序。

### Windows

1. 下载 `cuotiji-windows-latest` 压缩包并解压，得到 `cuotiji.exe`。
2. 双击运行（如被 SmartScreen 提示，点「更多信息 → 仍要运行」）。
3. 自动打开浏览器页面。关闭浏览器后程序仍在后台托盘/任务管理器中运行，直接退出进程即可。

### 数据位置与备份

- 数据库：`~/.cuotiji/cuotiji.db`（macOS/Linux）或 `C:\Users\<用户名>\.cuotiji\cuotiji.db`（Windows）
- 运行日志：同目录 `app.log`
- AI 配置（API Key）：同目录 `config.json`
- **备份**：复制 `cuotiji.db` 即可；也可在页面顶部「导出数据」下载 JSON。换电脑时把 `cuotiji.db` 放回原路径即恢复全部数据。

### AI 使用（可选）

打开页面右上角「AI 设置」：选择厂商（GLM 智谱 / DeepSeek / Kimi / MiniMax / Qwen / 自定义），填入 API Key，保存后「测试连接」。选 **Mock** 无需 Key，返回模拟数据供体验流程。不配置 AI 不影响其他功能。

> 首次打开若页面提示「无法连接本地服务」，说明应用未在运行，请先双击应用图标。

## 二、开发者：源码运行 / 自行打包

```
cuotiji/
├── demo/            # 前端（原生 HTML/CSS/JS）
├── server/          # FastAPI：AI 代理 + 题目 CRUD（SQLite）
├── launcher.py      # 桌面入口（自动端口 + 开浏览器）
├── cuotiji.spec     # PyInstaller 配置（onefile / windowed）
├── build_macos.sh / build_windows.bat   # 一键打包脚本
└── .github/workflows/build.yml          # tag 推送自动双平台构建
```

### 源码运行

```bash
cd cuotiji
python3 -m venv .venv && source .venv/bin/activate
pip install -r server/requirements.txt
python launcher.py          # 推荐：自动选端口并打开浏览器
# 或
uvicorn server.main:app --port 8000   # 然后访问 http://localhost:8000
```

### 自行打包

```bash
# macOS
./build_macos.sh        # 产物 dist/cuotiji

# Windows（在 Windows 机器上执行）
build_windows.bat       # 产物 dist\cuotiji.exe
```

或推一个 `v*` 标签，GitHub Actions 自动在 macOS / Windows 上构建并上传 artifact。

### 说明

- 数据库与配置在首次启动时自动创建于 `~/.cuotiji/`。
- 旧版浏览器 localStorage 数据会在首次启动时自动迁移到 SQLite。
- 详细设计见 [docs/方案文档.md](docs/方案文档.md)。
