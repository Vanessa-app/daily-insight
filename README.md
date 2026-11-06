# Daily Insight V1.3 — 雜誌式閱讀與雙語對照

## 本版新增
- 雜誌式響應版面、站內閱讀器、中文／原文／對照切換。
- 只展示官方 RSS 提供的短摘要（最多 650 字元），不爬取、複製未授權全文。
- 可選 DeepL API 翻譯 RSS 摘要，若沒有金鑰則顯示原文並標示未翻譯，不會虛構譯文。
- 新聞來源、日期、原文連結及來源核實狀態。

## GitHub 更新方法（重要）
將 ZIP 內檔案上傳至 Repository **相同路徑**：`.github/workflows/daily-news.yml`、`scripts/update_news.py`、`data/news.json`。請勿把這三個檔案全部放在根目錄。其他 `index.html`、`app.js`、`style.css`、`sw.js` 等放根目錄。覆蓋舊檔案後，Settings → Pages 使用 main / root。Actions → Update primary-source news → Run workflow。

## 自動翻譯設定（選用）
1. 到 DeepL 官方建立 API 帳號取得 API key（可能有費用與使用量限制）。
2. GitHub 專案 Settings → Secrets and variables → Actions → New repository secret，Name 設 `DEEPL_AUTH_KEY`，Secret 貼入 API key。
3. Actions 手動執行 Update primary-source news，待 `data/news.json` 新增 `translation_zh_hant` 後即可在 App 切換中英對照。
4. 沒有 key 仍可閱讀官方原文片段；不會自動翻譯。不要將 API key 放入公開 Repository。

## 內容與查證限制
目前只核對來源網域，不代表文章主張已獨立驗證。RSS 摘要不等於全文，部分 RSS 可能不提供摘要。發布前須確認各來源 RSS 摘要重製、翻譯的授權條款；若不允許，應停用相應來源的內文展示。任何錯誤請回到原始來源核對。
