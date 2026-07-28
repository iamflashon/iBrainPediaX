# iBrainPediaX

iBrainPediaX 是一個「法律＋中級會計」智慧學習平台的功能型 MVP。產品已具備從教材搜尋、AI 問答、考題練習到學習紀錄的完整展示流程；目前仍以單頁式架構為主，適合產品驗證與展示，尚未完成正式多人服務需要的身分、配額與模組化工程。

## 主要功能

- 教材證據搜尋與 AI 問答
- 法律／中級會計分類
- 一試選擇題、錯題、收藏與弱點分析
- 二試申論陪練及老師擬答比較
- 爭點拆解式訓練
- 圖片題目 OCR 與 AI 解題
- 法務部法規即時核對
- AI 解說快取與學習紀錄保存

## 技術架構

| 層級 | 技術 |
| --- | --- |
| UI | React 19、Next.js 16 App Router |
| 執行框架 | Vinext、Vite |
| 部署 | Cloudflare Workers / OpenAI Sites |
| 資料庫 | Cloudflare D1、Drizzle ORM |
| AI | OpenAI Responses API |
| 樣式 | Tailwind PostCSS＋自訂 CSS |
| 語言 | TypeScript |
| 本地狀態 | React state＋`localStorage` |

主要資料流：

```text
使用者
  └─ app/page.tsx
      ├─ /api/ask             → OpenAI Responses API
      ├─ /api/ocr             → OpenAI 圖像模型
      ├─ /api/statutes        → 法務部法規資料庫
      └─ /api/guided-attempts → Cloudflare D1
```

## 專案結構

```text
app/
  api/
    ask/                 AI 問答、申論陪練／比較、解說快取
    guided-attempts/     爭點訓練紀錄
    ocr/                 圖片辨識與解題
    statutes/            法務部法規核對
  data/                  考題與二試資料
  page.tsx               目前的主要單頁產品
db/
  index.ts               D1 / Drizzle 連線
  schema.ts              AI 解說快取與訓練紀錄 schema
drizzle/                 D1 migration
docs/
  engineering-roadmap.md 架構風險與工程化路線圖
tests/
  rendered-html.test.mjs 建置產物與基礎內容 smoke test
```

目前前端高度集中：`app/page.tsx` 約 8,600 行，`app/globals.css` 約 3,800 行。功能修改前請先閱讀 [工程化路線圖](docs/engineering-roadmap.md)，避免擴大單體元件或把可測試的 domain 邏輯繼續放入頁面。

## 本地開發

### 必要條件

- Node.js `>=22.13.0`
- npm
- Linux 環境需具備 `flock`、`curl` 與 GNU `timeout`

```bash
npm run install:ci
npm run dev
```

常用指令：

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動 Vinext / Vite 開發伺服器 |
| `npm run build` | 建置並驗證 Sites artifact |
| `npm test` | 建置後執行 smoke test |
| `npm run lint` | 執行 ESLint |
| `npm run validate:artifact` | 驗證既有部署 artifact |
| `npm run db:generate` | 依 `db/schema.ts` 產生 migration |

安裝與建置腳本會使用專案內的可寫入暫存目錄；逾時設定可透過 `SITES_INSTALL_TIMEOUT`、`SITES_INSTALL_KILL_AFTER`、`SITES_BUILD_TIMEOUT` 與 `SITES_BUILD_KILL_AFTER` 調整。

## 環境變數與綁定

| 名稱 | 必要性 | 說明 |
| --- | --- | --- |
| `OPENAI_API_KEY` | AI 功能必要 | OpenAI API 金鑰，只能放在伺服器端 |
| `OPENAI_MODEL` | 選用 | 一般問答模型，預設 `gpt-5-mini` |
| `OPENAI_REVIEW_MODEL` | 選用 | 申論比較模型，未設定時沿用 `OPENAI_MODEL` |
| `OPENAI_IMAGE_MODEL` | 選用 | 圖片解題模型 |
| `OPENAI_OCR_MODEL` | 選用 | `OPENAI_IMAGE_MODEL` 未設定時的 OCR fallback |
| `DB` | D1 功能必要 | Cloudflare D1 binding；`.openai/hosting.json` 已宣告此名稱 |

不要提交 `.env` 或 API key。開發環境應使用平台 secret 或本機未追蹤的環境設定。

## 資料庫

Drizzle schema 目前包含：

- `ai_explanation_cache`：依題目與內容版本共用 AI 解說快取
- `guided_issue_attempts`：爭點拆解訓練作答紀錄

修改 `db/schema.ts` 後執行：

```bash
npm run db:generate
```

確認產生的 SQL 與索引，再由 Cloudflare／Sites 部署流程套用 `drizzle/` 下的 migration。請勿手動修改已部署過的 migration。

## 部署

專案由 `.openai/hosting.json` 綁定既有 Sites 專案與 D1 `DB`。遠端 builder 會對推送的 commit 執行 `npm run build`；部署前需在平台設定 `OPENAI_API_KEY` 等 secrets，並確認 D1 migration 已套用。

本專案不使用 `wrangler.jsonc`。`vite.config.ts` 會在本地模擬已宣告的 Cloudflare bindings。

## 已知限制

- 學習紀錄目前以瀏覽器產生的 `learnerKey` 識別，尚未綁定可信的伺服器端登入身分。
- OpenAI 路由尚未完整加入 rate limit、配額、timeout、成本追蹤與授權。
- `/api/ask` 仍接受 client 傳入的教材證據與老師擬答，可信資料應逐步改由 server 依 ID 取得。
- 大型考題 JSON 與靜態資料會進入 client bundle，尚未改為按需載入。
- 現有測試以 build / render smoke test 為主，不能代表核心流程已完整驗證。

詳細風險、驗收條件與建議順序見 [docs/engineering-roadmap.md](docs/engineering-roadmap.md)。
