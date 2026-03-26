# Changelog

## 2.2.1

- Redesigned the sidebar.
- Added workflow tip feature.
- Keyboard shortcut hints now use monospace font for better visual consistency.
- Fixed an issue where some badges were invisible on older macOS (< 13.1) due to unsupported color format in WebKit.

---

- 側邊欄重新設計。
- 新增工作流程提示功能。
- 鍵盤快捷鍵提示使用等寬字體，視覺更一致。
- 修正 舊版 macOS（< 13.1）上部分標籤因 WebKit 不支援色彩格式而無法顯示的問題。

## 2.2.0

- Added `.spectra.yaml` project config file — app-level settings are now separate from OpenSpec config.
- Added Gemini tool support — `GEMINI.md` is auto-generated during project initialization.
- Added image attachment support for Memos.
- Added customizable prose typography — adjust content area font family and size in Settings.
- Added window geometry persistence — window size and position are restored on relaunch.
- Added per-skill Effort Level setting for Claude Code.
- Design artifact is now optional — simple changes no longer require a `design.md` file.
- `proposal.md` now includes a Non-Goals section automatically when design is skipped, ensuring rejected approaches are recorded.
- `/spectra-discuss` now includes anti-sycophancy and pushback rules — the Agent won't just agree with everything.
- Fixed macOS shell PATH detection being polluted by environment variable output, causing CLI detection to fail on GUI launch.
- Fixed 500 error on first launch after a fresh install.
- Fixed titlebar empty tab area not being draggable for window movement.
- Fixed Agent detection falsely identifying `.opsx` directory as Claude Code.
- Fixed `@trace` comment blocks not being stripped from Markdown rendering.

---

- 新增 `.spectra.yaml` 專案設定檔，app 層級設定與 OpenSpec config 分離
- 新增 Gemini 工具支援，初始化專案時自動產生 `GEMINI.md`
- 新增 Memo 可插入圖片附件
- 新增 可調整內容區的字體和字級大小
- 新增 視窗位置記憶，關閉後重新啟動會還原上次的視窗大小和位置
- 新增 Claude Code 的 Effort Level 設定
- 簡單變更不會強制建立 `design.md` 檔案，
- 承上，`proposal.md` 在跳過 design 時自動加入 Non-Goals 區塊，確保被排除的做法有地方記錄
- `/spectra-discuss` 加入反阿諛和推回規則，Agent 不會只是附和想法
- 修正 macOS 上 shell PATH 偵測被環境變數輸出污染導致 GUI 啟動時 CLI 偵測失敗的問題
- 修正 全新安裝首次開啟時 500 錯誤的問題
- 修正 標題列空白分頁區域無法拖曳視窗的問題
- 修正 Agent 偵測將 `.opsx` 目錄誤判為 Claude Code 的問題
- 修正 Markdown 渲染時 `@trace` 註解區塊未被清除的問題
