import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "../../../db";
import { guidedIssueAttempts } from "../../../db/schema";

const stepIds = new Set(["issue", "rule", "fact", "application", "conclusion"]);

export async function GET(request: NextRequest) {
  const learnerKey = request.nextUrl.searchParams.get("learnerKey")?.trim();
  if (!learnerKey || learnerKey.length > 80) {
    return NextResponse.json({ error: "學習者識別資料不正確。" }, { status: 400 });
  }

  const db = await getDb();
  const attempts = await db
    .select()
    .from(guidedIssueAttempts)
    .where(eq(guidedIssueAttempts.learnerKey, learnerKey))
    .orderBy(desc(guidedIssueAttempts.answeredAt))
    .limit(500);

  return NextResponse.json({ attempts });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "作答紀錄格式不正確。" }, { status: 400 });
  }

  const learnerKey = String(body.learnerKey ?? "").trim();
  const attemptId = String(body.attemptId ?? "").trim();
  const questionKey = String(body.questionKey ?? "").trim();
  const domain = String(body.domain ?? "").trim();
  const topic = String(body.topic ?? "").trim();
  const stepId = String(body.stepId ?? "").trim();
  const stepLabel = String(body.stepLabel ?? "").trim();
  const selectedOption = Number(body.selectedOption);
  const correctOption = Number(body.correctOption);
  const answeredAt = String(body.answeredAt ?? "");

  if (
    !learnerKey || learnerKey.length > 80 ||
    !attemptId || attemptId.length > 80 ||
    !questionKey || questionKey.length > 180 ||
    !domain || domain.length > 30 ||
    !topic || topic.length > 100 ||
    !stepIds.has(stepId) ||
    !stepLabel || stepLabel.length > 30 ||
    !Number.isInteger(selectedOption) || selectedOption < 0 || selectedOption > 3 ||
    !Number.isInteger(correctOption) || correctOption < 0 || correctOption > 3 ||
    Number.isNaN(Date.parse(answeredAt))
  ) {
    return NextResponse.json({ error: "作答紀錄欄位不完整。" }, { status: 400 });
  }

  const db = await getDb();
  const existing = await db
    .select({ id: guidedIssueAttempts.id })
    .from(guidedIssueAttempts)
    .where(and(
      eq(guidedIssueAttempts.learnerKey, learnerKey),
      eq(guidedIssueAttempts.attemptId, attemptId),
      eq(guidedIssueAttempts.questionKey, questionKey),
      eq(guidedIssueAttempts.stepId, stepId),
    ))
    .limit(1);

  if (existing.length) {
    return NextResponse.json({ saved: true, duplicate: true });
  }

  await db.insert(guidedIssueAttempts).values({
    learnerKey,
    attemptId,
    questionKey,
    domain,
    topic,
    stepId,
    stepLabel,
    selectedOption,
    correctOption,
    correct: selectedOption === correctOption,
    answeredAt,
  });

  return NextResponse.json({ saved: true });
}
