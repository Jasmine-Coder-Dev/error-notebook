<div align="center">

<img src="src-tauri/icons/128x128@2x.png" width="96" alt="ErrorNotebook icon"/>

# ErrorNotebook (错题集)

**A local-first smart mistake notebook — turn exam papers into an organized question bank, let AI find weak points, and print custom practice sheets in one click**

[![CI](https://github.com/SteveSunYifan/error-notebook/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/SteveSunYifan/error-notebook/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/SteveSunYifan/error-notebook?color=blue)](https://github.com/SteveSunYifan/error-notebook/releases)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-9cf)](#-quick-start)
[![Stars](https://img.shields.io/github/stars/SteveSunYifan/error-notebook?style=social)](https://github.com/SteveSunYifan/error-notebook/stargazers)

English | **[中文](README.md)**

**100% local data · no account · no cloud · optional AI** · 4–6MB installer · <1s startup

</div>

---

## 💡 Why

Wrong answers are scattered across exam papers, workbooks and photos. Parents copy them by hand; commercial apps push cloud accounts and subscriptions. This project automates the whole loop: **upload a paper → auto-split into questions → mark mistakes → AI knowledge-point tagging → generate & print targeted practice sheets** — all running locally, your data never leaves your machine.

## ✨ Features

### Capture

| Feature | Status | Notes |
| --- | :-: | --- |
| 📄 PDF paper upload with auto question splitting | ✅ | Understands `1.` `1、` `(1)` `第1题` numbering; editable preview |
| 📝 Word (.docx) upload | ✅ | Pure-Rust parsing, no Office required |
| 🖼 Image upload with AI recognition | ✅ | Photo/screenshot → vision model extracts text (vision model required) |
| ✍️ Manual entry | ✅ | Text / answer / reason / knowledge points |
| 🤖 AI split-check for whole papers | ✅ | Merges mis-splits, finds missed questions, detects question types |
| 🎯 Question-type tagging | 🚧 | Planned: per-stage type vocabularies (see the [design doc](docs/受众扩展方案.md)) |

### Organize & Analyze

| Feature | Status | Notes |
| --- | :-: | --- |
| 🗂 Multi-dimensional filters | ✅ | Grade × term × subject × knowledge point × mastery + keyword search |
| 🤖 AI knowledge-point tagging | ✅ | Constrained to a curated catalog; GLM / DeepSeek / Kimi / MiniMax / Qwen |
| 🤖 AI answer & explanation generation | ✅ | |
| 🤖 AI similar-question generation | ✅ | Variation practice for weak points |
| 📊 Weak-point analytics | ✅ | Error count per knowledge point, click to generate a targeted paper |
| 📈 Question-type statistics | 🚧 | Planned: bar/pie charts with drill-down |
| 🧠 Mastery-weighted analytics | 🚧 | Planned: accuracy × time decay |
| 🎓 College & professional-exam audiences | 🚧 | Planned: CPA / law / teaching / civil-service catalogs |

### Practice & Output

| Feature | Status | Notes |
| --- | :-: | --- |
| 🎲 Random paper generation | ✅ | Filter + pick N questions, answer blanks, optional answer page |
| 🖨 One-click print | ✅ | Native system print pipeline, any printer / export to PDF |
| 🌗 Light & dark themes | ✅ | Follows system + manual toggle |
| ⏰ Spaced repetition | 🚧 | Planned: Anki-style 1/3/7/15-day review |
| 📝 Mock-exam mode | 🚧 | Planned: timed paper + self grading |
| 🪟 Native material UI | 🚧 | Planned: macOS Liquid Glass / Windows 11 Mica + sidebar navigation |

### Data

| Feature | Status | Notes |
| --- | :-: | --- |
| 💾 Local SQLite storage | ✅ | `~/.cuotiji/cuotiji.db` — copy the file to back up |
| 📤 JSON import / export | ✅ | Cross-device migration |
| 🔒 No account · no telemetry · no cloud | ✅ | See [PRIVACY.md](PRIVACY.md) |

## 🚀 Quick Start

Grab the latest build from [Releases](https://github.com/SteveSunYifan/error-notebook/releases):

| Platform | File | First launch |
| --- | --- | --- |
| macOS (Apple Silicon) | `cuotiji_x.x.x_aarch64.dmg` | Drag into Applications; if blocked: right-click → Open |
| Windows x64 | `cuotiji_x.x.x_x64-setup.exe` | Run the installer; SmartScreen → "Run anyway" |

> The app is not code-signed (yet), so first-launch warnings are expected. Data lives in `~/.cuotiji/` (Windows: `C:\Users\<you>\.cuotiji\`).

## 🤖 AI Setup (optional)

Open **AI Settings** in the app → pick a provider → paste your API key → **Test connection**:

| Provider | Recommended model | Notes |
| --- | --- | --- |
| Zhipu GLM | `glm-4-flash` | Free tier available |
| DeepSeek | `deepseek-chat` | |
| Moonshot Kimi | `moonshot-v1-8k` | |
| MiniMax | `MiniMax-M1` | |
| Alibaba Qwen | `qwen-turbo` | |
| **Mock** | — | No key needed; try every AI flow offline |

Image recognition requires a **vision model** (e.g. GLM-4V / Qwen-VL). All other features work without any AI configuration.

## 🗺 Roadmap

- [x] v0.0.1 — PDF splitting, filtering, paper generation & printing, weak-point analytics, five AI abilities
- [x] v0.0.2 — Rust backend (70% smaller, millisecond startup), Word/image upload, light/dark themes
- [ ] **Phase 1** — stage-based classification (college / professional exams), question-type charts, mastery weighting, sidebar + native-material UI
- [ ] Phase 2 — image-based questions, chapter-weighted papers, error trends
- [ ] Phase 3 — spaced repetition, mock exams

Full design (in Chinese): [docs/受众扩展方案.md](docs/受众扩展方案.md).

## 🛠 Architecture

```
Tauri 2 shell (Rust)
 ├─ embedded axum HTTP server (dynamic port, ready in <100ms)
 ├─ rusqlite local database (zero-migration schema)
 ├─ rust-embed bundles frontend & knowledge catalog into the binary
 └─ reqwest (rustls) for OpenAI-compatible AI providers
Frontend: vanilla HTML/CSS/JS — zero framework, zero npm dependencies
```

- The Rust backend matches the original Python implementation **field-for-field across 18 REST routes**; AI prompts are byte-identical (covered by `cargo test`)
- The legacy Python version remains in `server/` for reference

```bash
cd src-tauri && cargo tauri dev      # dev mode
cargo test && cargo clippy           # tests & lint
./build_macos.sh                     # local build
```

## 🤝 Contributing

- **Growing the knowledge-point catalog** (`server/catalog.json`) is the easiest way to contribute — PRs welcome!
- Feature & UI roadmap: [design doc](docs/受众扩展方案.md) — discussions in Issues are welcome
- Code: fork → branch → PR (please keep `cargo clippy` and `cargo test` green)

## 📄 Links

- [Audience expansion design](docs/受众扩展方案.md) (Chinese)
- [Technical design](docs/方案文档.md) (Chinese)
- [Privacy policy](PRIVACY.md) — no collection, no account, no cloud
- [MIT License](LICENSE)

---

<div align="center">

**If this tool helps your family, a ⭐ star would mean a lot**

[![Star History Chart](https://api.star-history.com/svg?repos=SteveSunYifan/error-notebook&type=Date)](https://star-history.com/#SteveSunYifan/error-notebook&Date)

</div>
