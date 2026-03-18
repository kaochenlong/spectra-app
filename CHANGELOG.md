# Changelog

## 2.1.8

- 修正 Skills/Commands 更新邏輯會刪除非 Spectra 產生的檔案的問題。

## 2.1.7

- Worktree 路徑從 sibling 目錄調整至 `.spectra/worktrees`，並且可讓使用者自訂路徑。
- `spectra-ingest` skill 現在支援所有工具，不限 Claude Code。
- Spec 探索支援巢狀目錄路徑。
- `spectra-ask` 搜尋失敗時回傳結構化 error JSON，不再回傳空結果。
- 修正 Markdown parser 在 fenced code block 內不再誤判 header 和 checkbox。
- 修正 CLI PATH 設定未同時寫入 login profile 和 RC file 的問題。
- 新增 Archive preview 時候的 spec 衝突偵測警告；跳過 spec 更新時也會提示。
- 移除手動 CLI 安裝/移除的 UI 和指令，改為自動管理。

## 2.1.6

- 修正 Windows 安裝程式覆寫系統 PATH 的問題
- 修正 使用中文／日文輸入法選字時，Enter 鍵誤觸表單送出的問題。
- 修正 非 Claude Code 無法存取暫存（parked）change 的問題。
- 修正 macOS 上 Fish shell 的 PATH 格式導致 GUI 啟動時 CLI 偵測失敗的問題。
- 已存檔的 change 列表改用 SQLite 快取，取代逐檔掃描，開啟速度更快。
