import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const listBase = "https://lawyer.get.com.tw/exam/List.aspx";
const filter = encodeURIComponent("律師、司法官第二試");
const outputDir = new URL("../app/data/", import.meta.url);
const tempDir = "/tmp/ibrain-second-exams";
const cachedOnly = process.argv.includes("--cached-only");

mkdirSync(outputDir, { recursive: true });
mkdirSync(tempDir, { recursive: true });

function fetchText(url) {
  return execFileSync("curl", ["-L", "--retry", "2", "--max-time", "45", "-sS", url], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function normalize(value) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPdfText(value) {
  return value
    .replace(/\f/g, "\n")
    .replace(/^\s*\d{3}\s+高點司律二試[^\n]*$/gm, "")
    .replace(/^\s*【高點法[律律]專班】\s*$/gm, "")
    .replace(/^\s*版權所有，重製必究！\s*$/gm, "")
    .replace(/^\s*-\d+-\s*$/gm, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitQuestionBlocks(text) {
  const cleaned = cleanPdfText(text);
  const starts = [...cleaned.matchAll(/(?:^|\n)([一二三四五六七八九十]+)、(?=\S)/g)]
    .filter((match) => {
      const nearby = cleaned.slice(match.index ?? 0, (match.index ?? 0) + 900);
      return /[（(]\s*\d+\s*分\s*[）)]/.test(nearby);
    });
  return starts.map((match, index) => {
    const start = match.index ?? 0;
    const end = starts[index + 1]?.index ?? cleaned.length;
    return cleaned.slice(start, end).trim();
  });
}

function sectionBetween(block, startMarker, endMarkers) {
  const start = block.indexOf(startMarker);
  if (start < 0) return "";
  const contentStart = start + startMarker.length;
  const end = endMarkers
    .map((marker) => block.indexOf(marker, contentStart))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? block.length;
  return block.slice(contentStart, end).trim();
}

function extractCompletePackages(text, source) {
  return splitQuestionBlocks(text).map((block, index) => {
    const markerIndexes = ["參考法條", "試題評析", "考點命中", "【擬答】"]
      .map((marker) => block.indexOf(marker))
      .filter((position) => position > 0);
    const stemEnd = markerIndexes.length ? Math.min(...markerIndexes) : block.length;
    const stem = block.slice(0, stemEnd).trim();
    const number = stem.match(/^([一二三四五六七八九十]+)、/)?.[1] ?? String(index + 1);
    const scores = [...stem.matchAll(/[（(]\s*(\d+)\s*分\s*[）)]/g)].map((item) => Number(item[1]));
    const hitsRaw = sectionBetween(block, "考點命中", ["【擬答】"]);
    const hitItems = hitsRaw
      .split(/\n(?=\s*(?:\d+\.|第[一二三四五六七八九十]+小題：))/)
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return {
      id: `${source.year}-${source.order}-${index + 1}`,
      sourceOrder: source.order,
      year: source.year,
      subject: source.subject,
      number: `第${number}題`,
      score: scores.length ? `${scores.reduce((sum, value) => sum + value, 0)} 分` : "配分見原題",
      stem,
      commentary: sectionBetween(block, "試題評析", ["考點命中", "【擬答】"]),
      examHits: hitItems,
      teacherAnswer: sectionBetween(block, "【擬答】", []),
      sourceUrl: source.pdfUrl,
      extractionStatus: "machine_extracted_needs_review",
    };
  }).filter((item) => item.stem.length >= 120 && item.teacherAnswer.length >= 200);
}

const sourceRows = [];
for (let page = 1; page <= 5; page += 1) {
  const url = `${listBase}?iPageNo=${page}&sFilter=${filter}&sFilterType=0`;
  const html = fetchText(url);
  const rowPattern = /<tr><td>(\d+)<\/td><td[^>]*>律師、司法官第二試<\/td><td>(.*?)<\/td><td>(\d+)<\/td><td><a href=['"]([^'"]+)['"][^>]*>(.*?)<\/a><\/td><\/tr>/g;
  for (const match of html.matchAll(rowPattern)) {
    const [, order, subjectHtml, year, relativeUrl] = match;
    sourceRows.push({
      order: Number(order),
      year: Number(year),
      subject: normalize(subjectHtml),
      pdfUrl: new URL(relativeUrl, listBase).href,
      listUrl: url,
    });
  }
}

sourceRows.sort((a, b) => a.order - b.order);
writeFileSync(new URL("second-exam-sources.json", outputDir), `${JSON.stringify(sourceRows, null, 2)}\n`);

function extractQuestionPages(text, source) {
  const pages = text.split("\f");
  const questions = [];

  for (const page of pages) {
    const cleaned = page
      .replace(/^\s*\d{3}\s+高點司律二試[^\n]*\n?/m, "")
      .replace(/【高點法[律律]專班】[\s\S]*?重製必究！/g, "")
      .trim();

    if (!/[（(]\s*\d+\s*分\s*[）)]/.test(cleaned)) continue;
    if (/【擬答】/.test(cleaned.slice(0, 450))) continue;

    const start = cleaned.search(/(?:^|\n)\s*[一二三四五六七八九十]+、/m);
    if (start < 0) continue;

    let questionText = cleaned.slice(start).trim();
    const stopMarkers = ["參考法條", "試題評析", "【擬答】", "考點命中", "命題意旨"];
    const stopIndexes = stopMarkers
      .map((marker) => questionText.indexOf(marker))
      .filter((index) => index > 80);
    if (stopIndexes.length) questionText = questionText.slice(0, Math.min(...stopIndexes)).trim();

    if (questionText.length < 120) continue;
    const numberMatch = questionText.match(/^([一二三四五六七八九十]+)、/);
    const number = numberMatch?.[1] ?? String(questions.length + 1);
    const scoreMatches = [...questionText.matchAll(/[（(]\s*(\d+)\s*分\s*[）)]/g)].map((item) => Number(item[1]));

    questions.push({
      id: `${source.year}-${source.order}-${questions.length + 1}`,
      sourceOrder: source.order,
      year: source.year,
      subject: source.subject,
      number: `第${number}題`,
      score: scoreMatches.length ? `${scoreMatches.reduce((sum, value) => sum + value, 0)} 分` : "配分見原題",
      stem: questionText.replace(/\n{3,}/g, "\n\n"),
      sourceUrl: source.pdfUrl,
      answerStatus: "原 PDF 含高點名師擬答",
    });
  }

  return questions;
}

const questions = [];
const completePackages = [];
const failures = [];
function saveProgress() {
  writeFileSync(new URL("second-exam-questions.json", outputDir), `${JSON.stringify(questions, null, 2)}\n`);
  writeFileSync(new URL("second-exam-complete-packages.json", outputDir), `${JSON.stringify(completePackages, null, 2)}\n`);
  writeFileSync(new URL("second-exam-import-failures.json", outputDir), `${JSON.stringify(failures, null, 2)}\n`);
}

for (const source of sourceRows) {
  const pdfPath = join(tempDir, `${source.order}-${basename(new URL(source.pdfUrl).pathname) || "exam"}.pdf`);
  try {
    const cachedPdf = (() => {
      try {
        return readFileSync(pdfPath).subarray(0, 5).equals(Buffer.from("%PDF-"));
      } catch {
        return false;
      }
    })();
    if (!cachedPdf && cachedOnly) {
      throw new Error("not downloaded yet");
    }
    if (!cachedPdf) {
      execFileSync("curl", [
        "-L", "--fail", "--retry", "1", "--retry-all-errors", "--max-time", "30",
        "-A", "Mozilla/5.0", "-sS", source.pdfUrl, "-o", pdfPath,
      ]);
    }
    if (!readFileSync(pdfPath).subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error("download did not return a PDF");
    }
    const text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
      encoding: "utf8",
      maxBuffer: 80 * 1024 * 1024,
    });
    questions.push(...extractQuestionPages(text, source));
    completePackages.push(...extractCompletePackages(text, source));
    saveProgress();
  } catch (error) {
    failures.push({
      order: source.order,
      year: source.year,
      subject: source.subject,
      pdfUrl: source.pdfUrl,
      error: error instanceof Error ? error.message.split("\n")[0] : "unknown error",
    });
    saveProgress();
  }
}

saveProgress();

console.log(JSON.stringify({
  sources: sourceRows.length,
  questions: questions.length,
  completePackages: completePackages.length,
  failures: failures.length,
  years: [...new Set(sourceRows.map((item) => item.year))],
  subjects: [...new Set(sourceRows.map((item) => item.subject))],
}, null, 2));
