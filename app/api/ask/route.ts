import { NextRequest, NextResponse } from "next/server";

type AskRequest = {
  question?: string;
  allowGeneralAi?: boolean;
  standardAnswer?: "A" | "B" | "C" | "D";
  explanationCache?: {
    questionId?: string;
    contentVersion?: string;
  };
  essayCoach?: {
    examQuestion?: string;
    studentAnswer?: string;
    conversation?: Array<{ question?: string; answer?: string }>;
  };
  essayReview?: {
    examQuestion?: string;
    studentAnswer?: string;
    teacherAnswer?: string;
    scoringIssues?: string[];
    course?: {
      teacher?: string;
      title?: string;
      format?: string;
      reason?: string;
      url?: string;
    };
  };
  followUp?: {
    originalQuestion?: string;
    previousAnswer?: string;
    conversation?: Array<{ question?: string; answer?: string }>;
    followUpQuestion?: string;
  };
  evidence?: Array<{
    title: string;
    edition: string;
    chapter: string;
    page: number;
    text: string;
  }>;
};

type LegalWarningCode =
  | "LEGAL_SUBTYPE_NOT_DISTINGUISHED"
  | "SUBTYPE_RULE_OVERGENERALIZED"
  | "OMISSION_PREVENTION_ABILITY_MISSING"
  | "OMISSION_RESULT_ATTRIBUTION_MISSING";

const LEGAL_ANSWER_RULES = `
# 法律概念分類與適用範圍

回答法律問題前，必須先確認上位概念及其子類型。
不得將只適用於特定子類型的要件，寫成整個上位概念的共同要件。

例如：
- 不作為犯應先區分「純正不作為犯」與「不純正不作為犯」。
- 保證人地位、作為義務、客觀防止可能性、作為等價性及結果歸責，主要是不純正不作為犯的審查事項。
- 不得將上述要件概括寫成所有不作為犯的成立要件。
- 題目只寫「不作為犯」而未明確分類時，應先說明兩種類型的差異，再判斷題目實際所指類型。

遇到不純正不作為犯，依序審查：
1. 是否存在依法應防止的構成要件結果。
2. 行為人是否具有法律上的防止義務，即保證人地位。
3. 行為人在當時是否客觀上有能力採取防止措施。
4. 行為人是否能防止而不防止。
5. 假設履行義務，結果是否能以接近確定的程度避免。
6. 該不作為是否在法規範上與積極作為具有等價性。
7. 結果是否可歸責於該不作為。
8. 是否具備該罪所要求的故意或過失。
9. 是否仍須審查違法性及罪責。

不得只列「保證人地位＋作為等價性」就認定成立。
不得省略客觀防止可能性、結果避免可能性、不作為與結果間的歸責、故意或過失。

回答「不作為犯」時，「簡短結論」應表達：
若題目所指的是不純正不作為犯，不能只因行為人未採取行動就成立。還須確認其具有防止結果的法律義務、當時能採取有效措施卻未採取、履行義務足以避免結果，而且該不作為與積極作為具有規範上的等價性，結果亦可歸責於該不作為。若是純正不作為犯，則應依個別法條規定判斷，不宜直接套用上述全部要件。
`.trim();

function cleanText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\uFFFD/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const OUT_OF_SCOPE_MESSAGE =
  "這個問題不屬於目前的法律、會計與考試學習範圍。你可以改問法律爭點、考題解析、會計計算、法條、教材或課程內容。";

function isClearlyOutOfLearningScope(question: string) {
  const normalized = question.toLowerCase().replace(/\s+/g, "");
  const learningTerms = [
    "法律", "刑法", "民法", "公法", "憲法", "行政法", "訴訟", "法條", "判決",
    "爭點", "學說", "考題", "考點", "解題", "申論", "選擇題", "會計", "財報",
    "分錄", "折舊", "利息", "資產", "負債", "ifrs", "ias", "教材", "課程",
  ];
  if (learningTerms.some((term) => normalized.includes(term))) return false;
  const casualTerms = [
    "唱歌", "好聽", "明星", "藝人", "演員", "歌手", "電影好看", "追星",
    "星座", "八卦", "遊戲好玩", "誰比較帥", "誰比較美", "午餐吃什麼",
    "晚餐吃什麼", "今天天氣", "陪我聊天", "講笑話",
    "張學友", "劉德華", "周杰倫", "林俊傑", "蔡依林",
  ];
  if (casualTerms.some((term) => normalized.includes(term))) return true;

  return /^(?:你)?(?:知道|認識|喜歡|覺得).{1,24}(?:嗎|呢)[？?]?$/.test(normalized);
}

