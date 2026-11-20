# Daily Insight

## Daily Insight 3.0 第六階段（非正式功能分支，待驗收）

此分支 `feature/daily-insight-v3-stage6` 已依使用者確認的第六階段介面開發，**未合併 `main`、未發布**。現有六大主選單、五個情報子分頁，以及新聞、知識、閱讀紀錄、測驗、每日 08:00／13:00／18:00（台灣時間）排程不變。

- **D3 個人資料備份／匯入：**新增獨立的 `personal-data.js`，以版本化 JSON 匯出原有已讀、收藏、測驗、趨勢關注、企業與關鍵字、事件進展、首頁配置。匯入在本機檢查格式與 2 MB 上限，先預覽類別數量、新增筆數及重複筆數，勾選確認後才合併；原有測驗和事件狀態不覆寫，儲存失敗嘗試還原原資料。全程不傳至伺服器。匯入完成需重新載入頁面。
- **B1 企業／關鍵字觀測：**新增、編輯、停用與重新啟用；設定別名、同義詞及跨領域觀測範圍。只對本站既有事件及來源標題進行字詞比對，不跨來源自動證實事件。
- **B4 事件進展紀錄：**事件詳情顯示帶來源的首次收錄、官方資料、修正／澄清標題訊號及後續報導；手動選擇「新事件、持續發展、待確認、已結束」，沒有新消息不自動結案。
- **B3 個人情報首頁：**依偏好排序六大領域、隱藏與恢復、置頂追蹤事件；原有事件分類、脈絡分析與已關注清單仍可使用。個人設定儲存於現有 `daily-insight-trends-v2`，不修改既有讀者儲存鍵。

**第六階段功能驗收頁：**`preview/stage6-acceptance.html`，由 `python scripts/build_stage6_acceptance.py` 生成；使用此分支真實的 `trends.js`、`personal-data.js`、`style.css`，但替換為虛構事件及記憶體儲存，不會讀寫正式內容、發送網路請求或啟用付費服務。先前純 UI 原型保留於 `preview/stage6-standalone.html`。

驗收：

```bash
python -m unittest discover -s scripts -p 'test_*.py'
node scripts/test_stage6_data.cjs
node scripts/test_stage6_frontend.cjs
node scripts/test_stage6_preview.cjs
node scripts/test_stage5_frontend.cjs
node scripts/test_trend_frontend.cjs
node scripts/test_reader_context.cjs
node scripts/test_reading_queue.cjs
node scripts/test_article_loading.cjs
node --check personal-data.js
node --check trends.js
```

第六階段需使用者明確驗收後才能考慮正式發布。不得自行合併 `main` 或啟用付費服務。

## Daily Insight 3.0 第五階段（2026-11-20 已正式發布）

第五階段已在 2026-11-20 經使用者驗收後發布。沿用原六大主選單、五個趨勢子分頁、閱讀與測驗資料以及原定 08:00、13:00、18:00（臺灣時間）GitHub Actions 排程。

- **A1 多來源事件整合：**改善追蹤參數去重、事件分群時間範圍與部分公司名稱防誤合併，儲存來源群組及舊事件 ID 別名，降低改版後關注紀錄中斷。
- **A4 來源品質：**依原始館藏欄位顯示來源類型與授權範圍；新增有上限的 HEAD 連結檢查，單次最多 12 個網址。只有 HTTP 404/410 才標示「找不到」，403、405、超時等均屬「無法確認」。不擷取網頁正文。
- **A2 標題主張與證據對照：**顯示原始發布者、各來源標題、相似標題群及原始連結。此為文字關聯與來源對照，**不是獨立事實查核或矛盾判定**；`facts` 保持空陣列。
- **D1 新聞並排比較：**可選兩篇報導比較標題、來源、時間、授權可讀範圍及連結；手機版改為上下排列。若事件只有一篇，明示目前無法比較。

不新增付費 API、生成式事實摘要、第三方全文爬取或推播。新檔 `data/source-health.json` 為可缺省的附加索引；缺少時原有新聞、知識、趨勢仍可使用。`data/trend-history.json` 只在原格式上新增事件 ID 與索引篇數欄位，為往後歷史趨勢分析累積可信資料，不回填不存在的歷史。

**非正式操作預覽：**`preview/stage5.html`，或直接開啟無需伺服器的 `preview/stage5-standalone.html`。使用明確標示的虛構資料，並攔截示範連結；與正式網站資料完全隔離。重新產生單檔預覽：`python scripts/build_stage5_preview.py`。

**驗收指令：**

