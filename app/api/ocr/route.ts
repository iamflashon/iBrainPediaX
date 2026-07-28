import { NextRequest, NextResponse } from "next/server";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

function cleanText(value: string) {
  return value.normalize("NFKC").replace(/\uFFFD/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  if (!Array.isArray(record.output)) return "";
  return record.output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = (item as Record<string, unknown>).content;
    return Array.isArray(content) ? content : [];
  }).map((item) => {
    if (!item || typeof item !== "object") return "";
    const text = (item as Record<string, unknown>).text;
    return typeof text === "string" ? text : "";
  }).filter(Boolean).join("\n");
}

function parseImageResult(value: string) {
  const cleaned = value.trim().replace(/^```json\s*|\s*```$/g, "");
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const raw = firstBrace >= 0 && lastBrace > firstBrace
    ? cleaned.slice(firstBrace, lastBrace + 1)
    : cleaned;
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed.readable === false) {
    const reason = cleanText(typeof parsed.reason === "string" ? parsed.reason : "");
    return { readable: false as const, reason };
  }
  const transcription = cleanText(typeof parsed.transcription === "string" ? parsed.transcription : "");
  const answer = cleanText(typeof parsed.answer === "string" ? parsed.answer : "");
  const subject = parsed.subject === "中級會計" ? "中級會計" : "法律";
  const sourceType = parsed.source_type === "exam_question"
    ? "exam_question"
    : parsed.source_type === "textbook_question"
      ? "textbook_question"
      : "unconfirmed";
  const sourceNote = cleanText(typeof parsed.source_note === "string" ? parsed.source_note : "");
  const uncertaintyNote = cleanText(typeof parsed.uncertainty_note === "string" ? parsed.uncertainty_note : "");
  if (!transcription || !answer) throw new Error("invalid image result");
  return { readable: true as const, transcription, answer, subject, sourceType, sourceNote, uncertaintyNote };
}

type SolvedImageResult = Extract<ReturnType<typeof parseImageResult>, { readable: true }>;

function detectContentDomain(text: string) {
  const lawHits = (text.match(/刑法|民法|行政法|憲法|訴訟法|犯罪|故意|過失|構成要件|違法|罪責|法條|判決|法院|被告|告訴|公務員|正當防衛|義務衝突/g) ?? []).length;
  const accountingHits = (text.match(/會計|折舊|攤銷|分錄|借方|貸方|資產|負債|權益|損益|公允價值|現金流量|應收|應付|存貨|利息|年限|殘值|加權平均|移動平均|平均成本|單位成本|先進先出|後進先出|期初存貨|期末存貨|進貨成本|可供銷售商品成本|永續盤存|定期盤存/g) ?? []).length;
  if (lawHits > 0 && lawHits > accountingHits) return "法律" as const;
  if (accountingHits > 0 && accountingHits > lawHits) return "中級會計" as const;
  return null;
}