function extractText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  if (!Array.isArray(record.output)) return "";
  return record.output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as Record<string, unknown>).content;
      return Array.isArray(content) ? content : [];
    })
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const text = (item as Record<string, unknown>).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function isIncomplete(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  return record.status === "incomplete";
}

type ExplanationCacheRecord = {
  cacheKey: string;
  questionId: string;
  contentVersion: string;
};

async function explanationCacheKey(record: Omit<ExplanationCacheRecord, "cacheKey">, question: string, standardAnswer: string, model: string) {
  const material = [
    "ibrain-ai-explanation",
    record.questionId,
    record.contentVersion,
    standardAnswer,
    model,
    question,
  ].join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readExplanationCache(cache: ExplanationCacheRecord) {
  const database = globalThis.__IBRAIN_D1__;
  if (!database) return null;
  try {
    return await database.prepare(
      "SELECT answer, model, generated_at FROM ai_explanation_cache WHERE cache_key = ?1 LIMIT 1",
    ).bind(cache.cacheKey).first<{ answer: string; model: string; generated_at: string }>();
  } catch {
    // A temporary cache issue must never block the student's explanation.
    return null;
  }
}

async function writeExplanationCache(cache: ExplanationCacheRecord, answer: string, model: string) {
  const database = globalThis.__IBRAIN_D1__;
  if (!database) return;
  try {
    await database.prepare(
      `INSERT INTO ai_explanation_cache (cache_key, question_id, content_version, answer, model)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(cache_key) DO NOTHING`,
    ).bind(cache.cacheKey, cache.questionId, cache.contentVersion, answer, model).run();
  } catch {
    // The generated explanation is still safe to return if persistence is unavailable.
  }
}

async function requestAnswer(
  apiKey: string,
  model: string,
  instructions: string,
  input: string,
  maxOutputTokens: number,
) {
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      max_output_tokens: maxOutputTokens,
    }),
  });
}

function inspectLegalAnswer(question: string, answer: string): LegalWarningCode[] {
  const warnings: LegalWarningCode[] = [];
  const omissionIssue = /不作為犯|不純正不作為|純正不作為/.test(`${question}\n${answer}`);
  if (!omissionIssue) return warnings;

  const distinguishesSubtypes = /純正不作為犯/.test(answer) && /不純正不作為犯/.test(answer);
  if (/不作為犯/.test(question) && !distinguishesSubtypes) {
    warnings.push("LEGAL_SUBTYPE_NOT_DISTINGUISHED");
  }

  const overgeneralized =
    /(?:所有|一切)?不作為犯.{0,24}(?:成立要件|必須|均須|都要)/s.test(answer) &&
    !distinguishesSubtypes;
  if (overgeneralized) warnings.push("SUBTYPE_RULE_OVERGENERALIZED");

  const discussesImproperOmission = /不純正不作為犯/.test(question) || /不純正不作為犯/.test(answer);
  if (
    discussesImproperOmission &&
    !/(?:客觀|實際).{0,12}(?:能力|可能).{0,12}(?:防止|採取)|能採取.{0,8}(?:措施|行動)/s.test(answer)
  ) {
    warnings.push("OMISSION_PREVENTION_ABILITY_MISSING");
  }
  if (discussesImproperOmission && !/(?:結果|死亡|損害).{0,16}歸責|歸責.{0,16}(?:結果|不作為)/s.test(answer)) {
    warnings.push("OMISSION_RESULT_ATTRIBUTION_MISSING");
  }
  return warnings;
}

