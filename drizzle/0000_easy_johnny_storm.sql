CREATE TABLE `ai_explanation_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cache_key` text NOT NULL,
	`question_id` text NOT NULL,
	`content_version` text NOT NULL,
	`answer` text NOT NULL,
	`model` text NOT NULL,
	`generated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_explanation_cache_key_idx` ON `ai_explanation_cache` (`cache_key`);