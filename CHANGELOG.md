# Changelog

## 3.1.0

### Breaking Changes

- Removed the experimental `specx` command-line tool. Its install scripts and updates have stopped; use the npm version, `spxa`, instead. `cli_command: specx` in `.spectra.yaml` is automatically treated as `spxa`.

### Interface

- You can now open a project by dragging a folder onto the Spectra window. On macOS, you can also drop it on the Spectra icon in the Dock.
- When the folder isn't under Git yet, "Initialize Spectra" now offers a "Create a Git repository" option, checked by default.
- Added "Reveal in Finder" ("Reveal in File Explorer" on Windows) to the right-click menu of project icons in the left sidebar.
- Project icons can now be SVG files.
- Canceling "Initialize Spectra" now closes the project that hasn't been initialized and removes it from "Recent Projects".
- Replaced the "S" at the top of the left sidebar with the Spectra logo.

### CLI

- Added an npm version of the CLI: install it with `npm install -g @kaochenlong/spxa`, and the command is `spxa`. It doesn't need the desktop app and works on Linux too.
- Added `spectra rename <old-name> <new-name>` to rename a change; its related records move along with it.
- Added `spectra coverage <change>`, which lists whether each scenario has a corresponding test.
- `spectra task start` and `spectra task done` now accept the task numbers written in tasks.md, such as `2.1`.
- `spectra archive --preview` and the desktop app's archive confirmation dialog now list the reasons an archive would be blocked when it runs.
- `spectra decisions` now also lists Non-Goals, along with the contents of parked changes.
- `spectra analyze` now flags mistakes in task dependencies in tasks.md, such as pointing to a task that doesn't exist or two tasks waiting on each other.
- `spectra validate --specs` now warns about specs whose Purpose hasn't been written yet.
- Running `spectra status`, `spectra instructions`, or `spectra scope` with the name of an archived change now explains that it has been archived and which directory its files are in.
- When run without `--tools`, `spectra init` now explains that no coding agent files were generated this time and lists the agents you can specify.

### SDD Skills

- Before making suggestions or writing design decisions, `/spectra-discuss` and `/spectra-propose` now check past decisions and Non-Goals. If one of them would be overturned, they say so first and leave the decision to you.
- After it finishes, `/spectra-propose` translates the English specs into the project's language. Click "Translation" in the "Specs" tab on the Changes page to switch to the translated version.
- `/spectra-apply` checks off implementation tasks as soon as the code is done, and lists the items that need your own acceptance separately.
- When requirements change partway through apply, the agent now updates the plan with `/spectra-ingest` instead of entering plan mode on its own and interrupting you.
- `/spectra-debug` doesn't change files without your consent. After investigating, it reports the cause and a suggested fix, and lets you decide whether to fix it now, fold it into an existing change, or open a new change.
- `/spectra-verify` now tells apart requirements that a change removes or renames, and doesn't treat them as unimplemented.
- When fixing a problem, the agent fixes the root cause instead of settling for a quick patch that only treats the symptom because the real fix takes more work.
- When `/spectra-apply` writes a test, it notes above the test which scenario it verifies, so you can check with `spectra coverage`.
- With TDD on, tests verify actual behavior; tests that only check fixed copy or layout are no longer required.
- With "Security Audit" on, `/spectra-apply` loads the full security checklist.
- When a change is too large and gets split into several, the ones that must be done in order get a `01-`, `02-` prefix in their names.
- When a coding agent can't find the `spectra` command (for example, because the agent was started before Spectra), it now runs it from the default install location and reminds you to fully quit the agent and start it again.

### Fixes

- Fixed the Windows installer showing "Error opening file for writing" when a terminal or coding agent was running `spectra` during an update, leaving the CLI on the old version.
- Fixed `spectra <folder>` in a terminal sometimes not opening the project when the desktop app was already open.
- Fixed reinitializing a project (`spectra init --force` or initializing from the desktop app) overwriting the entire `config.yaml` in the spec directory with the default content.
- Fixed creating a change with the name of a parked change overwriting the parked one. It's now refused, with a hint to restore it with `spectra unpark <name>`.
- Fixed "Base Font Size" in Settings having no effect on the content of change details and the Specs page since 3.0.0.
- Fixed the "Merged" times in the "Completed changes" list all becoming the same after a project was cloned or copied.
- Fixed initialization failures showing nothing on screen; an error message is now displayed.
- Fixed layout issues:
  - Change detail headers squeezed to one character per line when the window is narrow.
  - Project icons without a custom icon squashed when the window isn't tall enough.
  - The buttons at the bottom of the left sidebar not staying at the bottom when no project is open.
  - The traffic-light buttons at the top left of the window not vertically centered on macOS.
- Fixed Spectra still writing no-longer-used vector search entries to `.gitignore`; opening a project now also removes the ones written earlier.
- Fixed `spectra new artifact spec` rejecting capability names that other commands accept.
- Fixed the file list written into specs at archive time (`@trace`) picking up edits from other changes or unrelated edits in the same working directory. When `spectra task done` records exist, it now lists only the files this change modified.
- Fixed `spectra drift` lowering the score of changes that weren't behind.
- Fixed the creator and archiver recorded for a change using the identity from the global settings in some git repos, instead of the identity the repo actually uses.
- Fixed some records not moving along when renaming a change in the desktop app.

---

### Breaking Changes

- 移除 實驗性的 `specx` 命令列工具，安裝腳本與更新都已停止，請改用 npm 版的 `spxa`。`.spectra.yaml` 裡的 `cli_command: specx` 會自動當成 `spxa`。

### 介面

