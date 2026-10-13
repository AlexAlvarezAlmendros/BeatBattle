CREATE TABLE `ip_signal` (
	`user_id` text NOT NULL,
	`ip_hash` text NOT NULL,
	`seen_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `ip_hash`)
);
--> statement-breakpoint
CREATE INDEX `ip_signal_seen` ON `ip_signal` (`seen_at`);--> statement-breakpoint
CREATE TABLE `listen` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`qualified_at` integer
);
--> statement-breakpoint
CREATE INDEX `listen_user_entry` ON `listen` (`user_id`,`entry_id`);--> statement-breakpoint
CREATE INDEX `listen_entry` ON `listen` (`entry_id`);--> statement-breakpoint
CREATE TABLE `report` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_reporter_entry` ON `report` (`reporter_id`,`entry_id`);--> statement-breakpoint
CREATE INDEX `report_entry` ON `report` (`entry_id`);