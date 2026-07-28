import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, /智學百科｜智慧學習/);
  assert.doesNotMatch(html, /每一個答案，都有來處。/);
  assert.doesNotMatch(html, /智慧法律學習/);
  assert.doesNotMatch(html, /正式 Schema 核對結果/);
  const pageSource = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(pageSource, /wFrmExamQandASearch\.aspx/);
  assert.doesNotMatch(pageSource, /qr\.ibrain\.com\.tw/);
  assert.doesNotMatch(pageSource, /觀看嶺律師|試聽嶺律師/);
  assert.doesNotMatch(pageSource, /真題解題 30 題/);
  assert.match(pageSource, /高點司律一試題庫已接入/);
  assert.doesNotMatch(pageSource, /高點真題庫尚未接入本頁/);
  assert.match(pageSource, /商品頁尚未完成對應/);
  assert.match(pageSource, /裁判原文連結待建立/);
  assert.match(pageSource, /AI 直接依原圖的題幹、表格與算式結構解題/);
  assert.doesNotMatch(pageSource, /void searchAndAnswer\(recognizedText/);
  const ocrRoute = await readFile(
    new URL("../app/api/ocr/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(ocrRoute, /a-b÷2 誤讀為 \(a-b\)÷2/);
  assert.match(ocrRoute, /第二種等價方式驗算一次/);
  assert.match(ocrRoute, /不要向學生顯示 OCR 逐字稿/);
  assert.match(ocrRoute, /文字問題與圖片的用途必須分開判斷/);
  assert.match(ocrRoute, /文字優先的部分回答/);
  assert.match(ocrRoute, /最後的文字優先回答/);
  assert.match(pageSource, /正在解析原始圖片/);
  assert.match(pageSource, /image-live-progress/);
});
