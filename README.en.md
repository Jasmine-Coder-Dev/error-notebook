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


## 📸 Screenshots

<div align="center">

| Capture & stage gating | Question bank |
| --- | --- |
| ![Import](docs/screenshots/01-import-light.png) | ![Bank](docs/screenshots/02-bank-light.png) |

| Question-type analytics | Knowledge graph (sunburst) |
| --- | --- |
| ![Analytics](docs/screenshots/03-analysis-qtype.png) | ![Graph](docs/screenshots/04-analysis-graph.png) |

| Paper generation & printing | Daily review (SM-2 grading) |
| --- | --- |
| ![Paper](docs/screenshots/05-paper.png) | ![Review](docs/screenshots/06-review.png) |

**Dark mode**: ![Bank dark](docs/screenshots/07-bank-dark.png) · ![Graph dark](docs/screenshots/08-analysis-dark.png)

</div>

## ✨ Features

### Capture

| Feature | Status | Notes |
| --- | :-: | --- |
| 📄 PDF paper upload with auto question splitting | ✅ | Understands `1.` `1、` `(1)` `第1题` numbering; editable preview |
| 📝 Word (.docx) upload | ✅ | Pure-Rust parsing, no Office required |
| 🖼 Image upload with AI recognition | ✅ | Photo/screenshot → vision model extracts text (vision model required) |
| ✍️ Manual entry | ✅ | Text / answer / type / reason / knowledge points / **question images** |
| 🖼 Question images | ✅ | Attach figures (png/jpg/webp); shown on cards, printed with the paper, embedded in exports |
| 🤖 AI split-check for whole papers | ✅ | Merges mis-splits, finds missed questions, detects question types |
| 🎯 Question-type tagging | ✅ | Per-stage vocabularies (elementary math drills → CPA comprehensive cases); batch AI back-filling for old data |
| 🎓 College & professional-exam audiences | ✅ | Stages: K12 / college (course × chapter) / professional exams (CPA, law, teaching, civil service, postgraduate — exam × subject); 55 seed catalogs |

### Organize & Analyze

| Feature | Status | Notes |
| --- | :-: | --- |
| 🗂 Multi-dimensional filters | ✅ | Stage × category-1 × category-2 × type × knowledge point × mastery + keyword search |
| 🤖 AI knowledge-point tagging | ✅ | Constrained to curated catalogs, stage-aware strategies; GLM / DeepSeek / Kimi / MiniMax / Qwen |
| 🤖 AI answer & explanation generation | ✅ | |
| 🤖 AI similar-question generation | ✅ | Variation practice for weak points |
| 📊 Learning analytics (type + knowledge point) | ✅ | Type bar/pie charts with drill-down, summary cards; knowledge-point bars with mastery stacking |
| 🧠 Mastery-weighted analytics | ✅ | Counts "not mastered + reviewing" by default, toggleable |
| 📉 Error trends | ✅ | Weekly/monthly new-error count + correction-rate dual-line chart |

### Practice & Output

| Feature | Status | Notes |
| --- | :-: | --- |
| 🎲 Paper generation | ✅ | Random or **weakness-first** (weighted by unmastered errors per knowledge point) |
| 🖨 One-click print | ✅ | Native system print pipeline, any printer / export to PDF; images included |
| 🌗 Light & dark themes | ✅ | Follows system + manual toggle |
| ⏰ Spaced repetition | ✅ | 1/3/7/15-day auto scheduling; "Today's Review" with badge |
| 📝 Mock-exam mode | ✅ | Timed answering → self grading against answers; "don't know" auto-scheduled for tomorrow |
| 🪟 Glass sidebar UI | ✅ | Frosted-glass sidebar (collapsible) + dual themes; system-level window materials on the roadmap |

### Data

| Feature | Status | Notes |
| --- | :-: | --- |
| 💾 Local SQLite storage | ✅ | `~/.cuotiji/cuotiji.db` — copy the file to back up; automatic zero-loss migrations |
| 📤 JSON import / export | ✅ | Cross-device migration with images embedded |
| 🔒 No account · no telemetry · no cloud | ✅ | See [PRIVACY.md](PRIVACY.md) |

## 🚀 Quick Start

Grab the latest build from [Releases](https://github.com/SteveSunYifan/error-notebook/releases):

| Platform | File | First launch |
| --- | --- | --- |
| macOS (Apple Silicon) | `cuotiji_x.x.x_aarch64.dmg` | Drag into Applications; if blocked: right-click → Open |
| Windows x64 | `cuotiji_x.x.x_x64-setup.exe` | Run the installer; SmartScreen → "Run anyway" |

> The app is not code-signed (yet), so first-launch warnings are expected. Data lives in `~/.cuotiji/` (Windows: `C:\Users\<you>\.cuotiji\`).

## 🤖 AI Setup (optional)

Open **AI Settings** in the app → pick a provider → paste your API key → **Test connection**. **Pick a model per use case** (verified against provider docs, Oct 2026; check each platform's model list as models iterate fast):

### Everyday tasks (tagging / explanations / similar questions / split-check) — cheap text models

| Provider | Recommended model | Notes |
| --- | --- | --- |
| DeepSeek | `deepseek-flash` | V4.1 generation; as low as $0.003/1M cached input, **natively supports vision** (per official docs) |
| Alibaba Qwen | `qwen3.8-flash` | Low-cost workhorse |
| Zhipu GLM | `glm-5v-turbo` (multimodal) / `glm-5.3` / `glm-5-flash` | Official vision model is GLM-5V-Turbo; glm-5.3 for text-only, flash for free tier |
| Moonshot Kimi | `kimi-k3` | Current flagship series |
| MiniMax | `MiniMax-M3` | Current flagship |

### Image recognition (photo/screenshot upload) — a multimodal model is required

| Provider | Recommended model | Notes |
| --- | --- | --- |
| DeepSeek | `deepseek-flash` | Vision ✓ per official pricing page — one model for everything |
| Alibaba Qwen | `qwen3.8-omni-flash` | Omni tier; `qwen3.7-plus` / `qwen3.8-max` also accept images |
| Moonshot Kimi | `kimi-k3` | Image understanding supported |
| Zhipu GLM | `glm-5v-turbo` | Official multimodal model, one model for everything |
| MiniMax | — | Prefer another provider for images |

**Mock** works offline with no key. All non-AI features work without configuration; the model field is free text — new model IDs work as soon as providers release them.

## 🗺 Roadmap

- [x] v0.0.1 — PDF splitting, filtering, paper generation & printing, weak-point analytics, five AI abilities
- [x] v0.0.2 — Rust backend (70% smaller, millisecond startup), Word/image upload, light/dark themes
- [x] v0.0.3 — full audience-expansion release (Phases 1–3):
  - Phase 1: stage-based classification (college / professional exams), question-type charts, mastery weighting, sidebar UI, onboarding
  - Phase 2: question images, weakness-first paper generation, error trends
  - Phase 3: spaced repetition, mock exams
- [x] v0.1.0 Beta — SM-2 adaptive review intervals, knowledge graph (sunburst), macOS Liquid Glass / Windows Mica, dual-appearance icon, university 3-level classification (major × course × year), AI presets updated + first-run tutorial + GLM Coding Plan, stage gating & step bar, full light/dark UI polish
- [ ] Next — one-click scheduling for legacy questions, community knowledge graph, Windows on-device verification

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