- 新增 把資料夾拖進 Spectra 視窗就能開啟專案；macOS 也可以拖到 Dock 上的 Spectra 圖示。
- 新增 「初始化 Spectra」視窗在資料夾還沒用 Git 管理時，會多一個「建立 Git repository」選項，預設勾選。
- 新增 左側欄的專案圖示按右鍵，可以「在 Finder 中顯示」（Windows 是「在檔案總管中顯示」）。
- 新增 專案圖示可以使用 SVG 檔。
- 調整 在「初始化 Spectra」視窗按取消，會關掉這個還沒初始化的專案，並從「最近專案」移除。
- 調整 左側欄最上方的「S」換成 Spectra 的 logo。

### CLI

- 新增 npm 版的 CLI：用 `npm install -g @kaochenlong/spxa` 安裝，指令是 `spxa`，不用裝桌面版，Linux 也能用。
- 新增 `spectra rename <舊名稱> <新名稱>` 幫 change 改名，相關紀錄會一起搬過去。
- 新增 `spectra coverage <change>`，列出每個情境（scenario）有沒有對應的測試。
- 調整 `spectra task start`、`spectra task done` 可以直接用 tasks.md 裡的任務編號，例如 `2.1`。
- 調整 `spectra archive --preview` 和桌面版的封存確認視窗，會先列出執行時會被擋下的原因。
- 調整 `spectra decisions` 也會列出 Non-Goals，以及暫存中 change 的內容。
- 調整 `spectra analyze` 會提醒 tasks.md 裡寫錯的任務依賴，例如指到不存在的任務，或兩個任務互相等待。
- 調整 `spectra validate --specs` 會提醒 Purpose 還沒寫的規格。
- 調整 用已封存的 change 名稱執行 `spectra status`、`spectra instructions`、`spectra scope` 時，會說明它已經封存，以及檔案在哪個目錄。
- 調整 `spectra init` 沒加 `--tools` 時，會說明這次沒有產生 coding agent 的檔案，並列出可以指定的 agent。

### SDD Skill

- `/spectra-discuss`、`/spectra-propose` 給建議或寫設計決策之前，會先查過去的決策與 Non-Goals；要推翻其中一條時會先講出來，由你決定。
- `/spectra-propose` 寫完後，會把英文的規格翻成專案的語言，在變更頁的「規格」分頁按「翻譯」就能切換閱讀。
- `/spectra-apply` 程式寫完就勾掉實作任務，需要你親自驗收的項目另外列出來。
- apply 做到一半改需求時，agent 會用 `/spectra-ingest` 更新計畫，不會再自己進 plan mode 打斷你。
- `/spectra-debug` 沒有你的同意不會改檔案；查完會回報原因和建議的修法，讓你決定現在修、併進既有的 change，或開新的 change。
- `/spectra-verify` 會分辨 change 裡刪掉或改名的需求，不把它們當成還沒實作。
- agent 修問題時會修在根本原因上，不會因為比較費工就改用治標的做法。
- `/spectra-apply` 寫測試時，會在測試上方註明它驗證哪個情境，可以用 `spectra coverage` 核對。
- 開啟 TDD 時，測試會去驗證實際的行為；只檢查固定文案或版面的測試不再要求撰寫。
- 開啟安全審查時，`/spectra-apply` 會載入完整的安全檢查清單。
- change 太大要拆成好幾個時，有先後關係的會在名稱前加上 `01-`、`02-`。
- coding agent 找不到 `spectra` 指令時（例如 agent 比 Spectra 早開），會改用預設的安裝位置執行，並提醒你把 agent 完全結束後再開。

### 修正

- 修正 Windows 更新時，如果終端機或 coding agent 正在執行 `spectra`，安裝程式會跳出「Error opening file for writing」，CLI 停在舊版的問題。
- 修正 桌面版已經開著時，在終端機執行 `spectra <資料夾>` 有時不會開啟該專案的問題。
- 修正 重新初始化專案時（`spectra init --force` 或桌面版的初始化），規格目錄裡的 `config.yaml` 會被整份蓋回預設內容的問題。
- 修正 用暫存中 change 的名稱再建立一次 change，會蓋掉暫存的那份；現在會擋下來，並提示用 `spectra unpark <名稱>` 取回。
- 修正 設定頁的「基礎字級」在 3.0.0 之後，對變更詳情與規格頁的內文沒有作用的問題。
- 修正 「已完成的變更」列表的合併時間，在 clone 或複製專案之後全部變成同一個時間的問題。
- 修正 初始化失敗時畫面上沒有任何提示，現在會顯示錯誤訊息。
- 修正 版面：
  - 視窗變窄時，變更詳情的標題被擠成一字一行。
  - 視窗不夠高時，沒有自訂圖示的專案圖示被壓扁。
  - 還沒開啟任何專案時，左側欄底部的按鈕沒有貼齊底部。
  - macOS 視窗左上角的紅綠燈沒有垂直置中。
- 修正 Spectra 仍會在 `.gitignore` 寫入已經用不到的向量搜尋設定；開啟專案時也會清掉之前寫進去的。
- 修正 `spectra new artifact spec` 拒絕其他指令都接受的 capability 名稱的問題。
- 修正 封存時寫進規格的檔案清單（`@trace`），會把同一個工作目錄裡其他 change 或無關的修改也算進來的問題；有 `spectra task done` 的紀錄時，現在只列這個 change 改過的檔案。
- 修正 `spectra drift` 會替沒有落後的 change 扣分的問題。
- 修正 change 記錄的建立者與封存者，在部分 git repo 裡會用到全域設定的身分，而不是這個 repo 實際使用的身分。
- 修正 桌面版幫 change 改名時，有部分紀錄沒有跟著搬過去的問題。

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
