CREATE TABLE `entry` (
	`id` text PRIMARY KEY NOT NULL,
	`week_id` text NOT NULL,
	`user_id` text NOT NULL,
	`alias` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`bpm` real,
	`musical_key` text,
	`daw` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`audio_public_id` text NOT NULL,
	`etag` text NOT NULL,
	`format` text NOT NULL,
	`bytes` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`peaks` blob,
	`loudness_lufs` real,
	`true_peak_db` real,
	`hot_start_ms` integer,
	`cover_public_id` text,
	`cover_seed` integer NOT NULL,
	`receipt_number` integer NOT NULL,
	`status` text NOT NULL,
	`status_reason` text,
	`play_count` integer DEFAULT 0 NOT NULL,
	`duplicate_of` text,
	`submitted_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`week_id`) REFERENCES `week`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_audio_public_id_unique` ON `entry` (`audio_public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `entry_one_per_week` ON `entry` (`week_id`,`user_id`) WHERE "entry"."status" IN ('processing', 'active', 'hidden');--> statement-breakpoint
CREATE UNIQUE INDEX `entry_alias_week` ON `entry` (`week_id`,`alias`);--> statement-breakpoint
CREATE UNIQUE INDEX `entry_receipt_week` ON `entry` (`week_id`,`receipt_number`);--> statement-breakpoint
CREATE INDEX `entry_user` ON `entry` (`user_id`);--> statement-breakpoint
CREATE INDEX `entry_etag` ON `entry` (`etag`);--> statement-breakpoint
CREATE TABLE `upload_intent` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`week_id` text NOT NULL,
	`entry_id` text,
	`public_id` text NOT NULL,
	`status` text NOT NULL,
	`declared_bytes` integer,
	`declared_duration_ms` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upload_intent_public_id_unique` ON `upload_intent` (`public_id`);--> statement-breakpoint
CREATE INDEX `upload_intent_user` ON `upload_intent` (`user_id`);--> statement-breakpoint
CREATE INDEX `upload_intent_expires` ON `upload_intent` (`expires_at`);--> statement-breakpoint
CREATE TABLE `vote` (
	`user_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`week_id` text NOT NULL,
	`stars` integer NOT NULL,
	`voided` integer DEFAULT false NOT NULL,
	`voided_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `entry_id`),
	CONSTRAINT "vote_stars" CHECK("vote"."stars" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `vote_week` ON `vote` (`week_id`);--> statement-breakpoint
CREATE INDEX `vote_entry` ON `vote` (`entry_id`);