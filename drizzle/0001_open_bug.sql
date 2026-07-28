CREATE TABLE `guided_issue_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_key` text NOT NULL,
	`attempt_id` text NOT NULL,
	`question_key` text NOT NULL,
	`domain` text NOT NULL,
	`topic` text NOT NULL,
	`step_id` text NOT NULL,
	`step_label` text NOT NULL,
	`selected_option` integer NOT NULL,
	`correct_option` integer NOT NULL,
	`correct` integer NOT NULL,
	`answered_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guided_issue_attempt_once_idx` ON `guided_issue_attempts` (`learner_key`,`attempt_id`,`question_key`,`step_id`);