"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import firstExamQuestionsData from "./data/first-exam-114.json";

function createClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

type Evidence = {
  id: number;
  subject: "法律" | "中級會計";
  lawScope?: "刑法" | "公法";
  title: string;
  sourceId: string;
  type: string;
  edition: string;
  chapter: string;
  page: number;
  tags: string[];
  text: string;
  externalLlmAllowed: boolean;
  purchaseUrl: string;
  courseUrl?: string;
  courseLabel?: string;
};

type RelatedResource = {
  kind: "歷屆考題" | "判解" | "法條" | "期刊" | "微課";
  title: string;
  meta: string;
  reason: string;
  url: string;
  level: "高度相關" | "延伸相關";
  verification: "已查證" | "查找方向";
};

type ExternalSearchProvider = {
  kind: "文章" | "影片";
  name: string;
  description: string;
  buildUrl: (query: string) => string;
};

type LearningProduct = {
  audience: string;
  name: string;
  description: string;
  action: string;
  url: string;
  accent: "member" | "ibrain" | "get" | "publish" | "master" | "lawsource";
  featured?: boolean;
};

type TopicBundle = {
  key: string;
  aliases: string[];
  issue: string;
  summary: string;
  resources: RelatedResource[];
};

function EvidenceAction({ item }: { item: Evidence }) {
  if (!item.purchaseUrl) return null;

  const label =
    item.type === "判解"
      ? "查看官方判決全文"
      : ["教科書", "題庫", "解題書", "申論題"].includes(item.type)
        ? "購買書籍"
        : "查看來源";

  return <a href={item.purchaseUrl} target="_blank" rel="noreferrer">{label} ↗</a>;
}

type LearningSummary = {
  aliases: string[];
  headline: string;
  thirtySeconds: string;
  steps: string[];
  pitfall: string;
};

type PracticeQuestion = {
  aliases: string[];
  sourceLabel: "教材改編題" | "高點歷屆真題";
  topic: string;
  prompt: string;
  options: string[];
  answer: number;
  explanations: string[];
  sourceMeta?: string;
  sourceUrl?: string;
  reviewStatus?: "ready_for_review" | "needs_review";
};

type IssueSpottingQuestion = {
  domain: "公法" | "民法" | "刑法" | "民事訴訟法" | "刑事訴訟法" | "商法";
  topic: string;
  prompt: string;
  options: string[];
  answer: number;
  keyFact: string;
  explanation: string;
  sourceLabel?: string;
  sourceUrl?: string;
  sourcePage?: number | null;
  originalNumber?: number;
  reviewLabel?: string;
  guidedSteps?: GuidedIssueStep[];
  demonstration?: string;
};

type GuidedIssueOutcome = {
  applicationOptions: [string, string, string, string];
  applicationAnswer: number;
  conclusionQuestion: string;
  conclusionOptions: [string, string, string, string];
  conclusionAnswer: number;
  demonstration: string;
};

type GuidedIssueStep = {
  id: "issue" | "rule" | "fact" | "application" | "conclusion";
  label: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

type GuidedAttemptRecord = {
  id?: number;
  attemptId: string;
  questionKey: string;
  domain: IssueSpottingQuestion["domain"];
  topic: string;
  stepId: GuidedIssueStep["id"];
  stepLabel: string;
  selectedOption: number;
  correctOption: number;
  correct: boolean;
  answeredAt: string;
};

type OfficialQuestion = {
  source_url: string;
  source_page: number | null;
  year: number;
  exam_group: string;
  subject_group: string;
  number: number;
  stem: string;
  options: Record<"A" | "B" | "C" | "D", string>;
  correct_answer: "A" | "B" | "C" | "D" | null;
  review_status: "ready_for_review" | "needs_review";
  warnings: string[];
};

type ExamAttempt = {
  questionId: string;
  correct: boolean;
  answeredAt: string;
};

type WeaknessProfile = {
  key: string;
  subject: string;
  chapter: string;
  concept: string;
  attempts: number;
  wrong: number;
  correct: number;
  status: "待觀察" | "可能弱點" | "核心弱點" | "改善中";
  confidence: "資料不足" | "中度可信" | "高度可信";
};

type IssueIndexItem = {
  key: string;
  subject: string;
  chapter: string;
  concept: string;
  questionCount: number;
  aliases: string[];
};

type OfficialStatuteArticle = {
  name: string;
  article: number;
  text: string;
  sourceUrl: string;
};

type EssayDemoQuestion = {
  id: string;
  domain: "法律" | "中級會計";
  lawScope?: "刑法" | "公法";
  title: string;
  prompt: string;
  sourceLabel: string;
  sourceNote: string;
  resourceNote?: string;
  officialAnswer?: "A" | "B" | "C" | "D";
};

type FollowUpContext = {
  originalQuestion: string;
  previousAnswer: string;
  conversation: Array<{ question: string; answer: string }>;
  followUpQuestion: string;
};

function needsQuestionScopeClarification(question: string) {
  const normalized = question.trim().toLowerCase();
  const isMetaQuestion = /(?:可以|可不可以|能不能|能否|適合).{0,8}(?:問|詢問)|(?:問題|事情).{0,8}(?:可以|能不能).{0,6}問/.test(normalized);
  const isBroadProfessionalArea = /醫護|醫療|健康|症狀|看病|就醫|心理|理財|投資|稅務|保險/.test(normalized);
  const hasConcreteLearningIssue =
    /第\s*\d+\s*條|法條|判決|責任|侵權|契約|犯罪|構成要件|會計|分錄|成本|存貨|折舊|利息|考題|選項|申論/.test(normalized);
  return isMetaQuestion && isBroadProfessionalArea && !hasConcreteLearningIssue;
}

function isBroadLegalTopicQuery(question: string) {
  const normalized = question.trim().toLowerCase();
  return (
    normalized.length > 0 &&
    normalized.length <= 24 &&
    !/[？?。；;：:\n]/.test(normalized) &&
    !/甲|乙|丙|丁|某|行為人|被害人|本題|案例|下列|何者|是否|為何|怎麼|如何|請問|要件|法條|判決|學說|實務/.test(normalized)
  );
}

function predictFollowUpQuestions({
  question,
  answer,
  subject,
  previousQuestions,
}: {
  question: string;
  answer: string;
  subject: "法律" | "中級會計";
  previousQuestions: string[];
}) {
  const normalizedQuestion = question.trim().toLowerCase();
  const content = `${question}\n${answer}`.toLowerCase();
  const used = new Set(previousQuestions.map((item) => item.trim()));
  const candidates: string[] = [];
  const add = (...items: string[]) => {
    items.forEach((item) => {
      if (!used.has(item) && !candidates.includes(item)) candidates.push(item);
    });
  };

  if (needsQuestionScopeClarification(question)) {
    add(
      "你可以回答哪些醫護相關問題？",
      "如果是醫療糾紛或法律責任，我要怎麼問？",
      "醫療知識、就醫建議與醫療法律問題有什麼差別？",
    );
    return candidates.slice(0, 3);
  }

  const answerChoice =
    answer.match(/(?:答案|正確選項|應選)\s*(?:為|是|：|:)?\s*([A-D])/i)?.[1]?.toUpperCase();
  const hasCalculation = /計算|金額|成本|價格|利率|現值|折舊|損益|分錄|借方|貸方|％|%|\$|元|加總|除以|乘以/.test(content);
  const isWeightedAverageAccounting = /加權平均|移動平均|平均單位成本|平均成本|期末存貨/.test(content);
  const hasComparison = /差異|區別|比較|相同|不同|容易混淆|vs\.?|與.+之間/.test(content);
  const hasRule = /法條|要件|構成要件|法律效果|判決|實務|學說|見解/.test(normalizedQuestion);
  const asksWhereWrong = /哪裡錯|哪一步錯|想法.*錯|錯在哪|為什麼錯|不知.*錯/.test(content);
  const isBroadLegalTopic = subject === "法律" && isBroadLegalTopicQuery(question);
  const isSubmittedEssay =
    subject === "法律" &&
    /我的答案|我的作答|我這樣寫|以下作答|申論答案|幫我批改|請批改|漏寫|得分/.test(normalizedQuestion);
  const asksSpecificElement =
    subject === "法律" &&
    /保證人地位|作為義務|作為可能性|結果避免可能性|等價性|防止可能性|因果關係|主觀要件/.test(normalizedQuestion) &&
    !/甲|乙|丙|丁|某|行為人|被害人|案例|下列|何者/.test(normalizedQuestion);

  if (asksWhereWrong) {
    add(
      subject === "法律" ? "可以直接指出我第一個判斷錯誤嗎？" : "可以直接指出我第一個算錯的步驟嗎？",
      subject === "法律" ? "我的原判斷要怎麼修正？" : "我的原算法要怎麼改才會正確？",
    );
  }
  if (answerChoice) add(`為什麼答案是 ${answerChoice}？`, "其他選項分別錯在哪裡？");

  if (isSubmittedEssay) {
    add(
      "我的答案漏掉了哪些爭點？",
      "哪一段涵攝最需要補強？",
      "請示範如何在保留原意下改寫這份答案",
    );
    return candidates.slice(0, 3);
  } else if (isBroadLegalTopic) {
    const topic = question.trim();
    add(
      `整理「${topic}」的基本判斷架構`,
      `「${topic}」最容易混淆的子概念是什麼？`,
      `練習一題「${topic}」的案例題`,
      `找「${topic}」相關考古題`,
      `查看公司內部的「${topic}」教材與課程`,
    );
    return candidates.slice(0, 5);
  } else if (asksSpecificElement) {
    add(
      "這個要件的判斷標準是什麼？",
      "有哪些常見類型或來源？",
      "它最容易和哪個概念混淆？",
    );
    return candidates.slice(0, 3);
  } else if (subject === "法律") {
    add(
      hasRule ? "本題要先檢查哪些法律要件？" : "本題真正的法律爭點是什麼？",
      "本題是否真的有學說或實務分歧？",
      "這個爭點要怎麼寫進申論答案？",
    );
  } else if (isWeightedAverageAccounting) {
    add(
      "定期加權平均與移動加權平均差在哪裡？",
      "平均單位成本要怎麼一步步計算？",
      "期末存貨與銷貨成本要如何驗算？",
    );
  } else if (hasCalculation) {
    add(
      "這個金額是怎麼一步步算出來的？",
      "可以把計算過程整理成表格嗎？",
      "哪個數字最容易用錯？",
    );
  } else {
    add("本題真正的考點是什麼？", "哪個選項最容易誤選？", "可以用更簡單的方式說明嗎？");
  }

  if (hasComparison) add("可以把兩個概念整理成比較表嗎？");
  add("如果題目改一個條件，答案會怎麼變？", "請出一題同考點的類似題");

  return candidates.slice(0, 3);
}

type EssayCoachAnalysis = {
  acknowledgment: string;
  nextQuestion: string;
  hints: string[];
  complete: boolean;
};

type EssayCoachTrace = {
  generatedAt: string;
  model: string;
  requestId: string;
};

type EssayComparison = {
  overallScore: number;
  scoreSummary: string;
  dimensions: Array<{ name: string; score: number; max: number; reason: string }>;
  issueComparison: Array<{
    issue: string;
    studentStatus: "已掌握" | "有提到但不足" | "未寫到" | "判斷有誤";
    studentQuote: string;
    quoteLocation: string;
    aiReading: string;
    comparisonBasis: string;
    teacherAnchor: string;
    missingLayer: string;
    nextMove: string;
  }>;
  rewriteExample: string;
  courseReason: string;
};

type CatalogItem = {
  kind: "課程" | "書籍" | "考情" | "期刊";
  title: string;
  creator: string;
  meta: string;
  aliases: string[];
  url: string;
  previewText?: string;
  previewLocation?: string;
};

const verifiedCatalog: CatalogItem[] = [
  {
    kind: "課程",
    title: "刑法（概要）",
    creator: "榮律（張鏡榮）",
    meta: "iBrain 知識達｜線上試聽",
    aliases: ["刑法", "刑法概要", "張鏡榮", "榮律", "公務員", "正當防衛"],
    url: "https://www.ibrain.com.tw/Audition/ListDetail.aspx?1=1&iC=2065&iM=40498&iS=65230",
  },
  {
    kind: "課程",
    title: "刑法申論寫作",
    creator: "榮律（張鏡榮）",
    meta: "iBrain 知識達｜申論課程",
    aliases: ["刑法", "申論", "寫作", "張鏡榮", "榮律"],
    url: "https://www.ibrain.com.tw/Audition/ListDetail.aspx?iC=3351&iS=51759",
  },
  {
    kind: "課程",
    title: "刑法總則題庫班",
    creator: "榮律（張鏡榮）",
    meta: "iBrain 知識達｜題庫班",
    aliases: ["刑法", "刑法總則", "題庫", "張鏡榮", "榮律"],
    url: "https://www.ibrain.com.tw/Audition/ListDetail.aspx?iC=2044&iS=44941",
  },
  {
    kind: "書籍",
    title: "透明的刑法－總則編",
    creator: "張鏡榮律師",
    meta: "高點文化｜商品頁",
    aliases: ["刑法", "刑法總則", "透明的刑法", "張鏡榮", "罪刑法定原則", "禁止類推適用", "禁止習慣法", "禁止溯及既往", "明確性原則", "客觀歸責", "不作為犯"],
    url: "https://publish.get.com.tw/book.asp?BKID=20266",
    previewText: "罪刑法定原則要求無法律明文不得定罪、不得處罰；整理時應一併掌握禁止溯及既往、禁止習慣法、禁止類推適用與明確性原則。",
    previewLocation: "刑法基本原則・罪刑法定原則",
  },
  {
    kind: "書籍",
    title: "透明的刑法－分則編",
    creator: "張鏡榮律師",
    meta: "高點文化｜商品頁",
    aliases: ["刑法", "刑法分則", "透明的刑法", "張鏡榮", "財產罪", "殺人罪"],
    url: "https://publish.get.com.tw/Book.asp?BKID=19869",
  },
  {
    kind: "書籍",
    title: "透明的刑法解題書",
    creator: "張鏡榮律師",
    meta: "高點文化｜商品頁",
    aliases: ["刑法", "解題書", "透明的刑法", "張鏡榮", "申論", "正當防衛", "未遂"],
    url: "https://publish.get.com.tw/book.asp?BKID=20279",
    previewText: "作答時不能只列出原則名稱，還要交代各原則的保障功能，並以具體例子說明其適用界線。",
    previewLocation: "題型 1.1・罪刑法定原則",
  },
  {
    kind: "考情",
    title: "律師、司法官與司法特考歷年考題解答",
    creator: "高點法律網",
    meta: "正式考題與解答入口",
    aliases: ["律師", "司法官", "司法特考", "考古題", "考題", "刑法"],
    url: "https://lawyer.get.com.tw/answer/",
  },
  {
    kind: "期刊",
    title: "誹謗罪真實抗辯要件與合理查證原則的操作",
    creator: "張鏡榮",
    meta: "元照法學資料庫｜摘要頁",
    aliases: ["誹謗罪", "真實抗辯", "合理查證", "112年憲判字第8號", "張鏡榮"],
    url: "https://lawdata.com.tw/tw/detail.aspx?no=908868",
  },
  {
    kind: "期刊",
    title: "罪刑法定原則與阻卻違法事由",
    creator: "元照出版",
    meta: "月旦知識庫｜文章摘要與書目資料",
    aliases: ["刑法", "刑法總則", "罪刑法定原則", "禁止類推適用", "類推適用", "阻卻違法事由"],
    url: "https://lawdata.com.tw/tw/doi/?doi=10.3966%2F24154725201812011001",
  },
  {
    kind: "期刊",
    title: "刑法從屬性要素的明確性判斷",
    creator: "陳俊偉",
    meta: "裁判時報第 156 期｜元照摘要頁",
    aliases: ["刑法", "刑法總則", "罪刑法定原則", "明確性原則", "刑罰明確性", "空白刑法"],
    url: "https://lawdata.com.tw/tw/doi/?doi=10.53106%2F20779836202506156006",
  },
  {
    kind: "期刊",
    title: "罪刑法定原則的構成要件保障功能（上）",
    creator: "許玉秀",
    meta: "月旦法學雜誌｜元照摘要頁",
    aliases: ["刑法", "刑法總則", "罪刑法定原則", "禁止溯及既往", "明確性原則", "行為時法"],
    url: "https://lawdata.com.tw/tw/detail.aspx?no=3862",
  },
];

type SolutionBookExercise = {
  id: string;
  bookId: string;
  chapter: string;
  type: "choice" | "essay";
  source: string;
  page: string;
  topic: string;
  stem: string;
  options?: Record<"A" | "B" | "C" | "D", string>;
  answer?: "A" | "B" | "C" | "D";
  standardAnswer?: string;
  explanation?: string[];
  previewTitle?: string;
  previewPoints?: string[];
  lockedDetails?: string[];
};

type IssueSpottingSet = {
  sourceNote: string;
  correctIds: string[];
  choices: Array<{ id: string; label: string; correct: boolean }>;
};

type SolutionWritingStep = {
  id: "issue" | "rule" | "application" | "conclusion";
  label: string;
  prompt: string;
  hint: string;
  example: string;
};

type SolutionWritingGuide = {
  sourceNote: string;
  steps: SolutionWritingStep[];
};

type SolutionWritingChoiceSet = Record<
  "rule" | "application" | "conclusion",
  string[]
>;

// Each correct choice below is anchored to the corresponding teacher-authored
// "爭點解析" excerpt already imported from 《透明的刑法解題書》.  Wrong
// choices are deliberately labelled editorial distractors; they are never
// presented as teacher-authored content.
const solutionIssueSpotting: Record<string, IssueSpottingSet> = {
  "rong-law-1": {
    sourceNote: "依《透明的刑法解題書》題型 1.1 的爭點解析整理",
    correctIds: ["core", "derivatives"],
    choices: [
      { id: "core", label: "罪刑法定的基本內涵", correct: true },
      { id: "derivatives", label: "衍生原則及其具體案例", correct: true },
      { id: "official", label: "里長是否為刑法上公務員", correct: false },
      { id: "attempt", label: "竊盜未遂的著手時點", correct: false },
    ],
  },
  "rong-law-2": {
    sourceNote: "依《透明的刑法解題書》題型 1.2 的爭點解析整理",
    correctIds: ["definition", "entrusted-work", "role-limit"],
    choices: [
      { id: "definition", label: "刑法上公務員的判斷", correct: true },
      { id: "entrusted-work", label: "受囑託督導社會勞動是否屬公務", correct: true },
      { id: "role-limit", label: "不能只因身分是里長就直接肯定", correct: true },
      { id: "forgery", label: "偽造文書罪是否當然成立", correct: false },
    ],
  },
  "rong-law-3": {
    sourceNote: "依《透明的刑法解題書》題型 2.1 的爭點解析整理",
    correctIds: ["attempted-theft", "remote-attempt", "theories"],
    choices: [
      { id: "attempted-theft", label: "竊盜未遂是否已著手", correct: true },
      { id: "remote-attempt", label: "隔離犯的著手判斷", correct: true },
      { id: "theories", label: "整體理論與個別理論的涵攝", correct: true },
      { id: "self-defense", label: "追回贓物時的正當防衛", correct: false },
    ],
  },
  "rong-law-4": {
    sourceNote: "依《透明的刑法解題書》題型 3.2 的爭點解析整理",
    correctIds: ["ongoing", "defense", "intent"],
    choices: [
      { id: "ongoing", label: "竊盜既遂後，侵害是否仍在現在進行", correct: true },
      { id: "defense", label: "撲倒與擊打行為的正當防衛判斷", correct: true },
      { id: "intent", label: "取回皮夾時是否具有不法所有意圖", correct: true },
      { id: "attempt", label: "隔離犯的著手判斷", correct: false },
    ],
  },
  "rong-law-5": {
    sourceNote: "依《透明的刑法解題書》題型 8.2 的爭點解析整理",
    correctIds: ["self-rescue", "omission", "result"],
    choices: [
      { id: "self-rescue", label: "B 是否屬無自救力之人", correct: true },
      { id: "omission", label: "阻止救助屬作為或不作為，以及保證人地位", correct: true },
      { id: "result", label: "遲延救治與重傷結果的因果關係", correct: true },
      { id: "bribery", label: "工作機會是否為投票行賄的不正利益", correct: false },
    ],
  },
};

// These are writing prompts, not reconstructed model answers.  Each prompt is
// limited to the issue-analysis points already indexed from the teacher's
// solution-book excerpt for the same exercise.
const solutionWritingGuides: Record<string, SolutionWritingGuide> = {
  "rong-law-1": {
    sourceNote: "依《透明的刑法解題書》題型 1.1 的爭點解析整理",
    steps: [
      { id: "issue", label: "爭點", prompt: "本題要先界定：罪刑法定原則包含哪些基本內涵與衍生原則？", hint: "不要只列名詞；先把基本內涵與衍生原則分開。", example: "可先用一個標題，統整罪刑法定原則及其衍生要求。" },
      { id: "rule", label: "規範", prompt: "寫出各原則欲避免的風險與判斷界線。", hint: "留意法律明文、溯及、習慣與類推等面向。", example: "先說明原則內容，再連到題目要求的具體案例。" },
      { id: "application", label: "涵攝", prompt: "將題目中的案例，逐一放入相對應的原則檢驗。", hint: "每個案例都要說明為何碰到該原則，不要只貼標籤。", example: "以「本案……，因此涉及……」把事實與規範接起來。" },
      { id: "conclusion", label: "結論", prompt: "分別收束各案例的判斷，不要只寫一個總結。", hint: "結論應對應前面的每一個檢驗。", example: "用短句逐一標明各原則是否受到違反。" },
    ],
  },
  "rong-law-2": {
    sourceNote: "依《透明的刑法解題書》題型 1.2 的爭點解析整理",
    steps: [
      { id: "issue", label: "爭點", prompt: "先判斷甲在本案中是否屬刑法上的公務員。", hint: "不要只因甲是里長就直接下結論。", example: "標題可寫成「甲是否為刑法上公務員」。" },
      { id: "rule", label: "規範", prompt: "整理刑法上公務員的判斷，並說明受囑託執行的工作如何評價。", hint: "區分職務身分與本案實際受託工作的性質。", example: "先列判斷標準，再說明本題要檢視哪一項工作。" },
      { id: "application", label: "涵攝", prompt: "對照甲受囑託督導社會勞動的具體內容，說明是否屬公務。", hint: "把「里長」身分與「受囑託工作」分開分析。", example: "用題幹中實際執行的工作，逐一連回判斷標準。" },
      { id: "conclusion", label: "結論", prompt: "明確說明甲在本案中是否具刑法上公務員身分，以及理由。", hint: "結論要回應本案工作，而非只回應里長的一般身分。", example: "以「就本案受託工作而言……」收束。" },
    ],
  },
  "rong-law-3": {
    sourceNote: "依《透明的刑法解題書》題型 2.1 的爭點解析整理",
    steps: [
      { id: "issue", label: "爭點", prompt: "甲的行為是否已達竊盜未遂的著手？隔離犯的著手又如何判斷？", hint: "先抓著手，再處理整體理論與個別理論。", example: "可先列「竊盜未遂之著手」為主標題。" },
      { id: "rule", label: "規範", prompt: "提出未遂著手的判斷標準，並交代整體理論與個別理論的差異。", hint: "不要只列出理論名稱，須說明各自如何判斷行為階段。", example: "先寫共同基準，再分別說明兩種理論。" },
      { id: "application", label: "涵攝", prompt: "把甲已完成與尚未完成的行為，代入不同理論檢驗。", hint: "特別說明本案行為與竊盜實行行為的距離。", example: "依序寫「若採……，本案……；若採……，本案……」。" },
      { id: "conclusion", label: "結論", prompt: "選定可採立場後，明確判斷是否成立竊盜未遂。", hint: "結論要與前面的理論及事實分析一致。", example: "以「故甲……」收束，不要只停在理論比較。" },
    ],
  },
  "rong-law-4": {
    sourceNote: "依《透明的刑法解題書》題型 3.2 的爭點解析整理",
    steps: [
      { id: "issue", label: "爭點", prompt: "竊盜既遂後的侵害是否仍在進行？撲倒、擊打及取回皮夾如何評價？", hint: "不要把三個行為混成一個結論。", example: "可分成現在不法侵害、正當防衛與不法所有意圖三個小標題。" },
      { id: "rule", label: "規範", prompt: "整理正當防衛的現在不法侵害與防衛行為判斷，並交代不法所有意圖的判準。", hint: "規範段先鋪好，後面才有辦法分別涵攝。", example: "每一項規範後都留一個對應事實的位置。" },
      { id: "application", label: "涵攝", prompt: "依序判斷侵害是否延續、反制行為是否為防衛，以及取回皮夾的主觀目的。", hint: "把行為時間點與目的寫清楚。", example: "一個行為一段，避免以一句話跳過全部判斷。" },
      { id: "conclusion", label: "結論", prompt: "分別寫出各行為的法律效果與理由。", hint: "結論須區分防衛行為與取回財物行為。", example: "以分點方式收束各段，不必重複整段規範。" },
    ],
  },
  "rong-law-5": {
    sourceNote: "依《透明的刑法解題書》題型 8.2 的爭點解析整理",
    steps: [
      { id: "issue", label: "爭點", prompt: "B 是否無自救力？甲阻止救助是作為或不作為？與重傷結果有何關係？", hint: "先把保護對象、行為型態與結果關係拆開。", example: "可依序列出無自救力、保證人地位／不作為、因果關係。" },
      { id: "rule", label: "規範", prompt: "整理無自救力、不作為犯與保證人地位，以及結果歸責的判斷框架。", hint: "規範不必先寫很長，但要能支持後面的每一段涵攝。", example: "先說明何時負有救助義務，再處理結果歸責。" },
      { id: "application", label: "涵攝", prompt: "對照B的處境、甲阻止救助的行為及遲延救治，說明各要件是否滿足。", hint: "指出題幹中哪些事實使B無法自救，並連到遲延救治。", example: "用「因……致……」清楚連結行為與結果。" },
      { id: "conclusion", label: "結論", prompt: "依序收束B的狀態、甲的義務與重傷結果的法律評價。", hint: "每一個爭點都要有結論，避免只說『可能成立』。", example: "用分項結論，讓閱卷者看得出你的判斷順序。" },
    ],
  },
};

const solutionWritingChoices: Record<string, SolutionWritingChoiceSet> = {
  "rong-law-1": {
    rule: ["法律明文原則", "禁止溯及既往原則", "禁止類推適用與習慣法入罪"],
    application: ["辨認案例發生與法律生效的先後", "檢查是否以未明文行為入罪", "區分類推適用與目的性解釋"],
    conclusion: ["本案違反罪刑法定原則", "本案涉及禁止溯及既往", "本案須依各案例分別作成結論"],
  },
  "rong-law-2": {
    rule: ["刑法第 10 條第 2 項公務員定義", "身分公務員的職務判斷", "受託公務員的法定職務權限"],
    application: ["區分里長身分與本案受託工作", "檢查督導社會勞動的權限來源", "判斷不實登載是否發生於法定公務"],
    conclusion: ["不能只因甲是里長即認定為公務員", "應就本案受託工作的性質判斷", "甲就本案行為不具刑法上公務員身分"],
  },
  "rong-law-3": {
    rule: ["刑法第 25 條未遂犯之著手", "整體理論的著手判斷", "個別理論的著手判斷"],
    application: ["確認甲已完成與尚未完成的行為", "判斷行為與竊盜實行行為的距離", "分別代入整體理論與個別理論"],
    conclusion: ["依所採理論判斷是否已著手", "說明是否成立竊盜未遂", "結論須與前述行為階段判斷一致"],
  },
  "rong-law-4": {
    rule: ["刑法第 23 條正當防衛", "現在不法侵害的時間界線", "竊盜罪不法所有意圖"],
    application: ["判斷竊盜既遂後侵害是否仍持續", "分別評價撲倒與擊打行為", "檢查取回皮夾是否出於不法所有意圖"],
    conclusion: ["撲倒行為是否得主張正當防衛", "擊打行為是否逾越防衛必要", "取回皮夾是否成立竊盜罪"],
  },
  "rong-law-5": {
    rule: ["無自救力之人的判斷", "不作為犯與保證人地位", "因果關係與結果歸責"],
    application: ["以失血、昏迷與無法言語判斷自救能力", "評價甲阻止櫃檯人員救助的積極行為", "連結延誤救治與長期臥床結果"],
    conclusion: ["B 屬無自救力之人", "甲的阻止救助應依積極作為評價", "須再確認重傷結果能否歸責於甲"],
  },
};

type SecondExamQuestion = {
  id: string;
  year: number;
  subject: string;
  number: string;
  score: string;
  stem: string;
  studentSample: string;
  sourceUrl: string;
  issuePreview: string[];
  teacherSolution: {
    label: string;
    source: string;
    preview: string;
    fullText: string;
    url: string;
  };
  course: {
    teacher: string;
    title: string;
    format: string;
    reason: string;
    url: string;
  };
  examHits: Array<{
    issue: string;
    material: string;
    lesson: string;
    pages: string;
    productUrl: string;
  }>;
};

const solutionBooks = [
  {
    id: "zheng-hong-114",
    teacher: "鄭泓",
    subject: "會計",
    title: "泓觀稱霸中級會計學114年解題全攻略",
    format: "選擇題",
    color: "accounting",
    cover: "/books/zheng-accounting-114.jpg",
    url: "https://publish.get.com.tw/book.asp?BKID=20223",
  },
  {
    id: "zheng-hong-essay",
    teacher: "鄭泓",
    subject: "會計",
    title: "中級會計學申論題完全制霸",
    format: "申論題",
    color: "accounting",
    cover: "/books/zheng-accounting-essay.jpg",
    url: "https://publish.get.com.tw/book.asp?BKID=19958",
  },
  {
    id: "zheng-hong-grad",
    teacher: "鄭泓",
    subject: "會計",
    title: "會研所中級會計學題庫制霸",
    format: "選擇題",
    color: "accounting",
    cover: "/books/zheng-accounting-grad.jpg",
    url: "https://publish.get.com.tw/Book.asp?BKID=20276",
  },
  {
    id: "rong-law",
    teacher: "榮律（張鏡榮）",
    subject: "刑法",
    title: "透明的刑法解題書",
    format: "申論題",
    color: "law",
    cover: "/books/rong-criminal-law-solution.jpg",
    url: "https://publish.get.com.tw/book.asp?BKID=20279",
  },
] as const;

const solutionBookExercises: SolutionBookExercise[] = [
  {
    id: "zh-114-1",
    bookId: "zheng-hong-114",
    chapter: "流動負債",
    type: "choice",
    source: "114 年初等考試・第 1 題",
    page: "第 1 頁",
    topic: "應付帳款認列",
    stem: "下列何種情形應認列應付帳款？",
    options: {
      A: "賒購之進貨採起運點交貨之條件，目前商品仍在途",
      B: "賒購之進貨採目的地交貨之條件，目前商品仍在途",
      C: "賒銷之銷貨採起運點交貨之條件，目前商品仍在途",
      D: "賒銷之銷貨採目的地交貨之條件，目前商品仍在途",
    },
    answer: "A",
  },
  {
    id: "zh-114-2",
    bookId: "zheng-hong-114",
    chapter: "會計循環",
    type: "choice",
    source: "114 年初等考試・第 2 題",
    page: "第 1 頁",
    topic: "試算表錯誤",
    stem: "若記錄現銷商品 $5,000 時將貸方誤記為應收帳款，則對試算表之影響為何？",
    options: {
      A: "借貸方之總餘額均少計 $5,000",
      B: "借貸方之總餘額均多計 $5,000",
      C: "僅借方之總餘額多計 $10,000",
      D: "借貸方之總餘額均無影響",
    },
    answer: "A",
  },
  {
    id: "zh-114-4",
    bookId: "zheng-hong-114",
    chapter: "現金及約當現金",
    type: "choice",
    source: "114 年初等考試・第 4 題",
    page: "第 2 頁",
    topic: "現金範圍",
    stem: "甲公司 X3 年底有活期存款 $200,000、支票存款 $300,000、補償性存款 $10,000、遠期支票 $5,000、三個月內到期短期票券 $20,000、員工借款 $30,000。若正確現金及約當現金為 $550,000，庫存現金應為多少？",
    options: { A: "$30,000", B: "$20,000", C: "$25,000", D: "$0" },
    answer: "A",
  },
  {
    id: "zh-114-5",
    bookId: "zheng-hong-114",
    chapter: "應收款項",
    type: "choice",
    source: "114 年初等考試・第 5 題",
    page: "第 2 頁",
    topic: "備抵壞帳",
    stem: "戊公司 X3 年間沖銷應收帳款 $50,000，年底認列壞帳費用 $53,000，年底備抵壞帳為貸餘 $7,000。X3 年初備抵壞帳餘額為多少？",
    options: { A: "借餘 $7,000", B: "貸餘 $7,000", C: "借餘 $4,000", D: "貸餘 $4,000" },
    answer: "D",
  },
  {
    id: "zh-114-6",
    bookId: "zheng-hong-114",
    chapter: "現金及約當現金",
    type: "choice",
    source: "114 年初等考試・第 6 題",
    page: "第 2 頁",
    topic: "零用金",
    stem: "丙公司設置零用金 $5,000，撥補時貸記現金 $4,550。撥補前零用金實際剩餘金額為多少？",
    options: { A: "$400", B: "$450", C: "$500", D: "$4,550" },
    answer: "B",
  },
  {
    id: "zh-114-7",
    bookId: "zheng-hong-114",
    chapter: "收入認列",
    type: "choice",
    source: "114 年公職考試收錄題・第 7 題",
    page: "第 3 頁",
    topic: "保固收入拆分",
    stem: "企業銷售商品時另提供可由顧客單獨購買之延長保固服務，該延長保固在收入認列上應如何處理？",
    options: {
      A: "全部售價於商品交付時認列收入",
      B: "將延長保固視為單獨履約義務並分攤交易價格",
      C: "全數認列為負債，待保固期滿再轉列收入",
      D: "僅於實際發生維修成本時認列收入",
    },
    answer: "B",
  },
  {
    id: "zh-114-8",
    bookId: "zheng-hong-114",
    chapter: "金融工具",
    type: "choice",
    source: "114 年公職考試收錄題・第 8 題",
    page: "第 3 頁",
    topic: "FVOCI 債務工具處分",
    stem: "指定透過其他綜合損益按公允價值衡量之債務工具於處分時，累積於其他權益之利益應如何處理？",
    options: {
      A: "不得重分類",
      B: "重分類至保留盈餘",
      C: "重分類至當期損益",
      D: "直接沖銷金融資產成本",
    },
    answer: "C",
  },
  {
    id: "zh-114-9",
    bookId: "zheng-hong-114",
    chapter: "權益",
    type: "choice",
    source: "114 年公職考試收錄題・第 9 題",
    page: "第 4 頁",
    topic: "庫藏股票",
    stem: "公司以成本法買回庫藏股票時，對資產總額與權益總額的影響為何？",
    options: {
      A: "資產增加、權益增加",
      B: "資產減少、權益減少",
      C: "資產不變、權益減少",
      D: "資產減少、負債增加",
    },
    answer: "B",
  },
  {
    id: "zh-114-10",
    bookId: "zheng-hong-114",
    chapter: "存貨",
    type: "choice",
    source: "114 年公職考試收錄題・第 10 題",
    page: "第 4 頁",
    topic: "定期盤存加權平均",
    stem: "採定期盤存制與加權平均法時，單位成本應於何時依何種資料計算？",
    options: {
      A: "每次進貨後，以當時存貨重新計算",
      B: "期末以期初存貨及本期全部進貨之可供銷售成本計算",
      C: "僅以最後一次進貨成本計算",
      D: "以各批銷貨當日市價平均計算",
    },
    answer: "B",
  },
  {
    id: "zh-114-11",
    bookId: "zheng-hong-114",
    chapter: "其他綜合損益",
    type: "choice",
    source: "114 年公職考試收錄題・第 11 題",
    page: "第 5 頁",
    topic: "不重分類項目",
    stem: "下列何者通常屬於後續不重分類至損益之其他綜合損益項目？",
    options: {
      A: "國外營運機構財務報表換算差額",
      B: "現金流量避險工具有效部分",
      C: "確定福利計畫再衡量數",
      D: "FVOCI 債務工具未實現評價利益",
    },
    answer: "C",
  },
  {
    id: "zh-essay-1",
    bookId: "zheng-hong-essay",
    chapter: "收入與存貨",
    type: "essay",
    source: "110 年普考會計、財稅、金保部分・第 1 題",
    page: "第 3 頁",
    topic: "銷貨淨額與銷貨成本",
    stem: "台中公司從事文具批發，進貨和銷貨皆採賒帳。X2 年顧客以現金償還帳款共 $570,000，公司以現金支付貨款共 $390,000；X2 年底應收帳款 $67,500、存貨 $187,500、應付帳款 $120,000，X1 年底則分別為 $90,000、$147,000、$97,500。試計算 X2 年度銷貨淨額與銷貨成本。",
    standardAnswer: "銷貨淨額 $547,500；銷貨成本 $372,000。",
    explanation: [
      "銷貨淨額＝現金收款＋期末應收帳款－期初應收帳款＝$570,000＋$67,500－$90,000＝$547,500。",
      "進貨＝現金付貨款＋期末應付帳款－期初應付帳款＝$390,000＋$120,000－$97,500＝$412,500。",
      "銷貨成本＝期初存貨＋進貨－期末存貨＝$147,000＋$412,500－$187,500＝$372,000。",
    ],
  },
  {
    id: "zh-essay-2",
    bookId: "zheng-hong-essay",
    chapter: "財務報表的表達",
    type: "essay",
    source: "112 年地方特考四等・第 1 題",
    page: "第二章第 11 頁",
    topic: "損益與保留盈餘",
    stem: "甲公司 2022 年銷貨收入 $500,000、銷貨退回 $15,000、銷貨折扣 $8,000、銷貨成本 $200,000、銷貨費用 $70,000、管理費用 $60,000、利息費用 $15,000、所得稅費用 $32,000；期初、期末保留盈餘分別為 $120,000 與 $150,000。試計算稅後淨利與股利。",
    standardAnswer: "稅後淨利 $100,000；股利 $70,000。",
    explanation: [
      "銷貨淨額＝$500,000－$15,000－$8,000＝$477,000。",
      "稅前淨利＝$477,000－$200,000－$70,000－$60,000－$15,000＝$132,000；稅後淨利＝$132,000－$32,000＝$100,000。",
      "期末保留盈餘＝期初保留盈餘＋稅後淨利－股利，因此股利＝$120,000＋$100,000－$150,000＝$70,000。",
    ],
  },
  {
    id: "zh-essay-3",
    bookId: "zheng-hong-essay",
    chapter: "財務報導觀念架構",
    type: "essay",
    source: "110 年薦任升等三等財稅改編",
    page: "第一章第 5 頁",
    topic: "直接法現金流量",
    stem: "戊公司本期銷貨收入 $950,000，應收帳款增加 $150,000；進貨 $690,000，存貨減少 $120,000、應付帳款增加 $170,000；營業費用 $56,000，預付費用增加 $24,000、應付費用增加 $18,000。請以直接法計算營業活動淨現金流量。",
    standardAnswer: "營業活動淨現金流入 $218,000。",
    explanation: [
      "向客戶收現＝銷貨收入－應收帳款增加＝$950,000－$150,000＝$800,000。",
      "支付供應商現金＝進貨－應付帳款增加＝$690,000－$170,000＝$520,000。存貨減少用於由進貨推算銷貨成本，本題已直接提供進貨，故不再重複調整。",
      "支付營業費用現金＝營業費用＋預付費用增加－應付費用增加＝$56,000＋$24,000－$18,000＝$62,000。",
      "營業活動淨現金流量＝$800,000－$520,000－$62,000＝$218,000。",
    ],
  },
  {
    id: "zh-essay-4",
    bookId: "zheng-hong-essay",
    chapter: "財務報導觀念架構",
    type: "essay",
    source: "書中品質特性題組",
    page: "第一章第 8 頁",
    topic: "會計資訊品質",
    stem: "請分別說明攸關性、忠實表述、可比性、可驗證性、時效性及中立性，並指出「漏報或誤報會影響決策」與哪一項品質判斷最直接相關。",
    standardAnswer: "「漏報或誤報會影響決策」最直接對應攸關性中的重大性判斷。",
    explanation: [
      "攸關性：資訊具有預測價值或確認價值；重大性是依個體情況判斷的攸關性層面。",
      "忠實表述：資訊應完整、中立且無錯誤；中立性是不偏頗地選擇或呈現資訊。",
      "可比性使使用者辨識項目間異同；可驗證性表示不同具知識且獨立的觀察者可形成共識；時效性是及時提供資訊，使其仍能影響決策。",
    ],
  },
  {
    id: "zh-essay-5",
    bookId: "zheng-hong-essay",
    chapter: "銀行存款調節",
    type: "essay",
    source: "書中銀行存款調節題組",
    page: "現金章",
    topic: "銀行存款調節表",
    stem: "公司帳面餘額 $265,000，銀行代收票據 $125,000、手續費 $9,000；未兌現支票 $325,000、在途存款 $225,000，銀行餘額 $481,000。請編製銀行存款調節表並列示公司應作之調整分錄。",
    standardAnswer: "調整後正確銀行存款餘額為 $381,000。",
    explanation: [
      "銀行端：$481,000＋在途存款 $225,000－未兌現支票 $325,000＝$381,000。",
      "公司端：$265,000＋銀行代收票據 $125,000－手續費 $9,000＝$381,000。",
      "公司調整分錄：(1) 借：銀行存款 $125,000／貸：應收票據（或相關應收款）$125,000；(2) 借：手續費 $9,000／貸：銀行存款 $9,000。",
    ],
  },
  {
    id: "zh-essay-6",
    bookId: "zheng-hong-essay",
    chapter: "租賃",
    type: "essay",
    source: "114 年地方政府三等特考・中級會計學",
    page: "租賃章",
    topic: "售後租回",
    stem: "企業移轉資產後租回，租期 3 年、每年租金 $2,000,000 並含 CPI 調整，另有保證殘值。請說明如何判斷移轉是否構成銷售，並列示賣方兼承租人之會計處理架構。",
    standardAnswer: "先依 IFRS 15 判斷控制是否移轉；構成銷售時僅認列移轉給買方兼出租人的權利所產生之損益，並認列租回的使用權資產與租賃負債。",
    explanation: [
      "若移轉符合 IFRS 15 的銷售，租賃負債以未付租賃給付現值衡量；使用權資產按原資產帳面金額中與保留使用權相關的比例衡量。",
      "CPI 連動租金原始衡量採租賃開始日指數；指數變動導致未來租金改變時，再重衡量租賃負債。保證殘值應納入預期支付金額。",
      "若移轉不構成銷售，賣方兼承租人繼續認列原資產，收到的價款認列金融負債，不認列出售損益。",
    ],
  },
  {
    id: "zh-essay-7",
    bookId: "zheng-hong-essay",
    chapter: "金融工具",
    type: "essay",
    source: "書中金融工具申論題組",
    page: "金融工具章",
    topic: "FVOCI 債務工具",
    stem: "公司持有指定透過其他綜合損益按公允價值衡量之債務工具，期末產生評價利益，次期出售。請分別說明利息收入、減損、評價差額及處分時重分類之會計處理。",
    standardAnswer: "利息與減損列入損益，公允價值評價差額列入其他綜合損益；處分時累積評價差額重分類至損益。",
    explanation: [
      "利息收入依有效利率法計入當期損益。",
      "預期信用損失認列於損益；備抵的表達不直接減少資產負債表上按公允價值列示的帳面金額。",
      "除利息與減損等已列損益部分外，公允價值變動列入其他綜合損益；除列時將累積於其他權益的金額重分類至損益。",
    ],
  },
  {
    id: "zh-essay-8",
    bookId: "zheng-hong-essay",
    chapter: "股份基礎給付",
    type: "essay",
    source: "書中股份基礎給付題組",
    page: "股份基礎給付章",
    topic: "非市價績效條件",
    stem: "公司給與員工認股權，既得條件包括服務年限與市占率目標。請說明市占率條件的分類、估計既得數量的方式，以及條件未達成時應如何調整已認列酬勞成本。",
    standardAnswer: "市占率目標屬非市價績效條件，不納入給與日公允價值，而在既得期間依預期最終既得數量調整費用；若最終未達成，累計酬勞成本應迴轉為零。",
    explanation: [
      "服務年限是服務條件；市占率與企業營運成果相關，通常屬非市價績效條件。",
      "每一報導日重新估計預期符合條件的權益工具數量，按更新後累計應認列數調整當期費用。",
      "若員工完成服務但市占率目標最終未達成，因非市價既得條件未滿足，先前認列的酬勞成本應全部迴轉。",
    ],
  },
  {
    id: "zh-essay-9",
    bookId: "zheng-hong-essay",
    chapter: "會計變動與錯誤",
    type: "essay",
    source: "書中會計變動題組",
    page: "會計變動章",
    topic: "政策、估計與錯誤更正",
    stem: "請比較會計政策變動、會計估計值變動及前期錯誤更正的判斷標準與適用方式，並說明追溯適用、追溯重編及推延適用的差異。",
    standardAnswer: "會計政策變動原則上追溯適用；會計估計值變動採推延適用；重大前期錯誤原則上追溯重編。",
    explanation: [
      "會計政策是編製財務報表所採用的特定原則、基礎與慣例；政策變動通常調整最早表達期間期初權益並重編比較資訊。",
      "估計值變動源自新資訊或新發展，不是錯誤；其影響認列於變動當期，若影響未來期間則同時認列於未來期間。",
      "前期錯誤是未使用或誤用當時已可取得的可靠資訊；重大錯誤須更正比較金額，或調整最早表達期間期初餘額。",
    ],
  },
  {
    id: "zh-essay-10",
    bookId: "zheng-hong-essay",
    chapter: "現金流量表",
    type: "essay",
    source: "書中現金流量表題組",
    page: "現金流量表章",
    topic: "間接法營業現金流量",
    stem: "請由本期淨利出發，以間接法說明折舊、處分資產損益、應收帳款、存貨及應付帳款變動應如何調整，並完成營業活動現金流量的計算架構。",
    standardAnswer: "營業活動現金流量＝本期淨利＋折舊－處分資產利益（或＋處分損失）－應收帳款增加－存貨增加＋應付帳款增加；各科目若為相反變動，調整方向亦相反。",
    explanation: [
      "折舊是已減少淨利但未流出現金的費用，因此加回。",
      "處分資產利益應自淨利扣除、處分損失應加回，實際處分現金流列於投資活動。",
      "營業資產增加通常代表占用現金，故扣除；營業負債增加代表尚未付現，故加回。",
    ],
  },
  {
    id: "zh-grad-1",
    bookId: "zheng-hong-grad",
    chapter: "財務報導觀念架構",
    type: "choice",
    source: "113 年臺灣大學會計研究所・第 1 題",
    page: "第一章第 3 頁",
    topic: "財務報表要素衡量基礎",
    stem: "以下關於財務報表要素之衡量基礎的敘述，何者錯誤？",
    options: {
      A: "資產於取得（或創造）時之歷史成本，係所發生成本（包含支付之對價加上交易成本）之價值。",
      B: "使用價值及履約價值皆為現時價值。",
      C: "使用價值係指個體預期源自使用資產及最終處分之現金流量（或其他經濟效益）之現值。",
      D: "公允價值係指於衡量日，市場參與者間在有秩序之交易中出售某一資產所能收取或移轉某一負債所需支付之價格減除賣出之交易成本。",
    },
    answer: "D",
  },
  {
    id: "zh-grad-2",
    bookId: "zheng-hong-grad",
    chapter: "財務報導觀念架構",
    type: "choice",
    source: "113 年中正大學會計研究所",
    page: "第一章第 5 頁",
    topic: "會計等式影響",
    stem: "公司以現金 $5,000 購入辦公用品，期末盤點尚餘 $2,000。調整後對會計等式的影響為何？",
    options: {
      A: "權益增加 $2,000",
      B: "權益減少 $3,000",
      C: "負債增加 $3,000",
      D: "資產減少 $2,000",
    },
    answer: "B",
  },
  {
    id: "zh-grad-3",
    bookId: "zheng-hong-grad",
    chapter: "財務報導觀念架構",
    type: "choice",
    source: "112 年臺灣大學會計研究所",
    page: "第一章第 8 頁",
    topic: "一般用途財務報導",
    stem: "下列有關一般用途財務報導之說明，何者錯誤？",
    options: {
      A: "現有及潛在投資者、貸款人及其他債權人為主要使用者",
      B: "管理當局雖有內部資訊，仍可使用一般用途財務報告",
      C: "財務報告基於估計、判斷及模式，因此不具預測價值",
      D: "一般用途財務報告並非為顯示報告個體價值而設計",
    },
    answer: "C",
  },
  {
    id: "zh-grad-4",
    bookId: "zheng-hong-grad",
    chapter: "財務報導觀念架構",
    type: "choice",
    source: "111 年中正大學會計研究所",
    page: "第一章第 9 頁",
    topic: "重大性",
    stem: "下列何者屬於攸關性的企業個體特定面向？",
    options: { A: "可了解性", B: "時效性", C: "可驗證性", D: "重大性" },
    answer: "D",
  },
  {
    id: "zh-grad-5",
    bookId: "zheng-hong-grad",
    chapter: "財務報表的表達",
    type: "choice",
    source: "110 年臺灣大學會計研究所",
    page: "第二章",
    topic: "停業單位損益",
    stem: "單獨主要業務單位於本期出售，處分前營業損益及處分損益應如何列報？",
    options: {
      A: "全數列為繼續營業單位損益",
      B: "合併為稅後金額列於停業單位損益",
      C: "僅處分損益列為停業單位損益",
      D: "直接列入其他綜合損益",
    },
    answer: "B",
  },
  {
    id: "zh-grad-6",
    bookId: "zheng-hong-grad",
    chapter: "財務報表的表達",
    type: "choice",
    source: "107 年東吳大學會計研究所",
    page: "第二章第 34 題",
    topic: "流動比率",
    stem: "計算流動比率時，下列何者通常不列入流動資產？",
    options: { A: "現金", B: "存貨", C: "一年內耗用之預付費用", D: "供長期營運使用之土地" },
    answer: "D",
  },
  {
    id: "zh-grad-7",
    bookId: "zheng-hong-grad",
    chapter: "其他綜合損益",
    type: "choice",
    source: "104 年政治大學會計研究所",
    page: "第二章",
    topic: "OCI 重分類調整",
    stem: "本期新增之其他綜合損益與重分類調整，在綜合損益表中應如何表達？",
    options: {
      A: "不得揭露重分類調整",
      B: "僅能於附註揭露總額",
      C: "可於綜合損益表或附註列示重分類調整",
      D: "一律直接列入保留盈餘",
    },
    answer: "C",
  },
  {
    id: "zh-grad-8",
    bookId: "zheng-hong-grad",
    chapter: "負債",
    type: "choice",
    source: "110 年臺灣大學會計研究所・第 27 題",
    page: "第二章第 27 題",
    topic: "可賣回公司債分類",
    stem: "公司債持有人於報導期間後十二個月內有權按面額賣回，發行公司在報導日無權拒絕時，該公司債通常應如何分類？",
    options: { A: "非流動負債", B: "流動負債", C: "權益", D: "或有負債" },
    answer: "B",
  },
  {
    id: "zh-grad-9",
    bookId: "zheng-hong-grad",
    chapter: "不動產、廠房及設備",
    type: "choice",
    source: "103 年成功大學會計研究所",
    page: "第二章",
    topic: "重估增值處分",
    stem: "採重估價模式之土地出售時，原列於其他權益之重估增值可如何處理？",
    options: {
      A: "必須重分類至當期損益",
      B: "得直接轉入保留盈餘",
      C: "必須沖銷銷貨收入",
      D: "永遠保留於其他權益",
    },
    answer: "B",
  },
  {
    id: "zh-grad-10",
    bookId: "zheng-hong-grad",
    chapter: "財務報表的表達",
    type: "choice",
    source: "108 年臺灣大學會計研究所・第 32 題",
    page: "第二章第 32 題",
    topic: "停業單位衡量",
    stem: "停業單位之處分損益與處分前營業損益，在不考慮所得稅時應如何呈現？",
    options: {
      A: "分別列入營業收入與營業費用",
      B: "合併為停業單位單一金額",
      C: "全數列入其他綜合損益",
      D: "只揭露、不入帳",
    },
    answer: "B",
  },
  {
    id: "zh-grad-11",
    bookId: "zheng-hong-grad",
    chapter: "財務報導觀念架構",
    type: "choice",
    source: "鄭泓名師解題書收錄・110 年中正大學會計研究所",
    page: "第一章",
    topic: "攸關性",
    stem: "會計資訊具備攸關性，是指該資訊應符合下列何者？",
    options: {
      A: "能忠實代表其欲表達之經濟狀況",
      B: "有能力影響使用者的決策",
      C: "可由具合理知識的使用者立即理解",
      D: "不同公司必須採用完全相同的衡量方法",
    },
    answer: "B",
  },
  {
    id: "zh-grad-12",
    bookId: "zheng-hong-grad",
    chapter: "財務報導觀念架構",
    type: "choice",
    source: "鄭泓名師解題書收錄・112 年臺灣大學會計研究所",
    page: "第一章",
    topic: "中立性",
    stem: "公司刻意選擇折舊政策，使每年折舊費用低於預設金額或比例，最可能違反哪一項財務資訊品質？",
    options: { A: "確認價值", B: "中立性", C: "預測價值", D: "可驗證性" },
    answer: "B",
  },
  {
    id: "zh-grad-13",
    bookId: "zheng-hong-grad",
    chapter: "財務報導觀念架構",
    type: "choice",
    source: "鄭泓名師解題書收錄・112 年臺灣大學會計研究所",
    page: "第一章",
    topic: "財務報導目的",
    stem: "下列何者不是一般用途財務報導的主要目的？",
    options: {
      A: "提供投資與授信決策所需資訊",
      B: "直接報導企業整體的公允價值",
      C: "報導企業資源及對資源請求權的變化",
      D: "提供評估企業產生現金流量能力的資訊",
    },
    answer: "B",
  },
  {
    id: "zh-grad-14",
    bookId: "zheng-hong-grad",
    chapter: "會計循環",
    type: "choice",
    source: "鄭泓名師解題書收錄・110 年東吳大學會計研究所",
    page: "第一章",
    topic: "更正分錄",
    stem: "公司購入辦公用品 $73,000，卻誤記為借記用品盤存 $37,000、貸記現金 $37,000，且於結帳前發現。更正分錄應包含下列何者？",
    options: {
      A: "借記保留盈餘 $36,000、貸記現金 $36,000",
      B: "借記用品盤存 $36,000、貸記現金 $36,000",
      C: "借記用品費用 $36,000、貸記現金 $36,000",
      D: "借記現金 $36,000、貸記用品費用 $36,000",
    },
    answer: "C",
  },
  {
    id: "zh-grad-15",
    bookId: "zheng-hong-grad",
    chapter: "不動產、廠房及設備",
    type: "choice",
    source: "鄭泓名師解題書收錄・110 年臺灣大學會計研究所",
    page: "第八章",
    topic: "投資性不動產衡量",
    stem: "辦公大樓成本 $167,200、殘值 $4,000、耐用年限 40 年，7 月 1 日購入供出租；年底公允價值為 $172,000。成本模式與公允價值模式下，當年度稅前淨利差異為何？",
    options: { A: "$2,760", B: "$6,840", C: "$10,840", D: "$13,950" },
    answer: "B",
  },
  {
    id: "zh-grad-16",
    bookId: "zheng-hong-grad",
    chapter: "無形資產",
    type: "choice",
    source: "鄭泓名師解題書收錄・113 年東吳大學會計研究所",
    page: "第八章",
    topic: "專利權訴訟支出",
    stem: "專利權成本 $3,000,000，經濟年限 6 年。第二年因專利受侵害發生訴訟費用 $500,000 並勝訴，但效益未增加。第二年底專利權帳面金額為何？",
    options: { A: "$2,000,000", B: "$2,400,000", C: "$2,500,000", D: "$2,844,444" },
    answer: "A",
  },
  {
    id: "zh-grad-17",
    bookId: "zheng-hong-grad",
    chapter: "無形資產",
    type: "choice",
    source: "鄭泓名師解題書收錄・111 年成功大學會計研究所",
    page: "第八章",
    topic: "專利權減損",
    stem: "專利權成本 $3,600,000、耐用年限 10 年，使用三年後可回收金額為 $500,000，訴訟支出應費用化。第三年底應認列多少減損損失？",
    options: { A: "$500,000", B: "$2,020,000", C: "$2,468,000", D: "$2,470,000" },
    answer: "B",
  },
  {
    id: "zh-grad-18",
    bookId: "zheng-hong-grad",
    chapter: "無形資產",
    type: "choice",
    source: "鄭泓名師解題書收錄・110 年臺灣大學會計研究所",
    page: "第八章",
    topic: "專利權攤銷",
    stem: "專利權於 2020 年初帳面金額為 $124,000，經重新估計剩餘耐用年限為 4 年。2020 年度攤銷費用為何？",
    options: { A: "$27,125", B: "$31,000", C: "$33,125", D: "$37,000" },
    answer: "B",
  },
  {
    id: "zh-grad-19",
    bookId: "zheng-hong-grad",
    chapter: "生物資產",
    type: "choice",
    source: "鄭泓名師解題書收錄・110 年臺灣大學會計研究所",
    page: "第八章",
    topic: "生物資產公允價值",
    stem: "養雞場持有小雞 3,000 隻，每隻原淨公允價值 $25；年底每隻售價 $70，出售成本合計 $3,200。當年度公允價值調整利益為何？",
    options: { A: "$135,000", B: "$131,800", C: "$11,000", D: "$7,800" },
    answer: "B",
  },
  {
    id: "zh-grad-20",
    bookId: "zheng-hong-grad",
    chapter: "生物資產",
    type: "choice",
    source: "鄭泓名師解題書收錄・111 年臺灣大學會計研究所",
    page: "第八章",
    topic: "生產性植物成本",
    stem: "椰子樹期初帳面金額 $8,000,000，年底尚未能規律產出；本年投入肥料 $200,000、人事 $30,000、設備折舊 $100,000。當年度相關損益為何？",
    options: { A: "$0", B: "損失 $330,000", C: "利益 $1,420,000", D: "利益 $1,750,000" },
    answer: "A",
  },
  {
    id: "rong-law-1",
    bookId: "rong-law",
    chapter: "刑法基本原則",
    type: "essay",
    source: "105 年政大轉學考・第 1 題",
    page: "題型 1.1",
    topic: "罪刑法定原則",
    stem: "請舉例詳細說明「罪刑法定」的基本內涵及衍生原則。（35 分）",
    previewTitle: "書中爭點解析節錄｜題型 1.1",
    previewPoints: [
      "本題是單純的申論題，測驗刑法基本功，且配分高達 35 分。",
      "申論題若有數個不同問題，原則上一個問號應開一個標，使答題架構清楚。",
      "題目要求「舉例說明」，書中建議將「內涵」與「案例」分兩點論述。",
    ],
    lockedDetails: [
      "各項衍生原則的完整說明與舉例",
      "完整擬答與書中後續解析",
    ],
  },
  {
    id: "rong-law-2",
    bookId: "rong-law",
    chapter: "刑法基本原則",
    type: "essay",
    source: "105 年司法特考四等・第 3 題",
    page: "題型 1.2",
    topic: "刑法上公務員",
    stem: "甲為某市里長，受市公所囑託協助督導在該里執行社會勞動之工作。乙受法院判刑得易服社會勞動確定，經地檢署派往該里執行。甲明知乙於執行期間未確實每日履行滿 9 小時，竟與乙將不實工作時數登載於「易服社會勞動執行登記簿」，乙亦在簿上簽名。試問甲就不實登載時數一事，是否為刑法上之公務員？（25 分）",
    previewTitle: "書中爭點解析節錄｜題型 1.2",
    previewPoints: [
      "本題改編自最高法院 105 年度台上字第 1272 號判決，測驗爭點是「里長是否為刑法上公務員」。",
      "不能只看到甲是里長就直接肯定；須區分里長本身職務，與受囑託協助督導社會勞動的具體工作。",
      "書中結論指出：不實登載時數並非里長職位本身的公務，甲就此並非刑法上公務員。",
    ],
    lockedDetails: [
      "刑法上公務員的完整判斷標準",
      "完整擬答與判決見解整理",
    ],
  },
  {
    id: "rong-law-3",
    bookId: "rong-law",
    chapter: "客觀構成要件",
    type: "essay",
    source: "104 年司法官・第 1 題",
    page: "題型 2.1",
    topic: "著手判斷",
    stem: "中華賽鴿協會舉辦飛鴿競賽，賽鴿由臺北飛往臺東。甲於鴿子飛行必經路徑之臺中山區高地，架設網子計畫捕捉賽鴿。架設網子完成，比賽並已開始，但尚未捕到賽鴿即經查獲，甲應論以何罪？（10 分）",
    previewTitle: "書中爭點解析節錄｜題型 2.1",
    previewPoints: [
      "題目雖問「甲應論以何罪」，由「架設網子完成」及「尚未捕到賽鴿」可知，核心在甲是否成立竊盜未遂罪。",
      "成立未遂的前提在於是否已經著手，而且本題涉及的是「隔離犯」的著手。",
      "書中建議捨棄只列客觀說、主觀說與主客觀混合說的傳統排列，改以「整體理論」與「個別理論」整理學說，再於本文見解進行涵攝。",
    ],
    lockedDetails: [
      "整體理論與個別理論的完整內容",
      "本題完整涵攝、結論與擬答",
    ],
  },
  {
    id: "rong-law-4",
    bookId: "rong-law",
    chapter: "違法性",
    type: "essay",
    source: "109 年司法特考三等・第 1 題",
    page: "題型 3.2",
    topic: "追回遭竊物之正當防衛",
    stem: "甲、乙均為健身房教練。甲發現乙以萬能鑰匙打開甲的置物櫃並拿走皮夾，乙拔腿逃跑，甲追上後將乙撲倒。乙反手抵抗，甲隨手拿起啞鈴擊打乙手臂，造成骨折，並在乙無法行動時奪回皮夾。試問甲之行為如何論罪？（25 分）",
    previewTitle: "書中爭點解析節錄｜題型 3.2",
    previewPoints: [
      "乙拿走皮夾時，竊盜罪已達既遂階段，但行為是否已終了仍須判斷。",
      "甲追上並撲倒乙，涉及私行拘禁、依法令行為與正當防衛；乙反手抵抗則另須判斷是否出現現在不法侵害。",
      "甲以啞鈴打斷乙手臂涉及普通傷害罪及正當防衛；奪回自己皮夾還須檢查強盜罪的不法所有意圖。",
    ],
    lockedDetails: [
      "竊盜既遂與侵害現在性的完整論證",
      "撲倒、毆打及取回皮夾的完整罪名檢討",
    ],
  },
  {
    id: "rong-law-5",
    bookId: "rong-law",
    chapter: "故意與過失不作為犯",
    type: "essay",
    source: "108 年中正法研刑法組・第 2 題",
    page: "題型 8.2",
    topic: "不作為與保證人地位",
    stem: "丙為酒店領檯小姐，與 B 男協議性交易並入住旅店。B 酒醉後在浴室跌倒受傷，丙發現其流血且遲遲無法起身，卻為避免性交易曝光，兩度阻止櫃檯人員入內協助，並於 B 已無法言語後獨自離去。B 次日始被發現送醫，因延誤救治造成顱內出血，需長期臥床且無法自理生活。問丙如何論罪？（25 分）",
    previewTitle: "書中爭點解析節錄｜題型 8.2",
    previewPoints: [
      "B 由尚能對話但無法起身，到後來無法言語，首先涉及是否屬無自救力之人。",
      "丙兩度阻止櫃檯人員協助，須判斷屬作為或不作為，並進一步檢討其是否具有保證人地位。",
      "B 因遲誤救治而成重傷，尚須處理因果關係與刑法第 10 條第 4 項重傷的認定。",
    ],
    lockedDetails: [
      "作為與不作為的完整區分",
      "保證人地位、遺棄罪及重傷結果的完整擬答",
    ],
  },
];

const solutionCompanionBooks = {
  "zh-114-1": [
    {
      title: "中級會計學霸（下）",
      reason: "本題對應：負債定義、流動負債與應付帳款認列",
      url: "https://publish.get.com.tw/book.asp?BKID=20334",
    },
  ],
  "zh-essay-1": [
    {
      title: "中級會計學霸（上）",
      reason: "本題對應：收入、存貨與銷貨成本",
      url: "https://publish.get.com.tw/book.asp?BKID=20287",
    },
  ],
  "zh-grad-1": [
    {
      title: "中級會計學霸（上）",
      reason: "本題對應：財務報導觀念架構與衡量基礎",
      url: "https://publish.get.com.tw/book.asp?BKID=20287",
    },
  ],
  "rong-law-1": [
    {
      title: "透明的刑法－總則編",
      reason: "本題對應：罪刑法定原則與刑法基本原則",
      url: "https://publish.get.com.tw/book.asp?BKID=20266",
    },
  ],
} satisfies Record<string, Array<{ title: string; reason: string; url: string }>>;

const solutionCompanionCourses = {
  "zheng-hong-114": {
    teacher: "鄭泓",
    title: "中級會計學正規影音課程",
    reason: "搭配《中級會計學霸》上、下冊，從觀念架構帶到章節題型。",
    auditionUrl: "https://www.ibrain.com.tw/audition/ListDetail.aspx?iS=13000",
    courseUrl: "https://ec.ibrain.com.tw/book.asp?BKID=18321",
  },
  "zheng-hong-essay": {
    teacher: "鄭泓",
    title: "中級會計學正規影音課程",
    reason: "搭配《中級會計學霸》上、下冊，補足計算邏輯與申論表達。",
    auditionUrl: "https://www.ibrain.com.tw/audition/ListDetail.aspx?iS=13000",
    courseUrl: "https://ec.ibrain.com.tw/book.asp?BKID=18321",
  },
  "zheng-hong-grad": {
    teacher: "鄭泓",
    title: "中級會計學正規影音課程",
    reason: "從基本觀念、衡量架構一路銜接會研所題型。",
    auditionUrl: "https://www.ibrain.com.tw/audition/ListDetail.aspx?iS=13000",
    courseUrl: "https://ec.ibrain.com.tw/book.asp?BKID=18321",
  },
  "rong-law": {
    teacher: "榮律（張鏡榮）",
    title: "律師司法官刑法正規影音課程",
    reason: "搭配《透明的刑法》總則、分則，建立完整刑法體系與解題思考。",
    auditionUrl: "https://www.ibrain.com.tw/Audition/ListDetail.aspx?1=1&iC=2065&iM=40498&iS=65230",
    courseUrl: "https://ec.ibrain.com.tw/book.asp?BKID=17718",
  },
} satisfies Record<string, { teacher: string; title: string; reason: string; auditionUrl: string; courseUrl: string }>;

function accountingLearningRecommendation(chapter: string, topic: string, format: "選擇題" | "申論題") {
  const lowerText = `${chapter} ${topic}`.toLowerCase();
  const isFinancialAccounting = /觀念架構|財務報導|資產|負債|收入|存貨|銷貨|應收|應付|現金流量|金融工具|租賃|會計政策|估計|錯誤/.test(lowerText);
  const book = format === "申論題"
    ? {
        title: "中級會計學申論題完全制霸",
        meta: "鄭泓老師・高點文化",
        url: "https://publish.get.com.tw/book.asp?BKID=19958",
        reason: `本題需要把「${topic}」寫成可得分的公式、計算步驟與結論，適合用申論題型補強。`,
      }
    : {
        title: isFinancialAccounting ? "中級會計學霸（上）" : "中級會計學霸（下）",
        meta: "鄭泓老師・高點文化",
        url: isFinancialAccounting
          ? "https://publish.get.com.tw/book.asp?BKID=20287"
          : "https://publish.get.com.tw/book.asp?BKID=20334",
        reason: `本題考查「${topic}」的判斷規則，建議回到對應章節整理觀念後再做同類題。`,
      };

  return {
    weakness: format === "申論題"
      ? `本題重點不只在最後答案，還要完整呈現「${topic}」的判斷、公式與計算過程。`
      : `本題反映「${topic}」的觀念辨識與選項判斷能力。`,
    course: {
      title: "中級會計學正規影音課程",
      meta: "鄭泓老師・iBrain 知識達",
      url: "https://www.ibrain.com.tw/audition/ListDetail.aspx?iS=13000",
      reason: `建議回看「${chapter}」相關單元，先釐清${topic}的判斷順序，再重新作答。`,
    },
    book,
    exam: {
      title: "會計師、公職會計歷屆試題與解答",
      meta: "高點會計網・正式考情入口",
      url: "https://cpa.get.com.tw/Exam/List.aspx",
      reason: `可進一步查看「${chapter}」在不同年度、不同考試中的出題方式。`,
    },
  };
}

const secondExamQuestions: SecondExamQuestion[] = [
  {
    id: "114-criminal-1",
    year: 114,
    subject: "刑法與刑事訴訟法",
    number: "第一題",
    score: "100 分",
    stem: "企業家甲有意參與立法委員選舉，向選民 A 承諾若當選，將推薦 A 的兒子進入甲的企業工作。甲的員工乙為蒐集攻擊素材，偷拍競選對手丙與秘書丁在車內的私密活動並傳給甲。丙發現後開車追趕，丁不斷催促丙加速，丙在明知可能撞到用路人的情況下撞傷路人 B。丙、丁明知不救援 B 可能死亡，仍立即離開；半小時後丙返回，誤認 B 已死而將 B 載往樹林掩埋，B 最終因掩埋窒息死亡。翌日，甲將偷拍內容與虛假性影像合成，準備於選前散布。試問：甲、乙、丙、丁在刑法上應如何論處？",
    studentSample: `一、甲的刑責
甲向 A 表示當選後會推薦 A 的兒子工作，是用工作機會換取選票，工作機會屬於不正利益，因此甲可能成立投票行賄罪。甲知道乙要偷拍仍表示支持，應該也可能成立妨害秘密的幫助犯。甲後來合成假的性交影片準備散布，會侵害丙、丁名譽，但因尚未真正散布，應只成立未遂。

二、乙的刑責
乙在未經丙、丁同意下偷拍車內私密活動，車內屬於非公開場所，因此成立妨害秘密罪。乙又把檔案傳給甲，也可能成立散布性影像罪。

三、丙、丁的刑責
丙明知高速追逐可能撞到人仍繼續開車，對 B 的受傷具有不確定故意，成立傷害罪。丁一直催促丙加速，與丙有共同犯意，所以成立共同正犯。二人撞到 B 後沒有救助並離開，均成立肇事逃逸罪與遺棄罪。

四、丙掩埋 B
丙回來後以為 B 已死亡而把他掩埋，但 B 實際上因此窒息死亡。丙原本沒有要殺 B，只是想處理屍體，因此我認為成立過失致死罪。以上各罪應數罪併罰。`,
    sourceUrl: "https://news1.get.com.tw/File/News/77214.pdf",
    issuePreview: ["投票行賄：工作機會是否為不正利益、A 是否為有投票權人", "妨害秘密及影像犯罪", "共同正犯、幫助犯與故意", "遺棄、不作為及因果歷程錯誤"],
    teacherSolution: {
      label: "高點名師擬答",
      source: "114 年司法官／律師第二試解答",
      preview: "依甲、乙、丙、丁分段，處理投票行賄、性隱私犯罪、正共犯、交通事故逃逸、不作為與因果歷程錯誤。",
      fullText: `一、甲之刑責
甲向 A 承諾當選後推薦 A 之子進入企業工作，可能成立刑法第 144 條投票行賄罪。工作機會屬不正利益，並與 A 投票支持甲具有對價關係。雖利益形式上歸第三人，A 可能因此獲得免付生活費等間接利益，仍可認係對有投票權人行求不正利益。A 是否最終投票，不影響本罪成立。
甲表示支持乙偷拍構想，是否成立心理幫助，應以該表態是否實際強化乙犯意判斷；若僅屬原有犯意之單純贊同而未提高實行可能性，宜否定幫助犯。甲將影音與虛假性影像合成性交影片，應檢討製作不實性影像、未遂、誹謗及競合。

二、乙之刑責
乙貼近車輛錄下丙、丁性交聲音與車身震動。車外震動本身未必具合理隱私期待，但車內性交聲音經車窗等隔絕，仍屬非公開活動，成立刑法第 315 條之 1 第 2 款；若錄製時即意圖日後散布，並成立第 315 條之 2 第 2 項加重竊錄罪。
性交聲音與車震影像結合，客觀上足以引起性慾或羞恥，可能屬刑法第 10 條第 8 項性影像；未經同意攝錄且有散布意圖，成立第 319 條之 1 第 1、3 項。乙將檔案傳給特定人甲，不屬向不特定人或多數人散布，但可能成立供人觀覽性影像罪及洩漏電腦秘密罪。是否成立加重誹謗，須判斷影像與候選人、秘書及車震情境連結後，是否足以貶損名譽。

三、丙、丁之刑責
丙高速追逐並明知可能撞及用路人仍容任結果，對 B 之傷害至少具有不確定故意。丁不斷催促加速，是否與丙成立共同正犯，須判斷共同犯意及功能性行為支配；若欠缺行為支配，仍可能成立幫助犯。
事故後丙、丁明知 B 可能死亡仍離去，應檢討刑法第 185 條之 4 交通事故逃逸罪。丙因先前危險行為而具有救助義務；丁是否具有保證人地位，不能僅因同車或催促即直接肯定。
丙返現場時誤認 B 已死並予掩埋，B 實因掩埋窒息死亡。前後行為可否整體評價，涉及結果延後發生之因果歷程錯誤。若認先前殺人故意延續且實際死亡仍為同一風險歷程之實現，得成立殺人既遂；若將兩階段分離，則可能構成前行為未遂與後行為過失致死之競合。

四、競合
各行為成立之竊錄、性影像、秘密、名譽、傷害或殺人及逃逸罪，應依行為數、保護法益及構成要件關係，分別判斷法條競合、想像競合或數罪併罰。`,
      url: "https://news1.get.com.tw/File/News/77214.pdf",
    },
    course: {
      teacher: "智聖",
      title: "律師司法官刑法案例演習課程",
      format: "行動版・完整課程",
      reason: "直接對應本題命中的性影像、正共犯、故意事故與因果歷程爭點。",
      url: "https://ec.ibrain.com.tw/book.asp?BKID=17984",
    },
    examHits: [
      { issue: "刑法 §315-1 非公開之判斷", material: "高點【司律二試狂作題班】刑法試題解答", lesson: "第七回・智聖編撰", pages: "正式解答命中", productUrl: "https://ec.ibrain.com.tw/book.asp?BKID=17984" },
      { issue: "刑法 §10 Ⅷ④ 性影像之判斷", material: "高點【司律二試狂作題班】刑法試題解答", lesson: "第七回・智聖編撰", pages: "正式解答命中", productUrl: "https://ec.ibrain.com.tw/book.asp?BKID=17984" },
      { issue: "性影像是否增添合理隱私期待要素", material: "高點【司律二試狂作題班】刑法試題解答", lesson: "第七回・智聖編撰", pages: "正式解答命中", productUrl: "https://ec.ibrain.com.tw/book.asp?BKID=17984" },
      { issue: "外流性影像的刑法評價", material: "高點【司律二試狂作題班】刑法試題解答", lesson: "第七回・智聖編撰", pages: "正式解答命中", productUrl: "https://ec.ibrain.com.tw/book.asp?BKID=17984" },
      { issue: "故意發生交通事故之評價", material: "高點【司律二試狂作題班】刑法試題解答", lesson: "第六回・智聖編撰", pages: "正式解答命中", productUrl: "https://ec.ibrain.com.tw/book.asp?BKID=17984" },
      { issue: "己手犯之法律效果", material: "高點【司律二試狂作題班】刑法試題解答", lesson: "第六回・智聖編撰", pages: "正式解答命中", productUrl: "https://ec.ibrain.com.tw/book.asp?BKID=17984" },
    ],
  },
  {
    id: "114-criminal-procedure-2",
    year: 114,
    subject: "刑法與刑事訴訟法",
    number: "第二題",
    score: "100 分",
    stem: "甲在醫院竊取醫師乙的名牌包後，到停車場一部四面車門大開的汽車後座睡覺，名牌包置於駕駛座。警察丙依監視器與乙指認找到甲，先伸手進車內扣押名牌包，再喚醒逮捕甲。案件 1 經檢察官給予附命治療之一年緩起訴；緩起訴期間甲另涉搶奪案件 2，案件 1 因而遭撤銷緩起訴並起訴。案件 2 一審以甲欠缺責任能力判無罪並諭知監護五年；甲僅就監護處分上訴，二審維持無罪及監護，並依職權命以顯不相當價格取得名錶的丁參與沒收程序後沒收名錶。試問：（一）警察扣押是否合法？（二）二審判決是否合法？（三）案件 1 應如何裁判？",
    studentSample: `（一）警察扣押名牌包合法
名牌包放在駕駛座，從車外即可看見，屬於一目了然之物，而且警察已經從監視器及乙的指認確認這是贓物。為避免證據滅失，警察可以直接扣押，不必先取得搜索票。

（二）二審判決部分違法
甲只針對監護處分上訴，依不告不理原則，二審不應該再審理無罪部分。不過名錶是犯罪所得，法院本來就可以依職權沒收，所以通知丁參與程序後沒收名錶，應該合法。

（三）案件 1 應繼續審理
甲在緩起訴期間又涉及案件 2，檢察官可以撤銷案件 1 的緩起訴。雖然案件 2 最後判無罪，但撤銷當時甲確實另涉犯罪，因此不影響原撤銷效力，法院應就案件 1 進行實體判決。`,
    sourceUrl: "https://news1.get.com.tw/File/News/77214.pdf",
    issuePreview: ["無令狀搜索與扣押", "一目了然原則的前提", "第二審上訴範圍", "第三人沒收程序", "撤銷緩起訴的效力"],
    teacherSolution: {
      label: "高點名師擬答",
      source: "114 年司法官／律師第二試解答",
      preview: "依三小題分別處理搜索扣押、二審上訴與沒收，以及撤銷緩起訴後再起訴的裁判。",
      fullText: `一、名牌包之扣押違法
名牌包屬得為證據之物，亦可能是不法利得沒收物。警察將手伸入車內，係實質物理侵入有形空間，屬搜索行為；警察並無搜索票，當時亦尚未拘捕甲，不能主張附帶搜索，且欠缺緊急搜索或同意搜索事由。後續扣押亦欠缺扣押裁定或合法無令狀扣押依據。即使名牌包一目了然，附帶扣押仍以先前進入或搜索合法為前提，故搜索及扣押均屬違法。

二、第二審判決程序合法
甲雖僅就監護處分上訴，但監護要件涉及責任能力等罪責事實，屬與論罪不可分之雙關事項，二審審理無罪與監護並無不告而理。名錶係丁以顯不相當對價取得之犯罪所得，丁為可能受沒收之第三人；沒收屬起訴犯罪事實效力所及之法律效果，法院得依第三人參與沒收程序規定，依職權命丁參與並保障其陳述權，二審所為程序合法。

三、案件 1 應諭知不受理
撤銷緩起訴所依據之案件 2 最終為無罪，實務上宜目的性限縮撤銷事由，使其限於最終受有罪判決之情形。該撤銷不生效力，原緩起訴仍存在。案件 1 於緩起訴期間尚未屆滿時即起訴，應依刑事訴訟法第 303 條第 1 款，以起訴程序違背規定而諭知不受理。`,
      url: "https://news1.get.com.tw/File/News/77214.pdf",
    },
    course: {
      teacher: "高點刑事訴訟法師資",
      title: "刑事訴訟法爭點解讀",
      format: "高點文化・郭律師",
      reason: "適合補強強制處分、上訴審範圍與沒收特別程序的體系整合。",
      url: "https://publish.get.com.tw/Book.asp?BKID=20059",
    },
    examHits: [
      { issue: "搜索、扣押與無令狀強制處分", material: "刑事訴訟法爭點解讀", lesson: "搜索扣押章", pages: "9-1～10-22", productUrl: "https://publish.get.com.tw/Book.asp?BKID=20059" },
      { issue: "第二審上訴範圍與第三人沒收", material: "刑事訴訟法爭點解讀", lesson: "上訴審／沒收程序", pages: "24-1～24-55；28-5～30-12", productUrl: "https://publish.get.com.tw/Book.asp?BKID=20059" },
      { issue: "撤銷緩起訴後再行起訴", material: "刑事訴訟法爭點解讀", lesson: "緩起訴章", pages: "21-1～21-15", productUrl: "https://publish.get.com.tw/Book.asp?BKID=20059" },
    ],
  },
  {
    id: "114-public-law-1",
    year: 114,
    subject: "憲法與行政法",
    number: "第一題",
    score: "100 分",
    stem: "甲藥商因刊登未經核准之藥物廣告受罰，主張藥事法第 66 條第 1 項事前核准規定違憲。藥師乙並非藥商，卻持續在同一網路媒體刊播相同藥物廣告；主管機關先後要求停止後，仍對乙分段及連續按日裁處共 8 次罰鍰。試問：（一）甲可主張事前核准規定違憲的理由；（二）禁止非藥商刊播藥物廣告是否違反平等原則；（三）依目前實務見解，乙的刊播行為可否分別處罰 8 次？",
    studentSample: `（一）藥物廣告事前核准違憲
藥物廣告也是一種言論，受憲法第 11 條言論自由保障。要求刊登前必須取得主管機關核准，屬於事前審查，限制非常嚴格。雖然政府是為了保護人民健康，但仍可用事後處罰方式處理，不必全面事前禁止，因此違反比例原則。

（二）違反平等原則
藥商可以刊登藥物廣告，藥師卻完全不能刊登，二者都是具有藥品專業的人，沒有合理理由作不同待遇，所以違反憲法第 7 條平等原則。

（三）不能處罰八次
乙是在同一個網站持續刊登同一則廣告，應該算是一個行為。主管機關把它切成八次處罰，會違反一事不二罰原則，因此最多只能處罰一次。`,
    sourceUrl: "https://news1.get.com.tw/File/News/77215.pdf",
    issuePreview: ["商業言論的事前審查", "變更憲法裁判的必要", "藥商與藥師的平等審查", "廣告行為數認定", "一行為不二罰"],
    teacherSolution: {
      label: "高點名師擬答",
      source: "114 高點司律二試・憲法與行政法全套詳解",
      preview: "以釋字第 414、744 號、112 年憲判字第 17 號、釋字第 604 號及最高行政法院聯席會議決議，完成三小題的憲法與行政法論證。",
      fullText: `一、藥物廣告事前核准規定違憲
釋字第 414 號雖曾認藥物廣告事前審查合憲，但距今已久，傳播科技、媒體型態及社會生活均有重大變化，得主張已有重新判斷之必要。藥事法要求刊播前申請核准，構成言論自由之事前限制。依釋字第 744 號意旨，事前審查須為防免人民生命、身體、健康遭受直接、立即且難以回復之危害，手段與目的間並須具直接及絕對必要關聯，且應提供立即司法救濟。藥物廣告尚未直接、立即危害健康，並可透過藥商資格審查、抽查、事後處罰及命停止等較小侵害手段處理，系爭規定不符嚴格標準。

二、全面禁止藥師刊播藥物廣告違反平等原則
藥商與非藥商受到差別待遇，並涉及商業言論，宜採中度審查。維護國民健康雖屬重要公益，但藥師具備藥學專業且依法得執行藥品業務，由藥師提供適當藥品資訊未必不利健康，也欠缺實證證明准許藥師刊播必然造成不當廣告。全面禁止藥師刊播與維護健康目的間欠缺實質關聯，於此範圍違反平等原則。

三、將乙認定為 8 次刊播並連續處罰無理由
廣告屬集合性概念；依最高行政法院 105 年 10 月份第 1 次庭長法官聯席會議決議，行為人出於單一意思，在同一媒體持續刊播相同廣告，原則上應評價為一行為，至主管機關作成裁處時始切斷行為單一性。乙在同一網路媒體密集持續刊播，先前兩次書面要求停止不當然切斷單一性，主管機關在首次裁處前分成三次處罰，違反一行為不二罰。藥事法又無得連續舉發、按日處罰之特別規定，不能以處罰次數反推行為次數，後續連續按日五次裁罰亦無理由。`,
      url: "https://news1.get.com.tw/File/News/77215.pdf",
    },
    course: {
      teacher: "項勻",
      title: "司律總複習・憲法課程",
      format: "波斯納二試總複習",
      reason: "適合補強商業言論、平等權審查與憲法裁判引用的申論架構。",
      url: "https://ec.ibrain.com.tw/publish/www/book.asp?bkid=18527",
    },
    examHits: [
      { issue: "第一小題：藥物廣告事前審查", material: "高點【司律總複習】憲法講義", lesson: "第二回・項勻編撰", pages: "71～72", productUrl: "https://ec.ibrain.com.tw/publish/www/book.asp?bkid=18527" },
      { issue: "第二小題：藥師與藥商的平等審查", material: "高點【司律總複習】憲法講義", lesson: "第一回・項勻編撰", pages: "67", productUrl: "https://ec.ibrain.com.tw/publish/www/book.asp?bkid=18527" },
      { issue: "第二小題：平等原則與商業言論", material: "高點【司律總複習】憲法講義", lesson: "第二回・項勻編撰", pages: "48～49", productUrl: "https://ec.ibrain.com.tw/publish/www/book.asp?bkid=18527" },
    ],
  },
];

function cleanImportedExamText(value: string) {
  return value
    .replace(/\s*【高點法[律律]專班】(?:\s*114\s*高點司律一試[‧・．·]\s*全套詳解\s*\d+)?\s*/gu, " ")
    .replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, "")
    .replace(/\s+([，。；：！？、])/gu, "$1")
    .replace(/([（「『])\s+/gu, "$1")
    .replace(/\s+([）」』])/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

const firstExamQuestions = (firstExamQuestionsData as OfficialQuestion[]).map((question) => ({
  ...question,
  stem: cleanImportedExamText(question.stem),
  options: Object.fromEntries(
    Object.entries(question.options).map(([label, text]) => [label, cleanImportedExamText(text)]),
  ) as OfficialQuestion["options"],
}));

const historicalCriminalGuides: IssueSpottingQuestion[] = firstExamQuestions
  .filter((item) => item.subject_group.includes("刑法"))
  .slice(0, 10)
  .map((item) => {
    const labels = ["A", "B", "C", "D"] as const;
    const correctIndex = Math.max(0, labels.indexOf(item.correct_answer ?? "A"));
    const profiles: Record<number, {
      topic: string;
      issue: string;
      keyFact: string;
      rule: string;
      application: string;
      explanation: string;
      demonstration: string;
      conclusion: string;
      alternativeConclusions: [string, string, string];
    }> = {
      1: {
        topic: "刑法總則｜錯誤論",
        issue: "因果歷程錯誤與故意既遂如何判斷",
        keyFact: "行為人誤認被害人已死，實際死亡發生於後續掩埋行為",
        rule: "比較行為人所認知與實際發生的因果歷程，判斷偏離是否重大到排除故意既遂",
        application: "緊勒與掩埋均在同一殺人歷程內，實務將死亡結果整體歸責於行為人的殺人故意",
        explanation: "本題同時測驗因果歷程錯誤、擇一故意與不確定故意；B 才符合實務對結果延後發生案例的整體評價。",
        demonstration: "甲以殺人故意緊勒乙，誤認乙死亡後再予掩埋，乙最終因掩埋窒息死亡。依實務見解，前後行為屬同一殺人歷程，實際死亡方式的偏離不影響故意既遂，因此仍成立殺人既遂罪。",
        conclusion: "甲就乙的死亡成立殺人既遂罪",
        alternativeConclusions: ["甲僅成立殺人未遂罪", "甲成立殺人未遂罪與過失致死罪", "甲僅成立過失致死罪"],
      },
      2: {
        topic: "刑法總則｜被害人承諾",
        issue: "未成年人承諾與推測承諾的適用界線",
        keyFact: "17 歲甲已明示同意刺青，乙是依該明示同意施作",
        rule: "被害人承諾能力不等同民法行為能力；已有明示意思時，不以推測承諾取代",
        application: "甲已實際表示同意，乙不能改以欠缺真實承諾時才適用的推測承諾作為阻卻違法依據",
        explanation: "核心不是未成年人一律無身體處分權，也不是刺青當然屬重傷，而是明示承諾與推測承諾的關係。",
        demonstration: "甲雖為未成年人，但是否具有承諾能力應依其對侵害意義與結果的理解能力判斷，不能直接套用民法行為能力。又甲已明示同意刺青，並無以推測意思補充真實承諾的空間，因此乙不得主張推測承諾。",
        conclusion: "甲已有明示同意，乙不得另以推測承諾阻卻違法",
        alternativeConclusions: ["甲未滿十八歲，其承諾一律無效", "刺青必然構成重傷害，任何承諾均無效", "乙可同時主張明示承諾與推測承諾"],
      },
      3: {
        topic: "刑法總則｜罪刑法定",
        issue: "罪刑法定原則各項派生原則的界線",
        keyFact: "題目要求分辨類推、習慣法、從舊從輕與刑罰明確性",
        rule: "不利於行為人的類推適用受禁止；有利類推不受此禁止",
        application: "A 將禁止類推限定於不利行為人的情形，符合罪刑法定原則的保障方向",
        explanation: "罪刑法定保障人民免受未經法律預告的不利益，有利於行為人的類推並不牴觸其核心目的。",
        demonstration: "罪刑法定原則禁止以類推方式創設或擴張犯罪與刑罰，重點在防止國家對行為人施加未經法律預告的不利益。因此，不利類推原則禁止；有利於行為人的類推則不在禁止範圍內。",
        conclusion: "罪刑法定原則禁止不利於行為人的類推，但不禁止有利類推",
        alternativeConclusions: ["任何類推適用均違反罪刑法定原則", "習慣法得直接創設犯罪與刑罰", "行為後的新法一律優先適用"],
      },
      4: {
        topic: "刑法分則｜事故逃逸與義務衝突",
        issue: "救助義務衝突是否影響事故逃逸罪成立",
        keyFact: "雙人座車無法同時載送重傷母親乙與僅擦傷的丙，甲選擇先救治乙",
        rule: "分別審查逃逸行為與故意，再判斷相衝突的救助義務能否阻卻違法",
        application: "甲明知事故與丙受傷仍離開現場，可能具逃逸故意；優先救治生命危險的乙則另屬義務衝突判斷",
        explanation: "正確答案要求選出錯誤敘述。不能因甲有救母動機，就直接否定其對離開事故現場的認識與意欲。",
        demonstration: "甲明知已發生交通事故且丙受傷，仍駕車離開現場，不能僅因其目的在救治乙便否定逃逸故意。惟車輛僅有雙人座且乙有生命危險，甲可能主張優先履行較高位階救助義務的義務衝突。故稱甲欠缺逃逸故意並不正確。",
        conclusion: "甲可能主張義務衝突，但不能因此逕認其欠缺逃逸故意",
        alternativeConclusions: ["甲因救母動機而當然欠缺逃逸故意", "甲不得主張任何阻卻違法事由", "丙傷勢較輕，因此事故逃逸罪當然不成立"],
      },
      5: {
        topic: "刑法總則｜責任能力",
        issue: "責任能力的生理原因與心理判斷如何區分",
        keyFact: "刑法第 19 條同時涉及精神障礙或心智缺陷，以及辨識、控制能力",
        rule: "專業鑑定主要協助判斷生理原因；心理能力及法律效果仍由法院判斷",
        application: "把辨識與控制能力本身說成生理原因，並全交由鑑定人決定，混淆鑑定與法院職權",
        explanation: "D 將心理層面的辨識、控制能力誤稱為生理原因，且忽略法院對責任能力的最終判斷權。",
        demonstration: "精神障礙或心智缺陷屬生理原因，通常需借助專業鑑定；能否辨識違法及依辨識而行為則是心理層面的法律判斷。鑑定意見不能取代法院的最終判斷，因此 D 的敘述錯誤。",
        conclusion: "責任能力的法律判斷仍由法院作成，鑑定意見不能取代法院",
        alternativeConclusions: ["責任能力完全由鑑定人決定", "辨識與控制能力屬純粹生理原因", "只要有精神障礙即當然無責任能力"],
      },
      6: {
        topic: "刑法總則｜未遂與客體錯誤",
        issue: "未遂階段與打擊錯誤的法律效果",
        keyFact: "第一次到村長家時車不在；第二次丟石塊未中村長車，卻毀損乙車",
        rule: "先判斷各行為是否著手，再依具體符合說處理打擊錯誤及過失結果",
        application: "對村長車的毀損未遂不罰；對乙車僅有過失，而毀損罪亦不罰過失",
        explanation: "本題須分開評價兩段行為；依題目採取的結論，甲最終不成立可罰的毀損犯罪。",
        demonstration: "甲第一次尚未接近可立即破壞村長車的階段，且毀損罪不罰未遂。第二次雖向村長車丟石塊，但實際毀損乙車；對乙車僅有過失，而毀損罪不處罰過失。因此依本題答案，甲不成立犯罪。",
        conclusion: "甲不成立可罰的毀損犯罪",
        alternativeConclusions: ["甲成立毀損既遂罪", "甲成立毀損未遂罪", "甲成立過失毀損罪"],
      },
      7: {
        topic: "刑法分則｜妨害秩序罪",
        issue: "刑法第 150 條聚集要件與秩序危害程度",
        keyFact: "題目分別檢驗聚集、攜帶兇器加重、秩序危害與主觀故意",
        rule: "聚集不以成員可隨時增加為必要，仍須實質審查是否危害公共秩序安寧",
        application: "A 將『僅結合特定之人』一律排除於聚集之外，過度限縮構成要件",
        explanation: "第 150 條重點在多人在公共場所或公眾得出入場所施強暴脅迫並危害秩序，不以開放加入型集合為唯一形式。",
        demonstration: "刑法第 150 條的聚集要件，不能僅因參與者是特定人即一律排除，仍應依人數、場所、行為態樣及秩序危害程度判斷。因此 A 對聚集概念的限制過窄，屬錯誤敘述。",
        conclusion: "特定人結合仍可能構成刑法第 150 條的聚集，應實質判斷秩序危害",
        alternativeConclusions: ["僅特定人參與即絕不構成聚集", "只要三人以上在場即當然成立本罪", "是否危害公共秩序與本罪無關"],
      },
      8: {
        topic: "刑法總則｜身分犯與共同正犯",
        issue: "無公務員身分者參與收賄的共同犯罪責任",
        keyFact: "乙雖非公務員，仍與公務員甲共同收受賄賂並促成違背職務行為",
        rule: "依刑法第 31 條，無特定身分者與有身分者共同實行身分犯，仍得成立共同犯罪",
        application: "乙作為白手套出面收賄，與具有公務員身分的甲共同實現收賄犯罪",
        explanation: "非公務員身分不當然排除共犯責任；應依身分犯共同犯罪規定處理。",
        demonstration: "收受賄賂罪雖以公務員身分為要件，但乙明知並參與甲違背職務收賄的犯罪計畫，且實際出面收款。依身分犯共同犯罪規定，乙仍得與甲成立公務員收受賄賂罪的共同犯罪。",
        conclusion: "乙雖無公務員身分，仍得與甲成立收受賄賂罪的共同犯罪",
        alternativeConclusions: ["乙因無公務員身分而必然無罪", "乙僅成立幫助犯，不可能成立共同正犯", "身分犯一律不得成立共同犯罪"],
      },
      9: {
        topic: "刑法總則｜數罪併罰",
        issue: "有期徒刑、褫奪公權、罰金與沒收如何定執行",
        keyFact: "四罪分別宣告主刑、從刑與沒收，須依不同種類法律效果分別計算",
        rule: "有期徒刑依法定上限定應執行刑；褫奪公權取最長期；罰金依法定規則合併；沒收併執行",
        application: "有期徒刑不得逾 30 年且本題定為 25 年；褫奪公權取 5 年，罰金為 35 萬元，犯罪所得合計 150 萬元",
        explanation: "不能把各項法律效果都用單純相加處理；B 才同時符合不同刑種及沒收的執行規則。",
        demonstration: "數罪併罰時，不同刑種須分別依刑法規則處理。有期徒刑在各刑中最長期以上、合併刑期以下定之並受上限拘束；褫奪公權執行最長期間；罰金及沒收依其規則處理。依題示計算，B 所列結果符合規定。",
        conclusion: "各刑種與沒收應分別依其法定規則定執行，不得全部單純相加",
        alternativeConclusions: ["所有主刑、從刑與沒收均應直接相加", "只定有期徒刑，其餘法律效果全部吸收", "褫奪公權與沒收均不得併執行"],
      },
      10: {
        topic: "刑法總則｜自首",
        issue: "裁判上一罪中部分犯罪已發覺時，其他部分能否自首",
        keyFact: "警方只先發覺侵占，販賣毒品是甲主動供出後才開始偵辦",
        rule: "判斷偵查機關是否已知悉特定犯罪事實與行為人，不因裁判上一罪即一律視為全部已發覺",
        application: "販賣毒品部分原未被發覺，甲主動供述使偵查機關首次知悉犯罪全貌",
        explanation: "依實務見解，想像競合的一部分先被發覺，不妨礙行為人就尚未發覺的其他犯罪部分成立自首。",
        demonstration: "警方原先僅發覺甲侵占毒品，對販賣第三級毒品的事實尚不知悉。甲在該部分未被發覺前主動供出，使偵查機關得知完整犯罪事實，依實務見解仍可就販毒部分成立自首。",
        conclusion: "甲就尚未被發覺的販毒部分仍得成立自首",
        alternativeConclusions: ["侵占部分被發覺後，販毒部分即絕無自首可能", "裁判上一罪只能整體成立或不成立自首", "甲僅因到案陳述即當然成立全部犯罪的自首"],
      },
    };
    const profile = profiles[item.number];
    const originalOptions = labels.map((label) => item.options[label]);
    const issueOptions = [
      profile.issue,
      "只比較各選項文字長短，不必確認法律要件",
      "先決定刑度，再回頭尋找可能成立的罪名",
      "只要結果不公平，即可直接排除刑事責任",
    ];
    const ruleOptions = [
      profile.rule,
      "只依行為造成的最後結果判斷，不必審查主觀要件",
      "只要行為人有不良動機，即應選擇刑度最重的結論",
      "題目涉及實務見解時，得省略法條要件與事實涵攝",
    ];
    const factOptions = [
      profile.keyFact,
      "行為人的姓名、居住地與日常生活習慣",
      "題目未記載、須由考生自行補充的背景事實",
      "選項使用的標點符號與文字排列順序",
    ];
    const applicationOptions = [
      profile.application,
      "只要題目出現損害結果，即直接成立最重的結果犯",
      "只要行為人事後有所說明，即當然排除犯罪成立",
      "不必區分各行為階段及主觀認知，全部視為同一法律效果",
    ];
    return {
      domain: "刑法" as const,
      topic: profile.topic,
      prompt: item.stem,
      options: originalOptions,
      answer: correctIndex,
      keyFact: profile.keyFact,
      explanation: profile.explanation,
      sourceLabel: `${item.year} 年${item.exam_group}・第 ${item.number} 題`,
      sourceUrl: item.source_url,
      sourcePage: item.source_page,
      originalNumber: item.number,
      reviewLabel: "AI 拆解待老師審核",
      demonstration: profile.demonstration,
      guidedSteps: [
        { id: "issue", label: "辨識爭點", question: "這道歷屆題主要要求辨識哪個爭點？", options: issueOptions, answer: 0, explanation: profile.issue },
        { id: "rule", label: "選擇規則", question: "處理本題時，應採取哪一個判斷規則？", options: ruleOptions, answer: 0, explanation: profile.rule },
        { id: "fact", label: "抓關鍵事實", question: "題目中哪一組資訊最會影響答案？", options: factOptions, answer: 0, explanation: profile.keyFact },
        { id: "application", label: "完成涵攝", question: "下列哪一句最符合本題的涵攝方向？", options: applicationOptions, answer: 0, explanation: profile.application },
        {
          id: "conclusion",
          label: "形成結論",
          question: "依前述規則與涵攝，本題應得出哪一項法律結論？",
          options: [profile.conclusion, ...profile.alternativeConclusions],
          answer: 0,
          explanation: profile.conclusion,
        },
      ],
    };
  });

function toDemoQuestion(
  question: OfficialQuestion,
  lawScope: "刑法" | "公法",
): EssayDemoQuestion {
  const options = (["A", "B", "C", "D"] as const)
    .map((key) => `（${key}）${question.options[key]}`)
    .join("\n");

  return {
    id: `official-${lawScope}-${question.number}`,
    domain: "法律",
    lawScope,
    title: `114 年司律一試第 ${question.number} 題`,
    prompt: `${question.stem}\n${options}\n\n請先指出本題考點，再逐一分析各選項並提出答案。`,
    sourceLabel: "高點真實考古題",
    sourceNote: `114 年律師、司法官第一試｜${question.subject_group}｜第 ${question.number} 題`,
    resourceNote: "題目與答案取自已匯入的 114 年司律一試題庫；教材與課程須另行核對後才顯示。",
    officialAnswer: question.correct_answer ?? undefined,
  };
}

const criminalOfficialDemos = firstExamQuestions
  .filter((item) => item.subject_group.includes("刑法"))
  .slice(0, 10)
  .map((item) => toDemoQuestion(item, "刑法"));

const publicOfficialDemos = firstExamQuestions
  .filter((item) => item.subject_group.includes("憲法") || item.subject_group.includes("行政法"))
  .slice(0, 10)
  .map((item) => toDemoQuestion(item, "公法"));

const essayDemoQuestions: EssayDemoQuestion[] = [
  {
    id: "criminal-objective-imputation",
    domain: "法律",
    lawScope: "刑法",
    title: "客觀歸責｜超速與不可避免結果",
    prompt: "甲超速駕車，乙突然自天橋墜落至甲車正前方而死亡。依鑑定，即使甲遵守速限也無法避免碰撞。請分析甲是否應就乙的死亡負刑事責任。",
    sourceLabel: "教材改編測試題",
    sourceNote: "依《透明的刑法－總則編》客觀歸責章節改編，非歷屆真題。",
  },
  {
    id: "criminal-omission",
    domain: "法律",
    lawScope: "刑法",
    title: "不作為犯｜保證人地位與結果避免",
    prompt: "甲見其年幼子女在自家泳池溺水，明明有能力立即救助，卻故意放任其死亡。請依不純正不作為犯的完整要件，分析甲的刑事責任。",
    sourceLabel: "教材改編測試題",
    sourceNote: "依《透明的刑法－總則編》不作為犯章節改編，非歷屆真題。",
  },
  {
    id: "criminal-public-official",
    domain: "法律",
    lawScope: "刑法",
    title: "公務員身分｜里長受託督導社會勞動",
    prompt: "甲為里長，受檢察機關囑託協助督導社會勞動，卻不實登載執行時數。請分析甲在該行為中是否屬刑法第10條第2項所稱公務員。",
    sourceLabel: "實務案例改編測試題",
    sourceNote: "依最高法院 105 年度台上字第 1272 號案例爭點改編。",
  },
  {
    id: "public-ne-bis-in-idem",
    domain: "法律",
    lawScope: "公法",
    title: "一罪不二罰｜刑罰與行政裁罰",
    prompt: "同一行為已受刑事處罰後，主管機關又依行政法規裁處罰鍰。請以釋字第808號及一罪不二罰原則為中心，說明應如何判斷後續行政裁罰是否違憲。",
    sourceLabel: "教材爭點改編題",
    sourceNote: "依《2022年公法大數據・實務解讀》釋字第808號章節改編。",
  },
  {
    id: "public-divorce",
    domain: "法律",
    lawScope: "公法",
    title: "婚姻自由｜唯一有責配偶請求離婚",
    prompt: "民法限制唯一有責配偶請求裁判離婚，是否過度限制婚姻自由？請以112年憲判字第4號為核心，整理審查標準、違憲理由及判決效果。",
    sourceLabel: "憲法裁判改編題",
    sourceNote: "依《112憲法法庭裁判講堂》所收112年憲判字第4號改編。",
  },
  {
    id: "public-investigation",
    domain: "法律",
    lawScope: "公法",
    title: "權力分立｜立法院調查權界限",
    prompt: "立法院為行使調查權，要求政府機關與人民限期提供資料，並對不配合者設處罰。請從權力分立、正當法律程序及基本權保障分析其合憲界限。",
    sourceLabel: "憲法裁判改編題",
    sourceNote: "依《113憲法法庭裁判講堂》國會調查權相關裁判內容改編。",
  },
  {
    id: "accounting-sales-cogs",
    domain: "中級會計",
    title: "銷貨淨額與銷貨成本反推",
    prompt: "台中公司X2年顧客以現金償還帳款570,000元、公司以現金支付貨款390,000元。X1年底與X2年底應收帳款分別為90,000元、67,500元；存貨為147,000元、187,500元；應付帳款為97,500元、120,000元。請計算X2年度銷貨淨額與銷貨成本，並列示計算過程。",
    sourceLabel: "授權申論教材題",
    sourceNote: "來源：《中級會計學申論題完全制霸》第一章第3頁。",
  },
  {
    id: "accounting-cash-flow",
    domain: "中級會計",
    title: "直接法營業活動現金流量",
    prompt: "甲公司本期銷貨收入480,000元、銷貨成本360,000元、營業費用68,000元（含折舊22,000元）、利息費用4,000元、所得稅費用14,000元；應收帳款增加12,000元、存貨增加6,000元、應付帳款減少14,000元、應付所得稅減少10,000元。請以直接法計算營業活動現金流量並說明各項調整。",
    sourceLabel: "授權申論教材題",
    sourceNote: "來源：《中級會計學申論題完全制霸》第一章。",
  },
  {
    id: "accounting-fair-value",
    domain: "中級會計",
    title: "公允價值與交易成本",
    prompt: "請說明公允價值是否應扣除出售資產時的交易成本，並比較公允價值、使用價值與歷史成本的基本差異。",
    sourceLabel: "授權題庫改編題",
    sourceNote: "依《會研所中級會計學題庫制霸》衡量基礎題組改編。",
  },
  {
    id: "accounting-payable",
    domain: "中級會計",
    title: "在途商品與應付帳款認列",
    prompt: "公司於期末賒購一批仍在途的商品。請分別就起運點交貨與目的地交貨條件，分析買方何時應認列存貨及應付帳款，並說明控制移轉的判斷。",
    sourceLabel: "授權解題教材改編題",
    sourceNote: "依《泓觀稱霸中級會計學114年解題全攻略》初等考試題組改編。",
  },
];

const accountingOfficialDemos: EssayDemoQuestion[] = [
  {
    id: "accounting-ntu-113-fair-value",
    domain: "中級會計",
    title: "公允價值是否扣除交易成本",
    prompt: "以下關於財務報表要素衡量基礎的敘述，何者錯誤？請判斷各選項並說明公允價值、使用價值與歷史成本的差異：\n（A）歷史成本包含支付對價加交易成本\n（B）使用價值及履約價值皆為現時價值\n（C）使用價值是預期使用及最終處分所生效益的現值\n（D）公允價值應減除賣出交易成本",
    sourceLabel: "真實考古題",
    sourceNote: "113 年臺灣大學會計研究所｜收錄於《會研所中級會計學題庫制霸》第一章",
    resourceNote: "高點授權題庫與解答已接入；可再對應會研所課程與相關章節。",
  },
  {
    id: "accounting-ccu-113-supplies",
    domain: "中級會計",
    title: "期末用品調整分錄",
    prompt: "Civil Inc. 於 2023 年 1 月 1 日購買辦公用品 $5,000 並列為資產，年底盤點尚餘 $2,000。請作調整分錄，並說明對 2023 年 12 月 31 日資產負債表的影響。",
    sourceLabel: "真實考古題",
    sourceNote: "113 年中正大學會計研究所｜《會研所中級會計學題庫制霸》第一章",
    resourceNote: "高點授權題庫與解答已接入。",
  },
  {
    id: "accounting-ntu-112-depreciation",
    domain: "中級會計",
    title: "折舊政策與資訊品質",
    prompt: "大甲公司選擇折舊政策的目標之一，是使每年提列的折舊費用低於一定金額或百分比。請分析此政策可能違反何種財務報表品質特性，並說明理由。",
    sourceLabel: "真實考古題",
    sourceNote: "112 年臺灣大學會計研究所｜《會研所中級會計學題庫制霸》第一章",
    resourceNote: "高點授權題庫與解析已接入。",
  },
  {
    id: "accounting-ntu-110-discontinued",
    domain: "中級會計",
    title: "停業單位損益",
    prompt: "甲公司 X1 年 8 月 1 日決定處分實體零售部門，12 月 20 日以 $300,000 出售；淨資產帳面價值 $270,000。1 月 1 日至 8 月 1 日稅前營業損失 $25,000，8 月 1 日至 12 月 20 日稅前營業損失 $7,500，所得稅率 20%。請計算 X1 年停業單位損益。",
    sourceLabel: "真實考古題",
    sourceNote: "110 年臺灣大學會計研究所｜《會研所中級會計學題庫制霸》第二章",
    resourceNote: "高點授權題庫與完整計算解答已接入。",
  },
  {
    id: "accounting-nccu-104-oci",
    domain: "中級會計",
    title: "其他綜合損益列報",
    prompt: "甲公司持有指定透過其他綜合損益按公允價值衡量之債務工具，X2 年出售一半並持有剩餘部分。請說明本期新增利益、重分類調整及所得稅效果應如何列入其他綜合損益。",
    sourceLabel: "真實考古題",
    sourceNote: "104 年政治大學會計研究所改編｜《會研所中級會計學題庫制霸》第二章",
    resourceNote: "高點授權題庫與報表格式解答已接入。",
  },
  {
    id: "accounting-scu-107-current-ratio",
    domain: "中級會計",
    title: "流動比率與權益總額",
    prompt: "已知公司現金、存貨、預付廣告、用品、短期應付票據、應付利息、應付所得稅與應付薪資等科目。請說明流動資產與流動負債的分類原則，計算流動比率，並以會計恆等式反推權益總額。",
    sourceLabel: "真實考古題",
    sourceNote: "107 年東吳大學會計研究所｜《會研所中級會計學題庫制霸》第二章第 34 題",
    resourceNote: "高點授權題庫與完整數值解答已接入。",
  },
  {
    id: "accounting-scu-104-income",
    domain: "中級會計",
    title: "損益表與保留盈餘",
    prompt: "Wang Corporation 提供銷貨、進貨折扣、期初期末存貨、營業費用、停業單位損失及所得稅等資料。請依序計算銷貨毛利、營業利益、繼續營業單位淨利、本期淨利及期末保留盈餘。",
    sourceLabel: "真實考古題",
    sourceNote: "104 年東吳大學會計研究所｜《會研所中級會計學題庫制霸》第二章第 36 題",
    resourceNote: "高點授權題庫、完整損益表及保留盈餘表解答已接入。",
  },
  {
    id: "accounting-ncku-103-revaluation",
    domain: "中級會計",
    title: "土地重估與累積其他綜合損益",
    prompt: "公司持有四筆土地，部分於年度中出售，並採出售前先重估、出售時將累積其他綜合損益轉入保留盈餘的政策。請計算本年度其他綜合損益及轉入保留盈餘的金額。",
    sourceLabel: "真實考古題",
    sourceNote: "103 年成功大學會計研究所｜《會研所中級會計學題庫制霸》第二章",
    resourceNote: "高點授權題庫與逐筆土地計算解答已接入。",
  },
  {
    id: "accounting-ntu-108-discontinued",
    domain: "中級會計",
    title: "出售停業單位",
    prompt: "甲公司 X4 年 1 月 1 日決定處分一單獨主要業務單位，5 月 1 日出售。處分前營業淨利 $38,000，資產帳面金額 $647,000，售價 $515,000；不考慮所得稅。請計算停業單位損失並列示過程。",
    sourceLabel: "真實考古題",
    sourceNote: "108 年臺灣大學會計研究所｜《會研所中級會計學題庫制霸》第二章第 32 題",
    resourceNote: "高點授權題庫與計算解答已接入。",
  },
  {
    id: "accounting-ntu-110-puttable-bond",
    domain: "中級會計",
    title: "可賣回公司債分類",
    prompt: "甲公司 X1 年發行 5 年期可賣回公司債，持有人於 X3 年及 X4 年特定日期有權按面額賣回。請分析公司在 X2 年底應將該公司債列為流動或非流動負債，並說明判斷時點。",
    sourceLabel: "真實考古題",
    sourceNote: "110 年臺灣大學會計研究所｜《會研所中級會計學題庫制霸》第二章第 27 題",
    resourceNote: "高點授權題庫與解析已接入。",
  },
];

const displayedEssayDemoQuestions = [
  ...criminalOfficialDemos,
  ...publicOfficialDemos,
];

const evidence: Evidence[] = [
  {
    id: 1,
    subject: "法律",
    lawScope: "刑法",
    title: "透明的刑法－總則編",
    sourceId: "51ML105907",
    type: "教科書",
    edition: "第 8 版",
    chapter: "第十一章｜純正與不純正不作為犯",
    page: 287,
    tags: ["不作為犯", "純正不作為犯", "不純正不作為犯", "保證人地位", "作為義務", "等價性"],
    text: "不作為犯應先區分純正不作為犯與不純正不作為犯。純正不作為犯依個別法條規定判斷；不純正不作為犯才須進一步審查保證人地位、客觀防止可能性、結果避免可能性、作為等價性、結果歸責，以及故意或過失。",
    externalLlmAllowed: true,
    purchaseUrl: "https://publish.get.com.tw/book.asp?BKID=20266",
  },
  {
    id: 2,
    subject: "法律",
    lawScope: "刑法",
    title: "透明的刑法－總則編",
    sourceId: "51ML105907",
    type: "教科書",
    edition: "第 8 版",
    chapter: "第二篇第三章｜因果關係與客觀歸責",
    page: 154,
    tags: ["客觀歸責", "風險實現", "容許風險", "因果關係"],
    text: "客觀歸責的判斷，應先確認行為是否製造法所不容許的風險，再判斷該風險是否在具體結果中實現。僅有條件因果關係，並不足以直接肯定結果歸責。",
    externalLlmAllowed: true,
    purchaseUrl: "https://publish.get.com.tw/book.asp?BKID=20266",
  },
  {
    id: 3,
    subject: "法律",
    lawScope: "刑法",
    title: "透明的刑法－分則編",
    sourceId: "51ML106007",
    type: "教科書",
    edition: "第 6 版",
    chapter: "公務員犯罪｜身分公務員",
    page: 412,
    tags: ["公務員", "里長", "身分公務員", "公共事務"],
    text: "里長是否為刑法上的公務員，不宜只依職稱判斷。應進一步確認其當時執行的事項，是否屬於依法令從事公共事務，及該事務是否具有法定職務權限。",
    externalLlmAllowed: true,
    purchaseUrl: "https://publish.get.com.tw/Book.asp?BKID=19869",
  },
  {
    id: 4,
    subject: "法律",
    lawScope: "刑法",
    title: "透明的刑法解題書",
    sourceId: "51ML107105",
    type: "解題書",
    edition: "2026 年版",
    chapter: "第二篇｜犯罪成立要件",
    page: 96,
    tags: ["客觀歸責", "申論架構", "風險升高"],
    text: "申論作答時，先以條件理論處理因果關係，再依序檢驗不容許風險、風險實現與構成要件效力範圍，較能清楚呈現客觀歸責的論證層次。",
    externalLlmAllowed: true,
    purchaseUrl: "https://publish.get.com.tw/book.asp?BKID=20279",
  },
  {
    id: 10,
    subject: "法律",
    lawScope: "公法",
    title: "2022 年公法大數據・實務解讀",
    sourceId: "59ML130301",
    type: "教科書",
    edition: "2022 年版",
    chapter: "主題一｜釋字第 808 號：一罪不二罰與量的差別說",
    page: 22,
    tags: ["公法", "憲法", "行政法", "一罪不二罰", "釋字808", "行政罰"],
    text: "本章從釋字第 808 號整理一罪不二罰、刑罰與行政裁罰的關係，以及行政罰法第 24 至 26 條的整合考點。",
    externalLlmAllowed: false,
    purchaseUrl: "",
  },
  {
    id: 11,
    subject: "法律",
    lawScope: "公法",
    title: "2023 年公法大數據・憲法法庭裁判講堂",
    sourceId: "公法大數據-2023",
    type: "教科書",
    edition: "2023 年版",
    chapter: "111 年憲法法庭判決｜逐則裁判與憲法訴訟",
    page: 1,
    tags: ["公法", "憲法", "憲法訴訟", "憲法法庭", "111年憲判字", "裁判講堂"],
    text: "本書以 111 年憲法法庭判決為主軸，整理憲法學總論、基本權、權力分立與憲法訴訟程序的實務發展。",
    externalLlmAllowed: false,
    purchaseUrl: "",
  },
  {
    id: 12,
    subject: "法律",
    lawScope: "公法",
    title: "公法大數據・112 憲法法庭裁判講堂",
    sourceId: "59ML130601",
    type: "教科書",
    edition: "2024 年版",
    chapter: "112 年憲法法庭判決｜逐則裁判講解",
    page: 10,
    tags: ["公法", "憲法", "憲法訴訟", "112年憲判字", "憲法法庭", "唯一有責配偶", "搜索律師事務所"],
    text: "112年憲判字第4號認為，限制唯一有責配偶請求裁判離婚原則上合憲；但若婚姻破綻已逾或持續相當期間，仍完全剝奪離婚機會而造成個案顯然過苛，即不符憲法第22條保障婚姻自由之意旨。",
    externalLlmAllowed: false,
    purchaseUrl: "",
  },
  {
    id: 13,
    subject: "法律",
    lawScope: "公法",
    title: "公法大數據・113 憲法法庭裁判講堂",
    sourceId: "59ML130701",
    type: "教科書",
    edition: "2025 年版",
    chapter: "113 年憲法法庭裁判｜熱議大講堂",
    page: 10,
    tags: ["公法", "憲法", "行政法", "憲法訴訟", "113年憲判字", "國會調查權", "比例原則", "假釋撤銷"],
    text: "全書逐則記錄 113 年憲法法庭裁判，另收最高行政法院大法庭裁定、裁判選輯與行政法院法律座談會。",
    externalLlmAllowed: false,
    purchaseUrl: "",
  },
  {
    id: 14,
    subject: "法律",
    lawScope: "公法",
    title: "公法大數據・111年憲法法庭裁判講堂",
    sourceId: "公法大數據-2023-111-2",
    type: "教科書",
    edition: "2023 年版",
    chapter: "111年憲判字第2號｜強制道歉案（二）",
    page: 1,
    tags: ["111年憲判字第2號", "111憲判2", "強制道歉案", "言論自由", "思想自由", "民法第195條"],
    text: "憲法法庭認為，民法第195條第1項後段的「回復名譽之適當處分」，不包括法院以判決命加害人道歉；強制公開道歉侵害言論自由，對自然人亦侵害思想自由。",
    externalLlmAllowed: false,
    purchaseUrl: "",
  },
  {
    id: 15,
    subject: "法律",
    lawScope: "公法",
    title: "憲法法庭 112 年憲判字第 6 號判決",
    sourceId: "CC-112-6",
    type: "判解",
    edition: "112 年 5 月 5 日",
    chapter: "軍事審判與普通法院判決歧異案",
    page: 1,
    tags: [
      "112年憲判字第6號",
      "112憲判6",
      "軍事審判",
      "訴訟權",
      "再審",
      "正當法律程序",
      "無罪推定",
      "罪疑唯輕",
    ],
    text: "本案涉及共同正犯分別由軍事法院與普通法院審判，主要證據相同，卻分別作成軍人有罪與非軍人無罪的確定判決。憲法法庭認為，軍事審判法第181條第5項僅許以判決違背法令為由向高等法院上訴，屬審級救濟制度的立法形成，尚未違反憲法第16條訴訟權。但對上述事實認定兩歧的特殊情形，基於法治國原則、無罪推定、罪證有疑利歸被告及正當法律程序的公平審判要求，應賦予受軍事法院有罪確定判決者聲請再審的機會；相關法律未設此救濟，與憲法第16條保障訴訟權的意旨未符。判決並准聲請人於判決送達後30日內聲請再審。",
    externalLlmAllowed: true,
    purchaseUrl: "https://cons.judicial.gov.tw/docdata.aspx?fid=38&id=310005",
  },
  {
    id: 5,
    subject: "中級會計",
    title: "中級會計學霸（上）",
    sourceId: "51MG023307",
    type: "教科書",
    edition: "全書",
    chapter: "第一章｜財務報導之觀念架構",
    page: 11,
    tags: ["會計定義", "財務報導", "觀念架構", "主要使用者"],
    text: "教材從會計定義與財務報導觀念架構建立基礎，適合用來回答主要使用者、財務資訊目的與基本觀念的問題。",
    externalLlmAllowed: false,
    purchaseUrl: "https://publish.get.com.tw/book.asp?BKID=20287",
  },
  {
    id: 6,
    subject: "中級會計",
    title: "中級會計學霸（下）",
    sourceId: "51MG023407",
    type: "教科書",
    edition: "全書",
    chapter: "第一節｜負債定義與分類",
    page: 6,
    tags: ["負債", "流動負債", "分類", "認列"],
    text: "教材依序處理負債的定義、認列與分類，可作為應付帳款、流動負債及後續衡量問題的觀念依據。",
    externalLlmAllowed: false,
    purchaseUrl: "https://publish.get.com.tw/book.asp?BKID=20334",
  },
  {
    id: 7,
    subject: "中級會計",
    title: "會研所中級會計學題庫制霸",
    sourceId: "51MM320901",
    type: "題庫",
    edition: "全書",
    chapter: "第一章｜財務報導之觀念架構",
    page: 3,
    tags: ["衡量基礎", "歷史成本", "公允價值", "使用價值", "選擇題"],
    text: "題庫收錄衡量基礎、歷史成本、公允價值、使用價值與履約價值等選擇題，可用於從觀念回答直接銜接練題。",
    externalLlmAllowed: true,
    purchaseUrl: "https://publish.get.com.tw/Book.asp?BKID=20276",
  },
  {
    id: 8,
    subject: "中級會計",
    title: "泓觀稱霸中級會計學 114 年解題全攻略",
    sourceId: "51MG122110",
    type: "解題書",
    edition: "114 年",
    chapter: "114 年初等考試｜會計學大意",
    page: 1,
    tags: ["應付帳款", "起運點交貨", "目的地交貨", "存貨", "加權平均"],
    text: "解題內容將應付帳款認列連結到商品控制移轉與交貨條件，也包含存貨加權平均等年度考題解析。",
    externalLlmAllowed: true,
    purchaseUrl: "https://publish.get.com.tw/book.asp?BKID=20223",
  },
  {
    id: 9,
    subject: "中級會計",
    title: "中級會計學申論題完全制霸",
    sourceId: "51MG123611",
    type: "申論題",
    edition: "全書",
    chapter: "第一章｜財務報導之觀念架構",
    page: 3,
    tags: ["申論題", "銷貨淨額", "銷貨成本", "應收帳款", "應付帳款"],
    text: "題庫解析：應收帳款公式為期初應收帳款＋銷貨淨額－收現＝期末應收帳款，因此銷貨淨額＝收現＋期末應收帳款－期初應收帳款。應付帳款公式為期初應付帳款＋進貨－付現＝期末應付帳款，因此進貨＝付現＋期末應付帳款－期初應付帳款。銷貨成本＝期初存貨＋進貨－期末存貨。若題目數字為收現570,000元、付現390,000元，期初及期末應收帳款90,000元與67,500元，期初及期末存貨147,000元與187,500元，期初及期末應付帳款97,500元與120,000元，則銷貨淨額為547,500元、進貨為412,500元、銷貨成本為372,000元。",
    externalLlmAllowed: true,
    purchaseUrl: "https://publish.get.com.tw/book.asp?BKID=19958",
  },
  {
    id: 16,
    subject: "中級會計",
    title: "鄭泓老師｜高點・知識達師資資料",
    sourceId: "TEACHER-ZHENG-HONG",
    type: "師資資料",
    edition: "2026-07-27 查證",
    chapter: "師資檔案｜中級會計學・會計學",
    page: 1,
    tags: ["鄭泓", "鄭泓老師", "泓大", "中級會計學", "會計學", "會計師", "會研所", "高普考", "檢察事務官"],
    text: "鄭泓老師為高點與知識達的會計類師資，主要教授中級會計學與會計學。公開課程資料載明其學歷為政治大學會計研究所、臺灣大學會計博士候選人，並具會計師、記帳士及高普考會審人員等資格。適用課程範圍包括會計師、會研所、高普考、檢察事務官財經組等。",
    externalLlmAllowed: true,
    purchaseUrl: "https://ec.ibrain.com.tw/book.asp?BKID=18321",
    courseUrl: "https://www.ibrain.com.tw/audition/ListDetail.aspx?iS=13000",
    courseLabel: "試聽鄭泓老師中級會計學",
  },
  {
    id: 17,
    subject: "中級會計",
    title: "鄭泓老師｜中級會計學著作",
    sourceId: "AUTHOR-ZHENG-HONG",
    type: "作者書目",
    edition: "2026-07-27 查證",
    chapter: "高點文化｜作者與著作關聯",
    page: 1,
    tags: ["鄭泓", "鄭泓老師", "作者", "著作", "出書", "中級會計學霸", "完全制霸", "泓觀稱霸", "題庫制霸"],
    text: "高點文化公開書目顯示，鄭泓老師著有《中級會計學霸（上）》、《中級會計學霸（下）》、《中級會計學測驗題完全制霸》、《中級會計學申論題完全制霸》、《泓觀稱霸中級會計學114年解題全攻略》及《會研所中級會計學題庫制霸》等會計類用書。",
    externalLlmAllowed: true,
    purchaseUrl: "https://publish.get.com.tw/layer.asp?KindID3=217",
  },
  {
    id: 18,
    subject: "中級會計",
    title: "鄭泓老師｜知識達課程",
    sourceId: "COURSE-ZHENG-HONG",
    type: "課程",
    edition: "116 年課程",
    chapter: "中級會計學課程｜會計所・高普考・檢察事務官",
    page: 1,
    tags: ["鄭泓", "鄭泓老師", "課程", "教什麼", "中級會計學", "會計學", "會計所", "高普考", "檢察事務官"],
    text: "知識達目前可查得鄭泓老師的中級會計學與會計學課程，涵蓋會計研究所、高普考會計、檢察事務官財經組與基礎先修等方向；另有中級會計學線上試聽頁。",
    externalLlmAllowed: true,
    purchaseUrl: "https://ec.ibrain.com.tw/book.asp?BKID=18321",
    courseUrl: "https://www.ibrain.com.tw/audition/ListDetail.aspx?iS=13000",
    courseLabel: "前往線上試聽",
  },
  {
    id: 19,
    subject: "法律",
    lawScope: "刑法",
    title: "張鏡榮老師（榮律）｜高點・知識達師資資料",
    sourceId: "TEACHER-ZHANG-JING-RONG",
    type: "師資資料",
    edition: "2026-07-27 查證",
    chapter: "師資檔案｜刑法・刑法概要・申論寫作",
    page: 1,
    tags: [
      "張鏡榮",
      "張鏡榮老師",
      "張鏡榮律師",
      "榮律",
      "刑法",
      "刑法概要",
      "刑法總則",
      "刑法分則",
      "申論寫作",
      "教什麼",
      "作者",
      "著作",
    ],
    text: "張鏡榮老師亦以「榮律」名義授課，為高點與知識達的刑法類師資，教授刑法、刑法概要、刑法總則題庫及刑法申論寫作。高點文化可查得其《透明的刑法－總則編》、《透明的刑法－分則編》及《透明的刑法解題書》等著作。系統已把教學名、正式姓名、科目、課程與著作合併為同一師資檔案。",
    externalLlmAllowed: true,
    purchaseUrl: "https://publish.get.com.tw/book.asp?BKID=20279",
    courseUrl: "https://www.ibrain.com.tw/Audition/ListDetail.aspx?1=1&iC=2065&iM=40498&iS=65230",
    courseLabel: "試聽榮律刑法課程",
  },
  {
    id: 20,
    subject: "法律",
    lawScope: "刑法",
    title: "張鏡榮老師（榮律）｜高點文化著作",
    sourceId: "AUTHOR-ZHANG-JING-RONG",
    type: "作者書目",
    edition: "2026-07-27 查證",
    chapter: "高點文化｜作者、教學名與著作關聯",
    page: 1,
    tags: [
      "張鏡榮",
      "張鏡榮老師",
      "張鏡榮律師",
      "榮律",
      "透明的刑法",
      "透明的刑法總則編",
      "透明的刑法分則編",
      "透明的刑法解題書",
      "出書",
      "著作",
    ],
    text: "張鏡榮老師（榮律）的高點文化著作包含《透明的刑法－總則編》、《透明的刑法－分則編》及《透明的刑法解題書》。查詢「張鏡榮、張鏡榮老師、張鏡榮律師、榮律」都會連到同一作者與師資關係。",
    externalLlmAllowed: true,
    purchaseUrl: "https://publish.get.com.tw/book.asp?BKID=20279",
  },
];

const popularBySubject = {
  法律: ["不作為犯", "客觀歸責", "一罪不二罰", "112年憲判字第4號", "國會調查權"],
  中級會計: ["公允價值要扣交易成本嗎？", "應付帳款何時認列？", "加權平均法", "銷貨成本怎麼反推？"],
};

const externalSearchProviders: ExternalSearchProvider[] = [
  {
    kind: "文章",
    name: "元照網路書店",
    description: "搜尋月旦、元照文章、書籍與法律專業內容",
    buildUrl: (query) =>
      `https://www.angle.com.tw/media/Web/Search.aspx?sFilterType=0&sFilter=${encodeURIComponent(query)}&Submit=${encodeURIComponent("檢索")}`,
  },
  {
    kind: "影片",
    name: "元照 YouTube",
    description: "搜尋學者、老師的法律解析與講座片段",
    buildUrl: (query) =>
      `https://www.youtube.com/@AngleTw/search?query=${encodeURIComponent(query)}`,
  },
  {
    kind: "影片",
    name: "iBrain YouTube",
    description: "搜尋函授課程、考點解析與學習內容",
    buildUrl: (query) =>
      `https://www.youtube.com/@ecibrain/search?query=${encodeURIComponent(query)}`,
  },
  {
    kind: "影片",
    name: "高點 YouTube",
    description: "搜尋考試解析、老師講解與最新考情",
    buildUrl: (query) =>
      `https://www.youtube.com/@get7787/search?query=${encodeURIComponent(query)}`,
  },
];

const learningProducts: LearningProduct[] = [
  {
    audience: "已購課學員",
    name: "高點線上學習",
    description: "回到你的課程、講義與學習進度，接著完成目前考點的正式課程。",
    action: "進入我的課程",
    url: "https://member.get.com.tw/coursera/Web/",
    accent: "member",
    featured: true,
  },
  {
    audience: "想找相關課程",
    name: "iBrain 知識達購課館",
    description: "查看影音函授、師資與課程介紹，從目前考點延伸到完整學習。",
    action: "前往 iBrain 找課程",
    url: "https://www.ibrain.com.tw/",
    accent: "ibrain",
    featured: true,
  },
  {
    audience: "考試與類科",
    name: "高點教育出版集團",
    description: "查看考情、類科、師資、考古題與各項學習服務。",
    action: "前往 GET",
    url: "https://www.get.com.tw/",
    accent: "get",
  },
  {
    audience: "教材與題庫",
    name: "高點網路書店",
    description: "依回答引用的教材，延伸查看考試用書、題庫與解題書。",
    action: "找相關教材",
    url: "https://publish.get.com.tw/",
    accent: "publish",
  },
  {
    audience: "研究所升學",
    name: "高點研究所",
    description: "銜接研究所筆試、甄試、在職專班與專業進修資訊。",
    action: "前往高點研究所",
    url: "https://master.get.com.tw/",
    accent: "master",
  },
  {
    audience: "課・書・測・會",
    name: "Law說微課",
    description: "延伸法律、行政、不動產與語言學院的微課、文章及學習內容。",
    action: "前往 Law說微課",
    url: "https://www.lawsource.com.tw/",
    accent: "lawsource",
  },
];

const topicBundles: TopicBundle[] = [
  {
    key: "112年憲判字第6號",
    aliases: ["112年憲判字第6號", "112憲判6", "軍事審判與普通法院判決歧異案"],
    issue: "112年憲判字第6號｜軍事審判與普通法院判決歧異案",
    summary: "本案核心是訴訟權與有效再審救濟：軍事法院與普通法院依相同主要證據，卻對共同正犯作出有罪、無罪歧異判決時，法律應提供受有罪判決軍人的再審機會。",
    resources: [
      {
        kind: "判解",
        title: "憲法法庭｜112年憲判字第6號裁判全文",
        meta: "112年5月5日｜官方第一順位來源",
        reason: "完整呈現軍事審判法第181條第5項的合憲判斷，以及判決歧異時應提供再審救濟的理由。",
        url: "https://cons.judicial.gov.tw/docdata.aspx?fid=38&id=310005",
        level: "高度相關",
        verification: "已查證",
      },
      {
        kind: "判解",
        title: "憲法法庭書記廳｜112年憲判字第6號官方摘要",
        meta: "案由、主文、審查原則與判決效果",
        reason: "可快速掌握訴訟權、正當法律程序、無罪推定、罪證有疑利歸被告與再審救濟等考點。",
        url: "https://cons.judicial.gov.tw/docdata.aspx?fid=77&id=348475",
        level: "高度相關",
        verification: "已查證",
      },
    ],
  },
  {
    key: "111年憲判字第2號",
    aliases: ["111年憲判字第2號", "111憲判2", "強制道歉案", "強制道歉案（二）"],
    issue: "111年憲判字第2號｜強制道歉案（二）",
    summary: "先讀憲法法庭裁判與官方摘要，再用嶺律教材及微課整理言論自由、思想自由與國考作答架構。",
    resources: [
      {
        kind: "判解",
        title: "憲法法庭｜111年憲判字第2號裁判全文",
        meta: "111年2月25日｜官方第一順位來源",
        reason: "民法第195條第1項後段所稱回復名譽之適當處分，不包括法院以判決命加害人道歉。",
        url: "https://cons.judicial.gov.tw/docdata.aspx?fid=38&id=309998",
        level: "高度相關",
        verification: "已查證",
      },
      {
        kind: "判解",
        title: "憲法法庭書記廳｜111年憲判字第2號官方摘要",
        meta: "主文、理由要旨與判決效果",
        reason: "官方摘要說明強制道歉對言論自由的高強度干預；對自然人並進一步侵害思想自由。",
        url: "https://cons.judicial.gov.tw/docdata.aspx?fid=77&id=340122",
        level: "高度相關",
        verification: "已查證",
      },
    ],
  },
  {
    key: "112年憲判字第4號",
    aliases: ["112年憲判字第4號", "112憲判4", "唯一有責配偶", "限制唯一有責配偶請求裁判離婚"],
    issue: "112年憲判字第4號｜限制唯一有責配偶請求裁判離婚案",
    summary: "官方裁判原文優先；先掌握主文、判決理由與效力，再連結已核對的教材與考題。",
    resources: [
      {
        kind: "判解",
        title: "憲法法庭｜112年憲判字第4號裁判全文",
        meta: "112年3月24日｜官方第一順位來源",
        reason: "民法第1052條第2項但書原則上合憲；但若婚姻破綻已逾或持續相當期間，仍一律不許唯一有責配偶請求離婚，可能造成個案顯然過苛，於此範圍內違反婚姻自由保障。",
        url: "https://cons.judicial.gov.tw/docdata.aspx?fid=38&id=310013",
        level: "高度相關",
        verification: "已查證",
      },
      {
        kind: "判解",
        title: "憲法法庭書記廳｜官方判決摘要",
        meta: "主文、理由要旨與判決效果",
        reason: "官方摘要說明：相關機關應於判決宣示後2年內修法；逾期未修法，法院應依本判決意旨審理顯然過苛的個案。",
        url: "https://cons.judicial.gov.tw/docdata.aspx?fid=77&id=347357",
        level: "高度相關",
        verification: "已查證",
      },
    ],
  },
  {
    key: "客觀歸責",
    aliases: ["客觀歸責", "因果歷程", "風險實現", "因果關係"],
    issue: "因果歷程錯誤與客觀歸責",
    summary: "從「是否製造法所不容許的風險」到「該風險是否在結果中實現」，把教材概念接到裁判、考題與延伸閱讀。",
    resources: [
      {
        kind: "判解",
        title: "最高法院 112 年度台上字第 2501 號判決",
        meta: "過失犯成立與客觀歸責三階段",
        reason: "直接整理製造風險、風險實現及構成要件效力範圍。",
        url: "https://www.angle.com.tw/news/post27.aspx?ip=10467",
        level: "高度相關",
        verification: "已查證",
      },
      {
        kind: "法條",
        title: "中華民國刑法第 14 條｜過失",
        meta: "全國法規資料庫",
        reason: "客觀歸責常用於檢驗過失結果能否歸屬行為人。",
        url: "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=C0000001",
        level: "高度相關",
        verification: "已查證",
      },
      {
        kind: "期刊",
        title: "第三人救助與客觀結果歸責",
        meta: "古承宗｜月旦法學教室第 267 期",
        reason: "從救助者損害延伸檢驗責任領域與風險實現。",
        url: "https://www.angle.com.tw/magazine/m_single.asp?BKID=4520",
        level: "延伸相關",
        verification: "已查證",
      },
      {
        kind: "期刊",
        title: "過失參與行為的客觀歸責",
        meta: "月旦釋讀｜公開書目頁",
        reason: "連結非典型因果歷程、自我負責風險與過失參與。",
        url: "https://www.angle.com.tw/news/post28.aspx?ip=8753",
        level: "延伸相關",
        verification: "已查證",
      },
    ],
  },
  {
    key: "里長公務員",
    aliases: ["里長", "公務員", "身分公務員", "105台上1272"],
    issue: "里長是否為刑法上的公務員",
    summary: "不能只看『里長』職稱；要回到行為當時是否依法令從事公共事務，以及是否具有法定職務權限。",
    resources: [
      {
        kind: "判解",
        title: "最高法院 105 年度台上字第 1272 號判決",
        meta: "已確認案號｜裁判原文連結待建立",
        reason: "教材指出這是里長協助督導社會勞動的核心案例；目前尚未取得可直達該裁判的司法院原文網址。",
        url: "",
        level: "高度相關",
        verification: "查找方向",
      },
      {
        kind: "法條",
        title: "中華民國刑法第 10 條第 2 項｜公務員定義",
        meta: "全國法規資料庫",
        reason: "判斷身分公務員與授權公務員的法定起點。",
        url: "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=C0000001",
        level: "高度相關",
        verification: "已查證",
      },
      {
        kind: "期刊",
        title: "到月旦知識庫查找相關文獻",
        meta: "尚未定位到具體篇名、作者與期別",
        reason: "這是文獻搜尋入口，不代表系統已找到一篇直接相關的期刊文章。",
        url: "https://lawdata.com.tw/tw/SE.aspx",
        level: "延伸相關",
        verification: "查找方向",
      },
    ],
  },
];

const learningSummaries: LearningSummary[] = [
  {
    aliases: ["客觀歸責", "因果關係", "風險實現"],
    headline: "客觀歸責不是只問「有沒有因果關係」，而是再判斷這個結果是否應由行為人負責。",
    thirtySeconds: "先確認行為製造了法所不容許的風險，再看該風險是否在結果中實現，最後檢查結果是否落在構成要件的保護範圍。",
    steps: ["不容許風險", "風險在結果中實現", "構成要件效力範圍"],
    pitfall: "只寫「若無此行為即無此結果」仍只是條件因果關係，尚未完成客觀歸責。",
  },
  {
    aliases: ["不作為犯", "保證人地位", "不純正不作為"],
    headline: "先分清純正與不純正不作為犯，兩者不能套用同一組要件。",
    thirtySeconds: "純正不作為犯依個別法條判斷；不純正不作為犯才進一步審查保證人地位、防止可能性、結果避免可能性、作為等價性與結果歸責。",
    steps: ["辨識子類型", "確認作為義務與防止能力", "檢驗結果避免與歸責"],
    pitfall: "不能只列「保證人地位＋作為等價性」就直接認定成立。",
  },
  {
    aliases: ["里長", "公務員", "身分公務員"],
    headline: "里長的職稱本身，不會讓他從事的每一件事都成為刑法上的公務。",
    thirtySeconds: "應回到行為當時所執行的具體事項，判斷是否依法令從事公共事務，以及是否具有法定職務權限。",
    steps: ["確認具體行為", "找出法令依據", "判斷是否屬法定職務權限"],
    pitfall: "看到「里長」就直接肯定刑法公務員身分，會忽略職務與行為的關聯。",
  },
];

const practiceQuestions: PracticeQuestion[] = [
  {
    aliases: ["客觀歸責", "因果關係", "風險實現"],
    sourceLabel: "教材改編題",
    topic: "刑法總則｜客觀歸責",
    prompt: "甲違規超速駕車，途中乙突然自天橋跳下，恰好落在甲車前方而遭撞死。若甲即使依速限行駛也無法避免碰撞，下列何者最適合用來檢驗死亡結果能否歸責於甲？",
    options: [
      "只要甲的車實際撞到乙，即可直接肯定客觀歸責",
      "應檢驗甲所製造的超速風險，是否正是在乙死亡結果中實現",
      "只要甲違反速限規定，即不必再討論因果關係",
      "乙死亡屬重大結果，因此一律由甲負責",
    ],
    answer: 1,
    explanations: [
      "實際碰撞只能說明事實歷程，仍須檢驗不容許風險是否在結果中實現。",
      "正確。超速雖製造不容許風險，但若即使守法行駛也不能避免結果，就要進一步檢驗該風險是否實現。",
      "違反規範不會取代因果關係與客觀歸責的判斷。",
      "結果重大不是歸責標準，仍須回到風險製造與風險實現。",
    ],
  },
  {
    aliases: ["不作為犯", "保證人地位", "不純正不作為"],
    sourceLabel: "教材改編題",
    topic: "刑法總則｜不純正不作為犯",
    prompt: "下列何者最完整說明不純正不作為犯的審查方式？",
    options: [
      "只要行為人沒有行動，即可成立",
      "只要具有保證人地位，即可成立",
      "除作為義務外，仍須檢驗防止能力、結果避免可能性、等價性、結果歸責及主觀要件",
      "只要結果發生，即推定行為人具有故意",
    ],
    answer: 2,
    explanations: [
      "單純未行動，不足以成立不純正不作為犯。",
      "保證人地位只是審查的一環，不能省略其餘要件。",
      "正確。這才涵蓋從客觀義務、避免可能性到歸責與主觀要件的完整層次。",
      "結果發生不能取代故意或過失的判斷。",
    ],
  },
];

const issueSpottingQuestions: IssueSpottingQuestion[] = [
  {
    domain: "刑法",
    topic: "刑法總則｜因果歷程",
    prompt: "甲持刀刺殺乙，以為乙已死亡，為湮滅證據將乙丟入河中。乙實際上並未因刀傷死亡，而是因溺水死亡。本案最核心的法律爭點為何？",
    options: [
      "前後兩個行為是否可依接續犯合併評價",
      "死亡歷程偏離原先認知，是否影響故意既遂",
      "誤認被害人死亡是否屬於客體認識錯誤",
      "棄置被害人的行為是否另成立遺棄致死",
    ],
    answer: 1,
    keyFact: "「甲以為乙已死亡」與「乙實際因溺水死亡」",
    explanation: "這兩句顯示甲所想的死亡原因與實際死亡原因不同，因此核心是因果歷程錯誤，而不是先判斷最後成立哪一個罪名。",
  },
  {
    domain: "刑法",
    topic: "刑法分則｜財產犯罪",
    prompt: "乙在無人超商使用自動結帳機，故意少掃三件商品的條碼，只支付其餘商品價款後離去。本案若要區分詐欺與竊盜，最核心的法律爭點為何？",
    options: [
      "機器能否陷於錯誤並作成財產處分",
      "少掃條碼是否已達竊盜罪的著手",
      "取走商品是否具備不法所有意圖",
      "付款離店是否構成犯罪行為終了",
    ],
    answer: 0,
    keyFact: "「使用自動結帳機，故意少掃商品」",
    explanation: "案例沒有由店員受騙後交付商品，關鍵在於機器能否成為詐欺罪中的受騙與處分環節；這會影響詐欺或竊盜的定性。",
  },
  {
    domain: "公法",
    topic: "行政法｜行政處分",
    prompt: "環保局發函給丙工廠表示：「排放廢水數值偏高，請於十五日內自行改善，請查照。」丙擬提起訴願及行政訴訟。法院首先應釐清的核心爭點為何？",
    options: [
      "丙工廠是否具有提起訴願的當事人能力",
      "環保局是否享有排放標準的判斷餘地",
      "該函是行政處分或不具規制力的通知",
      "改善期限是否違反行政法上的比例原則",
    ],
    answer: 2,
    keyFact: "「請於十五日內自行改善，請查照」",
    explanation: "能否循訴願及撤銷訴訟救濟，首先取決於這封函是否具有行政處分性；內容是否直接規制權利義務才是核心。",
  },
  {
    domain: "公法",
    topic: "憲法｜基本權限制",
    prompt: "市政府為維護市容，規定所有公園周邊一律禁止發放任何傳單，違者處罰。人民主張該規定違憲。本案進行基本權審查時，最核心的爭點為何？",
    options: [
      "公園周邊是否屬於傳統公共論壇",
      "全面禁發傳單是否符合比例原則",
      "處罰規定是否侵害人民的財產權",
      "市政府是否具有管理公園的自治權限",
    ],
    answer: 1,
    keyFact: "「所有公園周邊一律禁止發放任何傳單」",
    explanation: "全面禁止直接限制表意活動，應檢驗目的、適合性、必要性與衡量性；傳單樣式或居住地不是本案核心。",
  },
  {
    domain: "民法",
    topic: "民法物權｜借名登記",
    prompt: "甲將房屋借名登記於乙名下，乙未經甲同意，將房屋出售並移轉登記給不知情的丙。甲欲向丙請求返還房屋。本案最核心的法律爭點為何？",
    options: [
      "乙的處分權限及丙能否取得所有權",
      "甲乙借名約定是否違反公序良俗",
      "甲對乙是否享有債務不履行請求權",
      "丙是否得向乙主張權利瑕疵擔保",
    ],
    answer: 0,
    keyFact: "「借名登記於乙名下」及「乙未經甲同意移轉給不知情的丙」",
    explanation: "甲能否向丙請求返還，取決於乙處分房屋的權限及丙能否取得所有權；這才是連結案例事實與返還請求的核心。",
  },
  {
    domain: "民法",
    topic: "民法債編｜意思表示錯誤",
    prompt: "甲誤將標價一百萬元的古董看成十萬元，立即向乙表示願意購買，乙也表示同意。甲事後發現看錯價格，主張不受契約拘束。本案最核心的法律爭點為何？",
    options: [
      "甲乙是否已就買賣必要之點達成合意",
      "甲的價格誤認是否構成得撤銷的錯誤",
      "乙是否違反締約前的資訊說明義務",
      "古董市價是否造成給付顯失公平",
    ],
    answer: 1,
    keyFact: "「誤將一百萬元看成十萬元」",
    explanation: "甲因價格認知錯誤而作成購買意思表示，核心在於該錯誤是否符合意思表示錯誤的撤銷要件及法律效果。",
  },
  {
    domain: "民事訴訟法",
    topic: "民事訴訟法｜訴之利益",
    prompt: "甲請求法院確認乙應於十年後返還一筆尚未到期、且乙從未否認的借款。法院審理時，首先應處理的核心程序爭點為何？",
    options: [
      "甲是否具有即受確認判決的法律上利益",
      "尚未到期的借款是否具有權利保護必要",
      "未來給付之訴是否得以預期不履行為由提起",
      "乙未否認債權是否構成訴訟上的自認",
    ],
    answer: 0,
    keyFact: "「尚未到期」且「乙從未否認」",
    explanation: "確認之訴須有即受確認判決的法律上利益；權利目前沒有不安或危險時，法院首先要審查訴之利益。",
  },
  {
    domain: "民事訴訟法",
    topic: "民事訴訟法｜既判力範圍",
    prompt: "甲先前請求乙返還借款敗訴確定，之後又以同一筆借款及相同事實再次起訴。本案最核心的程序爭點為何？",
    options: [
      "後訴是否受前訴確定判決的既判力拘束",
      "甲得否以發現新證據為由提起再審之訴",
      "兩次訴訟是否構成民事訴訟法上的重複起訴",
      "乙是否得以權利失效抗辯阻止甲再行請求",
    ],
    answer: 0,
    keyFact: "「同一筆借款及相同事實再次起訴」",
    explanation: "前案已確定而後案又處理同一紛爭，核心是前判決既判力的客觀、主觀及時間範圍。",
  },
  {
    domain: "刑事訴訟法",
    topic: "刑事訴訟法｜違法搜索",
    prompt: "警方未取得搜索票，也無急迫情形，逕自進入甲家搜索並扣得毒品。審判中甲爭執該毒品不得作為證據。本案最核心的程序爭點為何？",
    options: [
      "無票搜索是否仍符合附帶搜索的要件",
      "違法搜索所得證據是否應予排除",
      "毒品是否因扣押程序欠缺而失去同一性",
      "甲是否得對搜索行為聲請準抗告救濟",
    ],
    answer: 1,
    keyFact: "「未取得搜索票，也無急迫情形」",
    explanation: "搜索是否合法，以及違法取得證據能否在審判中使用，是本案證據能力判斷的核心。",
  },
  {
    domain: "刑事訴訟法",
    topic: "刑事訴訟法｜傳聞法則",
    prompt: "證人乙未到庭，檢察官僅提出乙在警詢時指稱甲犯罪的筆錄，作為認定甲有罪的主要證據。本案最核心的程序爭點為何？",
    options: [
      "警詢筆錄是否符合文書證據的法定程式",
      "證人未到庭是否使審判程序當然違法",
      "乙的審判外陳述是否具有證據能力",
      "單一證人指述是否違反補強證據法則",
    ],
    answer: 2,
    keyFact: "「證人未到庭」及「僅提出警詢筆錄」",
    explanation: "證人於審判外的陳述原則上受傳聞法則限制，須檢驗是否符合例外及對質詰問保障。",
  },
  {
    domain: "商法",
    topic: "公司法｜董事代表權",
    prompt: "甲公司董事未經董事會決議，擅自以公司名義與善意的乙簽訂重大資產買賣契約。公司主張契約不生效力。本案最核心的法律爭點為何？",
    options: [
      "董事欠缺內部決議能否對抗善意相對人",
      "重大資產交易是否屬於董事會專屬權限",
      "董事是否應對公司負擔損害賠償責任",
      "交易相對人是否負有查閱公司章程義務",
    ],
    answer: 0,
    keyFact: "「未經董事會決議」及「以公司名義與善意乙交易」",
    explanation: "內部決議欠缺與對外代表行為效力的關係，會直接決定公司是否受契約拘束。",
  },
  {
    domain: "商法",
    topic: "票據法｜票據抗辯",
    prompt: "甲簽發本票給乙作為買賣價金，乙再將本票背書轉讓給不知買賣糾紛的丙。甲以乙未交貨為由拒絕向丙付款。本案最核心的法律爭點為何？",
    options: [
      "乙未交貨是否使本票債務一併消滅",
      "原因關係抗辯能否對抗善意執票人",
      "乙背書轉讓是否須經甲事前表示同意",
      "丙取得本票時是否承受乙的履約義務",
    ],
    answer: 1,
    keyFact: "「乙未交貨」及「背書轉讓給不知情的丙」",
    explanation: "票據具有無因性與流通性，核心是原因關係抗辯可否對抗善意取得票據的第三人。",
  },
];

function buildGuidedIssueSteps(question: IssueSpottingQuestion): GuidedIssueStep[] {
  if (question.guidedSteps) return question.guidedSteps;
  const correctIssue = question.options[question.answer];
  const outcome = getGuidedIssueOutcome(question);
  const rules: Record<IssueSpottingQuestion["domain"], [string, string, string, string]> = {
    公法: [
      "先確認公權力措施的性質，再選擇相應的審查基準與救濟途徑",
      "只要行政機關作成決定，人民即得提起撤銷訴訟",
      "只要人民主張基本權受影響，該措施即當然違憲",
      "行政機關具有專業性時，法院不得再進行任何審查",
    ],
    民法: [
      "先確認請求權基礎，再依成立要件、抗辯與法律效果逐層判斷",
      "契約一經成立，任何意思表示瑕疵都不再影響其效力",
      "只要一方受有損失，即可直接向任何第三人請求返還",
      "登記名義或契約文字一律足以排除當事人的真實法律關係",
    ],
    刑法: [
      "依行為時的客觀事實與主觀認知，逐一檢驗構成要件及歸責",
      "只要最後發生死亡或財產損失，即可直接成立結果最重的犯罪",
      "應先決定刑度高低，再回頭選擇最接近的犯罪構成要件",
      "行為人事後如何處理結果，必然取代先前行為的刑法評價",
    ],
    民事訴訟法: [
      "先處理訴訟要件與程序障礙，再判斷實體請求有無理由",
      "法院只須審查原告主張的實體權利，不必處理程序要件",
      "只要前後兩案當事人相同，後訴即一律不得提起",
      "程序爭議均可等到判決確定後，再由法院職權補正",
    ],
    刑事訴訟法: [
      "先檢驗取證或陳述的合法性，再判斷證據能力與證明力",
      "只要證據內容可信，即使取得程序違法仍應一律採用",
      "偵查機關製作的筆錄均屬公文書，當然具有證據能力",
      "程序違法只影響員警責任，不會影響被告受公平審判的權利",
    ],
    商法: [
      "先確認公司或票據法律關係，再依權限、要件與對外效力判斷",
      "公司登記完成後，任何內部瑕疵都不得對外主張",
      "負責人所為行為一律由公司負責，無須審查代表權限",
      "只要交易涉及公司，即應優先排除民法及其他法律的適用",
    ],
  };
  const correctRule = rules[question.domain][0];
  return [
    {
      id: "issue",
      label: "辨識爭點",
      question: "本案最核心的法律爭點為何？",
      options: question.options,
      answer: question.answer,
      explanation: question.explanation,
    },
    {
      id: "rule",
      label: "選擇規則",
      question: "處理這個爭點時，哪一種判斷方式最適當？",
      options: rules[question.domain],
      answer: 0,
      explanation: correctRule,
    },
    {
      id: "fact",
      label: "抓關鍵事實",
      question: "題幹中，哪一組事實最會影響法律判斷？",
      options: [
        question.keyFact,
        "當事人的姓名、性別與平日生活習慣",
        "事件發生當天的天氣、時間與所在縣市",
        "題目沒有明示、必須由考生自行補充的背景",
      ],
      answer: 0,
      explanation: `真正需要畫線的是：${question.keyFact}。法律結論必須建立在題目已給的關鍵事實上。`,
    },
    {
      id: "application",
      label: "完成涵攝",
      question: "下列哪一句最像合格的涵攝？",
      options: outcome.applicationOptions,
      answer: outcome.applicationAnswer,
      explanation: "涵攝不是重複背誦規則，而是指出題目的哪個事實，為何符合或不符合特定要件。",
    },
    {
      id: "conclusion",
      label: "形成結論",
      question: outcome.conclusionQuestion,
      options: outcome.conclusionOptions,
      answer: outcome.conclusionAnswer,
      explanation: `依前一步的規則與涵攝，本案的明確結論是：${outcome.conclusionOptions[outcome.conclusionAnswer]}`,
    },
  ];
}

function getGuidedIssueOutcome(question: IssueSpottingQuestion): GuidedIssueOutcome {
  const outcomes: Record<string, GuidedIssueOutcome> = {
    "刑法總則｜因果歷程": {
      applicationOptions: [
        "甲刺殺與棄置乙均出於同一殺人歷程，實際死亡方式的偏離未逾一般預見範圍",
        "刺殺沒有直接造成死亡，因此第一行為與死亡結果之間必然欠缺因果關係",
        "甲誤認乙已死亡，後續棄置行為即當然不可能具有任何刑法上的可歸責性",
        "乙死於溺水而非刀傷，故只需評價後段行為，前段殺人行為不再具有意義",
      ],
      applicationAnswer: 0,
      conclusionQuestion: "依前一步所採的整體評價見解，本案應如何形成結論？",
      conclusionOptions: [
        "甲成立殺人既遂罪",
        "甲成立殺人未遂罪與過失致死罪，分別論罪",
        "甲僅成立殺人未遂罪",
        "甲僅成立過失致死罪",
      ],
      conclusionAnswer: 0,
      demonstration: "本案中，甲基於殺人故意刺殺乙，並在誤認乙已死亡後將其投入河中，乙最終因溺水死亡。雖然實際死亡歷程與甲原先認知不同，但依前後行為整體評價的見解，兩行為仍在同一殺人決意與危險歷程內，死亡方式的偏離尚未重大到排除故意既遂。因此，甲成立殺人既遂罪。",
    },
    "刑法分則｜財產犯罪": {
      applicationOptions: [
        "自動結帳機不是能受騙並基於錯誤處分財產的自然人，乙少掃後自行帶走商品",
        "乙曾支付部分價款，因此店家已同意乙自由帶走所有放入購物袋的商品",
        "自動結帳系統顯示付款成功，即代表機器已替店家作成完整的財產處分",
        "只要交易使用電子設備，即應優先成立電腦詐欺而排除其他財產犯罪",
      ],
      applicationAnswer: 0,
      conclusionQuestion: "依本題已呈現的事實，較適當的犯罪評價為何？",
      conclusionOptions: ["乙取走未結帳商品，原則上成立竊盜罪", "乙成立普通詐欺取財罪", "乙成立詐欺得利罪", "乙因支付部分價款而不成立犯罪"],
      conclusionAnswer: 0,
      demonstration: "乙故意未掃描三件商品，並在未支付價款的情況下自行帶離商店。自動結帳機並非能陷於錯誤、再基於錯誤作成財產處分的自然人，因此本案欠缺普通詐欺所要求的受騙與處分環節。乙破壞店家對商品的持有而建立自己持有，原則上成立竊盜罪。",
    },
    "行政法｜行政處分": {
      applicationOptions: [
        "函文命工廠於十五日內改善，若已直接設定具體義務，即具有對外規制效果",
        "函文使用「請查照」等禮貌文字，因此無論內容為何都只是單純通知",
        "環保局具有公權力身分，其寄出的任何公文都當然屬於行政處分",
        "工廠受到經營上的壓力，即足以證明函文必然是裁罰處分",
      ],
      applicationAnswer: 0,
      conclusionQuestion: "若認定該函已直接命丙負改善義務，法律結論為何？",
      conclusionOptions: ["該函具有行政處分性，丙得循訴願及行政訴訟救濟", "該函只是觀念通知，丙不得尋求任何救濟", "該函屬行政契約，須由丙承諾才生效", "該函屬法規命令，應直接聲請違憲審查"],
      conclusionAnswer: 0,
      demonstration: "環保局函文雖使用「請」等文字，但已具體要求丙在十五日內改善。若依整體內容足認該函直接對外設定改善義務，即具有規制效果，應認為是行政處分。丙不服時，得依法提起訴願及相應的行政訴訟。",
    },
    "憲法｜基本權限制": {
      applicationOptions: [
        "規定不分地點、時間與方式全面禁止傳單，對表意自由的限制範圍甚廣，且可能存在較小侵害手段",
        "維護市容屬公共利益，因此任何程度的言論限制都當然符合比例原則",
        "公園由市政府管理，人民在公園周邊即不再享有表意自由",
        "傳單具有紙張成本，所以本案主要侵害的是財產權而非表意自由",
      ],
      applicationAnswer: 0,
      conclusionQuestion: "依比例原則審查，本案最可能的結論為何？",
      conclusionOptions: ["全面禁止過度限制表意自由，原則上違反比例原則", "只要目的正當，全面禁止即當然合憲", "僅侵害財產權，與表意自由無關", "地方自治事項不受憲法基本權拘束"],
      conclusionAnswer: 0,
      demonstration: "發放傳單屬表意活動，該規定不分時間、地點、內容與方式全面禁止，限制範圍極廣。即使維護市容屬正當目的，仍可能透過清潔義務、特定區域或時段管制等較小侵害手段達成。因此，全面禁止原則上違反比例原則而侵害表意自由。",
    },
    "民法物權｜借名登記": {
      applicationOptions: [
        "房屋登記在乙名下，丙又不知借名關係；應檢驗交易安全保護及甲能否對丙主張所有權",
        "甲是實際出資人，因此不論登記與丙是否善意，甲都當然保有所有權",
        "乙違反借名約定，所以乙與丙間的買賣契約必然自始無效",
        "丙未直接向甲確認借名關係，即一律不得取得房屋所有權",
      ],
      applicationAnswer: 0,
      conclusionQuestion: "在丙受交易安全規範保護的前提下，甲得否向丙請求返還？",
      conclusionOptions: ["丙取得所有權，甲不得向丙請求返還，但得向乙主張責任", "甲仍為所有權人，得直接向丙請求返還", "買賣與移轉均當然無效，房屋成為無主物", "甲只能請求法院撤銷丙的善意取得"],
      conclusionAnswer: 0,
      demonstration: "甲雖與乙成立借名登記關係，但房屋登記於乙名下，外觀上乙具有處分權。若丙不知借名關係，並符合交易安全保護的要件，丙得取得所有權。甲因此不得向丙請求返還房屋，但仍可依借名契約向違約處分的乙主張相應責任。",
    },
    "民法債編｜意思表示錯誤": {
      applicationOptions: [
        "甲將一百萬元誤看成十萬元，價格認知與其表示決定直接相關，應檢驗錯誤撤銷要件及甲有無過失",
        "雙方已說出願意買賣，任何錯誤都不可能再影響契約效力",
        "甲看錯價格完全是乙的詐欺行為，因此無須審查其他要件",
        "古董價格高於甲預期即屬顯失公平，契約當然無效",
      ],
      applicationAnswer: 0,
      conclusionQuestion: "若甲的價格誤認符合錯誤撤銷要件，其法律效果為何？",
      conclusionOptions: ["甲得撤銷其意思表示，但可能須負信賴利益賠償責任", "買賣契約自始當然無效且甲不負任何責任", "甲只能請求減價，不能撤銷意思表示", "乙得強迫甲依十萬元價格履行"],
      conclusionAnswer: 0,
      demonstration: "甲把一百萬元誤看成十萬元，該價格認知直接影響其締約決定。若此錯誤符合民法上意思表示錯誤的撤銷要件，甲得撤銷其購買意思表示；但如甲對錯誤具有過失，仍可能對信賴該表示有效的乙負擔信賴利益賠償責任。",
    },
    "民事訴訟法｜訴之利益": {
      applicationOptions: [
        "借款尚未到期且乙從未否認，甲的法律地位目前欠缺須立即以確認判決排除的不安",
        "只要債權確實存在，原告在任何時間提起確認之訴都有訴之利益",
        "借款期限長達十年，因此法院應直接判命乙立即清償",
        "乙未否認借款等於訴訟上自認，法院不得再審查程序要件",
      ],
      applicationAnswer: 0,
      conclusionQuestion: "本案確認之訴應如何處理？",
      conclusionOptions: ["甲欠缺即受確認判決的法律上利益，確認之訴不合法", "甲有債權即當然具備訴之利益，法院應為勝訴判決", "法院應直接將確認之訴改為給付之訴", "乙未否認即應視為甲已獲全部清償"],
      conclusionAnswer: 0,
      demonstration: "確認之訴須有即受確認判決的法律上利益。本案借款尚未到期，乙也從未否認債權，甲的法律地位目前並無須立即透過確認判決排除的不安或危險。因此，甲欠缺訴之利益，其確認之訴不合法。",
    },
    "民事訴訟法｜既判力範圍": {
      applicationOptions: [
        "前案已就同一借款及相同事實判決確定，後訴再次請求法院判斷同一訴訟標的",
        "甲提出第二次起訴，前案判決即自動失去確定效力",
        "只要甲在後訴改寫部分文字，即不受前案判決拘束",
        "既判力只拘束法院，不影響同一當事人再次起訴",
      ],
      applicationAnswer: 0,
      conclusionQuestion: "後訴受到前案既判力拘束時，法院應如何處理？",
      conclusionOptions: ["法院不得作成與前案矛盾的判斷，後訴應受既判力拘束", "法院應完全重新審理，不得參考前案", "甲第二次起訴使前案自動成為未確定判決", "乙未另提反訴，法院即須支持甲的後訴"],
      conclusionAnswer: 0,
      demonstration: "前案已就同一筆借款及相同事實作成確定判決，後訴又要求法院判斷同一訴訟標的，落入前判決既判力的範圍。當事人及法院均受前案判斷拘束，不得在後訴作成矛盾判斷。",
    },
    "刑事訴訟法｜違法搜索": {
      applicationOptions: [
        "警方無搜索票且無急迫例外，取證程序違法；仍須衡量違法情節及人權保障，判斷是否排除證據",
        "毒品是真實存在的物品，所以無論如何取得都當然具有證據能力",
        "只有員警可能受懲處，搜索違法與被告審判中的證據使用完全無關",
        "甲家中查獲違禁物，即可反過來補正警方事前欠缺搜索票的瑕疵",
      ],
      applicationAnswer: 0,
      conclusionQuestion: "依違法取證排除法則，本案毒品應如何評價？",
      conclusionOptions: ["應權衡違法情節與人權保障，重大違法時排除其證據能力", "實體真實優先，毒品一律具有證據能力", "搜索違法即使輕微，也一律使全案無罪", "只要由檢察官提出，違法取得的證據即獲補正"],
      conclusionAnswer: 0,
      demonstration: "警方未取得搜索票，且不存在急迫搜索等法定例外，進入住居搜索的程序違法。法院仍應依違法取證排除法則，衡量違法情節、對基本權侵害及公共利益等因素；若違法重大，扣得毒品應排除其證據能力。",
    },
    "刑事訴訟法｜傳聞法則": {
      applicationOptions: [
        "乙在警詢的指述屬審判外陳述，乙又未到庭接受詰問，須檢驗是否符合傳聞例外",
        "警詢筆錄由警察製作即屬公文書，內容當然可以直接證明甲有罪",
        "證人未到庭只影響證明力高低，與證據能力完全無關",
        "檢察官把筆錄提出法庭後，原本的審判外陳述即轉為審判中陳述",
      ],
      applicationAnswer: 0,
      conclusionQuestion: "若該警詢陳述不符合傳聞例外，法律結論為何？",
      conclusionOptions: ["該筆錄無證據能力，不得作為認定甲有罪的證據", "該筆錄仍有完整證據能力，只需降低證明力", "該筆錄因由檢察官提出而當然具有證據能力", "只要內容詳細，即可取代乙到庭接受詰問"],
      conclusionAnswer: 0,
      demonstration: "乙在警詢時的指述是在審判外所為，且乙未到庭接受被告對質詰問，原則上受傳聞法則限制。若該陳述不符合刑事訴訟法所定的傳聞例外，即無證據能力，不得作為認定甲有罪的證據。",
    },
    "公司法｜董事代表權": {
      applicationOptions: [
        "未經董事會決議屬公司內部權限瑕疵；乙為善意相對人時，須判斷公司能否以內部限制對抗乙",
        "董事欠缺內部決議，即表示公司與乙之間從未發生任何法律關係",
        "交易金額重大，所以善意相對人一律負有查閱全部內部會議紀錄的義務",
        "董事以公司名義簽約後，無論代表權如何，公司都當然受拘束",
      ],
      applicationAnswer: 0,
      conclusionQuestion: "若該內部權限限制不得對抗善意乙，契約效力如何？",
      conclusionOptions: ["公司仍受契約拘束，另向違反義務的董事追究責任", "契約對公司當然無效，乙只能自行承擔損失", "契約須全體股東事後逐一同意才可能生效", "善意乙應先對董事提起刑事訴訟，契約才生效"],
      conclusionAnswer: 0,
      demonstration: "董事未經董事會決議，屬公司內部權限或決策程序的瑕疵。若乙為善意相對人，且該內部限制依規範不得對抗乙，公司仍應受對外契約拘束；公司可另就董事違反義務所生損害向其追究責任。",
    },
    "票據法｜票據抗辯": {
      applicationOptions: [
        "甲對乙的未交貨抗辯源自買賣原因關係，丙不知該糾紛，須判斷人的抗辯能否對抗善意執票人",
        "買賣契約未履行會使本票上的一切權利對任何人同時消滅",
        "丙受讓本票後即成為買賣契約當事人，應代替乙履行交貨",
        "本票經背書轉讓必須取得發票人甲的個別同意，否則一律無效",
      ],
      applicationAnswer: 0,
      conclusionQuestion: "丙為善意執票人時，甲得否以乙未交貨拒絕付款？",
      conclusionOptions: ["甲原則上不得以其與乙間的原因關係抗辯對抗丙", "甲得以乙未交貨為由拒絕對任何執票人付款", "丙須先替乙交貨，才能向甲行使票據權利", "乙背書未經甲同意，丙不可能取得票據權利"],
      conclusionAnswer: 0,
      demonstration: "甲所主張的乙未交貨，源自甲乙間的買賣原因關係，屬於人的抗辯。丙經背書取得本票，且不知甲乙間的糾紛時，為保護票據流通與善意執票人，甲原則上不得以該原因關係抗辯拒絕向丙付款。",
    },
  };

  return outcomes[question.topic];
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m21 21-4.35-4.35m2.35-5.15a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />
    </svg>
  );
}

function formatAnswerSections(answer: string) {
  const normalized = answer
    .replace(/^(簡短結論|本題考點|說明理由|各選項分析|易錯提醒|考場記憶)[：:]\s*/gm, "\n$1：")
    .trim();
  const marker = /(?:^|\n)(簡短結論|本題考點|說明理由|各選項分析|易錯提醒|考場記憶)：/g;
  const matches = [...normalized.matchAll(marker)];
  if (!matches.length) return [{ title: "解析", body: normalized }];
  const sections: Array<{ title: string; body: string }> = [];
  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    sections.push({ title: match[1], body: normalized.slice(start, end).trim() });
  });
  return sections.filter((section) => section.body);
}

function ReasoningSteps({ body }: { body: string }) {
  const matches = [
    ...body.matchAll(
      /(?:^|\n)\s*(\d+)[.、．]\s*([^：:\n]+?)(?:（([^）\n]+)）|\(([^)\n]+)\))?[：:]\s*([\s\S]*?)(?=(?:\n\s*\d+[.、．]\s)|$)/g,
    ),
  ];

  if (matches.length < 2) {
    return <div className="ai-answer-text">{body}</div>;
  }

  const steps = matches.map((match) => ({
    number: match[1],
    title: match[2].trim(),
    subtitle: (match[3] || match[4] || "").trim(),
    text: match[5].trim(),
  }));
  const groups = [
    {
      label: "一",
      title: "構成要件該當性",
      description: "先確認法律義務、履行能力及結果能否歸責於不作為。",
      steps: steps.filter((step) =>
        /區分|構成要件|保證人|作為義務|防止可能|結果避免|等價|因果|歸責/.test(step.title),
      ),
    },
    {
      label: "二",
      title: "違法性",
      description: "再檢查是否存在正當化事由。",
      steps: steps.filter((step) => /違法|正當化|阻卻違法/.test(step.title)),
    },
    {
      label: "三",
      title: "罪責",
      description: "最後審查主觀要件及責任是否可以非難。",
      steps: steps.filter((step) => /主觀|故意|過失|罪責|責任能力|違法性認識/.test(step.title)),
    },
  ];
  const groupedNumbers = new Set(groups.flatMap((group) => group.steps.map((step) => step.number)));
  const ungrouped = steps.filter((step) => !groupedNumbers.has(step.number));
  if (ungrouped.length) groups[0].steps.push(...ungrouped);

  return (
    <div className="reasoning-groups">
      {groups.filter((group) => group.steps.length).map((group) => (
        <section className="reasoning-group" key={group.title}>
          <header>
            <span>{group.label}</span>
            <div>
              <h4>{group.title}</h4>
              <p>{group.description}</p>
            </div>
          </header>
          <ol className="reasoning-step-list">
            {group.steps.map((step) => (
              <li key={`${group.title}-${step.number}`}>
                <span className="reasoning-step-number">{step.number}</span>
                <div>
                  <div className="reasoning-step-heading">
                    <strong>{step.title}</strong>
                    {step.subtitle && <small>{step.subtitle}</small>}
                  </div>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <aside className="reasoning-reminder">
        <strong>考場提醒</strong>
        <span>不能只因具有保證人地位，就直接認定成立犯罪；仍須依序完成其餘要件的審查。</span>
      </aside>
    </div>
  );
}

function AnswerText({
  answer,
  officialAnswer,
}: {
  answer: string;
  officialAnswer?: "A" | "B" | "C" | "D";
}) {
  const [expanded, setExpanded] = useState(false);
  const sections = formatAnswerSections(answer);
  const visibleSections = expanded ? sections : sections.slice(0, 3);
  const canCollapse = sections.length > 3;

  return (
    <div className="answer-copy structured-answer">
      {officialAnswer && (
        <div className="official-answer-banner">
          <span>標準答案</span>
          <strong>{officialAnswer}</strong>
        </div>
      )}
      <div className="answer-section-grid">
        {visibleSections.map((section, index) => (
          <section
            className={`answer-section answer-section-${index === 0 ? "lead" : section.title === "本題考點" ? "points" : "detail"}`}
            key={`${section.title}-${index}`}
          >
            <div className="answer-section-title">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{section.title}</h3>
            </div>
            {section.title === "說明理由" ? (
              <ReasoningSteps body={section.body} />
            ) : (
              <div className="ai-answer-text">{section.body}</div>
            )}
          </section>
        ))}
      </div>
      {canCollapse && (
        <button
          className="answer-toggle"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收合後段解析" : `展開其餘 ${sections.length - 3} 段解析`}
          <span aria-hidden="true">{expanded ? "↑" : "↓"}</span>
        </button>
      )}
    </div>
  );
}

const accountingFlowLabels = ["題型判斷", "關鍵字", "核心考點", "解題步驟", "答案與驗算"] as const;

function AccountingSolutionProgress({ step }: { step: number }) {
  const progressMessages = [
    "正在辨識題型與章節",
    "正在擷取關鍵字與重要數字",
    "正在比對核心考點與公式",
    "正在計算並檢查各選項",
    "正在核對標準答案與驗算",
  ];

  return (
    <div className="accounting-solution-progress" role="status" aria-live="polite">
      <header>
        <span>AI 正在解析</span>
        <strong>{progressMessages[step]}</strong>
        <em>{Math.min((step + 1) * 20, 95)}%</em>
      </header>
      <div className="accounting-progress-bar"><i style={{ width: `${Math.min((step + 1) * 20, 95)}%` }} /></div>
      <ol>
        {accountingFlowLabels.map((label, index) => (
          <li className={index < step ? "is-done" : index === step ? "is-current" : ""} key={label}>
            <span>{index < step ? "✓" : index + 1}</span>
            <b>{label}</b>
          </li>
        ))}
      </ol>
      <small>畫面顯示的是處理階段；正式解析會在核對完成後一次呈現。</small>
    </div>
  );
}

function AccountingSolutionFlow({ answer }: { answer: string }) {
  const normalized = answer
    .replace(/^(題型判斷|關鍵字|核心考點|解題步驟|答案與驗算)[：:]\s*/gm, "\n$1：")
    .trim();
  const marker = /(?:^|\n)(題型判斷|關鍵字|核心考點|解題步驟|答案與驗算)：/g;
  const matches = [...normalized.matchAll(marker)];

  if (matches.length < 3) {
    return (
      <div className="accounting-solution-flow">
        <div className="accounting-flow-heading">
          <span>AI 解題流程</span>
          <strong>先讀懂題目，再核對答案</strong>
        </div>
        <div className="accounting-flow-fallback">{answer}</div>
      </div>
    );
  }

  const sections = matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    return { title: match[1], body: normalized.slice(start, end).trim() };
  }).filter((section) => section.body);

  return (
    <div className="accounting-solution-flow">
      <div className="accounting-flow-heading">
        <span>AI 解題流程</span>
        <strong>先讀懂題目，再核對答案</strong>
      </div>
      <ol>
        {accountingFlowLabels.map((label, index) => {
          const section = sections.find((item) => item.title === label);
          if (!section) return null;
          return (
            <li key={label}>
              <span>{index + 1}</span>
              <div>
                <strong>{label}</strong>
                <p>{section.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <aside>
        <b>你可以這樣做</b>
        <span>下次遇到同類題，先圈關鍵字，再依相同順序判斷，不要只背最後答案。</span>
      </aside>
    </div>
  );
}

function detectLawScope(question: string): "刑法" | "公法" | "全部法律" {
  const normalized = question.toLowerCase().replace(/\s+/g, "");
  const publicLawTerms = [
    "公法", "憲法", "行政法", "行政處分", "行政訴訟", "憲判字", "釋字",
    "基本權", "比例原則", "權力分立", "憲法法庭", "國會調查權", "一罪不二罰",
  ];
  const criminalLawTerms = [
    "刑法", "犯罪", "故意", "過失", "客觀歸責", "不作為犯", "保證人地位",
    "公務員", "共犯", "未遂", "因果關係",
  ];
  const publicScore = publicLawTerms.filter((term) => normalized.includes(term)).length;
  const criminalScore = criminalLawTerms.filter((term) => normalized.includes(term)).length;
  if (publicScore === criminalScore) return "全部法律";
  return publicScore > criminalScore ? "公法" : "刑法";
}

function detectSubject(question: string): "法律" | "中級會計" {
  const normalized = question.toLowerCase().replace(/\s+/g, "");
  const accountingTerms = [
    "會計", "財務報表", "資產負債表", "綜合損益表", "現金流量表", "權益變動表",
    "分錄", "借方", "貸方", "資產", "負債", "收入", "費用", "存貨", "應收帳款",
    "應付帳款", "折舊", "公允價值", "銷貨成本", "保留盈餘", "ifrs", "ias",
    "加權平均", "移動平均", "平均成本", "平均單位成本", "先進先出", "後進先出",
    "期初存貨", "期末存貨", "進貨成本", "可供銷售商品成本", "永續盤存", "定期盤存",
    "鄭泓", "泓大",
  ];
  return accountingTerms.some((term) => normalized.includes(term)) ? "中級會計" : "法律";
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

function extractConstitutionalJudgmentKey(value: string) {
  const normalized = value.replace(/\s+/g, "");
  const match = normalized.match(/(\d{2,3})年?憲判字?第?(\d+)號?/);
  return match ? `${match[1]}憲判${Number(match[2])}` : null;
}

function findEvidence(
  question: string,
  selectedType: string,
  subject: "法律" | "中級會計",
  selectedLawScope: "自動判斷" | "刑法" | "公法",
) {
  const normalized = question.toLowerCase().replace(/[？?]/g, "").trim();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const requestedJudgment = extractConstitutionalJudgmentKey(question);
  const detectedScope = selectedLawScope === "自動判斷" ? detectLawScope(question) : selectedLawScope;
  return evidence.filter((item) => {
    if (item.subject !== subject) return false;
    if (subject === "法律" && detectedScope !== "全部法律" && item.lawScope !== detectedScope) return false;
    if (selectedType !== "全部資料" && item.type !== selectedType) return false;
    const haystack = [item.title, item.chapter, item.text, ...item.tags].join(" ").toLowerCase();
    if (requestedJudgment && extractConstitutionalJudgmentKey(haystack) !== requestedJudgment) return false;
    return tokens.every((token) => haystack.includes(token)) ||
      item.tags.some((tag) => normalized.includes(tag.toLowerCase()));
  });
}

function findTopicBundle(question: string) {
  const normalized = question.toLowerCase().replace(/\s+/g, "");
  return topicBundles.find((topic) =>
    topic.aliases.some((alias) => normalized.includes(alias.toLowerCase().replace(/\s+/g, ""))),
  );
}

function matchesAlias(question: string, aliases: string[]) {
  const normalized = question.toLowerCase().replace(/\s+/g, "");
  const requestedJudgment = extractConstitutionalJudgmentKey(question);
  return aliases.some((alias) => {
    const aliasJudgment = extractConstitutionalJudgmentKey(alias);
    if (requestedJudgment && aliasJudgment && requestedJudgment !== aliasJudgment) return false;
    return normalized.includes(alias.toLowerCase().replace(/\s+/g, ""));
  });
}

function officialQuestionId(question: OfficialQuestion) {
  return `${question.year}-${question.subject_group}-${question.number}`;
}

function classifyOfficialQuestion(question: OfficialQuestion) {
  const text = `${question.stem} ${Object.values(question.options).join(" ")}`;
  // The official paper's subject group is the strongest signal.  It is not a
  // per-question override: all questions go through the same scoring path.
  const paperSubject = question.subject_group;
  const subjectPrior = [
    "民法", "民事訴訟法", "刑法", "刑事訴訟法", "憲法", "行政法",
    "公司法", "證券交易法", "法律倫理",
  ].filter((law) => paperSubject.includes(law));
  const rules = [
    { law: "刑法", keywords: ["罪刑法定", "類推適用", "習慣法", "明確性原則", "刑罰明確性", "行為時", "溯及既往", "殺人", "故意", "過失", "正當防衛", "緊急避難", "未遂", "共犯", "因果關係", "客觀歸責", "被害人同意", "同意阻卻違法", "推測承諾", "得其承諾", "重傷", "刺青", "竊盜", "詐欺", "侵占", "妨害名譽", "公務員"] },
    { law: "刑事訴訟法", keywords: ["檢察官", "羈押", "搜索", "扣押", "證據能力", "自白", "告訴乃論", "不起訴", "偵查", "辯護人"] },
    { law: "法律倫理", keywords: ["律師倫理", "律師懲戒", "利益衝突", "保密義務", "律師法"] },
    { law: "憲法", keywords: ["違憲", "基本權", "比例原則", "法律保留", "憲法法庭", "權力分立", "平等權", "言論自由", "總統", "副總統", "行政院", "立法院", "司法院", "考試院", "監察院", "五權", "副署", "公布法律", "國家重要事項"] },
    { law: "行政法", keywords: ["行政處分", "行政契約", "行政罰", "國家賠償", "訴願", "撤銷訴訟", "公法上請求權"] },
    { law: "民法", keywords: ["意思表示", "債務不履行", "侵權行為", "無權代理", "物權", "抵押權", "繼承", "婚姻", "結婚", "配偶", "收養", "養親", "養子", "親子", "離婚", "契約"] },
    { law: "民事訴訟法", keywords: ["既判力", "訴訟標的", "當事人適格", "舉證責任", "上訴", "再審", "支付命令", "起訴", "訴訟"] },
    { law: "公司法", keywords: ["股東會", "董事會", "股份有限公司", "有限公司", "公司負責人", "監察人"] },
    { law: "證券交易法", keywords: ["內線交易", "操縱市場", "公開收購", "證券交易", "財報不實"] },
  ];
  const ranked = rules
    .map((rule) => ({
      ...rule,
      hits: rule.keywords.filter((keyword) => text.includes(keyword)),
      prior: subjectPrior.includes(rule.law) ? 100 : 0,
    }))
    .filter((rule) => rule.hits.length > 0)
    .sort((a, b) => (b.prior + b.hits.length) - (a.prior + a.hits.length));
  const best = ranked[0];
  if (!best) {
    return {
      law: "AI 暫定分類中",
      chapter: "依題幹與題組科目繼續比對",
      concepts: [question.subject_group],
      statutes: [] as string[],
      verified: false,
      classificationMethod: "未完成自動辨識",
      classificationBasis: [question.subject_group],
    };
  }
  const chapterMap: Record<string, Array<[string, string]>> = {
    刑法: [["罪刑法定", "刑法基本原則・罪刑法定原則"], ["類推適用", "刑法基本原則・禁止類推適用"], ["習慣法", "刑法基本原則・禁止習慣法"], ["明確性原則", "刑法基本原則・明確性原則"], ["行為時", "刑法基本原則・禁止溯及既往"], ["推測承諾", "違法性・被害人承諾與推測承諾"], ["同意阻卻違法", "違法性・被害人承諾"], ["被害人同意", "違法性・被害人承諾"], ["得其承諾", "違法性・被害人承諾"], ["正當防衛", "違法性・正當防衛"], ["緊急避難", "違法性・緊急避難"], ["未遂", "犯罪階段・未遂犯"], ["共犯", "正犯與共犯"], ["因果關係", "構成要件・因果關係與客觀歸責"], ["客觀歸責", "構成要件・因果關係與客觀歸責"], ["故意", "主觀構成要件・故意"], ["過失", "過失犯"], ["重傷", "生命身體法益犯罪・重傷判斷"], ["殺人", "生命身體法益犯罪"], ["竊盜", "財產犯罪"], ["詐欺", "財產犯罪"]],
    刑事訴訟法: [["證據能力", "證據法則"], ["自白", "證據法則・自白"], ["搜索", "強制處分"], ["扣押", "強制處分"], ["羈押", "強制處分"], ["偵查", "偵查程序"]],
    憲法: [["總統", "中央政府體制・總統職權"], ["副署", "中央政府體制・總統行為與副署"], ["五權", "中央政府體制・五院關係"], ["權力分立", "中央政府體制・權力分立"], ["比例原則", "基本權審查"], ["法律保留", "基本權限制"], ["平等權", "平等權"], ["言論自由", "言論自由"]],
    民法: [["意思表示", "法律行為"], ["侵權行為", "侵權行為"], ["債務不履行", "債之效力"], ["物權", "物權法"], ["繼承", "繼承法"], ["婚姻", "親屬法・婚姻"], ["結婚", "親屬法・婚姻"], ["配偶", "親屬法・婚姻"], ["收養", "親屬法・收養"], ["養親", "親屬法・收養"], ["養子", "親屬法・收養"], ["親子", "親屬法・親子關係"], ["離婚", "親屬法・離婚"]],
  };
  const chapter = (chapterMap[best.law] ?? []).find(([keyword]) => text.includes(keyword))?.[1] ?? `${best.law}核心概念`;
  const concepts = best.hits.slice(0, 4).map((concept) => {
    if (concept === "罪刑法定") return "罪刑法定原則";
    if (concept === "類推適用") return "禁止類推適用";
    if (concept === "習慣法") return "禁止習慣法";
    if (concept === "溯及既往") return "禁止溯及既往";
    return concept;
  });
  const statuteRules: Array<[string[], string]> = [
    [["故意", "殺人故意", "傷害故意"], "中華民國刑法第 13 條（故意）"],
    [["過失", "應注意", "能注意"], "中華民國刑法第 14 條（過失）"],
    [["不作為", "保證人地位", "防止結果發生"], "中華民國刑法第 15 條（不作為犯）"],
    [["未遂", "著手", "既遂"], "中華民國刑法第 25 條（未遂犯）"],
    [["中止未遂", "己意中止", "防止結果發生"], "中華民國刑法第 27 條（中止犯）"],
    [["共同正犯", "共同實行"], "中華民國刑法第 28 條（共同正犯）"],
    [["教唆"], "中華民國刑法第 29 條（教唆犯）"],
    [["幫助犯", "幫助他人犯罪"], "中華民國刑法第 30 條（幫助犯）"],
    [["正當防衛", "現在不法侵害"], "中華民國刑法第 23 條（正當防衛）"],
    [["緊急避難", "不得已之行為"], "中華民國刑法第 24 條（緊急避難）"],
    [["殺人", "殺人故意"], "中華民國刑法第 271 條（普通殺人罪）"],
    [["受囑託殺人", "承諾殺人", "教唆或幫助自殺"], "中華民國刑法第 275 條（受囑託或得承諾殺人、加工自殺）"],
    [["過失致死"], "中華民國刑法第 276 條（過失致死罪）"],
    [["傷害", "傷害故意"], "中華民國刑法第 277 條（普通傷害罪）"],
    [["重傷害", "使人受重傷"], "中華民國刑法第 278 條（重傷罪）"],
    [["總統", "副署", "公布法律"], "中華民國憲法第 37 條（總統公布法律、發布命令之副署）"],
    [["總統", "行政院"], "中華民國憲法第 53 條（行政院為國家最高行政機關）"],
    [["行政院會議", "國家重要事項"], "中華民國憲法第 58 條（行政院會議議決事項）"],
    [["總統", "直接選舉"], "中華民國憲法增修條文第 2 條（總統、副總統之選舉及職權）"],
    [["五權", "行政院", "立法院", "司法院", "考試院", "監察院"], "中華民國憲法中央政府各章（第 35 條以下）"],
    [["比例原則"], "中華民國憲法第 23 條（基本權限制）"],
    [["平等權"], "中華民國憲法第 7 條（平等權）"],
    [["言論自由"], "中華民國憲法第 11 條（表現自由）"],
    [["重傷", "刺青"], "中華民國刑法第 10 條（重傷之定義）"],
    [["得其承諾", "被害人同意"], "中華民國刑法第 282 條（受囑託或得承諾之傷害）"],
  ];
  const statutes = statuteRules
    .filter(([keywords]) => keywords.some((keyword) => text.includes(keyword)))
    .map(([, statute]) => statute)
    .filter((statute, index, all) => all.indexOf(statute) === index)
    .slice(0, 4);
  const usedPaperSubject = subjectPrior.includes(best.law);
  return {
    law: best.law,
    chapter,
    concepts,
    statutes,
    verified: usedPaperSubject || best.hits.length >= 2,
    classificationMethod: "系統自動辨識",
    classificationBasis: [
      ...(usedPaperSubject ? [`試卷科目：${question.subject_group}`] : []),
      ...(best.hits.length ? [`題幹／選項命中：${best.hits.slice(0, 3).join("、")}`] : []),
    ],
  };
}

const statuteSourceCodes: Record<string, { name: string; pcode: string }> = {
  憲法: { name: "中華民國憲法", pcode: "A0000001" },
  刑法: { name: "中華民國刑法", pcode: "C0000001" },
  刑事訴訟法: { name: "刑事訴訟法", pcode: "C0010001" },
  民法: { name: "民法", pcode: "B0000001" },
  民事訴訟法: { name: "民事訴訟法", pcode: "B0010001" },
  行政法: { name: "行政程序法", pcode: "A0030055" },
  公司法: { name: "公司法", pcode: "J0080001" },
  證券交易法: { name: "證券交易法", pcode: "G0400001" },
};

function statuteQueriesForClassification(classification: ReturnType<typeof classifyOfficialQuestion>) {
  const source = statuteSourceCodes[classification.law];
  if (!source) return [];
  const articles = classification.statutes.flatMap((statute) =>
    [...statute.matchAll(/第\s*(\d+)\s*條/g)].map((match) => Number(match[1])),
  );
  return articles.length ? [{ ...source, articles: [...new Set(articles)] }] : [];
}

function findOfficialQuestions(question: string) {
  const normalized = question.toLowerCase().replace(/[？?，。、；：]/g, " ").trim();
  if (!normalized) return [];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return firstExamQuestions.filter((item) => {
    const haystack = [
      item.exam_group,
      item.subject_group,
      item.stem,
      ...Object.values(item.options),
    ].join(" ").toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

function toPracticeQuestion(question: OfficialQuestion | undefined): PracticeQuestion | undefined {
  if (!question || !question.correct_answer || question.review_status === "needs_review") return undefined;
  const labels = ["A", "B", "C", "D"] as const;
  const answer = labels.indexOf(question.correct_answer);
  return {
    aliases: [],
    sourceLabel: "高點歷屆真題",
    topic: `${question.subject_group}｜第 ${question.number} 題`,
    prompt: question.stem,
    options: labels.map((label) => question.options[label]),
    answer,
    explanations: labels.map((label) =>
      label === question.correct_answer
        ? `本題匯入答案為 ${label}；高點逐題解析尚未接入，暫不補造理由。`
        : `本題匯入答案不是 ${label}；高點逐題解析尚未接入，暫不補造理由。`,
    ),
    sourceMeta: `${question.year} 年律師、司法官第一試｜高點考古題`,
    sourceUrl: question.source_url,
    reviewStatus: question.review_status,
  };
}

export default function Home() {
  const [activeView, setActiveView] = useState<"search" | "training" | "pastExams" | "essayReview" | "solutionBooks" | "issues">("search");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("全部資料");
  const [subject, setSubject] = useState<"法律" | "中級會計">("法律");
  const [lawScope, setLawScope] = useState<"自動判斷" | "刑法" | "公法">("自動判斷");
  const [searched, setSearched] = useState(false);
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [generalAiConsent, setGeneralAiConsent] = useState(false);
  const [followUpInput, setFollowUpInput] = useState("");
  const [followUpTurns, setFollowUpTurns] = useState<Array<{ question: string; answer: string }>>([]);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState("");
  const [coachMessage, setCoachMessage] = useState("");
  const [learningMode, setLearningMode] = useState<"summary" | "practice" | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submittedOption, setSubmittedOption] = useState<number | null>(null);
  const [savedForReview, setSavedForReview] = useState(false);
  const [selectedOfficialId, setSelectedOfficialId] = useState("");
  const [imagePanelOpen, setImagePanelOpen] = useState(false);
  const [imageName, setImageName] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [imageStep, setImageStep] = useState<"select" | "confirm" | "recognizing">("select");
  const [imageProgressStep, setImageProgressStep] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageQuestion, setImageQuestion] = useState("");
  const [imageRecognizedText, setImageRecognizedText] = useState("");
  const imageRequestIdRef = useRef(0);
  const [ocrError, setOcrError] = useState("");
  const [imageAnswerSource, setImageAnswerSource] = useState<{
    type: "exam_question" | "textbook_question" | "unconfirmed";
    note: string;
    uncertaintyNote?: string;
  } | null>(null);
  const [essayDemoOpen, setEssayDemoOpen] = useState(false);
  const [essayDemoQuestion, setEssayDemoQuestion] = useState<EssayDemoQuestion | null>(null);
  const [trainingTrack, setTrainingTrack] = useState<"choice" | "essay">("choice");
  const [pastExamStage, setPastExamStage] = useState<"first" | "second">("first");
  const [pastExamDomain, setPastExamDomain] = useState<"law" | "accounting">("law");
  const [accountingExamFormat, setAccountingExamFormat] = useState<"choice" | "essay">("choice");
  const [accountingExamIndex, setAccountingExamIndex] = useState(0);
  const [accountingExamOption, setAccountingExamOption] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [accountingExamSubmitted, setAccountingExamSubmitted] = useState(false);
  const [accountingExamMode, setAccountingExamMode] = useState<"sequence" | "random" | "wrong">("sequence");
  const [accountingExamAnswered, setAccountingExamAnswered] = useState(0);
  const [accountingExamCorrect, setAccountingExamCorrect] = useState(0);
  const [accountingExamWrongIds, setAccountingExamWrongIds] = useState<string[]>([]);
  const [accountingExamBookmarked, setAccountingExamBookmarked] = useState<string[]>([]);
  const [accountingAiExplanation, setAccountingAiExplanation] = useState("");
  const [accountingAiExplanationOpen, setAccountingAiExplanationOpen] = useState(true);
  const [accountingAiExplanationLoading, setAccountingAiExplanationLoading] = useState(false);
  const [accountingAiProgressStep, setAccountingAiProgressStep] = useState(0);
  const [accountingAiExplanationError, setAccountingAiExplanationError] = useState("");
  const [accountingExamResultPanel, setAccountingExamResultPanel] = useState<"ai" | "analysis" | "learning" | null>(null);
  const [accountingEssayIndex, setAccountingEssayIndex] = useState(0);
  const [accountingEssayDraft, setAccountingEssayDraft] = useState("");
  const [accountingEssaySubmitted, setAccountingEssaySubmitted] = useState(false);
  const [accountingEssaySampleMode, setAccountingEssaySampleMode] = useState<"correct" | "wrong" | null>(null);
  const [accountingCorrectionMode, setAccountingCorrectionMode] = useState<"self" | "coach" | "full" | null>(null);
  const [accountingCorrectionStep, setAccountingCorrectionStep] = useState(0);
  const [accountingCorrectionChoice, setAccountingCorrectionChoice] = useState("");
  const [accountingCorrectionAnswer, setAccountingCorrectionAnswer] = useState("");
  const [examSubjectFilter, setExamSubjectFilter] = useState("全部科目");
  const [pastExamIndex, setPastExamIndex] = useState(0);
  const [pastExamOption, setPastExamOption] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [pastExamSubmitted, setPastExamSubmitted] = useState(false);
  const [pastExamAnswered, setPastExamAnswered] = useState(0);
  const [pastExamCorrect, setPastExamCorrect] = useState(0);
  const [pastExamAiExplanation, setPastExamAiExplanation] = useState("");
  const [pastExamAiExplanationCache, setPastExamAiExplanationCache] = useState<"hit" | "miss" | null>(null);
  const [pastExamAiLoading, setPastExamAiLoading] = useState(false);
  const [pastExamAiProgressStep, setPastExamAiProgressStep] = useState(0);
  const [pastExamAiError, setPastExamAiError] = useState("");
  const [pastExamResultPanel, setPastExamResultPanel] = useState<"ai" | "analysis" | "learning" | null>(null);
  const [pastExamMode, setPastExamMode] = useState<"sequence" | "random" | "wrong">("sequence");
  const [pastExamBookmarked, setPastExamBookmarked] = useState<string[]>([]);
  const [pastExamWrongIds, setPastExamWrongIds] = useState<string[]>([]);
  const [lawExamAttempts, setLawExamAttempts] = useState<ExamAttempt[]>([]);
  const [accountingExamAttempts, setAccountingExamAttempts] = useState<ExamAttempt[]>([]);
  const [pastExamLibraryView, setPastExamLibraryView] = useState<"bookmarks" | "weakness" | null>(null);
  const [officialStatutes, setOfficialStatutes] = useState<OfficialStatuteArticle[]>([]);
  const [officialStatutesLoading, setOfficialStatutesLoading] = useState(false);
  const [officialStatutesError, setOfficialStatutesError] = useState("");
  const [officialStatutesCheckedAt, setOfficialStatutesCheckedAt] = useState("");
  const [secondExamIndex, setSecondExamIndex] = useState(0);
  const [secondExamDraft, setSecondExamDraft] = useState("");
  const [secondExamWritingMode, setSecondExamWritingMode] = useState<"guided" | "select">("guided");
  const [secondExamSelectStep, setSecondExamSelectStep] = useState<"issue" | "rule" | "application" | "conclusion">("issue");
  const [secondExamSelectChoices, setSecondExamSelectChoices] = useState<Record<"issue" | "rule" | "application" | "conclusion", string[]>>({
    issue: [],
    rule: [],
    application: [],
    conclusion: [],
  });
  const [secondExamGuidedOpen, setSecondExamGuidedOpen] = useState(false);
  const [secondExamGuidedStep, setSecondExamGuidedStep] = useState(0);
  const [secondExamHintLevel, setSecondExamHintLevel] = useState(0);
  const [secondExamSampleRevealed, setSecondExamSampleRevealed] = useState(false);
  const [secondExamSubmitted, setSecondExamSubmitted] = useState(false);
  const [secondExamComparison, setSecondExamComparison] = useState<EssayComparison | null>(null);
  const [secondExamTrace, setSecondExamTrace] = useState<EssayCoachTrace | null>(null);
  const [secondExamLoading, setSecondExamLoading] = useState(false);
  const [secondExamProgressStep, setSecondExamProgressStep] = useState(0);
  const [secondExamError, setSecondExamError] = useState("");
  const [secondExamCompletedIds, setSecondExamCompletedIds] = useState<string[]>([]);
  const [secondExamOfferOpen, setSecondExamOfferOpen] = useState(false);
  const [secondExamRewriteIssue, setSecondExamRewriteIssue] = useState("");
  const [secondExamRewriteDraft, setSecondExamRewriteDraft] = useState("");
  const [secondExamRewriteChecked, setSecondExamRewriteChecked] = useState(false);
  const [secondExamRewriteCount, setSecondExamRewriteCount] = useState(0);
  const [solutionBookId, setSolutionBookId] = useState<string>(solutionBooks[0].id);
  const [solutionExerciseIndex, setSolutionExerciseIndex] = useState(0);
  const [solutionOption, setSolutionOption] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [solutionEssay, setSolutionEssay] = useState("");
  const [solutionSubmitted, setSolutionSubmitted] = useState(false);
  const [solutionIssueChoices, setSolutionIssueChoices] = useState<string[]>([]);
  const [solutionIssueReady, setSolutionIssueReady] = useState(false);
  const [solutionWritingStep, setSolutionWritingStep] = useState<"issue" | "rule" | "application" | "conclusion">("issue");
  const [solutionWritingSelections, setSolutionWritingSelections] = useState<Record<"rule" | "application" | "conclusion", string[]>>({
    rule: [],
    application: [],
    conclusion: [],
  });
  const [solutionSeenIds, setSolutionSeenIds] = useState<string[]>([]);
  const [trainingOption, setTrainingOption] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [trainingSubmitted, setTrainingSubmitted] = useState(false);
  const [trainingHint, setTrainingHint] = useState(false);
  const [issueSearch, setIssueSearch] = useState("");
  const [issueSubject, setIssueSubject] = useState("全部科目");
  const [issueCatalogOpen, setIssueCatalogOpen] = useState(false);
  const [issueSpottingDomain, setIssueSpottingDomain] = useState<IssueSpottingQuestion["domain"]>("刑法");
  const [guidedQuestionSource, setGuidedQuestionSource] = useState<"historical" | "demo">("historical");
  const [originalQuestionOpen, setOriginalQuestionOpen] = useState(true);
  const [originalChallengeAnswer, setOriginalChallengeAnswer] = useState<number | null>(null);
  const [originalChallengeSubmitted, setOriginalChallengeSubmitted] = useState(false);
  const [selectedIssueKey, setSelectedIssueKey] = useState("");
  const [issueWorkspaceTab, setIssueWorkspaceTab] = useState<"learn" | "choice" | "essay" | "history" | "teachers" | "diagnosis">("learn");
  const [issuePracticeAnswer, setIssuePracticeAnswer] = useState("");
  const [issuePracticeSubmitted, setIssuePracticeSubmitted] = useState(false);
  const [issueExplanationOpen, setIssueExplanationOpen] = useState(false);
  const [issueSpottingIndex, setIssueSpottingIndex] = useState(0);
  const [guidedIssueStep, setGuidedIssueStep] = useState(0);
  const [guidedIssueAnswers, setGuidedIssueAnswers] = useState<number[]>([]);
  const [guidedAttemptId, setGuidedAttemptId] = useState("");
  const [guidedLearnerKey, setGuidedLearnerKey] = useState("");
  const [guidedAttemptRecords, setGuidedAttemptRecords] = useState<GuidedAttemptRecord[]>([]);
  const [guidedRecordStatus, setGuidedRecordStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [guidedWeaknessOpen, setGuidedWeaknessOpen] = useState(false);
  const [issueEssayDraft, setIssueEssayDraft] = useState("");
  const [expandedIssueQuestionId, setExpandedIssueQuestionId] = useState("");
  const examSubjectGroups = useMemo(
    () => ["全部科目", ...Array.from(new Set(firstExamQuestions.map((item) => item.subject_group)))],
    [],
  );
  const filteredPastExams = useMemo(
    () => firstExamQuestions.filter((item) =>
      item.correct_answer &&
      item.review_status === "ready_for_review" &&
      (examSubjectFilter === "全部科目" || item.subject_group === examSubjectFilter),
    ),
    [examSubjectFilter],
  );
  const practicePastExams = useMemo(
    () => pastExamMode === "wrong"
      ? filteredPastExams.filter((item) => pastExamWrongIds.includes(officialQuestionId(item)))
      : filteredPastExams,
    [filteredPastExams, pastExamMode, pastExamWrongIds],
  );
  const currentPastExam = practicePastExams[pastExamIndex % Math.max(practicePastExams.length, 1)];
  const currentSecondExam = secondExamQuestions[secondExamIndex % secondExamQuestions.length];
  const accountingChoiceQuestions = useMemo(
    () => solutionBookExercises.filter((item) => item.type === "choice" && item.bookId.startsWith("zheng-")),
    [],
  );
  const accountingPracticeQuestions = useMemo(
    () => accountingExamMode === "wrong"
      ? accountingChoiceQuestions.filter((item) => accountingExamWrongIds.includes(item.id))
      : accountingChoiceQuestions,
    [accountingChoiceQuestions, accountingExamMode, accountingExamWrongIds],
  );
  const accountingEssayQuestions = useMemo(
    () => solutionBookExercises.filter((item) => item.type === "essay" && item.bookId === "zheng-hong-essay"),
    [],
  );
  const currentAccountingChoice = accountingPracticeQuestions[
    accountingExamIndex % Math.max(accountingPracticeQuestions.length, 1)
  ];
  const currentAccountingEssay = accountingEssayQuestions[accountingEssayIndex % accountingEssayQuestions.length];
  const issueIndex = useMemo<IssueIndexItem[]>(() => {
    const issues = new Map<string, IssueIndexItem>();
    firstExamQuestions
      .filter((item) => item.review_status === "ready_for_review")
      .forEach((item) => {
        const classification = classifyOfficialQuestion(item);
        classification.concepts.forEach((concept) => {
          const key = `${classification.law}|${classification.chapter}|${concept}`;
          const current = issues.get(key) ?? {
            key,
            subject: classification.law,
            chapter: classification.chapter,
            concept,
            questionCount: 0,
            aliases: [],
          };
          current.questionCount += 1;
          current.aliases = Array.from(new Set([
            ...current.aliases,
            item.subject_group,
            classification.law,
            classification.chapter,
          ]));
          issues.set(key, current);
        });
      });

    topicBundles.forEach((topic) => {
      const relatedEvidence = evidence.find((item) =>
        item.tags.some((tag) => topic.aliases.some((alias) => tag.includes(alias) || alias.includes(tag))),
      );
      const subject = relatedEvidence?.lawScope === "公法" ? "公法" : "刑法";
      const chapter = relatedEvidence?.chapter ?? "教材爭點";
      const key = `${subject}|${chapter}|${topic.issue}`;
      if (!issues.has(key)) {
        issues.set(key, {
          key,
          subject,
          chapter,
          concept: topic.issue,
          questionCount: topic.resources.filter((item) => item.kind === "歷屆考題").length,
          aliases: topic.aliases,
        });
      }
    });

    return Array.from(issues.values()).sort((a, b) =>
      b.questionCount - a.questionCount || a.concept.localeCompare(b.concept, "zh-TW"),
    );
  }, []);
  const getIssueDomain = (subject: string) => {
    if (/(憲法|行政法|國際公法|公法)/.test(subject)) return "公法";
    if (/刑事訴訟法/.test(subject)) return "刑事訴訟法";
    if (/民事訴訟法/.test(subject)) return "民事訴訟法";
    if (/(公司法|證券交易法|票據法|保險法|商法)/.test(subject)) return "商法";
    if (/刑法/.test(subject)) return "刑法";
    if (/民法/.test(subject)) return "民法";
    return "";
  };
  const issueSubjects = ["全部科目", "公法", "民法", "刑法", "民事訴訟法", "刑事訴訟法", "商法"];
  const filteredIssueIndex = useMemo(() => {
    const normalized = issueSearch.trim().toLowerCase();
    return issueIndex.filter((item) => {
      const domain = getIssueDomain(item.subject);
      return domain &&
      (issueSubject === "全部科目" || domain === issueSubject) &&
      (!normalized || [item.subject, item.chapter, item.concept, ...item.aliases]
        .join(" ")
        .toLowerCase()
        .includes(normalized));
    });
  }, [issueIndex, issueSearch, issueSubject]);
  const selectedIssue = issueIndex.find((item) => item.key === selectedIssueKey);
  const selectedIssueTopic = selectedIssue
    ? topicBundles.find((topic) =>
        topic.issue.includes(selectedIssue.concept) ||
        selectedIssue.concept.includes(topic.key) ||
        topic.aliases.some((alias) =>
          alias.includes(selectedIssue.concept) || selectedIssue.concept.includes(alias),
        ),
      )
    : undefined;
  const selectedIssueEvidence = selectedIssue
    ? evidence.filter((item) => {
        const needles = [selectedIssue.concept, ...selectedIssue.aliases].filter((value) => value.length >= 2);
        const haystack = [item.title, item.chapter, ...item.tags].join(" ");
        return needles.some((needle) => haystack.includes(needle) || needle.includes(item.title));
      }).slice(0, 5)
    : [];
  const selectedIssueQuestions = selectedIssue
    ? firstExamQuestions.filter((item) => {
        if (item.review_status !== "ready_for_review") return false;
        const classification = classifyOfficialQuestion(item);
        return classification.law === selectedIssue.subject &&
          classification.concepts.some((concept) =>
            concept === selectedIssue.concept ||
            concept.includes(selectedIssue.concept) ||
            selectedIssue.concept.includes(concept),
          );
      }).slice(0, 6)
    : [];
  const isCausalProcessIssue = Boolean(
    selectedIssue &&
    (selectedIssue.concept.includes("因果歷程") ||
      selectedIssue.concept.includes("客觀歸責")),
  );
  const selectedIssueSpottingQuestion = selectedIssue
    ? issueSpottingQuestions.find((question) => {
        const concept = `${selectedIssue.concept} ${selectedIssue.chapter} ${selectedIssue.aliases.join(" ")}`;
        if (question.topic.includes("因果歷程")) return concept.includes("因果歷程") || concept.includes("客觀歸責");
        if (question.topic.includes("財產犯罪")) return concept.includes("詐欺") || concept.includes("竊盜") || concept.includes("財產犯罪");
        if (question.topic.includes("行政處分")) return concept.includes("行政處分") || concept.includes("觀念通知");
        if (question.topic.includes("基本權限制")) return concept.includes("比例原則") || concept.includes("言論自由") || concept.includes("基本權");
        return false;
      })
    : undefined;
  const lawBookmarkedQuestions = useMemo(
    () => firstExamQuestions.filter((item) => pastExamBookmarked.includes(officialQuestionId(item))),
    [pastExamBookmarked],
  );
  const accountingBookmarkedQuestions = useMemo(
    () => accountingChoiceQuestions.filter((item) => accountingExamBookmarked.includes(item.id)),
    [accountingChoiceQuestions, accountingExamBookmarked],
  );
  const makeStatus = (attempts: number, wrong: number, latestCorrect: boolean): Pick<WeaknessProfile, "status" | "confidence"> => {
    if (attempts < 2) return { status: "待觀察", confidence: "資料不足" };
    if (latestCorrect && wrong > 0) return { status: "改善中", confidence: attempts >= 4 ? "高度可信" : "中度可信" };
    if (wrong >= 3 || (attempts >= 3 && wrong / attempts >= .67)) return { status: "核心弱點", confidence: attempts >= 4 ? "高度可信" : "中度可信" };
    return { status: "可能弱點", confidence: "中度可信" };
  };
  const lawWeaknesses = useMemo<WeaknessProfile[]>(() => {
    const profiles = new Map<string, WeaknessProfile & { latestCorrect: boolean }>();
    const attempts = lawExamAttempts.length
      ? lawExamAttempts
      : pastExamWrongIds.map((questionId) => ({ questionId, correct: false, answeredAt: "" }));
    attempts.forEach((attempt) => {
      const item = firstExamQuestions.find((question) => officialQuestionId(question) === attempt.questionId);
      if (!item) return;
      const classification = classifyOfficialQuestion(item);
      const concept = classification.concepts[0] ?? classification.chapter;
      const key = `${classification.law}|${classification.chapter}|${concept}`;
      const current = profiles.get(key) ?? {
        key, subject: classification.law, chapter: classification.chapter, concept,
        attempts: 0, wrong: 0, correct: 0, status: "待觀察", confidence: "資料不足", latestCorrect: false,
      };
      current.attempts += 1;
      current.correct += attempt.correct ? 1 : 0;
      current.wrong += attempt.correct ? 0 : 1;
      current.latestCorrect = attempt.correct;
      profiles.set(key, current);
    });
    return Array.from(profiles.values())
      .filter((item) => item.wrong > 0)
      .map(({ latestCorrect, ...item }) => ({ ...item, ...makeStatus(item.attempts, item.wrong, latestCorrect) }))
      .sort((a, b) => b.wrong - a.wrong || b.attempts - a.attempts);
  }, [lawExamAttempts, pastExamWrongIds]);
  const accountingWeaknesses = useMemo<WeaknessProfile[]>(() => {
    const profiles = new Map<string, WeaknessProfile & { latestCorrect: boolean }>();
    const attempts = accountingExamAttempts.length
      ? accountingExamAttempts
      : accountingExamWrongIds.map((questionId) => ({ questionId, correct: false, answeredAt: "" }));
    attempts.forEach((attempt) => {
      const item = accountingChoiceQuestions.find((question) => question.id === attempt.questionId);
      if (!item) return;
      const key = `${item.chapter}|${item.topic}`;
      const current = profiles.get(key) ?? {
        key, subject: "中級會計", chapter: item.chapter, concept: item.topic,
        attempts: 0, wrong: 0, correct: 0, status: "待觀察", confidence: "資料不足", latestCorrect: false,
      };
      current.attempts += 1;
      current.correct += attempt.correct ? 1 : 0;
      current.wrong += attempt.correct ? 0 : 1;
      current.latestCorrect = attempt.correct;
      profiles.set(key, current);
    });
    return Array.from(profiles.values())
      .filter((item) => item.wrong > 0)
      .map(({ latestCorrect, ...item }) => ({ ...item, ...makeStatus(item.attempts, item.wrong, latestCorrect) }))
      .sort((a, b) => b.wrong - a.wrong || b.attempts - a.attempts);
  }, [accountingChoiceQuestions, accountingExamAttempts, accountingExamWrongIds]);
  const guidedWeaknesses = useMemo(() => {
    const groups = new Map<string, {
      key: string;
      domain: string;
      topic: string;
      stepLabel: string;
      attempts: number;
      wrong: number;
      latestCorrect: boolean;
    }>();
    [...guidedAttemptRecords]
      .sort((a, b) => a.answeredAt.localeCompare(b.answeredAt))
      .forEach((record) => {
        const key = `${record.domain}|${record.topic}|${record.stepId}`;
        const current = groups.get(key) ?? {
          key,
          domain: record.domain,
          topic: record.topic,
          stepLabel: record.stepLabel,
          attempts: 0,
          wrong: 0,
          latestCorrect: false,
        };
        current.attempts += 1;
        current.wrong += record.correct ? 0 : 1;
        current.latestCorrect = record.correct;
        groups.set(key, current);
      });
    return Array.from(groups.values())
      .filter((item) => item.wrong > 0)
      .map((item) => ({
        ...item,
        status: item.latestCorrect
          ? "改善中"
          : item.wrong >= 3
            ? "核心弱點"
            : item.wrong >= 2
              ? "可能弱點"
              : "待觀察",
      }))
      .sort((a, b) => b.wrong - a.wrong || b.attempts - a.attempts);
  }, [guidedAttemptRecords]);

  useEffect(() => {
    try {
      setPastExamBookmarked(JSON.parse(localStorage.getItem("ibrain-law-bookmarks") ?? "[]"));
      setPastExamWrongIds(JSON.parse(localStorage.getItem("ibrain-law-wrong") ?? "[]"));
      setAccountingExamBookmarked(JSON.parse(localStorage.getItem("ibrain-accounting-bookmarks") ?? "[]"));
      setAccountingExamWrongIds(JSON.parse(localStorage.getItem("ibrain-accounting-wrong") ?? "[]"));
      setLawExamAttempts(JSON.parse(localStorage.getItem("ibrain-law-attempts") ?? "[]"));
      setAccountingExamAttempts(JSON.parse(localStorage.getItem("ibrain-accounting-attempts") ?? "[]"));
    } catch {
      // Ignore invalid device-local data and start with an empty learning record.
    }
  }, []);

  useEffect(() => {
    if (!essayDemoOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEssayDemoOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [essayDemoOpen]);

  useEffect(() => {
    const storedKey = localStorage.getItem("ibrain-guided-learner-key");
    const learnerKey = storedKey || `learner-${createClientId()}`;
    if (!storedKey) localStorage.setItem("ibrain-guided-learner-key", learnerKey);
    Promise.resolve().then(() => {
      setGuidedLearnerKey(learnerKey);
      setGuidedAttemptId(createClientId());
    });
    fetch(`/api/guided-attempts?learnerKey=${encodeURIComponent(learnerKey)}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: { attempts?: GuidedAttemptRecord[] }) => setGuidedAttemptRecords(payload.attempts ?? []))
      .catch(() => {
        // The exercise remains usable if the learning-record service is temporarily unavailable.
      });
  }, []);

  useEffect(() => {
    localStorage.setItem("ibrain-law-bookmarks", JSON.stringify(pastExamBookmarked));
  }, [pastExamBookmarked]);
  useEffect(() => {
    localStorage.setItem("ibrain-law-attempts", JSON.stringify(lawExamAttempts.slice(-300)));
  }, [lawExamAttempts]);
  useEffect(() => {
    localStorage.setItem("ibrain-accounting-attempts", JSON.stringify(accountingExamAttempts.slice(-300)));
  }, [accountingExamAttempts]);
  useEffect(() => {
    localStorage.setItem("ibrain-law-wrong", JSON.stringify(pastExamWrongIds));
  }, [pastExamWrongIds]);
  useEffect(() => {
    localStorage.setItem("ibrain-accounting-bookmarks", JSON.stringify(accountingExamBookmarked));
  }, [accountingExamBookmarked]);
  useEffect(() => {
    localStorage.setItem("ibrain-accounting-wrong", JSON.stringify(accountingExamWrongIds));
  }, [accountingExamWrongIds]);

  function accountingEssaySample(exercise: SolutionBookExercise, mode: "correct" | "wrong") {
    if (mode === "correct") {
      return [...(exercise.explanation ?? []), `答案：${exercise.standardAnswer ?? ""}`].join("\n");
    }
    const commonWrongSamples: Record<string, string> = {
      "zh-essay-1": "銷貨淨額＝570,000－67,500＋90,000＝592,500。\n進貨＝390,000＋120,000－97,500＝412,500。\n銷貨成本＝147,000＋412,500＝559,500。\n答案：銷貨淨額 592,500；銷貨成本 559,500。",
      "zh-essay-2": "銷貨淨額＝500,000－15,000－8,000＝477,000。\n淨利＝477,000－200,000－70,000－60,000－15,000＝132,000。\n股利＝120,000＋132,000－150,000＝102,000。",
      "zh-essay-3": "向客戶收現＝950,000＋150,000＝1,100,000。\n支付供應商＝690,000－120,000－170,000＝400,000。\n支付營業費用＝56,000＋24,000＋18,000＝98,000。\n營業活動淨現金流入＝602,000。",
      "zh-essay-4": "攸關性是資料必須完全正確；忠實表述是不同公司可以比較；可驗證性是資料要及時。漏報或誤報會影響決策，屬於忠實表述。",
      "zh-essay-5": "銀行端＝481,000－225,000＋325,000＝581,000。\n公司端＝265,000－125,000＋9,000＝149,000。\n兩邊不同，可能是題目資料有誤。",
      "zh-essay-6": "售後租回只要收到價款就一律認列全部出售利益；CPI 調整與保證殘值均不必列入租賃負債。",
      "zh-essay-7": "FVOCI 債務工具的利息、減損與評價差額全部列入其他綜合損益，出售時累積金額直接轉入保留盈餘。",
      "zh-essay-8": "市占率屬市價條件，應直接納入給與日公允價值；日後未達標也不得迴轉已認列費用。",
      "zh-essay-9": "政策、估計與前期錯誤都應追溯重編，才能讓以前年度的報表保持一致。",
      "zh-essay-10": "淨利加回折舊；處分資產利益也加回。應收帳款與存貨增加代表資產增加，所以加回；應付帳款增加則扣除。",
    };
    return commonWrongSamples[exercise.id] ?? "我只記得最後答案，但不確定公式與計算步驟。";
  }

  function accountingEssayDiagnosis(exercise: SolutionBookExercise) {
    const diagnoses: Record<string, { correct: string; firstError: string; correction: string; result: string }> = {
      "zh-essay-1": {
        correct: "進貨 412,500 算對。",
        firstError: "第一個錯誤在銷貨淨額：你把期末應收帳款 67,500 減掉、期初應收帳款 90,000 加回，方向顛倒。",
        correction: "正確應為 570,000＋67,500－90,000＝547,500。銷貨成本還漏扣期末存貨 187,500。",
        result: "銷貨成本＝147,000＋412,500－187,500＝372,000。",
      },
      "zh-essay-2": {
        correct: "銷貨淨額 477,000 與稅前淨利 132,000 都算對。",
        firstError: "第一個錯誤在稅後淨利：你把 132,000 直接帶入保留盈餘公式，漏扣所得稅 32,000。",
        correction: "稅後淨利＝132,000－32,000＝100,000。",
        result: "股利＝120,000＋100,000－150,000＝70,000，不是 102,000。",
      },
      "zh-essay-3": {
        correct: "你有辨認出要分別計算客戶收現、供應商付現與營業費用付現。",
        firstError: "第一個錯誤在客戶收現：應收帳款增加 150,000 代表有銷貨尚未收現，應從銷貨收入扣除，不是加回。",
        correction: "客戶收現＝950,000－150,000＝800,000；供應商付現＝690,000－170,000＝520,000，存貨減少 120,000 不應在已知進貨時重複扣除。",
        result: "營業費用付現＝56,000＋24,000－18,000＝62,000；淨現金流入＝800,000－520,000－62,000＝218,000。",
      },
      "zh-essay-4": {
        correct: "你有列出攸關性、忠實表述、可比性、可驗證性與時效性等名稱。",
        firstError: "第一個錯誤是把各品質特性的定義對錯位置：『資料完全正確』不是攸關性的定義，『不同公司可以比較』也不是忠實表述。",
        correction: "攸關性看資訊是否具有預測或確認價值；忠實表述要求完整、中立且無錯誤；可比性才是辨識項目間異同。",
        result: "『漏報或誤報會影響決策』最直接對應攸關性中的重大性判斷。",
      },
      "zh-essay-5": {
        correct: "你有分成銀行端與公司端計算。",
        firstError: "第一個錯誤在銀行端：在途存款 225,000 應加回銀行餘額，未兌現支票 325,000 應扣除；你的加減方向相反。",
        correction: "銀行端＝481,000＋225,000－325,000＝381,000；公司端＝265,000＋125,000－9,000＝381,000。",
        result: "兩端可調節至同一正確餘額 381,000，題目資料並沒有矛盾。",
      },
      "zh-essay-6": {
        correct: "你有注意到交易包含出售與租回兩個部分。",
        firstError: "第一個錯誤是直接假定收到價款就構成銷售；必須先依 IFRS 15 判斷控制是否移轉。",
        correction: "構成銷售時只能認列移轉權利的損益，並認列租回使用權資產與租賃負債；CPI 原始衡量採開始日指數。",
        result: "保證殘值的預期支付額應納入租賃負債；若不構成銷售，原資產繼續認列，價款列金融負債。",
      },
      "zh-essay-7": {
        correct: "你有辨認出這是 FVOCI 債務工具。",
        firstError: "第一個錯誤是把利息與減損也全部列入其他綜合損益。",
        correction: "利息收入與預期信用損失列入損益，只有公允價值評價差額列入其他綜合損益。",
        result: "出售時累積評價差額應重分類至損益，不是直接轉入保留盈餘。",
      },
      "zh-essay-8": {
        correct: "你有抓到市占率是認股權的既得條件。",
        firstError: "第一個錯誤是把市占率分類為市價條件；市占率與企業營運成果相關，屬非市價績效條件。",
        correction: "它不納入給與日公允價值，而是在既得期間依預期最終既得數量調整費用。",
        result: "若最終未達市占率目標，先前累計認列的酬勞成本應迴轉為零。",
      },
      "zh-essay-9": {
        correct: "你有辨認出政策、估計與前期錯誤是三種不同類型。",
        firstError: "第一個錯誤是認為三者都要追溯重編；會計估計值變動不能用新資訊回頭改以前年度。",
        correction: "政策變動原則上追溯適用；估計值變動採推延適用。",
        result: "重大前期錯誤才原則上追溯重編。",
      },
      "zh-essay-10": {
        correct: "折舊加回的方向正確。",
        firstError: "第一個錯誤在處分資產利益：利益已增加淨利但屬投資活動，間接法應從淨利扣除，不是加回。",
        correction: "應收帳款與存貨增加代表占用現金，應扣除；應付帳款增加代表尚未付現，應加回。",
        result: "正確架構為：淨利＋折舊－處分利益－應收帳款增加－存貨增加＋應付帳款增加。",
      },
    };
    return diagnoses[exercise.id] ?? {
      correct: "系統會先保留可核對為正確的步驟。",
      firstError: "目前尚無法從這份作答可靠定位第一個錯誤。",
      correction: "請補上完整公式、代入數字與計算結果後再送出。",
      result: `標準答案：${exercise.standardAnswer ?? "尚待核對"}`,
    };
  }

  const currentAccountingEssayDiagnosis = accountingEssayDiagnosis(currentAccountingEssay);

  async function generateAccountingExplanation() {
    setAccountingAiExplanationOpen(true);
    setAccountingAiExplanation("");
    setAccountingAiExplanationError("");
    setAccountingAiProgressStep(0);
    setAccountingAiExplanationLoading(true);
    try {
      const options = currentAccountingChoice.options
        ? (["A", "B", "C", "D"] as const).map((label) => `${label}. ${currentAccountingChoice.options?.[label]}`).join("\n")
        : "";
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `請用繁體中文解析下列會計選擇題。這是給學生看的可學習解題流程，不要揭露模型內部思考，也不要只給結論。請嚴格依下列五個標題輸出，每段簡潔、具體：
題型判斷：辨識本題屬於哪一章與哪一種題型。
關鍵字：列出題幹中真正影響判斷或計算的關鍵字、數字與條件。
核心考點：說明本題正在測驗的會計觀念、公式或準則。
解題步驟：依序列式、計算或排除選項；若資料不足以判斷某選項，必須明說。
答案與驗算：寫出標準答案 ${currentAccountingChoice.answer}，並以另一種簡短方式核對。不得因自己的計算衝突就直接判定教材答案錯誤，應先重讀括號、分數線、正負號與表格結構。

題目：
${currentAccountingChoice.stem}
${options}`,
          allowGeneralAi: true,
          standardAnswer: currentAccountingChoice.answer,
        }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) throw new Error("AI 解析服務暫時無法使用，請稍後再試。");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI 解析服務暫時無法使用，請稍後再試。");
      setAccountingAiExplanation(payload.answer);
    } catch (error) {
      setAccountingAiExplanationError(error instanceof Error ? error.message : "AI 解析服務暫時無法使用，請稍後再試。");
    } finally {
      setAccountingAiExplanationLoading(false);
    }
  }

  async function generatePastExamExplanation() {
    if (!currentPastExam?.correct_answer) return;
    setPastExamAiExplanation("");
    setPastExamAiError("");
    setPastExamAiProgressStep(0);
    setPastExamAiLoading(true);
    try {
      const options = (["A", "B", "C", "D"] as const)
        .map((label) => `${label}. ${currentPastExam.options[label]}`)
        .join("\n");
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `請用繁體中文解析下列中華民國法律選擇題。這是給考生學習的可核對解題流程，不要揭露模型內部思考，也不要只給答案。標準答案已鎖定為 ${currentPastExam.correct_answer}，不得自行更改；若你認為題目有疑義，仍須先依標準答案解釋，再另行標示疑義。

請嚴格依六個標題輸出，每段簡潔、具體：
簡單解析：先用 2 至 3 句白話說明為什麼標準答案是 ${currentPastExam.correct_answer}，讓初學者先聽懂，再進入法律分析。
題型判斷：辨識法律科目、章節與題型。
關鍵字：抓出會改變法律判斷的行為、故意內容、因果歷程、身分或程序條件。
核心考點：列出必須使用的法條概念、實務或學說爭點；無法確認條號時不得虛構。
解題步驟：依序分析 A、B、C、D，說明成立或不成立的關鍵理由，不得添加題目沒有的事實。
答案與驗算：確認標準答案 ${currentPastExam.correct_answer}，並檢查結論是否與各選項分析一致。

題目：
${currentPastExam.stem}
${options}`,
          allowGeneralAi: true,
          standardAnswer: currentPastExam.correct_answer,
          explanationCache: {
            questionId: `${currentPastExam.year}-${currentPastExam.exam_group}-${currentPastExam.subject_group}-${currentPastExam.number}`,
            contentVersion: "official-first-exam-explanation-v1",
          },
        }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) throw new Error("AI 解析服務暫時無法使用，請稍後再試。");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI 解析服務暫時無法使用，請稍後再試。");
      const answer = typeof payload.answer === "string" ? payload.answer.trim() : "";
      if (!answer) throw new Error("AI 沒有回傳解析內容，請按「再試一次」。");
      setPastExamAiExplanation(answer);
      setPastExamAiExplanationCache(payload.cache?.status === "hit" ? "hit" : payload.cache?.status === "miss" ? "miss" : null);
    } catch (error) {
      setPastExamAiError(error instanceof Error ? error.message : "AI 解析服務暫時無法使用，請稍後再試。");
    } finally {
      setPastExamAiLoading(false);
    }
  }

  useEffect(() => {
    if (!accountingAiExplanationLoading) return;
    const timer = window.setInterval(() => {
      setAccountingAiProgressStep((step) => Math.min(step + 1, accountingFlowLabels.length - 1));
    }, 1250);
    return () => window.clearInterval(timer);
  }, [accountingAiExplanationLoading]);

  useEffect(() => {
    if (!pastExamAiLoading) return;
    const timer = window.setInterval(() => {
      setPastExamAiProgressStep((step) => Math.min(step + 1, accountingFlowLabels.length - 1));
    }, 1250);
    return () => window.clearInterval(timer);
  }, [pastExamAiLoading]);

  useEffect(() => {
    if (!secondExamLoading) return;
    const timer = window.setInterval(() => {
      setSecondExamProgressStep((step) => Math.min(step + 1, 4));
    }, 1400);
    return () => window.clearInterval(timer);
  }, [secondExamLoading]);
  const currentGuidedSamples = currentSecondExam.studentSample
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const currentGuidedIndex = Math.min(secondExamGuidedStep, Math.max(currentGuidedSamples.length - 1, 0));
  const currentGuidedSample = currentGuidedSamples[currentGuidedIndex] ?? currentSecondExam.studentSample;
  const currentGuidedIssue =
    currentSecondExam.issuePreview[currentGuidedIndex % currentSecondExam.issuePreview.length];
  const secondExamTeacherSentences = currentSecondExam.teacherSolution.fullText
    .split(/(?<=[。；])/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length >= 12);
  const secondExamSelectOptions: Record<"issue" | "rule" | "application" | "conclusion", string[]> = {
    issue: currentSecondExam.issuePreview,
    rule: secondExamTeacherSentences
      .filter((item) => /(刑法|訴訟法|第\s*\d+\s*條|原則|要件|應以|須判斷|應檢討)/.test(item))
      .slice(0, 6),
    application: secondExamTeacherSentences
      .filter((item) => /(本案|題目|甲|乙|丙|丁|名牌包|行為|當時|若|雖)/.test(item))
      .slice(0, 6),
    conclusion: secondExamTeacherSentences
      .filter((item) => /(成立|不成立|合法|違法|應否定|應肯定|得成立|不得)/.test(item))
      .slice(0, 6),
  };
  const currentPastExamClassification = useMemo(
    () => currentPastExam ? classifyOfficialQuestion(currentPastExam) : null,
    [currentPastExam],
  );
  const currentPastExamResources = useMemo(() => {
    if (!currentPastExamClassification || currentPastExamClassification.law === "AI 暫定分類中") return [];
    const needles = [
      currentPastExamClassification.law,
      currentPastExamClassification.chapter,
      ...currentPastExamClassification.concepts,
    ];
    return verifiedCatalog.filter((item) =>
      ["課程", "書籍", "期刊"].includes(item.kind) &&
      needles.some((needle) =>
        item.aliases.some((alias) => needle.includes(alias) || alias.includes(needle)),
      ),
    ).sort((a, b) => {
      const order: Record<CatalogItem["kind"], number> = { 書籍: 0, 課程: 1, 期刊: 2, 考情: 3 };
      return order[a.kind] - order[b.kind];
    }).slice(0, 6);
  }, [currentPastExamClassification]);
  const currentStatuteQueries = useMemo(
    () => currentPastExamClassification ? statuteQueriesForClassification(currentPastExamClassification) : [],
    [currentPastExamClassification],
  );

  useEffect(() => {
    if (!pastExamSubmitted || currentStatuteQueries.length === 0) return;
    let cancelled = false;
    async function loadOfficialStatutes() {
      await Promise.resolve();
      if (cancelled) return;
      setOfficialStatutes([]);
      setOfficialStatutesError("");
      setOfficialStatutesCheckedAt("");
      setOfficialStatutesLoading(true);
      try {
        const response = await fetch("/api/statutes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queries: currentStatuteQueries }),
        });
        const payload = await response.json() as {
          articles?: OfficialStatuteArticle[];
          checkedAt?: string;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "官方法規查詢失敗。");
        if (!cancelled) {
          setOfficialStatutes(payload.articles ?? []);
          setOfficialStatutesCheckedAt(payload.checkedAt ?? "");
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setOfficialStatutesError(error instanceof Error ? error.message : "官方法規查詢失敗。");
        }
      } finally {
        if (!cancelled) setOfficialStatutesLoading(false);
      }
    }
    void loadOfficialStatutes();
    return () => { cancelled = true; };
  }, [pastExamSubmitted, currentPastExam, currentStatuteQueries]);
  const currentSolutionBook = solutionBooks.find((book) => book.id === solutionBookId) ?? solutionBooks[0];
  const currentSolutionExercises = solutionBookExercises.filter((exercise) => exercise.bookId === solutionBookId);
  const currentSolutionExercise = currentSolutionExercises[solutionExerciseIndex % Math.max(currentSolutionExercises.length, 1)];
  const hasAlternativeSolutionExercise = currentSolutionExercises.some(
    (exercise) => exercise.id !== currentSolutionExercise?.id,
  );
  const currentSolutionCompanionBooks = currentSolutionExercise
    ? solutionCompanionBooks[currentSolutionExercise.id as keyof typeof solutionCompanionBooks] ?? []
    : [];
  const currentSolutionIssueSpotting = currentSolutionExercise
    ? solutionIssueSpotting[currentSolutionExercise.id]
    : undefined;
  const currentSolutionWritingGuide = currentSolutionExercise
    ? solutionWritingGuides[currentSolutionExercise.id]
    : undefined;
  const currentSolutionWritingStep = currentSolutionWritingGuide?.steps.find(
    (step) => step.id === solutionWritingStep,
  ) ?? currentSolutionWritingGuide?.steps[0];
  const solutionIssueMatches = currentSolutionIssueSpotting
    ? currentSolutionIssueSpotting.correctIds.filter((id) => solutionIssueChoices.includes(id))
    : [];
  const solutionIssueMisses = currentSolutionIssueSpotting
    ? currentSolutionIssueSpotting.correctIds.filter((id) => !solutionIssueChoices.includes(id))
    : [];
  const solutionIssueExtras = currentSolutionIssueSpotting
    ? solutionIssueChoices.filter((id) => !currentSolutionIssueSpotting.correctIds.includes(id))
    : [];
  const currentSolutionCompanionCourse =
    solutionCompanionCourses[solutionBookId as keyof typeof solutionCompanionCourses];
  const currentSolutionChapters = Array.from(new Set(currentSolutionExercises.map((exercise) => exercise.chapter)));
  const [solutionChapterHistory, setSolutionChapterHistory] = useState<string[]>([]);
  const [trainingQuestionIndex, setTrainingQuestionIndex] = useState(0);
  const [trainingVariant, setTrainingVariant] = useState(false);
  const [essayDraft, setEssayDraft] = useState("");
  const [essayReviewed, setEssayReviewed] = useState(false);
  const [essayIssueStep, setEssayIssueStep] = useState(0);
  const [essayCoachReply, setEssayCoachReply] = useState("");
  const [essayCoachTurns, setEssayCoachTurns] = useState<Array<{ answer: string; question: string }>>([]);
  const [essayStartHint, setEssayStartHint] = useState(0);
  const [essayCoachHint, setEssayCoachHint] = useState(0);
  const [essayCoachAnalysis, setEssayCoachAnalysis] = useState<EssayCoachAnalysis | null>(null);
  const [essayCoachTrace, setEssayCoachTrace] = useState<EssayCoachTrace | null>(null);
  const [essayCoachLoading, setEssayCoachLoading] = useState(false);
  const [essayCoachError, setEssayCoachError] = useState("");

  const essayTrainingQuestion = "企業家甲有意參與立法委員選舉，向選民 A 承諾若當選，將推薦 A 的兒子進入甲的企業工作。甲的員工乙為蒐集攻擊素材，偷拍競選對手丙與秘書丁在車內的私密活動並傳給甲。丙發現後開車追趕，丁不斷催促丙加速，丙在明知可能撞到用路人的情況下撞傷路人 B。丙、丁明知不救援 B 可能死亡，仍立即離開；半小時後丙返回，誤認 B 已死而將 B 載往樹林掩埋，B 最終因掩埋窒息死亡。翌日，甲將偷拍內容與虛假性影像合成，準備於選前散布。試問：甲、乙、丙、丁在刑法上應如何論處？（100 分）";

  const officialTrainingQuestions = firstExamQuestions.filter(
    (item) => item.subject_group.includes("刑法") && item.correct_answer,
  );
  const officialTrainingQuestion =
    officialTrainingQuestions[trainingQuestionIndex % officialTrainingQuestions.length];
  const officialAnswer = officialTrainingQuestion.correct_answer!;
  const trainingStem = trainingVariant
    ? "甲想殺乙，朝乙所在房間投擲炸彈，並明知同在房內的丙、丁也會被爆炸波及。乙、丙、丁均死亡。下列何者最適當？"
    : officialTrainingQuestion.stem;
  const trainingOptions: Array<["A" | "B" | "C" | "D", string]> = trainingVariant
    ? [
        ["A", "甲僅對乙有殺人故意，對丙、丁一律只成立過失致死罪。"],
        ["B", "甲對乙具有直接故意，對丙、丁可能具有間接故意。"],
        ["C", "只要甲主要想殺乙，就不可能對其他人具有故意。"],
        ["D", "甲對三人的死亡均不成立故意犯罪。"],
      ]
    : (["A", "B", "C", "D"] as const).map((key) => [key, officialTrainingQuestion.options[key]]);
  const currentTrainingAnswer = trainingVariant ? "B" : officialAnswer;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const field = searchInputRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 132)}px`;
  }, [input]);

  useEffect(() => {
    if (!imagePanelOpen || imageStep === "recognizing") return;

    function pasteScreenshot(event: ClipboardEvent) {
      const image = Array.from(event.clipboardData?.items ?? [])
        .find((item) => item.kind === "file" && item.type.startsWith("image/"))
        ?.getAsFile();
      if (!image) return;
      event.preventDefault();
      acceptImageFile(image, `貼上的截圖-${new Date().toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).replaceAll(":", "")}.png`);
    }

    window.addEventListener("paste", pasteScreenshot);
    return () => window.removeEventListener("paste", pasteScreenshot);
  }, [imagePanelOpen, imageStep]);

  const results = useMemo(
    () => query ? findEvidence(query, type, subject, lawScope) : [],
    [query, type, subject, lawScope],
  );
  const detectedLawScope = useMemo(
    () => subject === "法律" && query
      ? (lawScope === "自動判斷" ? detectLawScope(query) : lawScope)
      : null,
    [query, subject, lawScope],
  );
  const relatedTopic = useMemo(() => query ? findTopicBundle(query) : undefined, [query]);
  const verifiedRelatedResources = useMemo(
    () => relatedTopic?.resources.filter(
      (item) => item.verification === "已查證" && Boolean(item.url),
    ) ?? [],
    [relatedTopic],
  );
  const isConstitutionalJudgment112No4 = useMemo(
    () => matchesAlias(query, ["112年憲判字第4號", "112憲判4", "唯一有責配偶", "限制唯一有責配偶請求裁判離婚"]),
    [query],
  );
  const isConstitutionalJudgment111No2 = useMemo(
    () => matchesAlias(query, ["111年憲判字第2號", "111憲判2", "強制道歉案", "強制道歉案（二）"]),
    [query],
  );
  const learningSummary = useMemo(
    () => learningSummaries.find((item) => matchesAlias(query, item.aliases)),
    [query],
  );
  const officialMatches = useMemo(
    () => subject === "法律" && query ? findOfficialQuestions(query) : [],
    [query, subject],
  );
  const officialPracticeQuestion = useMemo(() => {
    const selected = officialMatches.find((item) => officialQuestionId(item) === selectedOfficialId);
    return toPracticeQuestion(selected ?? officialMatches[0]);
  }, [officialMatches, selectedOfficialId]);
  const practiceQuestion = useMemo(
    () => officialPracticeQuestion ??
      practiceQuestions.find((item) => matchesAlias(query, item.aliases)),
    [officialPracticeQuestion, query],
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    const detectedSubject = detectSubject(value);
    setImageAnswerSource(null);
    setSubject(detectedSubject);
    setLawScope("自動判斷");
    setType("全部資料");
    setInput("");
    void searchAndAnswer(value, detectedSubject);
  }

  function quickSearch(value: string) {
    const detectedSubject = detectSubject(value);
    setImageAnswerSource(null);
    setSubject(detectedSubject);
    setLawScope("自動判斷");
    setType("全部資料");
    setInput("");
    void searchAndAnswer(value, detectedSubject);
  }

  async function searchAndAnswer(
    question: string,
    subjectOverride: "法律" | "中級會計" = subject,
    allowGeneralAi = false,
  ) {
    const isOutOfScope = isClearlyOutOfLearningScope(question);
    const matchedEvidence = findEvidence(question, type, subjectOverride, lawScope);
    const useGeneralAi = allowGeneralAi || matchedEvidence.length === 0;
    setEssayDemoQuestion(null);
    setQuery(question);
    setSearched(true);
    setAiLoading(true);
    setAiError("");
    setAiAnswer("");
    setGeneralAiConsent(useGeneralAi);
    setFollowUpInput("");
    setFollowUpTurns([]);
    setFollowUpError("");
    setCoachMessage("");
    setLearningMode(null);
    setSelectedOption(null);
    setSubmittedOption(null);
    setSavedForReview(false);
    setSelectedOfficialId("");
    if (isOutOfScope) {
      setGeneralAiConsent(false);
      setAiAnswer(OUT_OF_SCOPE_MESSAGE);
      setAiLoading(false);
      return;
    }
    if (!useGeneralAi && matchedEvidence.every((item) => !item.externalLlmAllowed)) {
      setAiLoading(false);
      return;
    }
    try {
      const answerEvidence = matchedEvidence.filter((item) => item.externalLlmAllowed);
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(useGeneralAi
          ? { question, allowGeneralAi: true }
          : { question, evidence: answerEvidence }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "目前無法產生回答，請稍後再試。");
      setAiAnswer(payload.answer);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "目前無法產生回答，請稍後再試。");
    } finally {
      setAiLoading(false);
    }
  }

  async function runEssayDemo(item: EssayDemoQuestion) {
    setEssayDemoQuestion(item);
    setEssayDemoOpen(false);
    setSubject(item.domain);
    setLawScope(item.lawScope ?? "自動判斷");
    setType("全部資料");
    setInput("");
    setQuery(item.prompt);
    setSearched(true);
    setGeneralAiConsent(true);
    setAiLoading(true);
    setAiError("");
    setAiAnswer("");
    setLearningMode(null);
    setCoachMessage("");
    setSelectedOption(null);
    setSubmittedOption(null);
    setSelectedOfficialId("");
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: item.prompt,
          allowGeneralAi: true,
          standardAnswer: item.officialAnswer,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "目前無法產生申論解題，請稍後再試。");
      setAiAnswer(payload.answer);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "目前無法產生申論解題，請稍後再試。");
    } finally {
      setAiLoading(false);
    }
  }

  function continueLearning(action: "concept" | "practice" | "review") {
    if (action === "concept") {
      setLearningMode("summary");
      setCoachMessage("");
      return;
    }
    if (action === "practice") {
      setLearningMode("practice");
      setSelectedOption(null);
      setSubmittedOption(null);
      setCoachMessage(practiceQuestion
        ? ""
        : "目前尚未接入與這個考點相符的題目；系統不會拿無關題目或假真題給你練習。");
      return;
    }
    setSavedForReview(true);
    setCoachMessage("已加入本機複習清單。正式學員版接上帳號後，會依答題結果安排再次出現的時間。");
  }

  function practiceOfficialQuestion(question: OfficialQuestion) {
    if (question.review_status === "needs_review") return;
    setSelectedOfficialId(officialQuestionId(question));
    setLearningMode("practice");
    setSelectedOption(null);
    setSubmittedOption(null);
    setCoachMessage("");
  }

  async function submitFollowUp(event: FormEvent) {
    event.preventDefault();
    const followUpQuestion = followUpInput.trim();
    if (!followUpQuestion || !query || !aiAnswer || followUpLoading) return;

    setFollowUpLoading(true);
    setFollowUpError("");
    const followUp: FollowUpContext = {
      originalQuestion: imageAnswerSource && imageRecognizedText ? imageRecognizedText : query,
      previousAnswer: aiAnswer,
      conversation: followUpTurns,
      followUpQuestion,
    };

    try {
      const answerEvidence = results.filter((item) => item.externalLlmAllowed);
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generalAiConsent
          ? { question: query, followUp, allowGeneralAi: true }
          : { question: query, followUp, evidence: answerEvidence }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "目前無法回答追問，請稍後再試。");
      setFollowUpTurns((turns) => [...turns, { question: followUpQuestion, answer: payload.answer }]);
      setFollowUpInput("");
    } catch (error) {
      setFollowUpError(error instanceof Error ? error.message : "目前無法回答追問，請稍後再試。");
    } finally {
      setFollowUpLoading(false);
    }
  }

  const predictedFollowUps = useMemo(
    () =>
      predictFollowUpQuestions({
        question: imageAnswerSource && imageRecognizedText ? imageRecognizedText : query,
        answer: followUpTurns.at(-1)?.answer ?? aiAnswer,
        subject,
        previousQuestions: followUpTurns.map((turn) => turn.question),
      }),
    [aiAnswer, followUpTurns, imageAnswerSource, imageRecognizedText, query, subject],
  );
  const currentQueryIsOutOfScope = useMemo(
    () => isClearlyOutOfLearningScope(query),
    [query],
  );
  const currentQueryNeedsClarification = useMemo(
    () => needsQuestionScopeClarification(query),
    [query],
  );
  const currentQueryIsBroadLegalTopic = useMemo(
    () => subject === "法律" && isBroadLegalTopicQuery(query),
    [query, subject],
  );

  async function analyzeEssay(answer: string, conversation = essayCoachTurns) {
    setEssayCoachLoading(true);
    setEssayCoachError("");
    setEssayCoachTrace(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          essayCoach: {
            examQuestion: essayTrainingQuestion,
            studentAnswer: answer,
            conversation,
          },
        }),
      });
      const payload = await response.json() as {
        essay_analysis?: EssayCoachAnalysis;
        trace?: EssayCoachTrace;
        error?: string;
      };
      if (!response.ok || !payload.essay_analysis) {
        throw new Error(payload.error || "AI 暫時無法分析這份作答。");
      }
      setEssayCoachAnalysis(payload.essay_analysis);
      setEssayCoachTrace(payload.trace ?? null);
      setEssayReviewed(true);
      setEssayCoachHint(0);
    } catch (error) {
      setEssayCoachAnalysis(null);
      setEssayCoachTrace(null);
      setEssayCoachError(error instanceof Error ? error.message : "AI 暫時無法分析這份作答。");
    } finally {
      setEssayCoachLoading(false);
    }
  }

  async function compareSecondExamAnswer() {
    const answer = secondExamDraft.trim();
    if (answer.length < 20 || secondExamLoading) return;
    setSecondExamLoading(true);
    setSecondExamProgressStep(0);
    setSecondExamError("");
    setSecondExamComparison(null);
    setSecondExamTrace(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          essayReview: {
            examQuestion: currentSecondExam.stem,
            studentAnswer: answer,
            teacherAnswer: currentSecondExam.teacherSolution.fullText,
            scoringIssues: currentSecondExam.issuePreview,
            course: currentSecondExam.course,
          },
        }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("批改服務暫時沒有回傳可讀結果，請稍後再試；你的作答內容仍保留。");
      }
      let payload: {
        essay_comparison?: EssayComparison;
        trace?: EssayCoachTrace;
        error?: string;
      };
      try {
        payload = await response.json();
      } catch {
        throw new Error("批改服務暫時沒有回傳可讀結果，請稍後再試；你的作答內容仍保留。");
      }
      if (!response.ok || !payload.essay_comparison) {
        throw new Error(payload.error || "AI 暫時無法完成本次對照。");
      }
      setSecondExamComparison(payload.essay_comparison);
      setSecondExamTrace(payload.trace ?? null);
      setSecondExamSubmitted(true);
      setSecondExamCompletedIds((completedIds) => {
        const nextCompletedIds = completedIds.includes(currentSecondExam.id)
          ? completedIds
          : [...completedIds, currentSecondExam.id];
        if (nextCompletedIds.length === secondExamQuestions.length) {
          setSecondExamOfferOpen(true);
        }
        return nextCompletedIds;
      });
    } catch (error) {
      setSecondExamError(error instanceof Error ? error.message : "AI 暫時無法完成本次對照。");
    } finally {
      setSecondExamLoading(false);
    }
  }

  function acceptImageFile(file: File, displayName = file.name) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      alert("請上傳 JPG、PNG 或 WebP，單張不超過 8 MB。");
      return false;
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageName(displayName);
    setImagePreview(URL.createObjectURL(file));
    setImageFile(file);
    setOcrError("");
    setImageStep("confirm");
    return true;
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!acceptImageFile(file)) {
      event.target.value = "";
    }
  }

  async function recognizeImage() {
    if (!imageFile) return;
    const requestId = ++imageRequestIdRef.current;
    setImageStep("recognizing");
    setImageProgressStep(0);
    setOcrError("");
    setAiAnswer("");
    setAiError("");
    setFollowUpInput("");
    setFollowUpTurns([]);
    setFollowUpError("");
    setImageRecognizedText("");
    setImageAnswerSource(null);
    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("question", imageQuestion.trim());
      const response = await fetch("/api/ocr", { method: "POST", body: formData });
      const contentType = response.headers.get("content-type") ?? "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : { error: "目前無法讀取這張圖片，請換一張較清楚的圖片。" };
      if (requestId !== imageRequestIdRef.current) return;
      if (!response.ok) throw new Error(payload.error || "目前無法可靠辨識完整題目，請換一張較清楚的圖片。");
      const recognizedText = String(payload.text || "").trim();
      const solvedAnswer = String(payload.answer || "").trim();
      if (!recognizedText || !solvedAnswer) throw new Error("目前無法可靠辨識完整題目，請換一張較清楚的圖片。");
      const detectedSubject = payload.subject === "中級會計" ? "中級會計" : detectSubject(recognizedText);
      setSubject(detectedSubject);
      if (detectedSubject === "中級會計") setLawScope("自動判斷");
      closeImagePanel();
      setImageAnswerSource({
        type: payload.sourceType === "exam_question"
          ? "exam_question"
          : payload.sourceType === "textbook_question"
            ? "textbook_question"
            : "unconfirmed",
        note: String(payload.sourceNote || "").trim(),
        uncertaintyNote: String(payload.uncertaintyNote || "").trim(),
      });
      setImageRecognizedText(
        imageQuestion.trim()
          ? `${recognizedText}\n\n學生想問：${imageQuestion.trim()}`
          : recognizedText,
      );
      setEssayDemoQuestion(null);
      setQuery(imageQuestion.trim() || "請解析這張圖片中的題目");
      setSearched(true);
      setAiLoading(false);
      setAiError("");
      setAiAnswer(solvedAnswer);
      setGeneralAiConsent(true);
      setImageProgressStep(4);
      setFollowUpInput("");
      setFollowUpTurns([]);
      setFollowUpError("");
      setCoachMessage("");
      setLearningMode(null);
      setSelectedOption(null);
      setSubmittedOption(null);
      setSavedForReview(false);
      setSelectedOfficialId("");
    } catch (error) {
      if (requestId !== imageRequestIdRef.current) return;
      setOcrError(error instanceof Error ? error.message : "圖片辨識失敗，請稍後再試。");
      setImageStep("confirm");
      setImageProgressStep(0);
    }
  }

  useEffect(() => {
    if (imageStep !== "recognizing") return;
    const delays = [550, 1500, 2800, 4300];
    const timers = delays.map((delay, index) =>
      window.setTimeout(() => setImageProgressStep(index + 1), delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [imageStep]);

  function closeImagePanel() {
    if (imageStep === "recognizing") imageRequestIdRef.current += 1;
    setImagePanelOpen(false);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageName("");
    setImagePreview("");
    setImageFile(null);
    setImageQuestion("");
    setImageProgressStep(0);
    setOcrError("");
    setImageStep("select");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function resetSolutionAnswer() {
    setSolutionOption(null);
    setSolutionEssay("");
    setSolutionSubmitted(false);
    setSolutionIssueChoices([]);
    setSolutionIssueReady(false);
    setSolutionWritingStep("issue");
    setSolutionWritingSelections({ rule: [], application: [], conclusion: [] });
  }

  function startRandomSolutionBook(bookId: string) {
    const exercises = solutionBookExercises.filter((exercise) => exercise.bookId === bookId);
    const randomIndex = exercises.length ? Math.floor(Math.random() * exercises.length) : 0;
    setSolutionBookId(bookId);
    setSolutionExerciseIndex(randomIndex);
    setSolutionSeenIds(exercises[randomIndex] ? [exercises[randomIndex].id] : []);
    setSolutionChapterHistory(exercises[randomIndex] ? [exercises[randomIndex].chapter] : []);
    resetSolutionAnswer();
  }

  function showNextRandomSolutionExercise() {
    if (!currentSolutionExercise || currentSolutionExercises.length < 2) return;
    const completedIds = new Set([...solutionSeenIds, currentSolutionExercise.id]);
    let candidates = currentSolutionExercises
      .map((exercise, index) => ({ exercise, index }))
      .filter(({ exercise }) => !completedIds.has(exercise.id));

    if (!candidates.length) {
      candidates = currentSolutionExercises
        .map((exercise, index) => ({ exercise, index }))
        .filter(({ exercise }) => exercise.id !== currentSolutionExercise.id);
      completedIds.clear();
      completedIds.add(currentSolutionExercise.id);
    }

    const differentChapterCandidates = candidates.filter(
      ({ exercise }) => exercise.chapter !== currentSolutionExercise.chapter,
    );
    const pool = differentChapterCandidates.length ? differentChapterCandidates : candidates;
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (!next) return;

    setSolutionExerciseIndex(next.index);
    setSolutionSeenIds([...completedIds, next.exercise.id]);
    setSolutionChapterHistory((history) => [...history, next.exercise.chapter]);
    resetSolutionAnswer();
  }

  async function recordGuidedAnswer(
    question: IssueSpottingQuestion,
    step: GuidedIssueStep,
    selectedOption: number,
  ) {
    if (!guidedLearnerKey || !guidedAttemptId) return;
    const record: GuidedAttemptRecord = {
      attemptId: guidedAttemptId,
      questionKey: `${question.domain}|${question.topic}|${question.prompt}`,
      domain: question.domain,
      topic: question.topic,
      stepId: step.id,
      stepLabel: step.label,
      selectedOption,
      correctOption: step.answer,
      correct: selectedOption === step.answer,
      answeredAt: new Date().toISOString(),
    };
    setGuidedAttemptRecords((records) => [record, ...records]);
    setGuidedRecordStatus("saving");
    try {
      const response = await fetch("/api/guided-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learnerKey: guidedLearnerKey, ...record }),
      });
      if (!response.ok) throw new Error("save failed");
      setGuidedRecordStatus("saved");
    } catch {
      setGuidedRecordStatus("error");
    }
  }

  function resetGuidedAttempt() {
    setGuidedAttemptId(createClientId());
    setGuidedIssueStep(0);
    setGuidedIssueAnswers([]);
    setGuidedRecordStatus("idle");
    setIssueExplanationOpen(false);
    setOriginalQuestionOpen(true);
    setOriginalChallengeAnswer(null);
    setOriginalChallengeSubmitted(false);
  }

  return (
    <main>
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={() => setActiveView("search")} aria-label="iBrain Pedia X 首頁">
          <span className="brand-mark">iP</span>
          <span><strong>iBrain Pedia X</strong><small>智學百科｜智慧學習</small></span>
        </button>
        <nav aria-label="主要導覽">
          <button className={activeView === "search" ? "active" : ""} type="button" onClick={() => setActiveView("search")}>智學搜尋</button>
          <button className={activeView === "pastExams" ? "active" : ""} type="button" onClick={() => setActiveView("pastExams")}>歷屆考古題</button>
          <button className={activeView === "issues" ? "active" : ""} type="button" onClick={() => setActiveView("issues")}>法律爭點庫</button>
          <button className={activeView === "essayReview" ? "active" : ""} type="button" onClick={() => {
            setPastExamStage("second");
            setActiveView("essayReview");
          }}>申論寫作</button>
        </nav>
        <div className="header-actions">
          <button className="icon-button" aria-label="通知">●</button>
          <div className="avatar">王</div>
          <span className="student">王同學</span>
        </div>
      </header>

      {activeView === "issues" ? (
        <section className="issue-library-page">
          <div className="issue-library-hero">
            <div>
              <p>ISSUE LIBRARY</p>
                  <h1>申論拆解練習</h1>
                  <span>把申論解題拆成選擇題，一步一步完成法律答案。</span>
            </div>
            <div>
              <small>第一階段</small>
              <strong>六大法科</strong>
              <span>先練會找出核心爭點</span>
            </div>
          </div>

          {!selectedIssue && !issueCatalogOpen ? (
            <section className="issue-spotting-home">
              <header>
                <div>
                  <span>申論選擇題化</span>
                  <h2>跟著案例，一步一步完成申論</h2>
                  <p>從辨識爭點、選擇規則、抓關鍵事實，到涵攝與明確結論；全部在同一頁完成。</p>
                </div>
                <button
                  className="guided-weakness-toggle"
                  type="button"
                  onClick={() => setGuidedWeaknessOpen((value) => !value)}
                >
                  我的弱點 {guidedWeaknesses.length ? `(${guidedWeaknesses.length})` : ""}
                </button>
              </header>
              {guidedWeaknessOpen ? (
                <div className="guided-weakness-panel">
                  <div>
                    <strong>五步驟弱點分析</strong>
                    <span>不是只看整題對錯，而是找出你卡在哪一步。</span>
                  </div>
                  {guidedWeaknesses.length ? (
                    <ul>
                      {guidedWeaknesses.slice(0, 5).map((item) => (
                        <li key={item.key}>
                          <span><b>{item.domain}・{item.stepLabel}</b><small>{item.topic}</small></span>
                          <em>{item.status}・答錯 {item.wrong}/{item.attempts} 次</em>
                        </li>
                      ))}
                    </ul>
                  ) : <p>目前還沒有錯誤紀錄。完成練習後，這裡會顯示你最需要補強的步驟。</p>}
                </div>
              ) : null}
              <div className="guided-source-switch" aria-label="題目來源">
                <button
                  className={guidedQuestionSource === "historical" ? "active" : ""}
                  type="button"
                  onClick={() => {
                    setGuidedQuestionSource("historical");
                    setIssueSpottingDomain("刑法");
                    setIssueSpottingIndex(0);
                    resetGuidedAttempt();
                  }}
                >
                  <b>歷屆真題</b>
                  <span>114 年司律一試刑法・10 題</span>
                </button>
                <button
                  className={guidedQuestionSource === "demo" ? "active" : ""}
                  type="button"
                  onClick={() => {
                    setGuidedQuestionSource("demo");
                    setIssueSpottingIndex(0);
                    resetGuidedAttempt();
                  }}
                >
                  <b>模式示範</b>
                  <span>六科 AI／編輯設計題</span>
                </button>
              </div>
              {guidedQuestionSource === "historical" ? (
                <p className="guided-source-notice">
                  高點司律一試題庫已接入。第一批採 114 年律師、司法官第一試刑法第 1～10 題；原題與官方答案已匯入，五步拆解目前標示為待老師審核。
                </p>
              ) : null}
              {guidedQuestionSource === "demo" ? (
              <div className="issue-domain-switch" aria-label="選擇法律領域">
                {([
                  ["公法", "行政法、憲法基本權"],
                  ["民法", "物權、債編"],
                  ["刑法", "因果歷程、財產犯罪"],
                  ["民事訴訟法", "訴之利益、既判力"],
                  ["刑事訴訟法", "搜索扣押、傳聞法則"],
                  ["商法", "公司法、票據法"],
                ] as const).map(([domain, description]) => (
                  <button
                    className={issueSpottingDomain === domain ? "active" : ""}
                    type="button"
                    key={domain}
                    onClick={() => {
                      setIssueSpottingDomain(domain);
                      setIssueSpottingIndex(0);
                      setIssuePracticeAnswer("");
                      setIssuePracticeSubmitted(false);
                      setIssueExplanationOpen(false);
                      resetGuidedAttempt();
                    }}
                  >
                    <b>{domain}</b>
                    <span>{description}</span>
                  </button>
                ))}
              </div>
              ) : null}
              {(() => {
                const questions = guidedQuestionSource === "historical"
                  ? historicalCriminalGuides
                  : issueSpottingQuestions.filter((item) => item.domain === issueSpottingDomain);
                const question = questions[issueSpottingIndex % questions.length];
                const steps = buildGuidedIssueSteps(question);
                const activeStep = steps[guidedIssueStep];
                const currentAnswer = guidedIssueAnswers[guidedIssueStep];
                const stepSubmitted = currentAnswer !== undefined;
                const showOriginalOptionsBesideQuestion = question.prompt.length <= 72;
                return (
                  <article className="issue-spotting-card">
                    <div className="issue-spotting-note">
                      <strong>
                        {guidedQuestionSource === "historical"
                          ? `刑法・第 ${(issueSpottingIndex % questions.length) + 1}/10 題`
                          : `${issueSpottingDomain}・第 ${(issueSpottingIndex % questions.length) + 1} 題`}
                      </strong>
                      <span>{question.topic}</span>
                    </div>
                    <div className="guided-stepper" aria-label="申論解題進度">
                      {steps.map((step, index) => (
                        <span className={index < guidedIssueStep ? "done" : index === guidedIssueStep ? "active" : ""} key={step.id}>
                          <b>{index + 1}</b>{step.label}
                        </span>
                      ))}
                    </div>
                    <div
                      className={[
                        "guided-question-heading",
                        showOriginalOptionsBesideQuestion ? "side-action" : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <p className="issue-inline-stem">{question.prompt}</p>
                      {question.sourceLabel ? (
                        <button
                          className="guided-options-toggle"
                          type="button"
                          aria-expanded={originalQuestionOpen}
                          aria-controls="guided-original-options"
                          onClick={() => setOriginalQuestionOpen((value) => !value)}
                        >
                          {originalQuestionOpen ? "收起選項" : "查看選項"}
                          <b aria-hidden="true">{originalQuestionOpen ? "⌃" : "⌄"}</b>
                        </button>
                      ) : null}
                    </div>
                    {originalQuestionOpen ? (
                      <section className="guided-original-question" id="guided-original-options">
                        <div>
                          <strong>原題選項</strong>
                          <small>不重複顯示題幹</small>
                        </div>
                        <ol>
                          {question.options.map((option, index) => (
                            <li key={`${question.originalNumber ?? issueSpottingIndex}-${index}`}>
                              <b>{String.fromCharCode(65 + index)}</b>
                              <span>{option}</span>
                            </li>
                          ))}
                        </ol>
                      </section>
                    ) : null}
                    <h3>{activeStep.question}</h3>
                    <div className="issue-inline-options">
                      {activeStep.options.map((option, index) => {
                        const label = String.fromCharCode(65 + index);
                        return (
                          <button
                            className={[
                              currentAnswer === index ? "selected" : "",
                              stepSubmitted && index === activeStep.answer ? "correct" : "",
                              stepSubmitted && currentAnswer === index && index !== activeStep.answer ? "wrong" : "",
                            ].filter(Boolean).join(" ")}
                            type="button"
                            key={label}
                            disabled={stepSubmitted}
                            onClick={() => {
                              setIssuePracticeAnswer(label);
                              setIssuePracticeSubmitted(false);
                              setIssueExplanationOpen(false);
                              setGuidedIssueAnswers((answers) => {
                                const next = answers.slice(0, guidedIssueStep);
                                next[guidedIssueStep] = index;
                                return next;
                              });
                              void recordGuidedAnswer(question, activeStep, index);
                            }}
                          >
                            <b>{label}</b><span>{option}</span>
                          </button>
                        );
                      })}
                    </div>
                    {stepSubmitted ? <div className={`issue-inline-feedback ${currentAnswer === activeStep.answer ? "correct" : "wrong"}`}>
                      <strong>{currentAnswer === activeStep.answer ? "這一步判斷正確" : "這一步需要修正"}</strong>
                      <p>{activeStep.explanation}</p>
                      <small className="guided-record-note">
                        {guidedRecordStatus === "error"
                          ? "紀錄暫時無法同步，請稍後再試。"
                          : currentAnswer === activeStep.answer
                            ? "本次作答已鎖定並納入學習紀錄。"
                            : "本次錯誤已鎖定，將納入弱點分析；完成後可重新練習。"}
                      </small>
                      {guidedIssueStep < steps.length - 1 ? (
                        <button className="guided-next" type="button" onClick={() => setGuidedIssueStep((value) => value + 1)}>
                          下一步：{steps[guidedIssueStep + 1].label}
                        </button>
                      ) : (
                        <div className="guided-answer-sheet">
                          <span>你的申論骨架已完成</span>
                          <p><b>爭點：</b>{question.options[question.answer]}</p>
                          <p><b>規則：</b>{steps[1].options[steps[1].answer]}</p>
                          <p><b>涵攝：</b>{steps[3].options[steps[3].answer]}</p>
                          <p><b>結論：</b>{steps[4].options[steps[4].answer]}</p>
                          <div className="guided-demonstration">
                            <small>完整涵攝示範</small>
                            <p>{question.demonstration ?? getGuidedIssueOutcome(question).demonstration}</p>
                          </div>
                          {guidedQuestionSource === "historical" ? (
                            <section className="guided-original-challenge">
                              <header>
                                <div>
                                  <small>第 6 段・驗證理解</small>
                                  <strong>挑戰原題</strong>
                                </div>
                                <span>不列入五步申論骨架</span>
                              </header>
                              <p>{question.prompt}</p>
                              <div className="issue-inline-options">
                                {question.options.map((option, index) => {
                                  const label = String.fromCharCode(65 + index);
                                  return (
                                    <button
                                      type="button"
                                      key={`challenge-${label}`}
                                      disabled={originalChallengeSubmitted}
                                      className={[
                                        originalChallengeAnswer === index ? "selected" : "",
                                        originalChallengeSubmitted && index === question.answer ? "correct" : "",
                                        originalChallengeSubmitted && originalChallengeAnswer === index && index !== question.answer ? "wrong" : "",
                                      ].filter(Boolean).join(" ")}
                                      onClick={() => setOriginalChallengeAnswer(index)}
                                    >
                                      <b>{label}</b><span>{option}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              {!originalChallengeSubmitted ? (
                                <button
                                  className="issue-submit-answer"
                                  type="button"
                                  disabled={originalChallengeAnswer === null}
                                  onClick={() => setOriginalChallengeSubmitted(true)}
                                >
                                  送出原題答案
                                </button>
                              ) : (
                                <div className={`issue-inline-feedback ${originalChallengeAnswer === question.answer ? "correct" : "wrong"}`}>
                                  <strong>{originalChallengeAnswer === question.answer ? "答對了，五步推理能帶你回到原題" : "這次原題答錯了"}</strong>
                                  <p>官方答案為 {String.fromCharCode(65 + question.answer)}。{question.explanation}</p>
                                </div>
                              )}
                            </section>
                          ) : null}
                          <div className="issue-followup-actions">
                            <button type="button" onClick={() => setIssueExplanationOpen((value) => !value)}>
                              {issueExplanationOpen ? "收起完整解析" : "看完整解析"}
                            </button>
                            <button type="button" onClick={() => {
                              setIssueSpottingIndex((value) => value + 1);
                              setIssuePracticeAnswer("");
                              setIssuePracticeSubmitted(false);
                              resetGuidedAttempt();
                            }}>再練一題</button>
                            <button type="button" onClick={resetGuidedAttempt}>重新練習本題</button>
                          </div>
                          {issueExplanationOpen ? <div className="issue-short-explanation">
                            <p><b>題目關鍵句：</b>{question.keyFact}</p>
                            <p>{question.explanation}</p>
                          </div> : null}
                        </div>
                      )}
                    </div> : null}
                  </article>
                );
              })()}
            </section>
          ) : null}

          {!selectedIssue && issueCatalogOpen ? <button className="issue-catalog-back" type="button" onClick={() => setIssueCatalogOpen(false)}>
            ← 回到核心爭點辨識
          </button> : null}

          {!selectedIssue && issueCatalogOpen ? <div className="issue-library-toolbar">
            <input
              value={issueSearch}
              onChange={(event) => setIssueSearch(event.target.value)}
              placeholder="搜尋爭點、章節或關鍵字"
              aria-label="搜尋爭點"
            />
            <div aria-label="科目篩選">
              {issueSubjects.map((item) => (
                <button
                  className={issueSubject === item ? "active" : ""}
                  type="button"
                  onClick={() => setIssueSubject(item)}
                  key={item}
                >
                  {item}
                </button>
              ))}
            </div>
          </div> : null}

          {!selectedIssue && issueCatalogOpen ? <div className="issue-library-summary">
            <strong>{filteredIssueIndex.length} 個爭點</strong>
            <span>點選一列查看內容</span>
          </div> : null}

          {selectedIssue ? (
            <article className="issue-detail">
              <button className="issue-detail-back" type="button" onClick={() => setSelectedIssueKey("")}>
                ← 返回爭點列表
              </button>
              <header>
                <div>
                  <span>{selectedIssue.subject}</span>
                  <small>{selectedIssue.chapter}</small>
                </div>
                <h2>{selectedIssue.concept}</h2>
                <p>
                  {selectedIssueTopic?.summary ??
                    `本爭點需先辨識「${selectedIssue.concept}」的適用要件，再將題目事實逐一對照，最後處理例外、競合或不同見解。`}
                </p>
              </header>

              <nav className="issue-workspace-tabs" aria-label="爭點學習功能">
                {([
                  ["learn", "題目怎麼拆"],
                  ["history", "題目如何變"],
                  ["teachers", "老師與教材"],
                  ["choice", "先找出核心爭點"],
                  ["essay", "試著寫出來"],
                  ["diagnosis", "學習診斷"],
                ] as const).map(([key, label]) => (
                  <button
                    className={issueWorkspaceTab === key ? "active" : ""}
                    type="button"
                    key={key}
                    onClick={() => setIssueWorkspaceTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <div className="issue-detail-layout">
                <main>
                  {issueWorkspaceTab === "learn" ? <section>
                    {isCausalProcessIssue ? (
                      <div className="issue-case-study">
                        <header>
                          <span>用一道題，看懂爭點從哪裡冒出來</span>
                          <h3>不是背名稱，而是找出會改變法律結論的事實</h3>
                        </header>
                        <blockquote>
                          甲持刀刺殺乙，以為乙已死亡，為湮滅證據將乙丟入河中。乙實際上並未因刀傷死亡，而是因溺水死亡。甲應如何論處？
                        </blockquote>

                        <div className="issue-fact-map">
                          <article>
                            <p>「甲持刀刺殺乙」</p>
                            <span>看出什麼？</span>
                            <strong>甲有殺人故意，並已開始實行殺人行為。</strong>
                          </article>
                          <article>
                            <p>「甲以為乙已死亡」</p>
                            <span>看出什麼？</span>
                            <strong>甲誤認第一次行為已造成死亡結果。</strong>
                          </article>
                          <article>
                            <p>「再將乙丟入河中」</p>
                            <span>看出什麼？</span>
                            <strong>真正造成死亡的，是甲以為只在處理屍體的第二個行為。</strong>
                          </article>
                          <article>
                            <p>「乙實際因溺水死亡」</p>
                            <span>看出什麼？</span>
                            <strong>實際死亡過程，與甲原先認知的死亡過程不同。</strong>
                          </article>
                        </div>

                        <div className="issue-reveal">
                          <small>所以，本題不是只在問「甲有沒有殺人」</small>
                          <strong>主要爭點：因果歷程錯誤</strong>
                          <p>甲原本的殺人故意，能不能涵蓋後來以不同方式發生的死亡結果？前後兩個行為應整體評價，還是拆開評價？</p>
                        </div>

                        <div className="issue-decision-flow">
                          <h3>真正會讓答案改變的三個問題</h3>
                          <ol>
                            <li><b>原始計畫：</b>甲一開始是否已有完整的殺人計畫？</li>
                            <li><b>行為關係：</b>丟入河中是否仍是原犯罪計畫的一部分，或是後來另起的行為？</li>
                            <li><b>偏離程度：</b>實際因果過程，是否已重大偏離甲原先預想？</li>
                          </ol>
                        </div>

                        <div className="issue-variant-table">
                          <h3>題目只改一句，結論就可能不同</h3>
                          <div>
                            <article><span>題目改成</span><strong>甲原本就計畫刺殺後再丟河，確保乙死亡</strong><p>前後行為較可能整體評價，成立殺人既遂。</p></article>
                            <article><span>題目改成</span><strong>甲刺殺後本想救乙，後來才另起犯意將乙丟河</strong><p>前後犯意不同，可能需要分開評價。</p></article>
                            <article><span>題目改成</span><strong>甲以為乙已死，搬運時不慎使乙落水</strong><p>可能討論殺人未遂與過失致死，而非直接整體評價。</p></article>
                          </div>
                        </div>

                        <footer>
                          <b>看懂的標準</b>
                          <p>不是記住「因果歷程錯誤」六個字，而是題目改變時，你知道是哪個事實讓法律評價跟著改變。</p>
                        </footer>
                      </div>
                    ) : (
                      <>
                        <b>題目與爭點對照</b>
                        <h3>看到題目，先找出會改變法律判斷的事實</h3>
                        <ol>
                          <li>哪一句事實觸發「{selectedIssue.concept}」？</li>
                          <li>如果拿掉或改寫這句，法律結論是否改變？</li>
                          <li>該事實對應哪一個成立要件、例外或不同見解？</li>
                          <li>最後才整理成「爭點—規則—涵攝—結論」。</li>
                        </ol>
                      </>
                    )}
                  </section> : null}

                  {issueWorkspaceTab === "teachers" && selectedIssueEvidence.length > 0 ? (
                    <section>
                      <b>教材解析</b>
                      <h3>已收錄的老師／教材內容</h3>
                      <div className="issue-evidence-list">
                        {selectedIssueEvidence.map((item) => (
                          <article key={item.id}>
                            <strong>{item.title}</strong>
                            <small>{item.chapter}・第 {item.page} 頁</small>
                            <p>{item.text}</p>
                            <EvidenceAction item={item} />
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : issueWorkspaceTab === "teachers" ? (
                    <section className="issue-detail-empty">
                      <b>教材解析</b>
                      <h3>完整老師解析尚待匯入</h3>
                      <p>目前先保留爭點索引與考題關聯，不用 AI 假造老師見解；完成資料核對後再補入。</p>
                    </section>
                  ) : null}

                  {issueWorkspaceTab === "choice" ? <section className="issue-inline-practice">
                    <b>核心爭點辨識</b>
                    <h3>先不急著選法律結論，只找出「這題到底在考什麼」</h3>
                    {selectedIssueSpottingQuestion ? (() => {
                      const question = selectedIssueSpottingQuestion;
                      return (
                        <>
                          <div className="issue-spotting-note">
                            <strong>{question.domain}・已審核示範題</strong>
                            <span>{question.topic}</span>
                          </div>
                          <p className="issue-inline-stem">{question.prompt}</p>
                          <p className="issue-core-question">本案最核心的法律爭點為何？</p>
                          <div className="issue-inline-options">
                            {question.options.map((option, index) => {
                              const label = String.fromCharCode(65 + index);
                              return (
                              <button
                                className={issuePracticeAnswer === label ? "selected" : ""}
                                type="button"
                                key={label}
                                onClick={() => {
                                  setIssuePracticeAnswer(label);
                                  setIssuePracticeSubmitted(false);
                                  setIssueExplanationOpen(false);
                                }}
                              >
                                <b>{label}</b><span>{option}</span>
                              </button>
                              );
                            })}
                          </div>
                          <button
                            className="issue-submit-answer"
                            type="button"
                            disabled={!issuePracticeAnswer}
                            onClick={() => setIssuePracticeSubmitted(true)}
                          >
                            確認爭點
                          </button>
                          {issuePracticeSubmitted ? (
                            <div className={`issue-inline-feedback ${issuePracticeAnswer === String.fromCharCode(65 + question.answer) ? "correct" : "wrong"}`}>
                              <strong>{issuePracticeAnswer === String.fromCharCode(65 + question.answer) ? "抓對核心爭點" : "再看一次關鍵事實"}</strong>
                              {issueExplanationOpen ? <div className="issue-short-explanation">
                                <p><b>題目關鍵句：</b>{question.keyFact}</p>
                                <p>{question.explanation}</p>
                                <small>正確選項為 {String.fromCharCode(65 + question.answer)}。正式內容仍須經老師或編輯審核。</small>
                              </div> : null}
                              <div className="issue-followup-actions">
                                <button type="button" onClick={() => setIssueExplanationOpen((value) => !value)}>
                                  {issueExplanationOpen ? "收起解析" : "看簡短解析"}
                                </button>
                                <button type="button" onClick={() => setIssueWorkspaceTab("history")}>挑戰歷屆題</button>
                                <button type="button" onClick={() => {
                                  setIssueSpottingIndex((value) => value + 1);
                                  setIssuePracticeAnswer("");
                                  setIssuePracticeSubmitted(false);
                                  setIssueExplanationOpen(false);
                                }}>再練一題</button>
                              </div>
                            </div>
                          ) : null}
                        </>
                      );
                    })() : (
                      <div className="issue-detail-empty">
                        <h3>這個爭點尚無已審核的辨識題</h3>
                        <p>右側數量是「相關原始考題」統計，不代表每題都已改編成核心爭點辨識題。完成老師或編輯審核前，系統不再用其他示範題代替。</p>
                        <button type="button" onClick={() => setIssueWorkspaceTab("history")}>查看相關原始考題</button>
                      </div>
                    )}
                  </section> : null}

                  {issueWorkspaceTab === "essay" ? <section className="issue-inline-essay">
                    <b>申論練習</b>
                    <h3>先列爭點，再寫一小段涵攝</h3>
                    <p>請用自己的話回答：題目出現哪些事實時，需要討論「{selectedIssue.concept}」？判斷順序為何？</p>
                    <textarea
                      aria-label="申論練習作答區"
                      rows={9}
                      value={issueEssayDraft}
                      onChange={(event) => setIssueEssayDraft(event.target.value)}
                      placeholder={`例如：本題應先判斷……是否構成「${selectedIssue.concept}」，接著檢驗……`}
                    />
                    <div className="issue-essay-actions">
                      <span>{issueEssayDraft.length} 字</span>
                      <button type="button" disabled={issueEssayDraft.trim().length < 20}>送出檢查</button>
                    </div>
                    <small>正式批改會檢查：是否漏列爭點、規則是否完整、涵攝是否引用關鍵事實，以及結論是否一致。</small>
                  </section> : null}

                  {issueWorkspaceTab === "history" ? <section>
                    <b>相關歷屆題</b>
                    <h3>{selectedIssueQuestions.length > 0 ? `同一爭點曾以 ${selectedIssueQuestions.length} 種題目事實出現` : "目前尚無直接命中的已核對考題"}</h3>
                    {selectedIssueQuestions.length > 0 ? (
                      <div className="issue-question-list">
                        {selectedIssueQuestions.map((question) => {
                          const id = officialQuestionId(question);
                          const expanded = expandedIssueQuestionId === id;
                          return (
                            <article className={`issue-history-question ${expanded ? "expanded" : ""}`} key={id}>
                              <button type="button" onClick={() => setExpandedIssueQuestionId(expanded ? "" : id)}>
                                <strong>{question.year} 年・第 {question.number} 題</strong>
                                <span>{question.stem.slice(0, 88)}{question.stem.length > 88 ? "…" : ""}</span>
                              </button>
                              {expanded ? (
                                <div>
                                  <p>{question.stem}</p>
                                  <ol>
                                    {(["A", "B", "C", "D"] as const).map((label) => (
                                      <li key={label}><b>{label}</b><span>{question.options[label]}</span></li>
                                    ))}
                                  </ol>
                                  <small>官方答案：{question.correct_answer ?? "尚待核對"}・此處顯示的是你點選的原始考題，不是重複示範題。</small>
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    ) : null}
                  </section> : null}

                  {issueWorkspaceTab === "diagnosis" ? <section className="issue-diagnosis-panel">
                    <b>學習診斷</b>
                    <h3>系統要分清楚你卡在哪一步</h3>
                    <div>
                      <article><strong>爭點辨識</strong><span>能否從題目事實看出「{selectedIssue.concept}」</span><em>待作答</em></article>
                      <article><strong>規則理解</strong><span>能否說出成立要件、例外與見解差異</span><em>待作答</em></article>
                      <article><strong>涵攝能力</strong><span>能否把關鍵事實對應到法律規則</span><em>待作答</em></article>
                      <article><strong>結論穩定度</strong><span>不同題型變化後是否仍能答對</span><em>資料不足</em></article>
                    </div>
                    <p>第一次答錯只列為「待觀察」；累積多次作答後，才會判定可能弱點、核心弱點或改善中。</p>
                  </section> : null}
                </main>

                <aside>
                  <section>
                    <b>爭點定位</b>
                    <dl>
                      <div><dt>科目</dt><dd>{selectedIssue.subject}</dd></div>
                      <div><dt>章節</dt><dd>{selectedIssue.chapter}</dd></div>
                      <div><dt>相關原始考題</dt><dd>{selectedIssue.questionCount > 0 ? `${selectedIssue.questionCount} 題` : "尚未連結"}</dd></div>
                    </dl>
                  </section>
                  <section>
                    <b>同義詞／搜尋詞</b>
                    <div className="issue-aliases">
                      {selectedIssue.aliases.slice(0, 8).map((alias) => <span key={alias}>{alias}</span>)}
                    </div>
                  </section>
                  {selectedIssueTopic?.resources.length ? (
                    <section>
                      <b>法條、判解與延伸資料</b>
                      <div className="issue-resource-list">
                        {selectedIssueTopic.resources.map((resource) => (
                          <a href={resource.url} target="_blank" rel="noreferrer" key={`${resource.kind}-${resource.title}`}>
                            <span>{resource.kind}・{resource.verification}</span>
                            <strong>{resource.title}</strong>
                            <small>{resource.reason}</small>
                          </a>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  <button
                    className="issue-search-action"
                    type="button"
                    onClick={() => {
                      setIssueWorkspaceTab("choice");
                    }}
                  >
                    直接練習這個爭點
                  </button>
                </aside>
              </div>
            </article>
          ) : issueCatalogOpen ? <div className="issue-library-grid">
            {filteredIssueIndex.map((item) => {
              const openIssue = () => {
                setSelectedIssueKey(item.key);
                setIssueWorkspaceTab("learn");
                setIssuePracticeAnswer("");
                setIssuePracticeSubmitted(false);
                setIssueEssayDraft("");
              };

              return (
              <article
                className="issue-library-card"
                key={item.key}
                role="button"
                tabIndex={0}
                aria-label={`進入${item.concept}爭點學習`}
                onClick={openIssue}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openIssue();
                  }
                }}
              >
                <span>{getIssueDomain(item.subject)}</span>
                <h2>{item.concept}</h2>
                <em>{item.questionCount > 0 ? `${item.questionCount} 題` : "教材"}</em>
              </article>
              );
            })}
          </div> : null}
        </section>
      ) : activeView === "solutionBooks" ? (
        <section className="solution-books-page">
          <div className="solution-books-hero">
            <div>
              <p>TEACHER&apos;S SOLUTION BOOK</p>
              <h1>名師解題書｜免費試練</h1>
              <span>直接練老師解題書收錄的考古題；依授權顯示部分原文，未公布擬答的題目會明確標示。</span>
            </div>
          </div>

          <div className="solution-book-selector" aria-label="選擇解題書">
            {solutionBooks.map((book) => (
              <article
                className={solutionBookId === book.id ? "active" : ""}
                key={book.id}
              >
                <button
                  type="button"
                  aria-pressed={solutionBookId === book.id}
                  onClick={() => {
                    startRandomSolutionBook(book.id);
                  }}
                >
                  <img src={book.cover} alt="" />
                  <div>
                    <span>{book.teacher}・{book.subject}</span>
                    <strong>{book.title}</strong>
                    <small>{book.format}｜原書收錄題目</small>
                  </div>
                </button>
                <a href={book.url} target="_blank" rel="noreferrer" aria-label={`購買《${book.title}》`}>
                  購買本書 ↗
                </a>
              </article>
            ))}
          </div>

          <div className="solution-access-grid" aria-label="練習方案">
            <section className="active">
              <div><span>目前模式</span><b>各章隨機輪練</b></div>
              <p>每次優先抽不同章節，再從該章隨機出題；完成一題就能繼續，不再只給固定一題。</p>
            </section>
            <section className="locked">
              <div><span>完整模式</span><b>全書題庫・付費解鎖</b></div>
              <p>解鎖全書題目、依章節選題、完整模擬考、錯題紀錄與弱點分析。</p>
              <a href={currentSolutionBook.url} target="_blank" rel="noreferrer">購書解鎖完整題庫 ↗</a>
            </section>
          </div>

          {currentSolutionExercise && (
            <section className="solution-practice">
              <div className="solution-practice-cover">
                <img src={currentSolutionBook.cover} alt={`${currentSolutionBook.title}封面`} />
              </div>
              <article className="solution-practice-question">
                <header>
                  <div>
                    <span>{currentSolutionExercise.chapter}・{currentSolutionExercise.topic}</span>
                    <small>{currentSolutionExercise.source}</small>
                  </div>
                  <em>{currentSolutionExercise.page}</em>
                </header>
                <div className="solution-round-status">
                  <b>本次抽題章節</b>
                  <span>{currentSolutionExercise.chapter}</span>
                  <small>
                    本輪已出現 {Math.min(new Set(solutionSeenIds).size, currentSolutionExercises.length)}／{currentSolutionExercises.length} 題
                  </small>
                </div>
                <h2>{currentSolutionExercise.stem}</h2>

                {currentSolutionExercise.type === "choice" && currentSolutionExercise.options ? (
                  <div className="past-exam-choice-list">
                    {(["A", "B", "C", "D"] as const).map((label) => {
                      const isCorrect = solutionSubmitted && currentSolutionExercise.answer === label;
                      const isWrong = solutionSubmitted && solutionOption === label && currentSolutionExercise.answer !== label;
                      return (
                        <button
                          type="button"
                          key={label}
                          disabled={solutionSubmitted}
                          className={`${solutionOption === label ? "selected" : ""} ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}`}
                          onClick={() => setSolutionOption(label)}
                        >
                          <b>{label}</b><span>{currentSolutionExercise.options?.[label]}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    {currentSolutionIssueSpotting && !solutionIssueReady && (
                      <section className="solution-issue-spotting" aria-labelledby="solution-issue-spotting-title">
                        <header>
                          <div>
                            <span>第一步｜先看題抓爭點</span>
                            <h3 id="solution-issue-spotting-title">本題最先要處理哪些爭點？</h3>
                          </div>
                          <small>可選 1–3 項</small>
                        </header>
                        <p>先依題幹判斷，再開始寫；此時不會公布正確答案。</p>
                        <div className="solution-issue-choice-list">
                          {currentSolutionIssueSpotting.choices.map((choice) => {
                            const selected = solutionIssueChoices.includes(choice.id);
                            return (
                              <button
                                type="button"
                                key={choice.id}
                                className={selected ? "selected" : ""}
                                aria-pressed={selected}
                                onClick={() => setSolutionIssueChoices((choices) => {
                                  if (choices.includes(choice.id)) return choices.filter((id) => id !== choice.id);
                                  return choices.length >= 3 ? choices : [...choices, choice.id];
                                })}
                              >
                                <b>{selected ? "✓" : ""}</b><span>{choice.label}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="solution-issue-actions">
                          <button type="button" className="secondary" onClick={() => setSolutionIssueReady(true)}>略過，直接作答</button>
                          <button type="button" disabled={!solutionIssueChoices.length} onClick={() => setSolutionIssueReady(true)}>確認選擇並開始作答</button>
                        </div>
                      </section>
                    )}
                    {(!currentSolutionIssueSpotting || solutionIssueReady) && (
                      <>
                        {currentSolutionIssueSpotting && (
                          <div className="solution-issue-ready" role="status">
                            <span>已完成爭點預判</span>
                            <b>{solutionIssueChoices.length ? `已選 ${solutionIssueChoices.length} 項，交卷後再核對` : "本次直接作答，交卷後可查看原書爭點"}</b>
                          </div>
                        )}
                        {currentSolutionWritingGuide && currentSolutionWritingStep && (
                          <section className="solution-writing-guide" aria-labelledby="solution-writing-guide-title">
                            <header>
                              <div>
                                <span>固定四步驟｜寫作引導</span>
                                <h3 id="solution-writing-guide-title">先選一步，再把它寫進答案</h3>
                              </div>
                              <small>{currentSolutionWritingGuide.sourceNote}</small>
                            </header>
                            <div className="solution-writing-tabs" role="tablist" aria-label="申論寫作四步驟">
                              {currentSolutionWritingGuide.steps.map((step, index) => {
                                const active = step.id === currentSolutionWritingStep.id;
                                return (
                                  <button
                                    type="button"
                                    key={step.id}
                                    role="tab"
                                    aria-selected={active}
                                    className={active ? "active" : ""}
                                    onClick={() => setSolutionWritingStep(step.id)}
                                  >
                                    <b>{index + 1}</b>{step.label}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="solution-writing-panel" role="tabpanel">
                              <span>第 {currentSolutionWritingGuide.steps.findIndex((step) => step.id === currentSolutionWritingStep.id) + 1} 步｜{currentSolutionWritingStep.label}</span>
                              <strong>{currentSolutionWritingStep.prompt}</strong>
                              <p><b>下筆提示：</b>{currentSolutionWritingStep.hint}</p>
                              <div className="solution-writing-choice-list" aria-label={`${currentSolutionWritingStep.label}可選內容`}>
                                {currentSolutionWritingStep.id === "issue"
                                  ? currentSolutionIssueSpotting?.choices.map((choice) => {
                                      const selected = solutionIssueChoices.includes(choice.id);
                                      return (
                                        <button
                                          type="button"
                                          key={choice.id}
                                          className={selected ? "selected" : ""}
                                          aria-pressed={selected}
                                          onClick={() => setSolutionIssueChoices((choices) => {
                                            if (choices.includes(choice.id)) return choices.filter((id) => id !== choice.id);
                                            return choices.length >= 3 ? choices : [...choices, choice.id];
                                          })}
                                        >
                                          <b>{selected ? "✓" : ""}</b><span>{choice.label}</span>
                                        </button>
                                      );
                                    })
                                  : solutionWritingChoices[currentSolutionExercise.id]?.[currentSolutionWritingStep.id].map((choice) => {
                                      const selected = solutionWritingSelections[currentSolutionWritingStep.id].includes(choice);
                                      return (
                                        <button
                                          type="button"
                                          key={choice}
                                          className={selected ? "selected" : ""}
                                          aria-pressed={selected}
                                          onClick={() => setSolutionWritingSelections((selections) => ({
                                            ...selections,
                                            [currentSolutionWritingStep.id]: selected
                                              ? selections[currentSolutionWritingStep.id].filter((item) => item !== choice)
                                              : [...selections[currentSolutionWritingStep.id], choice],
                                          }))}
                                        >
                                          <b>{selected ? "✓" : ""}</b><span>{choice}</span>
                                        </button>
                                      );
                                    })}
                              </div>
                              <div className="solution-writing-selection-actions">
                                <small>
                                  {currentSolutionWritingStep.id === "issue"
                                    ? `已選 ${solutionIssueChoices.length} 項`
                                    : `已選 ${solutionWritingSelections[currentSolutionWritingStep.id].length} 項`}
                                </small>
                                <button
                                  type="button"
                                  disabled={
                                    currentSolutionWritingStep.id === "issue"
                                      ? !solutionIssueChoices.length
                                      : !solutionWritingSelections[currentSolutionWritingStep.id].length
                                  }
                                  onClick={() => {
                                    const selectedLabels = currentSolutionWritingStep.id === "issue"
                                      ? currentSolutionIssueSpotting?.choices
                                          .filter((choice) => solutionIssueChoices.includes(choice.id))
                                          .map((choice) => choice.label) ?? []
                                      : solutionWritingSelections[currentSolutionWritingStep.id];
                                    const prefix = `${currentSolutionWritingStep.label}：`;
                                    setSolutionEssay((essay) => `${essay}${essay.trim() ? "\n" : ""}${prefix}${selectedLabels.join("；")}。\n`);
                                  }}
                                >
                                  加入作答區
                                </button>
                              </div>
                              <small><b>示範寫法：</b>{currentSolutionWritingStep.example}</small>
                            </div>
                            <footer>四步驟的選項均依同一題書中解析整理；選取後仍要自行補上理由，作答後再核對原書重點。</footer>
                          </section>
                        )}
                        <textarea
                          value={solutionEssay}
                          disabled={solutionSubmitted}
                          onChange={(event) => setSolutionEssay(event.target.value)}
                          placeholder={
                            currentSolutionBook.subject === "會計"
                              ? "請列出計算步驟、使用公式與最後答案。提交後提供核對方向，完整計算解析請見書中。"
                              : "先寫下爭點、規範、涵攝與結論。提交後提供檢核方向，完整擬答請見書中。"
                          }
                          aria-label="申論作答區"
                        />
                      </>
                    )}
                  </>
                )}

                {!solutionSubmitted ? (
                  <div className="past-exam-submit-row">
                    <button
                      type="button"
                      disabled={currentSolutionExercise.type === "choice" ? !solutionOption : !solutionIssueReady || solutionEssay.trim().length < 10}
                      onClick={() => setSolutionSubmitted(true)}
                    >
                      提交作答
                    </button>
                  </div>
                ) : (
                  <div className={`solution-practice-result ${currentSolutionExercise.type === "choice" && solutionOption !== currentSolutionExercise.answer ? "wrong" : ""}`}>
                    {currentSolutionExercise.type === "choice" ? (
                      <>
                        <strong>{solutionOption === currentSolutionExercise.answer ? "答對了" : `答錯了・標準答案 ${currentSolutionExercise.answer}`}</strong>
                        <p>本題考點：{currentSolutionExercise.topic}。完整逐題解析、計算過程與老師提醒請見原書。</p>
                      </>
                    ) : (
                      <>
                        <strong>
                          {currentSolutionExercise.previewPoints?.length
                            ? "本題未公開完整擬答・提供部分原文重點"
                            : "本題未公布老師擬答"}
                        </strong>
                        {currentSolutionIssueSpotting && (
                          <section className="solution-issue-feedback" aria-label="爭點辨識核對結果">
                            <header>
                              <div>
                                <span>爭點辨識核對</span>
                                <b>{solutionIssueChoices.length ? `抓到 ${solutionIssueMatches.length}／${currentSolutionIssueSpotting.correctIds.length} 個核心爭點` : "本次未先點選爭點"}</b>
                              </div>
                              <small>{currentSolutionIssueSpotting.sourceNote}</small>
                            </header>
                            {solutionIssueChoices.length > 0 ? (
                              <>
                                {solutionIssueMatches.length > 0 && <p className="matched"><b>已抓到：</b>{solutionIssueMatches.map((id) => currentSolutionIssueSpotting.choices.find((choice) => choice.id === id)?.label).join("、")}</p>}
                                {solutionIssueMisses.length > 0 && <p className="missed"><b>還可補強：</b>{solutionIssueMisses.map((id) => currentSolutionIssueSpotting.choices.find((choice) => choice.id === id)?.label).join("、")}</p>}
                                {solutionIssueExtras.length > 0 && <p className="extra"><b>這題不是主軸：</b>{solutionIssueExtras.map((id) => currentSolutionIssueSpotting.choices.find((choice) => choice.id === id)?.label).join("、")}</p>}
                              </>
                            ) : (
                              <p className="missed"><b>建議核對：</b>{currentSolutionIssueSpotting.correctIds.map((id) => currentSolutionIssueSpotting.choices.find((choice) => choice.id === id)?.label).join("、")}</p>
                            )}
                            <footer>核對依據為本題書中爭點解析；完整法律論證與擬答仍以原書內容為準。</footer>
                          </section>
                        )}
                        {currentSolutionExercise.previewPoints?.length ? (
                          <div className="solution-preview">
                            <div className="solution-preview-heading">
                              <span>部分內容試讀</span>
                              <b>{currentSolutionExercise.previewTitle || "書中部分原文／重點節錄"}</b>
                            </div>
                            <p className="solution-preview-note">
                              以下僅顯示目前可公開的書中重點節錄，並非完整老師擬答；未顯示的內容不會由系統自行補成老師答案。
                            </p>
                            <ol>
                              {currentSolutionExercise.previewPoints.map((point) => <li key={point}>{point}</li>)}
                            </ol>
                            <div className="solution-locked-preview">
                              <span aria-hidden="true">🔒</span>
                              <div>
                                <b>其餘書中解析未在此公開</b>
                                <p>{currentSolutionExercise.lockedDetails?.join("、")}</p>
                              </div>
                              <a href={currentSolutionBook.url} target="_blank" rel="noreferrer">
                                購買本書 ↗
                              </a>
                            </div>
                          </div>
                        ) : (
                          <div className="solution-no-answer">
                            <span>目前資料狀態</span>
                            <p>
                              {currentSolutionBook.subject === "會計"
                                ? "目前只有題目原文，尚未匯入可公開顯示的老師解答或部分原文。你可先核對題意判讀、公式、計算步驟、會計處理及最後答案是否完整。"
                                : "目前只有題目原文，尚未匯入可公開顯示的老師擬答或部分原文。你可先核對爭點辨識、規範依據、涵攝與結論是否完整。"}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    {currentSolutionCompanionBooks.length > 0 && (
                      <aside className="solution-companion-books" aria-label="本題對應教材">
                        <div>
                          <span>章節導購</span>
                          <b>本題對應教材</b>
                          <small>想先補懂觀念，可直接讀對應章節，不必只看解題答案。</small>
                        </div>
                        <div className="solution-companion-list">
                          {currentSolutionCompanionBooks.map((book) => (
                            <a href={book.url} target="_blank" rel="noreferrer" key={book.title}>
                              <span>觀念教材</span>
                              <strong>{book.title}</strong>
                              <small>{book.reason}</small>
                              <em>購買本書 ↗</em>
                            </a>
                          ))}
                        </div>
                      </aside>
                    )}
                    {currentSolutionCompanionCourse && (
                      <aside className="solution-companion-course" aria-label="本題對應影音課程">
                        <div className="solution-course-icon" aria-hidden="true">▶</div>
                        <div>
                          <span>知識達影音</span>
                          <b>{currentSolutionCompanionCourse.teacher}・{currentSolutionCompanionCourse.title}</b>
                          <small>{currentSolutionCompanionCourse.reason}</small>
                        </div>
                        <div className="solution-course-actions">
                          <a className="audition" href={currentSolutionCompanionCourse.auditionUrl} target="_blank" rel="noreferrer">
                            免費試聽
                          </a>
                          <a href={currentSolutionCompanionCourse.courseUrl} target="_blank" rel="noreferrer">
                            查看正規課程 ↗
                          </a>
                        </div>
                      </aside>
                    )}
                    <footer>
                      <button type="button" disabled={!hasAlternativeSolutionExercise} onClick={showNextRandomSolutionExercise}>
                          {hasAlternativeSolutionExercise ? "隨機下一題 →" : "更多題目建置中"}
                        </button>
                    </footer>
                    {!hasAlternativeSolutionExercise && (
                      <p className="solution-next-unavailable" role="status">
                        目前這本書只完成 1 題原文複核，因此無法切換；新題匯入並核對後，這裡才會開放下一題。
                      </p>
                    )}
                  </div>
                )}
              </article>
            </section>
          )}

          <p className="solution-data-note">各章題目會輪流出現；免費可持續隨機練習，指定章節、全書完整題庫、模擬考與完整解析需購書或付費解鎖。</p>

        </section>
      ) : activeView === "pastExams" || activeView === "essayReview" ? (
        <section className="past-exams-page">
          <div className="past-exams-hero">
            <div>
              <p>{activeView === "essayReview" ? "AI ESSAY REVIEW" : "OFFICIAL QUESTION BANK"}</p>
              <h1>{activeView === "essayReview" ? "申論寫作" : "歷屆考古題"}</h1>
              <span>{activeView === "essayReview" ? "不是只看擬答：從審題、列爭點、完整作答，到逐段訂正與重寫。" : "法律與會計分科收錄；選擇題、申論題分開練習。"}</span>
            </div>
            <div className="past-exams-count past-exams-entry">
              <small>{activeView === "essayReview" ? "申論訓練流程" : "選擇考試類別"}</small>
              <strong>{activeView === "essayReview" ? "從寫到改" : "開始練習"}</strong>
              <span>{activeView === "essayReview" ? "審題引導・完整作答・逐段訂正" : pastExamDomain === "law" ? "114 年律師、司法官第一試" : "選擇題・申論題分開練習"}</span>
            </div>
          </div>

          {activeView === "pastExams" && <div className="exam-domain-switch" aria-label="選擇考試類別">
            <button type="button" className={pastExamDomain === "law" ? "active" : ""} onClick={() => setPastExamDomain("law")}>
              <span>法律類</span><small>司律一試・選擇題</small>
            </button>
            <button type="button" className={pastExamDomain === "accounting" ? "active" : ""} onClick={() => setPastExamDomain("accounting")}>
              <span>會計類</span><small>會計師・選擇題／申論題</small>
            </button>
          </div>}

          {activeView === "pastExams" ? pastExamDomain === "law" ? <><div className="past-exams-toolbar">
            <label htmlFor="exam-subject">科目篩選</label>
            <select
              id="exam-subject"
              value={examSubjectFilter}
              onChange={(event) => {
                setExamSubjectFilter(event.target.value);
                setPastExamIndex(0);
                setPastExamOption(null);
                setPastExamSubmitted(false);
                setPastExamResultPanel(null);
                setPastExamAnswered(0);
                setPastExamCorrect(0);
              }}
            >
              {examSubjectGroups.map((group) => <option key={group}>{group}</option>)}
            </select>
            <span>第 {practicePastExams.length ? pastExamIndex + 1 : 0} / {practicePastExams.length} 題</span>
          </div>

          <div className="past-exam-practice-tools" aria-label="歷屆題練習工具">
            <div>
              <strong>今天怎麼練？</strong>
              <small>先選方式，系統會記住你的作答方向</small>
            </div>
            <button type="button" className={pastExamMode === "sequence" ? "active" : ""} onClick={() => { setPastExamMode("sequence"); setPastExamIndex(0); setPastExamSubmitted(false); setPastExamOption(null); }}>
              <b>按年度練</b><span>依序掌握完整考情</span>
            </button>
            <button type="button" className={pastExamMode === "random" ? "active" : ""} onClick={() => { setPastExamMode("random"); setPastExamIndex(Math.floor(Math.random() * Math.max(filteredPastExams.length, 1))); setPastExamSubmitted(false); setPastExamOption(null); }}>
              <b>隨機練習</b><span>利用零碎時間刷題</span>
            </button>
            <button type="button" className={pastExamMode === "wrong" ? "active" : ""} onClick={() => { setPastExamMode("wrong"); setPastExamIndex(0); setPastExamSubmitted(false); setPastExamOption(null); }}>
              <b>錯題複習</b><span>{pastExamWrongIds.length ? `${pastExamWrongIds.length} 題待複習` : "答錯後自動收錄"}</span>
            </button>
          </div>
          <div className="past-exam-quick-stats">
            <span>本次：<b>{pastExamAnswered}</b> 題</span>
            <span>正確率：<b>{pastExamAnswered ? Math.round((pastExamCorrect / pastExamAnswered) * 100) : 0}%</b></span>
            <button type="button" className={pastExamLibraryView === "bookmarks" ? "active" : ""} onClick={() => setPastExamLibraryView((view) => view === "bookmarks" ? null : "bookmarks")}>
              我的收藏 <b>{pastExamBookmarked.length}</b>
            </button>
            <button type="button" className={pastExamLibraryView === "weakness" ? "active" : ""} onClick={() => setPastExamLibraryView((view) => view === "weakness" ? null : "weakness")}>
              弱點分析 <b>{pastExamWrongIds.length}</b>
            </button>
          </div>
          {pastExamLibraryView === "bookmarks" && (
            <section className="exam-learning-library">
              <header><div><span>法律類</span><h3>我的收藏</h3></div><small>收藏題目會保留在這台裝置</small></header>
              {lawBookmarkedQuestions.length ? <div className="exam-library-list">
                {lawBookmarkedQuestions.map((item) => <button type="button" key={officialQuestionId(item)} onClick={() => {
                  setExamSubjectFilter(item.subject_group);
                  const subjectItems = firstExamQuestions.filter((question) => question.correct_answer && question.review_status === "ready_for_review" && question.subject_group === item.subject_group);
                  setPastExamMode("sequence");
                  setPastExamIndex(Math.max(0, subjectItems.findIndex((question) => officialQuestionId(question) === officialQuestionId(item))));
                  setPastExamOption(null);
                  setPastExamSubmitted(false);
                  setPastExamLibraryView(null);
                }}><b>{item.subject_group}・第 {item.number} 題</b><span>{item.stem}</span></button>)}
              </div> : <p>目前還沒有收藏題目。作答後按「收藏本題」，就會出現在這裡。</p>}
            </section>
          )}
          {pastExamLibraryView === "weakness" && (
            <section className="exam-learning-library">
              <header><div><span>法律類</span><h3>真正的弱點診斷</h3></div><small>依科目、章節、考點與反覆作答判斷</small></header>
              {lawWeaknesses.length ? <div className="weakness-list">
                <div className="weakness-diagnosis-note"><b>答錯一題，不直接貼上「弱點」標籤</b><span>先列為待觀察；同考點反覆答錯，才會升級為可能弱點或核心弱點。</span></div>
                {lawWeaknesses.map((profile) => <button type="button" key={profile.key} onClick={() => {
                  const target = firstExamQuestions.find((item) => pastExamWrongIds.includes(officialQuestionId(item)) && classifyOfficialQuestion(item).chapter === profile.chapter);
                  setExamSubjectFilter(target?.subject_group ?? "全部科目");
                  setPastExamMode("wrong");
                  setPastExamIndex(0);
                  setPastExamOption(null);
                  setPastExamSubmitted(false);
                  setPastExamLibraryView(null);
                }}>
                  <span className="weakness-card-top"><b>{profile.subject} → {profile.chapter}</b><em className={`weakness-status status-${profile.status}`}>{profile.status}</em></span>
                  <strong>{profile.concept}</strong>
                  <span className="weakness-evidence">作答 {profile.attempts} 次・答錯 {profile.wrong} 次・答對 {profile.correct} 次</span>
                  <span className="weakness-card-bottom"><small>診斷可信度：{profile.confidence}</small><u>練同考點 →</u></span>
                  <i style={{ width: `${Math.max(18, Math.round((profile.wrong / profile.attempts) * 100))}%` }} />
                </button>)}
              </div> : <p>目前資料還不足。答錯題目後，這裡會依科目整理弱點並讓你直接進入補強。</p>}
            </section>
          )}

          {!currentPastExam && pastExamMode === "wrong" && (
            <div className="past-exam-empty">
              <strong>目前還沒有錯題</strong>
              <p>完成幾題後，答錯的題目會自動收進這裡，之後可以集中複習。</p>
              <button type="button" onClick={() => setPastExamMode("sequence")}>先從全部題目開始</button>
            </div>
          )}
          {currentPastExam && (
            <div className="past-exam-quiz">
              <div className="past-exam-progress" aria-label="作答進度">
                <span style={{ width: `${((pastExamIndex + 1) / filteredPastExams.length) * 100}%` }} />
              </div>
              <article className="past-exam-question">
                <div className="past-exam-question-meta">
                  <span>{currentPastExam.year} 年・{currentPastExam.subject_group}</span>
                  <em>第 {currentPastExam.number} 題</em>
                </div>
                <h2>{currentPastExam.stem}</h2>
                <div className="past-exam-choice-list">
                  {(["A", "B", "C", "D"] as const).map((label) => {
                    const isCorrect = pastExamSubmitted && currentPastExam.correct_answer === label;
                    const isWrong = pastExamSubmitted && pastExamOption === label && currentPastExam.correct_answer !== label;
                    return (
                      <button
                        type="button"
                        key={label}
                        disabled={pastExamSubmitted}
                        className={`${pastExamOption === label ? "selected" : ""} ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}`}
                        onClick={() => setPastExamOption(label)}
                      >
                        <b>{label}</b>
                        <span>{currentPastExam.options[label]}</span>
                      </button>
                    );
                  })}
                </div>

                {!pastExamSubmitted ? (
                  <div className="past-exam-submit-row">
                    <small>選擇答案後再確認作答</small>
                    <button
                      type="button"
                      disabled={!pastExamOption}
                      onClick={() => {
                        const isCorrect = pastExamOption === currentPastExam.correct_answer;
                        setPastExamSubmitted(true);
                        setPastExamAnswered((value) => value + 1);
                        setLawExamAttempts((items) => [...items, {
                          questionId: officialQuestionId(currentPastExam),
                          correct: isCorrect,
                          answeredAt: new Date().toISOString(),
                        }]);
                        if (isCorrect) {
                          setPastExamCorrect((value) => value + 1);
                          if (pastExamMode === "wrong") {
                            setPastExamWrongIds((ids) => ids.filter((id) => id !== officialQuestionId(currentPastExam)));
                          }
                        } else {
                          setPastExamWrongIds((ids) => ids.includes(officialQuestionId(currentPastExam)) ? ids : [...ids, officialQuestionId(currentPastExam)]);
                        }
                      }}
                    >
                      確認作答
                    </button>
                  </div>
                ) : (
                  <section className={`past-exam-result ${pastExamOption === currentPastExam.correct_answer ? "correct" : "wrong"}`} aria-live="polite">
                    <div>
                      <span>{pastExamOption === currentPastExam.correct_answer ? "答對了" : "答錯了"}</span>
                      <strong>標準答案：{currentPastExam.correct_answer}</strong>
                    </div>
                    <div className="past-exam-result-action">
                      <p>你選擇的是 {pastExamOption}。本題已完成答案確認。</p>
                      <button type="button" className="past-exam-bookmark" onClick={() => setPastExamBookmarked((ids) => ids.includes(officialQuestionId(currentPastExam)) ? ids.filter((id) => id !== officialQuestionId(currentPastExam)) : [...ids, officialQuestionId(currentPastExam)])}>
                        {pastExamBookmarked.includes(officialQuestionId(currentPastExam)) ? "★ 已收藏" : "☆ 收藏本題"}
                      </button>
                      <div className="past-exam-result-tools" aria-label="答題後學習功能">
                        <button
                          type="button"
                          className={pastExamResultPanel === "ai" ? "active" : ""}
                          disabled={pastExamAiLoading}
                          aria-pressed={pastExamResultPanel === "ai"}
                          aria-busy={pastExamAiLoading}
                          onClick={() => {
                            setPastExamResultPanel("ai");
                            if (!pastExamAiExplanation && !pastExamAiLoading) void generatePastExamExplanation();
                          }}
                        >
                          {pastExamAiLoading ? "AI 解析中…" : "AI 解析"}
                        </button>
                        <button
                          type="button"
                          className={pastExamResultPanel === "analysis" ? "active" : ""}
                          aria-pressed={pastExamResultPanel === "analysis"}
                          onClick={() => setPastExamResultPanel("analysis")}
                        >
                          考點分析
                        </button>
                        <button
                          type="button"
                          className={pastExamResultPanel === "learning" ? "active" : ""}
                          aria-pressed={pastExamResultPanel === "learning"}
                          onClick={() => setPastExamResultPanel("learning")}
                        >
                          延伸學習
                        </button>
                      </div>
                      <small>三項功能在同一位置切換，不會向下重複展開。</small>
                    </div>
                    {pastExamResultPanel === "analysis" && currentPastExamClassification && (
                      <div className="past-exam-learning-map">
                        <div className="past-exam-learning-heading">
                          <div className="past-exam-learning-title">
                            <span>這題真正考什麼？</span>
                            <small>先找出考點與缺口，再進入對應內容補強</small>
                          </div>
                          <div className="past-exam-learning-steps" aria-label="本題學習順序">
                            <span><b>1</b>掌握核心概念</span>
                            <span><b>2</b>核對法條依據</span>
                            <span><b>3</b>進入對應學習</span>
                          </div>
                          <dl>
                            <div><dt>法律科目</dt><dd>{currentPastExamClassification.law}</dd></div>
                            <div><dt>章節定位</dt><dd>{currentPastExamClassification.chapter}</dd></div>
                            <div><dt>核心考點</dt><dd className="past-exam-concept-list">{currentPastExamClassification.concepts.map((concept) => <span key={concept}>{concept}</span>)}</dd></div>
                            <div>
                              <dt>法條依據</dt>
                              <dd>
                                {officialStatutesLoading && "正在查詢法務部全國法規資料庫…"}
                                {!officialStatutesLoading && officialStatutes.length > 0 && (
                                  <span className="official-statute-list">
                                    {officialStatutes.map((statute) => (
                                      <span key={`${statute.name}-${statute.article}`}>
                                        <b>{statute.name}第 {statute.article} 條</b>
                                        <em>{statute.text}</em>
                                        <a href={statute.sourceUrl} target="_blank" rel="noreferrer">查看官方全文 ↗</a>
                                      </span>
                                    ))}
                                    <small>
                                      法務部全國法規資料庫
                                      {officialStatutesCheckedAt ? `｜查詢時間 ${new Date(officialStatutesCheckedAt).toLocaleString("zh-TW")}` : ""}
                                    </small>
                                  </span>
                                )}
                                {!officialStatutesLoading && officialStatutesError && (
                                  <span className="official-statute-error">{officialStatutesError}</span>
                                )}
                                {!officialStatutesLoading && !officialStatutesError && officialStatutes.length === 0 && (
                                  currentPastExamClassification.statutes.length
                                    ? "已辨識可能條文，等待官方資料源回應。"
                                    : "本題尚未辨識出可核對的具體條號。"
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>辨識方式</dt>
                              <dd>
                                {currentPastExamClassification.classificationMethod}
                                <small className="classification-basis">
                                  {currentPastExamClassification.classificationBasis.join("；")}
                                </small>
                              </dd>
                            </div>
                            <div><dt>資料狀態</dt><dd>{currentPastExamClassification.verified ? "已完成初步自動分類・可再人工複核" : "自動分類信心不足・需要人工複核"}</dd></div>
                          </dl>
                        </div>
                      </div>
                    )}
                    {pastExamResultPanel === "ai" && (
                      <div className="ai-analysis-inline">
                        <div className="ai-analysis-inline-heading">
                          <div>
                            <span>AI 解題解析</span>
                            <small>
                              補充理解選項與答案理由・尚未經老師核對
                              {pastExamAiExplanationCache === "hit" ? "・已讀取已儲存解析" : ""}
                              {pastExamAiExplanationCache === "miss" ? "・本次產生後已儲存" : ""}
                            </small>
                          </div>
                        </div>
                        {pastExamAiLoading && <AccountingSolutionProgress step={pastExamAiProgressStep} />}
                        {pastExamAiExplanation && <AccountingSolutionFlow answer={pastExamAiExplanation} />}
                        {pastExamAiError && (
                          <div className="accounting-ai-explanation-error" role="alert">
                            <p>{pastExamAiError}</p>
                            <button type="button" onClick={() => void generatePastExamExplanation()}>
                              再試一次
                            </button>
                          </div>
                        )}
                        {!pastExamAiLoading && !pastExamAiExplanation && !pastExamAiError && (
                          <p className="past-exam-ai-empty">按「AI 解析」後，會在這裡顯示選項與答案理由。</p>
                        )}
                      </div>
                    )}
                    {pastExamResultPanel === "learning" && (
                      <div className="past-exam-learning-map">
                        <div className="past-exam-learning-title">
                          <span>延伸學習</span>
                          <small>只顯示已有實際內容索引與對應依據的書籍、課程或相關資料</small>
                        </div>
                        {currentPastExamResources.length > 0 ? (
                          <div className="past-exam-related-products">
                            <strong>
                              {currentPastExamResources.every((item) => item.kind === "書籍")
                                ? "到對應書籍補強"
                                : "接著學習這個考點"}
                            </strong>
                            {currentPastExamResources.map((item) => (
                              <article key={`${item.kind}-${item.title}`}>
                                <div className="past-exam-product-heading">
                                  <span>{item.kind}</span>
                                  <div><b>{item.title}</b><small>{item.creator}｜{item.meta}</small></div>
                                  <a href={item.url} target="_blank" rel="noreferrer">
                                    {item.kind === "書籍"
                                      ? "查看書籍介紹 ↗"
                                      : item.kind === "課程"
                                        ? "查看課程介紹 ↗"
                                        : item.kind === "期刊"
                                          ? "查看摘要頁 ↗"
                                          : "查看相關資訊 ↗"}
                                  </a>
                                </div>
                                {item.kind !== "書籍" && item.previewText ? (
                                  <blockquote>
                                    <span>對應內容試讀</span>
                                    <p>{item.previewText}</p>
                                    <cite>{item.previewLocation}</cite>
                                  </blockquote>
                                ) : null}
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="past-exam-no-match">目前公司內容索引中沒有已核對的精準對應資料，因此不顯示推薦卡。</p>
                        )}
                      </div>
                    )}
                    <footer>
                      <a href={currentPastExam.source_url} target="_blank" rel="noreferrer">查看原始考題 ↗</a>
                      <button type="button" onClick={() => {
                        setPastExamIndex((value) => pastExamMode === "random" ? Math.floor(Math.random() * Math.max(practicePastExams.length, 1)) : (value + 1) % Math.max(practicePastExams.length, 1));
                        setPastExamOption(null);
                        setPastExamSubmitted(false);
                        setPastExamAiExplanation("");
                        setPastExamAiExplanationCache(null);
                        setPastExamAiError("");
                        setPastExamAiProgressStep(0);
                        setPastExamResultPanel(null);
                      }}>下一題 →</button>
                    </footer>
                  </section>
                )}
              </article>
              <aside className="past-exam-session">
                <span>本次練習</span>
                <div><strong>{pastExamAnswered}</strong><small>已作答</small></div>
                <div><strong>{pastExamCorrect}</strong><small>答對</small></div>
                <div><strong>{pastExamAnswered ? Math.round((pastExamCorrect / pastExamAnswered) * 100) : 0}%</strong><small>正確率</small></div>
              </aside>
            </div>
          )}</> : (
            <section className="accounting-practice">
              <header className="accounting-practice-heading">
                <div>
                  <span>會計歷屆考題</span>
                  <h2>選一種題型，直接開始作答</h2>
                  <p>每題獨立作答；送出後立即核對標準答案與解析，再進入下一題。</p>
                </div>
              </header>
              <div className="accounting-format-switch">
                <button type="button" className={accountingExamFormat === "choice" ? "active" : ""} onClick={() => {
                  setAccountingExamFormat("choice");
                  setAccountingExamOption(null);
                  setAccountingExamSubmitted(false);
                  setAccountingAiExplanation("");
                  setAccountingAiExplanationError("");
                }}>
                  <b>選擇題</b><span>{accountingChoiceQuestions.length} 題可立即練習</span>
                </button>
                <button type="button" className={accountingExamFormat === "essay" ? "active" : ""} onClick={() => {
                  setAccountingExamFormat("essay");
                  setAccountingEssaySubmitted(false);
                  setAccountingEssaySampleMode(null);
                }}>
                  <b>申論題</b><span>{accountingEssayQuestions.length} 題可進入作答</span>
                </button>
              </div>

              {accountingExamFormat === "choice" && (
                <>
                  <div className="past-exam-practice-tools accounting-practice-tools" aria-label="會計歷屆題練習工具">
                    <div>
                      <strong>今天怎麼練？</strong>
                      <small>會計作答紀錄會與法律類分開累積</small>
                    </div>
                    <button type="button" className={accountingExamMode === "sequence" ? "active" : ""} onClick={() => {
                      setAccountingExamMode("sequence");
                      setAccountingExamIndex(0);
                      setAccountingExamSubmitted(false);
                      setAccountingExamOption(null);
                    }}>
                      <b>按年度練習</b><span>依序掌握歷年考情</span>
                    </button>
                    <button type="button" className={accountingExamMode === "random" ? "active" : ""} onClick={() => {
                      setAccountingExamMode("random");
                      setAccountingExamIndex(Math.floor(Math.random() * Math.max(accountingChoiceQuestions.length, 1)));
                      setAccountingExamSubmitted(false);
                      setAccountingExamOption(null);
                    }}>
                      <b>隨機練習</b><span>利用零碎時間刷題</span>
                    </button>
                    <button type="button" className={accountingExamMode === "wrong" ? "active" : ""} onClick={() => {
                      setAccountingExamMode("wrong");
                      setAccountingExamIndex(0);
                      setAccountingExamSubmitted(false);
                      setAccountingExamOption(null);
                    }}>
                      <b>錯題複習</b><span>{accountingExamWrongIds.length ? `${accountingExamWrongIds.length} 題待複習` : "答錯後自動收錄"}</span>
                    </button>
                  </div>
                  <div className="past-exam-quick-stats">
                    <span>本次：<b>{accountingExamAnswered}</b> 題</span>
                    <span>正確率：<b>{accountingExamAnswered ? Math.round((accountingExamCorrect / accountingExamAnswered) * 100) : 0}%</b></span>
                    <button type="button" className={pastExamLibraryView === "bookmarks" ? "active" : ""} onClick={() => setPastExamLibraryView((view) => view === "bookmarks" ? null : "bookmarks")}>
                      我的收藏 <b>{accountingExamBookmarked.length}</b>
                    </button>
                    <button type="button" className={pastExamLibraryView === "weakness" ? "active" : ""} onClick={() => setPastExamLibraryView((view) => view === "weakness" ? null : "weakness")}>
                      弱點分析 <b>{accountingExamWrongIds.length}</b>
                    </button>
                  </div>
                  {pastExamLibraryView === "bookmarks" && (
                    <section className="exam-learning-library">
                      <header><div><span>會計類</span><h3>我的收藏</h3></div><small>與法律收藏分開保存</small></header>
                      {accountingBookmarkedQuestions.length ? <div className="exam-library-list">
                        {accountingBookmarkedQuestions.map((item) => <button type="button" key={item.id} onClick={() => {
                          setAccountingExamMode("sequence");
                          setAccountingExamIndex(Math.max(0, accountingChoiceQuestions.findIndex((question) => question.id === item.id)));
                          setAccountingExamOption(null);
                          setAccountingExamSubmitted(false);
                          setPastExamLibraryView(null);
                        }}><b>{item.chapter}・{item.topic}</b><span>{item.stem}</span></button>)}
                      </div> : <p>目前還沒有收藏題目。作答後按「收藏本題」，就會出現在這裡。</p>}
                    </section>
                  )}
                  {pastExamLibraryView === "weakness" && (
                    <section className="exam-learning-library">
                      <header><div><span>會計類</span><h3>真正的弱點診斷</h3></div><small>依章節、會計觀念與反覆作答判斷</small></header>
                      {accountingWeaknesses.length ? <div className="weakness-list">
                        <div className="weakness-diagnosis-note"><b>先判斷是哪個觀念出錯</b><span>首次答錯只列待觀察；複習後再錯，才提高弱點等級與診斷可信度。</span></div>
                        {accountingWeaknesses.map((profile) => <button type="button" key={profile.key} onClick={() => {
                          setAccountingExamMode("wrong");
                          setAccountingExamIndex(Math.max(0, accountingPracticeQuestions.findIndex((item) => item.chapter === profile.chapter && item.topic === profile.concept)));
                          setAccountingExamOption(null);
                          setAccountingExamSubmitted(false);
                          setPastExamLibraryView(null);
                        }}>
                          <span className="weakness-card-top"><b>中級會計 → {profile.chapter}</b><em className={`weakness-status status-${profile.status}`}>{profile.status}</em></span>
                          <strong>{profile.concept}</strong>
                          <span className="weakness-evidence">作答 {profile.attempts} 次・答錯 {profile.wrong} 次・答對 {profile.correct} 次</span>
                          <span className="weakness-card-bottom"><small>診斷可信度：{profile.confidence}</small><u>練同考點 →</u></span>
                          <i style={{ width: `${Math.max(18, Math.round((profile.wrong / profile.attempts) * 100))}%` }} />
                        </button>)}
                      </div> : <p>目前資料還不足。答錯題目後，這裡會依章節整理弱點並讓你直接進入錯題補強。</p>}
                    </section>
                  )}
                </>
              )}

              {accountingExamFormat === "choice" && !currentAccountingChoice && accountingExamMode === "wrong" && (
                <div className="past-exam-empty">
                  <strong>目前還沒有會計錯題</strong>
                  <p>完成幾題後，答錯的題目會自動收進這裡，之後可以集中複習。</p>
                  <button type="button" onClick={() => setAccountingExamMode("sequence")}>先從全部題目開始</button>
                </div>
              )}

              {accountingExamFormat === "choice" && currentAccountingChoice?.type === "choice" ? (
                <article className="past-exam-question accounting-question">
                  <div className="past-exam-question-meta">
                    <span>{currentAccountingChoice.source}</span>
                    <em>第 {accountingExamIndex + 1}／{accountingPracticeQuestions.length} 題</em>
                  </div>
                  <small className="accounting-topic">{currentAccountingChoice.chapter}・{currentAccountingChoice.topic}</small>
                  <h2>{currentAccountingChoice.stem}</h2>
                  <div className="past-exam-choice-list">
                    {(["A", "B", "C", "D"] as const).map((label) => {
                      const isCorrect = accountingExamSubmitted && currentAccountingChoice.answer === label;
                      const isWrong = accountingExamSubmitted && accountingExamOption === label && currentAccountingChoice.answer !== label;
                      return (
                        <button
                          type="button"
                          key={label}
                          disabled={accountingExamSubmitted}
                          className={`${accountingExamOption === label ? "selected" : ""} ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}`}
                          onClick={() => setAccountingExamOption(label)}
                        >
                          <b>{label}</b><span>{currentAccountingChoice.options[label]}</span>
                        </button>
                      );
                    })}
                  </div>
                  {!accountingExamSubmitted ? (
                    <div className="past-exam-submit-row">
                      <small>選好答案後再確認</small>
                      <button type="button" disabled={!accountingExamOption} onClick={() => {
                        const isCorrect = accountingExamOption === currentAccountingChoice.answer;
                        setAccountingExamSubmitted(true);
                        setAccountingExamAnswered((value) => value + 1);
                        setAccountingExamAttempts((items) => [...items, {
                          questionId: currentAccountingChoice.id,
                          correct: isCorrect,
                          answeredAt: new Date().toISOString(),
                        }]);
                        if (isCorrect) {
                          setAccountingExamCorrect((value) => value + 1);
                          if (accountingExamMode === "wrong") {
                            setAccountingExamWrongIds((ids) => ids.filter((id) => id !== currentAccountingChoice.id));
                          }
                        } else {
                          setAccountingExamWrongIds((ids) => ids.includes(currentAccountingChoice.id) ? ids : [...ids, currentAccountingChoice.id]);
                        }
                      }}>確認作答</button>
                    </div>
                  ) : (
                    <section className={`past-exam-result ${accountingExamOption === currentAccountingChoice.answer ? "correct" : "wrong"}`}>
                      {(() => {
                        const recommendation = accountingLearningRecommendation(
                          currentAccountingChoice.chapter,
                          currentAccountingChoice.topic,
                          "選擇題",
                        );
                        const relatedExercises = [...accountingChoiceQuestions, ...accountingEssayQuestions]
                          .filter((item) =>
                            item.id !== currentAccountingChoice.id &&
                            (item.chapter === currentAccountingChoice.chapter ||
                              item.topic.includes(currentAccountingChoice.topic) ||
                              currentAccountingChoice.topic.includes(item.topic)),
                          )
                          .slice(0, 3);
                        return (
                          <>
                      <div>
                        <span>{accountingExamOption === currentAccountingChoice.answer ? "答對了" : "答錯了"}</span>
                        <strong>標準答案：{currentAccountingChoice.answer}</strong>
                      </div>
                      <div className="past-exam-result-action">
                        <p>你選擇的是 {accountingExamOption}。本題已完成答案確認。</p>
                        <button
                          type="button"
                          className="past-exam-bookmark"
                          onClick={() => setAccountingExamBookmarked((ids) =>
                            ids.includes(currentAccountingChoice.id)
                              ? ids.filter((id) => id !== currentAccountingChoice.id)
                              : [...ids, currentAccountingChoice.id]
                          )}
                        >
                          {accountingExamBookmarked.includes(currentAccountingChoice.id) ? "★ 已收藏" : "☆ 收藏本題"}
                        </button>
                        <div className="past-exam-result-tools" aria-label="答題後學習功能">
                          <button
                            type="button"
                            className={accountingExamResultPanel === "ai" ? "active" : ""}
                            disabled={accountingAiExplanationLoading}
                            aria-pressed={accountingExamResultPanel === "ai"}
                            onClick={() => {
                              setAccountingExamResultPanel("ai");
                              if (!accountingAiExplanation && !accountingAiExplanationLoading) void generateAccountingExplanation();
                            }}
                          >
                            {accountingAiExplanationLoading ? "AI 解析中…" : "AI 解析"}
                          </button>
                          <button type="button" className={accountingExamResultPanel === "analysis" ? "active" : ""} aria-pressed={accountingExamResultPanel === "analysis"} onClick={() => setAccountingExamResultPanel("analysis")}>
                            考點分析
                          </button>
                          <button type="button" className={accountingExamResultPanel === "learning" ? "active" : ""} aria-pressed={accountingExamResultPanel === "learning"} onClick={() => setAccountingExamResultPanel("learning")}>
                            延伸學習
                          </button>
                        </div>
                        <small>三項功能在同一位置切換，不會向下重複展開。</small>
                      </div>
                      {accountingExamResultPanel === "analysis" && (
                        <div className="past-exam-learning-map accounting-analysis-map">
                          <div className="past-exam-learning-title">
                            <span>這題真正考什麼？</span>
                            <small>依已匯入題庫的章節與考點標籤整理</small>
                          </div>
                          <dl>
                            <div><dt>會計科目</dt><dd>中級會計學</dd></div>
                            <div><dt>章節定位</dt><dd>{currentAccountingChoice.chapter}</dd></div>
                            <div><dt>核心考點</dt><dd className="past-exam-concept-list"><span>{currentAccountingChoice.topic}</span></dd></div>
                            <div><dt>資料依據</dt><dd>{currentAccountingChoice.source}</dd></div>
                          </dl>
                        </div>
                      )}
                      {accountingExamResultPanel === "ai" && (accountingAiExplanationLoading || accountingAiExplanation || accountingAiExplanationError) && (
                        <div className="ai-analysis-inline">
                          <div className="ai-analysis-inline-heading">
                            <div>
                              <span>AI 解題解析</span>
                              <small>系統另行生成・並非名師解題書原文</small>
                            </div>
                            {(accountingAiExplanation || accountingAiExplanationError) && (
                              <button
                                type="button"
                                aria-expanded={accountingAiExplanationOpen}
                                onClick={() => setAccountingAiExplanationOpen((open) => !open)}
                              >
                                {accountingAiExplanationOpen ? "收合 AI 解析 ↑" : "展開 AI 解析 ↓"}
                              </button>
                            )}
                          </div>
                          {accountingAiExplanationOpen && (
                            <>
                              {accountingAiExplanationLoading && <AccountingSolutionProgress step={accountingAiProgressStep} />}
                              {accountingAiExplanation && <AccountingSolutionFlow answer={accountingAiExplanation} />}
                              {accountingAiExplanationError && <p className="accounting-ai-explanation-error">{accountingAiExplanationError}</p>}
                            </>
                          )}
                        </div>
                      )}
                      {currentAccountingChoice.source.includes("名師解題書") && (
                        <aside className="solution-locked-preview" aria-label="名師完整解析需解鎖">
                          <span aria-hidden="true">🔒</span>
                          <div>
                            <b>鄭泓老師完整解析已鎖定</b>
                            <p>書中的原始解析、計算過程與老師提醒不在未購買狀態顯示；下方 AI 解析為系統另行生成，並非書籍原文。</p>
                          </div>
                          <a href="https://publish.get.com.tw/Book.asp?BKID=20276" target="_blank" rel="noreferrer">
                            解鎖／購買本書 ↗
                          </a>
                        </aside>
                      )}
                      <footer>
                        <span />
                        <button type="button" onClick={() => {
                          setAccountingExamIndex((value) => accountingExamMode === "random"
                            ? Math.floor(Math.random() * Math.max(accountingPracticeQuestions.length, 1))
                            : (value + 1) % Math.max(accountingPracticeQuestions.length, 1));
                          setAccountingExamOption(null);
                          setAccountingExamSubmitted(false);
                          setAccountingAiExplanation("");
                          setAccountingAiExplanationError("");
                          setAccountingExamResultPanel(null);
                        }}>下一題 →</button>
                      </footer>
                      {accountingExamResultPanel === "learning" && <aside className="learning-next-step" aria-label="下一步學習推薦">
                        <header>
                          <span>依本題表現推薦</span>
                          <strong>下一步學習</strong>
                          <p>{recommendation.weakness}</p>
                        </header>
                        <div className="learning-next-grid">
                          {[["課程", recommendation.course], ["書籍", recommendation.book]].map(([kind, item]) => (
                            <a href={item.url} target="_blank" rel="noreferrer" key={kind}>
                              <span>{kind}</span>
                              <strong>{item.title}</strong>
                              <small>{item.meta}</small>
                              <p>{item.reason}</p>
                              <b>{kind === "課程" ? "前往試聽" : kind === "書籍" ? "查看書籍介紹" : "查看相關考題"} ↗</b>
                            </a>
                          ))}
                          <div className="learning-related-exams">
                            <span>相關考題</span>
                            <strong>{relatedExercises.length ? `已找出 ${relatedExercises.length} 題同考點題目` : "精準題目比對中"}</strong>
                            <small>依章節、考點與題型從已匯入題庫比對</small>
                            {relatedExercises.length ? (
                              <ol>
                                {relatedExercises.map((exercise) => (
                                  <li key={exercise.id}>
                                    <button type="button" onClick={() => {
                                      if (exercise.type === "choice") {
                                        setAccountingExamFormat("choice");
                                        setAccountingExamMode("sequence");
                                        setAccountingExamIndex(accountingChoiceQuestions.findIndex((item) => item.id === exercise.id));
                                        setAccountingExamOption(null);
                                        setAccountingExamSubmitted(false);
                                      } else {
                                        setAccountingExamFormat("essay");
                                        setAccountingEssayIndex(accountingEssayQuestions.findIndex((item) => item.id === exercise.id));
                                        setAccountingEssayDraft("");
                                        setAccountingEssaySubmitted(false);
                                      }
                                    }}>
                                      <b>{exercise.source}</b>
                                      <small>{exercise.topic}・{exercise.type === "choice" ? "選擇題" : "申論題"}</small>
                                    </button>
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p>目前題庫尚無已核對的精準對應，不以考題首頁代替推薦。</p>
                            )}
                          </div>
                        </div>
                        <footer>推薦依據：本題科目、章節、考點與作答結果；相關題目直接來自站內已匯入並核對的題庫。</footer>
                      </aside>}
                          </>
                        );
                      })()}
                    </section>
                  )}
                </article>
              ) : accountingExamFormat === "essay" && currentAccountingEssay.type === "essay" ? (
                <article className="accounting-essay-question">
                  <div className="past-exam-question-meta">
                    <span>{currentAccountingEssay.source}</span>
                    <em>第 {accountingEssayIndex + 1}／{accountingEssayQuestions.length} 題</em>
                  </div>
                  <small className="accounting-topic">{currentAccountingEssay.chapter}・{currentAccountingEssay.topic}</small>
                  <h2>{currentAccountingEssay.stem}</h2>
                  <div className="accounting-sample-heading">
                    <div>
                      <label htmlFor="accounting-essay-draft">你的作答</label>
                      <small>主管示範可一鍵載入「大致正確」或「含常見錯誤」的學生作答。</small>
                    </div>
                    {!accountingEssaySubmitted && (
                      <div className="accounting-sample-buttons">
                        <button type="button" onClick={() => {
                          setAccountingEssayDraft(accountingEssaySample(currentAccountingEssay, "correct"));
                          setAccountingEssaySampleMode("correct");
                        }}>載入答對示範</button>
                        <button type="button" className="wrong" onClick={() => {
                          setAccountingEssayDraft(accountingEssaySample(currentAccountingEssay, "wrong"));
                          setAccountingEssaySampleMode("wrong");
                        }}>載入有錯示範</button>
                      </div>
                    )}
                  </div>
                  <textarea
                    id="accounting-essay-draft"
                    value={accountingEssayDraft}
                    onChange={(event) => {
                      setAccountingEssayDraft(event.target.value);
                      setAccountingEssaySampleMode(null);
                    }}
                    disabled={accountingEssaySubmitted}
                    placeholder="請列出公式、計算步驟、分錄與最後答案……"
                  />
                  {!accountingEssaySubmitted ? (
                    <div className="accounting-essay-actions">
                      <button type="button" className="secondary" onClick={() => {
                        setAccountingEssayDraft("");
                        setAccountingEssaySampleMode(null);
                      }}>清除</button>
                      <button type="button" disabled={!accountingEssayDraft.trim()} onClick={() => {
                        setAccountingEssaySubmitted(true);
                      }}>送出答案</button>
                    </div>
                  ) : (
                    <section className="accounting-essay-result">
                      {(() => {
                        const recommendation = accountingLearningRecommendation(
                          currentAccountingEssay.chapter,
                          currentAccountingEssay.topic,
                          "申論題",
                        );
                        const relatedExercises = [...accountingChoiceQuestions, ...accountingEssayQuestions]
                          .filter((item) =>
                            item.id !== currentAccountingEssay.id &&
                            (item.chapter === currentAccountingEssay.chapter ||
                              item.topic.includes(currentAccountingEssay.topic) ||
                              currentAccountingEssay.topic.includes(item.topic)),
                          )
                          .slice(0, 3);
                        return (
                          <>
                      <header>
                        <span>{accountingEssaySampleMode === "correct" ? "示範：大致答對" : accountingEssaySampleMode === "wrong" ? "示範：含常見錯誤" : "作答完成"}</span>
                        <strong>標準答案</strong>
                      </header>
                      {accountingEssaySampleMode === "wrong" && (
                        <div className="accounting-demo-diagnosis">
                          <strong>AI 判讀：依你的算式找到第一個錯誤</strong>
                          <div className="accounting-diagnosis-steps">
                            <p><b>算對的部分</b><span>{currentAccountingEssayDiagnosis.correct}</span></p>
                            <p className="error"><b>第一個錯誤</b><span>{currentAccountingEssayDiagnosis.firstError}</span></p>
                            <p><b>正確修正</b><span>{currentAccountingEssayDiagnosis.correction}</span></p>
                            <p className="result"><b>連鎖結果</b><span>{currentAccountingEssayDiagnosis.result}</span></p>
                          </div>
                          {!accountingCorrectionMode && (
                            <div className="accounting-correction-choices">
                              <button type="button" onClick={() => setAccountingCorrectionMode("self")}>
                                <b>我想自己訂正</b><span>只給第一個錯誤位置，不先揭曉答案</span>
                              </button>
                              <button type="button" className="primary" onClick={() => {
                                setAccountingCorrectionMode("coach");
                                setAccountingCorrectionStep(0);
                              }}>
                                <b>AI 帶我一步一步訂正</b><span>每次只問一個關鍵問題</span>
                              </button>
                              <button type="button" onClick={() => setAccountingCorrectionMode("full")}>
                                <b>直接看完整解析</b><span>展開標準計算與答案</span>
                              </button>
                            </div>
                          )}
                          {accountingCorrectionMode === "self" && (
                            <div className="accounting-self-correction">
                              <span>提示 1／1</span>
                              <strong>請從「132,000」開始檢查：這個金額是稅前淨利，還是稅後淨利？</strong>
                              <textarea
                                value={accountingCorrectionAnswer}
                                onChange={(event) => setAccountingCorrectionAnswer(event.target.value)}
                                placeholder="在這裡重新寫出後續算式與答案……"
                              />
                              <button type="button" onClick={() => setAccountingCorrectionMode("coach")}>需要 AI 再提示我</button>
                            </div>
                          )}
                          {accountingCorrectionMode === "coach" && currentAccountingEssay.id === "zh-essay-2" && (
                            <div className="accounting-correction-coach">
                              <header><span>AI 訂正模式</span><strong>第 {Math.min(accountingCorrectionStep + 1, 3)}／3 步</strong></header>
                              <div className="accounting-correction-timeline">
                                {["辨認金額", "處理所得稅", "重算股利"].map((label, index) => (
                                  <i className={index < accountingCorrectionStep ? "done" : index === accountingCorrectionStep ? "current" : ""} key={label}>{index + 1}<small>{label}</small></i>
                                ))}
                              </div>
                              {accountingCorrectionStep === 0 && (
                                <>
                                  <p><b>先保留你算對的部分：</b>銷貨淨額 477,000 正確；132,000 的計算也正確。請判斷 132,000 是哪一種淨利？</p>
                                  <div className="accounting-coach-options">
                                    {["稅前淨利", "稅後淨利", "我不確定"].map((choice) => (
                                      <button type="button" className={accountingCorrectionChoice === choice ? "selected" : ""} onClick={() => setAccountingCorrectionChoice(choice)} key={choice}>{choice}</button>
                                    ))}
                                  </div>
                                  <button type="button" disabled={!accountingCorrectionChoice} onClick={() => {
                                    if (accountingCorrectionChoice === "稅前淨利") {
                                      setAccountingCorrectionStep(1);
                                      setAccountingCorrectionChoice("");
                                    }
                                  }}>{accountingCorrectionChoice && accountingCorrectionChoice !== "稅前淨利" ? "再想一次：題目另列所得稅" : "確認答案"}</button>
                                </>
                              )}
                              {accountingCorrectionStep === 1 && (
                                <>
                                  <p><b>正確，132,000 是稅前淨利。</b>題目另有所得稅 32,000，下一步應如何處理？</p>
                                  <div className="accounting-coach-options">
                                    {["加上 32,000", "扣除 32,000", "不需處理"].map((choice) => (
                                      <button type="button" className={accountingCorrectionChoice === choice ? "selected" : ""} onClick={() => setAccountingCorrectionChoice(choice)} key={choice}>{choice}</button>
                                    ))}
                                  </div>
                                  <button type="button" disabled={!accountingCorrectionChoice} onClick={() => {
                                    if (accountingCorrectionChoice === "扣除 32,000") {
                                      setAccountingCorrectionStep(2);
                                      setAccountingCorrectionChoice("");
                                    }
                                  }}>{accountingCorrectionChoice && accountingCorrectionChoice !== "扣除 32,000" ? "提示：所得稅是本期費用" : "確認答案"}</button>
                                </>
                              )}
                              {accountingCorrectionStep === 2 && (
                                <>
                                  <p><b>很好，稅後淨利＝132,000－32,000＝100,000。</b>請用期初保留盈餘 120,000、期末保留盈餘 150,000，重新算出股利。</p>
                                  <input value={accountingCorrectionAnswer} onChange={(event) => setAccountingCorrectionAnswer(event.target.value)} placeholder="輸入股利金額" inputMode="numeric" />
                                  <button type="button" disabled={!accountingCorrectionAnswer.trim()} onClick={() => {
                                    if (accountingCorrectionAnswer.replace(/[,，\s]/g, "") === "70000") setAccountingCorrectionStep(3);
                                  }}>{accountingCorrectionAnswer && accountingCorrectionAnswer.replace(/[,，\s]/g, "") !== "70000" ? "再檢查：120,000＋100,000－150,000" : "完成訂正"}</button>
                                </>
                              )}
                              {accountingCorrectionStep >= 3 && (
                                <div className="accounting-correction-complete">
                                  <strong>訂正完成：股利為 70,000</strong>
                                  <p>你已找到第一個錯誤並修正連鎖結果。系統會把這次弱點記為「漏列所得稅」，接續推薦對應課程、書籍與相同考點練習。</p>
                                </div>
                              )}
                            </div>
                          )}
                          {accountingCorrectionMode === "coach" && currentAccountingEssay.id !== "zh-essay-2" && (
                            <div className="accounting-self-correction">
                              <span>AI 訂正模式</span>
                              <strong>先回到第一個與標準步驟不同的位置，逐項檢查公式、加減方向與漏列項目。</strong>
                            </div>
                          )}
                          {accountingCorrectionMode && (
                            <button type="button" className="accounting-change-mode" onClick={() => {
                              setAccountingCorrectionMode(accountingCorrectionMode === "full" ? null : "full");
                              setAccountingCorrectionChoice("");
                            }}>{accountingCorrectionMode === "full" ? "重新選擇訂正方式" : "直接看完整解析"}</button>
                          )}
                        </div>
                      )}
                      {(accountingEssaySampleMode !== "wrong" || accountingCorrectionMode === "full" || accountingCorrectionStep >= 3) && <p>{currentAccountingEssay.standardAnswer}</p>}
                      {(accountingEssaySampleMode !== "wrong" || accountingCorrectionMode === "full" || accountingCorrectionStep >= 3) && currentAccountingEssay.explanation?.length ? (
                        <div>
                          <strong>解題解析</strong>
                          <ol>
                            {currentAccountingEssay.explanation.map((step, index) => <li key={index}>{step}</li>)}
                          </ol>
                        </div>
                      ) : null}
                      <aside className="learning-next-step" aria-label="下一步學習推薦">
                        <header>
                          <span>依本題作答推薦</span>
                          <strong>從失分點回到課程與書籍</strong>
                          <p>{recommendation.weakness}</p>
                        </header>
                        <div className="learning-next-grid">
                          {[["課程", recommendation.course], ["書籍", recommendation.book]].map(([kind, item]) => (
                            <a href={item.url} target="_blank" rel="noreferrer" key={kind}>
                              <span>{kind}</span>
                              <strong>{item.title}</strong>
                              <small>{item.meta}</small>
                              <p>{item.reason}</p>
                              <b>{kind === "課程" ? "前往試聽" : kind === "書籍" ? "查看書籍" : "查看相關考題"} ↗</b>
                            </a>
                          ))}
                          <div className="learning-related-exams">
                            <span>相關考題</span>
                            <strong>{relatedExercises.length ? `已找出 ${relatedExercises.length} 題同考點題目` : "精準題目比對中"}</strong>
                            <small>依章節、考點與作答錯誤從已匯入題庫比對</small>
                            {relatedExercises.length ? (
                              <ol>
                                {relatedExercises.map((exercise) => (
                                  <li key={exercise.id}>
                                    <button type="button" onClick={() => {
                                      if (exercise.type === "choice") {
                                        setAccountingExamFormat("choice");
                                        setAccountingExamIndex(accountingChoiceQuestions.findIndex((item) => item.id === exercise.id));
                                        setAccountingExamOption(null);
                                        setAccountingExamSubmitted(false);
                                      } else {
                                        setAccountingEssayIndex(accountingEssayQuestions.findIndex((item) => item.id === exercise.id));
                                        setAccountingEssayDraft("");
                                        setAccountingEssaySubmitted(false);
                                        setAccountingEssaySampleMode(null);
                                        setAccountingCorrectionMode(null);
                                      }
                                    }}>
                                      <b>{exercise.source}</b>
                                      <small>{exercise.topic}・{exercise.type === "choice" ? "選擇題" : "申論題"}</small>
                                    </button>
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p>目前題庫尚無已核對的精準對應，不以考題首頁代替推薦。</p>
                            )}
                          </div>
                        </div>
                        <footer>推薦依據：題目考點、作答型態與解題步驟；相關題目直接來自站內已匯入並核對的題庫。</footer>
                      </aside>
                          </>
                        );
                      })()}
                    </section>
                  )}
                  <div className="accounting-essay-actions">
                    <button type="button" onClick={() => {
                      setAccountingEssayIndex((value) => (value + 1) % accountingEssayQuestions.length);
                      setAccountingEssayDraft("");
                      setAccountingEssaySubmitted(false);
                      setAccountingEssaySampleMode(null);
                      setAccountingCorrectionMode(null);
                      setAccountingCorrectionStep(0);
                      setAccountingCorrectionChoice("");
                      setAccountingCorrectionAnswer("");
                    }}>換下一題 →</button>
                  </div>
                </article>
              ) : null}
            </section>
          ) : (
            <div className="second-exam-workspace">
              <div className="second-exam-import-status">
                <div><span>完整申論</span><strong>{secondExamQuestions.length} 題</strong></div>
                <div><span>爭點訓練</span><strong>{secondExamQuestions.reduce((sum, item) => sum + item.issuePreview.length, 0)} 個</strong></div>
                <div><span>已完成／已重寫</span><strong>{secondExamCompletedIds.length} 題／{secondExamRewriteCount} 段</strong></div>
                <p>每一題都包含引導式作答、完整作答、老師擬答逐點比較、對應學習與局部重寫；不是只提供題目與答案。</p>
                <a href="https://lawyer.get.com.tw/exam/List.aspx?sFilterType=0&sFilterDate=&sFilter=%E5%BE%8B%E5%B8%AB%E3%80%81%E5%8F%B8%E6%B3%95%E5%AE%98%E7%AC%AC%E4%BA%8C%E8%A9%A6" target="_blank" rel="noreferrer">核對歷屆題目來源 ↗</a>
              </div>
              <article className="second-exam-question">
                <header>
                  <div><span>{currentSecondExam.subject}</span><small>{currentSecondExam.year} 年司律二試・{currentSecondExam.number}</small></div>
                  <em>{currentSecondExam.score}</em>
                </header>
                <h2>{currentSecondExam.stem}</h2>
                <div className="second-exam-draft-heading">
                  <div>
                    <label htmlFor="second-exam-draft">申論作答區</label>
                    <small>不知道怎麼寫？先載入一般學生的示範作答，觀察 AI 如何逐句批改。</small>
                  </div>
                  <button
                    type="button"
                    disabled={secondExamSubmitted || secondExamLoading}
                    onClick={() => {
                      setSecondExamDraft(currentSecondExam.studentSample);
                      setSecondExamError("");
                    }}
                  >
                    載入學生示範作答
                  </button>
                </div>
                <div className="second-exam-mode-switch" role="group" aria-label="申論寫作模式">
                  <button
                    type="button"
                    className={secondExamWritingMode === "guided" ? "active" : ""}
                    onClick={() => setSecondExamWritingMode("guided")}
                  >
                    <b>引導寫作</b>
                    <small>逐步提示，自己組織答案</small>
                  </button>
                  <button
                    type="button"
                    className={secondExamWritingMode === "select" ? "active" : ""}
                    onClick={() => setSecondExamWritingMode("select")}
                  >
                    <b>解題四步驟</b>
                    <small>依序點選四個解題步驟，再補寫判斷理由</small>
                  </button>
                </div>
                {secondExamWritingMode === "guided" ? (
                <section className={`second-exam-guided-demo${secondExamGuidedOpen ? " is-open" : ""}`}>
                  <button
                    type="button"
                    className="second-exam-guided-toggle"
                    onClick={() => setSecondExamGuidedOpen((value) => !value)}
                    aria-expanded={secondExamGuidedOpen}
                  >
                    <span>
                      <b>引導式作答示範</b>
                      <small>一步一步看學生如何從爭點寫成完整段落</small>
                    </span>
                    <em>{secondExamGuidedOpen ? "收合" : "開始示範"} ↓</em>
                  </button>
                  {secondExamGuidedOpen && (
                    <div className="second-exam-guided-body">
                      <ol aria-label="引導式作答進度">
                        {currentGuidedSamples.map((_, index) => (
                          <li
                            key={`${currentSecondExam.id}-guide-${index}`}
                            className={index === currentGuidedIndex ? "is-current" : index < currentGuidedIndex ? "is-done" : ""}
                          >
                            <span>{index + 1}</span>
                            <small>{index === 0 ? "找爭點" : index === currentGuidedSamples.length - 1 ? "下結論" : "規範與涵攝"}</small>
                          </li>
                        ))}
                      </ol>
                      <div className="second-exam-guided-card">
                        <span>助教第 {currentGuidedIndex + 1} 步</span>
                        <h3>
                          {currentSecondExam.id === "114-criminal-1" && currentGuidedIndex === 0
                            ? "為什麼「承諾推薦工作」可能涉及投票行賄？先把構成要件和題目事實連起來。"
                            : currentGuidedIndex === 0
                              ? `先找出「${currentGuidedIssue}」：本段要處理誰的哪一個行為？`
                              : `請就「${currentGuidedIssue}」寫出規範、套入題目事實，再提出暫時結論。`}
                        </h3>
                        {currentSecondExam.id === "114-criminal-1" && currentGuidedIndex === 0 && (
                          <div className="second-exam-issue-bridge">
                            <strong>這裡不是因為「給錢」才可能行賄</strong>
                            <p>刑法第 144 條處理的利益不限現金，也包括可能具有經濟價值的「其他不正利益」。題目中的工作機會是給 A 的兒子，因此還要進一步判斷 A 是否因此取得間接利益。</p>
                            <ol>
                              <li><b>對象：</b>A 是題目明示的選民，是否具有投票權？</li>
                              <li><b>利益：</b>推薦 A 的兒子工作，是否屬於不正利益？</li>
                              <li><b>對價：</b>甲的承諾是否用來交換 A 投票支持甲？</li>
                            </ol>
                            <em>三項都要論證，不能只看到「推薦工作」就直接下行賄結論。</em>
                          </div>
                        )}
                        <div className="second-exam-hint-actions">
                          <button
                            type="button"
                            onClick={() => setSecondExamHintLevel((value) => Math.min(3, value + 1))}
                            disabled={secondExamHintLevel >= 3}
                          >
                            💡 {secondExamHintLevel === 0 ? "給我一點提示" : secondExamHintLevel < 3 ? "再給一個提示" : "提示已全部顯示"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSecondExamSampleRevealed(true)}
                            disabled={secondExamSampleRevealed}
                          >
                            {secondExamSampleRevealed ? "已顯示學生示範" : "還是不會，看學生示範"}
                          </button>
                        </div>
                        {secondExamHintLevel > 0 && (
                          <div className="second-exam-hint-stack">
                            <article>
                              <span>提示 1｜先定位爭點</span>
                              <p>{currentSecondExam.id === "114-criminal-1" && currentGuidedIndex === 0
                                ? "先圈出「選民 A」、「若當選」、「推薦 A 的兒子工作」三個事實，再分別對應有投票權人、不正利益與投票對價。"
                                : <>圈出題目中的人物、行為與法律效果；這一步先處理「{currentGuidedIssue}」，不要急著把所有爭點塞在同一段。</>}</p>
                            </article>
                            {secondExamHintLevel > 1 && (
                              <article>
                                <span>提示 2｜建立作答骨架</span>
                                <p>{currentSecondExam.id === "114-criminal-1" && currentGuidedIndex === 0
                                  ? "作答骨架：刑法第 144 條的對象與行為 → 工作機會是否為不正利益 → 利益雖給第三人，A 是否有間接利益 → 是否具有投票對價。"
                                  : "依「法律規範或審查標準 → 題目關鍵事實 → 是否符合要件 → 小結論」排列，先寫四句骨架再補內容。"}</p>
                              </article>
                            )}
                            {secondExamHintLevel > 2 && (
                              <article>
                                <span>提示 3｜避免常見失分</span>
                                <p>{currentSecondExam.id === "114-criminal-1" && currentGuidedIndex === 0
                                  ? "不要寫成「給工作就是行賄」。本題仍須說明 A 的選舉權、A 從兒子受聘得到的利益，以及承諾與投票支持之間的交換關係。"
                                  : "不要只寫抽象結論。請明確引用題目中的一項事實，說明它為何支持或不支持該法律要件。"}</p>
                              </article>
                            )}
                          </div>
                        )}
                        {secondExamSampleRevealed && (
                          <>
                            <div className="second-exam-student-guided-sample">
                              <small>學生示範回答</small>
                              <p>{currentGuidedSample}</p>
                            </div>
                            <aside>
                              <b>這不是滿分答案</b>
                              <p>它已經嘗試辨識爭點，但仍可能漏掉法條依據、審查標準或關鍵事實。加入作答後，AI會引用這段原句並指出缺少哪一層。</p>
                            </aside>
                          </>
                        )}
                        <footer>
                          <button
                            type="button"
                            disabled={currentGuidedIndex === 0}
                            onClick={() => {
                              setSecondExamGuidedStep((value) => Math.max(0, value - 1));
                              setSecondExamHintLevel(0);
                              setSecondExamSampleRevealed(false);
                            }}
                          >
                            ← 上一步
                          </button>
                          <button
                            type="button"
                            className="is-primary"
                            disabled={secondExamSubmitted || !secondExamSampleRevealed}
                            onClick={() => {
                              setSecondExamDraft((value) => {
                                if (value.includes(currentGuidedSample)) return value;
                                return [value.trim(), currentGuidedSample].filter(Boolean).join("\n\n");
                              });
                              if (currentGuidedIndex < currentGuidedSamples.length - 1) {
                                setSecondExamGuidedStep((value) => value + 1);
                                setSecondExamHintLevel(0);
                                setSecondExamSampleRevealed(false);
                              }
                            }}
                          >
                            加入作答{currentGuidedIndex < currentGuidedSamples.length - 1 ? "，看下一步 →" : " ✓"}
                          </button>
                        </footer>
                      </div>
                    </div>
                  )}
                </section>
                ) : (
                  <section className="second-exam-select-mode" aria-label="解題四步驟模式">
                    <header>
                      <div>
                        <span>解題四步驟</span>
                        <h3>先完成四步骨架，再到下方補寫</h3>
                      </div>
                      <small>內容取自本題已核對的爭點與名師擬答</small>
                    </header>
                    <div className="second-exam-select-tabs" role="tablist" aria-label="申論四步驟">
                      {([
                        ["issue", "1", "爭點"],
                        ["rule", "2", "規範"],
                        ["application", "3", "涵攝"],
                        ["conclusion", "4", "結論"],
                      ] as const).map(([id, number, label]) => (
                        <button
                          key={id}
                          type="button"
                          role="tab"
                          aria-selected={secondExamSelectStep === id}
                          className={secondExamSelectStep === id ? "active" : ""}
                          onClick={() => setSecondExamSelectStep(id)}
                        >
                          <i>{number}</i>
                          <span>{label}</span>
                          <small>{secondExamSelectChoices[id].length ? `已選 ${secondExamSelectChoices[id].length}` : "待選"}</small>
                        </button>
                      ))}
                    </div>
                    <div className="second-exam-select-instruction">
                      <p>
                        {secondExamSelectStep === "issue" && "選出本題要處理的法律問題。"}
                        {secondExamSelectStep === "rule" && "選出準備採用的法條、要件或判斷標準。"}
                        {secondExamSelectStep === "application" && "選出要連回題目事實的分析方向。"}
                        {secondExamSelectStep === "conclusion" && "選出與前述分析一致的收束方向。"}
                      </p>
                      <button
                        type="button"
                        disabled={Object.values(secondExamSelectChoices).every((items) => items.length === 0)}
                        onClick={() => {
                          const labels = { issue: "一、爭點", rule: "二、規範", application: "三、涵攝", conclusion: "四、結論" };
                          const outline = (Object.keys(labels) as Array<keyof typeof labels>)
                            .filter((step) => secondExamSelectChoices[step].length)
                            .map((step) => `${labels[step]}\n${secondExamSelectChoices[step].map((item) => `• ${item}`).join("\n")}`)
                            .join("\n\n");
                          setSecondExamDraft((value) => [value.trim(), outline].filter(Boolean).join("\n\n"));
                        }}
                      >
                        加入作答區
                      </button>
                    </div>
                    <div className="second-exam-select-list">
                      {secondExamSelectOptions[secondExamSelectStep].map((option) => {
                        const selected = secondExamSelectChoices[secondExamSelectStep].includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            className={selected ? "selected" : ""}
                            onClick={() => setSecondExamSelectChoices((value) => ({
                              ...value,
                              [secondExamSelectStep]: selected
                                ? value[secondExamSelectStep].filter((item) => item !== option)
                                : [...value[secondExamSelectStep], option],
                            }))}
                          >
                            <b>{selected ? "✓" : ""}</b>
                            <span>{option}</span>
                          </button>
                        );
                      })}
                    </div>
                    <footer>
                      <span>選項只建立答題骨架，不等於完成作答；仍要用自己的文字說明理由。</span>
                    </footer>
                  </section>
                )}
                <textarea
                  id="second-exam-draft"
                  value={secondExamDraft}
                  disabled={secondExamSubmitted}
                  onChange={(event) => setSecondExamDraft(event.target.value)}
                  placeholder="先列爭點，再依「規範—涵攝—結論」完成作答。送出前不顯示參考爭點。"
                />
                <div className={`second-exam-process${secondExamLoading ? " is-running" : ""}${secondExamSubmitted ? " is-complete" : ""}`} aria-label="AI 逐項比對進度">
                  {secondExamLoading && (
                    <div className="second-exam-progress-status" role="status" aria-live="polite">
                      <span>
                        <b>正在進行：{["讀取學生原句", "辨識爭點與段落", "對照老師評分點", "判斷缺漏與誤差", "產生補寫建議"][secondExamProgressStep]}</b>
                        <em>{[12, 32, 55, 78, 92][secondExamProgressStep]}%</em>
                      </span>
                      <i><u style={{ width: `${[12, 32, 55, 78, 92][secondExamProgressStep]}%` }} /></i>
                    </div>
                  )}
                  {["讀取學生原句", "辨識爭點與段落", "對照老師評分點", "判斷缺漏與誤差", "產生補寫建議"].map((step, index) => {
                    const completed = secondExamSubmitted || (secondExamLoading && index < secondExamProgressStep);
                    const current = secondExamLoading && index === secondExamProgressStep;
                    return (
                      <div key={step} className={`${completed ? "is-done" : ""}${current ? " is-current" : ""}`}>
                        <span>{completed ? "✓" : index + 1}</span>
                        <b>{step}</b>
                      </div>
                    );
                  })}
                </div>
                {secondExamDraft === currentSecondExam.studentSample && !secondExamSubmitted && (
                  <p className="second-exam-sample-note">
                    已載入本題示範：這是一份刻意保留漏寫與論證不足的學生答案，不是老師擬答。現在可直接送出查看完整批改過程。
                  </p>
                )}
                {!secondExamSubmitted ? (
                  <div className="past-exam-submit-row">
                    <small>至少先寫出爭點與基本架構，再送出檢核。</small>
                    <button type="button" disabled={secondExamDraft.trim().length < 20 || secondExamLoading} onClick={() => void compareSecondExamAnswer()}>
                      {secondExamLoading ? `批改進度 ${[12, 32, 55, 78, 92][secondExamProgressStep]}%` : "提交並與老師擬答對照"}
                    </button>
                  </div>
                ) : (
                  <section className="second-exam-feedback">
                    <div className="second-exam-ai-heading">
                      <span>AI 真實批改</span>
                      <strong>{secondExamComparison?.overallScore ?? 0}／100 分</strong>
                    </div>
                    <p className="second-exam-score-summary">{secondExamComparison?.scoreSummary}</p>
                    <div className="second-exam-score-grid">
                      {secondExamComparison?.dimensions.map((item) => (
                        <article key={item.name}>
                          <div><b>{item.name}</b><strong>{item.score}／{item.max}</strong></div>
                          <p>{item.reason}</p>
                        </article>
                      ))}
                    </div>
                    <section className="second-exam-teacher-first">
                      <header>
                        <div>
                          <span>先看老師怎麼答</span>
                          <h3>高點老師擬答</h3>
                        </div>
                        <small>先建立正確作答基準，再看你的差異</small>
                      </header>
                      <details className="second-exam-full-solution" open>
                        <summary>老師擬答內容（可收合）</summary>
                        <small>{currentSecondExam.teacherSolution.source}・內容以原始 PDF 為準</small>
                        <div>{currentSecondExam.teacherSolution.fullText}</div>
                        <a href={currentSecondExam.teacherSolution.url} target="_blank" rel="noreferrer">開啟原始擬答 PDF ↗</a>
                      </details>
                    </section>
                    <div className="second-exam-comparison-heading">
                      <span>再看差異</span>
                      <h3>你的答案與老師擬答差在哪裡</h3>
                      <p>依序看「老師要求 → 你的原句 → 缺漏或錯誤 → 補寫方式」，不用在四格文字中自己找重點。</p>
                    </div>
                    <div className="second-exam-difference-list">
                      {secondExamComparison?.issueComparison.map((item) => (
                        <article key={item.issue}>
                          <header><b>{item.issue}</b><em className={`status-${item.studentStatus}`}>{item.studentStatus}</em></header>
                          <section className="second-exam-teacher-anchor">
                            <span>① 老師擬答要求</span>
                            <p>{item.teacherAnchor}</p>
                          </section>
                          <blockquote>
                            <small>② 你的原句・{item.quoteLocation || "學生作答"}</small>
                            <p>「{item.studentQuote || "未見相關論述"}」</p>
                          </blockquote>
                          <section className="second-exam-gap">
                            <span>③ 主要差距</span>
                            <strong>{item.studentStatus === "判斷有誤" ? "判斷需要修正" : item.studentStatus === "未寫到" ? "關鍵內容漏寫" : "論證層次不足"}</strong>
                            <p>{item.missingLayer}</p>
                          </section>
                          <footer><b>④ 建議這樣補寫</b><p>{item.nextMove}</p></footer>
                          <details className="second-exam-comparison-basis">
                            <summary>查看 AI 判讀與比對依據</summary>
                            <div><span>AI 判讀</span><p>{item.aiReading}</p></div>
                            <div><span>比對依據</span><p>{item.comparisonBasis}</p></div>
                          </details>
                        </article>
                      ))}
                    </div>
                    <div className="second-exam-rewrite">
                      <header><span>AI 示範改寫</span><small>示範完整論證，不是標準答案全文</small></header>
                      <p>{secondExamComparison?.rewriteExample}</p>
                    </div>
                    <section className="second-exam-local-rewrite">
                      <header>
                        <div><span>現在換你改</span><h3>選一個失分爭點，局部重寫</h3></div>
                        <small>不必整題重寫，先把最弱的一段改對</small>
                      </header>
                      <div className="second-exam-rewrite-issues">
                        {secondExamComparison?.issueComparison.map((item) => (
                          <button
                            type="button"
                            key={item.issue}
                            className={secondExamRewriteIssue === item.issue ? "active" : ""}
                            onClick={() => {
                              setSecondExamRewriteIssue(item.issue);
                              setSecondExamRewriteDraft("");
                              setSecondExamRewriteChecked(false);
                            }}
                          >
                            {item.issue}<small>{item.studentStatus}</small>
                          </button>
                        ))}
                      </div>
                      {secondExamRewriteIssue && (() => {
                        const target = secondExamComparison?.issueComparison.find((item) => item.issue === secondExamRewriteIssue);
                        return (
                          <div className="second-exam-rewrite-editor">
                            <aside><b>本段補寫目標</b><p>{target?.nextMove}</p></aside>
                            <textarea
                              value={secondExamRewriteDraft}
                              onChange={(event) => {
                                setSecondExamRewriteDraft(event.target.value);
                                setSecondExamRewriteChecked(false);
                              }}
                              placeholder="請依「法律依據 → 題目事實 → 涵攝 → 小結論」重寫這一段。"
                            />
                            <button
                              type="button"
                              disabled={secondExamRewriteDraft.trim().length < 30}
                              onClick={() => {
                                if (!secondExamRewriteChecked) setSecondExamRewriteCount((value) => value + 1);
                                setSecondExamRewriteChecked(true);
                              }}
                            >
                              重新檢核這一段
                            </button>
                            {secondExamRewriteChecked && (
                              <div className="second-exam-rewrite-result">
                                <strong>已完成第一次重寫</strong>
                                <p>你已補上「{secondExamRewriteIssue}」段落。請再確認是否同時具備法律依據、題目關鍵事實、涵攝理由與明確小結論；下一步可與上方老師擬答逐句核對。</p>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </section>
                    <section className="second-exam-hits">
                      <header>
                        <div><span>考點命中</span><strong>這些內容在考前教材已經講過</strong></div>
                        <small>依高點正式解答「考點命中」欄整理</small>
                      </header>
                      <div>
                        {currentSecondExam.examHits.map((hit) => (
                          <article key={`${hit.issue}-${hit.pages}`}>
                            <b>{hit.issue}</b>
                            <p>{hit.material}・{hit.lesson}</p>
                            <span>講義頁碼：{hit.pages}</span>
                            <a href={hit.productUrl} target="_blank" rel="noreferrer">查看對應書／課 ↗</a>
                          </article>
                        ))}
                      </div>
                    </section>
                    <aside className="second-exam-course">
                      <div>
                        <span>依本次失分推薦</span>
                        <strong>{currentSecondExam.course.title}</strong>
                        <small>{currentSecondExam.course.teacher}・{currentSecondExam.course.format}</small>
                        <p>{secondExamComparison?.courseReason || currentSecondExam.course.reason}</p>
                      </div>
                      <a href={currentSecondExam.course.url} target="_blank" rel="noreferrer">
                        {currentSecondExam.course.url.includes("publish.get.com.tw") ? "查看對應書籍" : "查看對應課程"} ↗
                      </a>
                    </aside>
                    <footer>
                      <a href={currentSecondExam.sourceUrl} target="_blank" rel="noreferrer">查看歷屆考題來源 ↗</a>
                      <button type="button" onClick={() => {
                        setSecondExamIndex((value) => (value + 1) % secondExamQuestions.length);
                        setSecondExamDraft("");
                        setSecondExamWritingMode("guided");
                        setSecondExamSelectStep("issue");
                        setSecondExamSelectChoices({ issue: [], rule: [], application: [], conclusion: [] });
                        setSecondExamGuidedStep(0);
                        setSecondExamGuidedOpen(false);
                        setSecondExamHintLevel(0);
                        setSecondExamSampleRevealed(false);
                        setSecondExamSubmitted(false);
                        setSecondExamComparison(null);
                        setSecondExamTrace(null);
                        setSecondExamError("");
                        setSecondExamRewriteIssue("");
                        setSecondExamRewriteDraft("");
                        setSecondExamRewriteChecked(false);
                      }}>下一題 →</button>
                    </footer>
                  </section>
                )}
                {secondExamError && (
                  <div className="second-exam-retry">
                    <p className="essay-ai-error">{secondExamError}</p>
                    <small>作答內容已保留，本題尚未計入體驗進度。</small>
                    <button type="button" disabled={secondExamLoading} onClick={() => void compareSecondExamAnswer()}>
                      重新批改
                    </button>
                  </div>
                )}
              </article>
              <aside className="past-exam-session">
                <span>二試練習方式</span>
                <div><strong>1</strong><small>先列爭點</small></div>
                <div><strong>2</strong><small>完整作答</small></div>
                <div><strong>3</strong><small>送出檢核</small></div>
              </aside>
            </div>
          )}

          {secondExamOfferOpen && (
            <div className="second-exam-offer-backdrop" role="presentation">
              <section className="second-exam-offer" role="dialog" aria-modal="true" aria-labelledby="second-exam-offer-title">
                <button
                  type="button"
                  className="second-exam-offer-close"
                  aria-label="關閉方案說明"
                  onClick={() => setSecondExamOfferOpen(false)}
                >
                  ×
                </button>
                <span>3 題體驗完成</span>
                <h2 id="second-exam-offer-title">想繼續把申論練到會寫嗎？</h2>
                <p>你已完成本次免費體驗。可選擇線上持續練習，或了解由老師帶領的線下狂作題班。</p>
                <div className="second-exam-offer-options">
                  <article>
                    <em>線上方案</em>
                    <strong>解鎖完整申論題庫</strong>
                    <p>依科目練題、AI 逐項批改、錯題紀錄與弱點分析，隨時接續進度。</p>
                    <a href="https://www.ibrain.com.tw/" target="_blank" rel="noreferrer">了解線上解鎖方案 ↗</a>
                  </article>
                  <article>
                    <em>實體課程</em>
                    <strong>司律二試狂作題班</strong>
                    <p>密集寫題、老師講評與考點補強，適合需要固定進度與現場督促的同學。</p>
                    <a href="https://ec.ibrain.com.tw/book.asp?BKID=17984" target="_blank" rel="noreferrer">了解狂作題班 ↗</a>
                  </article>
                </div>
                <button type="button" className="second-exam-offer-later" onClick={() => setSecondExamOfferOpen(false)}>
                  稍後再決定
                </button>
              </section>
            </div>
          )}

          <p className="past-exam-scope">
            {activeView === "essayReview"
              ? "申論寫作目前開放 3 題完整體驗；每題均包含爭點預判、逐項批改、老師擬答比較、對應學習與局部重寫。"
              : pastExamDomain === "law"
                ? "目前法律類匯入範圍為 114 年司律一試 300 題；答案待覆核的題目不開放作答。"
                : `會計類目前可直接練習 ${accountingChoiceQuestions.length} 題選擇題與 ${accountingEssayQuestions.length} 題申論題；新題完成答案與題幹複核後再逐批加入。`}
          </p>
        </section>
      ) : activeView === "training" ? (
        <section className="training-page">
          <div className="training-hero">
            <div>
              <p>IBRAIN EXAM COACH</p>
              <h1>考點特訓</h1>
              <span>不是多做題，而是把每個失分考點練會。</span>
            </div>
            <div className="training-progress">
              <small>今日特訓</small>
              <strong>1 <em>/ 10 題</em></strong>
              <span><i /></span>
            </div>
          </div>

          <div className="training-track-switch" aria-label="選擇特訓模式">
            <button type="button" className={trainingTrack === "choice" ? "active" : ""} onClick={() => setTrainingTrack("choice")}>
              <b>選擇特訓</b><span>答題、診斷、立刻再測</span>
            </button>
            <button type="button" className={trainingTrack === "essay" ? "active" : ""} onClick={() => setTrainingTrack("essay")}>
              <b>申論特訓</b><span>辨識爭點、架構、分段陪寫</span>
            </button>
          </div>

          {trainingTrack === "choice" ? (
            <div className="training-workspace">
              <article className="training-question">
                <div className="training-meta">
                  <span>{trainingVariant ? "刑法・故意類型" : `114 年司律一試・第 ${officialTrainingQuestion.number} 題`}</span>
                  <em>{trainingVariant ? "AI 同考點診斷題" : "歷屆真題"}</em>
                </div>
                <h2>{trainingStem}</h2>
                <div className="training-options">
                  {trainingOptions.map(([key, label]) => (
                    <button
                      type="button"
                      key={key}
                      className={`${trainingOption === key ? "selected" : ""} ${trainingSubmitted && key === currentTrainingAnswer ? "correct" : ""} ${trainingSubmitted && trainingOption === key && key !== currentTrainingAnswer ? "wrong" : ""}`}
                      onClick={() => !trainingSubmitted && setTrainingOption(key as "A" | "B" | "C" | "D")}
                    >
                      <b>{key}</b><span>{label}</span>
                    </button>
                  ))}
                </div>
                {!trainingSubmitted && (
                  <>
                    {trainingHint && <p className="training-hint">提示：先判斷每個選項使用的是哪一種刑法概念，再檢查它是否把法律效果說得過度絕對。</p>}
                    <div className="training-actions">
                      <button type="button" className="secondary" onClick={() => setTrainingHint(true)}>給我一個提示</button>
                      <button type="button" className="primary" disabled={!trainingOption} onClick={() => setTrainingSubmitted(true)}>送出並診斷</button>
                    </div>
                  </>
                )}
                {trainingSubmitted && (
                  <section className="training-diagnosis">
                    <div className="diagnosis-result">
                      <span>{trainingOption === currentTrainingAnswer ? "答對了" : "這題選錯了"}</span>
                      <strong>正確答案：{currentTrainingAnswer}</strong>
                    </div>
                    <h3>{trainingOption === currentTrainingAnswer ? "你已抓到本題真正的判斷重點。" : `你選了 ${trainingOption}，但該選項對故意、錯誤或法律效果的描述不正確。`}</h3>
                    <p>{trainingVariant
                      ? "對乙希望其死亡，屬直接故意；對丙、丁明知死亡可能發生仍予容任，則可能成立間接故意，不能一律降為過失。"
                      : officialTrainingQuestion.number === 1
                        ? "B 涉及「結果延後發生」的因果歷程錯誤。依實務見解，前後行為可作整體觀察，甲仍應負殺人既遂罪責。其餘選項都過度否定殺人故意。"
                        : "這是 114 年司律一試原題。診斷應逐一比較各選項所使用的法理，而不是只背正確答案。"}</p>
                    <div className="diagnosis-tags">
                      <span>{trainingVariant ? "題型：AI 同考點驗證" : "來源：114 年律師、司法官第一試"}</span>
                      <span>{trainingVariant ? "考點：直接故意與間接故意" : `原題：第 ${officialTrainingQuestion.number} 題・第 ${officialTrainingQuestion.source_page ?? 1} 頁`}</span>
                    </div>
                    <div className="diagnosis-next">
                      {!trainingVariant && officialTrainingQuestion.number === 1 && <button type="button" className="secondary" onClick={() => { setTrainingVariant(true); setTrainingSubmitted(false); setTrainingOption(null); setTrainingHint(false); }}>挑戰 AI 同考點題</button>}
                      <button type="button" onClick={() => { setTrainingQuestionIndex((value) => value + 1); setTrainingVariant(false); setTrainingSubmitted(false); setTrainingOption(null); setTrainingHint(false); }}>下一題真題 →</button>
                    </div>
                  </section>
                )}
              </article>
              <aside className="training-side">
                <p>這題練什麼</p>
                <strong>{trainingVariant ? "同考點驗證" : "歷屆真題診斷"}</strong>
                <ul><li>原題、原選項、正式答案</li><li>依實際選項診斷錯因</li><li>下一題繼續練真題</li></ul>
                <div><small>今日診斷</small><b>{trainingSubmitted ? "已完成 1 個考點" : "完成本題後產生"}</b></div>
              </aside>
            </div>
          ) : (
            <div className="essay-training">
              <div className="essay-coach-status">
                <span aria-hidden="true">AI</span>
                <div>
                  <strong>AI 申論陪練</strong>
                  <small>不用選模式。你先寫，我會從你的答案接著問，一次只處理一個問題。</small>
                </div>
              </div>
              <article className="essay-task">
                <div>
                  <span>114 年司律二試・刑法與刑事訴訟法・第一題</span>
                  <small>先寫你目前想到的，不必一次完成全文</small>
                </div>
                <h2>{essayTrainingQuestion}</h2>
                <p className="training-source">真題來源：114 年律師、司法官第二試「刑法與刑事訴訟法」第一題。畫面保留原題核心事實；作答僅需檢討中華民國刑法典之罪名。</p>
                <label htmlFor="essay-draft">先寫下你的判斷</label>
                <textarea id="essay-draft" value={essayDraft} onChange={(event) => setEssayDraft(event.target.value)} placeholder="可以只寫幾行。AI 會先看你已經寫到什麼，再接著問下一個問題……" />
                {essayStartHint > 0 && (
                  <div className="essay-inline-hint" role="status">
                    <small>提示 {essayStartHint}/2</small>
                    <p>{essayStartHint === 1
                      ? "先不用寫完整答案。只要依序列出「甲、乙、丙、丁」，每人先寫一個你最確定的行為。"
                      : "可以先從甲開始：他用「給 A 的兒子工作機會」交換 A 的投票，這是否屬於投票行賄的不正利益與對價關係？"}</p>
                  </div>
                )}
                {!essayReviewed ? (
                  <>
                    <div className="essay-draft-actions">
                      <button type="button" className="secondary" onClick={() => setEssayStartHint((level) => Math.min(2, level + 1))}>
                        {essayStartHint === 0 ? "不知道怎麼寫？給我提示" : essayStartHint === 1 ? "再提示一點" : "提示已全部顯示"}
                      </button>
                      <button type="button" disabled={essayDraft.trim().length < 8 || essayCoachLoading} onClick={() => void analyzeEssay(essayDraft.trim(), [])}>
                        {essayCoachLoading ? "AI 正在閱讀全文…" : "請 AI 接著問"}
                      </button>
                    </div>
                    {essayCoachError && <p className="essay-ai-error">{essayCoachError} 系統沒有套用任何預設回覆，請稍後重試。</p>}
                  </>
                ) : (
                  <section className="essay-feedback">
                    <div className="essay-feedback-heading">
                      <span aria-hidden="true">AI</span>
                      <div>
                        <small>AI 助教・即時閱讀本次作答</small>
                        <h3>這是依你目前全文產生的回覆</h3>
                      </div>
                    </div>
                    <p className="essay-coach-ack">{essayCoachAnalysis?.acknowledgment}</p>
                    {essayCoachTrace && (
                      <div className="essay-ai-trace" aria-label="本次 AI 請求資訊">
                        <span>即時產生：{new Date(essayCoachTrace.generatedAt).toLocaleString("zh-TW", { hour12: false })}</span>
                        <span>模型：{essayCoachTrace.model}</span>
                        <span>請求識別碼：{essayCoachTrace.requestId}</span>
                      </div>
                    )}
                    {essayCoachTurns.length > 0 && (
                      <details className="essay-conversation-history">
                        <summary>查看前面回答（{essayCoachTurns.length}）</summary>
                        <div className="essay-conversation-history-list">
                          {essayCoachTurns.map((turn, index) => (
                            <div key={`${turn.question}-${index}`}>
                              <p><b>上一題：</b>{turn.question}</p>
                              <p><b>你的回答：</b>{turn.answer}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    {essayCoachAnalysis ? (
                      <div className="essay-next-question">
                        <small>現在只回答這一題</small>
                        <strong>{essayCoachAnalysis.nextQuestion}</strong>
                        {essayCoachHint > 0 && (
                          <div className="essay-inline-hint compact" role="status">
                            <small>提示 {essayCoachHint}/2</small>
                            <p>{essayCoachAnalysis.hints[essayCoachHint - 1]}</p>
                          </div>
                        )}
                        <textarea value={essayCoachReply} onChange={(event) => setEssayCoachReply(event.target.value)} placeholder="用自己的話回答即可，不必寫完整申論……" />
                        <div className="essay-feedback-actions">
                          <button type="button" onClick={() => setEssayCoachHint((level) => Math.min(2, level + 1))}>
                            {essayCoachHint === 0 ? "給我一點提示" : essayCoachHint === 1 ? "再提示一點" : "提示已全部顯示"}
                          </button>
                          <button type="button" className="primary" disabled={essayCoachReply.trim().length < 5 || essayCoachLoading} onClick={() => {
                            const turn = { question: essayCoachAnalysis.nextQuestion, answer: essayCoachReply.trim() };
                            const nextTurns = [...essayCoachTurns, turn];
                            setEssayCoachTurns(nextTurns);
                            setEssayCoachReply("");
                            setEssayCoachHint(0);
                            setEssayIssueStep((step) => step + 1);
                            void analyzeEssay(essayDraft.trim(), nextTurns);
                          }}>{essayCoachLoading ? "AI 正在閱讀…" : "回答並繼續"}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="essay-coach-complete">
                        <strong>目前沒有產生分析</strong>
                        <p>{essayCoachError || "請重新送出你的全文，系統不會顯示預設的假分析。"}</p>
                        <button type="button" className="primary" onClick={() => { setEssayReviewed(false); setEssayCoachAnalysis(null); }}>回到作答區重試</button>
                      </div>
                    )}
                  </section>
                )}
              </article>
            </div>
          )}
        </section>
      ) : (
      <>
      <section className="hero">
        <div className="knowledge-pattern" aria-hidden="true">
          <span className="signal-beam beam-one" />
          <span className="signal-beam beam-two" />
          <span className="signal-beam beam-three" />
          <span className="knowledge-orbit orbit-one" />
          <span className="knowledge-orbit orbit-two" />
          <span className="knowledge-search">
            <span />
          </span>
          <span className="knowledge-link link-one" />
          <span className="knowledge-link link-two" />
          <span className="knowledge-link link-three" />
          <span className="knowledge-node node-one" />
          <span className="knowledge-node node-two" />
          <span className="knowledge-node node-three" />
          <span className="knowledge-node node-four" />
          <span className="knowledge-node node-five" />
        </div>
        <div className="hero-inner">
          <div className="ai-status"><i /> AI KNOWLEDGE SEARCH</div>
          <h1 className="hero-brand">
            <strong>iBrain Pedia <em>X</em></strong>
            <small>智學百科｜智慧學習</small>
          </h1>
          <form className="search-shell" onSubmit={submit}>
            <div className="search-glow" aria-hidden="true" />
            <div className="search-row">
              <span className="search-symbol"><SearchIcon /></span>
              <textarea
                ref={searchInputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="輸入問題、貼上完整題目或申論作答……"
                aria-label="輸入問題或完整題目"
                rows={1}
              />
              <button type="submit" disabled={!input.trim() || aiLoading}>
                {aiLoading ? "解題中…" : "智學搜尋"}
              </button>
            </div>
          </form>
          <div className="hero-shortcuts">
            <div className="common-tests" aria-label="常用測驗">
              <span>常用測驗</span>
              <button type="button" onClick={() => quickSearch("不純正不作為犯的成立要件是什麼？請用考試作答順序說明。")}>不作為犯</button>
              <button type="button" onClick={() => quickSearch("超速駕車，但即使遵守速限也無法避免死亡結果，應如何判斷客觀歸責？")}>客觀歸責</button>
              <button type="button" onClick={() => quickSearch("112年憲判字第4號的爭點、審查標準與判決結論是什麼？")}>112憲判4</button>
              <button type="button" onClick={() => quickSearch("銀行存款調節表中，在途存款、未兌現支票、代收票據與手續費應如何調整？")}>銀行調節表</button>
            </div>
            <div className="search-tools">
              <button className="image-question-trigger" type="button" onClick={() => setImagePanelOpen(true)}>
                <span aria-hidden="true">▧</span> 圖片提問
              </button>
              <button className="essay-demo-trigger" type="button" onClick={() => setEssayDemoOpen(true)}>
                <span aria-hidden="true">✦</span> 問題展示示範
              </button>
            </div>
          </div>
          {imagePanelOpen && (
            <div className="image-question-panel" role="dialog" aria-modal="true" aria-label="圖片提問">
              <div className="image-question-head">
                <div>
                  <span>IMAGE QUESTION</span>
                </div>
                <button type="button" onClick={closeImagePanel} aria-label="關閉圖片提問">×</button>
              </div>
              {imageStep === "select" ? (
                <>
                  <button className="image-dropzone" type="button" onClick={() => fileInputRef.current?.click()}>
                    <b>＋</b>
                    <strong>點擊上傳，或直接貼上截圖</strong>
                    <em><kbd>Ctrl</kbd>＋<kbd>V</kbd> 貼上剪取的畫面</em>
                    <small>JPG、PNG、WebP・每次 1 張・最大 8 MB</small>
                  </button>
                  <input ref={fileInputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} />
                </>
              ) : imageStep === "confirm" || imageStep === "recognizing" ? (
                <div className="image-confirm">
                  <img src={imagePreview} alt="準備辨識的上傳圖片" />
                  <div>
                    <span>已選擇・{imageName}</span>
                    <h3>{imageStep === "recognizing"
                      ? ["正在解析原始圖片…", "正在理解你的問題…", "正在核對題目與計算…", "正在搜尋教材依據…", "正在組織解答…"][imageProgressStep]
                      : "你想問這張圖片的哪裡？"}</h3>
                    <label className="image-question-input">
                      <span>輸入文字問題</span>
                      <textarea
                        value={imageQuestion}
                        onChange={(event) => setImageQuestion(event.target.value)}
                        disabled={imageStep === "recognizing"}
                        placeholder="例如：我算出 61 天，想法是哪一步錯了？"
                        rows={3}
                      />
                      <small>有填文字時，AI 會優先回答你的問題；圖片作為題目與作答參考。</small>
                    </label>
                    <button type="button" disabled={imageStep === "recognizing"} onClick={recognizeImage}>
                      {imageStep === "recognizing" ? "圖片與問題判讀中…" : "圖片＋問題一起送出"}
                    </button>
                    <button className="choose-again" type="button" disabled={imageStep === "recognizing"} onClick={() => fileInputRef.current?.click()}>換一張</button>
                    <input ref={fileInputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} />
                    {imageStep === "recognizing" && (
                      <div className="image-live-progress" role="status" aria-live="polite">
                        <div>
                          <strong>{["解析圖片中", "理解問題中", "核對題目中", "搜尋依據中", "組織解答中"][imageProgressStep]}</strong>
                          <span>{Math.min(92, 18 + imageProgressStep * 19)}%</span>
                        </div>
                        <i><u style={{ width: `${Math.min(92, 18 + imageProgressStep * 19)}%` }} /></i>
                        <ol>
                          {["解析圖片", "理解問題", "核對題目", "搜尋依據", "組織解答"].map((label, index) => (
                            <li key={label} className={index < imageProgressStep ? "is-done" : index === imageProgressStep ? "is-current" : ""}>
                              <b>{index < imageProgressStep ? "✓" : index + 1}</b>
                              <span>{label}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {ocrError && (
                      <div className="ocr-error" role="alert">
                        <strong>還缺少解題所需的關鍵內容</strong>
                        <p>{ocrError}</p>
                        <span>補拍時請確認：</span>
                        <ul>
                          <li>題目、選項、表格與附圖完整入鏡</li>
                          <li>文字清晰可讀，鏡頭正對紙面、不歪斜</li>
                          <li>光線均勻，沒有反光、陰影或手指遮擋</li>
                          <li>建議直接截圖；拍照時請靠近並對焦</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
              <div className={`image-policy ${imageStep === "recognizing" ? "is-processing" : ""}`}>
                <span><b>01</b> 上傳圖片</span>
                <span><b>02</b> 理解問題</span>
                <span><b>03</b> 核對與搜尋</span>
                <span><b>04</b> 組織解答</span>
              </div>
              <p className="image-demo-note">辨識文字只供系統解題使用，不會另外佔用畫面。</p>
            </div>
          )}
          {essayDemoOpen && (
            <div className="essay-demo-backdrop" role="presentation" onClick={() => setEssayDemoOpen(false)}>
              <section
                className="essay-demo-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="essay-demo-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="essay-demo-heading">
                  <div>
                    <h2 id="essay-demo-title">問題展示示範</h2>
                  </div>
                  <button type="button" onClick={() => setEssayDemoOpen(false)} aria-label="關閉問題展示示範">×</button>
                </div>
                <div className="essay-demo-list">
                  {displayedEssayDemoQuestions.map((item, index) => (
                    <button type="button" key={item.id} onClick={() => void runEssayDemo(item)}>
                      <b>{String(index + 1).padStart(2, "0")}</b>
                      <span>
                        <em>科目</em>
                        <strong>{item.lawScope ?? item.domain}</strong>
                        <small>問題測試 {String(index + 1).padStart(2, "0")}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
          <div className="search-assurance" aria-label="搜尋能力">
            <span><i /> 多來源檢索</span>
            <span><i /> 依據可追溯</span>
            <span><i /> AI 即時整理</span>
          </div>

          {searched && (
            <div className="popular">
              <span>相關搜尋</span>
              {popularBySubject[subject]
                .filter((item) => item !== query)
                .map((item) => <button key={item} onClick={() => quickSearch(item)}>{item}</button>)}
            </div>
          )}
        </div>
      </section>

      <section className="content" id="sources">
        {searched && query && (
          <section className="submitted-question" aria-labelledby="submitted-question-title">
            <div className="submitted-question-heading">
              <div>
                <span>本次題目</span>
                <h2 id="submitted-question-title">題目</h2>
              </div>
              <div className="detected-tags" aria-label="AI 自動判斷結果">
                <span>{currentQueryIsOutOfScope ? "非學習問題" : currentQueryNeedsClarification ? "範圍待確認" : subject}</span>
                {!currentQueryIsOutOfScope && !currentQueryNeedsClarification && subject === "法律" && detectedLawScope && <span>{detectedLawScope}</span>}
              </div>
            </div>
            <p>{query}</p>
          </section>
        )}
        {searched && results.length === 0 ? (
          <section className="empty fallback-card" aria-live="polite">
            <div className="general-answer">
              <div className="general-answer-heading">
                <div className="general-answer-label">
                  {currentQueryIsOutOfScope
                    ? "學習範圍提醒"
                    : imageAnswerSource?.type === "exam_question"
                    ? "教材收錄考古題"
                    : imageAnswerSource?.type === "textbook_question"
                      ? "教材題目解答"
                      : "AI 解答"}
                </div>
                <span>
                  {currentQueryIsOutOfScope
                    ? "未啟動解題"
                    : imageAnswerSource
                    ? imageAnswerSource.type === "unconfirmed" ? "來源待確認" : "已辨識題目來源"
                    : "教材尚未命中"}
                </span>
              </div>
              {imageAnswerSource?.note && <p className="general-answer-source">{imageAnswerSource.note}</p>}
              {imageAnswerSource?.uncertaintyNote && (
                <p className="general-answer-source">圖片中有一小部分無法確認：{imageAnswerSource.uncertaintyNote}</p>
              )}
              {aiLoading && <div className="answer-loading"><span />教材尚無精準片段，AI 正在直接解題。</div>}
              {aiError && <div className="answer-disclosure"><p>{aiError}</p></div>}
              {aiAnswer && <AnswerText answer={aiAnswer} officialAnswer={essayDemoQuestion?.officialAnswer} />}
              {aiAnswer && !imageAnswerSource && !currentQueryIsOutOfScope && (
                <div className="evidence-gap-note">
                  <strong>這題目前缺少教材佐證</strong>
                  <p>回答可先作為學習參考；後續應補入對應教材章節、正式法規／判決或老師解析，再升級為可引用答案。</p>
                </div>
              )}
              {aiAnswer && imageAnswerSource?.type === "unconfirmed" && (
                <div className="evidence-gap-note">
                  <strong>題目來源待確認</strong>
                  <p>目前只顯示可確認的解題內容；尚未核對到考試名稱或教材索引前，不會自行標示來源。</p>
                </div>
              )}
              {aiAnswer && !currentQueryIsOutOfScope && (
                <section className="follow-up-panel" aria-labelledby="fallback-follow-up-title">
                  <div className="follow-up-heading">
                    <strong id="fallback-follow-up-title">{imageAnswerSource ? "繼續問這一題" : "還有哪一步不清楚？"}</strong>
                    <span>保留本題與前面的回答</span>
                  </div>
                  {followUpTurns.map((turn, index) => (
                    <div className="follow-up-turn" key={`${turn.question}-${index}`}>
                      <p className="follow-up-question"><span>你</span>{turn.question}</p>
                      <div className="follow-up-answer"><span>AI 助教</span><AnswerText answer={turn.answer} /></div>
                    </div>
                  ))}
                  {predictedFollowUps.length > 0 && (
                    <div className="predicted-follow-ups">
                      <small>{currentQueryNeedsClarification ? "先確認你想問的方向" : currentQueryIsBroadLegalTopic ? "選擇下一步學習" : "延伸這一題"}</small>
                      <div className="follow-up-suggestions" aria-label="依題目推薦的追問">
                        {predictedFollowUps.map((suggestion) => (
                          <button key={suggestion} type="button" onClick={() => setFollowUpInput(suggestion)}>
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <form className="follow-up-form" onSubmit={submitFollowUp}>
                    <textarea
                      value={followUpInput}
                      onChange={(event) => setFollowUpInput(event.target.value)}
                      placeholder={imageAnswerSource ? "繼續問這一題…" : "例如：我原本的想法是哪一步錯了？"}
                      aria-label="繼續追問這一題"
                      rows={2}
                    />
                    <button type="submit" disabled={!followUpInput.trim() || followUpLoading}>
                      {followUpLoading ? "回答中…" : "送出追問"}
                    </button>
                  </form>
                  {followUpError && <p className="follow-up-error">{followUpError}</p>}
                </section>
              )}
            </div>
          </section>
        ) : searched && results.length > 0 ? (
          <>
            <section className="answer-panel simple-answer" aria-live="polite">
              <div className="answer-body">
                {subject === "法律" && isConstitutionalJudgment112No4 && (
                  <section className="official-judgment-priority" aria-labelledby="judgment-112-4-title">
                    <div className="official-judgment-badge">預先核對・官方裁判資料卡</div>
                    <p className="official-judgment-source">憲法法庭・112年3月24日</p>
                    <h2 id="judgment-112-4-title">112年憲判字第4號</h2>
                    <h3>限制唯一有責配偶請求裁判離婚案</h3>
                    <div className="official-judgment-summary">
                      <strong>判決摘要</strong>
                      <p>
                        民法第1052條第2項但書限制有責配偶請求裁判離婚，原則上不違反憲法第22條保障婚姻自由的意旨。
                        但是，若婚姻難以維持的重大事由發生後已逾相當期間，或該事由已持續相當期間，仍一律不許唯一有責配偶請求離婚，
                        完全剝奪其離婚機會並造成個案顯然過苛，於此範圍內即屬違憲。
                      </p>
                      <p>
                        相關機關應於判決宣示後2年內妥適修法；逾期未完成修法，法院應依本判決意旨裁判。
                      </p>
                    </div>
                    <div className="official-judgment-actions">
                      <a className="primary" href="https://cons.judicial.gov.tw/docdata.aspx?fid=38&id=310013" target="_blank" rel="noreferrer">
                        閱讀憲法法庭裁判全文 ↗
                      </a>
                      <a href="https://cons.judicial.gov.tw/docdata.aspx?fid=77&id=347357" target="_blank" rel="noreferrer">
                        查看官方判決摘要 ↗
                      </a>
                    </div>
                    <small>資料排序：官方裁判全文 → 官方摘要 → 已核對教材 → 相關考題</small>
                  </section>
                )}
                {subject === "法律" && isConstitutionalJudgment111No2 && (
                  <section className="official-judgment-priority" aria-labelledby="judgment-111-2-title">
                    <div className="official-judgment-badge">預先核對・官方裁判資料卡</div>
                    <p className="official-judgment-source">憲法法庭・111年2月25日</p>
                    <h2 id="judgment-111-2-title">111年憲判字第2號</h2>
                    <h3>強制道歉案（二）</h3>
                    <p className="official-judgment-lead">
                      法院不能用判決強迫加害人公開道歉。民法第195條第1項後段所稱「回復名譽之適當處分」，不包括強制道歉。
                    </p>
                    <div className="official-judgment-summary">
                      <article>
                        <strong>為什麼違憲？</strong>
                        <p>強制道歉禁止人民保持沉默，並迫使其表達自我否定的內容，對言論自由形成高度干預；加害人為自然人時，也侵害思想自由。</p>
                      </article>
                      <article>
                        <strong>可以怎麼替代？</strong>
                        <p>法院仍可採刊載勝訴啟事、判決書全部或一部等侵害較小的方式，回復被害人的名譽。</p>
                      </article>
                    </div>
                    <div className="official-judgment-actions">
                      <a href="https://cons.judicial.gov.tw/docdata.aspx?fid=38&id=309998" target="_blank" rel="noreferrer">
                        閱讀裁判全文 ↗
                      </a>
                      <a href="https://cons.judicial.gov.tw/docdata.aspx?fid=77&id=340122" target="_blank" rel="noreferrer">
                        查看官方判決摘要 ↗
                      </a>
                    </div>
                    <small>資料排序：官方裁判全文 → 官方摘要 → 已核對教材 → 相關考題</small>
                  </section>
                )}
                {subject === "中級會計" && !aiLoading && !aiAnswer && (
                  <div className="protected-evidence">
                    <div className="protected-evidence-heading">
                      <span>站內安全檢索</span>
                      <strong>已找到 {results.length} 筆教材依據</strong>
                    </div>
                    <p>
                      搜尋是在站內索引中比對問題與教材的書名、章節、頁碼及主題標籤，
                      不需要把教材送給 AI。這批教材目前只顯示檢索結果，
                      <b>尚未接入本機／私有模型，也沒有由私有模型產生回答。</b>
                    </p>
                    <div className="retrieval-flow" aria-label="目前教材搜尋流程">
                      <span><b>1</b> 問題</span>
                      <i aria-hidden="true">→</i>
                      <span><b>2</b> 站內索引搜尋</span>
                      <i aria-hidden="true">→</i>
                      <span><b>3</b> 顯示命中來源</span>
                    </div>
                    <div className="model-flow-comparison">
                      <article className="current">
                        <em>目前模式</em>
                        <strong>站內搜尋</strong>
                        <p>只在我們的索引中找資料，不把問題或教材交給外部 AI 搜尋。</p>
                      </article>
                      <article>
                        <em>未啟用</em>
                        <strong>外部模型依教材回答</strong>
                        <p>站內先找到資料，再把命中的教材片段送給外部 AI 組織答案。</p>
                      </article>
                      <article>
                        <em>另行同意</em>
                        <strong>一般 AI 回答</strong>
                        <p>只把學生問題交給外部 AI，不傳送教材，也不代表教材或老師見解。</p>
                      </article>
                    </div>
                    <small>正式版接入授權的本機／私有模型後，才會在此依命中教材組織完整答案。</small>
                  </div>
                )}
                {aiLoading && (
                  <div className="retrieval-status">
                    <span className="retrieval-complete">✓ 教材檢索已完成</span>
                    <div className="answer-loading"><span />AI 正依命中的教材片段整理回答，所以下方依據會先顯示。</div>
                  </div>
                )}
                {aiError && (
                  <div className="answer-disclosure">
                    <p>{aiError}</p>
                  </div>
                )}
                {aiAnswer && <AnswerText answer={aiAnswer} officialAnswer={essayDemoQuestion?.officialAnswer} />}
                {aiAnswer && essayDemoQuestion && (
                  <div className="essay-answer-disclosure">
                    <strong>展示用 AI 申論解題</strong>
                    <span>{essayDemoQuestion.sourceLabel}｜{essayDemoQuestion.sourceNote}</span>
                    <small>本次只傳送題目文字，未傳送教材內容；答案不是老師標準擬答。</small>
                  </div>
                )}
                {aiAnswer && subject === "法律" && !essayDemoQuestion && !generalAiConsent && (
                  <div className="cloud-answer-label">雲端 AI 回答・此教材允許傳送</div>
                )}
                {aiAnswer && generalAiConsent && !essayDemoQuestion && (
                  <div className="ocr-answer-note">
                    <strong>圖片題直接解答</strong>
                    <span>AI 直接依原圖的題幹、表格與算式結構解題，並在送出前進行計算驗算。</span>
                  </div>
                )}
                {aiAnswer && !essayDemoQuestion && !generalAiConsent && results.length > 0 && (
                  <div className="compact-sources">
                    <strong>{results.some((item) => ["題庫", "解題書", "申論題"].includes(item.type)) ? "老師題庫／解題書依據" : "這個回答引用了"}</strong>
                    {results.map((item) => (
                      <div className="source-commerce-row" key={item.id}>
                        <span>{item.title}（{item.edition}）・{item.chapter}・第 {item.page} 頁</span>
                        <EvidenceAction item={item} />
                        {item.courseUrl && <a href={item.courseUrl} target="_blank" rel="noreferrer">{item.courseLabel ?? "觀看對應微課"} ↗</a>}
                      </div>
                    ))}
                    {results.some((item) => ["教科書", "題庫", "解題書", "申論題"].includes(item.type)) && (
                      <small>已購買者可於正式版直接開啟授權章節；未購買者可前往公司書城了解教材。</small>
                    )}
                  </div>
                )}
                {aiAnswer && generalAiConsent && results.length > 0 && (
                  <div className="compact-sources">
                    <strong>找到的相關教材</strong>
                    {results.map((item) => (
                      <div className="source-commerce-row" key={item.id}>
                        <span>{item.title}・{item.chapter}・第 {item.page} 頁</span>
                        <EvidenceAction item={item} />
                      </div>
                    ))}
                  </div>
                )}
                {aiAnswer && (
                  <section className="follow-up-panel" aria-labelledby="follow-up-title">
                    <div className="follow-up-heading">
                      <strong id="follow-up-title">{imageAnswerSource ? "繼續問這一題" : "還有哪一步不清楚？"}</strong>
                      <span>保留本題與前面的回答</span>
                    </div>
                    {followUpTurns.map((turn, index) => (
                      <div className="follow-up-turn" key={`${turn.question}-${index}`}>
                        <p className="follow-up-question"><span>你</span>{turn.question}</p>
                        <div className="follow-up-answer"><span>AI 助教</span><AnswerText answer={turn.answer} /></div>
                      </div>
                    ))}
                    {predictedFollowUps.length > 0 && (
                      <div className="predicted-follow-ups">
                        <small>{currentQueryNeedsClarification ? "先確認你想問的方向" : currentQueryIsBroadLegalTopic ? "選擇下一步學習" : "延伸這一題"}</small>
                        <div className="follow-up-suggestions" aria-label="依題目推薦的追問">
                          {predictedFollowUps.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => setFollowUpInput(suggestion)}
                          >
                            {suggestion}
                          </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <form className="follow-up-form" onSubmit={submitFollowUp}>
                      <textarea
                        value={followUpInput}
                        onChange={(event) => setFollowUpInput(event.target.value)}
                        placeholder={imageAnswerSource ? "繼續問這一題…" : "例如：為什麼要除以 2？可以換一種方式說明嗎？"}
                        aria-label="繼續追問這一題"
                        rows={2}
                      />
                      <button type="submit" disabled={!followUpInput.trim() || followUpLoading}>
                        {followUpLoading ? "回答中…" : "送出追問"}
                      </button>
                    </form>
                    {followUpError && <p className="follow-up-error">{followUpError}</p>}
                  </section>
                )}
                {subject === "法律" && detectedLawScope && results.some((item) => item.lawScope === "公法") && !aiAnswer && (
                  <div className="public-law-evidence-list">
                    <div className="demo-index-disclosure">
                      <strong>示範索引資料</strong>
                      <span>目前內容由測試資料預先登錄，僅用來驗證搜尋介面；尚未即時讀取教材原文，也未核對實際頁碼。</span>
                    </div>
                    {results.map((item) => (
                      <article key={item.id}>
                        <div>
                          <span>{item.edition}</span>
                          <strong>{item.title}</strong>
                        </div>
                        <p>{item.text}</p>
                        <div className="public-law-card-footer">
                          <small>
                            <b>資料來源</b>
                            {item.chapter}・PDF 第 {item.page} 頁附近
                          </small>
                          {item.courseUrl && (
                            <a className="course-commerce-link" href={item.courseUrl} target="_blank" rel="noreferrer">
                              <span aria-hidden="true">▶</span>
                              {item.courseLabel ?? "觀看對應微課"}
                            </a>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                {subject === "中級會計" && !aiAnswer && !essayDemoQuestion && (
                  <div className="accounting-evidence-list">
                    {results.map((item) => (
                      <article key={item.id}>
                        <div>
                          <span>{item.type}</span>
                          <strong>{item.title}</strong>
                        </div>
                        <p>{item.text}</p>
                        <small>{item.chapter}・第 {item.page} 頁</small>
                        {/\/book\.asp\?BKID=/i.test(item.purchaseUrl) ? (
                          <a className="book-commerce-link" href={item.purchaseUrl} target="_blank" rel="noreferrer">前往高點文化購買書籍 ↗</a>
                        ) : (
                          <span className="book-commerce-pending">商品頁尚未完成對應</span>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {subject === "法律" && officialMatches.length > 0 && (
              <section className="official-question-bank" aria-labelledby="official-question-bank-title">
                <div className="question-bank-heading">
                  <div>
                    <p className="section-kicker">GET FIRST EXAM QUESTION BANK</p>
                    <h2 id="official-question-bank-title">高點司律一試歷屆考題</h2>
                    <p>依題目原文精準搜尋，並保留年度、卷別與原始來源，不以相近考點假裝命中。</p>
                  </div>
                </div>
                <div className="official-question-results">
                  <div className="question-match-summary">
                    「{query}」找到 <strong>{officialMatches.length}</strong> 題原文命中
                  </div>
                  {officialMatches.slice(0, 5).map((question) => (
                    <article className="official-question-card" key={officialQuestionId(question)}>
                      <div>
                        <span>{question.year} 年｜{question.subject_group}</span>
                        <strong>第 {question.number} 題</strong>
                        {question.review_status === "needs_review" && <em>待人工複核</em>}
                      </div>
                      <p>{question.stem}</p>
                      <button
                        type="button"
                        disabled={question.review_status === "needs_review"}
                        onClick={() => practiceOfficialQuestion(question)}
                      >
                        {question.review_status === "needs_review" ? "暫不開放作答" : "原地作答"}
                      </button>
                    </article>
                  ))}
                  {officialMatches.length > 5 && (
                    <p className="question-result-more">另有 {officialMatches.length - 5} 題；正式題庫頁將提供科目、卷別與題號篩選。</p>
                  )}
                </div>
                <p className="question-bank-source">
                  題目來源：高點法律網「律師、司法官第一試」；每題保留原卷 PDF 來源。答案已匯入，高點逐題解析尚未接入。
                </p>
              </section>
            )}

            {subject === "法律" && relatedTopic && verifiedRelatedResources.length > 0 && (
              <section className="resource-map" aria-labelledby="resource-map-title">
                <div className="resource-map-heading">
                  <div>
                    <p className="section-kicker">相關法規・裁判・延伸資料</p>
                    <h2 id="resource-map-title">{relatedTopic.issue}</h2>
                    <p>{relatedTopic.summary}</p>
                  </div>
                  <span>
                    {verifiedRelatedResources.length} 筆展示資料
                  </span>
                </div>
                <div className="resource-map-disclosure">
                  <strong>目前為預先整理</strong>
                  <span>保留正式版的結果樣式，但這些項目不是本次即時跨站搜尋；正式串接後，才依實際命中顯示公司資源與中華民國法規、裁判。</span>
                </div>
                <div className="resource-tabs" aria-label="關聯資料類型">
                  {["全部", "歷屆考題", "判解", "法條", "期刊", "微課"].map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className="resource-list">
                  {verifiedRelatedResources.map((resource) => {
                    const content = (
                      <>
                      <span className={`resource-kind kind-${resource.kind}`}>{resource.kind}</span>
                      <span className="resource-copy">
                        <strong>
                          {resource.title}
                          <b className={`verification verification-${resource.verification}`}>
                            預先登錄
                          </b>
                        </strong>
                        <small>{resource.meta}</small>
                        <em>{resource.reason}</em>
                      </span>
                      <span className="resource-level">{resource.level}</span>
                      <span className="resource-arrow" aria-hidden="true">{resource.url ? "↗" : "待接入"}</span>
                      </>
                    );

                    return resource.url ? (
                      <a
                        className="resource-item"
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer"
                        key={`${resource.kind}-${resource.title}`}
                      >
                        {content}
                      </a>
                    ) : (
                      <div className="resource-item resource-item-pending" key={`${resource.kind}-${resource.title}`}>
                        {content}
                      </div>
                    );
                  })}
                </div>
                <p className="catalog-note">
                  正式版只呈現本次實際命中的資料；沒有找到公司教材、法條、裁判或有效來源時，不會以固定清單補足筆數。
                </p>
              </section>
            )}
            {false && (
              <section className="learning-products" aria-labelledby="learning-products-title">
                <div className="learning-products-heading">
                  <div>
                    <p className="section-kicker">IBRAIN PEDIA X LEARNING HUB</p>
                    <h2 id="learning-products-title">從「{query}」前往集團學習服務</h2>
                    <p>目前提供各平台的正確入口；尚未比對到特定課程、書籍、單元或會員已購內容。</p>
                  </div>
                  <span>平台入口・尚未精準推薦</span>
                </div>
                <div className="ai-learning-route" aria-label="Pedia X 智能串連流程">
                  <div><b>1</b><span>理解問題</span><small>辨識科目與考點</small></div>
                  <i>→</i>
                  <div><b>2</b><span>找到依據</span><small>教材、文章與真題</small></div>
                  <i>→</i>
                  <div><b>3</b><span>判斷下一步</span><small>補觀念、上課或練題</small></div>
                  <i>→</i>
                  <div><b>4</b><span>接回產品</span><small>續課、購書與複習</small></div>
                </div>
                <div className="learning-product-grid">
                  {learningProducts.map((product) => (
                    <a
                      className={`learning-product-card product-${product.accent} ${product.featured ? "featured" : "compact"}`}
                      href={product.url}
                      target="_blank"
                      rel="noreferrer"
                      key={product.name}
                    >
                      <div className="product-brand">
                        <span>
                          {product.accent === "ibrain"
                            ? "iB"
                            : product.accent === "publish"
                              ? "書"
                              : product.accent === "master"
                                ? "研"
                                : product.accent === "lawsource"
                                  ? "Law"
                                : "GET"}
                        </span>
                        <em>{product.audience}</em>
                      </div>
                      <strong>{product.name}</strong>
                      <p>{product.description}</p>
                      {product.featured && (
                        <div className="product-topic">
                          <small>本次搜尋主題・尚未比對產品</small>
                          <b>{query}</b>
                        </div>
                      )}
                      <span className="product-action">{product.action} <b aria-hidden="true">↗</b></span>
                    </a>
                  ))}
                </div>
                <div className="product-roadmap">
                  <span>目前</span>
                  <p>保留完整學習路徑版型，但只提供已核對的平台入口，不把通用入口冒充本題推薦。</p>
                  <span>正式串接後</span>
                  <p>AI 將依會員身分、已購內容與弱點，精準推薦老師、單元、書頁、影片時間點與下一題。</p>
                </div>
              </section>
            )}

            <p className="index-scope-note">
              目前部分結果是本站預先登錄的示範索引，只代表關鍵字配對成功；
              不代表已即時查詢教材資料庫，也不代表教材原文與頁碼已完成核對。
            </p>
          </>
        ) : null}
      </section>
      </>
      )}

      <footer id="history">
        <section className="group-links" aria-labelledby="group-links-title">
          <div className="group-links-heading">
            <span id="group-links-title">高點學習服務</span>
          </div>
          <div className="group-links-grid">
            <a href="https://www.get.com.tw/" target="_blank" rel="noreferrer">
              高點知識達
            </a>
            <a href="https://publish.get.com.tw/" target="_blank" rel="noreferrer">
              高點文化
            </a>
            <a href="https://www.ibrain.com.tw/" target="_blank" rel="noreferrer">
              知識達
            </a>
            <button type="button" onClick={() => {
              setActiveView("solutionBooks");
              startRandomSolutionBook(solutionBookId);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}>
              名師解題書
            </button>
          </div>
        </section>
        <div className="footer-inner">
          <span>iBrain Pedia X・智學百科</span>
        </div>
      </footer>
    </main>
  );
}
