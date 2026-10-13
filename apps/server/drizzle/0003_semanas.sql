CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`reason` text,
	`payload` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_created` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `job_lease` (
	`name` text PRIMARY KEY NOT NULL,
	`holder` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rules_acceptance` (
	`user_id` text NOT NULL,
	`week_id` text NOT NULL,
	`rules_version` integer NOT NULL,
	`accepted_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `week_id`)
);
--> statement-breakpoint
CREATE TABLE `sample` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`credits` text NOT NULL,
	`origin` text,
	`license_text` text NOT NULL,
	`bpm` real,
	`musical_key` text,
	`genre_hint` text,
	`duration_ms` integer NOT NULL,
	`bytes` integer NOT NULL,
	`format` text NOT NULL,
	`audio_public_id` text NOT NULL,
	`stems_public_id` text,
	`cover_public_id` text NOT NULL,
	`peaks` blob NOT NULL,
	`loudness_lufs` real,
	`chops` text DEFAULT '[]' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sample_download` (
	`user_id` text NOT NULL,
	`week_id` text NOT NULL,
	`kind` text NOT NULL,
	`count` integer NOT NULL,
	`first_at` integer NOT NULL,
	`last_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `week_id`, `kind`)
);
--> statement-breakpoint
CREATE INDEX `sample_download_week` ON `sample_download` (`week_id`);--> statement-breakpoint
CREATE TABLE `seen_flag` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`seen_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `ref`)
);
--> statement-breakpoint
CREATE TABLE `week` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`slug` text NOT NULL,
	`season_id` text NOT NULL,
	`sample_id` text NOT NULL,
	`challenge` text,
	`blind` integer DEFAULT true NOT NULL,
	`golden` integer DEFAULT false NOT NULL,
	`rules_version` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`submit_ends_at` integer NOT NULL,
	`vote_ends_at` integer NOT NULL,
	`sealed_at` integer,
	`result_revision` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sample_id`) REFERENCES `sample`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "week_boundaries" CHECK("week"."starts_at" < "week"."submit_ends_at" AND "week"."submit_ends_at" <= "week"."vote_ends_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `week_number_unique` ON `week` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `week_slug_unique` ON `week` (`slug`);--> statement-breakpoint
CREATE INDEX `week_starts_at` ON `week` (`starts_at`);