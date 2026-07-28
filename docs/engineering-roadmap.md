# iBrainPediaX 工程化路線圖

## 現況摘要

iBrainPediaX 已是可展示完整學習流程的功能型 MVP，不是空白 starter。現階段最大的工程風險不是功能不足，而是前端集中、測試不足，以及正式多人使用所需的身分與防濫用邊界尚未建立。

截至本文件建立時，主要檔案規模約為：

| 檔案 | 行數 | 責任 |
| --- | ---: | --- |
| `app/page.tsx` | 8,627 | 領域資料、UI、狀態、搜尋、API 呼叫與所有學習流程 |
| `app/globals.css` | 3,850 | 全站與功能樣式 |
| `app/api/ask/route.ts` | 517 | 問答、申論、解析、檢查與快取 |
| 主要程式合計 | 約 13,500 | 不含資料檔與工具腳本 |

## 已具備的安全與可靠性基礎

- AI 回答已有法律分類規則、回答檢查與不可靠輸出抑制。
- OCR 限制 JPEG、PNG、WebP 與 8 MB，並處理模糊圖片、跨科誤答及文字優先重試。
- AI 結構化輸出解析失敗時停止顯示，不直接呈現不可信結果。
- 法規查詢使用 pcode allowlist，避免任意 URL 請求。
- D1 schema、migration 與唯一索引一致。
- AI 解說快取失敗不阻斷學生作答。

## 風險與改善方向

### P0：建立可安全迭代的邊界

#### 1. 拆分前端單體

先依產品功能建立下列 feature 邊界：

```text
features/
  search/
  past-exams/
  essay-review/
  solution-books/
  issue-training/
  image-solver/
```

每個 feature 逐步包含：

- 顯示元件
- 狀態 hook 或 reducer
- 純函式 domain service
- API client
- feature 專屬型別與測試

第一階段只做等價搬移，不同時改變互動或資料格式。共用的弱點計算、分類與輸出解析必須先抽成純函式並補測試，降低拆分造成 regression 的機率。

驗收條件：

- `app/page.tsx` 只負責頁面組合與頂層導覽。
- 六個主要流程可獨立修改，不需要碰觸其他 feature 的狀態。
- 領域邏輯可在不 render React 的情況下測試。

#### 2. 補核心測試

優先覆蓋：

- `/api/ask` 輸入長度、缺值與模式分流
- OpenAI Responses API 文字與 JSON 解析
- 法律回答規則與警示抑制
- OCR 無法辨識、跨科檢查與 retry 上限
- D1 重複寫入與唯一索引行為
- 弱點統計、錯題與收藏狀態
- 一試、申論、圖片與爭點訓練的主要 UI 互動

測試分層：

- unit：純函式與 parser
- route integration：mock OpenAI、法務部與 D1
- component：feature 狀態轉移與互動
- smoke / E2E：每種學習模式至少一條成功路徑

現有 `tests/rendered-html.test.mjs` 應保留為部署 smoke test，但不能作為核心功能正確性的唯一門檻。

### P1：多人服務的信任與成本邊界

#### 3. 將學習紀錄綁定伺服器端身分

目前 `learnerKey` 由瀏覽器產生並由 client 傳入；持有 key 的人可讀取對應紀錄。正式環境應：

- 從已驗證 request identity 取得 immutable user ID。
- API 忽略 client 提供的 user identifier。
- 查詢與寫入都由 server 注入 user ID。
- 視資料敏感度增加保留期限、刪除與匯出機制。

#### 4. 為 AI 路由加入防濫用與可觀測性

至少加入：

- 每使用者與每 IP rate limit
- 每日／每月配額與模型成本上限
- `AbortController` timeout
- 有上限且只針對暫時性錯誤的退避重試
- request ID、延遲、模型、token 與失敗類型紀錄
- 伺服器端授權

OCR 單次操作可能觸發多次模型請求，應設定明確的總嘗試次數與單次操作成本上限。

#### 5. 收緊 AI 輸入可信邊界

教材證據、課程資訊與老師擬答若屬平台可信內容，client 應只提交資料 ID；server 驗證使用權限後查詢正式內容，再組合模型 prompt。使用者輸入與平台證據需在 prompt 與記錄中明確區分。

### P2：效能與產品韌性

#### 6. 考題與教材按需載入

`app/data/first-exam-114.json` 約 308 KB，目前直接進入 client page。建議按科目、年度或頁次從 server 載入，並量測：

- 初始 JavaScript 大小
- hydration 時間
- 首次互動時間
- 各 feature 資料載入量

#### 7. Accessibility、錯誤邊界與 render 效能

- 為功能區加入 React error boundary 與可恢復錯誤畫面。
- 檢查鍵盤操作、focus、表單 label、對比與動態狀態公告。
- 用 profiler 找出昂貴 render，再決定 memoization；避免無量測的全面最佳化。

## 建議交付順序

1. 抽出 parser、分類與弱點計算純函式，補 unit test。
2. 拆分六個 feature，維持現有行為。
3. 建立 API integration test 與外部服務 mock。
4. 導入可信 server identity 並 migration 現有紀錄策略。
5. 加入 AI timeout、rate limit、配額與成本觀測。
6. 將可信教材改為 server-side lookup。
7. 將大型資料改為 lazy loading。
8. 補 E2E、accessibility 與錯誤邊界。

每一階段應以小型 PR 交付，明列行為是否改變、migration／rollback 方式，以及可量測的驗收結果。不要把架構搬移、產品改版和資料格式變更塞進同一個 PR。
