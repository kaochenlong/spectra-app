# Changelog

## 3.0.0

### Breaking Changes

- The first time you open a project after upgrading, the app automatically updates the project's skills and the Spectra block in `CLAUDE.md` and `AGENTS.md`, and removes files that are no longer used.
- Removed vector search.
- Removed Spectra-managed git worktrees.
- Narrowed the supported coding agents to Claude Code, Codex, Cursor, GitHub Copilot, Antigravity, and JetBrains Junie. Windsurf, Gemini CLI, Cline, Kiro, Qwen, OpenCode, Trae, and other agents have been removed. Their existing directories in your project (such as `.windsurf/` and `.qwen/`) are left as-is and no longer updated — delete them yourself. Specifying one of these agents in the CLI now fails with an error that lists the supported agents.
- Spectra now generates skills only; command files are no longer generated.
- Removed the "Claude Code" section in Settings (the Slash Commands toggle and Skill Effort).
- Appearance now offers only Light and Dark. The 12 built-in themes and custom themes have been removed.
- Removed from the interface:
  - Kanban board view — changes are now shown as a list you can reorder by dragging.
  - The always-on-top toggle.
  - Skills Guide — see the workflow diagram at the bottom of the left sidebar for what each skill does.
  - The search box in the change list — to find archived changes, search on the Completed page.
- On macOS, `Cmd+W` now hides the window (click the Dock icon to bring it back).
- New projects now use `docs/spectra/` as the default spec directory.
- Validation and archiving are now stricter.

### Interface

- Redesigned the entire interface.
- Added support for JetBrains Junie.
- Tasks in parked changes can now be checked off directly in the app.
- Archived changes can now be shared too.
- Adjusted the coding agent selection in "Initialize Spectra" and "Manage Agents".
- Removed the button for updating skills; skills now update automatically when you open a project.
- Moved the workflow diagram button to the bottom of the left sidebar; it now opens even when no project is open.

### CLI

- Added `spectra scope`, which lists the files a change actually touched.
- Added `spectra decisions`, which lists the design decisions recorded in every change's `design.md`, with keyword filtering and `--json` output.
- Added `spectra archive --preview` to preview an archive before running it; if archiving fails midway, everything is rolled back so no spec is left half-updated.
- `spectra validate <change>` now simulates an archive first and warns early about spec changes that would be blocked at archive time.
- `spectra analyze` now checks whether documents are written in the project's language, whether the same item has consistent numbers across proposal, design, and tasks, and whether Goals and Non-Goals contradict each other.

### SDD Skills

- Added `/spectra-review`: reads the change's proposal, design, and tasks, then reviews the implementation. Each finding states whether it's based on a project rule or general judgment. It only reports and never modifies files.
- `/spectra-commit` follows the repo's existing commit message style and commits only the files you confirmed — anything else you had staged stays out. If you cancel or a hook fails, no commit is left behind.
- `/spectra-discuss` never changes code. Before writing any document, it explains which files it will create or modify and waits for your explicit approval. It replies in the language of the conversation and flags terminology conflicts when the project has a `LANGUAGE.md` glossary.
- `/spectra-propose` asks for clarification when requirements are unclear, and opens the relevant files to confirm before describing how existing code currently works. The Purpose of new specs is written at this stage, so no more TBD placeholders.
- `/spectra-apply` stops and reports when a task is unclear or its premise doesn't hold. With `tdd: true`, it checks at the end that every scenario has a corresponding test; visual details of a single screen don't require tests.
- `/spectra-debug` first builds a failing reproduction that can be rerun, then ranks hypotheses by the evidence.
- All skills now reply in plain language, leading with the result and the next step, and no longer re-confirm things that are already clear and authorized.
- Skill content is slimmer and loaded in sections, so each invocation uses fewer tokens.
- Codex and GitHub Copilot can now run analyze and verify directly.
- General requests unrelated to a Spectra change are no longer pulled into the Spectra workflow automatically.

### Fixes

- Fixed Windows installs where a new terminal couldn't run `spectra` until the app had been opened once; reinstalling no longer adds duplicate PATH entries, and uninstalling removes only Spectra's own entry.
- Fixed the window on Windows becoming hidden with no way to bring it back when pressing `Ctrl+W` with no project open.
- Fixed the report URL printed by `spectra feedback` returning a 404.
- Fixed a `spectra analyze` false positive that asked removed requirements to add scenarios.
- Fixed skills such as archive and commit stopping because they called commands that don't exist.
- Fixed `/spectra-commit` including unrelated modifications that existed before the task started.

