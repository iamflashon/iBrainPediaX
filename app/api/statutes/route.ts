import { NextRequest, NextResponse } from "next/server";

type StatuteQuery = {
  name?: string;
  pcode?: string;
  articles?: number[];
};

type OfficialArticle = {
  name: string;
  article: number;
  text: string;
  sourceUrl: string;
};

const ALLOWED_PCODES = new Set([
  "A0000001",
  "B0000001",
  "B0010001",
  "C0000001",
  "C0010001",
  "A0030055",
  "J0080001",
  "G0400001",
]);

function decodeHtml(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function extractArticle(plainText: string, article: number) {
  const marker = new RegExp(`第\\s*${article}\\s*條\\s*`);
  const startMatch = marker.exec(plainText);
  if (!startMatch) return "";
  const start = startMatch.index + startMatch[0].length;
  const remaining = plainText.slice(start);
  const nextArticle = /\n?\s*第\s*\d+(?:-\d+)?\s*條\s*/.exec(remaining);
  return remaining
    .slice(0, nextArticle?.index ?? remaining.length)
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, 1800);
}

export async function POST(request: NextRequest) {
  let body: { queries?: StatuteQuery[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "法規查詢格式不正確。" }, { status: 400 });
  }

  const queries = (body.queries ?? [])
    .filter((query) => query.pcode && ALLOWED_PCODES.has(query.pcode))
    .slice(0, 4);
  if (!queries.length) {
    return NextResponse.json({ error: "本題尚未辨識出可核對的法規條文。" }, { status: 400 });
  }

  try {
    const articles: OfficialArticle[] = [];
    for (const query of queries) {
      const pcode = query.pcode as string;
      const sourceUrl = `https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=${encodeURIComponent(pcode)}`;
      const response = await fetch(sourceUrl, {
        headers: {
          Accept: "text/html",
          "User-Agent": "iBrain-Pedia-X/1.0 (official-statute-verification)",
        },
        cf: { cacheTtl: 3600, cacheEverything: true },
      } as RequestInit & { cf: { cacheTtl: number; cacheEverything: boolean } });
      if (!response.ok) throw new Error(`official source returned ${response.status}`);
      const plainText = decodeHtml(await response.text());
      for (const article of [...new Set(query.articles ?? [])].slice(0, 6)) {
        const text = extractArticle(plainText, article);
        if (text) {
          articles.push({
            name: query.name || "中華民國現行法規",
            article,
            text,
            sourceUrl,
          });
        }
      }
    }
    if (!articles.length) {
      return NextResponse.json({ error: "官方來源已回應，但未找到本題指定條號。" }, { status: 404 });
    }
    return NextResponse.json(
      {
        articles,
        source: "法務部全國法規資料庫",
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "public, max-age=900, s-maxage=3600" } },
    );
  } catch {
    return NextResponse.json(
      { error: "目前無法連上法務部全國法規資料庫，請稍後重新查詢。" },
      { status: 502 },
    );
  }
}
