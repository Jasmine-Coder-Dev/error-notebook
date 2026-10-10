<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="96" alt="错题集 icon"/>

# 错题集 · ErrorNotebook

**本地优先的智能错题管理工具 —— 试卷秒变错题本，AI 找出薄弱点，一键组卷打印**

[![CI](https://github.com/SteveSunYifan/error-notebook/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/SteveSunYifan/error-notebook/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/SteveSunYifan/error-notebook?color=blue)](https://github.com/SteveSunYifan/error-notebook/releases)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-9cf)](#-快速开始)
[![Stars](https://img.shields.io/github/stars/SteveSunYifan/error-notebook?style=social)](https://github.com/SteveSunYifan/error-notebook/stargazers)

**[English](README.en.md)** | 中文

**数据 100% 本地存储 · 无账号无云端 · AI 可选自配** · 安装包仅 4~6MB · 启动 <1 秒

</div>

---

## 💡 为什么做这个工具

孩子每次考试的错题散落在试卷、练习册、照片里，家长手工抄题整理费时费力，买来的错题本 App 又强推云账号和订阅。这个项目把整条链路自动化：**上传试卷 → 自动切题 → 勾选错题 → AI 打知识点标签 → 按薄弱点组卷打印**，全程本地运行，数据永远在你自己电脑上。

## ✨ 功能特性

### 录入

| 功能 | 状态 | 说明 |
| --- | :-: | --- |
| 📄 PDF 试卷上传自动切题 | ✅ | 兼容 `1.` `1、` `(1)` `第1题` 等常见题号格式，预览可编辑 |
| 📝 Word (.docx) 上传切题 | ✅ | 纯 Rust 解析，无需 Office |
| 🖼 图片上传 AI 识别 | ✅ | 拍照/截图 → 视觉模型提取文字 → 切题（需配置视觉模型） |
| ✍️ 手动录入 | ✅ | 题干/答案/错误原因/知识点 |
| 🤖 AI 整卷切分校对 | ✅ | 合并误切、拆出漏切、自动识别题型 |
| 🎯 题型自动识别落库 | 🚧 | 规划中：选择题/应用题/案例分析等按学段词表（[方案](docs/受众扩展方案.md#41-统计分析功能设计一期新增重点)） |

### 整理与分析

| 功能 | 状态 | 说明 |
| --- | :-: | --- |
| 🗂 多维分类筛选 | ✅ | 年级 × 学期 × 科目 × 知识点 × 掌握状态 + 关键词搜索 |
| 🤖 AI 知识点自动打标 | ✅ | 从知识点目录约束选取，口径统一；支持 GLM/DeepSeek/Kimi/MiniMax/Qwen |
| 🤖 AI 答案解析生��� | ✅ | 补全参考答案与解题过程 |
| 🤖 AI 同类题生成 | ✅ | 针对薄弱知识点出变式练习，可入库可组卷 |
| 📊 知识点薄弱分析 | ✅ | 错题按知识点聚合条形图，点击一键针对出卷 |
| 📈 题型统计分析 | 🚧 | 规划中：题型×错题数柱状图/饼图 + 点击下钻 |
| 🧠 知识点掌握度加权 | 🚧 | 规划中：正确率×时间衰减（对标学而思学习机） |
| 🎓 多学段受众（大学/职业考试） | 🚧 | 规划中：学段分类体系 + 中级会计/法考/教资/考研知识点目录 |

### 练习与输出

| 功能 | 状态 | 说明 |
| --- | :-: | --- |
| 🎲 条件抽题组卷 | ✅ | 按筛选条件随机抽 N 题，附答题留白，可选答案页 |
| 🖨 一键打印 | ✅ | 系统原生打印管线，支持任何打印机/导出 PDF |
| 🌗 明暗双主题 | ✅ | 自动跟随系统 + 手动三态切换 |
| ⏰ 间隔重复复习计划 | 🚧 | 规划中：Anki 式 1/3/7/15 天重做提醒 |
| 📝 模考模式 | 🚧 | 规划中：抽卷计时 + 自评 |
| 🪟 平台原生材质 UI | 🚧 | 规划中：macOS 液态玻璃 / Windows 11 Mica + 侧边栏导航（[方案](docs/受众扩展方案.md#55-平台原生观感适配)） |

### 数据

| 功能 | 状态 | 说明 |
| --- | :-: | --- |
| 💾 本地 SQLite 存储 | ✅ | `~/.cuotiji/cuotiji.db`，复制即备份 |
| 📤 JSON 导入导出 | ✅ | 跨设备迁移 |
| 🔒 无账号 / 无遥测 / 无云端 | ✅ | 参见[隐私政策](PRIVACY.md) |

## 🚀 快速开始

从 [Releases](https://github.com/SteveSunYifan/error-notebook/releases) 下载最新版：

| 平台 | 文件 | 首次打开 |
| --- | --- | --- |
| macOS (Apple 芯片) | `cuotiji_x.x.x_aarch64.dmg` | 拖入 Applications；如被拦截：右键 → 打开 |
| Windows x64 | `cuotiji_x.x.x_x64-setup.exe` | 双击安装；SmartScreen 点「仍要运行」 |

> 应用未做付费代码签名，首次打开的系统提示属正常现象。数据目录 `~/.cuotiji/`（Windows：`C:\Users\<用户名>\.cuotiji\`）。

## 🤖 AI 配置（可选）

打开应用右上角「AI 设置」→ 选择厂商 → 填入 API Key → 测试连接：

| 厂商 | 推荐模型 | 备注 |
| --- | --- | --- |
| GLM 智谱 | `glm-4-flash` | 有免费额度 |
| DeepSeek | `deepseek-chat` | |
| Kimi 月之暗面 | `moonshot-v1-8k` | |
| MiniMax | `MiniMax-M1` | |
| Qwen 阿里 | `qwen-turbo` | |
| **Mock** | - | 无需 Key，离线体验全部 AI 流程 |

图片识别需选择**视觉模型**（如 GLM-4V / Qwen-VL）。不配置 AI 不影响其他功能。

## 🗺 Roadmap

- [x] v0.0.1 —— PDF 切题、分类筛选、组卷打印、知识点分析、AI 五能力
- [x] v0.0.2 —— Rust 后端化（安装包 -70%、毫秒启动）、Word/图片上传、明暗主题
- [ ] **一期** —— 学段分类体系（大学/职业考试）、题型统计图表、知识点掌握度加权、侧边栏 + 平台原生材质 UI
- [ ] 二期 —— 图片题干、按章节权重组卷、错题趋势统计
- [ ] 三期 —— 间隔重复复习计划、模考模式

完整设计见 [docs/受众扩展方案.md](docs/受众扩展方案.md)。

## 🛠 技术架构

```
Tauri 2 壳（Rust）
 ├─ 进程内嵌 axum HTTP 服务（动态端口，<100ms 就绪）
 ├─ rusqlite 本地数据库（与旧版 schema 零迁移）
 ├─ rust-embed 前端与知识点目录编入二进制
 └─ reqwest(rustls) 调用 OpenAI 兼容 AI 接口
前端：原生 HTML/CSS/JS，零框架零依赖
```

- 后端与原 Python 版 18 个 REST 路由**逐字段对拍一致**，AI prompt 同输入逐字一致（`cargo test` 覆盖）
- legacy Python 版保留在 `server/` 供对比参考

```bash
cd src-tauri && cargo tauri dev      # 开发模式
cargo test && cargo clippy           # 测试与静态检查
./build_macos.sh                     # 本机构建
```

## 🤝 参与贡献

- **知识点目录扩充**是最友好的贡献点：`server/catalog.json`（按年级/科目补充单元知识点，PR 欢迎）
- 功能与 UI 路线见 [受众扩展方案](docs/受众扩展方案.md)，欢迎 Issue 讨论
- 代码贡献：Fork → 分支 → PR（`cargo clippy` 与 `cargo test` 通过即可）

## 📄 相关链接

- [受众扩展方案](docs/受众扩展方案.md)（大学/职业考试人群设计）
- [技术方案文档](docs/方案文档.md)
- [隐私政策](PRIVACY.md) —— 无收集、无账号、无云端
- [MIT License](LICENSE)

---

<div align="center">

**如果这个项目帮到了你家孩子，欢迎点一个 ⭐ Star 支持持续开发**

[![Star History Chart](https://api.star-history.com/svg?repos=SteveSunYifan/error-notebook&type=Date)](https://star-history.com/#SteveSunYifan/error-notebook&Date)

</div>
