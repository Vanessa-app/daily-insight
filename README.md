# Daily Insight V1.4 — 原始證據與逐段雙語閱讀（雲端版）

## 先看：功能與限制
本版修正 V1.3 的 **650 字元硬截斷**，保留 RSS 提供的較完整文字（單則最多 12,000 字元，分段顯示），新增逐段原文／繁中對照、翻譯狀態與失敗提示。**這不代表取得新聞網站全文**：RSS 本身若只有短摘要，本站仍只能展示該摘要。未授權的全文不會被爬取或複製；未驗證的中文深度解說也不會由 AI 憑空生成。

**翻譯需要 DeepL API 金鑰。** 靜態 GitHub Pages 無法安全地直接保管翻譯金鑰，所以使用 GitHub Actions 在背景執行翻譯。沒有金鑰時，閱讀器顯示原文與明確提示，而不是假裝有翻譯。DeepL API 可能需要帳號及付費，且翻譯可能不完全準確。

## GitHub 更新（保留網址）
1. 下載 ZIP 並解壓，**先備份**原專案（特別是資料與個人修改）。
2. 使用 GitHub Desktop Clone 既有 `daily-insight` 儲存庫，保留 `.git` 資料夾。把本 ZIP 中的所有檔案和資料夾覆蓋到 clone 的根目錄（不是再包一層 `daily-insight-v1.4`）。
3. 檢查 `.github/workflows/daily-news.yml`、`scripts/update_news.py`、`data/news.json` 三個路徑存在。Commit → Push origin。
4. GitHub Settings → Pages：Deploy from a branch，`main` / `(root)`。原網址維持不變。
5. Actions → **Update primary-source news** → Run workflow，等待完成，查看 `data/news.json`。

## 開啟繁體中文翻譯（必要設定）
1. 於 DeepL 官方取得 API Key（留意免費額度、費率及服務條款）。
2. GitHub 專案 → Settings → Secrets and variables → Actions → New repository secret。
3. Name: `DEEPL_AUTH_KEY`；Secret: 你的 API Key。**不要貼進程式碼或公開儲存庫。**
4. 如果使用 DeepL Pro API，另外在 workflow 的 `env` 加入 `DEEPL_API_URL: https://api.deepl.com/v2/translate`；免費版預設 `https://api-free.deepl.com/v2/translate`。
5. 手動執行 Actions，打開 `data/news.json` 確認 `translation_status` 為 `translated` 且 `evidence_zh_hant` 有內容。若顯示 `not_configured`，金鑰尚未正確設定；`provider_error` 代表 API 連線或服務回傳錯誤，請查看 Actions logs。

## 檢查是否成功
- 文章內「內容範圍」應顯示官方 RSS 原始內容，不應誤稱完整新聞全文。
- 中文／逐段對照／原文按鈕可切換；已翻譯文章中，原文和中文段落數量一致。
- `data/news.json` 中每篇包含 `evidence_original`、`evidence_zh_hant`、`translation_status`、`content_complete:false`、原始網址及發布日期。
- Actions 成功 **不代表** 所有 RSS 都成功。檢查 `sources` 各來源的 `status`、`accepted` 數量。
- 清除舊版快取：Windows `Ctrl+Shift+R`，或使用無痕視窗；PWA 可能需要關閉重開。

## 來源與授權
現有來源 NASA、WHO、UN 的 RSS feed URL 可能變更；須在部署後實際驗證。只核對官方來源網域，不代表個別主張已獨立查證。若某來源不允許摘要重製／翻譯，請在 `sources.json` 停用它。完整官方全文接入需要逐來源確認開放授權及 API，這部分尚未完成；因此本版是可執行的**證據式閱讀器基礎版**，不是已經實現所有來源完整全文的版本。