---

### Breaking Changes

- 升級後第一次開啟專案時，app 會自動更新專案裡的 skill，以及 CLAUDE.md、AGENTS.md 中的 Spectra 區塊，並清掉不再使用的舊檔案。
- 移除 向量搜尋功能
- 移除 Spectra 自行管理 git worktree 的功能
- 調整 支援的 coding agent 收斂為 Claude Code、Codex、Cursor、GitHub Copilot、Antigravity 與 JetBrains Junie。Windsurf、Gemini CLI、Cline、Kiro、Qwen、OpenCode、Trae 等 agent 已移除，專案裡對應的舊目錄（例如 `.windsurf/`、`.qwen/`）會原樣留著、不再更新，請自行刪除；CLI 指定這些 agent 時會直接報錯並列出支援清單。
- 調整 Spectra 只產生 skill，不再產生指令檔
- 移除 設定頁的「Claude Code」區塊（slash commands 開關與 Skill Effort）
- 調整 外觀只保留 Light 與 Dark。內建的 12 種主題和自訂主題都已移除
- 移除 介面：
  - 看板（Kanban）檢視：變更改以清單呈現，可以拖拉排序。
  - 視窗置頂開關。
  - Skills Guide（技能對照表）：各個 skill 的用途請看左側欄底部的工作流程圖。
  - 變更清單的搜尋框：要找已封存的 change，請到「已完成」頁搜尋。
- 調整 macOS 上的 `Cmd+W` 改成隱藏視窗（點 Dock 圖示即可叫回）
- 調整 新專案的規格目錄預設改為 `docs/spectra/`
- 調整 驗證與封存更嚴格

### 介面

- 介面全面改版：
- 新增 支援 JetBrains Junie
- 新增 暫存（Parked）的 change 可以直接在 app 裡勾選任務。
- 新增 已封存的 change 也能分享。
- 調整 「初始化 Spectra」與「管理 Agents」的 coding agent 介面
- 調整 「更新 skill」按鈕拿掉，改成開啟專案時自動更新。
- 調整 工作流程圖的按鈕移到左側欄底部，沒有開啟專案時也能打開。

### CLI

- 新增 `spectra scope`，列出一個 change 實際動到哪些檔案。
- 新增 `spectra decisions`，列出所有 change 在 design.md 記下的設計決策，可以用關鍵字過濾或加上 `--json`。
- 新增 `spectra archive --preview` 可以先預覽封存結果；封存中途失敗會整批還原，不會留下改到一半的規格。
- 新增 `spectra validate <change>` 會先模擬一次封存，提早警告封存時會被擋下的規格修改。
- 新增 `spectra analyze` 會檢查文件語言是否符合專案語系、同一件事在 proposal、design、tasks 裡的數字是否一致，以及 Goals 與 Non-Goals 是否互相矛盾。

### SDD Skill

- 新增 `/spectra-review`：先讀 change 的 proposal、design、tasks，再對實作做 code review。每條發現都會標明依據是專案規則還是一般判斷，只出報告、不改檔案。
- `/spectra-commit` 會照 repo 既有的 commit 訊息風格撰寫，只提交你確認過的檔案，原本 staged 的其他內容不會被帶進去；取消或 hook 失敗時不會留下 commit。
- `/spectra-discuss` 不會改程式碼；要寫任何文件前，會先說明要建立或修改哪些檔案，等你明確同意才動手。回覆跟著對話語言，專案有 `LANGUAGE.md` 詞彙表時會提醒用詞衝突。
- `/spectra-propose` 需求不清楚時會先問清楚；寫到「既有程式目前是怎樣」之前，會先打開檔案確認；新規格的 Purpose 在這個階段就寫好，不再留下 TBD。
- `/spectra-apply` 遇到寫不清楚的任務或前提不成立時，會停下來回報。開啟 `tdd: true` 時，最後會檢查每個情境是否有對應的測試，單一畫面的外觀細節則不要求測試。
- `/spectra-debug` 會先做出能重複執行的失敗重現，再依證據排出假設。
- 所有 skill 的回話改用白話，先講結果和下一步；已經講清楚、授權過的事不會再重複確認。
- Skill 內容精簡並改成分段載入，每次觸發用掉的 token 更少
- Codex 與 GitHub Copilot 也能直接執行 analyze 與 verify。
- 跟 Spectra change 無關的一般請求，不會再被自動帶進 Spectra 流程。

