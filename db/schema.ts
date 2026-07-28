import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Shared AI explanations belong to a question version, not to an individual
 * learner. Teacher-authored material is deliberately kept out of this table.
 */
export const aiExplanationCache = sqliteTable(
  "ai_explanation_cache",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cacheKey: text("cache_key").notNull(),
    questionId: text("question_id").notNull(),
    contentVersion: text("content_version").notNull(),
    answer: text("answer").notNull(),
    model: text("model").notNull(),
    generatedAt: text("generated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("ai_explanation_cache_key_idx").on(table.cacheKey)],
);

export const guidedIssueAttempts = sqliteTable(
  "guided_issue_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    learnerKey: text("learner_key").notNull(),
    attemptId: text("attempt_id").notNull(),
    questionKey: text("question_key").notNull(),
    domain: text("domain").notNull(),
    topic: text("topic").notNull(),
    stepId: text("step_id").notNull(),
    stepLabel: text("step_label").notNull(),
    selectedOption: integer("selected_option").notNull(),
    correctOption: integer("correct_option").notNull(),
    correct: integer("correct", { mode: "boolean" }).notNull(),
    answeredAt: text("answered_at").notNull(),
  },
  (table) => [
    uniqueIndex("guided_issue_attempt_once_idx").on(
      table.learnerKey,
      table.attemptId,
      table.questionKey,
      table.stepId,
    ),
  ],
);