export async function POST(request: NextRequest) {
  let body: AskRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "提問格式不正確。" }, { status: 400 });
  }

  const routedQuestion = body.question ? cleanText(body.question).slice(0, 500) : "";
  if (!body.essayCoach && !body.essayReview && isClearlyOutOfLearningScope(routedQuestion)) {
    return NextResponse.json({
      answer: OUT_OF_SCOPE_MESSAGE,
      provider: "scope-router",
      out_of_scope: true,
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "目前無法產生回答，請稍後再試。" }, { status: 503 });
  }

  if (body.essayCoach) {
    const examQuestion = cleanText(body.essayCoach.examQuestion ?? "").slice(0, 6000);
    const studentAnswer = cleanText(body.essayCoach.studentAnswer ?? "").slice(0, 9000);
    const conversation = (body.essayCoach.conversation ?? []).slice(-5)
      .map((turn) => `助教追問：${cleanText(turn.question ?? "").slice(0, 500)}\n學生回答：${cleanText(turn.answer ?? "").slice(0, 1200)}`)
      .join("\n\n");
    if (!examQuestion || !studentAnswer) {
      return NextResponse.json({ error: "題目或學生答案不足，無法進行申論分析。" }, { status: 400 });
    }
    const essayInstructions = `
你是中華民國司法官、律師考試的申論陪練助教。你必須真正閱讀學生全文，不得使用固定回覆，不得假稱學生寫到未出現在答案中的內容。

任務：
1. 用一句話具體指出學生這一輪已處理的內容；若答案只是「不知道」、求助語或沒有法律判斷，要如實說明尚未開始，不得假裝看見爭點。
2. 只選一個「學生尚未處理、處理錯誤或理由不足」且最值得優先追問的點。
3. 追問必須緊扣學生原文；如果學生已完整處理某爭點，不得重複追問。
4. 「先前陪練對話」中的問題都視為已問過。學生只要已經回答，就必須先判斷該回答，再推進到下一個不同的爭點或更深一層的涵攝；next_question 不得與任何先前追問相同或只是換句話重問。
5. acknowledgment 只說明學生「剛才回答得如何」或目前已完成到哪裡，不得在 acknowledgment 裡再次提出 next_question。
6. 提供兩層漸進提示。第一層只指方向；第二層再縮小範圍，但不要直接給完整擬答。
7. 不得揭露內部推理過程，不得虛構法條、判決或學生文字。

只輸出合法 JSON，不要 Markdown，不要額外說明：
{"acknowledgment":"繁體中文，40至100字","next_question":"繁體中文，一個明確問題","hints":["第一層提示","第二層提示"],"complete":false}
如果學生已就甲、乙、丙、丁的主要行為、犯罪階段與重要爭點完整處理，將 complete 設為 true，next_question 改為最需要精修的涵攝或結論，不要再說漏寫。
`.trim();
    const essayInput = `申論題：\n${examQuestion}\n\n學生目前全文：\n${studentAnswer}${conversation ? `\n\n先前陪練對話：\n${conversation}` : ""}`;
    const model = process.env.OPENAI_MODEL || "gpt-5-mini";
    const response = await requestAnswer(apiKey, model, essayInstructions, essayInput, 1800);
    if (!response.ok) {
      return NextResponse.json({ error: "AI 暫時無法讀取這份作答，請稍後再試。" }, { status: 502 });
    }
    const payload = await response.json();
    const requestId =
      payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).id === "string"
        ? String((payload as Record<string, unknown>).id)
        : `local-${crypto.randomUUID()}`;
    const raw = cleanText(extractText(payload)).replace(/^```json\s*|\s*```$/g, "");
    try {
      const analysis = JSON.parse(raw) as {
        acknowledgment?: string;
        next_question?: string;
        hints?: string[];
        complete?: boolean;
      };
      if (!analysis.acknowledgment || !analysis.next_question || !Array.isArray(analysis.hints) || analysis.hints.length < 2) {
        throw new Error("invalid analysis");
      }
      return NextResponse.json({
        essay_analysis: {
          acknowledgment: cleanText(analysis.acknowledgment).slice(0, 300),
          nextQuestion: cleanText(analysis.next_question).slice(0, 400),
          hints: analysis.hints.slice(0, 2).map((hint) => cleanText(hint).slice(0, 350)),
          complete: analysis.complete === true,
        },
        provider: "cloud",
        trace: {
          generatedAt: new Date().toISOString(),
          model,
          requestId,
        },
      });
    } catch {
      return NextResponse.json({ error: "AI 回覆格式異常，未顯示任何推測性分析，請再試一次。" }, { status: 502 });
    }
  }

  if (body.essayReview) {
    const examQuestion = cleanText(body.essayReview.examQuestion ?? "").slice(0, 7000);
    const studentAnswer = cleanText(body.essayReview.studentAnswer ?? "").slice(0, 12000);
    const teacherAnswer = cleanText(body.essayReview.teacherAnswer ?? "").slice(0, 16000);
    const scoringIssues = (body.essayReview.scoringIssues ?? []).slice(0, 12)
      .map((issue) => cleanText(issue).slice(0, 160));
    const course = body.essayReview.course;
    if (!examQuestion || !studentAnswer || !teacherAnswer) {
      return NextResponse.json({ error: "題目、學生答案或老師擬答不足，無法進行對照。" }, { status: 400 });
    }
    const reviewInstructions = `
你是中華民國司法官、律師第二試的申論批改助教。你必須逐字比對學生答案與提供的老師擬答，不能把老師未寫的見解冒充老師立場，也不能假稱學生寫過不存在的文字。

評分要求：
1. 總分為 100 分，dimensions 固定四項：爭點辨識 25、法律規範 25、涵攝論證 35、結論與結構 15。各項分數不得超過上限，總分必須等於四項加總。
2. issueComparison 應涵蓋提供的核心爭點，不是關鍵字比對，而是判斷學生是否完成「規範提出、爭議定位、事實涵攝、結論」。
3. studentQuote 必須逐字摘錄學生答案中最能代表該爭點的一至三句，不能改寫；quoteLocation 標示「第幾段／開頭、中段或結尾」。完全沒寫時，studentQuote 填「未見相關論述」，並指出最接近但仍不足的段落。
4. aiReading 說明從這段原句能合理推知學生已完成什麼、不能推知什麼。不得只寫「有提到」。
5. comparisonBasis 必須交代判斷依據：老師擬答要求的法律要件、爭議分流或涵攝層次，以及學生原句與該要求的具體落差。
6. teacherAnchor 只摘要提供的老師擬答，應具體到該段的規範、見解分流或結論，不補入其他答案。
7. missingLayer 應指出缺的是「法條／定義／學說分歧／實務見解／事實涵攝／競合／結論」哪一層及其影響。
8. nextMove 要給可執行的補寫順序，不能只寫「加強論述」。
9. studentStatus 僅能是「已掌握」「有提到但不足」「未寫到」「判斷有誤」。
10. rewriteExample 挑一個最值得修改的爭點，寫成 300 至 600 字的教學示範，必須用換行清楚排成「一、爭點」「二、規範與見解」「三、本案涵攝」「四、結論」。不要重寫整份答案。
11. courseReason 必須依本次具體失分推薦；不得只寫一般廣告話術。
12. 不揭露內部隱藏推理過程；只呈現可供學生核對的判斷依據。不得虛構法條、判決、分數依據、老師文字或學生文字。

只輸出合法 JSON：
{"overallScore":0,"scoreSummary":"繁體中文","dimensions":[{"name":"爭點辨識","score":0,"max":25,"reason":"具體依據"},{"name":"法律規範","score":0,"max":25,"reason":"具體依據"},{"name":"涵攝論證","score":0,"max":35,"reason":"具體依據"},{"name":"結論與結構","score":0,"max":15,"reason":"具體依據"}],"issueComparison":[{"issue":"爭點","studentStatus":"未寫到","studentQuote":"學生逐字原句或未見相關論述","quoteLocation":"第幾段／位置","aiReading":"從原句能與不能推知的內容","comparisonBasis":"依老師擬答之具體判斷標準","teacherAnchor":"老師擬答的規範、見解與結論錨點","missingLayer":"缺漏層次及影響","nextMove":"具體補寫順序"}],"rewriteExample":"含四個標題與換行的300至600字示範","courseReason":"依失分推薦原因"}
`.trim();
    const reviewInput = `考題：
${examQuestion}

核心爭點：
${scoringIssues.join("、")}

學生答案：
${studentAnswer}

老師擬答：
${teacherAnswer}

可推薦課程：
${cleanText(course?.title ?? "")}｜${cleanText(course?.teacher ?? "")}｜${cleanText(course?.format ?? "")}
課程定位：${cleanText(course?.reason ?? "")}`;
    const model = process.env.OPENAI_REVIEW_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";
    let response: Response;
    try {
      response = await requestAnswer(apiKey, model, reviewInstructions, reviewInput, 4200);
    } catch {
      return NextResponse.json({ error: "AI 批改服務目前連線不穩定，請稍後再試；你的作答內容仍保留。" }, { status: 503 });
    }
    if (!response.ok) {
      return NextResponse.json({ error: "AI 暫時無法完成老師擬答對照，請稍後再試。" }, { status: 502 });
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return NextResponse.json({ error: "AI 批改服務回傳格式異常，請稍後再試；你的作答內容仍保留。" }, { status: 502 });
    }
    const requestId =
      payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).id === "string"
        ? String((payload as Record<string, unknown>).id)
        : `local-${crypto.randomUUID()}`;
    const raw = cleanText(extractText(payload)).replace(/^```json\s*|\s*```$/g, "");
    try {
      const comparison = JSON.parse(raw) as Record<string, unknown>;
      const dimensions = Array.isArray(comparison.dimensions) ? comparison.dimensions : [];
      const issueComparison = Array.isArray(comparison.issueComparison) ? comparison.issueComparison : [];
      if (dimensions.length !== 4 || issueComparison.length < 1 || typeof comparison.overallScore !== "number") {
        throw new Error("invalid comparison");
      }
      return NextResponse.json({
        essay_comparison: comparison,
        provider: "cloud",
        trace: { generatedAt: new Date().toISOString(), model, requestId },
      });
    } catch {
      return NextResponse.json({ error: "AI 回覆格式異常，未顯示任何推測性評分，請再試一次。" }, { status: 502 });
    }
  }

  const question = body.question ? cleanText(body.question).slice(0, 500) : "";
  const followUpQuestion = body.followUp?.followUpQuestion
    ? cleanText(body.followUp.followUpQuestion).slice(0, 500)
    : "";
  const sources = Array.isArray(body.evidence) ? body.evidence.slice(0, 6) : [];
  const allowGeneralAi = body.allowGeneralAi === true;
  const isBroadLegalTopic =
    question.length <= 24 &&
    /不作為犯|保證人地位|客觀歸責|因果關係|故意|過失|正當防衛|緊急避難|罪刑法定/.test(question) &&
    !/[？?。；;：:\n]|甲|乙|丙|丁|某|行為人|被害人|本題|案例|下列|何者|是否|為何|怎麼|如何|請問|要件/.test(question);
  const standardAnswer = ["A", "B", "C", "D"].includes(body.standardAnswer ?? "")
    ? body.standardAnswer
    : undefined;
  if (!question || (sources.length === 0 && !allowGeneralAi)) {
    return NextResponse.json({ error: "問題或教材證據不足。" }, { status: 400 });
  }
  const evidenceText = sources
    .map(
      (item, index) =>
        `教材 ${index + 1}：${cleanText(item.title)}｜${cleanText(item.edition)}｜${cleanText(item.chapter)}｜第 ${item.page} 頁\n${cleanText(item.text).slice(0, 800)}`,
    )
    .join("\n\n");

  const baseInstructions = followUpQuestion
    ? "你是 iBrain Pedia X 的智慧學習助教，正在回答同一題的後續追問。必須先直接回答學生這一次問的問題；若是可否題，第一句就回答「可以／不可以／視情況而定」。只補充本次追問所需的最少理由，除非學生明確要求，不得重述原題、不得重貼上一輪完整答案、不得重新從頭解題。使用自然精簡的繁體中文，通常控制在 250 個中文字以內。涉及法律時以中華民國法律為準。"
    : isBroadLegalTopic
    ? "你是 iBrain Pedia X 的智慧學習助教。學生只輸入法律章節或概念名稱，尚未提供具體案例。請使用繁體中文，依序以「基本定位：」「基本判斷架構：」「下一步學習：」三個標題整理。不得使用「本題爭點」「各選項分析」，不得假設不存在的案件事實，也不得為填滿內容而虛構學說或實務分歧。明確說明目前只能建立概念架構，尚不能進行個案涵攝。涉及法律時以中華民國法律為準。"
    : allowGeneralAi
    ? "你是 iBrain Pedia X 的智慧學習助教。學生已明確同意在教材找不到答案時，改由一般 AI 知識回答。請使用繁體中文，嚴格依序以「簡短結論：」「本題考點：」「各選項分析：」「易錯提醒：」四個標題作答。考點限列3至5個短句；各選項分行判斷；全文控制在 1100 個中文字以內。涉及法律時，以中華民國法律為準；涉及會計時，應說明所依循的準則體系與適用前提。對不確定或可能變動的內容必須明確提醒查證。不得虛構書名、老師見解、頁碼、法條、判決字號或會計準則，也不要聲稱答案來自教材。若問題指定明確裁判字號而系統未提供該裁判原文或摘要，禁止用基本權、比例原則、法律保留等泛用清單冒充該案考點；應只說明目前缺少可核對的官方裁判資料，不得繼續生成推測內容。"
    : "你是 iBrain Pedia X 的智慧學習助教。只能依據提供的教材證據作答，不得補造法條、判決、頁碼、來源或會計準則。使用自然、完整的繁體中文，固定以「簡短結論：」開頭，再以「說明理由：」整理要點；全文控制在 1100 個中文字以內，寧可精簡，不得在句子中途停止。不要強調自己是 AI，也不要在答案內加入來源編號。教材若有明顯亂碼、異常符號或句尾截斷，可依同一段上下文修復成通順語句；若無法可靠判斷原意，就省略殘缺部分並說明證據不足，不得自行創造內容。回答最後必須以完整句子結束。";
  const instructions = `${baseInstructions}\n\n${LEGAL_ANSWER_RULES}\n\n送出答案前，必須自行逐項檢查上述分類與不純正不作為犯要件；發現遺漏時先修正答案，不要把檢查過程或警示代碼寫給學生。`;
  const recentConversation = (body.followUp?.conversation ?? []).slice(-3)
    .map((turn) => `學生：${cleanText(turn.question ?? "").slice(0, 240)}\n助教：${cleanText(turn.answer ?? "").slice(0, 420)}`)
    .join("\n\n");
  const input = followUpQuestion
    ? [
        `原始題目：${cleanText(body.followUp?.originalQuestion ?? question).slice(0, 700)}`,
        `上一輪解答摘要背景：${cleanText(body.followUp?.previousAnswer ?? "").slice(0, 900)}`,
        recentConversation ? `最近對話：\n${recentConversation}` : "",
        `這一次追問：${followUpQuestion}`,
        "只回答「這一次追問」，不要重複上一輪答案。",
        !allowGeneralAi && evidenceText ? `必要教材證據：\n${evidenceText}` : "",
      ].filter(Boolean).join("\n\n")
    : allowGeneralAi
    ? `學生問題：${question}\n\n${standardAnswer ? `題庫標準答案：${standardAnswer}。必須以此答案鍵為結論；你只負責說明理由，不得自行改答案。` : "請注意：目前教材資料庫找不到足夠依據，本題是一般 AI 回答。"}`
    : `學生問題：${question}\n\n教材證據：\n${evidenceText}`;

  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  const cacheRequest = body.explanationCache;
  const cacheBase =
    allowGeneralAi &&
    !followUpQuestion &&
    standardAnswer &&
    cacheRequest?.questionId &&
    cacheRequest?.contentVersion
      ? {
          questionId: cleanText(cacheRequest.questionId).slice(0, 180),
          contentVersion: cleanText(cacheRequest.contentVersion).slice(0, 80),
        }
      : null;
  const explanationCache = cacheBase && cacheBase.questionId && cacheBase.contentVersion
    ? { ...cacheBase, cacheKey: await explanationCacheKey(cacheBase, question, standardAnswer!, model) }
    : null;
  if (explanationCache) {
    const cached = await readExplanationCache(explanationCache);
    if (cached?.answer) {
      return NextResponse.json({
        answer: cached.answer,
        provider: "cache",
        cache: { status: "hit", generatedAt: cached.generated_at, model: cached.model },
        warning_codes: inspectLegalAnswer(question, cached.answer),
      });
    }
  }
  let response = await requestAnswer(apiKey, model, instructions, input, 3600);

  if (!response.ok) {
    return NextResponse.json({ error: "雲端 AI 暫時無法完成回答，請稍後再試。" }, { status: 502 });
  }

  let payload = await response.json();
  if (isIncomplete(payload)) {
    response = await requestAnswer(
      apiKey,
      model,
      `${instructions}\n\n上一次回答未能完整輸出。這次請縮短推導，只保留作答所需的結論、計算式與理由，務必在限制內完成全文。`,
      input,
      5200,
    );
    if (!response.ok) {
      return NextResponse.json({ error: "雲端 AI 暫時無法完成回答，請稍後再試。" }, { status: 502 });
    }
    payload = await response.json();
    if (isIncomplete(payload)) {
      return NextResponse.json(
        { error: "這一題需要較多計算，系統仍在整理。請縮小題目範圍後再試。" },
        { status: 502 },
      );
    }
  }
  const text = cleanText(extractText(payload));
  if (!text) return NextResponse.json({ error: "目前無法產生回答，請稍後再試。" }, { status: 502 });
  if (explanationCache) await writeExplanationCache(explanationCache, text, model);
  const warningCodes = inspectLegalAnswer(question, text);
  return NextResponse.json({
    answer: text,
    provider: "cloud",
    cache: explanationCache ? { status: "miss", generatedAt: new Date().toISOString(), model } : undefined,
    warning_codes: warningCodes,
  });
}