### 修正

- 修正 Windows 安裝後，新開的終端機要先開過 app 才能執行 `spectra` 的問題；重新安裝也不會重複加入 PATH，解除安裝只移除 Spectra 自己那一筆。
- 修正 Windows 上沒有開啟專案時按 `Ctrl+W`，視窗隱藏後叫不回來的問題。
- 修正 `spectra feedback` 印出的回報網址會 404 的問題。
- 修正 `spectra analyze` 會要求已移除的需求補上情境的誤報。
- 修正 archive、commit 等 skill 呼叫不存在的指令而中斷的問題。
- 修正 `/spectra-commit` 把任務開始前就存在的無關修改一起提交的問題。

## 2.3.1

- Reworked the workflow tip so it's clearer where Spectra fits into the workflow.
- Added rename for changes — keeps the filesystem, git branch, and database in sync.
- Added the `cmd+o` shortcut to open a project, mirroring the "Open Project" button in the title bar.
- Adjusted `cmd+w` to close the current tab.
- Temporarily disabled vector search on Windows for compatibility reasons.

---

- 調整流程提示，更容易看出 Spectra 在工作流程的哪一段接入。
- 新增 change 重新命名功能，會同步檔案系統、git 分支與資料庫。
- 新增 快捷鍵 `cmd+o` 開啟專案快捷鍵，對應標題列的「開啟專案」按鈕。
- 調整 快捷鍵 `cmd+w` 關閉分頁。
- 考量功能相容性，Windows 版本暫時停用向量搜尋。

## 2.3.0

- Workflow tip modal now has a layout reset button — one click undoes an accidental drag.
- Added `/spectra-drift` to detect drift between a change and the current codebase, scoring time, structure, tasks, and environment dimensions and recommending the next command.
  - Building on the above, the apply flow now triggers a drift report before resuming tasks, avoiding work on stale changes.
- Added relocation of changes between the main directory and worktrees — create a worktree or move back to main from the context menu, with confirmation prompts on conflicts.
- Unified the metadata database at the git commondir so worktrees and the main directory share a single source of truth, avoiding inconsistent change lists across worktrees.
- `/spectra-propose` adds a reminder to exit Codex Plan Mode and enforces project locale for `tasks.md` headings and descriptions.
- Fixed change modified time to use artifact file mtime, so recently edited changes no longer look stale due to an unupdated directory mtime.
- Fixed in-progress changes from worktrees created manually in the terminal not appearing in the main app.
- Fixed parked changes on disk disappearing when the parked database and disk state were out of sync.

---

- 流程提示 modal 加入版面重置按鈕，誤拖後可以一鍵還原。
- 新增 `/spectra-drift` 偵測 change 與當前程式碼的偏移，從時間、結構、任務、環境四個維度評分，並推薦下一步指令。
  - 承上，apply 流程繼續任務前會自動觸發 drift 報告，避免在過期的 change 上接續工作。
- 新增 change 在主目錄及 worktree 之間的搬移功能，可從右鍵選單建立 worktree 或搬回主目錄，搬移衝突會提示確認。
- Metadata 資料庫統一到 git commondir，worktree 和主目錄共用同一份資料來源，避免不同 worktree 看到的 change 列表不一致。
- `/spectra-propose` 新增 Codex 在 Plan Mode 時的結束提醒，並對 `tasks.md` 的標題與描述強制使用專案語系。
- 修正 change 修改時間改用 artifact 檔案 mtime，剛編輯過的 change 不再因目錄 mtime 沒更新而看起來過期。
- 修正 手動從終端機建立的 worktree 上，in-progress change 在主程式看不到的問題。
- 修正 暫存資料庫和磁碟不一致時，磁碟上的 parked changes 會消失的問題。

## 2.2.5

