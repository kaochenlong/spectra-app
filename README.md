<p align="center">
  <img src="assets/logo.png" alt="Spectra" width="128" />
</p>

# Spectra

A desktop app for managing spec documents — visually track changes, specs, and tasks.

## What is Spectra?

Spectra is a Spec-Driven Development (SDD) tool made up of a desktop app, a CLI, and skills for coding agents. Your coding agent uses the skills to propose changes, write specs, and carry out tasks, while the app lets you browse specs, track progress, and archive completed work — no more manually managing spec directories, YAML configs, and Markdown files.

Spectra was inspired by [OpenSpec](https://github.com/Fission-AI/OpenSpec). It started as a GUI frontend for OpenSpec, but after using it for a while, I found that OpenSpec's workflow didn't quite match my own development habits. So I decided to rewrite the entire workflow — simplifying commands, adding the features I wanted, and shaping it into a tool that fits my daily development rhythm.

## Features

**Spec & Change Management**

- View and edit specs and change proposals (changes are created by your coding agent with `/spectra-propose`)
- Automatically parse task progress from Markdown checklists (`- [ ]` / `- [x]`)
- Archive completed changes with one click

**AI-Assisted Workflow**

- Intelligent scanning for contradictions and gaps across proposals, specs, designs, and tasks
- Skills for coding agents — Claude Code, Codex, Cursor, GitHub Copilot, Antigravity, and JetBrains Junie:

| Stage        | Skill              | Description                                                                    |
| ------------ | ------------------ | ------------------------------------------------------------------------------ |
| Plan         | `/spectra-discuss` | Clarify requirements and compare approaches before proposing; no code changes  |
|              | `/spectra-propose` | Create a complete change proposal (proposal, specs, design, tasks)             |
| Implement    | `/spectra-apply`   | Implement a change's tasks, or resume one in progress                          |
|              | `/spectra-ingest`  | Fold shifted requirements from a plan or conversation back into a change       |
| Quality gate | `/spectra-verify`  | Before archiving, check the code against the change's specs, tasks, and design |
|              | `/spectra-review`  | Code review of a change's implementation; reports only, never edits files      |
|              | `/spectra-analyze` | Find contradictions and gaps across proposal, design, specs, and tasks         |
|              | `/spectra-audit`   | Security audit of changed code                                                 |
|              | `/spectra-drift`   | Detect drift between a change and the current codebase                         |
|              | `/spectra-debug`   | Systematic debugging: reproduce first, then find the root cause from evidence  |
| Finish       | `/spectra-archive` | Archive a completed change and merge its spec changes into the main specs      |
|              | `/spectra-commit`  | Commit only the files that belong to a change                                  |

In Codex, invoke skills with `$` instead of `/` (for example, `$spectra-apply`). `/spectra-verify` and `/spectra-analyze` can be invoked directly in Claude Code, Codex, and GitHub Copilot.

**Compact Mode** (`⌘D`)

- Floating panel for monitoring progress while coding
- Changes and task progress at a glance; `⌘T` opens memos

**Park Mechanism**

- Temporarily park in-progress changes without polluting the Git working tree
- CLI: `spectra park <name>` / `spectra unpark <name>`

**Parallel Task Execution**

- `/spectra-propose` records dependencies between tasks with `[after: ...]`
- `/spectra-apply` hands tasks whose prerequisites are complete to your coding agent's subagents to run in parallel, and runs them one by one when subagents aren't available
- Enabled by default with no setup; `[P]` markers in older task lists are still recognized

**Internationalization**

- UI available in English, Japanese, Traditional Chinese, and Simplified Chinese

## Install

### Homebrew (macOS)

```sh
brew install --cask spectra-app
```

## Download

Get the latest release for your platform:

**[Download Spectra](https://github.com/kaochenlong/spectra-app/releases)**

Or visit the official website: **[spectra.5xcamp.us](https://spectra.5xcamp.us/)**

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

Spectra 是一套規格驅動開發（Spec-Driven Development，SDD）工具，由桌面 app、CLI 和 coding agent 用的 skills 組成：coding agent 透過 skills 提出變更、撰寫規格、執行任務，app 負責檢視規格、追蹤進度、封存完成的工作，不用自己管理規格目錄、YAML 設定和 Markdown 檔案。

Spectra 的靈感來自 [OpenSpec](https://github.com/Fission-AI/OpenSpec)。最初是 OpenSpec 的 GUI 前端，但用了一陣子之後發現 OpenSpec 的流程跟我自己實際開發習慣不太合，最後決定把整個流程重寫一次，簡化指令、補上我想要的功能，做成更貼近我自己日常開發節奏的工具。

## 功能特色

**規格與變更管理**

- 檢視和編輯規格文件與變更提案（變更由 coding agent 透過 `/spectra-propose` 建立）
- 從 Markdown 任務清單（`- [ ]` / `- [x]`）自動解析任務完成進度
- 一鍵封存已完成的變更

**AI 輔助工作流程**

- 智慧掃描，檢查 Proposal、Spec、Design、Task 之間的矛盾與遺漏
- 提供 coding agent 使用的 Skills，支援 Claude Code、Codex、Cursor、GitHub Copilot、Antigravity、JetBrains Junie：

| 階段     | Skill              | 說明                                                 |
| -------- | ------------------ | ---------------------------------------------------- |
| 規劃     | `/spectra-discuss` | 提案前釐清需求、比較做法，不改程式碼                 |
|          | `/spectra-propose` | 建立完整的變更提案（proposal、specs、design、tasks） |
| 實作     | `/spectra-apply`   | 照 tasks 實作，或接續做到一半的 change               |
|          | `/spectra-ingest`  | 實作途中需求有變時，把計畫或對話內容更新回 change    |
| 品質把關 | `/spectra-verify`  | 封存前檢查實作是否符合規格、任務與設計               |
|          | `/spectra-review`  | 對 change 的實作做 code review，只出報告不改檔       |
|          | `/spectra-analyze` | 檢查 proposal、design、specs、tasks 之間的矛盾與缺漏 |
|          | `/spectra-audit`   | 對修改過的程式碼做安全性稽核                         |
|          | `/spectra-drift`   | 檢查 change 跟目前程式碼之間的落差                   |
|          | `/spectra-debug`   | 系統化除錯：先重現問題，再依證據找根因               |
| 收尾     | `/spectra-archive` | 封存完成的 change，把它對規格的修改併回主規格        |
|          | `/spectra-commit`  | 只提交屬於這個 change 的檔案                         |

在 Codex 裡改用 `$` 呼叫，例如 `$spectra-apply`。`/spectra-verify` 和 `/spectra-analyze` 可以在 Claude Code、Codex、GitHub Copilot 直接呼叫。

**精簡模式**（`⌘D`）

- 浮動小面板，適合在寫程式時監看進度
- 一覽各個變更與任務進度，按 `⌘T` 開啟備忘

**暫存（Park）機制**

- 將未即時處理的變更暫時收起，不污染 Git 工作區
- CLI 指令：`spectra park <name>` / `spectra unpark <name>`

**平行任務執行**

- `/spectra-propose` 會用 `[after: ...]` 記錄任務之間的依賴關係
- `/spectra-apply` 會把前置任務都完成的任務，交給 coding agent 的 subagent 同時執行；不支援 subagent 時改為依序執行
- 預設開啟，不需要設定；舊任務清單裡的 `[P]` 標記仍然有效

**多國語言**

- 介面支援英文、日文、繁體中文、簡體中文

## 安裝

### Homebrew (macOS)

```sh
brew install --cask spectra-app
```

## 下載

取得適合你平台的最新版本：

**[下載 Spectra](https://github.com/kaochenlong/spectra-app/releases)**

或前往官方網站：**[spectra.5xcamp.us](https://spectra.5xcamp.us/)**

## 平台支援

| 平台    | 架構                  | 格式   |
| ------- | --------------------- | ------ |
| macOS   | Apple Silicon (ARM64) | `.dmg` |
| macOS   | Intel (x64)           | `.dmg` |
| Windows | x64                   | `.exe` |

## 回饋

發現問題或有建議？歡迎到 [GitHub Issues](https://github.com/kaochenlong/spectra-app/issues) 開 issue。