function hasCrossSubjectConflict(result: SolvedImageResult) {
  const questionDomain = detectContentDomain(result.transcription);
  const answerDomain = detectContentDomain(result.answer);
  return Boolean(questionDomain && answerDomain && questionDomain !== answerDomain);
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OCR 服務目前未啟用，請稍後再試。" }, { status: 503 });

  const formData = await request.formData();
  const image = formData.get("image");
  const studentQuestion = cleanText(String(formData.get("question") || "")).slice(0, 1200);
  if (!(image instanceof File)) return NextResponse.json({ error: "請選擇一張題目圖片。" }, { status: 400 });
  if (!ACCEPTED_TYPES.has(image.type) || image.size > MAX_BYTES) {
    return NextResponse.json({ error: "僅支援 8 MB 以內的 JPG、PNG 或 WebP 圖片。" }, { status: 400 });
  }

  const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
  const requestImageAnswer = (correction = "") => fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || process.env.OPENAI_OCR_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions: [
        "你是 iBrain 的繁體中文考題影像解題助教。直接閱讀原圖並解題，不可只依扁平 OCR 文字猜測。",
        "第一步必須先判斷題目科目，再只使用該科目的概念作答。法律題不得套用會計認列、折舊、分錄等內容；會計題不得套用刑法構成要件、違法性或罪責等內容。",
        "先在內部忠實重建題號、題幹、選項、表格列欄、分錄及數學版面；特別辨認分數線、括號、上下標、負號、百分比與金額。",
        "同時辨認學生在圖片上手寫、圈選、畫線或另外打字提出的疑問，以及學生留下的計算式、分錄與作答痕跡。像「不知想法哪裡錯」「我選 B 錯在哪」「這一步為什麼」都屬於學生真正要問的問題，不可忽略。",
        "若本次請求另附學生輸入的文字問題，該文字問題是首要任務。必須直接回答它，並用圖片內容、圈選與作答痕跡作為判斷依據；不得忽略文字問題而改成一般標準解題。",
        "文字問題與圖片的用途必須分開判斷：若學生輸入的文字本身已足以回答觀念、公式用途、解題步驟或『為什麼不是某種算法』，即使圖片只有部分內容可辨認，也必須將 readable 設為 true 並先回答文字問題。圖片不足只能限制你對題目金額、選項或最終答案的斷言，不能阻止概念說明。",
        "若圖片中可辨認學生的疑問或解題痕跡，answer 必須優先直接回應該疑問：先指出學生想法中第一個錯誤步驟，引用其實際寫法或數字，說明錯誤原因，再示範如何從該步修正。最後才用精簡方式補上正確答案。不得只重做一遍標準解法。",
        "若只能看出學生表示『不知道哪裡錯』，但無法可靠辨認其完整計算痕跡，必須明說目前可辨認到哪一段，並以題目中最可能造成該結果的具體步驟作對照；不可假裝已看懂未辨認出的筆跡。",
        "不要因為圖片稍微傾斜、有網紋、局部裁切或少數文字模糊，就直接判定整張圖片無法辨識。只要能可靠確認學生的文字問題，以及回答該問題所需的題幹、數字、公式或作答痕跡，就必須先回答。",
        "若只有非關鍵文字看不清，readable 仍填 true；在 uncertainty_note 精確指出哪一小段無法確認，answer 則先回答可確認的部分。不得只回覆『請重新上傳』。",
        "只有在缺少會直接改變答案的關鍵題幹、數字、選項或圖表，而且無法從學生的文字問題與可見內容可靠作答時，才輸出 JSON：{\"readable\":false,\"reason\":\"具體指出缺少哪個關鍵部分\"}。",
        "數學式不得把 a-b÷2 誤讀為 (a-b)÷2。每個分數線都要先確認分子與分母的實際涵蓋範圍。",
        "會計計算至少用第二種等價方式驗算一次；若選擇題有官方答案標示，答案與計算不一致時必須重新檢查版面，不得逕稱教材錯誤。",
        "另辨識圖片可見的來源線索，例如考試名稱與年度、教材章節、頁碼、範例題號。若題目明確標示或可可靠判斷為教材收錄考古題，source_type 填 exam_question；只有教材範例線索填 textbook_question；無法確認填 unconfirmed。不可猜測考試名稱。",
        "回答使用繁體中文。沒有學生特定疑問時，先寫正確選項或結論，再列必要算式與理由；有學生特定疑問時，依前述方式先回應疑惑。不要向學生顯示 OCR 逐字稿、辨識流程或內部檢查過程。",
        "可回答時只輸出 JSON：{\"readable\":true,\"transcription\":\"供系統內部使用的題目文字；無法確認的非關鍵片段以〔局部不清〕標示，數式以括號明確表示作用範圍\",\"subject\":\"法律或中級會計\",\"answer\":\"給學生看的完整解答\",\"source_type\":\"exam_question、textbook_question 或 unconfirmed\",\"source_note\":\"只寫圖片可見且可確認的來源資訊\",\"uncertainty_note\":\"若有局部不清，精確指出；全部清楚則留空\"}。",
        correction,
      ].join("\n"),
      input: [{ role: "user", content: [
        {
          type: "input_text",
          text: studentQuestion
            ? `學生輸入的真正問題如下，請優先直接回應：\n「${studentQuestion}」\n\n請以圖片中的題目、圈選、手寫與作答痕跡為依據判斷，再依指定 JSON 格式輸出。`
            : "學生未另外輸入文字問題。請辨識並解答圖片中的題目；先保留原圖數學結構並自行驗算，再依指定 JSON 格式輸出。",
        },
        { type: "input_image", image_url: `data:${image.type};base64,${base64}`, detail: "high" },
      ] }],
      max_output_tokens: 4200,
      }),
  });

  let response = await requestImageAnswer();
  if (!response.ok) return NextResponse.json({ error: "圖片暫時無法辨識，請重新拍攝或稍後再試。" }, { status: 502 });
  try {
    let result = parseImageResult(extractText(await response.json()));
    if (!result.readable && studentQuestion) {
      response = await requestImageAnswer([
        "上一輪把圖片局部不清誤判成整題不可回答。",
        `學生已明確輸入：「${studentQuestion}」`,
        "請改走文字優先的部分回答：只要這段文字足以解釋觀念、公式用途或學生想法，readable 必須填 true；transcription 至少保留學生問題及圖片中可確認的關鍵資訊，answer 直接回答文字疑惑。",
        "看不清的金額、選項或題幹放在 uncertainty_note，且不要猜測；只有連這個文字問題本身都語意不完整、無法提供任何可靠說明時才可維持 readable false。",
      ].join("\n"));
      if (!response.ok) throw new Error("text-priority retry failed");
      result = parseImageResult(extractText(await response.json()));
    }
    if (!result.readable && studentQuestion.length >= 8) {
      response = await requestImageAnswer([
        "這是最後的文字優先回答，不得再以圖片不完整為由拒絕整題。",
        `學生已輸入可獨立理解的問題：「${studentQuestion}」`,
        "請將 readable 固定為 true。先針對文字問題說明可確定的觀念與解題步驟，再把圖片中能辨認的公式、頁碼或手寫計算作為輔助。",
        "任何看不清或無法核對的題目數字，只能放入 uncertainty_note；不得猜測，也不得阻止回答。",
        "若無法確認最終數值答案，就明確說明尚缺哪一個數字，但仍須完成學生所問的算法差異、第一個可能錯誤步驟及檢查方式。",
      ].join("\n"));
      if (!response.ok) throw new Error("forced text-priority retry failed");
      result = parseImageResult(extractText(await response.json()));
    }
    if (!result.readable) {
      return NextResponse.json({
        error: result.reason || "圖片清晰度不足，無法可靠辨識完整題目。",
        code: "image_unreadable",
      }, { status: 422 });
    }
    if (hasCrossSubjectConflict(result)) {
      response = await requestImageAnswer("上一輪草稿發生跨科套用。請重新從原圖判斷科目並完整重答；不得沿用上一輪的任何結論、公式或用語。");
      if (!response.ok) throw new Error("cross-subject retry failed");
      result = parseImageResult(extractText(await response.json()));
      if (!result.readable || hasCrossSubjectConflict(result)) {
        return NextResponse.json({
          error: "系統偵測到回答科目與題目不一致，已停止顯示錯誤解析，請再送出一次。",
          code: "subject_mismatch",
        }, { status: 422 });
      }
    }
    const detectedDomain = detectContentDomain(result.transcription);
    return NextResponse.json({
      text: result.transcription,
      subject: detectedDomain ?? result.subject,
      answer: result.answer,
      sourceType: result.sourceType,
      sourceNote: result.sourceNote,
      uncertaintyNote: result.uncertaintyNote,
    });
  } catch {
    return NextResponse.json({
      error: "目前無法可靠辨識完整題目，請換一張較清楚的圖片。",
      code: "image_unreadable",
    }, { status: 422 });
  }
}
