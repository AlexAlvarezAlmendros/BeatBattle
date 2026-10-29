CREATE TABLE `achievement_unlock` (
	`user_id` text NOT NULL,
	`achievement_id` text NOT NULL,
	`ref` text,
	`week_id` text,
	`unlocked_at` integer NOT NULL,
	`seen_at` integer,
	PRIMARY KEY(`user_id`, `achievement_id`)
);
--> statement-breakpoint
CREATE TABLE `streak_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`current` integer NOT NULL,
	`best` integer NOT NULL,
	`last_week_number` integer,
	`joker_season` text
);
--> statement-breakpoint
CREATE TABLE `xp_event` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref` text NOT NULL,
	`week_id` text,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `xp_event_once` ON `xp_event` (`user_id`,`kind`,`ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `xp_event_first_entry_of_week` ON `xp_event` (`ref`) WHERE "xp_event"."kind" = 'first_entry_of_week';--> statement-breakpoint
CREATE INDEX `xp_event_user_week` ON `xp_event` (`user_id`,`week_id`,`kind`);--> statement-breakpoint
ALTER TABLE `entry` ADD `challenge_claimed` integer DEFAULT false NOT NULL;