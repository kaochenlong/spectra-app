<p align="center">
  <img src="assets/logo.png" alt="Spectra" width="128" />
</p>

# Spectra

A desktop app for managing spec documents — visually track changes, specs, and tasks.

## What is Spectra?

Spectra brings [OpenSpec](https://github.com/Fission-AI/OpenSpec)'s Spec-Driven Development (SDD) workflow to a desktop experience. No more manually managing `openspec/` directories, YAML configs, and Markdown files through the CLI. Spectra provides a GUI (and an optional CLI) for the full lifecycle: proposing changes, writing specs, tracking tasks, and archiving completed work.

Spectra is fully compatible with the OpenSpec data format — any `openspec/` directory created by the OpenSpec CLI works in Spectra. It started as a GUI frontend for OpenSpec, but after using it for a while, I found that OpenSpec's workflow didn't quite match my own development habits, and some commands felt a bit clunky. I initially tried tweaking Skills config files, but that alone wasn't enough to fully realize the value of SDD. So I decided to rewrite the entire workflow based on OpenSpec's original design — simplifying commands, adding the features I wanted, and shaping it into a tool that fits my daily development rhythm.

## Features

**Spec & Change Management**

- Create, view, and edit spec documents and change proposals
- Automatically parse task progress from Markdown checklists (`- [ ]` / `- [x]`)
- Archive completed changes with one click

**AI-Assisted Workflow**

- Intelligent scanning for contradictions and gaps across proposals, specs, designs, and tasks
- Slash commands for Claude Code integration:

| Command            | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `/spectra:propose` | Create spec documents (proposal, spec, design, tasks) |
| `/spectra:apply`   | Execute tasks                                         |
| `/spectra:ingest`  | Restore work-in-progress context or update specs      |
| `/spectra:archive` | Archive completed specs                               |
| `/spectra:discuss` | Focused design discussions                            |
| `/spectra:tdd`     | TDD workflow (Red-Green-Refactor)                     |
| `/spectra:debug`   | Systematic debugging (max 3 attempts)                 |
| `/spectra:audit`   | Security audit (3-role parallel analysis on git diff) |
| `/spectra:ask`     | Query specs with natural language (RAG vector search) |

**Vector Search & Q&A**

- Full-text search across all specs and changes
- Natural language queries powered by RAG (Retrieval-Augmented Generation)
- Supports English, Japanese, Traditional Chinese, and Simplified Chinese
- Requires Apple Silicon (M-series) or Windows

**Compact Mode** (`⌘D`)

- Floating panel for monitoring progress while coding
- Quick project switching and task overview

**Park Mechanism**

- Temporarily shelve in-progress specs without polluting the Git working tree
- CLI: `spectra park <name>` / `spectra unpark <name>`

**Git Worktree Integration**

- Isolated working directory per change (`spx/<change-name>` branches)
- Auto-detection and switching between worktrees
- Disabled by default; enable in settings

**Parallel Task Execution** (Experimental)

- Tasks marked `[P]` run concurrently via Claude Code subagents
- For independent tasks that modify different files with no dependencies
- Disabled by default; enable in settings

**Internationalization**

- UI available in English, Japanese, Traditional Chinese, and Simplified Chinese

## Download

Get the latest release for your platform:

**[Download Spectra](https://github.com/kaochenlong/spectra-app/releases)**

## Platform Support

| Platform | Architecture          | Format |
| -------- | --------------------- | ------ |
| macOS    | Apple Silicon (ARM64) | `.dmg` |
| macOS    | Intel (x64)           | `.dmg` |
| Windows  | x64                   | `.exe` |

## Feedback

Found a bug or have a suggestion? Open an issue on [GitHub Issues](https://github.com/kaochenlong/spectra-app/issues).

---

管理規格文件的桌面應用程式，以視覺化介面追蹤變更、規格與任務。

## Spectra 是什麼？

Spectra 將 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 的「規格驅動開發（Spec-Driven Development）」工作流程帶入桌面體驗。不用手動或透過 CLI 介面管理 `openspec/` 目錄、YAML 設定和 Markdown 檔案。Spectra 提供 GUI（以及選用的 CLI）來處理完整的生命週期：提出變更、撰寫規格、追蹤任務、歸檔已完成的工作。

Spectra 完全相容 OpenSpec 資料格式，由 OpenSpec CLI 建立的 `openspec/` 目錄都可以在 Spectra 中使用。最初是 OpenSpec 的 GUI 前端，但用了一陣子之後發現 OpenSpec 的流程跟我自己實際開發習慣不太合，有些指令也顯得有點沒那麼順手。起初想透過修改 Skills 設定檔來調整，但光這樣好像不足以完全發揮 SDD 的價值，最後決定基於 OpenSpec 原本的設計，把整個流程重寫一次，簡化指令、補上我想要的功能，做成更貼近我自己日常開發節奏的工具。

## 功能特色

**規格與變更管理**

- 建立、檢視和編輯規格文件與變更提案
- 從 Markdown 任務清單（`- [ ]` / `- [x]`）自動解析任務完成進度
- 一鍵歸檔已完成的變更

**AI 輔助工作流程**

- 智慧掃描，檢查 Proposal、Spec、Design、Task 之間的矛盾與遺漏
- 與 Claude Code 整合的 Slash Commands：

| 指令               | 說明                                          |
| ------------------ | --------------------------------------------- |
| `/spectra:propose` | 建立規格文件（proposal、spec、design、tasks） |
| `/spectra:apply`   | 執行任務                                      |
| `/spectra:ingest`  | 恢復進行中的工作上下文或更新規格              |
| `/spectra:archive` | 歸檔規格文件                                  |
| `/spectra:discuss` | 有目標的設計討論                              |
| `/spectra:tdd`     | TDD 流程（Red-Green-Refactor）                |
| `/spectra:debug`   | 系統化除錯流程（最多 3 次嘗試）               |
| `/spectra:audit`   | 安全性審查（3 角色平行分析 git diff）         |
| `/spectra:ask`     | 以自然語言查詢規格文件（RAG 向量搜尋）        |

**向量搜尋與問答**

- 跨所有規格和變更的全文搜尋
- 基於 RAG（檢索增強生成）的自然語言查詢
- 支援中文、英文、日文搜尋
- 需要 Apple Silicon（M 系列）或 Windows 平台

**精簡模式**（`⌘D`）

- 浮動小面板，適合在寫程式時監看進度
- 快速切換專案、查看待辦事項

**暫存（Park）機制**

- 將未即時處理的規格暫時收起，不污染 Git 工作區
- CLI 指令：`spectra park <name>` / `spectra unpark <name>`

**Git Worktree 整合**

- 為每個 change 建立獨立工作目錄（`spx/<change-name>` 分支）
- 自動偵測並切換工作目錄
- 預設關閉，可在設定中啟用

**平行任務執行**（實驗功能）

- 標記為 `[P]` 的任務可透過 Claude Code subagent 同時執行
- 適用於修改不同檔案且無依賴關係的獨立任務
- 預設關閉，可在設定中啟用

**多國語言**

- 介面支援英文、日文、繁體中文、簡體中文

## 下載

取得適合你平台的最新版本：

**[下載 Spectra](https://github.com/kaochenlong/spectra-app/releases)**

## 平台支援

| 平台    | 架構                  | 格式   |
| ------- | --------------------- | ------ |
| macOS   | Apple Silicon (ARM64) | `.dmg` |
| macOS   | Intel (x64)           | `.dmg` |
| Windows | x64                   | `.exe` |

## 回饋

發現問題或有建議？歡迎到 [GitHub Issues](https://github.com/kaochenlong/spectra-app/issues) 開 issue。