```bash
python -m pip install -r requirements.txt
python -m unittest discover -s scripts -p 'test_*.py'
node scripts/test_trend_frontend.cjs
node scripts/test_stage5_frontend.cjs
node scripts/test_reader_context.cjs
node scripts/test_reading_queue.cjs
node scripts/test_article_loading.cjs
node --check trends.js
```

此分支的改動及示範資料均須經使用者確認後，才可考慮合併至 `main` 或更新正式網站。

## Daily Insight 2.0 智慧趨勢情報中心

新增「趨勢情報」分頁，整合四階段能力，沿用本專案的 GitHub Pages 網址與既有新聞、知識、收藏、測驗、閱讀進度：

1. **趨勢基礎中心：** 六大領域、事件卡片、來源對應與新聞去重。
2. **脈絡與影響檢視：** 事件時間線、關聯知識、來源與排序依據；觀察方向不等同已核實事實。
3. **個人化關注：** 主題偏好、關注清單、站內未讀更新提示；只保存在當前瀏覽器，不發送背景通知。
4. **週月回顧及主題關聯：** 以每日快照生成資料涵蓋率、領域事件存量圖及跨領域關聯；資料不足時不顯示虛構增減率。

趨勢資料由 `python scripts/update_trends.py` 從既有 `data/news.json`、`data/catalog.json`、`data/taiwan.json` 建立 `data/trends.json` 與 `data/trend-history.json`。使用規則式分類及重要性排序，**沒有外部付費 API、生成式 AI 事實摘要或額外爬文**。兩個新檔案完全獨立於原始文章；新功能故障不應阻擋新聞及知識。

趨勢歷史自此功能開始累積，最多保留 180 天，每天保留最近一次快照；週月報告需顯示資料涵蓋天數。來源數量不代表獨立查證；原文與來源的授權限制維持不變。原有排程不變，仍為台灣時間 08:00、13:00、18:00，於原內容更新後產生趨勢索引。

開發驗證：`python scripts/update_trends.py`、`node scripts/test_trend_frontend.cjs`、`node --check trends.js`、`python -m unittest discover -s scripts -p 'test_*.py'`，以及下方既有測試。請先在非正式分支完成審核再合併，避免未經確認修改正式網站。

[開啟 Daily Insight](https://vanessa-app.github.io/daily-insight/)

- iPhone：Safari → 分享 → 加入主畫面。
- Android：Chrome → 安裝應用程式。
- Windows：Edge／Chrome → 安裝。

固定使用原本 GitHub Pages 網址。每日台灣時間 08:00、13:00、18:00 由 GitHub Actions 更新，免費排程可能延遲。開啟頁面、回到分頁及每五分鐘會重新取得已發布的資料；「重新取得內容」不等於即時啟動伺服器爬取。

新聞來源包含原有官方全文，以及 Yahoo 分類標題索引、自由時報授權的非商業 RSS 訊息。RSS 摘要及外站全文清楚區別，不抓取無授權全文或媒體圖片。不同媒體不代表各項報導已獨立查證。

知識包含既有經審核專題與 CC BY-SA 4.0 中文百科文字版。文字版保留 API 提供的正文、章節，未收錄原站圖表、公式與部分註腳，並明示來源、作者群、修訂歷史、授權與用語轉換。至少 900 字、四個實質段落，排除消歧義及公式依賴內容；自動篩選不是人工事實審查。可用時保留學術、論文及圖書館參考連結，這些是延伸閱讀，非本站已全文重製的資料。

`catalog_sources.json` 定義跨主題課程與媒體分類。`scripts/update_catalog.py` 先建立各類種子文章，之後每日由主題分類探索新文章，保存待處理清單及分類分頁，每次最多處理 24 篇新候選，略過太短或不適合的條目；已收錄內容每月輪流重查。單一來源失敗不清空其他來源或既有知識。新聞索引保留最近七日、最多 400 篇。

新聞與知識各自依「完成閱讀」的紀錄補推薦：新聞 12 篇、知識 9 篇，盡量分散主題；首頁排除已讀，全部館藏保留已讀及收藏。每日知識主題輪替並優先未讀。同一瀏覽器的閱讀與測驗進度保存在 localStorage，無法跨裝置同步。讀完不是立即新增遠端爬文，而是先補入資料庫中其他未讀內容；遠端資料庫按上述排程擴充。

既有人工測驗繼續保留。新增百科附有帶原文依據及段落定位的自動核對題，明示是重點回憶而非人工審核的深度理解題。未完成中文翻譯的英文文章不作一般推薦；中文資料更新不再依賴大型翻譯模型。

驗證：`node scripts/test_reading_queue.cjs`、`python -m unittest discover -s scripts -p 'test_*.py'`。部署使用 `main` 根目錄，內容工作流程只提交 `data/news.json` 和 `data/catalog.json`。