- Temporarily disabled window geometry persistence on Windows to avoid startup issues.
- SDD Skill updates
  - `/spectra-apply` now runs a preflight check: detects missing files, codebase drift, stale content, and artifact quality issues before implementation starts; the task loop also adds post-implementation verification.
  - Building on the above, preflight adds structural classification for planned-new files and tightens file reference detection to reduce false positives.
  - `/spectra-discuss` adds an "assumptions mode" that scouts the codebase before asking questions, reducing typical interaction rounds from ~15 to ~2–4 for brownfield projects.
  - `/spectra-propose` now automatically parks the change after validation, preventing half-baked artifacts from lingering in the changes directory.
  - `/spectra-commit` adds an archive sub-flow option.
- Switched vector search model to a smaller, multilingual alternative (index rebuild required).
- Experimental — Added `specx`, a standalone cross-platform CLI.
- Slash Commands are no longer generated by default; Skills are now the primary interaction format. Projects with explicit config are unaffected.
- Added `xhigh` effort level option for Opus 4.7 in Settings.
- Fixed `spec_dir` configuration issue in `.spectra.yaml`.
- Fixed templates still referencing the old `config.yaml` path, causing settings to silently fail.
- Fixed `spectra` CLI opening the GUI by mistake when given an unknown subcommand.
- Fixed CLI name detection — now derived from the running binary instead of relying on PATH lookup.
- Fixed fullscreen scaling to use CSS zoom instead of font-size, avoiding font-size scaling side effects.
- Fixed active tab close button visibility and compressed tab layout.
- Fixed embedded fonts by adding `unicode-range` and an Apple Symbols fallback.
- Fixed default spec directory — changed from `openspec/` to `docs/specs/`; the core no longer hardcodes the legacy path.
- Fixed copy-path not passing the project's `spec_dir`.
- Fixed vector sync not triggering after a `spec_dir` change.
- Fixed image-only memos (no text) failing to create.
- Fixed spectra skill references in `CLAUDE.md` not being converted to hyphen format.

---

- Windows 上暫時停用視窗位置記憶，避免 Windows 啟動異常。
- SDD Skill 調整
  - `/spectra-apply` 新增前置檢查（Preflight）：偵測遺失檔案、程式碼偏移、過期內容、artifact 品質問題，避免在不一致的狀態下開始實作；task loop 也新增實作後驗證（post-implementation verification）。
  - 承上，preflight 對規劃中要新增的檔案加上結構分類，並強化檔案參照辨識，降低誤判。
  - `/spectra-discuss` 新增「假設模式」，先掃描程式碼再提問，Brownfield 專案的互動輪數從約 15 回合縮短至 2–4 回合。
  - `/spectra-propose` 驗證後會自動將 change 暫存（park），避免半成品留在 changes 目錄。
  - `/spectra-commit` 新增 archive 子流程選項。
- 更換 向量搜尋模型，支援更多語言且體積更小（需重新建立索引）。
- 實驗 新增 `specx` 獨立的跨平台命令列工具。
- Slash Commands 預設不再產生，改以 Skills 為主要互動格式，已有明確設定的專案不受影響。
- 新增 設定 Opus 4.7 的 `xhigh` effort level。
- 修正 `.spectra.yaml` 裡 `spec_dir` 的設定問題。
- 修正 模板仍引用舊的 `config.yaml` 路徑，導致設定失效的問題。
- 修正 `spectra` CLI 遇到未知子指令時會錯誤開啟 GUI 的問題。
- 修正 CLI 偵測方式，改從執行中的 binary 判斷名稱，不再依賴 PATH 查找。
- 修正 全螢幕縮放改用 CSS zoom，避免 font-size 縮放產生的副作用。
- 修正 分頁作用中分頁的關閉按鈕顯示，並壓縮分頁排版。
- 修正 嵌入字型加上 unicode-range，並補上 Apple Symbols fallback。
- 修正 預設規格目錄從 `openspec/` 改為 `docs/specs/`，核心不再寫死舊路徑。
- 修正 複製路徑功能未帶入專案 `spec_dir` 的問題。
- 修正 `spec_dir` 變更後向量同步未被觸發的問題。
- 修正 純圖片 memo（沒有文字）無法建立的問題。
- 修正 CLAUDE.md 中 spectra skill 參照格式未轉為連字號的問題。
