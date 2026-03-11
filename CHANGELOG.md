# Changelog

## 2.1.6

- 修正 Windows 安裝程式覆寫系統 PATH 的問題
- 修正 使用中文／日文輸入法選字時，Enter 鍵誤觸表單送出的問題。
- 修正 非 Claude Code 無法存取暫存（parked）change 的問題。
- 修正 macOS 上 Fish shell 的 PATH 格式導致 GUI 啟動時 CLI 偵測失敗的問題。
- 已存檔的 change 列表改用 SQLite 快取，取代逐檔掃描，開啟速度更快。
